// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/gmail/callback
// Phase 9: Gmail Integration — OAuth Callback from Google
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { handleOAuthCallback, verifyOAuthState } from '@/lib/gmail-oauth-service';
import { logGmailEvent } from '@/lib/gmail-audit-service';

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle user denial or Google error
    if (error) {
      console.error('[Gmail Callback] OAuth error:', error);
      return NextResponse.redirect(
        `${DASHBOARD_URL}/?gmail_error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${DASHBOARD_URL}/?gmail_error=${encodeURIComponent('Missing code or state parameter')}`
      );
    }

    // Verify state parameter to prevent CSRF
    const userId = await verifyOAuthState(state);
    if (!userId) {
      console.error('[Gmail Callback] Invalid state parameter');
      return NextResponse.redirect(
        `${DASHBOARD_URL}/?gmail_error=${encodeURIComponent('Invalid or expired state token')}`
      );
    }

    // Exchange code for tokens and create/update EmailAccount
    const result = await handleOAuthCallback(code);

    // Audit log
    await logGmailEvent({
      userId,
      action: 'gmail_oauth_callback',
      details: `Gmail OAuth callback successful: ${result.email}`,
      resourceId: result.emailAccountId,
      metadata: { email: result.email },
    });

    // Redirect to dashboard with success
    return NextResponse.redirect(
      `${DASHBOARD_URL}/?gmail_connected=${encodeURIComponent(result.email)}`
    );
  } catch (error) {
    console.error('[Gmail Callback] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(
      `${DASHBOARD_URL}/?gmail_error=${encodeURIComponent(message)}`
    );
  }
}
