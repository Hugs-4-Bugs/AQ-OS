// ═══════════════════════════════════════════════════════════════════
// Phase 26 Extension — Parallel Multi-Model Execution
//
// Verifies the 4 core contract points:
//  1. Role-aware dedup (G5 fix) — parallel multi-angle slots are NOT collapsed
//  2. FALLBACK strategy (G7 fix) — try each spec in order, stop on first success
//  3. Parallel group in agent-continuation (G6 fix) — Promise.allSettled, NOT for..of
//  4. System agent strategies (G4 fix) — QUALIFICATION/OPPORTUNITY/REPLY_ANALYSIS
//     actually use parallel multi-angle
//
// Plus regression tests for the existing single/sequential/parallel paths
// to ensure none of the additive changes broke them.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ─── G5: Role-aware dedup ───────────────────────────────────────────

describe('Phase 26 Extension — G5: role-aware dedup', () => {
  it('buildModelCallSpecs dedup key includes role (not just provider|model)', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    // The dedup key MUST include role
    expect(src).toMatch(/const key = `\$\{spec\.provider \?\? ''\}\|\$\{spec\.model \?\? ''\}\|\$\{spec\.role \?\? ''\}`/);
  });

  it('computeInvocationKey signature includes role', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toContain('role?: string;');
    // And the key string includes role
    expect(src).toMatch(/params\.role \?\? 'no-role'/);
  });

  it('executeOneModelCall passes spec.role to computeInvocationKey', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/role: spec\.role,/);
  });

  it('LEAD_SCORING system agent still uses parallel with 4 distinct roles', () => {
    const src = readSrc('src/lib/ai/system-agents.ts');
    const scoringBlock = src.match(/systemKey: 'LEAD_SCORING'[\s\S]*?seedAsActive/);
    expect(scoringBlock).not.toBeNull();
    expect(scoringBlock![0]).toContain("strategy: 'parallel'");
    expect(scoringBlock![0]).toContain('fit_scorer');
    expect(scoringBlock![0]).toContain('engagement_scorer');
    expect(scoringBlock![0]).toContain('intent_scorer');
    expect(scoringBlock![0]).toContain('timing_scorer');
    expect(scoringBlock![0]).toContain('concurrency: 3');
  });
});

// ─── G7: FALLBACK strategy ──────────────────────────────────────────

describe('Phase 26 Extension — G7: FALLBACK strategy', () => {
  it('OrchestrationMode type includes FALLBACK', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/export type OrchestrationMode = 'SEQUENTIAL' \| 'PARALLEL' \| 'FALLBACK'/);
  });

  it('parseOrchestrationMode handles fallback', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/if \(raw === 'fallback'\) return 'FALLBACK'/);
  });

  it('ModelCallResult status includes SKIPPED_FALLBACK', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/status: 'COMPLETED' \| 'FAILED' \| 'REUSED' \| 'SKIPPED_CANCELLED' \| 'SKIPPED_FALLBACK'/);
  });

  it('orchestrateModelCalls has a FALLBACK branch that stops on first success', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/mode === 'FALLBACK'/);
    expect(src).toContain('SKIPPED_FALLBACK');
    expect(src).toContain('succeeded = true');
    // Verify the fallback proceeds on FAILED (not break)
    const fallbackBlock = src.match(/else if \(mode === 'FALLBACK'\) \{[\s\S]*?\n  \} else \{/);
    expect(fallbackBlock).not.toBeNull();
    expect(fallbackBlock![0]).toContain('succeeded = true');
    // The continue/loop behavior: subsequent slots skipped when succeeded
    expect(fallbackBlock![0]).toMatch(/if \(succeeded\) \{/);
  });

  it('summary includes fallbackSkipped count', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toContain('fallbackSkipped?: number;');
    expect(src).toContain('fallbackSkipped: fallbackSkipped.length');
  });

  it('disagreement detection skipped for FALLBACK mode', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    // Single-success-by-design mode should not trigger disagreement
    expect(src).toMatch(/completed\.length >= 2 && mode !== 'FALLBACK'/);
  });
});

// ─── G6: Parallel group in agent-continuation ──────────────────────

