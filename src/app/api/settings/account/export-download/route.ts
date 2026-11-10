// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Export Download Route (P2 fix — was missing)
//
// GET /api/settings/account/export-download?token=...&requestId=...
//
// Securely serves a completed data export for download.
//
// Security:
//   1. Authenticated user only (requireAuth)
//   2. requestId must belong to the authenticated user (ownership)
//   3. GdprRequest must be completed
//   4. Token must match the token embedded in the stored downloadUrl
//      (constant-time comparison)
//   5. expiresAt must not have passed
//   6. Associated DataExport must exist and be completed
//   7. File content is decoded from base64 and returned as JSON download
//   8. Appropriate Content-Type and Content-Disposition headers set
//   9. No tokens or secrets in audit logs
//
// Token model:
//   The export-request endpoint generates a crypto.randomUUID() token
//   and embeds it in the downloadUrl stored on the GdprRequest record.
//   This route extracts the expected token from the stored URL and
//   compares it with the token provided in the query string.
//   The token is never stored separately — it exists only as part of
//   the URL string in the downloadUrl field.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';
import { timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Constant-time string comparison
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Extract the token from a stored downloadUrl
function extractTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('token');
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const token = request.nextUrl.searchParams.get('token');
    const requestId = request.nextUrl.searchParams.get('requestId');

    // Validate required parameters
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

    // Ownership check — the request must belong to the authenticated user
    if (gdprRequest.userId !== user.id) {
      // Don't reveal existence to non-owners — return 404
      return NextResponse.json(
        { error: 'Export request not found' },
        { status: 404 }
      );
    }

    // Status check — must be completed
    if (gdprRequest.status !== 'completed') {
      return NextResponse.json(
        { error: `Export request is not ready (status: ${gdprRequest.status})` },
        { status: 409 }
      );
    }

    // Expiry check
    if (gdprRequest.expiresAt && gdprRequest.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Download link has expired. Please submit a new export request.' },
        { status: 410 }
      );
    }

    // Token validation — extract expected token from stored downloadUrl
    const expectedToken = extractTokenFromUrl(gdprRequest.downloadUrl || '');
    if (!expectedToken) {
      return NextResponse.json(
        { error: 'Invalid download link' },
        { status: 400 }
      );
    }

    // Constant-time token comparison
    if (!safeCompare(token, expectedToken)) {
      // Audit the failed attempt (without logging the token)
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

    // Find the associated DataExport record
    // The export-request endpoint creates both GdprRequest and DataExport
    // with the same userId. We look for the most recent completed export.
    const exportRecord = await db.dataExport.findFirst({
      where: {
        userId: user.id,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
    });

    if (!exportRecord) {
      return NextResponse.json(
        { error: 'Export data not found. The export may have been removed.' },
        { status: 404 }
      );
    }

    // Verify the export has file content
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

    // Audit the successful download (without logging tokens or file content)
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

    // Return the file as a downloadable JSON attachment
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
