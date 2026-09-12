## Task ID: 5
## Agent: Onboarding & Cookie Consent Agent

### Part 1: Onboarding Flow

Created `/src/components/dashboard/onboarding-flow.tsx` — a full-screen multi-step onboarding wizard with 6 steps:

1. **Welcome Step** — "Welcome to AcquisitionOS!" with animated Rocket icon, pulsing Sparkles, brief description of the platform, "Get Started" button, and 3 feature cards (Find Leads, Auto Outreach, Close Deals)

2. **About You Step** — Name (required), Company Name, Country (select from COUNTRY_OPTIONS), Phone number. Uses Input and Select components with primary-colored border styling.

3. **Target Markets Step** — Multi-select niches using NICHE_OPTIONS from types.ts (22 options rendered as ChipButton pills that toggle on/off with checkmarks). Multi-select countries from COUNTRY_OPTIONS (6 options). Shows count of selections.

4. **Preferred Channels Step** — Multi-select from 5 channels (Email, WhatsApp, LinkedIn, Instagram, Phone). Each rendered as a card with icon, label, and check animation. Grid layout (1 col mobile, 2 col desktop).

5. **Connect Tools Step** — Optional: Gmail connect button (red Mail icon), Telegram setup button (sky MessageCircle icon). Clicking toggles connected/not-connected state with Badge updates. "You can always connect these later" hint.

6. **Complete Step** — Celebration confetti animation (50 colored particles falling with rotation), PartyPopper icon, "Your 14-day Pro trial has started!" message, Setup Summary card showing selections (Name, Company, Country, Niches as badges, Channels as badges). "Go to Dashboard" button.

**Design features:**
- Full-screen overlay with dark backdrop (bg-black/60 backdrop-blur-sm)
- Glassmorphic card container (glass-card rounded-2xl)
- Progress bar at top animating from 0% to current step
- Step indicator dots (active = wide primary bar, completed = primary dot, future = muted dot)
- "Step X of 6" label
- Smooth framer-motion transitions between steps (AnimatePresence with horizontal slide)
- Next/Back buttons, Skip button (not on step 1 or 5)
- Purple primary color theme throughout
- Validation: Step 2 requires name, Step 3 requires at least 1 niche
- Responsive design with overflow scroll

**Integration:**
- Added to dashboard-layout.tsx with `useSyncExternalStore` for hydration-safe localStorage check
- Onboarding auto-opens when `acquisitionos_onboarding_completed` is not in localStorage
- On completion, stores `acquisitionos_onboarding_completed` and `acquisitionos_onboarding_data` in localStorage
- "Re-run Onboarding" button added to Settings > Danger Zone panel

### Part 2: Cookie Consent Banner

Created `/src/components/dashboard/cookie-consent.tsx` — fixed bottom bar with preferences modal:

**Banner:**
- Fixed bottom bar, full width, responsive padding
- Glassmorphic background (glass-strong with backdrop blur)
- Cookie icon in primary-colored container
- "We value your privacy" title
- "We use cookies to improve your experience..." description
- Three buttons in a row: "Reject Non-Essential" (ghost), "Manage Preferences" (outline), "Accept All" (primary)
- Slide-up animation with spring physics and 0.5s delay
- Responsive: stacked on mobile, side-by-side on desktop

**Manage Preferences Modal:**
- Full overlay with dark backdrop and blur
- Glassmorphic card with spring animation
- Three cookie categories with icon, description, and toggle:
  - Necessary (Shield icon, emerald, always on, disabled switch)
  - Analytics (BarChart3 icon, sky, toggleable)
  - Marketing (Megaphone icon, amber, toggleable)
- Cancel and Save Preferences buttons
- Smooth open/close with AnimatePresence

**State Management:**
- Uses `useSyncExternalStore` for reading consent from localStorage (hydration-safe, no setState in effect)
- Server snapshot returns true (don't show banner during SSR)
- Subscribes to 'storage' events for cross-tab reactivity
- Dispatches custom 'storage' event after saving consent to trigger re-render
- Stores consent in `acquisitionos_cookie_consent` (ISO timestamp)
- Stores preferences in `acquisitionos_cookie_preferences` (JSON)

### Integration Changes

**dashboard-layout.tsx:**
- Added imports for OnboardingFlow and CookieConsent
- Added `useSyncExternalStore` import
- Replaced `useEffect` + `setState` with `useSyncExternalStore` for onboarding check (fixes react-hooks/set-state-in-effect lint error)
- Added `onboardingChecked` state to prevent repeated checks
- OnboardingFlow rendered with `open` and `onComplete` props
- CookieConsent rendered at bottom of layout
- SettingsPanel now receives `onShowOnboarding` callback

**settings-panel.tsx:**
- Added `Rocket` and `RotateCcw` icon imports
- Added "Re-run Onboarding" card in Danger Zone section with purple styling
- Button clears localStorage and triggers onboarding via `onShowOnboarding` callback

### Lint Verification
- `bun run lint` passes with 0 errors (only 1 pre-existing TanStack Table warning)
- Fixed `react-hooks/set-state-in-effect` errors by using `useSyncExternalStore` instead of `useEffect` + `setState`
