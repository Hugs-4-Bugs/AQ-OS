## Task ID: 10a
## Agent: Settings & Source Analytics Agent
## Task: Add Settings Panel + Lead Source Analytics Visualization

### Work Summary

#### Feature 1: Settings Panel

**1. Created SettingsStore** (`/src/lib/settings-store.ts`):
- Zustand store with persist middleware (localStorage)
- Settings: defaultNiche, defaultCountry, notificationsEnabled, reminderCheckInterval (60s default), autoAnalyzeOnDiscover, darkMode, compactView, pipelineAutoRefresh
- Actions: updateSetting(key, value), resetAll()
- Storage key: `war-room-settings`

**2. Created SettingsPanel Component** (`/src/components/dashboard/settings-panel.tsx`):
- Dialog-based panel opened via Settings icon
- Four organized sections with dividers:
  - **Discovery Defaults**: Default Niche select (NICHE_OPTIONS), Default Country select (COUNTRY_OPTIONS), Auto-analyze on discover switch
  - **Notifications & Reminders**: Notifications enabled switch, Reminder check interval select (30s/60s/120s/300s)
  - **Display**: Dark mode switch (integrated with next-themes setTheme), Compact view switch
  - **Data**: "Export all data" button (exports leads + deals as combined JSON), "Clear all sample data" button (with AlertDialog confirmation)
- Footer: "Reset to defaults" button, version badge "v2.1.0", "Made with AI" badge
- Uses glass-card styling, section headers with colored icons, clean spacing

**3. Created Clear Data API** (`/src/app/api/settings/clear-data/route.ts`):
- POST endpoint that deletes all leads, deals, communications, activities, and reminders
- Uses Prisma transaction with proper foreign key order

**4. Integrated Settings into Dashboard Layout**:
- Added Settings icon button (Gear) in desktop sidebar footer (between Keyboard shortcuts and ThemeToggle)
- Added Settings icon button in mobile header (between Keyboard shortcuts and ThemeToggle)
- Added SettingsPanel component render at bottom of layout
- Updated footer version badge from "v2.0" to "v2.1.0"

**5. Applied Settings Where Applicable**:
- **discover-tab.tsx**: Uses defaultNiche and defaultCountry from settings store as initial values for niche/country selects; autoAnalyzeOnDiscover triggers automatic analysis of all discovered leads
- **dashboard-layout.tsx**: Uses reminderCheckInterval from settings store for the overdue check interval (instead of hardcoded 60000ms)
- **leads-tab.tsx**: Applies compactView setting — table rows use `py-1` instead of `py-2.5` when compact mode is enabled

#### Feature 2: Lead Source Analytics

**6. Updated Types** (`/src/lib/types.ts`):
- Added `SourceEffectivenessItem` interface: source, leadCount, avgConversionScore, avgReplyScore, dealsWon, pipelineValue
- Added `sourceEffectiveness: SourceEffectivenessItem[]` to InsightData interface

**7. Updated API Functions** (`/src/lib/api.ts`):
- Added SourceEffectivenessItem to imports
- Added sourceEffectiveness mapping in fetchInsights() response

**8. Updated Insights API** (`/src/app/api/insights/route.ts`):
- Added sourceEffectiveness computation:
  - Groups leads by their `source` field (defaults to "Unknown" if null)
  - For each source: counts leads, calculates avg conversion score, avg reply score, counts deals won, sums pipeline value
  - Sorts by total pipeline value descending
- Returns in the insights response

**9. Added Source Effectiveness Section to Insights Tab** (`/src/components/dashboard/insights-tab.tsx`):
- New card titled "Lead Source Effectiveness" with Layers icon
- Horizontal bar chart showing each source:
  - Bar width proportional to pipeline value
  - Color: emerald for high conversion (≥60), amber for medium (≥35), red for low (<35)
  - Source name on the left, pipeline value on the right
  - Below each bar: small text showing "X leads · Y% avg conv. · Z deals won"
  - Staggered animation with framer-motion
- Empty state with icon and helpful text when no source data available

**10. Bug Fix**:
- Fixed pre-existing parsing error in `/src/app/api/leads/discover/suggestions/route.ts`: unquoted `e-commerce` object key

### Lint Verification
- `bun run lint` passes with only the pre-existing TanStack Table warning (0 errors, 1 warning)
- Dev server compiles successfully
- Insights API verified working with sourceEffectiveness field
- Clear data API verified working
