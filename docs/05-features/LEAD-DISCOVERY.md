# Lead Discovery

> AcquisitionOS / `vantage` v0.2.0 — Lead discovery subsystem reference.
> All paths, function names, model names, and constants below are taken
> verbatim from the codebase (see the file references at the bottom).

---

## 1. Overview

The lead-discovery subsystem turns a free-text niche + location query into a
list of qualified `Lead` rows, runs AI enrichment on each one, generates
personalised outreach, dispatches it over email, and then handles replies.

It is composed of:

- **Discovery engines** (`src/lib/lead-discovery/`)
  - `discovery-engine.ts` — Google Custom Search + SerpAPI fallback + cheerio scraper.
  - `website-scorer.ts` — pure-HTML website quality scoring (no AI).
  - `company-researcher.ts` — AI company research via `executeAICompletion`.
  - `outreach-sender.ts` — AI outreach email generation + `sendEmail`.
  - `reply-handler.ts` — reply matching + intent classification + meeting orchestration.
- **Orchestration services**
  - `src/lib/lead-discovery-service.ts` — `startDiscoveryJob` /
    `getDiscoveryJobStatus` (used by `/api/leads/discover*`).
  - `src/lib/lead-enrichment-service.ts` — single-lead enrichment.
  - `src/lib/hot-lead-service.ts` — temperature classification feed.
  - `src/lib/hot-lead-detection-service.ts` — buying-signal detector.
  - `src/lib/gap-analysis-service.ts` — six-dimension gap analysis.
- **Scraping infrastructure**
  - `src/lib/proxy-rotation-service.ts` — proxy pool with health tracking.
  - `src/lib/anti-bot-service.ts` — UA rotation, robots.txt, captcha detection.
  - `src/lib/scraping-metrics-service.ts` — per-source metrics.
- **Reply pipeline**
  - `src/lib/gmail-reply-processor.ts`
  - `src/lib/reply-intelligence-service.ts`
  - `src/lib/reply-intelligence.ts`
  - `src/lib/gmail-pubsub-service.ts`
- **AI helpers** (`src/lib/ai/`)
  - `ai-provider.ts` — `executeAICompletion` (Z-AI / Gemini fallback).
  - `lead-analysis-engine.ts` — deep-lead-analysis prompt.
  - `scoring-engine.ts` — lead scoring.
  - `outreach-generator.ts` — outreach message generation.

### Honest status
- All routes exist and are wired up. The code path is sound.
- Whether a given run actually returns leads depends on the operator having
  set the external API keys (see §7). Without `GOOGLE_SEARCH_API_KEY` +
  `GOOGLE_SEARCH_ENGINE_ID` (or `SERPAPI_KEY`), `runDiscovery` throws
  immediately with `"No search API configured..."`.
- Without `GEMINI_API_KEY` + `Z_AI_KEY`, the AI enrichment steps degrade
  gracefully (`researchCompany` and `generateAndSendOutreach` return a
  fallback result and log the error rather than crashing the pipeline).

---

## 2. Start Discovery Flow

There are **three** POST endpoints that start a discovery. They differ in
shape (synchronous vs async-with-jobId) and in the input fields they accept.

### 2.1 `POST /api/lead-discovery` (synchronous, capped at 10 results)
Source: `src/app/api/lead-discovery/route.ts`.

- Auth: `withAuth(request, handler)`.
- Body: `{ niche: string, location: string, maxLeads: number, targetGap: string }`
  (all required).
- Caps `maxLeads` at 100 (route), and `runDiscovery` itself caps results at
  `MAX_SEARCH_RESULTS = 10` (`src/lib/lead-discovery/discovery-engine.ts:68`).
- Calls `runDiscovery(userId, config)` directly and returns the
  `DiscoverySummary` (`{ discovered, saved, skipped, leads: [...] }`) on the
  same request. **No `DiscoveryJob` row is created** — this route is purely
  synchronous and is the simplest way to test the engine.
- `GET /api/lead-discovery` returns provider availability:
  `{ status, searchProvider, configuration: { googleCustomSearch: {…}, serpApi: {…} } }`.
  `searchProvider` is `'google_custom_search'` if both
  `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` are set, `'serpapi'`
  if only `SERPAPI_KEY` is set, otherwise `'none'`.

### 2.2 `POST /api/discovery/start` (async, full pipeline, jobId)
Source: `src/app/api/discovery/start/route.ts`.

- Auth: `withAuth`.
- Body: `{ niche, location, maxLeads, targetGap, country, city }`.
- `maxLeads` is clamped to `[1, 100]`.
- `requiredCredits = maxLeads * CREDITS_PER_LEAD` (the route uses
  `CREDITS_PER_LEAD = 7` locally — research=5 + outreach=2). Calls
  `checkCreditSufficiency(user.id, requiredCredits)` and returns HTTP 402 if
  insufficient.
- Creates a `DiscoveryJob` row (`status: 'pending', source: 'full_pipeline',
  niche, country, city, total: maxLeads, progress: 0`).
