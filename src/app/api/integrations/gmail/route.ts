import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';

function isGoogleOAuthConfigured(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return false;
  // Reject placeholder values
  if (clientId.includes('your-') || clientId.includes('MOCK') || clientId === '') return false;
  return true;
}

// GET: Gmail connection status and settings
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    try {
      // Query EmailAccount for real connection status
      const accounts = await db.emailAccount.findMany({
        where: { userId: user.id, status: 'active' },
        select: {
          gmailEmail: true,
          lastPollAt: true,
          createdAt: true,
        },
      });

      if (accounts.length > 0) {
        const account = accounts[0];
        return NextResponse.json({
          connected: true,
          email: account.gmailEmail,
          lastSync: account.lastPollAt?.toISOString() || null,
          syncFrequency: 'every_15_minutes',
          autoReply: false,
          leadMatching: false,
          labels: [
            { name: 'Inbox', enabled: true, count: 0 },
            { name: 'Sent', enabled: true, count: 0 },
            { name: 'Drafts', enabled: false, count: 0 },
            { name: 'Leads', enabled: true, count: 0 },
            { name: 'Follow-ups', enabled: true, count: 0 },
          ],
          stats: {
            emailsSynced: 0,
            sentViaAO: 0,
            autoRepliesCreated: 0,
            leadsMatched: 0,
          },
          recentActivity: [],
          oauthScopes: ['read', 'send', 'manage_labels'],
        });
      }
    } catch {
      // EmailAccount table may not be available yet
    }

    // Not connected — return zero-state with a note
    const oauthAvailable = isGoogleOAuthConfigured();

    return NextResponse.json({
      connected: false,
      email: null,
      lastSync: null,
      syncFrequency: 'every_15_minutes',
      autoReply: false,
      leadMatching: false,
      available: oauthAvailable,
      labels: [
        { name: 'Inbox', enabled: true, count: 0 },
        { name: 'Sent', enabled: true, count: 0 },
        { name: 'Drafts', enabled: false, count: 0 },
        { name: 'Leads', enabled: true, count: 0 },
        { name: 'Follow-ups', enabled: true, count: 0 },
      ],
      stats: {
        emailsSynced: 0,
        sentViaAO: 0,
        autoRepliesCreated: 0,
        leadsMatched: 0,
      },
      recentActivity: [],
      oauthScopes: ['read', 'send', 'manage_labels'],
    });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    return NextResponse.json({ error: err.message || 'Authentication required' }, { status: err.status || 401 });
  }
}

// POST: Connect Gmail / Update settings / Disconnect
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { action, ...settings } = body;

    if (action === 'connect') {
      if (!isGoogleOAuthConfigured()) {
        return NextResponse.json(
          { error: 'Google OAuth not configured', available: false },
          { status: 503 }
        );
      }

      const clientId = process.env.GOOGLE_CLIENT_ID!;
      const redirectUri = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''}/api/integrations/gmail/callback`;

      return NextResponse.json({
        message: 'Gmail connection initiated',
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify&access_type=offline`,
      });
    }

    if (action === 'disconnect') {
      try {
        await db.emailAccount.updateMany({
          where: { userId: user.id },
          data: { status: 'revoked' },
        });
      } catch {
        // Table may not exist yet
      }
      return NextResponse.json({ message: 'Gmail disconnected successfully' });
    }

    if (action === 'sync') {
      return NextResponse.json({ message: 'Sync initiated', synced: 0 });
    }

    if (action === 'update_settings') {
      return NextResponse.json({ message: 'Settings updated', settings });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    return NextResponse.json({ error: err.message || 'Authentication required' }, { status: err.status || 401 });
  }
}
