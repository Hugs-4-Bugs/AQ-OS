// POST /api/connected-accounts/connect — connect a business SMTP account (Gmail SMTP / Hostinger Mail)
// Request body: { provider, accountIdentifier, credentials: { host, port, user, password, secure?, fromName? } }
// Validates credentials via the adapter, encrypts at rest, persists with userId ownership.
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { connectBusinessAccount } from '@/lib/connected-accounts/service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { provider, accountIdentifier, credentials } = body || {};
      if (!provider || !accountIdentifier || !credentials) {
        return NextResponse.json({ error: 'Missing provider, accountIdentifier, or credentials' }, { status: 400 });
      }
      if (!['gmail-smtp', 'hostinger-mail', 'smtp-email'].includes(provider)) {
        return NextResponse.json({ error: `Provider "${provider}" not supported for direct connect. Use OAuth flow if available.` }, { status: 400 });
      }
      if (!credentials.host || !credentials.user || !credentials.password || typeof credentials.port === 'undefined') {
        return NextResponse.json({ error: 'Credentials must include host, port, user, password' }, { status: 400 });
      }
      const result = await connectBusinessAccount({
        userId: user.id,
        provider,
        accountIdentifier,
        credentials: {
          host: String(credentials.host),
          port: typeof credentials.port === 'number' ? credentials.port : parseInt(String(credentials.port)),
          user: String(credentials.user),
          password: String(credentials.password),
          secure: !!credentials.secure,
          fromName: credentials.fromName ? String(credentials.fromName) : undefined,
        },
        scopes: credentials.scopes,
        meta: credentials.meta,
      });
      return NextResponse.json({ account: result.account, validation: result.validation });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
