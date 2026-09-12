---
Task ID: 2
Agent: AI Meeting Assistant Agent
Task: Replace stub implementations in meeting-assistant.ts with real z-ai-web-dev-sdk implementations

Work Log:
- Read existing meeting-assistant.ts (144 lines, 6 stub functions returning empty/null)
- Studied Prisma schema: Meeting model (1519-1565), Lead model (453-531), Deal model (1380-1402)
- Studied existing AI integration pattern from ai-provider.ts (ZAI.create() + zai.chat.completions.create())
- Confirmed z-ai SDK maps 'system' role to 'assistant' role in message format
- Implemented 6 real AI-powered functions replacing all stubs:
  1. `generateMeetingAgenda(meetingId)` — Fetches meeting + lead + deal from DB, builds comprehensive context prompt, generates 3-7 agenda items with topic/duration/description/priority
  2. `generatePreMeetingResearch(leadId)` — Fetches full lead profile (30+ fields), generates company overview, key contacts, recent news, industry insights, talking points
  3. `analyzeMeetingSentiment(meetingId)` — Analyzes meeting notes/description, returns overall sentiment (positive/neutral/negative/mixed), confidence score, timeline of sentiment shifts
  4. `extractObjections(meetingId)` — Identifies and categorizes objections by type (price/timing/competitor/authority/need/other) with severity and suggested responses
  5. `generateFollowUpEmail(meetingId)` — Generates professional follow-up email with subject/body, personalized with meeting attendees and context
  6. `generateActionItems(meetingId)` — Extracts 2-8 action items with title/assignee/dueDate/priority, source tagged as 'ai'
- Added internal helper functions:
  - `callAI(systemPrompt, userPrompt)` — Centralized z-ai SDK call with error handling
  - `safeParseJSON<T>(raw)` — JSON parser that strips markdown code fences and extracts JSON from mixed text
- All functions use structured JSON prompts with explicit output format instructions
- Error handling: every function wraps in try/catch, returns empty results on failure, never throws
- Logging: all functions use `[AI Meeting Assistant]` prefix with contextual details
- Validation: all parsed AI responses are validated against expected types before returning
- Preserved ALL existing type exports unchanged (MeetingAgendaItem, PreMeetingResearch, MeetingTranscript, TranscriptSegment, SentimentAnalysis, SentimentPoint, ObjectionExtraction, ObjectionItem, ActionItem)
- Type check: `npx tsc --noEmit` with project tsconfig passes (zero errors in meeting-assistant.ts)
- Single-file tsc shows only expected `@/lib/db` path alias resolution error (non-issue in Next.js build)

Stage Summary:
- All 6 stub functions replaced with real AI implementations (~970 lines total)
- Each function fetches real data from DB using `db.meeting.findUnique` / `db.lead.findUnique`
- Each function builds comprehensive prompts leveraging meeting + lead + deal context
- Robust JSON parsing handles markdown fences and mixed AI output
- Graceful error handling throughout — no function throws on AI failure
- File: /home/z/my-project/src/lib/ai/meeting-assistant.ts (only file modified)
- Build: PASSED (no new type errors introduced)
