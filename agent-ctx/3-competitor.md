# Task 3-competitor: Advanced Competitor Intelligence Functions + API Routes

## Work Log

- Read worklog.md and project context (Phase 1-7 history, existing competitor service structure)
- Read existing competitor-intelligence-service.ts (~2449 lines): identified CRUD, scanning, analysis, comparison, AI insights, opportunities, snapshot, change detection, trend, and discovery sections
- Read Prisma schema: CompetitorData (raw: websiteHtml, seoMetadata, socialProfiles, techStackData, etc.), CompetitorAnalysis (processed: scores, JSON fields), CompetitorSnapshot (historical: competitorId, snapshotType, rawData, etc.)
- Read auth-middleware.ts: withAuth pattern confirmed (NextRequest, handler with AuthUser)

### New Functions Added to competitor-intelligence-service.ts (appended after existing code):

#### Pricing Intelligence
- `detectPriceChanges(competitorId)` — Compares latest snapshot vs previous snapshots + current CompetitorAnalysis. Detects changes in pricingModel, tiers, hasPricingPage, currency with significance ratings
- `getHistoricalPricing(competitorId)` — Builds timeline of pricing data from all CompetitorSnapshot records + current state, sorted chronologically

#### SEO Intelligence
- `extractKeywords(competitorId)` — Extracts keywords from seoMetadata (title, description, keywords, ogTags) + historical snapshots. Returns top 30 keywords with frequency and source tracking. Uses weighted extraction (meta keywords 3x, title 2x, description 1.5x, og tags 1x)
- `getSEORanking(competitorId)` — Computes SEO score 0-100 from 5 dimensions: metadata completeness (0-25), keyword density (0-20), OG tag presence (0-20), heading structure (0-15), lighthouse contribution (0-20)
- `getMetadataEvolution(competitorId)` — Tracks how title/description/keywords/ogTagCount changed over time across snapshots + current data

#### Website Intelligence
- `detectLayoutChanges(competitorId)` — Extracts HTML5 sections (header, nav, main, footer, section, article, aside, div with semantic classes) from current HTML vs snapshots. Returns added/removed sections with significance
- `detectCTAChanges(competitorId)` — Parses HTML for CTA patterns (buttons, action links, submit inputs). Compares across snapshots, returns added/removed CTAs
- `detectContentChanges(competitorId)` — Measures text length, word count, heading count, image count, link count across snapshots. Returns deltas between data points

#### Social Intelligence
- `trackSocialActivity(competitorId)` — Analyzes socialProfiles JSON for 5 platforms (Twitter, LinkedIn, Facebook, Instagram, YouTube). Computes activity levels from follower counts and overall activity score
- `getPostingFrequency(competitorId)` — Estimates posting frequency from follower growth between snapshots (medium confidence) or follower count heuristics (low confidence). Platform-specific multipliers

#### Reviews Intelligence
- `analyzeReviewsSentiment(competitorId)` — Parses reviewsData for sentiment. Computes overall score -100 to +100 based on rating, sentiment label, and praises/complaints ratio. Returns 5-level label
- `getReviewsTrend(competitorId)` — Tracks reviews rating/count/sentiment over time from snapshots + current data

#### Shared Helpers Added
- `parseJsonSafe(jsonStr, fallback)` — Safe JSON parse with fallback
- `extractWordsFromText(text, source, keywordMap, weight)` — Extracts keywords (1-3 words) with stop word filtering, weighted frequency, and bigram support

### New API Routes Created

1. `/api/competitors/[id]/pricing/route.ts` — GET: priceChanges + historicalPricing
2. `/api/competitors/[id]/seo/route.ts` — GET: keywords + seoRanking + metadataEvolution
3. `/api/competitors/[id]/website/route.ts` — GET: layoutChanges + ctaChanges + contentChanges
4. `/api/competitors/[id]/social/route.ts` — GET: socialActivity + overallActivityScore + postingFrequency
5. `/api/competitors/[id]/reviews/route.ts` — GET: sentiment + reviewsTrend

All routes use `withAuth` from `@/lib/auth-middleware` and `params: Promise<{ id: string }>` (Next.js 16 async params).

### Lint & Dev Server
- Lint: 0 new errors (all 10 errors are pre-existing in use-analytics-realtime.ts)
- Dev server: running normally, no compilation errors
