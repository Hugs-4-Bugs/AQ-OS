// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Backup API (List + Trigger)
// Phase 14.5: Backups & Recovery
// GET: list backups, POST: trigger manual backup (admin only)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── GET: List Backups ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  return withAdmin(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const type = searchParams.get('type') || 'all';
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '20');
      const skip = (page - 1) * limit;

      // Get backup records from database
      const where = type !== 'all' ? { exportType: { contains: `backup_${type}` } } : { exportType: { startsWith: 'backup_' } };

      const [exports, total] = await Promise.all([
        db.dataExport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        db.dataExport.count({ where }),
      ]);

      // Also scan filesystem for backup files
      let fileBackups: Array<{
        name: string;
        size: number;
        modified: string;
        type: string;
      }> = [];

      try {
        const backupDir = process.env.BACKUP_DIR || '/opt/acquisitionos/backups';
        const { stdout } = await execAsync(
          `find "${backupDir}" -name "*.gz" -type f -printf "%f\\t%s\\t%TY-%Tm-%Td %TH:%TM\\t%P\\n" 2>/dev/null | sort -r | head -50`,
          { timeout: 5000 }
        );

        if (stdout.trim()) {
          fileBackups = stdout.trim().split('\n').map((line) => {
            const [name, size, modified, path] = line.split('\t');
            const backupType = name.startsWith('sqlite') ? 'sqlite' :
              name.startsWith('postgres') ? 'postgres' :
              name.startsWith('snap') ? 'snapshot' : 'unknown';
            return { name, size: parseInt(size || '0'), modified, type: backupType };
          });
        }
      } catch {
        // Backup directory may not be accessible in all environments
      }

      // Calculate storage summary
      const totalFileSize = fileBackups.reduce((sum, b) => sum + b.size, 0);

      return NextResponse.json({
        backups: exports.map((exp) => ({
          id: exp.id,
          type: exp.exportType,
          status: exp.status,
          fileSize: exp.fileSize,
          recordCount: exp.recordCount,
          createdAt: exp.createdAt,
          completedAt: exp.completedAt,
          error: exp.error,
        })),
        fileBackups,
        pagination: {
          page,
          limit,
          total,
          hasMore: skip + limit < total,
        },
        storage: {
          totalFiles: fileBackups.length,
          totalSizeBytes: totalFileSize,
          totalSizeReadable: formatBytes(totalFileSize),
        },
      });
    } catch (error) {
      console.error('List backups error:', error);
      return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
    }
  });
}

// ── POST: Trigger Manual Backup ────────────────────────────────────
export async function POST(request: NextRequest) {
  return withAdmin(request, async (user) => {
    try {
      const body = await request.json().catch(() => ({}));
      const backupType = body.type || 'full'; // full, sqlite, postgres
      const note = body.note || '';

      // Create a backup record
      const exportRecord = await db.dataExport.create({
        data: {
          userId: user.id,
          exportType: `backup_${backupType}`,
          status: 'pending',
        },
      });

      // Run backup asynchronously
      runBackupAsync(exportRecord.id, backupType, note, user.id).catch((err) => {
        console.error('Async backup error:', err);
      });

      return NextResponse.json({
        id: exportRecord.id,
        type: backupType,
        status: 'pending',
        message: 'Backup started. Check status with GET /api/admin/backup',
      }, { status: 202 });
    } catch (error) {
      console.error('Trigger backup error:', error);
      return NextResponse.json({ error: 'Failed to trigger backup' }, { status: 500 });
    }
  });
}

// ── Helper: Run Backup Async ───────────────────────────────────────
async function runBackupAsync(recordId: string, type: string, note: string, userId: string) {
  try {
    await db.dataExport.update({
      where: { id: recordId },
      data: { status: 'processing' },
    });

    const backupDir = process.env.BACKUP_DIR || '/opt/acquisitionos/backups';
    const scriptPath = type === 'snapshot'
      ? 'scripts/backup/snapshot.sh'
      : 'scripts/backup/backup.sh';

    const { stdout, stderr } = await execAsync(
      `cd ${process.cwd()} && bash ${scriptPath} 2>&1`,
      {
        timeout: 300000, // 5 minutes
        env: { ...process.env, BACKUP_DIR: backupDir },
      }
    );

    // Parse backup file info from output
    const fileSize = await getBackupSize(backupDir);
    const recordCount = await getBackupRecordCount();

    await db.dataExport.update({
      where: { id: recordId },
      data: {
        status: 'completed',
        fileSize,
        recordCount,
        completedAt: new Date(),
        error: stderr ? stderr.substring(0, 500) : null,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId,
        action: 'backup_created',
        details: JSON.stringify({ type, note, recordId, fileSize }),
        resource: 'backup',
        resourceId: recordId,
      },
    });
  } catch (error) {
    await db.dataExport.update({
      where: { id: recordId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message.substring(0, 500) : 'Unknown error',
        completedAt: new Date(),
      },
    });
  }
}

async function getBackupSize(backupDir: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `du -sb "${backupDir}" 2>/dev/null | cut -f1`,
      { timeout: 5000 }
    );
    return parseInt(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

async function getBackupRecordCount(): Promise<number> {
  try {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || '';
    if (!dbPath) return 0;
    const { stdout } = await execAsync(
      `sqlite3 "${dbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null`,
      { timeout: 5000 }
    );
    return parseInt(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