describe('Phase 26 Extension — G6: parallel group Promise.allSettled', () => {
  it('agent-continuation.ts has a parallel branch using Promise.all (NOT for..of)', () => {
    const src = readSrc('src/lib/ai/agent-continuation.ts');
    expect(src).toContain('isParallelGroup');
    expect(src).toContain('Promise.all(workers)');
    // Worker pool pattern (cursor + workers array) — bounded concurrency
    expect(src).toMatch(/const workers = Array\.from\(\{ length: Math\.min\(MAX_PARALLEL, tasks\.length\) \}/);
    expect(src).toContain('MAX_PARALLEL = 3');
  });

  it('parallel branch uses bounded concurrency (not unbounded Promise.all)', () => {
    const src = readSrc('src/lib/ai/agent-continuation.ts');
    // The parallel branch must NOT use Promise.all(tasks.map(...)) without a
    // concurrency cap — verify the worker pool pattern is present
    expect(src).toMatch(/queue\.shift\(\)/);
    expect(src).toMatch(/while \(queue\.length > 0\)/);
  });

  it('parallel branch isolates failures (workers never throw)', () => {
    const src = readSrc('src/lib/ai/agent-continuation.ts');
    // Each worker catches its own errors and pushes a result, never throws
    expect(src).toMatch(/results\.push\(\{ key, outcome: \{ error:/);
  });

  it('sequential path preserved for single-step groups', () => {
    const src = readSrc('src/lib/ai/agent-continuation.ts');
    // The sequential for...of loop must still exist (not all groups are parallel)
    expect(src).toContain('// SEQUENTIAL path — single-step group OR the common case');
    expect(src).toMatch(/for \(const key of groupKeys\.slice\(0, 3\)\) \{/);
  });
});

// ─── G4: System agent strategies ───────────────────────────────────

describe('Phase 26 Extension — G4: system agent strategies', () => {
  it('QUALIFICATION uses parallel BANT multi-angle', () => {
    const src = readSrc('src/lib/ai/system-agents.ts');
    const block = src.match(/systemKey: 'QUALIFICATION'[\s\S]*?seedAsActive/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("strategy: 'parallel'");
    expect(block![0]).toContain('budget_scorer');
    expect(block![0]).toContain('authority_scorer');
    expect(block![0]).toContain('need_scorer');
    expect(block![0]).toContain('timing_scorer');
  });

  it('OPPORTUNITY uses parallel multi-angle (size/fit/timing)', () => {
    const src = readSrc('src/lib/ai/system-agents.ts');
    const block = src.match(/systemKey: 'OPPORTUNITY'[\s\S]*?seedAsActive/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("strategy: 'parallel'");
    expect(block![0]).toContain('size_estimator');
    expect(block![0]).toContain('fit_assessor');
    expect(block![0]).toContain('timing_analyst');
  });

  it('REPLY_ANALYSIS uses parallel multi-angle (intent/key-points/next-action)', () => {
    const src = readSrc('src/lib/ai/system-agents.ts');
    const block = src.match(/systemKey: 'REPLY_ANALYSIS'[\s\S]*?seedAsActive/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("strategy: 'parallel'");
    expect(block![0]).toContain('intent_classifier');
    expect(block![0]).toContain('key_point_extractor');
    expect(block![0]).toContain('next_action_recommender');
  });

  it('RESEARCH sequential 2-stage is unbroken (researcher + summarizer)', () => {
    const src = readSrc('src/lib/ai/system-agents.ts');
    const block = src.match(/systemKey: 'RESEARCH'[\s\S]*?seedAsActive/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain("strategy: 'sequential'");
    expect(block![0]).toContain('researcher');
    expect(block![0]).toContain('summarizer');
  });
});

// ─── UI: CreateAgentModal strategy selector ────────────────────────

describe('Phase 26 Extension — UI: CreateAgentModal', () => {
  it('CreateAgentModal has strategy state + selector', () => {
    const src = readSrc('src/components/dashboard/agents-tab.tsx');
    expect(src).toMatch(/strategy.*useState.*'single' \| 'sequential' \| 'parallel' \| 'fallback'/);
    expect(src).toContain('Model Strategy (Phase 26 Extension)');
    expect(src).toContain('Single — one model handles the whole task');
    expect(src).toContain('Sequential — chain models');
    expect(src).toContain('Parallel — fan out multiple angles');
    expect(src).toContain('Fallback — try models in order');
  });

  it('CreateAgentModal has multi-model slot builder', () => {
    const src = readSrc('src/components/dashboard/agents-tab.tsx');
    expect(src).toContain('addParallelModel');
    expect(src).toContain('removeParallelModel');
    expect(src).toContain('Model Slots');
    expect(src).toContain('+ Add slot');
  });

  it('CreateAgentModal sends modelStrategy to /api/agents', () => {
    const src = readSrc('src/components/dashboard/agents-tab.tsx');
    expect(src).toMatch(/modelStrategy = strategy === 'single'/);
    expect(src).toMatch(/body: JSON\.stringify\(\{[\s\S]*?modelStrategy/);
  });

  it('concurrency slider shown only for parallel strategy', () => {
    const src = readSrc('src/components/dashboard/agents-tab.tsx');
    expect(src).toMatch(/strategy === 'parallel' && \(/);
    // The range input is split across lines; just verify the parts are present
    expect(src).toContain('type="range"');
    expect(src).toContain('min={1}');
    expect(src).toContain('max={4}');
    expect(src).toContain('setConcurrency');
  });
});

// ─── API: /api/agents accepts modelStrategy ─────────────────────────

describe('Phase 26 Extension — API: modelStrategy validation', () => {
  it('/api/agents POST validates strategy enum', () => {
    const src = readSrc('src/app/api/agents/route.ts');
    expect(src).toContain("body.modelStrategy");
    expect(src).toContain("['single', 'sequential', 'parallel', 'fallback'].includes(strategy)");
    expect(src).toContain('Invalid modelStrategy.strategy');
  });

  it('/api/agents POST validates models array shape', () => {
    const src = readSrc('src/app/api/agents/route.ts');
    expect(src).toMatch(/Array\.isArray\(ms\.models\)/);
    expect(src).toContain('typeof m.provider === \'string\'');
    expect(src).toContain('typeof m.model === \'string\'');
    expect(src).toContain('typeof m.role === \'string\'');
  });

  it('/api/agents POST validates concurrency range', () => {
    const src = readSrc('src/app/api/agents/route.ts');
    expect(src).toMatch(/ms\.concurrency >= 1 && ms\.concurrency <= 4/);
  });

  it('/api/agents POST passes modelStrategy to createAgent', () => {
    const src = readSrc('src/app/api/agents/route.ts');
    expect(src).toContain('modelStrategy: modelStrategy as never');
  });
});

// ─── Regression: orchestrator core unchanged for SEQUENTIAL/PARALLEL ──

describe('Phase 26 Extension — regression: orchestrator paths intact', () => {
  it('SEQUENTIAL path still chains predecessor outputs', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/mode === 'SEQUENTIAL'/);
    expect(src).toContain('chainPrompt');
    expect(src).toContain('includePreviousOutput');
    // completedSoFar tracks output to feed into next slot
    expect(src).toContain('completedSoFar.push(results[i])');
  });

  it('PARALLEL path still uses bounded worker pool (Promise.all + cursor)', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toContain('PARALLEL — bounded worker pool over the slot queue');
    expect(src).toContain('cursor++');
    expect(src).toContain('await Promise.all(workers)');
    // Concurrency cap
    expect(src).toMatch(/Math\.min\(\s*Math\.max\(params\.concurrencyLimit \?\? DEFAULT_CONCURRENCY, 1\)/);
  });

  it('MAX_CONCURRENCY unchanged at 4 (hard cap)', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toMatch(/MAX_CONCURRENCY\s*=\s*4/);
  });

  it('disagreement detection still uses Jaccard + 0.30 threshold', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toContain('DISAGREEMENT_THRESHOLD = 0.30');
    expect(src).toContain('jaccardSimilarity');
    expect(src).toContain('minSimilarity');
  });

  it('idempotency: findInvocationByKey still consulted before invocation', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    expect(src).toContain('findInvocationByKey(invocationKey)');
    expect(src).toContain("status: 'REUSED'");
    expect(src).toContain('fromCache: true');
  });

  it('failed slot does NOT abort parallel/sequential operation', () => {
    const src = readSrc('src/lib/ai/orchestrator.ts');
    // aggregate() sets success = completed.length > 0 (partial success preserved)
    expect(src).toContain('success: completed.length > 0');
  });
});

// ─── No secrets in source ──────────────────────────────────────────

describe('Phase 26 Extension — secret safety', () => {
  it('no credential values in modified source files', () => {
    const files = [
      'src/lib/ai/orchestrator.ts',
      'src/lib/ai/agent-continuation.ts',
      'src/lib/ai/system-agents.ts',
      'src/components/dashboard/agents-tab.tsx',
      'src/app/api/agents/route.ts',
    ];
    for (const f of files) {
      const src = readSrc(f);
      expect(src).not.toMatch(/gmww|GOCSPX|fisi rpdl/i);
    }
  });
});
