// AcquisitionOS — POST /api/admin/operations/alert-test
// Sends a test alert through both Telegram and WhatsApp channels.
import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdmin } from '@/lib/auth-middleware';
import { sendTelegramTestAlert } from '@/lib/observability/ops-alerting/telegram-channel';
import { sendWhatsAppTestAlert } from '@/lib/observability/ops-alerting/whatsapp-channel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return withSuperAdmin(request, async () => {
    const body = await request.json().catch(() => ({}));
    const channel = typeof body?.channel === 'string' ? body.channel : 'all';
    const results: { telegram?: unknown; whatsapp?: unknown } = {};
    if (channel === 'all' || channel === 'telegram') {
      results.telegram = await sendTelegramTestAlert();
    }
    if (channel === 'all' || channel === 'whatsapp') {
      results.whatsapp = await sendWhatsAppTestAlert();
    }
    return NextResponse.json(
      { ok: true, timestamp: new Date().toISOString(), channel, results },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  });
}
