// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Email Open Tracking Pixel Route
// Phase 9: Handle tracking pixel requests (returns 1x1 GIF)
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handleTrackingPixelRequest } from '@/lib/email-open-tracking';

/**
 * GET /api/email/tracking/open/[id] — Handle tracking pixel request
 * Returns a 1x1 transparent GIF and records the open event.
 * This endpoint does NOT require authentication — it's accessed by email clients.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trackingPixelId } = await params;

    if (!trackingPixelId) {
      return new NextResponse(null, { status: 400 });
    }

    // Extract IP and user-agent from the request
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent') || null;

    // Handle the tracking pixel request
    const result = await handleTrackingPixelRequest(trackingPixelId, ipAddress || undefined, userAgent || undefined);

    // Return the 1x1 GIF with appropriate headers
    return new NextResponse(new Uint8Array(result.gif), {
      status: 200,
      headers: result.headers,
    });
  } catch (error) {
    console.error('[OpenTrackingAPI] Error:', error);
    // Still return the pixel to avoid breaking email rendering
    const gif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    return new NextResponse(gif, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store',
      },
    });
  }
}
