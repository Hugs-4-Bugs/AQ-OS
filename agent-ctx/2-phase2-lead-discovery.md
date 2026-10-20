# Phase 2 — Lead Discovery Volume Fix (Checkpoint)

Date: 2026-10-19 · Branch: `main` · Base: `075a639cd` (Phase 1 checkpoint) · Status: **DONE (runtime provider verified live)**

## 1. Problem

A single discovery action returned only ~20 leads regardless of the requested target
(verified live: pre-fix jobs at targets 20–70 all landed at totalFound 18–20).

## 2. Root Cause (traced in source + verified against the live provider)

Four compounding bottlenecks in `src/lib/lead-discovery-service.ts`:

1. **Flat query cap** — `buildSearchQueries()` returned `queries.slice(0, 10)` no matter
   the target. The `web_search` provider ignores `start`/`page` offsets and returns
   ~7–10 results per query, so 10 queries ≈ 20–30 unique leads, hard ceiling.
2. **Shrinking `num`** — `searchOnce(query, Math.min(20, maxResults - found))` truncated
   the provider request to the remaining budget (verified: `num=3` → exactly 3 results),
   starving last-mile queries of raw material.
3. **Raw-count stop condition** — the loop stopped at raw extractions, not UNIQUE
   identities; cross-query overlap (~25% live-observed) landed jobs 20–30% under target.
4. **"all" mode starvation** — `perSourceLimit = maxResults/7` gave a 70-lead "all" job
   an ai_search target of 10 (only ai_search works without provider API keys).

## 3. Fix (minimal, additive — one file + its test)

`src/lib/lead-discovery-service.ts` (+199/−15):

- **`searchQueryBudget(maxResults)`** — queries scale with target: floor 10 (unchanged
  behaviour for ≤30), +1 query per 3 leads above 30, hard cap 28
  (`MAX_SEARCH_QUERIES`, rate-limit-respecting). Exported for tests.
- **4 additional deterministic phrasings** (`top 10 …`, `… specialists`, `leading …
  companies`, `affordable …`) — only run when the budget exceeds the base set, so
  small targets keep the exact previous query plan.
- **Locality fan-out** — one paced LLM call lists well-known sub-areas of the location;
  each becomes an extra `<niche> in <area>, <location>` query within budget. Public
  geographic facts used only as search phrasings — leads still come exclusively from
  real web_search results; failure of the call is non-fatal (deterministic queries
  remain). Skipped entirely on worldwide (location-free) runs.
- **`searchOnce` always requests the full ~20-result page** (`num: 20`); output volume
  is bounded by per-query extraction cap + unique-count stop instead.
- **Unique-identity counting** — cross-query duplicates (same website / email /
  normalized business name) are withheld before pushing; `discoveredLeads.length` ==
  unique-so-far, making loop budget, extraction cap, and target agree.
- **"all" mode per-source quota** — each source now searches the FULL target; the
  merged, deduplicated set is bounded to exactly `maxResults` (no over-delivery, no
  overcharging).

Preserved unchanged: credits contract (1 credit/imported lead, idempotent per
job+position, refund on failed import), plan entitlements, provider attribution,
provenance (`discoveredVia` = query text), dedup vs existing user leads, persistence,
verification statuses.

`tests/unit/discovery-volume-persistence.test.ts` (+201): query-budget scaling,
locality fan-out (budget-covered, degenerate-payload, worldwide, small-target cases),
"all"-mode lone-source target, and updated volume regression.

## 4. Runtime verification (LIVE provider — real web_search + real LLM extraction)

| Job (niche/city) | Target | totalFound | imported | dups | Notes |
|---|---|---|---|---|---|
| gyms / Pune | 20 | 20 | 19 | 1 | service path |
| salons / Delhi | 40 | 34 | 29 | 5 | service path |
| restaurants / Bangalore | — | 58 | 53 | 5 | service path |
| dentists / Mumbai | 70 | 70 | 54 | 16 | service path |
| hotels / Jaipur | 70 | 70 | 67 | 3 | service path |
| **real estate agents / Hyderabad** | **70** | **70** | **68** | **2** | **CLEAN-SLATE, full UI/API path** |

### Final clean-slate E2E (fresh niche+city, QA pro user, ONE discovery action)

