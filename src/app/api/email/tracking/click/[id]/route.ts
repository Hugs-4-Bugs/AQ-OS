// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Click Tracking Redirect Route
// Phase 9: Handle click tracking redirect requests
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handleClickTrackingRequest } from '@/lib/email-click-tracking';
import { buildRedirectUrl, getAppUrl } from '@/lib/app-url';

/**
 * GET /api/email/tracking/click/[id] — Handle click tracking redirect
 * Records the click event and redirects to the original URL.
 * This endpoint does NOT require authentication — it's accessed by email recipients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trackingId } = await params;

    if (!trackingId) {
      return NextResponse.redirect(buildRedirectUrl('/'));
    }

    // Extract IP and user-agent
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent') || null;

    // Handle the click tracking request
    const result = await handleClickTrackingRequest(trackingId, ipAddress || undefined, userAgent || undefined);

    // Redirect to the original URL
    const redirectUrl = result.redirectUrl || '/';

    // Ensure the redirect URL is absolute
    let finalUrl: string;
    try {
      if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
        finalUrl = redirectUrl;
      } else {
        // Relative URL — use the app URL
        finalUrl = new URL(redirectUrl, getAppUrl()).toString();
      }
    } catch {
      finalUrl = '/';
    }

    return NextResponse.redirect(finalUrl, { status: 302 });
  } catch (error) {
    console.error('[ClickTrackingAPI] Error:', error);
    // Redirect to home on error
    return NextResponse.redirect(buildRedirectUrl('/'), { status: 302 });
  }
}
