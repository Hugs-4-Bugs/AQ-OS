# Task 4-intelligence-layers — Intelligence Layers Agent

## Task
Implement Reply Intelligence, Gmail Reply Intelligence, Autonomous Outreach, and Hot Lead Detection services (Phases 4-7)

## Files Created

### Phase 4: Reply Intelligence
1. `/src/lib/reply-intelligence.ts` — Core ReplyIntelligenceService
2. `/src/app/api/reply-intelligence/analyze/route.ts` — POST /api/reply-intelligence/analyze
3. `/src/app/api/reply-intelligence/classify/route.ts` — POST /api/reply-intelligence/classify

### Phase 5: Gmail Reply Intelligence
4. `/src/lib/gmail-reply-intelligence.ts` — GmailReplyIntelligenceService
5. `/src/app/api/gmail/reply-intelligence/route.ts` — POST /api/gmail/reply-intelligence

### Phase 6: Autonomous Outreach
6. `/src/lib/autonomous-outreach.ts` — AutonomousOutreachService
7. `/src/app/api/autonomous-outreach/generate/route.ts` — POST /api/autonomous-outreach/generate
8. `/src/app/api/autonomous-outreach/dispatch/route.ts` — POST /api/autonomous-outreach/dispatch
9. `/src/app/api/cron/autonomous-outreach/route.ts` — POST /api/cron/autonomous-outreach

### Phase 7: Hot Lead Detection
10. `/src/lib/hot-lead-detection.ts` — HotLeadDetectionService
11. `/src/app/api/hot-leads/detect/route.ts` — POST /api/hot-leads/detect
12. `/src/app/api/hot-leads/feed/route.ts` — GET /api/hot-leads/feed

## Key Decisions
- Used ZAI SDK pattern: `ZAI.create()` → `zai.chat.completions.create()` (matching existing codebase)
- All API routes use `withAuth` middleware from `@/lib/auth-middleware`
- Cron endpoint uses Bearer token auth with CRON_SECRET env var
- Lead scores clamped to [0, 100] range
- Hot lead detection uses 6 criteria with composite score threshold of 70
- Notification deduplication in hot lead alerts (skips if unread notification exists)
- Fallback safe defaults on LLM analysis failures

## TypeScript Check
- 0 errors after fixes
- Fixed: leadAnalysis array access (was treating as single object)
- Fixed: Communication.type field (doesn't exist in schema)
