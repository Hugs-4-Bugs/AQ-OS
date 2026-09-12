# Task 3: Reply Intelligence Service

**Agent**: Reply Intelligence Agent
**File**: `/home/z/my-project/src/lib/reply-intelligence-service.ts`

## Work Summary

Implemented a complete, production-quality Reply Intelligence Service (1,476 lines) that classifies incoming email replies, detects buying signals, calculates sentiment scores, auto-updates lead pipeline stages, and generates AI-powered follow-up suggestions.

## Implementation Details

### 1. Reply Classification (7 categories)
- `positive` — interested, wants to learn more, asks for pricing/demo
- `neutral` — acknowledges, asks general questions, no clear intent
- `negative` — not interested, unsubscribes, competitor mention
- `meeting_request` — explicitly asks for a meeting/call
- `objection` — raises concerns (price, timing, competitor preference)
- `out_of_office` — auto-reply / OOO
- `spam` — spam or irrelevant

### 2. Buying Signal Detection (6 types)
- `budget` — Budget mentions, allocated funds, investment capacity
- `authority` — Decision maker claims, approval power
- `need` — Problem statements, pain points, solution gaps
- `timeline` — Urgency words, deadlines, target dates
- `meeting` — Meeting/call/demo requests
- `pricing` — Pricing inquiries, cost questions

### 3. Pipeline Automation
- `positive` + buying signals → move to `interested`
- `meeting_request` → move to `meeting_scheduled` + create urgent follow-up
- `negative` → move to `closed_lost` + update email status
- `objection` → keep at `replied` + create objection follow-up task
- `neutral` → keep/move to `replied` + schedule follow-up
- `out_of_office` → schedule re-contact after return date (with date extraction)

### 4. Sentiment Score (0-100)
Based on: word sentiment analysis, buying signal count/strength, reply length, question count, exclamation marks, urgency words

### 5. AI Integration
- Uses `z-ai-web-dev-sdk` (ZAI.create() + zai.chat.completions.create())
- Comprehensive system prompt with classification rules
- Structured JSON output parsing with safeParseJSON helper
- Graceful fallback to rule-based classification when AI fails or low confidence
- Rule-based analysis supplements AI results (buying signal detection)

### 6. Credit Enforcement
- 2 credits per classification (action: 'reply_intelligence')
- Uses `deductCredits` from `@/lib/credit-service`
- Returns error if insufficient credits (no partial processing)

### 7. Database Operations
- Creates `LeadActivity` records (type: 'reply_classified')
- Creates `Communication` records (inbound, with intent/buyingSignals)
- Creates `FollowUpReminder` records for objections, neutral, OOO, meeting requests
- Creates `LeadScore` records for reply, conversion, urgency scores
- Updates `Lead` fields: stage, lastContactedAt, emailStatus, replyScore, conversionScore, urgencyScore, scoreReasoning, followUpAt

### 8. Notifications
- Uses `sendNotification` from `@/lib/notification-engine`
- Category-specific notification titles and messages
- Includes metadata with leadId, category, sentiment, pipeline action

### 9. Audit Logging
- Uses `logAuditEvent` from `@/lib/lead-audit`
- Logs: category, confidence, sentiment, buying signals, pipeline action, credit cost

### 10. Exported Functions
- `classifyReply(params)` — Main classification function
- `batchClassifyReplies(userId, replies)` — Batch processing with sequential execution
- `getReplyInsights(userId)` — 30-day insights summary with category distribution, sentiment trends, top buying signals, pipeline movements, high-intent leads

### Lint Check
- Zero new lint errors (57 pre-existing errors are unrelated)
