# Task L1-group4: Replace MOCK/hardcoded data in 8 dashboard frontend components

## Agent: Mock Frontend Fix Agent

## Summary
Replaced all MOCK/hardcoded data in 8 dashboard components with real API fetch calls or proper empty/loading/error states. All UI kept intact — only data sources changed.

## Components Modified

### 1. telegram-integration-tab.tsx
- Removed `INITIAL_CHANNELS` and `INITIAL_MESSAGES` module constants
- Added `useEffect` to fetch from `/api/integrations/telegram` for connection status and notification preferences
- Channels/messages initialized as empty arrays (populated when real Telegram connection exists)
- Added `dataLoading` and `dataError` states

### 2. whatsapp-integration-tab.tsx
- Removed `MOCK_TEMPLATES`, `MOCK_ACTIVITY`, `MOCK_DAILY_VOLUME` module constants
- Added `useEffect` to fetch from `/api/integrations/whatsapp` for connection status, settings, and quality
- Added `templates`, `activityEntries`, `dailyVolume` state variables (all start empty)
- Replaced all MOCK_ references with state variables in render
- Loading skeleton now driven by API fetch completion instead of setTimeout

### 3. credit-usage-breakdown.tsx
- Removed `USAGE_DATA` constant with empty period arrays
- Added `useEffect` to fetch from `/api/dashboard/credit-usage?period=${period}` with period re-fetch
- Added `ICON_MAP` to map API icon strings (e.g., "Sparkles") to React icon components
- Added `apiTotalCredits` and `apiRemaining` from API response (falls back to subscription store)
- Added `loading` state; fixed missing JSX comment closing tag

### 4. smart-goal-tracker.tsx
- Removed `MOCK_GOALS` (9 fake goal entries across 3 periods) and `MOCK_MILESTONES` (12 fake milestones)
- Added `GOAL_ICON_MAP` for API icon string → React component mapping
- Added `DEFAULT_GOALS` and `DEFAULT_MILESTONES` with empty arrays per period
- Added `useEffect` to fetch from `/api/dashboard/goals?period=${period}`
- Goals and milestones are now state variables; `loading` state shows skeleton
- Fixed `overallPct` to handle empty goals array (returns 0 instead of NaN)

### 5. contact-relationship-mapper.tsx
- Removed `MOCK_CONTACTS` (8 fake contacts: Sarah Chen, Marcus Webb, Priya Sharma, etc.)
- Added `useEffect` to fetch from `/api/leads?limit=20`
- Maps API lead data to `ContactNode` interface with computed strength (based on score), distance (based on STRENGTH_CONFIG), size, angle
- `filteredContacts` and `summaryStats` now derive from `contacts` state
- `hoveredContact` uses `contacts` state instead of `MOCK_CONTACTS`
- Summary stats compute real values: avg score, strong relations count, active deals count
- Added `loading` state that shows LoadingSkeleton

### 6. funnel-velocity-tracker.tsx
- Replaced simulated `setTimeout` loading with actual API fetch from `/api/dashboard/funnel-velocity?period=${period}`
- Added `loading` and `error` states
- `EMPTY_FUNNEL_DATA` kept as fallback when API returns no stages
- Period changes trigger re-fetch with loading state
- Removed `ready` state (replaced by `loading`)

### 7. team-workload-planner.tsx
- Removed `emptyWorkloadData` module constant
- Added `useEffect` to fetch from `/api/dashboard/team-workload?period=${period}`
- Added `loading` and `error` states
- Added loading skeleton UI with pulse animation when fetching
- Period changes trigger re-fetch
- Removed unused `Progress` import

### 8. data-export-center.tsx
- Removed `scheduledReports` and `exportHistory` module constants (empty arrays)
- Added `useEffect` to fetch from `/api/dashboard/exports`
- `scheduledReports` and `exportHistory` are now state variables
- Added `exportsLoading` state; preserved `mounted` state for animation
- API returns `{ data: { scheduled, history } }`; maps to state

## API Routes Used
- `/api/integrations/telegram` — existing, returns config + notification preferences
- `/api/integrations/whatsapp` — existing, returns connection status + settings
- `/api/dashboard/credit-usage?period=` — existing, returns usage categories + totals
- `/api/dashboard/goals?period=` — existing, returns goals + milestones (currently empty)
- `/api/leads?limit=20` — existing, returns lead data
- `/api/dashboard/funnel-velocity?period=` — existing, returns funnel stages + metrics
- `/api/dashboard/team-workload?period=` — existing, returns workload data
- `/api/dashboard/exports` — existing, returns scheduled reports + export history

## TypeScript
- All 8 modified files compile successfully with `tsc --noEmit`
- Pre-existing errors in other files (email-outreach-performance, integration-health-monitor, workflow-analytics-dashboard) are unrelated

## Dev Server
- Running successfully on port 3000
