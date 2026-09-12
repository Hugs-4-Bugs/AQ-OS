import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { savePushSubscription, removePushSubscription } from '@/lib/notification-channels/push-channel';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { subscription, action } = body;
      
      if (action === 'unsubscribe' && subscription?.endpoint) {
        await removePushSubscription(user.id, subscription.endpoint);
        return NextResponse.json({ success: true, message: 'Unsubscribed' });
      }
      
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return NextResponse.json(
          { error: 'Invalid push subscription format' },
          { status: 400 }
        );
      }
      
      const userAgent = request.headers.get('user-agent') || undefined;
      
      const result = await savePushSubscription(user.id, subscription, userAgent);
      
      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 500 }
        );
      }
      
      return NextResponse.json({ success: true, message: 'Push subscription saved' });
    } catch (error) {
      console.error('[PushSubscribe] Error:', error);
      return NextResponse.json(
        { error: 'Failed to manage push subscription' },
        { status: 500 }
      );
    }
  });
}
