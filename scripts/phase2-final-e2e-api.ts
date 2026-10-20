// Phase 2 FINAL clean-slate 70-target E2E — driven through the ACTUAL
// UI API path: POST /api/leads/discover → poll GET /api/leads/discover/status/[jobId]
// (exactly what the Discover tab does). One discovery action; internal
// query fan-out is the provider strategy. Run:
//   bun scripts/phase2-final-e2e-api.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000';
const TOKEN = readFileSync('.test-tmp/qa-cookie.txt', 'utf8').trim();
const COOKIE = `access_token=${TOKEN}`;

// FRESH niche/location: QA user has ZERO existing leads for real-estate
// agents in Hyderabad (verified via DB query before this run).
const BODY = {
  niche: 'real estate agents',
  city: 'Hyderabad',
  country: 'India',
  source: 'ai_search',
  maxResults: 70,
};

async function main() {
  mkdirSync('.test-tmp', { recursive: true });

  // Credits BEFORE (via the app's own API contract, same source of truth)
  const beforeLeads = await fetch(`${BASE}/api/leads?limit=1`, { headers: { Cookie: COOKIE } });
  const beforeLeadsJson = await beforeLeads.json() as { pagination?: { total?: number } };
  console.log('[E2E] leads list API total BEFORE:', beforeLeadsJson.pagination?.total, '(HTTP', beforeLeads.status + ')');

  console.log('[E2E] POST /api/leads/discover', JSON.stringify(BODY));
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/leads/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(BODY),
  });
  const json = await res.json() as { jobId?: string; status?: string; message?: string; error?: string };
  console.log('[E2E] HTTP', res.status, '→', JSON.stringify(json));
  if (res.status !== 202 || !json.jobId) {
    console.error('[E2E] FAILED to start job');
    process.exit(1);
  }
  writeFileSync('.test-tmp/final-job-id.txt', json.jobId);
  const jobId = json.jobId;

  // Poll the SAME status endpoint the UI polls
  let last = '';
  const deadline = Date.now() + 18 * 60 * 1000; // 18 min cap
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));
    const st = await fetch(`${BASE}/api/leads/discover/status/${jobId}`, { headers: { Cookie: COOKIE } });
    const sj = await st.json() as { job?: { status?: string; totalFound?: number; imported?: number; duplicates?: number; failed?: number; error?: string } };
    const j = sj.job || {};
    const line = `status=${j.status} found=${j.totalFound ?? 0} imported=${j.imported ?? 0} dups=${j.duplicates ?? 0} failed=${j.failed ?? 0}${j.error ? ' err=' + j.error : ''}`;
    if (line !== last) { console.log(`[E2E +${((Date.now() - t0) / 1000).toFixed(0)}s poll] ${line}`); last = line; }
    if (j.status === 'completed' || j.status === 'failed' || j.status === 'partial') {
      console.log(`\n[E2E] JOB ${j.status.toUpperCase()} in ${((Date.now() - t0) / 1000).toFixed(0)}s — final: ${line}`);
      process.exit(j.status === 'failed' ? 1 : 0);
    }
  }
  console.error('[E2E] TIMEOUT waiting for job completion');
  process.exit(1);
}

main().catch((e) => { console.error('[E2E] FAILED:', e instanceof Error ? e.message : e); process.exit(1); });
