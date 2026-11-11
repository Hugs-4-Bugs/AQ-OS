// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Export Download Route (hardened Phase 6)
//
// GET /api/settings/account/export-download?token=...&requestId=...
//
// Security improvements (Phase 6):
//   1. Token validated via SHA-256 hash comparison (plaintext NEVER stored in DB)
//   2. ExportId stored in GdprRequest.notes → exact DataExport linkage (no "latest" shortcut)
//   3. Constant-time hash comparison via timingSafeEqual
//   4. Ownership, expiry, status checks preserved
//   5. Cross-user → 404, token mismatch → 403, expired → 410
//   6. No tokens in audit logs
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';
import { createHash, timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface GdprRequestNotes {
  exportId?: string;
  tokenHash?: string;
  info?: string;
  confirmationCode?: string;
  confirmationCodeHash?: string;
}

function parseNotes(raw: string | null | undefined): GdprRequestNotes {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Legacy notes format (plain string) — no structured data
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const token = request.nextUrl.searchParams.get('token');
    const requestId = request.nextUrl.searchParams.get('requestId');

    if (!token || !requestId) {
      return NextResponse.json(
        { error: 'Missing required parameters: token and requestId' },
        { status: 400 }
      );
    }

    // Look up the GdprRequest
    const gdprRequest = await db.gdprRequest.findUnique({
      where: { id: requestId },
    });

    if (!gdprRequest) {
      return NextResponse.json(
        { error: 'Export request not found' },
        { status: 404 }
      );
    }

    // Ownership check
    if (gdprRequest.userId !== user.id) {
      return NextResponse.json(
        { error: 'Export request not found' },
        { status: 404 }
      );
    }

    // Status check
    if (gdprRequest.status !== 'completed') {
      return NextResponse.json(
        { error: `Export request is not ready (status: ${gdprRequest.status})` },
        { status: 409 }
      );
    }

    // Expiry check
    if (!gdprRequest.expiresAt || gdprRequest.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Download link has expired. Please submit a new export request.' },
        { status: 410 }
      );
    }

    // Parse notes for tokenHash + exportId
    const notes = parseNotes(gdprRequest.notes);

    if (!notes.tokenHash) {
      // Legacy request without hash — reject (must re-generate)
      return NextResponse.json(
        { error: 'This download link uses an outdated security format. Please submit a new export request.' },
        { status: 403 }
      );
    }

    if (!notes.exportId) {
      return NextResponse.json(
        { error: 'Export association missing. Please submit a new export request.' },
        { status: 404 }
      );
    }

    // Hash the provided token and compare with stored hash (constant-time)
    const providedTokenHash = createHash('sha256').update(token).digest('hex');
    if (!safeCompare(providedTokenHash, notes.tokenHash)) {
      await logAuthEvent({
        userId: user.id,
        action: 'export_download_token_mismatch',
        details: JSON.stringify({ requestId }),
        ipAddress: ip,
        userAgent: ua,
        resource: 'data_export',
        resourceId: requestId,
      }).catch(() => {});

      return NextResponse.json(
        { error: 'Invalid or mismatched download token' },
        { status: 403 }
      );
    }

    // Find the EXACT DataExport by exportId (not "latest completed" shortcut)
    const exportRecord = await db.dataExport.findUnique({
      where: { id: notes.exportId },
    });

    if (!exportRecord) {
      return NextResponse.json(
        { error: 'Export data not found. The export may have been removed.' },
        { status: 404 }
      );
    }

    // Verify ownership of the export record
    if (exportRecord.userId !== user.id) {
      return NextResponse.json(
        { error: 'Export data not found.' },
        { status: 404 }
      );
    }

    // Verify export is completed
    if (exportRecord.status !== 'completed') {
      return NextResponse.json(
        { error: `Export is not ready (status: ${exportRecord.status})` },
        { status: 409 }
      );
    }

    // Verify file content exists
    if (!exportRecord.fileUrl || !exportRecord.fileUrl.startsWith('data:')) {
      return NextResponse.json(
        { error: 'Export data is corrupted or unavailable' },
        { status: 500 }
      );
    }

    // Extract and decode the base64 content
    const base64Data = exportRecord.fileUrl.split(',')[1];
    if (!base64Data) {
      return NextResponse.json(
        { error: 'Export data is corrupted' },
        { status: 500 }
      );
    }

    const fileBuffer = Buffer.from(base64Data, 'base64');

    // Audit the successful download (no tokens in logs)
    await logAuthEvent({
      userId: user.id,
      action: 'export_downloaded',
      details: JSON.stringify({
        requestId,
        exportId: exportRecord.id,
        fileSize: exportRecord.fileSize,
        recordCount: exportRecord.recordCount,
      }),
      ipAddress: ip,
      userAgent: ua,
      resource: 'data_export',
      resourceId: exportRecord.id,
    }).catch(() => {});

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="acquisitionos-data-export-${requestId}.json"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json(
        { error: error.message },
        { status: (error as { statusCode: number }).statusCode }
      );
    }
    console.error('Export download error:', error);
    return NextResponse.json(
      { error: 'Failed to process download request' },
      { status: 500 }
    );
  }
}
