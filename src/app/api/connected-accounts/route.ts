// GET /api/connected-accounts — unified list of ALL connected accounts for the authenticated user
// Includes: AI Providers, Business Accounts (SMTP/Gmail SMTP), Human Channels (Telegram)
// LinkedIn/Instagram are reported as 'provider_blocked' honest status (no fake "connected").
import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { listUnifiedConnectedAccounts } from '@/lib/connected-accounts/service';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const accounts = await listUnifiedConnectedAccounts(user.id);
      return NextResponse.json({ accounts, total: accounts.length });
    } catch (e) {
      return NextResponse.json({ accounts: [], total: 0, error: e instanceof Error ? e.message : 'unknown' }, { status: 200 });
    }
  });
}
