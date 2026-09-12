# Task 6-stability: Workflow Module Split for Stability

## Summary
Verified and fixed the workflow module split to prevent Turbopack OOM crashes.

## Findings
- The workflow module split was already done by a previous agent
- 4 sub-modules exist: workflow-executor.ts, workflow-templates.ts, workflow-metrics.ts, workflow-dlq.ts
- workflow-service.ts contains only CRUD operations + execution queries
- workflow-utils.ts contains shared types and helpers
- workflow-store.ts is already a compatibility stub
- All API routes already import from the correct sub-modules

## Key Fix Applied
- **Broke the DLQ → Executor dependency**: `workflow-dlq.ts` was importing `processExecution` from `workflow-executor`, which pulled the heavy executor module (816 lines + 786 lines realtime-engine) into every route that imported from DLQ. This caused OOM when compiling the dead-letter listing route.
- Removed the `processExecution` import from `workflow-dlq.ts`
- Moved the `processExecution()` call to the retry route handler (`dead-letter/[executionId]/route.ts`)
- Now the DLQ listing and purge routes only need lightweight modules (db + workflow-utils)

## Files Modified
1. `src/lib/workflow-dlq.ts` - Removed `import { processExecution } from '@/lib/workflow-executor'` and the processExecution call
2. `src/app/api/workflows/dead-letter/[executionId]/route.ts` - Added `import { processExecution } from '@/lib/workflow-executor'` and processExecution call after retryDeadLetter

## API Endpoint Test Results
All endpoints return valid JSON when tested individually:
- GET /api/health ✅
- POST /api/auth/signin ✅
- GET /api/workflows ✅ (total=1)
- GET /api/workflows/metrics ✅ (totalWorkflows=1, successRate=100)
- GET /api/workflows/templates ✅ (templates=7)
- GET /api/workflows/executions ✅ (total=1)
- GET /api/workflows/dead-letter ✅ (total=0)

## Lint Results
- 0 new errors in workflow files
- 9 pre-existing errors in JS config files (require imports in custom-server.js, process-manager.js, server.js, proxy/index.js)

## Remaining Issue
The dev server still crashes due to cumulative memory pressure from Turbopack compiling multiple routes. This is a broader issue beyond the workflow module split - the project has many large service files (whatsapp-service: 2696 lines, telegram-service: 1745 lines, notification-engine: 1656 lines). The workflow split helps by preventing the executor from being loaded for every route, but total project size still causes memory pressure.
