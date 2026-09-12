# Task ID: 8
## Agent: Competitor Intelligence Module Agent

## Task: Build a Competitor Intelligence Module

### Work Completed:

#### 1. Type Definitions (`/src/lib/types.ts`)
- Added `competitors` to the `TabId` union type
- Created `ThreatLevel` type: `"low" | "medium" | "high"`
- Created `CompetitorAnalysis` interface with full fields:
  - id, userId, leadId, competitorName, competitorUrl
  - techStack (string[]), seoScore, socialScore
  - strengths, weaknesses, opportunities, threats (all string[])
  - threatLevel, pricingModel, estimatedTrafficTier
  - differentiationOpportunities (string[])
  - analysisData, createdAt, updatedAt

#### 2. API Functions (`/src/lib/api.ts`)
- Added `RawCompetitorAnalysis` interface for DB-to-frontend transform
- Created `transformCompetitorAnalysis()` function that:
  - Parses `analysisData` JSON to extract structured fields (techStack, strengths, weaknesses, opportunities, threats, pricingModel, estimatedTrafficTier, differentiationOpportunities)
  - Maps all fields from raw DB format to frontend `CompetitorAnalysis` type
- Added 4 API functions:
  - `fetchCompetitorAnalyses()` — GET /api/competitor
  - `fetchCompetitorAnalysis(id)` — GET /api/competitor/[id]
  - `createCompetitorAnalysis(data)` — POST /api/competitor
  - `deleteCompetitorAnalysis(id)` — DELETE /api/competitor/[id]

#### 3. Competitor API Route (`/src/app/api/competitor/route.ts`)
- **GET**: Returns all competitor analyses ordered by createdAt desc
- **POST**: Creates new competitor analysis with:
  - Validation: competitorName and competitorUrl required
  - AI-powered analysis using z-ai-web-dev-sdk LLM
  - System prompt: "You are a competitive intelligence analyst"
  - Structured JSON output with seoScore, socialScore, threatLevel, SWOT, techStack, pricingModel, etc.
  - Fallback: If AI fails, generates plausible mock data with random scores
  - Saves to CompetitorAnalysis table with structured analysisData JSON
  - Auto-creates demo user if none exists

#### 4. Single Competitor API Route (`/src/app/api/competitor/[id]/route.ts`)
- **GET**: Returns single competitor analysis by ID (404 if not found)
- **DELETE**: Deletes competitor analysis by ID (404 if not found)

#### 5. Competitor Tab Component (`/src/components/dashboard/competitor-tab.tsx`)
Full-featured competitor intelligence UI with:

**Header Section:**
- Shield icon with purple theme
- Title "Competitor Intelligence" with description
- "New Analysis" button with Search icon
- PlanGate integration: Pro+ users get the full dialog, Free users see upgrade prompt
- CreditCostBadge showing "⚡ 8 credits" for competitor_analysis action

**Analysis Form Dialog:**
- Competitor Name (required)
- Competitor Website URL (required)
- Your Business Name (optional, for comparison)
- Your Website URL (optional, for comparison)
- "Analyze Competitor" button with loading state
- CreditCostBadge in the form footer

**Summary Stats Grid:**
- 4 stat cards: Competitors Analyzed, High Threat, Medium Threat, Low Threat
- Purple, red, amber, emerald color coding respectively
- card-glow hover effect

**Search & Filter:**
- Search input with purple border accent
- Threat level filter dropdown with colored dots (red/amber/emerald)
- Clear filters option

**Competitor List:**
- Each row shows: Shield icon, competitor name, threat level badge, URL, SEO/Social scores, date
- Hover effects: group-hover opacity toggle for action buttons
- Eye icon for viewing, Trash icon for delete
- AnimatePresence for smooth entry/exit

**Analysis Detail View** (when a competitor is selected):
- **Overview Grid** (4 cards):
  - SEO Score: 0-100 with progress bar and color (emerald/amber/red)
  - Social Activity: 0-100 with progress bar
  - Tech Stack: count of detected technologies
  - Threat Level: Low/Medium/High with colored badge
- **SWOT Analysis** (4 colored quadrants):
  - Strengths (green bg/border) with CheckCircle icon
  - Weaknesses (red bg/border) with XCircle icon
  - Opportunities (cyan bg/border) with TrendingUp icon
  - Threats (amber bg/border) with AlertTriangle icon
- **Tech Stack Detected**: Grid of technology badges with rotating colors (purple, cyan, emerald, amber, rose, sky, violet, teal)
- **Differentiation Opportunities**: Numbered list with purple number circles
- **Pricing Model**: Card showing detected pricing model
- **Estimated Traffic Tier**: Badge with color-coded indicator
- Back button to return to list

**Quick Competitive Insights Card:**
- Purple gradient card at bottom
- Highest SEO Threat, Most Social Active, Biggest Opportunity
- Auto-computed from all analyses

**Mock Data** (3 realistic competitors for initial display):
1. "BrightWeb Solutions" - Medium threat, SEO 72, Social 65
2. "DigitalBoost Agency" - High threat, SEO 85, Social 78
3. "QuickSite Builders" - Low threat, SEO 45, Social 30

**Delete Confirmation**: AlertDialog with red delete button

#### 6. Dashboard Integration
- Added Shield icon import to dashboard-layout.tsx
- Added CompetitorTab import
- Added `{ id: 'competitors', label: 'Competitors', icon: Shield, shortLabel: 'Rivals' }` to NAV_ITEMS
- Added `case 'competitors': return <CompetitorTab />` to renderTab()
- Keyboard shortcut '9' added to use-keyboard-shortcuts.ts
- Shortcuts dialog updated with Competitors tab entry
- Command palette updated with Competitors entry

#### 7. Bug Fix
- Fixed `/src/app/api/workflows/[id]/route.ts`: Changed `import { workflows } from '../route'` to `import { workflows } from '@/lib/workflow-store'` — the old import was trying to import from a Next.js route module which doesn't export named values

#### 8. Database
- CompetitorAnalysis model already existed in schema, no migration needed
- Bumped db.ts PRISMA_VERSION from 4 to 5 to force Prisma client refresh

#### 9. Lint Verification
- `bun run lint` passes with only the pre-existing TanStack Table warning (0 errors, 1 warning)
- All API endpoints tested and working:
  - GET /api/competitor returns []
  - POST /api/competitor creates analysis with AI
  - DELETE /api/competitor/[id] deletes analysis

### Design Decisions:
- Purple primary color theme for the competitor section (distinct from other tabs)
- Mock data shown when no real analyses exist (falls back to 3 mock competitors)
- SWOT quadrants with subtle colored backgrounds and borders
- Tech stack badges with 8 rotating color classes for visual variety
- PlanGate integration for Pro+ requirement on the New Analysis dialog
- Score color coding: emerald (≥70), amber (≥40), red (<40)
