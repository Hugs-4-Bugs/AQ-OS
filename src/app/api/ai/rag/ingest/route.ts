// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RAG Ingest from Text
// POST /api/ai/rag/ingest — Ingest raw text into the knowledge base
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ingestFromText } from '@/lib/rag-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { text, title, leadId } = body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return NextResponse.json({ error: 'Text content is required' }, { status: 400 });
      }
      if (!title || typeof title !== 'string') {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      }

      const result = await ingestFromText(text, title, user.id, {
        leadId,
      });

      return NextResponse.json({
        success: true,
        fileContextId: result.fileContextId,
        chunksCount: result.chunksCount,
      });
    } catch (error) {
      console.error('[RAG Ingest] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Ingestion failed' },
        { status: 500 }
      );
    }
  });
}
