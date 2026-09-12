import { NextRequest, NextResponse } from 'next/server';
import { handleTrackingPixelHit, decodeTrackingId } from '@/lib/gmail-tracking-service';

// 1x1 transparent GIF (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * GET /api/gmail/tracking/pixel/[messageId]
 * Email open tracking pixel — called by email clients when rendering HTML email.
 * No auth required (called by external email clients).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;

    // Decode the tracking ID
    const decodedMessageId = decodeTrackingId(messageId);

    // Get client info
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Process the tracking hit asynchronously
    handleTrackingPixelHit(decodedMessageId?.messageId ?? '', ip, userAgent).catch((err) => {
      console.error('[GmailTrackingPixel] Error processing hit:', err);
    });

    // Return transparent GIF immediately
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': '43',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[GmailTrackingPixel] Error:', error);
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': '43',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }
}
