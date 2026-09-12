## Task ID: 2a
Agent: UI Enhancement Agent
Task: Fix Cookie Consent Banner, Improve Leads Tab, Enhance Discover Tab

Work Log:

### 1. Fixed Cookie Consent Banner Positioning (`/src/components/dashboard/cookie-consent.tsx`)
- Reduced z-index from `z-[90]` to `z-[40]` — cookie banner now sits below modals and chat bubble
- Added `pb-16 sm:pb-4` padding to the outer motion.div to prevent overlap with FAB buttons in bottom-right
- Reduced inner card padding from `p-4 sm:p-5` to `p-3 sm:p-4` for a more compact banner

### 2. Improved Leads Tab Visual Polish (`/src/components/dashboard/leads-tab.tsx`)
- **Pagination Controls**: Added client-side pagination with 10 leads per page
  - Previous/Next buttons with ChevronLeft/ChevronRight icons
  - "Page X of Y" indicator between buttons
  - "Showing X–Y of Z" text on the left
  - Page resets to 1 when any filter changes
  - Pagination only appears when there are more than 10 leads
  - Both mobile card view and desktop table view use paginated data
- **"Last Updated" Column**: Added `updatedAt` column to the desktop table
  - Shows relative time (e.g., "2h ago", "3d ago", "Yesterday", "Just now")
  - Clock icon prefix for visual clarity
  - Sortable column header with ArrowUpDown icon
  - Falls back to date format (e.g., "Jan 15") for dates older than 7 days
- Added `ChevronLeft`, `ChevronRight`, `Clock` icon imports from lucide-react
- Added `currentPage`, `pageSize` state for pagination
- Added `totalPages`, `paginatedLeads` computed values via useMemo
- Changed table data source from `leads` to `paginatedLeads` for both desktop and mobile views
- Fixed pre-existing lint error in pipeline-tab.tsx (parsing error on ternary in JSX)

### 3. Enhanced Discover Tab (`/src/components/dashboard/discover-tab.tsx`)
- **"Recently Discovered" Section**: Shows the last 5 leads with `source === 'discovery'`
  - Sorted by createdAt descending
  - Each item shows business name, niche, country, city, conversion score, and relative timestamp
  - Clicking opens the lead detail panel
  - Animated with staggered slide-in (opacity + x translation)
  - Only shown when no discovery results are displayed
- **"Popular Niches" Row**: Clickable niche chips with lead counts
  - Computed from all leads data (top 8 niches by count)
  - Each chip shows niche name + count badge
  - Clicking a chip sets the niche filter in the discovery form
  - Active niche highlighted with primary color
  - Animated with staggered scale-in (spring animation)
  - Only shown when no discovery results are displayed
- **Enhanced Discovery Results Animation**:
  - Changed from simple fade+translate to spring-based animation with scale
  - `initial={{ opacity: 0, y: 20, scale: 0.95 }}` → `animate={{ opacity: 1, y: 0, scale: 1 }}`
  - Stagger delay reduced from 0.1s to 0.08s for snappier feel
  - Spring physics: `stiffness: 300, damping: 25`
- Added `fetchLeads` import from api.ts for fetching all leads
- Added `LeadStage` type import
- Added `TrendingUp` icon import for Popular Niches section
- Added `allLeadsResult` query using TanStack Query
- Added `recentlyDiscovered` and `popularNiches` useMemo computations

### 4. Fixed Pre-existing Lint Error
- Fixed pipeline-tab.tsx parsing error on line 700
- Simplified nested ternary expressions inside AnimatePresence for cleaner JSX parsing

### Lint Verification
- `bun run lint` passes with 0 errors, 1 pre-existing warning (TanStack Table incompatible library warning)
- Dev server compiles successfully

Stage Summary:
- Cookie consent banner z-index reduced to z-[40], compact padding, bottom offset for FAB overlap
- Leads tab now has pagination (10/page) with Previous/Next and "Page X of Y"
- Leads tab has "Last Updated" column with relative time display
- Discover tab has "Recently Discovered" section (last 5 discovery-source leads)
- Discover tab has "Popular Niches" row with clickable count chips
- Discovery result cards use enhanced spring animation with scale
- Pre-existing pipeline-tab.tsx parsing error fixed
- Zero new lint errors
