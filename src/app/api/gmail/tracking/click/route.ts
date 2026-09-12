// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/tracking/click
// Phase 9: Gmail Integration — Email Click Tracking Redirect
// NO withAuth — user clicks link in email
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handleClickTracking, decodeTrackingId } from '@/lib/gmail-tracking-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const encodedUrl = searchParams.get('url');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing tracking ID' },
        { status: 400 }
      );
    }

    // Decode the tracking ID
    const decoded = decodeTrackingId(id);

    if (!decoded || decoded.eventType !== 'click') {
      // Invalid tracking ID — try to redirect to the URL anyway
      if (encodedUrl) {
        try {
          const originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
          return NextResponse.redirect(originalUrl);
        } catch {
          return NextResponse.json(
            { error: 'Invalid tracking link' },
            { status: 400 }
          );
        }
      }
      return NextResponse.json(
        { error: 'Invalid tracking link' },
        { status: 400 }
      );
    }

    // Decode the original URL
    let originalUrl: string;
    if (encodedUrl) {
      try {
        originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL encoding' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Missing redirect URL' },
        { status: 400 }
      );
    }

    // Get request metadata
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';

    // Process the click tracking asynchronously (don't block the redirect)
    handleClickTracking(decoded.messageId, originalUrl, ip).catch(err => {
      console.error('[Gmail Tracking Click] Error handling click tracking:', err);
    });

    // Redirect to the original URL
    return NextResponse.redirect(originalUrl);
  } catch (error) {
    console.error('[Gmail Tracking Click] Error:', error);
    // Try to redirect anyway if we have a URL
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get('url');
    if (encodedUrl) {
      try {
        const originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
        return NextResponse.redirect(originalUrl);
      } catch {
        // Fall through to error
      }
    }
    return NextResponse.json(
      { error: 'Tracking redirect failed' },
      { status: 500 }
    );
  }
}
