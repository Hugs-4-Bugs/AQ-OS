# Task 8 — Autonomous API Routes Agent

## Task: Create API routes for the autonomous acquisition engine

### Work Log

Created 6 API route files exposing autonomous capabilities to the frontend:

1. **`/src/app/api/autonomous/campaign/route.ts`** — Overwrote existing minimal GET-only route
   - **POST**: Start an autonomous campaign
     - Uses `withAuth` from `@/lib/auth-middleware`
     - Body: `{ niche, country, city?, source?, maxLeads?, autoOutreach?, autoResearch?, tone?, channel?, customInstructions? }`
     - Validates required fields (niche, country)
     - Checks credit sufficiency (estimate: maxLeads * 5 for research + maxLeads * 1 for outreach)
     - Calls `startAutonomousCampaign(userId, params)` from `@/lib/autonomous-outreach-engine`
     - Returns `{ success, campaignId, message }` with 201 on success, 400/403 on validation failures
   - **GET**: List user's campaigns
     - Uses `withAuth`
     - Query params: `limit` (max 100), `offset`, `status`
     - Returns campaigns list with basic stats (discovered, analyzed, outreachGenerated, sent, etc.)

2. **`/src/app/api/autonomous/campaign/[campaignId]/route.ts`** — Created new file (alongside existing `[id]`)
   - **GET**: Get campaign status
     - Uses `withAuth`
     - Calls `getCampaignStatus(campaignId, userId)` from autonomous-outreach-engine
     - Returns full campaign status or 404
   - **POST**: Control campaign (pause/resume/cancel)
     - Uses `withAuth`
     - Body: `{ action: 'pause' | 'resume' | 'cancel' }`
     - Validates action against current campaign status (e.g., can't pause completed campaigns)
     - Updates campaign status accordingly
     - For resume: intelligently picks the right processing phase based on campaign progress

3. **`/src/app/api/autonomous/research/route.ts`** — New file
   - **POST**: Research a specific company/lead
     - Uses `withAuth`
     - Body: `{ leadId }`
     - Checks credit sufficiency (3 credits) before calling engine
     - Calls `researchCompany(leadId, userId)` from autonomous-outreach-engine
     - Returns research results (businessModelAnalysis, techStack, painPoints, opportunities, etc.)

4. **`/src/app/api/autonomous/classify-reply/route.ts`** — New file
   - **POST**: Classify a reply's intent
     - Uses `withAuth`
     - Body: `{ messageContent, leadId? }`
     - If leadId provided: fetches lead context from DB (businessName, ownerName, niche, previousMessages) and calls `classifyReplyAndAct()` which handles credit deduction, classification, auto pipeline movement
     - If no leadId: calls lightweight `classifyReplyIntent()` for ad-hoc classification without DB writes
     - Returns classification with intent, confidence, suggestedAction, suggestedResponse, shouldAutoRespond

5. **`/src/app/api/autonomous/send-outreach/route.ts`** — New file
   - **POST**: Send outreach email to a lead
     - Uses `withAuth`
     - Body: `{ leadId, subject?, body?, tone?, channel?, autoGenerate?: boolean }`
     - If autoGenerate=true and no body provided: first generates outreach via `generateOutreach()` from `@/lib/ai/outreach-generator`
     - Finds user's connected Gmail account (EmailAccount where status='active')
     - If no Gmail connected, returns 400 error suggesting to connect Gmail first
     - Sends email via `sendEmail` from `@/lib/gmail-delivery-service` (dynamic import)
     - Updates lead stage via `autoMovePipelineStage` with 'email_sent' trigger
     - Returns send result with messageId, threadId, pipeline move status

6. **`/src/app/api/autonomous/pipeline/move/route.ts`** — New file
   - **POST**: Auto-move lead pipeline stage
     - Uses `withAuth`
     - Body: `{ leadId, trigger: 'email_sent' | 'email_opened' | 'email_replied' | 'reply_classified' | 'meeting_booked' | 'proposal_sent' }`
     - Validates trigger against PipelineTrigger type
     - Calls `autoMovePipelineStage(leadId, userId, trigger)` from autonomous-outreach-engine
     - Returns new stage, fromStage, toStage, and reason

### Design Decisions

- All routes use `withAuth` from `@/lib/auth-middleware` — consistent with existing project pattern
- All routes have try/catch error handling with console.error logging
- Proper HTTP status codes: 200 (success), 201 (created), 400 (bad request), 403 (forbidden/insufficient credits), 404 (not found), 500 (server error)
- Dynamic import for `sendEmail` in send-outreach route to avoid circular dependency at module level
- Campaign control (pause/resume/cancel) validates current status before applying action
- classify-reply route has two modes: with leadId (full pipeline integration) and without (lightweight ad-hoc)
- Pipeline move validates triggers against the `PipelineTrigger` type from the engine

### Lint Status

- All 6 new files pass ESLint with zero errors
- 54 pre-existing errors in unrelated files (dashboard components)
- No autonomous API-related lint errors

### Files Created/Modified

- **Modified**: `/src/app/api/autonomous/campaign/route.ts` (added POST, enhanced GET)
- **Created**: `/src/app/api/autonomous/campaign/[campaignId]/route.ts`
- **Created**: `/src/app/api/autonomous/research/route.ts`
- **Created**: `/src/app/api/autonomous/classify-reply/route.ts`
- **Created**: `/src/app/api/autonomous/send-outreach/route.ts`
- **Created**: `/src/app/api/autonomous/pipeline/move/route.ts`