- Returns immediately with `{ jobId, status: 'started', message }` (HTTP 200).
- The pipeline runs in the background via `setImmediate`:
  1. Marks `status: 'running'`, `startedAt: now`.
  2. `runDiscovery(userId, discoveryConfig)` — Step 1.
  3. Updates `totalFound` and `total`.
  4. For each lead in `discoveryResult.leads`:
     - `analyzeWebsite(lead.website, lead.businessName, niche)` → full
       `WebsiteScore` (Step 2a).
     - `researchCompany(leadInput, websiteScore, userProfile)` → Step 2b.
     - If `lead.email` exists: `generateAndSendOutreach(lead.id, userId)`
       (Step 2c). Otherwise `totalSkipped++`.
     - Updates `DiscoveryJob.progress`, `imported`, `duplicates` after each lead.
  5. Marks `status: 'completed'`, writes `resultData` (first 100 leads as JSON).
- On any exception: marks `status: 'failed'` with `errorMessage`.

### 2.3 `POST /api/leads/discover` (async, single-source, jobId)
Source: `src/app/api/leads/discover/route.ts`.

- Auth: `withAuth`.
- Body: `{ niche, country, city, source, maxResults }`.
- `source` must be one of `VALID_SOURCES`:
  `'ai_search' | 'google_maps' | 'google_business' | 'justdial' | 'indiamart' |
  'yelp' | 'yellow_pages' | 'sulekha' | 'linkedin' | 'instagram' | 'facebook'`.
- `maxResults` clamped to `[1, 50]`.
- Calls `startDiscoveryJob(user.id, params, user.orgId ?? undefined)` from
  `src/lib/lead-discovery-service.ts`.
  - `startDiscoveryJob` validates params, checks the per-user concurrent-job
    limit (`MAX_CONCURRENT_JOBS = process.env.DISCOVERY_MAX_CONCURRENT_JOBS ||
    '3'`), creates the `DiscoveryJob` row, and runs the discovery in the
    background using `z-ai-web-dev-sdk` (the `ai_search` source uses
    `zai.functions.invoke('web_search', ...)`).
- Returns `{ jobId, status, message }` with HTTP 202 Accepted.

### 2.4 Status polling

| Endpoint | Source | Behaviour |
| --- | --- | --- |
| `GET /api/discovery/status?jobId=...` | `src/app/api/discovery/status/route.ts` | If `?jobId` is provided, returns that specific job. Otherwise returns the most recent running/pending job (or the most recent `full_pipeline` job if none running). Response: `{ running, jobId, progress, total, status, error, totalFound, imported, duplicates, failed, source, niche, country, city, startedAt, completedAt, createdAt }`. |
| `GET /api/leads/discover/status/[jobId]` | `src/app/api/leads/discover/status/[jobId]/route.ts` | Returns the full `DiscoveryJobStatus` for the given job (must belong to the authenticated user). 404 if not found. |
| `GET /api/leads` | `src/app/api/leads/route.ts` | Once a job is `completed`, leads are listed/filtered here. |

### 2.5 `DiscoveryJob` model (Prisma)
```
model DiscoveryJob {
  id           String    @id @default(cuid())
  userId       String
  orgId        String?
  status       String    @default("pending") // pending, running, completed, failed
  source       String    // google_maps, google_business, justdial, indiamart, yelp,
                         // yellow_pages, sulekha, linkedin, instagram, facebook, ai_search,
                         // full_pipeline
  niche        String
  country      String
  city         String?
  total        Int       @default(0)   // expected total (maxLeads)
  progress     Int       @default(0)   // leads processed so far
  totalFound   Int       @default(0)
  imported     Int       @default(0)
  duplicates   Int       @default(0)
  failed       Int       @default(0)
  errorMessage String?
  resultData   String?   // JSON: { leads: [...] } (first 100)
  startedAt    DateTime?
  completedAt  DateTime?
}
```

---

## 3. Google Search API Integration

Source: `src/lib/lead-discovery/discovery-engine.ts` (functions
`searchCompanies`, `searchWithGoogle`, `searchWithSerpAPI`,
`buildSearchQuery`).

### 3.1 Provider selection (`searchCompanies`)
1. If `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` are both set,
   calls `searchWithGoogle`. On failure, falls through.
2. If `SERPAPI_KEY` is set, calls `searchWithSerpAPI`. On failure, falls
   through.
3. Throws `"No search API configured. Add GOOGLE_SEARCH_API_KEY +
   GOOGLE_SEARCH_ENGINE_ID or SERPAPI_KEY to environment variables."`.

### 3.2 `searchWithGoogle(query, apiKey, engineId, maxLeads)`
- `GET https://www.googleapis.com/customsearch/v1?key=...&cx=...&q=...&num=...`
- `num` is capped at 10 (Google CSE max per page).
- 10-second `AbortSignal.timeout`.
- Maps `data.items[]` to `RawCompanyHit`:
  - `name = extractCompanyName(item)` (uses `item.pagemap.metatags[0]['og:site_name']` if available, else the page title).
  - `website = item.link`.
  - `description = item.snippet`.
  - `phone = extractPhoneFromText(item.snippet || '')` (regex-based).

