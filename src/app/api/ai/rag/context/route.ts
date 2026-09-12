// POST /api/ai/rag/context — Upload file context
// GET /api/ai/rag/context — Get file contexts for a lead

import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/auth-middleware';
import { ingestFile, getFileContext, associateFileWithContext } from '@/lib/file-context-service';

export async function POST(request: NextRequest) {
  return withPermission(request, 'assistant:read', async () => {
    try {
      const body = await request.json();
      const { userId, fileName, fileContent, mimeType, leadId, metadata } = body;

      if (!userId || !fileName || !fileContent) {
        return NextResponse.json(
          { error: 'userId, fileName, and fileContent are required' },
          { status: 400 }
        );
      }

      // Validate file size (max 5MB text content)
      const maxContentSize = 5 * 1024 * 1024;
      if (fileContent.length > maxContentSize) {
        return NextResponse.json(
          { error: 'File content exceeds 5MB limit' },
          { status: 400 }
        );
      }

      const result = await ingestFile({
        userId,
        fileName,
        fileContent,
        mimeType,
        leadId,
        metadata,
      });

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to ingest file' },
          { status: 400 }
        );
      }

      return NextResponse.json(result, { status: 201 });
    } catch (error) {
      console.error('[RAG Context API] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to upload file context' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withPermission(request, 'assistant:read', async () => {
    try {
      const { searchParams } = new URL(request.url);
      const leadId = searchParams.get('leadId');
      const userId = searchParams.get('userId');

      if (!leadId || !userId) {
        return NextResponse.json(
          { error: 'leadId and userId are required query parameters' },
          { status: 400 }
        );
      }

      const contexts = await getFileContext(leadId, userId);

      return NextResponse.json({
        contexts,
        total: contexts.length,
      });
    } catch (error) {
      console.error('[RAG Context API] GET error:', error);
      return NextResponse.json(
        { error: 'Failed to get file contexts' },
        { status: 500 }
      );
    }
  });
}
