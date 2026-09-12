# Task 2: Fix Execution History & Metrics Backend

## Summary
Fixed three backend issues in the workflow execution history and metrics system.

## Changes Made

### 1. workflow-service.ts — listExecutions include workflow name + search
- Added `include: { workflow: { select: { id: true, name: true } } }` to the Prisma query
- Changed userWorkflows select to include `name` field (was only `id`)
- Added search support: when `filters.search` is provided, filters workflow IDs by name match (case-insensitive includes)
- Used `let userWorkflowIds` instead of `const` to allow reassignment during search filtering

### 2. workflow-service.ts — getExecution include workflow name
- Added `workflow: { select: { id: true, name: true } }` to the existing include alongside stepLogs
- Changed include from single object to object with both `workflow` and `stepLogs`

### 3. workflow-metrics.ts — throughputLast24h calculation
- Added `throughputLast24h` count query: counts executions in last 24h for user's workflows
- Added `throughputLast24h` to the return object

### 4. workflow-utils.ts — ExecutionFilters type
- Added `search?: string` field to ExecutionFilters interface

### 5. executions/route.ts — search query parameter
- Added `search: url.searchParams.get('search') || undefined` to filters object

## Files Modified
- `src/lib/workflow-service.ts` (listExecutions + getExecution)
- `src/lib/workflow-metrics.ts` (throughputLast24h)
- `src/lib/workflow-utils.ts` (ExecutionFilters type)
- `src/app/api/workflows/executions/route.ts` (search param)

## Lint Status
0 new errors (all 9 pre-existing in infrastructure files)
