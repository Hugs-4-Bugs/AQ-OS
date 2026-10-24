// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Country Catalog API (Phase 21)
// GET /api/autopilot/countries — the canonical country catalog served
//                               server-side: the Worldwide selection
//                               entry + the full ISO 3166-1 dataset
//                               (alpha-2 codes + canonical names,
//                               deterministic catalog order) + the
//                               server-enforced selection bound.
//                               Optional ?q= narrows the list through
//                               the canonical search (name/alias/code).
//
// The catalog is STATIC (no per-user rows) — unlike Phase 20's custom
// niches there is nothing user-owned to persist here; the user's
// SELECTION persists on AutopilotWorkflow.geography and is read via
// GET /api/autopilot and GET /api/autopilot/[id]. This route exists so
// every client renders the SAME canonical catalog (never a hard-coded
// 6-country list) and so validation rules are discoverable.
//
// Entitlement mirrors the other Autopilot routes: free/starter receive
// 200 with the catalog + entitlement.allowed=false (the catalog is
// public-shape data; creating configurations remains pro/elite). This
// route never starts discovery, never charges credits, and never
// writes anything.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import { normalizePlan } from '@/lib/autopilot/service';
import { countryCatalog, searchCountryEntries } from '@/lib/autopilot/country-selection';

export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:read', async (user) => {
    try {
      const plan = normalizePlan(user.plan);
      const entitlement = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
      const catalog = countryCatalog();

      // Optional server-side search (?q=): narrows the country list via
      // the canonical search (name startsWith/contains, alias, or exact
      // ISO code). Worldwide is ALWAYS included — it is a selection
      // mode, not a searchable country.
      const q = request.nextUrl.searchParams.get('q');
      const countries =
        q && q.trim() ? searchCountryEntries(q) : catalog.countries;

      return NextResponse.json({
        worldwide: catalog.worldwide,
        countries,
        total: catalog.total,
        matched: countries.length,
        maxSelection: catalog.maxSelection,
        plan,
        entitlement: { allowed: entitlement.allowed },
      });
    } catch (error) {
      console.error('[AutopilotAPI] GET countries error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch country catalog' },
        { status: 500 }
      );
    }
  });
}, '/api/autopilot/countries');
