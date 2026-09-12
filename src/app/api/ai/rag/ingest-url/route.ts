// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RAG Ingest from URL
// POST /api/ai/rag/ingest-url — Fetch and ingest content from a URL
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ingestFromUrl } from '@/lib/rag-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { url, leadId } = body;

      if (!url || typeof url !== 'string') {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
      }

      // Basic URL validation
      try {
        new URL(url);
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
      }

      const result = await ingestFromUrl(url, user.id, { leadId });

      return NextResponse.json({
        success: true,
        fileContextId: result.fileContextId,
        chunksCount: result.chunksCount,
      });
    } catch (error) {
      console.error('[RAG Ingest URL] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'URL ingestion failed' },
        { status: 500 }
      );
    }
  });
}
