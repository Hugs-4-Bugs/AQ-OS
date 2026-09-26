// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — RAG Ingest from URL
// POST /api/ai/rag/ingest-url — Fetch and ingest content from a URL
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withRateLimit } from '@/lib/security/rate-limiter';
import { ingestFromUrl } from '@/lib/rag-service';

export async function POST(request: NextRequest) {
  // SECURITY HARDENING: rate limit URL ingestion (SSRF-probe + cost sink)
  const rateLimitResult = withRateLimit(request, 'ai');
  if (rateLimitResult) return rateLimitResult;

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
      // Unsafe URLs are a client input problem — return 400 with a safe message
      if (error instanceof Error && error.name === 'UnsafeUrlError') {
        return NextResponse.json({ error: 'URL is not allowed' }, { status: 400 });
      }
      console.error('[RAG Ingest URL] Error:', error);
      return NextResponse.json(
        { error: 'URL ingestion failed' },
        { status: 500 }
      );
    }
  });
}
