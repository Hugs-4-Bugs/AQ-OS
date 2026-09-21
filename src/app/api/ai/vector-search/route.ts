// POST /api/ai/vector-search — Search leads/conversations by semantic similarity
//
// ACCOUNT ISOLATION: the searched tenant is ALWAYS the authenticated
// user. The previous version accepted `userId` from the request body,
// letting any account semantic-search any other account's leads and
// conversations.

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { searchSimilarLeads, searchConversations } from '@/lib/vector-search-service';

export async function POST(request: NextRequest) {
  return withPermission(request, 'assistant:read', async (user) => {
    try {
      const body = await request.json();
      const { query, type, topK, minScore } = body;

      if (!query || typeof query !== 'string' || !query.trim()) {
        return NextResponse.json(
          { error: 'query is required' },
          { status: 400 }
        );
      }

      const userId = user.id; // trusted identity — never client-supplied

      const searchType = type || 'leads'; // 'leads' or 'conversations'
      const options = {
        topK: Math.min(topK || 10, 50),
        minScore: minScore ?? 0.3,
        filter: { userId },
      };

      let results;
      if (searchType === 'conversations') {
        results = await searchConversations(query, userId, options);
      } else {
        results = await searchSimilarLeads(query, userId, options);
      }

      return NextResponse.json({
        query,
        type: searchType,
        results,
        total: results.length,
      });
    } catch (error) {
      console.error('[VectorSearch API] Error:', error);
      return NextResponse.json(
        { error: 'Failed to perform vector search' },
        { status: 500 }
      );
    }
  });
}
