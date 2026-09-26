// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — GET /api/discovery/sources
// Returns the real-time configuration status of every discovery source.
// Exposes env var NAMES only — never values. Used by:
//   - Discover page (dropdown hints + "requires API configuration" banner)
//   - Settings → Integrations → Discovery Sources
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { listSourceStatuses } from '@/lib/lead-discovery/source-registry';

export async function GET(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const sources = listSourceStatuses().map((s) => ({
        id: s.id,
        label: s.label,
        type: s.type,
        description: s.description,
        status: s.status,
        configMessage: s.configMessage,
        requiredEnvVars: s.requiredEnvVars,
        optionalEnvVars: s.optionalEnvVars,
        signupUrl: s.signupUrl || null,
        notes: s.notes || null,
        noSetupRequired: s.noSetupRequired || false,
      }));

      return NextResponse.json({ sources });
    } catch (error) {
      console.error('[API /discovery/sources] Error:', error);
      return NextResponse.json({ error: 'Failed to load discovery source status' }, { status: 500 });
    }
  });
}
