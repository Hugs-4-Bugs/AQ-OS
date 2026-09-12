// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RAG Ingest from CSV
// POST /api/ai/rag/ingest-csv — Parse and ingest CSV data
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { ingestFromCsv } from '@/lib/rag-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { csv, title, leadId } = body;

      if (!csv || typeof csv !== 'string' || csv.trim().length === 0) {
        return NextResponse.json({ error: 'CSV content is required' }, { status: 400 });
      }
      if (!title || typeof title !== 'string') {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      }

      const result = await ingestFromCsv(csv, title, user.id, { leadId });

      return NextResponse.json({
        success: true,
        fileContextId: result.fileContextId,
        chunksCount: result.chunksCount,
      });
    } catch (error) {
      console.error('[RAG Ingest CSV] Error:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'CSV ingestion failed' },
        { status: 500 }
      );
    }
  });
}