- `POST /api/leads/discover` `{niche:"real estate agents", city:"Hyderabad",
  country:"India", source:"ai_search", maxResults:70}` → HTTP **202**, jobId
  `cmvepxezr0001p1fd9tvtexs2`; internally executed budget 24 queries (10 base + 4
  extra phrasings + 8 locality fan-out + 2 size-targeted), live log shows per-query
  results, cross-query dedup withholding, unique-count progress to 70/70.
- `GET /api/leads/discover/status/<jobId>` (the endpoint the UI polls) → `completed`,
  `totalFound: 70, imported: 68, duplicates: 2, failed: 0`, `resultData` length 70,
  70 unique normalized names, 0 missing provenance.
- **Persistence**: 68 new Lead rows in the canonical DB within the job window
  (= imported exactly); `/api/leads?limit=1` pagination total 302 → **370**.
- **Uniqueness**: 0 duplicates across DB ids (68/68), normalized URLs (16/16), domain
  identities (16/16), normalized business names (68/68), emails (2/2).
- **Provenance**: 68/68 DB leads carry `discoveredVia` (9 distinct query phrasings) +
  `source: ai_search`; 68/68 city=Hyderabad, country=India.
- **Credits**: 78 → 10 = **68 consumed = 68 imported × 1 credit** (exact contract);
  CreditsLedger shows 68 idempotent entries
  `lead_discovery_idempotent_<jobId>:lead:0..67`, each −1, balance 77→10,
  referenceId=jobId. No user/subscription data touched by the job.
- **UI display (browser, real DOM)**: dashboard renders "370 Total Leads" and
  "10 credits left"; Leads table shows "370 leads found" with the new Hyderabad
  real-estate businesses (stage Discovered). Screenshots:
  `download/workspace-verification/phase2-leads-display.png`,
  `phase2-leads-table-hyderabad.png`.
- No fabricated leads: every imported lead originates from a real provider search
  result URL; provider exhaustion is reported honestly (loop simply ends).

## 5. Regression tests

- `tests/unit/discovery-volume-persistence.test.ts` — **20/20 PASS**
- Adjacent: discovery-hard-criteria 44, discovery-context (integration) 11,
  lead-flow (e2e) 14, leads-metric-filters 10, lead-patch-add-to-pipeline 7,
  leads-stats-reply-counts 2 — **88/88 PASS**
- Full suite (70 files, chunked for sandbox memory): **1361 passed / 46 failed**;
  all 46 failures are in 8 files with NO import path to lead-discovery-service, and
  **proven pre-existing**: re-running those 8 files with the baseline (HEAD) version
  of lead-discovery-service.ts produces the identical 46 failures (swap-proof with
  sha256-verified restoration of the Phase 2 file). Zero new failures introduced.

## 6. Database safety (canonical `db/custom.db`)

- Before final E2E: 115 tables / 42 users / 413 leads / 39 subscriptions / 30 jobs.
- After: 115 tables / 43 users / 481 leads / 40 subscriptions / 31 jobs.
- Deltas: +68 leads & +1 job & +68 ledger rows & credits 78→10 = intended QA
  discovery data only. +1 user & +1 subscription = disposable `test_*@acq-test.com`
  row created by the repo's own vitest full-suite run (pre-existing test convention;
  identical rows exist from prior suite runs). No resets, no truncation, no deletes,
  no destructive migrations.

## 7. Known limitations (honest)

- Full-suite single-process vitest run OOM-dies in the 4 GB sandbox (pre-existing;
  worked around by chunked batches; same pattern as prior sessions' tsc OOM).
- `db/custom.db` runtime churn (QA discovery data) is intentionally NOT part of the
  commit; the canonical DB file at HEAD remains the pre-E2E state, and the workspace
  copy carries the verification data.

## 8. Git

- Commit (forward, no force-push, no history rewrite): on top of `075a639cd`
  — `fix: expand lead discovery pagination and batching`
- Contents: the 2 source/test files, `.gitignore` (defensively ignores
  `.test-tmp/` session cookies + `tool-results/`), 8 phase2 engineering scripts,
  2 verification screenshots, this document, worklog.
- GitHub push: BLOCKED — credentials unavailable in sandbox (no invention of
  credentials; durable checkpoint lives in `/home/sync/repo.tar`).