### 3.3 `searchWithSerpAPI(query, apiKey, maxLeads)`
- `GET https://serpapi.com/search.json?api_key=...&q=...&num=...&engine=google`
- Maps `data.organic_results[]` to `RawCompanyHit`.

### 3.4 `buildSearchQuery(niche, location)`
Returns a single primary query: `"${niche}" in "${location}" contact`.
The file defines three alternative query patterns (contact, contact
details, reviews) but only the first is currently used.

### 3.5 Proxy rotation
- `src/lib/proxy-rotation-service.ts` exposes a `ProxyEndpoint` pool with
  strategies `'round-robin' | 'random' | 'least-used' | 'least-latency'`,
  health tracking, and per-minute rate limits.
- The current `discovery-engine.ts` uses `fetch` directly (no proxy wrapper
  in the primary path) — the proxy service is available for callers that
  want IP rotation (e.g. higher-volume scraping jobs) and is used by
  `src/app/api/leads/proxy-pool/route.ts` to manage the pool.
- `src/lib/anti-bot-service.ts` provides UA rotation, robots.txt parsing,
  captcha/403 detection, and `ScrapingSession` tracking — used by the
  scraping helpers that back the heavier enrichment flows.

---

## 4. Website Scraping and Scoring

### 4.1 `scrapeWebsite(rawHit)` (in `discovery-engine.ts`)
- If `rawHit.website` is empty → returns `websiteReachable: false`.
- `fetch` with 5-second `AbortController` timeout, realistic browser headers
  (`User-Agent: Mozilla/5.0 (compatible; AcquisitionOS-Bot/1.0;
  +https://acquisitionos.com)`), redirect: 'follow'.
- If `content-length > 500KB` → skips the body, marks `techStack: ['Unknown']`.
- Otherwise loads HTML and uses **cheerio** (dynamically imported to avoid
  loading the ~3MB module at boot) to extract: page title, meta description,
  emails, phone, social links (LinkedIn, Instagram, Facebook), and a
  `techStack` array.

### 4.2 `analyzeWebsite(url, companyName, niche)` (in `website-scorer.ts`)
Pure-HTML analysis — **no AI calls**.

- Fetches the HTML (5s timeout, 500KB cap, same UA).
- Returns `WebsiteScore`:
  ```
  {
    overallScore: number;          // 0-100
    hasWebsite: boolean;
    isMobile: boolean;
    hasSSL: boolean;               // true iff URL starts with https://
    loadSpeed: 'fast' | 'slow' | 'unknown';
    hasContactInfo: boolean;
    hasSocialLinks: boolean;
    hasOnlineBooking: boolean;
    techStack: string[];
    designAge: 'modern' | 'outdated' | 'unknown';
    seoScore: number;              // 0-100 (10 checks × 10 pts)
    gaps: string[];                // human-readable gap list
    opportunityStatement: string;  // 1 sentence: what we can offer
  }
  ```
- Modern platforms list: `Webflow, Next.js, React, Ghost, Shopify,
  Squarespace`.
- Legacy CMS list: `WordPress, Joomla, Drupal`.
- Booking keywords: `book, reserve, appointment, schedule, order online,
  book now, ...`.
- SEO checks include: title tag length, meta description, headings, alt
  text, schema.org JSON-LD, Open Graph, canonical link, robots meta,
  sitemap reference, viewport tag.

### 4.3 Where scoring flows into the Lead row
After scraping, `discovery-engine.ts:saveLead()` writes:
- `Lead.hasWebsite`
- `Lead.websiteQuality`
- `Lead.digitalWeaknesses` (JSON string of detected weaknesses)
- `Lead.techStack` (JSON array)
- `Lead.email`, `Lead.phone`
- `Lead.source` = `"google_custom_search"` / `"serpapi"` / `"ai_search"`
- `Lead.niche`, `Lead.country`, `Lead.city`, `Lead.targetGap`

### 4.4 AI website analysis — `POST /api/leads/[id]/analyze-website`
Source: `src/app/api/leads/[id]/analyze-website/route.ts`.

- Loads lead, requires `lead.website`.
- Calls `ZAI.create()` then `zai.chat.completions.create(...)` with a
  structured prompt asking for `{ uiUxScore, mobileResponsiveness,
  seoAssessment, contentQuality, ctaEffectiveness, overallScore,
  recommendedImprovements: [{ priority, area, suggestion }], analysisSummary }`.
- Returns the analysis object to the caller. Does **not** persist it back
  onto the Lead (the caller is expected to use the `analyze` route for
  that — see §5).

---

## 5. AI Company Research and Enrichment

### 5.1 `researchCompany(lead, websiteScore, userProfile)`
Source: `src/lib/lead-discovery/company-researcher.ts`.

