# Task 6-7: Enhance Dead Letter UI + Enhance Metrics UI

## Task 6: Enhance Dead Letter UI

### Enhancement 1: Replay from Step
- Created replay API route at `src/app/api/workflows/executions/[executionId]/replay/route.ts`
  - Accepts `fromStep` parameter to resume execution from a specific step
  - Deletes step logs from the fromStep onwards
  - Resets execution status to queued, clears dead letter flag, increments retry count
  - Calls `processExecution()` to resume the workflow
  - Logs audit event `workflow_replayed`
- Enhanced workflow-dead-letter.tsx with dropdown menu on each entry
  - 3-dot menu with: View Details, Retry from Beginning, Replay from Step...
  - Replay from Step dialog: visual step selector showing completed/failed/pending steps
  - Summary of what the replay will do (keep prior steps, re-run from selected step)

### Enhancement 2: Auto-retry toggle
- Added Switch toggle at top of DLQ page: "Auto-retry failed executions"
- Persisted in localStorage (`dlq-auto-refresh`)
- When enabled, auto-refreshes every 30 seconds with spinning indicator badge
- Shows last refresh timestamp

### Enhancement 3: Better stats
- Expanded from 3 stats cards to 6:
  1. Total DLQ (existing)
  2. Recent 24h (existing)
  3. Error Types (existing)
  4. Avg Time to Failure — computed from durationMs of failed executions
  5. Common Fail Step — most frequently failing step type
  6. Retry Success Rate — computed from retry counts vs DLQ entries
- All computed client-side from existing DLQ data
- Added duration display in each DLQ entry row

## Task 7: Enhance Metrics UI

### Enhancement 1: Timeline API
- Created `src/app/api/workflows/metrics/timeline/route.ts`
  - Returns execution counts grouped by day for last 7 days
  - Breaks down by status: completed, failed, running, other
  - Fills all 7 days even if no executions exist
  - Uses withAuth for authentication

### Enhancement 2: Execution Timeline Chart
- Replaced static status distribution with Recharts BarChart
  - Stacked bar chart: emerald (completed), red (failed), amber (running)
  - ResponsiveContainer for adaptive sizing
  - Custom tooltip with date formatting
  - X-axis with rotated date labels
  - Legend showing color meanings
  - Falls back to empty state when no data
- Existing status distribution and top workflows panels preserved below the chart

## Files Created (2)
- `src/app/api/workflows/executions/[executionId]/replay/route.ts`
- `src/app/api/workflows/metrics/timeline/route.ts`

## Files Modified (2)
- `src/components/dashboard/workflow-dead-letter.tsx` (complete rewrite with replay, auto-refresh, better stats)
- `src/components/dashboard/workflow-metrics.tsx` (enhanced with Recharts timeline chart)

## Lint Status
- 0 new errors (all 9 errors are pre-existing in server.js/custom-server.js/etc.)
- Dev server running successfully
