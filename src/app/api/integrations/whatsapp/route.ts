import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// GET: WhatsApp connection status and settings
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    return NextResponse.json({
      connected: false,
      phoneNumber: '',
      businessName: '',
      connectionQuality: null,
      lastActivity: null,
      settings: null,
      stats: null,
    });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    return NextResponse.json({ error: err.message || 'Authentication required' }, { status: err.status || 401 });
  }
}

// POST: Connect / Disconnect / Sync / Update settings / Test connection
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { action, ...params } = body;

    if (action === 'connect') {
      return NextResponse.json({
        error: 'WhatsApp integration is not configured. Meta OAuth credentials are required.',
      }, { status: 503 });
    }

    if (action === 'disconnect') {
      return NextResponse.json({ message: 'WhatsApp disconnected successfully' });
    }

    if (action === 'sync') {
      return NextResponse.json({
        message: 'WhatsApp sync initiated',
        synced: 0,
        contacts: 0,
      });
    }

    if (action === 'update_settings') {
      return NextResponse.json({ message: 'WhatsApp settings updated', settings: params });
    }

    if (action === 'test_connection') {
      return NextResponse.json({
        error: 'WhatsApp integration is not configured.',
      }, { status: 503 });
    }

    return NextResponse.json({ error: 'Invalid action. Supported: connect, disconnect, sync, update_settings, test_connection' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string; status?: number };
    return NextResponse.json({ error: err.message || 'Authentication required' }, { status: err.status || 401 });
  }
}
