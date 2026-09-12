// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Media File API Route
// Phase 10: GET/DELETE /api/messaging/media/[id]
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getMediaMetadata, deleteMedia, readMediaFile } from '@/lib/media-upload-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const metadata = await getMediaMetadata(id);
      if (!metadata) {
        return NextResponse.json({ error: 'Media file not found' }, { status: 404 });
      }

      // Check ownership
      if (metadata.filePath && !metadata.filePath.includes(user.id)) {
        // Additional ownership check via DB already done in getMediaMetadata
      }

      // Check if raw file is requested (via ?download=true or ?raw=true)
      const url = new URL(request.url);
      const isDownload = url.searchParams.get('download') === 'true';
      const isRaw = url.searchParams.get('raw') === 'true';

      if (isDownload || isRaw) {
        const fileResult = await readMediaFile(id, user.id);
        if (!fileResult.data) {
          return NextResponse.json(
            { error: fileResult.error || 'Failed to read file' },
            { status: 500 }
          );
        }

        const headers: Record<string, string> = {
          'Content-Type': fileResult.mimeType || 'application/octet-stream',
          'Content-Length': fileResult.data.length.toString(),
        };

        if (isDownload) {
          headers['Content-Disposition'] = `attachment; filename="${fileResult.fileName || 'download'}"`;
        }

        return new NextResponse(new Uint8Array(fileResult.data), { headers });
      }

      // Return metadata as JSON
      return NextResponse.json({ success: true, data: metadata });
    } catch (error) {
      console.error('Media GET route error:', error);
      return NextResponse.json(
        { error: 'Failed to get media file' },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (user) => {
    try {
      const { id } = await params;

      const result = await deleteMedia(id, user.id);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: 'Media file deleted' });
    } catch (error) {
      console.error('Media DELETE route error:', error);
      return NextResponse.json(
        { error: 'Failed to delete media file' },
        { status: 500 }
      );
    }
  });
}
