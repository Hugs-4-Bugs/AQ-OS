import { NextResponse } from 'next/server';
import { generateVapidKeys } from '@/lib/notification-channels/push-channel';

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  
  if (!publicKey) {
    // For development: generate ephemeral keys and return the public key
    // In production, set VAPID_PUBLIC_KEY in .env
    return NextResponse.json({ 
      publicKey: null,
      message: 'Push notifications not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env.',
    }, { status: 503 });
  }
  
  return NextResponse.json({ publicKey });
}
