// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/unsubscribe
// Phase 9: Gmail Integration — Email Unsubscribe Handler
// NO withAuth — lead clicks unsubscribe link in email
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handleUnsubscribe } from '@/lib/gmail-tracking-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return new NextResponse(
        `<html>
          <head><title>Unsubscribe</title></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5;">
            <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 480px; width: 90%;">
              <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
              <h1 style="color: #333; margin: 0 0 12px; font-size: 24px;">Invalid Link</h1>
              <p style="color: #666; margin: 0; font-size: 16px; line-height: 1.5;">
                This unsubscribe link is invalid or has expired. If you wish to unsubscribe, please reply to the email directly.
              </p>
            </div>
          </body>
        </html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    // Get request IP
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'unknown';

    const result = await handleUnsubscribe(token, ip);

    if (!result.success) {
      return new NextResponse(
        `<html>
          <head><title>Unsubscribe</title></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5;">
            <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 480px; width: 90%;">
              <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
              <h1 style="color: #e53e3e; margin: 0 0 12px; font-size: 24px;">Unsubscribe Failed</h1>
              <p style="color: #666; margin: 0; font-size: 16px; line-height: 1.5;">
                We were unable to process your unsubscribe request. The link may be invalid or expired. Please contact us directly.
              </p>
            </div>
          </body>
        </html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }

    return new NextResponse(
      `<html>
        <head><title>Unsubscribed</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 480px; width: 90%;">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h1 style="color: #38a169; margin: 0 0 12px; font-size: 24px;">Successfully Unsubscribed</h1>
            <p style="color: #666; margin: 0 0 20px; font-size: 16px; line-height: 1.5;">
              ${result.email ? `The email address <strong>${result.email}</strong> has been unsubscribed.` : 'You have been unsubscribed.'}
              You will no longer receive marketing emails from us.
            </p>
            <p style="color: #999; margin: 0; font-size: 14px;">
              If this was a mistake, please contact us to re-subscribe.
            </p>
          </div>
        </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  } catch (error) {
    console.error('[Gmail Unsubscribe] Error:', error);
    return new NextResponse(
      `<html>
        <head><title>Unsubscribe Error</title></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 480px; width: 90%;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h1 style="color: #e53e3e; margin: 0 0 12px; font-size: 24px;">Something Went Wrong</h1>
            <p style="color: #666; margin: 0; font-size: 16px; line-height: 1.5;">
              We encountered an error processing your unsubscribe request. Please try again or contact us directly.
            </p>
          </div>
        </body>
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}
