# Task 3: Autonomous Outreach Engine

**Agent**: Main Agent  
**File**: `/src/lib/autonomous-outreach-engine.ts`

## Work Log

- Read worklog.md to understand previous work context
- Read Prisma schema to understand all models: Lead, LeadAnalysis, OutreachSequence, OutreachMessage, AcquisitionCampaign, LeadActivity, DiscoveryJob, EmailAccount, FollowUpReminder, etc.
- Read existing service files:
  - `lead-discovery-service.ts` — `startDiscoveryJob`, `getDiscoveryJobStatus` signatures and return types
  - `gmail-delivery-service.ts` — `sendEmail` signature (takes emailAccountId + SendEmailParams)
  - `credit-service.ts` — `deductCredits`, `checkCreditSufficiency`, `refundCredits` signatures
  - `ai/outreach-generator.ts` — `generateOutreach` signature and return types
  - `ai/ai-provider.ts` — ZAI SDK usage patterns (`ZAI.create()`, `zai.chat.completions.create()`, `zai.functions.invoke()`)
  - `pipeline-service.ts` — Pipeline stage ordering and `moveLeadToStage`

- Created `/src/lib/autonomous-outreach-engine.ts` with all 6 required functions:

### 1. `startAutonomousCampaign(userId, params)`
- Validates required params (niche, country)
- Limits concurrent campaigns to 3
- Estimates credits needed and checks sufficiency
- Creates AcquisitionCampaign record with all relevant fields
- Kicks off `processAutonomousCampaign` in background (non-blocking)
- Returns campaignId immediately

### 2. `processAutonomousCampaign(campaignId, userId, params)` — 6-step pipeline
- **Step 1**: Discover leads using `startDiscoveryJob` with proper params mapping
- **Step 2**: Poll for discovery completion every 2s, max 60s timeout
- **Step 3**: For each discovered lead, run `researchCompany` (if autoResearch enabled)
- **Step 4**: Generate personalized outreach using `generateOutreach` from existing AI system
- **Step 5**: If autoOutreach=true AND user has active Gmail account, send emails via `sendEmail` from gmail-delivery-service.ts
- **Step 6**: Create FollowUpReminder records for reply monitoring
- Updates campaign status at each step (parsing → discovering → analyzing → generating → sending → completed)
- Graceful error handling: continues with next lead on individual failures

### 3. `researchCompany(leadId, userId)` — Deep company research
- Phase A: Uses `zai.functions.invoke('web_search')` to find company info
- Phase B: Uses `zai.functions.invoke('page_reader')` to read website content
- Phase C: Uses `zai.chat.completions.create()` LLM to analyze data and produce:
  - Business model analysis, tech stack, SEO/website quality
  - Competitor comparison, pain points, opportunities
  - Recommended outreach angle, estimated deal size, urgency level
- Phase D: Stores results in LeadAnalysis table (upsert with version increment)
- Phase E: Updates Lead record (techStack, websiteQuality, stage → 'analyzed', etc.)
- Logs LeadActivity for the research event
- Credit cost: 3 credits with refund on AI failure

### 4. `classifyReplyIntent(messageContent, leadContext)` — Reply intelligence
- Quick-path pattern matching for obvious intents (unsubscribe, spam, out-of-office) at 95%+ confidence
- AI classification using ZAI SDK for ambiguous replies
- Classifies into 13 intent categories as specified
- Returns `{ intent, confidence, suggestedAction, suggestedResponse, shouldAutoRespond }`
- Bonus: `classifyReplyAndAct()` full-featured version that:
  - Deducts 1 credit
  - Auto-moves leads to 'interested' stage for positive intents
  - Marks leads as do-not-contact for negative intents (unsubscribe, spam_complaint)
  - Updates lead emailStatus and logs LeadActivity

### 5. `autoMovePipelineStage(leadId, userId, trigger)` — Auto pipeline movement
- Rule-based stage progression with trigger-to-stage mapping
- Pipeline: discovered → contacted → replied → interested → meeting_booked → proposal_sent → negotiation → won
- AI validation for significant jumps (skipping >2 stages)
- Deducts 1 credit (theoretical 0.5, rounded up for integer credit system)
- Proceeds with move even if credits insufficient (core feature)
- Logs to LeadActivity table with metadata

### 6. `getCampaignStatus(campaignId, userId)` — Campaign status with progress
- Returns CampaignStatus interface with phase, counts, timestamps
- Aggregates real-time stats from Lead table (replied, interested, meeting_booked)
- Maps internal status to human-readable phase names

### Helper functions
- `waitForDiscoveryCompletion` — polling with configurable interval/timeout
- `quickClassifyIntent` — regex-based fast path for obvious intents
- `determineNextStage` — rule-based pipeline progression
- `validateStageProgressionWithAI` — AI approval for big jumps
- `mapQualityToScore`, `mapDealSizeToScore`, `mapDealSizeToRevenue` — scoring utilities
- `updateCampaignStatus`, `markCampaignFailed` — safe campaign state updates
- `buildCampaignInstruction` — campaign description builder

## Lint Results
- Zero ESLint errors in `src/lib/autonomous-outreach-engine.ts`
- All pre-existing errors in other files unchanged

## Key Design Decisions
1. Used `AcquisitionCampaign` model for tracking (has all the right fields: status phases, progress counters, discoveryJobId) instead of OutreachSequence (which is designed for step-based email sequences)
2. Credit costs: researchCompany=3, classifyReplyIntent=1, autoMovePipelineStage=1 (rounded up from 0.5 for integer system)
3. Non-blocking: startAutonomousCampaign returns immediately, async pipeline continues in background
4. Graceful degradation: individual lead failures don't stop the campaign
5. Dynamic import of gmail-delivery-service in Step 5 to avoid circular dependencies at module level
6. AI validation only for stage jumps >2 positions to reduce API calls
