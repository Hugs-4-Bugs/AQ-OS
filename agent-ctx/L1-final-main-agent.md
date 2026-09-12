# Task L1-final: Replace Active Mock Data in 6 Dashboard Components

## Summary
Replaced all active MOCK data constants in 6 dashboard frontend components with real API fetch calls, adding proper loading/error/empty states.

## Components Modified

1. **deals-performance-widget.tsx** — Removed MOCK_METRICS + MOCK_PIPELINE, added fetch from /api/dashboard/deals-performance
2. **pipeline-health-monitor.tsx** — Removed MOCK_DATA, added fetch from /api/dashboard/pipeline-health
3. **engagement-score-center.tsx** — Removed MOCK_DATA (3 periods), added fetch from /api/dashboard/engagement-scores?period=X with CATEGORY_ICON_MAP
4. **revenue-forecast-chart.tsx** — Removed MOCK_DATA + CONFIDENCE_DATA, added fetch from /api/dashboard/revenue-forecast
5. **weekly-digest-report.tsx** — Removed MOCK_CURRENT + MOCK_PREVIOUS, added fetch from /api/dashboard/weekly-digest?week=X
6. **team-workload-planner.tsx** — Removed MOCK_WEEK + MOCK_MONTH, added fetch from /api/dashboard/team-workload?period=X

## Pattern Applied
Each component follows the same pattern:
- Remove mock data constants entirely
- Add `useState<DataType | null>(null)`, `useState(true)` for loading, `useState<string | null>(null)` for error
- Add `useEffect` with fetch to existing API route
- Add loading skeleton, error message, and empty state before main render
- Keep all existing UI/rendering code intact, only change data source

## Key Design Decisions
- engagement-score-center: Made `icon` optional in EngagementCategory since API can't serialize React components; added CATEGORY_ICON_MAP for client-side mapping
- team-workload-planner: API returns data directly (not wrapped in `{ data }`), so `setData(res)` instead of `setData(res.data)`
- weekly-digest-report: Uses `?week=previous/current` query param instead of two separate mock constants

## Verification
- `bun run lint`: 0 new errors (pre-existing set-state-in-effect warnings unchanged)
- Dev server running on port 3000
- Zero MOCK_ references remain in any modified file
