# Task 2: Predictive Analytics Engine

## Agent: Backend Agent
## Date: 2026-05-19

## Task
Create the Predictive Analytics engine at `/home/z/my-project/src/lib/predictive-analytics-engine.ts` that computes REAL predictions from REAL database data ONLY.

## Work Log

- Read worklog.md and understood project context (AcquisitionOS with 53+ Prisma models, existing analytics engine, billing/subscription/lead/workflow services)
- Verified Prisma schema already has `AnalyticsPrediction` model with all required fields (id, userId, category, predictionType, targetEntityId, predictedValue, confidence, modelVersion, inputData, predictionHorizon, actualValue, actualizedAt, expiresAt, createdAt, updatedAt)
- Verified db.ts uses PrismaClient with version-based cache invalidation
- Created complete predictive-analytics-engine.ts with 16 exported functions

### Implemented Functions

**Lead Predictions (4 functions):**
1. `predictConversionProbability(userId, leadId)` — Weighted average of lead scores (reply 0.25, conversion 0.35, urgency 0.15, revenue 0.25) normalized to 0-1, adjusted by stage progression factor (0-1), contact recency bonus, email status factor, activity count boost, and historical score boost
2. `predictCloseProbability(userId, leadId)` — For leads in negotiation+ stages, combines stage weight (0.1-1.0), score component, email status factor, contact recency, and outreach engagement rate
3. `predictExpectedRevenue(userId, dateRange?)` — Iterates all active leads not in closed_lost, estimates revenue per lead from estimatedRevenue tier × revenuePotentialScore multiplier, multiplied by close probability (conversion or close depending on stage)
4. `predictLeadVelocity(userId, days?)` — Groups lead creation by day over 2×lookback window, computes daily average and linear regression trend, predicts future velocity as (avg + trend) × days

**AI Predictions (3 functions):**
5. `predictFutureUsage(userId, days?)` — Groups AI credit deductions by day over 28-day lookback, computes recent 14-day average, linear trend, and EMA, blends to predict daily usage, multiplies by days
6. `predictFutureCredits(userId)` — Computes burn rate from last 14 days of credit deductions, calculates daysRemaining = currentBalance / avgDailyBurn
7. `predictProviderCostForecast(userId, days?)` — Uses plan-based cost-per-credit estimates, applies same daily usage prediction as futureUsage, multiplies by cost per credit

**Billing Predictions (3 functions):**
8. `predictChurn(userId)` — Combines subscription status factor (0.15-0.9), credit usage decline factor (0.1-0.9), login recency factor (0.05-0.9), trial expiry factor (0.2-0.9), and credit purchase factor (0.1-0.4)
9. `predictUpgradeProbability(userId)` — Uses credit utilization vs monthly allocation, recent addon purchases, feature usage breadth, usage tracking limit proximity, and plan upgrade path
10. `predictRenewalRisk(userId)` — Combines subscription status/cancelAtPeriodEnd, subscription age, payment failure history, usage decline trend, and downgrade events

**Workflow Predictions (3 functions):**
11. `predictFailureProbability(userId, workflowId)` — Blends recent 14-day failure rate (60%) with historical workflow stats (30%) and failure trend (10%)
12. `predictRetryProbability(userId, workflowId)` — Blends recent retry rate (65%) with historical retry rate (35%), respects maxRetries=0
13. `predictThroughput(userId, hours?)` — Computes recent 24h hourly throughput, 7-day daily average/trend, queued execution demand, blends for hourly prediction × hours

**Bulk & Utility (3 functions):**
14. `generateAllPredictions(userId)` — Runs all prediction categories: per-lead predictions for top 20 advanced-stage leads, pipeline-level revenue/velocity, AI usage/credits/cost, billing churn/upgrade/renewal, per-workflow failure/retry for top 20 active workflows, overall throughput
15. `getPredictions(userId, category?, predictionType?)` — Retrieves stored predictions with optional category and type filtering
16. `actualizePrediction(predictionId, actualValue)` — Updates prediction with actual outcome for accuracy tracking

**Bonus Utility Functions:**
- `getModelAccuracy(userId, category?)` — Computes accuracy metrics (avg absolute error, avg percent error) for actualized predictions by type
- `cleanupExpiredPredictions(userId?)` — Removes expired un-actualized predictions

### Technical Details
- All functions query REAL data from the database using `import { db } from '@/lib/db'`
- Each function stores results in the AnalyticsPrediction table via `storePrediction()` helper
- `storePrediction()` intelligently updates existing unexpired predictions instead of creating duplicates
- Statistical methods: weighted averages, linear regression (computeLinearTrend), exponential moving average (EMA), coefficient of variation
- Confidence scores computed from data richness (number of available data points), not hardcoded
- Model version defaults to 'v1'
- Predictions auto-expire after 7 days by default
- All exported TypeScript types: PredictionCategory, PredictionType, PredictionResult, PredictionInput, DateRange

## Files Created
- `/home/z/my-project/src/lib/predictive-analytics-engine.ts` (complete, ~850 lines)

## Verification
- Prisma schema already in sync (AnalyticsPrediction model existed)
- `bun run db:push` — database already in sync
- `bun run lint` — 0 errors in our file (pre-existing errors only in other files)
- Dev server running normally