- `RESEARCH_CREDIT_COST = 5`, `RESEARCH_ACTION: CreditAction = 'deep_analysis'`.
- Flow:
  1. `checkCreditSufficiency(lead.userId, 5)`. If insufficient, returns a
     fallback `CompanyResearchResult` with the shortfall message.
  2. `deductCredits({ userId, action: 'deep_analysis', cost: 5, ... })` —
     atomic deduct with idempotency key, writes a negative `CreditsLedger`
     entry.
  3. Builds a structured prompt from `lead` + `websiteScore` +
     `userProfile` (user's name, business type, services, location).
  4. `executeAICompletion({ systemPrompt, userPrompt, maxTokens, temperature })`
     from `src/lib/ai/ai-provider.ts` (Z-AI primary, Gemini fallback).
  5. Parses JSON response (`{ companyDescription, challenges[], approachAngle,
     leadTemperature, leadScore, personalizedPitch, aiProvider }`).
  6. Updates the `Lead` row with: `ownerName`, `bestContactPerson`,
     `bestChannel`, `bestTiming`, `outreachStyle`, `opportunityNotes`,
     `replyScore`, `conversionScore`, `urgencyScore`,
     `revenuePotentialScore`, `scoreReasoning`, `digitalWeaknesses`.
  7. Writes a `LeadActivity` row.
  8. Returns `CompanyResearchResult` including `aiProvider`,
     `creditsDeducted`, `newCreditBalance`.

### 5.2 Routes that drive research

| Method | Route | Source | Behaviour |
| --- | --- | --- | --- |
| POST | `/api/leads/[id]/research` | `src/app/api/leads/[id]/research/route.ts` | Calls `generatePreMeetingResearch(leadId)` from `src/lib/ai/meeting-assistant.ts` — pre-meeting research summary. |
| POST | `/api/leads/[id]/analyze` | `src/app/api/leads/[id]/analyze/route.ts` | Entitlement-gated (`checkPlanEntitlement(user.id, user.plan, 'deep_analysis')`). Calls `ZAI.create()` + `zai.functions.invoke('web_search', ...)` for extra context, then `zai.chat.completions.create` for the deep analysis. Persists `replyScore`, `conversionScore`, `urgencyScore`, `revenuePotentialScore`, `scoreReasoning`, `digitalWeaknesses`, `bestContactPerson`, `bestChannel`, `bestTiming`, `outreachStyle`, `opportunityNotes` back to the Lead. |
| POST | `/api/leads/[id]/enrich` | `src/app/api/leads/[id]/enrich/route.ts` | Calls `enrichLead(id, userId)` from `src/lib/lead-enrichment-service.ts` and optionally `captureWebsiteScreenshot(id, userId)` from `src/lib/screenshot-service.ts`. Returns the list of fields updated. |

### 5.3 `Lead` fields filled by enrichment (Prisma schema)
```
replyScore, conversionScore, urgencyScore, revenuePotentialScore, scoreReasoning,
digitalWeaknesses, opportunityNotes,
bestContactPerson, bestChannel, bestTiming, outreachStyle,
hasWebsite, websiteQuality, techStack (JSON array), websiteScreenshotUrl,
ownerName, emailStatus
```

---

## 6. Outreach Email Generation

### 6.1 `generateAndSendOutreach(leadId, userId)`
Source: `src/lib/lead-discovery/outreach-sender.ts`.

- `OUTREACH_CREDIT_COST = 2`, `OUTREACH_ACTION: CreditAction = 'outreach_message'`.
- Flow:
  1. Loads `Lead` (must be `isActive: true`). If no email → marks the lead
     `emailStatus = 'no_contact'` and returns early.
  2. Loads user record + `ResearchMetadata` from the Lead (the JSON the
     researcher stored in step 5.1).
  3. `checkCreditSufficiency` + `deductCredits` (atomic).
  4. `executeAICompletion` with a prompt that includes the lead context,
     research metadata, and channel-specific instructions.
  5. Parses `{ subject, body }` from the AI response.
  6. `sendEmail({ to: lead.email, subject, html, text })` from
     `src/lib/email.ts` (Resend → SMTP chain). On failure: `refundCredits`
     so the user is not charged for a failed send.
  7. Updates `Lead.emailStatus = 'sent'`, `Lead.lastContactedAt = now`.
  8. Creates a `Communication` row (direction: 'outbound', channel: 'email').
  9. Creates a `LeadActivity` row.
  10. Fires `sendNotification` + `sendTelegramNotification` (best-effort).
  11. Returns `OutreachResult { success, emailId, subject, creditsDeducted,
      newCreditBalance }`.

### 6.2 Routes that drive outreach

| Method | Route | Source | Behaviour |
| --- | --- | --- | --- |
| POST | `/api/leads/[id]/outreach` | `src/app/api/leads/[id]/outreach/route.ts` | No `withAuth` (legacy) — loads lead, takes `{ channel }` from body (`'email' \| 'whatsapp' \| 'linkedin' \| 'instagram'`), calls `ZAI.create()` + `zai.chat.completions.create` with channel-specific instructions. Returns the generated message; does **not** send it. |
| POST | `/api/ai/outreach/generate` | `src/app/api/ai/outreach/generate/route.ts` | AI-only outreach generation. |
| POST | `/api/outreach/send` | `src/app/api/outreach/send/route.ts` | Sends outreach for a lead. |
| POST | `/api/outreach/execute` | `src/app/api/outreach/execute/route.ts` | Executes an outreach step. |

### 6.3 Outreach sequences (multi-step)
- `src/lib/email-sequence-service.ts` + `src/lib/email-sequence-engine.ts` +
  `src/lib/sequence-execution-engine.ts` + `src/lib/sequence-processor.ts`.
- Routes under `src/app/api/sequences/*`:
  - `POST /api/sequences` and `POST /api/sequences/create` — create a sequence.
  - `POST /api/sequences/enroll` and `POST /api/sequences/[id]/enroll` — enroll a lead.
  - `POST /api/sequences/process` and `GET /api/sequences/[id]` — process / inspect.
  - `POST /api/sequences/[id]/pause` / `resume` — control a sequence.
- A cron `POST /api/cron/sequence-processing` (Bearer `CRON_SECRET`) drives
  sequence step execution.

---

## 7. Reply Handling

### 7.1 Gmail Pub/Sub webhook
Source: `src/app/api/gmail/pubsub/webhook/route.ts`.

- **No auth** — Google calls this endpoint.
- Validates the Pub/Sub verification token (`verifyPubSubToken` from
  `src/lib/gmail-pubsub-service.ts`).
- Decodes the message data and calls `handlePubSubMessage(data)` async
  (returns 200 immediately to Google, processes in the background).
- The subscription is set up via `POST /api/gmail/pubsub/setup` and
  `scripts/provision-gmail-pubsub.sh`.

### 7.2 Reply processing pipeline
1. `src/lib/gmail-reply-processor.ts` — pulls the reply from Gmail, finds
   the matching outbound `Communication` row by `messageId` / `threadId`.
2. `src/lib/reply-intelligence-service.ts:processIncomingReply({ userId,
   leadId, emailContent, emailSubject, fromEmail, messageId })` — calls
   `executeAICompletion` to classify the reply (intent, sentiment, buying
   signals, urgency, suggested action), updates the lead, fires
   notifications, triggers workflows.
3. `src/lib/lead-discovery/reply-handler.ts:processLeadReply(emailData,
   userId)` — alternative path:
   - Matches reply to a Lead by `email` (returns `{ matched: false }` if no
     match — anti-enumeration).
   - Calls `executeAICompletion` to classify into
     `'interested' | 'not_interested' | 'needs_more_info' | 'wants_meeting'
     | 'out_of_office'` + `sentiment` + `meetingRequested`.
   - Updates Lead stage via `moveLeadToStage` (from `src/lib/pipeline-service.ts`).
   - If meeting requested: `orchestrateMeetingFromReply` from
     `src/lib/meetings/meeting-orchestration-service.ts`.
   - Sends notifications via `sendNotification`,
     `sendTelegramNotification`, `sendWhatsAppNotification`.
   - Writes `LeadActivity`.

### 7.3 Routes
| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/reply-intelligence/classify` | `withAuth`. Classifies an email reply (see §7.2 step 2). |
| POST | `/api/reply-intelligence/analyze` | Deeper analysis. |
| GET | `/api/reply-intelligence/buying-signals` | Lists detected buying signals. |
| GET | `/api/reply-intelligence/analytics` | Aggregate reply-intel analytics. |
| POST | `/api/meetings/detect-intent` | `withAuth`. `detectMeetingIntent(text)` from `src/lib/meeting-orchestration-service.ts` — regex/keyword-based intent detection. Logs a `MeetingIntentLog` row. |
| POST | `/api/gmail/process-replies` | Manual trigger to pull and process replies. |
| GET | `/api/gmail/process-replies/status` | Status of the reply-processing job. |
| POST | `/api/cron/process-gmail-replies` | Cron-driven reply processing. |

### 7.4 Hot-lead surfacing from replies
When `processIncomingReply` detects `meetingRequested` or a high
purchase-probability score, it triggers `src/lib/hot-lead-detection-service.ts`
which writes a `LeadScore` row (`scoreType: 'heat_index'`) and a
`LeadActivity` row (`type: 'hot_lead_temperature'`), then sends a
notification. The hot-lead feed (§10) picks these up.

---

## 8. Required API Keys

| Env var | Used by | Required for |
| --- | --- | --- |
| `GOOGLE_SEARCH_API_KEY` | `discovery-engine.ts:searchWithGoogle` | Primary Google CSE search. |
| `GOOGLE_SEARCH_ENGINE_ID` | `discovery-engine.ts:searchWithGoogle` | Primary Google CSE search. |
| `SERPAPI_KEY` | `discovery-engine.ts:searchWithSerpAPI` | Fallback if Google CSE is unconfigured or fails. |
| `GEMINI_API_KEY` | `src/lib/ai/ai-provider.ts` | AI calls (research, outreach, reply classification). |
| `Z_AI_KEY` | `src/lib/ai/ai-provider.ts` | AI calls (alternative provider). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth (only if Gmail integration is enabled) | Gmail reply ingestion via Pub/Sub. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` (or `SMTP_USER`/`SMTP_PASSWORD`) | `src/lib/email.ts` | Sending outreach emails. |
| `CRON_SECRET` | `/api/cron/process-gmail-replies`, `/api/cron/sequence-processing`, `/api/cron/hot-lead-scan` | Securing cron-driven background jobs. |

**Honest status:**
- Without `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` **and**
  without `SERPAPI_KEY`, `runDiscovery` throws on the first call. The
  `/api/lead-discovery` route will return HTTP 500 with that error message;
  the `/api/discovery/start` background pipeline will set the
  `DiscoveryJob.status = 'failed'` with the same message in
  `errorMessage`.
- Without AI keys, `executeAICompletion` falls back through the provider
  chain in `src/lib/ai-provider.ts`. If all providers fail, the researcher
  and outreach sender return a structured fallback result and log the
  error — they do **not** crash the pipeline.

---

## 9. How to Test

### 9.1 Smoke test (synchronous, no credits deducted by the route itself)
```bash
# 1. Set the keys in .env
GOOGLE_SEARCH_API_KEY=...
GOOGLE_SEARCH_ENGINE_ID=...
GEMINI_API_KEY=...
Z_AI_KEY=...

# 2. Check provider availability
curl -H "Authorization: Bearer <access_token>" \
  https://<your-host>/api/lead-discovery

# 3. Run a synchronous discovery (capped at 10 results)
curl -X POST -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"niche":"restaurants","location":"Mumbai India","maxLeads":10,"targetGap":"no website"}' \
  https://<your-host>/api/lead-discovery
```

### 9.2 Full pipeline (async with jobId + credits)
```bash
# Start
JOB=$(curl -X POST -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"niche":"dentists","location":"London UK","maxLeads":5,
       "targetGap":"outdated website"}' \
  https://<your-host>/api/discovery/start | jq -r .jobId)

# Poll status
curl -H "Authorization: Bearer <access_token>" \
  "https://<your-host>/api/discovery/status?jobId=$JOB"

# Once status is "completed", list the resulting leads
curl -H "Authorization: Bearer <access_token>" \
  https://<your-host>/api/leads
```

### 9.3 Single-source discovery (`/api/leads/discover`)
```bash
curl -X POST -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"niche":"law firms","country":"India","city":"Bengaluru",
       "source":"google_maps","maxResults":20}' \
  https://<your-host>/api/leads/discover
```

### 9.4 Per-lead deep analysis
```bash
# AI deep analysis (requires deep_analysis entitlement — Pro plan or higher)
curl -X POST -H "Authorization: Bearer <access_token>" \
  https://<your-host>/api/leads/<leadId>/analyze

# Enrichment (website screenshot + fields)
curl -X POST -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"includeScreenshot":true}' \
  https://<your-host>/api/leads/<leadId>/enrich
```

### 9.5 Credit costs actually deducted at runtime
> **Important**: there are **two** `CREDIT_COSTS` tables in the codebase.
> The one actually used by `deductCredits` is in
> `src/lib/credit-service.ts`:

| Action | Credit cost (used at runtime) |
| --- | --- |
| `lead_discovery` | 1 |
| `deep_analysis` | 5 |
| `outreach_message` | 2 |
| `outreach_sequence` | 8 |
| `sales_coaching` | 3 |
| `proposal_generation` | 10 |
| `competitor_analysis` | 8 |
| `data_export` | 5 |

> `src/lib/credit-costs.ts` contains a *separate* `CREDIT_COSTS` map with
> fractional values (1, 1.5, 0.2, 0.5, ...) that is referenced by
> `plan-gates.ts:withCredits` but **not** by `deductCredits`. Both tables
> exist; the integer table above is the one that lands on the
> `CreditsLedger` row.

---

## 10. Hot Leads

### 10.1 Temperature classification
Source: `src/lib/hot-lead-service.ts`.

- `scanHotLeads(userId)` iterates all active leads for the user, scores each
  against six criteria (purchaseProbability ≥70, outreachPriority
  'critical'/'high', leadQualityScore ≥80, urgencyScore ≥70, ≥3 buying
  signals, lead stage 'interested'/'negotiation'), and classifies:
  - `fire` — 3+ criteria met
  - `hot` — 2 criteria
  - `warm` — 1 criterion
  - `cold` — 0 criteria
- Writes a `LeadScore` row (`scoreType: 'heat_index'`) and a
  `LeadActivity` row (`type: 'hot_lead_temperature'`) for each lead whose
  temperature changed.
- `getHotLeadFeed(userId, { temperature?, page, limit })` — paginated feed
  of hot leads with `temperature`, `heatIndex`, `criteria`, and
  `temperatureChange` ('heating' | 'cooling' | 'stable' | 'new').
- **No credit deduction, no AI calls** — purely algorithmic.

### 10.2 Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/leads/hot?temperature=fire&page=1&limit=20` | Hot lead feed (`getHotLeadFeed`). |
| POST | `/api/leads/hot/scan` | Manual scan (`scanHotLeads`). |
| GET | `/api/leads/hot/stats` | Counts by temperature. |
| GET | `/api/leads/hot-leads` | Legacy alias of `/api/leads/hot`. |
| POST | `/api/hot-leads/detect` | Trigger detection. |
| GET | `/api/hot-leads/feed` | Alternative feed endpoint. |
| POST | `/api/cron/hot-lead-scan` | Cron-driven scan (Bearer `CRON_SECRET`). |

### 10.3 Buying-signal detection
Source: `src/lib/hot-lead-detection-service.ts` (the detection layer that
underpins the criteria in §10.1). It examines recent `LeadActivity`,
`Communication`, and `MeetingIntentLog` rows for buying signals ("pricing
question", "competitor mention", "demo request", etc.) and writes
`purchaseProbability` onto the lead.

---

## 11. Gap Analysis

Source: `src/lib/gap-analysis-service.ts`.

`analyzeLeadGaps(leadId, userId)`:
- `deductCredits(...)` first.
- Calls `ZAI.create()` + `zai.chat.completions.create` with a prompt asking
  for analysis across six dimensions:
  1. **Digital Presence Gap**
  2. **Contact Information Gap**
  3. **Engagement Gap**
  4. **Competitive Gap**
  5. **Revenue Opportunity Gap**
  6. **Technology Gap**
- Returns `GapAnalysis { leadId, overallScore, gaps[], recommendations[],
  priorityActions[], conversionProbability, estimatedRevenueImpact }`.
- Each `GapItem` carries `{ dimension, gap, current, ideal, severity,
  impact, autoFixable }`.
- Stores results in `LeadActivity`.
- Auto-triggers enrichment if a critical contact-info gap is found.
- Auto-triggers outreach if an engagement gap is found.
- `batchAnalyzeGaps(leadIds, userId)` — batch wrapper, max 50 IDs per call.
- `getGapTrends(userId)` — aggregate gap trends over time.

### Routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/leads/gap-analysis` | Body: `{ leadId }` or `{ leadIds: string[] }` (≤50). Returns analysis / batch result. |
| GET | `/api/leads/gap-analysis` | `getGapTrends(userId)` aggregate trends. |
| POST | `/api/gap-analysis` | Alternative entry point. |
| POST | `/api/gap-analysis/remediation` | Apply remediation for a specific gap. |
| GET/POST | `/api/gap-analysis/score` | Score a lead against gap-analysis dimensions. |

---

## 12. Rate Limits and Costs

### 12.1 Google Custom Search quotas
- 100 queries/day free tier; $5 per 1,000 queries after that (Google-side
  pricing — confirm on your billing account).
- `num` capped at 10 results per request by `searchWithGoogle`.
- `runDiscovery` itself caps at `MAX_SEARCH_RESULTS = 10` to prevent OOM
  on memory-constrained servers.

### 12.2 SerpAPI quotas
- 100 searches/month free tier; paid plans beyond that (SerpAPI-side).

### 12.3 AI costs (credits deducted from `User.credits`)
- See §9.5. Each `discovery/start` lead costs 7 credits (5 research + 2
  outreach) — checked upfront by `checkCreditSufficiency` and HTTP 402
  returned if insufficient.
- Failed sends are refunded via `refundCredits` (see §6.1 step 6).

### 12.4 Scraping rate limits
- `WEBSITE_TIMEOUT_MS = 5000` (5s) per fetch.
- `MAX_HTML_SIZE = 500KB` — pages larger than this are not parsed.
- Sequential scraping (no `Promise.all`) with a 500ms breathing room between
  fetches to avoid memory spikes and rate-limit bans.
- `src/lib/anti-bot-service.ts` provides UA rotation, robots.txt
  enforcement, and CAPTCHA/403 detection.
- `src/lib/proxy-rotation-service.ts` provides a managed proxy pool with
  `round-robin | random | least-used | least-latency` strategies and
  per-minute rate caps. Per-user pool admin via
  `/api/leads/proxy-pool`.

### 12.5 Scraping metrics
- `src/lib/scraping-metrics-service.ts` records per-source success rates,
  latencies, and error counts.
- `GET /api/leads/scraping-metrics` returns the metrics for the
  authenticated user.

---

## 13. Status — Honest Summary

| Subsystem | Status | Notes |
| --- | --- | --- |
| `/api/lead-discovery` (sync) | ✅ Code OK | Returns 500 if no search API key. |
| `/api/discovery/start` (async pipeline) | ✅ Code OK | Returns 402 if insufficient credits; runs in background; persists `DiscoveryJob`. |
| `/api/leads/discover` (single-source) | ✅ Code OK | `source` must be one of 11 enum values; uses `z-ai-web-dev-sdk` for `ai_search`. |
| `/api/discovery/status` & `/api/leads/discover/status/[jobId]` | ✅ Code OK | Poll for progress. |
| Website scraping | ✅ Code OK | Capped at 10 results / 500KB / 5s per fetch. |
| `analyzeWebsite` (no-AI scorer) | ✅ Code OK | Pure-HTML scoring. |
| `researchCompany` (AI) | ✅ Code OK | Degrades to fallback on AI/credit failure. |
| `generateAndSendOutreach` (AI + SMTP) | ✅ Code OK | Refunds credits on send failure. |
| Reply handling | ✅ Code OK | Requires Gmail Pub/Sub to be set up via `/api/gmail/pubsub/setup`. |
| Hot lead feed | ✅ Code OK | Algorithmic; no AI / no credits. |
| Gap analysis | ✅ Code OK | Requires AI keys; deducts credits up front. |
| Proxy rotation | ✅ Code OK | Pool management via `/api/leads/proxy-pool`. |
| Anti-bot service | ✅ Code OK | Used by heavier scraping paths. |
| **External dependency** | ⚠️ Operator action required | Set `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` (or `SERPAPI_KEY`), `GEMINI_API_KEY` + `Z_AI_KEY`, and SMTP/Gmail credentials. Without these the routes still respond but cannot complete real work. |

---

## 14. File Reference

### Discovery engines (`src/lib/lead-discovery/`)
| File | Exports |
| --- | --- |
| `discovery-engine.ts` | `runDiscovery`, `DiscoveryConfig`, `RawCompanyHit`, `ScrapedCompanyData`, `DiscoverySummary`, `DiscoveryLeadResult` |
| `website-scorer.ts` | `analyzeWebsite`, `WebsiteScore` |
| `company-researcher.ts` | `researchCompany`, `LeadInput`, `UserProfile`, `CompanyResearchResult` |
| `outreach-sender.ts` | `generateAndSendOutreach`, `OutreachResult` |
| `reply-handler.ts` | `processLeadReply`, `EmailReplyData`, `ProcessLeadReplyResult` |

### Orchestration services (`src/lib/`)
| File | Exports |
| --- | --- |
| `lead-discovery-service.ts` | `startDiscoveryJob`, `getDiscoveryJobStatus`, `DiscoverySource`, `DiscoveryParams`, `DiscoveredLead`, `DiscoveryJobResult`, `DiscoveryJobStatus` |
| `lead-enrichment-service.ts` | `enrichLead(leadId, userId)` |
| `hot-lead-service.ts` | `getHotLeadFeed`, `scanHotLeads`, `LeadTemperature`, `HotLead`, `HotLeadFeed`, `HotLeadScanResult` |
| `hot-lead-detection-service.ts` | Buying-signal detection |
| `gap-analysis-service.ts` | `analyzeLeadGaps`, `batchAnalyzeGaps`, `getGapTrends`, `GapAnalysis`, `GapItem`, `GapRecommendation` |
| `proxy-rotation-service.ts` | Proxy pool management |
| `anti-bot-service.ts` | UA rotation, robots.txt, captcha detection |
| `scraping-metrics-service.ts` | Per-source metrics |
| `email-sequence-service.ts` / `email-sequence-engine.ts` / `sequence-execution-engine.ts` / `sequence-processor.ts` | Outreach sequences |
| `gmail-reply-processor.ts`, `reply-intelligence-service.ts`, `reply-intelligence.ts`, `gmail-pubsub-service.ts` | Reply ingestion and intelligence |

### AI helpers (`src/lib/ai/`)
| File | Exports |
| --- | --- |
| `ai-provider.ts` | `executeAICompletion`, `AICompletionRequest` |
| `lead-analysis-engine.ts` | Deep lead analysis prompt |
| `scoring-engine.ts` | Lead scoring |
| `outreach-generator.ts` | Outreach message generation |
| `ai-audit.ts` | `logAIAudit` |

### Routes (`src/app/api/`)
- `lead-discovery/route.ts` — sync discover + provider availability
- `discovery/start/route.ts`, `discovery/status/route.ts`,
  `discovery/leads/route.ts`
- `leads/discover/route.ts`, `leads/discover/status/[jobId]/route.ts`,
  `leads/discover/suggestions/route.ts`
- `leads/[id]/analyze/route.ts`, `analyze-website/route.ts`,
  `research/route.ts`, `enrich/route.ts`, `outreach/route.ts`
- `leads/hot/route.ts`, `leads/hot/scan/route.ts`, `leads/hot/stats/route.ts`
- `leads/hot-leads/route.ts`, `leads/reply-intelligence/route.ts`,
  `leads/ai-scores/route.ts`, `leads/gap-analysis/route.ts`,
  `leads/proxy-pool/route.ts`, `leads/scraping-metrics/route.ts`
- `hot-leads/detect/route.ts`, `hot-leads/feed/route.ts`
- `gap-analysis/route.ts`, `gap-analysis/remediation/route.ts`,
  `gap-analysis/score/route.ts`
- `gmail/pubsub/webhook/route.ts`, `gmail/pubsub/setup/route.ts`,
  `gmail/process-replies/route.ts`, `gmail/process-replies/status/route.ts`
- `reply-intelligence/classify/route.ts`, `analyze/route.ts`,
  `buying-signals/route.ts`, `analytics/route.ts`
- `meetings/detect-intent/route.ts`
- `ai/outreach/generate/route.ts`, `ai/analysis/[leadId]/route.ts`
- `sequences/*` — multi-step outreach sequences
- `cron/process-gmail-replies/route.ts`, `cron/hot-lead-scan/route.ts`,
  `cron/sequence-processing/route.ts`

### Prisma models involved
`Lead`, `LeadActivity`, `LeadAnalysis`, `LeadScore`, `LeadNote`,
`Communication`, `OutreachMessage`, `SequenceEnrollment`, `DiscoveryJob`,
`MeetingIntentLog`, `AuditLog`, `CreditsLedger`.
