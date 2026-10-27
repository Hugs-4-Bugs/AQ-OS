// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — System Agents API (Workstream C — §3 + §12)
//
// GET /api/agents/system
//   Returns the 13 canonical system agent DEFINITIONS (the catalog).
//   These are the templates — not the user's instances. The user's
//   instances are returned by GET /api/agents (filtered by
//   classification='system' when applicable).
//
// GET /api/agents/system?includeInstances=1
//   Returns the 13 system agent definitions PLUS the user's instances
//   for each (auto-seeded if not yet present).
//
// POST /api/agents/system
//   Body: { systemKey: 'DISCOVERY'|'RESEARCH'|... , action: 'activate'|'deactivate'|'instantiate' }
//   - activate: set the user's instance of systemKey to status='active'
//   - deactivate: set the user's instance of systemKey to status='paused'
//   - instantiate: clone the system agent as a custom agent (returns the new custom agent)
//
// Per spec §12: UI uses this endpoint to populate the system agents
// section without making the user manually create them.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import {
  listSystemAgentDefinitions,
  ensureSystemAgentsSeeded,
} from '@/lib/ai/system-agents';
import {
  getSystemAgentByKey,
  updateAgent,
  cloneSystemAgentAsCustom,
} from '@/lib/ai/agent-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const url = new URL(request.url);
    const includeInstances = url.searchParams.get('includeInstances') === '1';

    const definitions = listSystemAgentDefinitions();

    if (!includeInstances) {
      return NextResponse.json({
        systemAgents: definitions,
        count: definitions.length,
      });
    }

    // Auto-seed the user's instances (idempotent)
    const seedResult = await ensureSystemAgentsSeeded(user.id);
    if (seedResult.errors.length > 0) {
      console.warn('[system-agents API] seeding errors:', seedResult.errors);
    }

    // Fetch the user's instances for each systemKey
    const instances = await Promise.all(
      definitions.map(async (def) => {
        const inst = await getSystemAgentByKey(user.id, def.systemKey);
        return {
          systemKey: def.systemKey,
          definition: def,
          instance: inst ? {
            id: inst.id,
            status: inst.status,
            provider: inst.provider,
            model: inst.model,
            modelStrategy: inst.modelStrategy,
            memoryScopes: inst.memoryScopes,
            executionState: inst.executionState,
            approvalPolicy: inst.approvalPolicy,
            toolPermissions: inst.toolPermissions,
            totalRuns: inst.totalRuns,
            totalTokensUsed: inst.totalTokensUsed,
            lastRunAt: inst.lastRunAt,
            lastError: inst.lastError,
          } : null,
        };
      })
    );

    return NextResponse.json({
      systemAgents: instances,
      count: instances.length,
      seeded: seedResult.seeded,
      alreadyExisted: seedResult.alreadyExisted,
    });
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const systemKey = body.systemKey as string | undefined;
    const action = (body.action as string) || 'activate';

    if (!systemKey) {
      return NextResponse.json({ error: 'systemKey is required' }, { status: 400 });
    }

    // Ensure the user has an instance of this system agent (auto-seed)
    const agent = await getSystemAgentByKey(user.id, systemKey as never);
    if (!agent) {
      return NextResponse.json({
        error: `System agent "${systemKey}" not found and could not be seeded`,
      }, { status: 404 });
    }

    if (action === 'activate') {
      const updated = await updateAgent(user.id, agent.id, { status: 'active' });
      return NextResponse.json({ systemKey, action, agent: updated });
    }

    if (action === 'deactivate') {
      const updated = await updateAgent(user.id, agent.id, { status: 'paused' });
      return NextResponse.json({ systemKey, action, agent: updated });
    }

    if (action === 'instantiate') {
      // Clone as a custom agent — user can freely modify
      const customName = body.customName as string | undefined;
      const cloned = await cloneSystemAgentAsCustom(user.id, systemKey as never, customName);
      return NextResponse.json({ systemKey, action, agent: cloned });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  });
}
