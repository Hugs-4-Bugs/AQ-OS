// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Autopilot Custom-Niche API (Phase 20)
// GET  /api/autopilot/niches — the authenticated user's saved custom
//                             niches (predefined niches come from the
//                             shared NICHE_OPTIONS vocabulary the UI
//                             already renders — not from this route).
// POST /api/autopilot/niches — save a custom niche (duplicate-safe).
//
// All queries and mutations are user-scoped in the canonical niche
// service (src/lib/niches.ts) — this route never touches the DB
// directly and never trusts frontend niche IDs or names.
//
// Entitlement mirrors the other Autopilot routes: free/starter receive
// 200 with an empty list + entitlement.allowed=false on GET and 403
// PLAN_REQUIRED on POST (no row is ever created). Pro/elite manage
// their own saved custom niches. This route never starts discovery,
// creates Autopilot configurations, or charges credits.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withMonitoring } from '@/lib/observability/middleware';
import { withDualAuthPermission } from '@/lib/auth-middleware';
import { checkPlanEntitlement } from '@/lib/entitlement-middleware';
import { createCustomNiche, listCustomNiches } from '@/lib/niches';
import { normalizePlan } from '@/lib/autopilot/service';

export const GET = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:read', async (user) => {
    try {
      const plan = normalizePlan(user.plan);
      const entitlement = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
      const niches = entitlement.allowed ? await listCustomNiches(user.id) : [];
      return NextResponse.json({
        niches,
        total: niches.length,
        plan,
        entitlement: { allowed: entitlement.allowed },
      });
    } catch (error) {
      console.error('[AutopilotAPI] GET niches error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch custom niches' },
        { status: 500 }
      );
    }
  });
}, '/api/autopilot/niches');

export const POST = withMonitoring(async (request: NextRequest) => {
  return withDualAuthPermission(request, 'pipeline:write', async (user) => {
    try {
      // ── Server-side entitlement: free/starter are rejected BEFORE any
      // row is created (Autopilot is a pro/elite feature). ──
      const entitlementCheck = await checkPlanEntitlement(user.id, user.plan, 'autopilot_access');
      if (!entitlementCheck.allowed) return entitlementCheck.response!;

      const body = await request.json().catch(() => ({}) as Record<string, unknown>);
      const result = await createCustomNiche(user.id, body.name);
      if (!result.ok) {
        const status = result.code === 'VALIDATION' ? 400 : 409;
        return NextResponse.json(
          { error: result.error, code: result.code },
          { status }
        );
      }
      return NextResponse.json(result.niche, { status: 201 });
    } catch (error) {
      console.error('[AutopilotAPI] POST niches error:', error);
      return NextResponse.json(
        { error: 'Failed to save custom niche' },
        { status: 500 }
      );
    }
  });
}, '/api/autopilot/niches');
