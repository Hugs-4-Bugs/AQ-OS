// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Sentry Tunnel Endpoint
// Phase 14.2: Observability Infrastructure
//
// POST /api/sentry — Tunnel for client-side Sentry events
// This avoids CORS issues and ad blockers by proxying events
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

export async function POST(request: NextRequest) {
  try {
    if (!SENTRY_DSN) {
      return NextResponse.json(
        { error: 'Sentry DSN not configured' },
        { status: 503 }
      );
    }

    // Parse the Sentry envelope from the request body
    const envelope = await request.text();

    if (!envelope || envelope.length === 0) {
      return NextResponse.json(
        { error: 'Empty envelope' },
        { status: 400 }
      );
    }

    // Extract the DSN host from the configured DSN
    const dsnUrl = new URL(SENTRY_DSN);
    const sentryHost = dsnUrl.hostname;

    // Forward the envelope to Sentry
    const sentryEndpoint = `https://${sentryHost}/api/${dsnUrl.pathname.replace(/^\/+/, '')}/envelope/`;

    const response = await fetch(sentryEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      body: envelope,
    });

    return new NextResponse(null, {
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error('[SentryTunnel] Failed to forward event:', error);
    return NextResponse.json(
      { error: 'Failed to forward Sentry event' },
      { status: 500 }
    );
  }
}
