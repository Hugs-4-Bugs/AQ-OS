// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/leads/import
// Phase 7: Import leads from CSV
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { importCSV } from '@/lib/lead-import-export-service';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const contentType = request.headers.get('content-type') || '';

      let csvData: string;
      let preview = false;

      // ACCOUNT ISOLATION: the target org used to be accepted from the
      // request body/form, letting a caller stamp imported rows into an
      // org they do not belong to. The org is now derived ONLY from the
      // authenticated identity.
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        preview = formData.get('preview') === 'true';

        if (!file) {
          return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        csvData = await file.text();
      } else {
        const body = await request.json();
        csvData = body.csvData;
        preview = body.preview || false;
      }

      if (!csvData || typeof csvData !== 'string' || csvData.trim().length === 0) {
        return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 });
      }

      const result = await importCSV(user.id, csvData, {
        orgId: user.orgId ?? undefined,
        preview,
      });

      if (!result.success && result.total === 0) {
        return NextResponse.json({ error: result.errors[0]?.message || 'Import failed' }, { status: 400 });
      }

      return NextResponse.json(result, { status: preview ? 200 : 201 });
    } catch (error) {
      console.error('[API /leads/import] Error:', error);
      return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
  });
}
