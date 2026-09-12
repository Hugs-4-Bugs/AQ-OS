---
Task ID: L2
Agent: Mock API Fix Agent
Task: Replace mock/static API responses with real database queries or honest empty states

Work Log:
- Fixed /api/chat-sessions: Replaced in-memory MOCK_SESSIONS array with Prisma db.aiChatSession.findMany/create queries. Uses withAuth for userId, includes message count via _count.
- Fixed /api/integrations/whatsapp: Replaced fake WhatsApp data with real WhatsappConfig DB query. Replaced client_id=MOCK with process.env.WHATSAPP_APP_ID. Returns { connected: false, available: false } when no credentials. POST actions return 501 when no real API credentials.
- Fixed /api/integrations/gmail: Replaced fake Gmail data with real EmailAccount DB query. Replaced client_id=MOCK with process.env.GOOGLE_CLIENT_ID. Returns { connected: false, available: false } when no credentials. POST actions return 501 when no real credentials.
- Fixed /api/dashboard/budget: Replaced hardcoded $850,000 totalBudget with 0. Replaced Math.round(closedRevenue * 0.4) spend ratio with actual closedRevenue. Department budgets all default to 0.
- Fixed /api/dashboard/executive-summary: Replaced hardcoded revenueTarget=3500000 with 0. Replaced hardcoded yoyGrowth=18.3 with 0. Replaced hardcoded avgDaysToClose=42 with real calculation from won deal dates. Team Performance score set to 0.
- Fixed /api/dashboard/deals-performance: Replaced hardcoded change percentages (12.5, 8.1, -2.3, 5.7) with 0 for all (pipelineChange, wonChange, winRateChange, avgSizeChange).
- Fixed /api/dashboard/revenue-waterfall: Removed all fake fallback values ($2.45M starting, $680K new business, etc.). Now returns actual computed values from DB (0 when no data).
- Fixed /api/dashboard/performance-benchmark: Replaced hardcoded industry metrics ($42.5K, 42 days, 28%, 3.2x, 1.5h) with real calculated values or 0. Replaced hardcoded goal cards with empty array. Benchmarks targets set to 0.
- Fixed /api/dashboard/email-performance: Replaced Math.random() for template openRate/replyRate with 0 (removed MessageTemplate query since model doesn't exist). Recent campaigns use real message counts instead of estimated percentages.
- Fixed /api/dashboard/account-growth: Removed Math.random() for expansion pipeline probability/stage. Replaced hardcoded KPI trends (+18%, +24%, +12%, +31%) with +0%. Top accounts spark arrays set to empty.
- Fixed /api/dashboard/churn-risk: Replaced Math.random() for at-risk account values with actual deal values from DB. Replaced hardcoded retention metrics (NPS, expansion rev) with 0.
- Fixed /api/dashboard/market-analysis: Removed Math.random() for deal sizes. Replaced hardcoded industry trends with empty array. Replaced hardcoded market sizes ($2.4B, $850M) with 0. Opportunity scores all set to 0.
- Fixed /api/dashboard/lead-sources: Replaced Math.random() for trends with real period-over-period calculation from lead creation data.
- Fixed /api/dashboard/pipeline-health: Replaced generateSparkline() (using Math.random()) with empty arrays. Removed Math.random() from valueTrend fallback. Kept getRelativeTime() utility function.
- Fixed /api/competitor: Replaced plausible fake data generation (random scores + boilerplate SWOT) on AI failure with proper 503 error response.

Stage Summary:
- All 15 mock API routes fixed — zero Math.random() calls remain, zero hardcoded financial/metric values
- Principle applied: if real data exists in DB → return it; if no real data → return 0, null, or empty arrays
- OAuth integration routes now use real env vars (GOOGLE_CLIENT_ID, WHATSAPP_APP_ID) and return available:false when not configured
- Chat sessions route now uses existing AiChatSession Prisma model (no schema change needed)
- Lint passes with zero errors in all modified API route files
- Dev server running successfully on port 3000
