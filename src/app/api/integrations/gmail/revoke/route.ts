import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Mark all email accounts as revoked
      await db.emailAccount.updateMany({
        where: { userId: user.id, status: 'active' },
        data: { status: 'revoked' },
      });
      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Gmail revoke error:', error);
      return NextResponse.json({ error: 'Failed to revoke Gmail access' }, { status: 500 });
    }
  });
}
