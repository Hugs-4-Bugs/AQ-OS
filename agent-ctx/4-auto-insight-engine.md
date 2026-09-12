# Task 4 — Auto Insight Engine

## Summary
Created the Auto Insight Engine at `/src/lib/auto-insight-engine.ts` and two API routes for managing insights.

## Files Created

### 1. `/src/lib/auto-insight-engine.ts`
Complete implementation with 8 insight generators + 4 management functions:

- **generateLeadTrendInsights(userId)** — 5 sub-insights: weekly discovery rate, weekly conversion rate, monthly discovery rate, pipeline engagement, average lead quality
- **generateAITrendInsights(userId)** — 3 sub-insights: credit consumption trend, top AI action usage, AI chat sessions
- **generateBillingTrendInsights(userId)** — 4 sub-insights: MRR trend, credit usage %, trial expiry, subscription cancellation
- **generateWorkflowTrendInsights(userId)** — 3 sub-insights: failure rate trend, execution volume, active vs paused workflows
- **generateAnomalyInsights(userId)** — Converts active AnalyticsAnomaly records into insights
- **generateOpportunityInsights(userId)** — 5 sub-insights: uncontacted high-score leads, analyzed leads, draft sequences, underutilized channels, stale replied leads
- **generateRiskInsights(userId)** — 5 sub-insights: credit depletion forecast, stale leads, expiring subscriptions, stuck negotiation, high bounce rate
- **generateCompetitorInsights(userId)** — 4 sub-insights: high-threat competitors, opportunity scores, SEO score changes, multi-weakness competitors
- **generateAllInsights(userId)** — Runs all 8 generators with error handling
- **getInsights(userId, category?, insightType?, isRead?)** — Filtered retrieval
- **markInsightRead(insightId, userId)** — Mark as read
- **dismissInsight(insightId, userId)** — Delete insight
- **cleanupExpiredInsights(userId)** — Remove expired

### 2. `/src/app/api/analytics/insights/route.ts`
- GET: Returns insights with filters + summary stats
- POST: Runs generation with optional generator selection

### 3. `/src/app/api/analytics/insights/[id]/route.ts`
- PATCH: Mark read or dismiss by ID

## Key Design Decisions
- All insights generated from REAL database queries — NO hardcoded text
- Deduplication: same userId + category + insightType + title within 24h prevents duplicates
- validUntil defaults to 7 days from now
- Minimum change thresholds (5-20% depending on metric) to avoid noise
- Action suggestions are context-specific per insight type
- Impact levels computed from change magnitude
