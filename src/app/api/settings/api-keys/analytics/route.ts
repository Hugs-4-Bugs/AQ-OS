import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getApiKeyAnalytics } from '@/lib/api-key-service';

// GET /api/settings/api-keys/analytics — Get comprehensive API key usage analytics
export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const analytics = await getApiKeyAnalytics(user.id);
      return NextResponse.json(analytics);
    } catch (error) {
      console.error('API key analytics error:', error);
      return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
    }
  });
}
