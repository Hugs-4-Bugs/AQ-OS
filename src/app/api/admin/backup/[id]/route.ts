// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Backup API by ID (Details + Restore + Delete)
// Phase 14.5: Backups & Recovery
// GET: backup details, POST: restore, DELETE: delete backup
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ── GET: Backup Details ────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(request, async () => {
    try {
      const { id } = await params;

      const backup = await db.dataExport.findUnique({
        where: { id },
      });

      if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      // If completed, try to get file details
      let fileDetails: { size: number; lastModified: string } | null = null;
      if (backup.fileUrl) {
        try {
          const { stdout } = await execAsync(
            `stat -c '%s %Y' "${backup.fileUrl}" 2>/dev/null || echo "0 0"`,
            { timeout: 3000 }
          );
          const [size, mtime] = stdout.trim().split(' ');
          fileDetails = {
            size: parseInt(size),
            lastModified: new Date(parseInt(mtime) * 1000).toISOString(),
          };
        } catch {
          // File details unavailable
        }
      }

      return NextResponse.json({
        id: backup.id,
        type: backup.exportType,
        status: backup.status,
        fileSize: backup.fileSize,
        recordCount: backup.recordCount,
        fileUrl: backup.fileUrl,
        error: backup.error,
        createdAt: backup.createdAt,
        completedAt: backup.completedAt,
        fileDetails,
      });
    } catch (error) {
      console.error('Get backup details error:', error);
      return NextResponse.json({ error: 'Failed to get backup details' }, { status: 500 });
    }
  });
}

// ── POST: Restore Backup ───────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(request, async (user) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const dryRun = body.dryRun || false;

      const backup = await db.dataExport.findUnique({ where: { id } });
      if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      if (backup.status !== 'completed') {
        return NextResponse.json({ error: 'Cannot restore a backup that is not completed' }, { status: 400 });
      }

      // Determine restore type from export type
      const backupType = backup.exportType.replace('backup_', '');

      // Create a pre-restore backup record
      const preRestoreRecord = await db.dataExport.create({
        data: {
          userId: user.id,
          exportType: 'backup_pre_restore',
          status: 'pending',
        },
      });

      // Run restore asynchronously
      runRestoreAsync(id, backupType, dryRun, user.id, preRestoreRecord.id).catch((err) => {
        console.error('Async restore error:', err);
      });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'backup_restore_initiated',
          details: JSON.stringify({ backupId: id, backupType, dryRun }),
          resource: 'backup',
          resourceId: id,
        },
      });

      return NextResponse.json({
        id,
        status: 'restoring',
        dryRun,
        message: dryRun
          ? 'Dry run restore initiated. No changes will be made.'
          : 'Restore initiated. A pre-restore backup has been created.',
      }, { status: 202 });
    } catch (error) {
      console.error('Restore backup error:', error);
      return NextResponse.json({ error: 'Failed to initiate restore' }, { status: 500 });
    }
  });
}

// ── DELETE: Delete Backup ──────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(request, async (user) => {
    try {
      const { id } = await params;

      const backup = await db.dataExport.findUnique({ where: { id } });
      if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      // Delete the file from filesystem if it exists
      if (backup.fileUrl) {
        try {
          await execAsync(`rm -f "${backup.fileUrl}"`, { timeout: 5000 });
        } catch {
          // File deletion may fail if path doesn't exist
        }
      }

      // Delete the database record
      await db.dataExport.delete({ where: { id } });

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'backup_deleted',
          details: JSON.stringify({ backupId: id, type: backup.exportType }),
          resource: 'backup',
          resourceId: id,
        },
      });

      return NextResponse.json({
        message: 'Backup deleted successfully',
        id,
      });
    } catch (error) {
      console.error('Delete backup error:', error);
      return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
    }
  });
}

// ── Helper: Run Restore Async ──────────────────────────────────────
async function runRestoreAsync(
  backupId: string,
  backupType: string,
  dryRun: boolean,
  userId: string,
  preRestoreRecordId: string
) {
  try {
    // Create pre-restore backup
    const backupDir = process.env.BACKUP_DIR || '/opt/acquisitionos/backups';
    await execAsync(
      `cd ${process.cwd()} && bash scripts/backup/backup.sh`,
      { timeout: 300000, env: { ...process.env, BACKUP_DIR: backupDir } }
    );

    await db.dataExport.update({
      where: { id: preRestoreRecordId },
      data: { status: 'completed', completedAt: new Date() },
    });

    // Run restore
    const typeFlag = backupType === 'postgres' ? '--type postgres' : '--type sqlite';
    const dryRunFlag = dryRun ? '--dry-run' : '';

    const { stderr } = await execAsync(
      `cd ${process.cwd()} && bash scripts/backup/restore.sh --latest ${typeFlag} ${dryRunFlag} 2>&1`,
      { timeout: 600000, env: { ...process.env, BACKUP_DIR: backupDir } }
    );

    // Audit the restore
    await db.auditLog.create({
      data: {
        userId,
        action: dryRun ? 'backup_restore_dry_run' : 'backup_restore_completed',
        details: JSON.stringify({ backupId, backupType, dryRun, stderr: stderr?.substring(0, 200) }),
        resource: 'backup',
        resourceId: backupId,
      },
    });
  } catch (error) {
    await db.dataExport.update({
      where: { id: preRestoreRecordId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message.substring(0, 500) : 'Restore failed',
      },
    });

    await db.auditLog.create({
      data: {
        userId,
        action: 'backup_restore_failed',
        details: JSON.stringify({ backupId, error: error instanceof Error ? error.message : 'Unknown error' }),
        resource: 'backup',
        resourceId: backupId,
      },
    });
  }
}
