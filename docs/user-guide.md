# AcquisitionOS User Guide

> **Version**: 3.0.0  
> **Last Updated**: March 2026

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Lead Discovery](#lead-discovery)
4. [Lead Management](#lead-management)
5. [Pipeline Management](#pipeline-management)
6. [Outreach](#outreach)
7. [Workflows](#workflows)
8. [Messaging](#messaging)
9. [AI Assistant](#ai-assistant)
10. [Deals](#deals)
11. [Competitor Analysis](#competitor-analysis)
12. [Settings](#settings)
13. [Billing](#billing)
14. [Keyboard Shortcuts](#keyboard-shortcuts)
15. [FAQ](#faq)

---

## Getting Started

### Sign Up

1. Visit the AcquisitionOS login page
2. Click **"Create Account"** to switch to the signup form
3. Enter your **name**, **email**, and **password**
   - Password must be at least 8 characters with uppercase, lowercase, number, and special character
4. Check the box to agree to the Terms of Service and Privacy Policy
5. Click **"Create Account"**
6. You'll receive a verification code via email — enter it to verify your account
7. You now have a **14-day free trial** with 50 credits

**Alternative sign-up methods:**
- **Google OAuth** — Click "Continue with Google" for one-click signup
- **Magic Link** — Enter your email and click "Send Magic Link" for passwordless access

### Onboarding

After your first login, the onboarding flow will guide you through:

1. **Set your business name** — Used in outreach templates and branding
2. **Choose your industry/niche** — Helps personalize AI recommendations
3. **Connect integrations** (optional):
   - **Gmail** — Send outreach emails directly from AcquisitionOS
   - **Telegram** — Receive notifications via Telegram bot
   - **WhatsApp** — Send WhatsApp messages to leads
4. **Discover your first leads** — The AI will suggest leads based on your niche

### First Steps

Here's what to do in your first session:

1. **Discover leads** — Use the Discover tab to find potential customers
2. **Analyze a lead** — Click on a lead and run an AI analysis (5 credits)
3. **Send outreach** — Generate and send a personalized message
4. **Track in pipeline** — Move leads through pipeline stages as they progress

---

## Dashboard Overview

The main dashboard has a tabbed navigation layout with the following sections:

### Navigation Tabs

| Tab | Icon | Description |
|-----|------|-------------|
| **Overview** | LayoutDashboard | High-level stats, activity feed, quick actions |
| **Leads** | Users | Manage all leads, create new ones, import/export |
| **Discover** | Search | AI-powered lead discovery and search |
| **Pipeline** | GitBranch | Kanban board view of leads by stage |
| **Outreach** | Send | Create outreach messages and sequences |
| **Assistant** | Bot | AI chat assistant and sales coach |
| **Deals** | DollarSign | Track deals and revenue |
| **Insights** | BarChart3 | Analytics, recommendations, trends |
| **Competitors** | Swords | Competitive intelligence |
| **Workflows** | Workflow | Automation builder and templates |
| **Messaging** | MessageSquare | Broadcast campaigns and templates |

### Overview Tab

The Overview tab provides a quick snapshot of your business:

- **Stats Cards** — Total leads, deals, pipeline value, credits remaining
- **Activity Feed** — Recent actions across your account
- **Quick Actions** — Create lead, discover leads, send outreach
- **Trial Banner** — Shows days remaining in your trial (if applicable)
- **Credit Warning** — Alert when credits are running low

### Top Bar

- **Search** (⌘K) — Global search across leads, deals, and actions
- **Notifications** 🔔 — In-app notification center
- **Credit Display** — Current credit balance with color indicator
- **Theme Toggle** — Switch between light and dark mode
- **Settings** ⚙️ — Account and organization settings

---

## Lead Discovery

### AI-Powered Search

Use natural language to find potential customers:

1. Navigate to the **Discover** tab
2. Enter a search query like:
   - "SaaS companies in San Francisco with revenue over $1M"
   - "Dental clinics in Mumbai with poor websites"
   - "E-commerce stores using Shopify in the UK"
3. Click **Search** or press Enter
4. The AI will search, analyze, and score leads in real-time
5. Results appear as cards with key information

### Search Progress

During a search, you'll see progress steps:
1. **Connecting** — Establishing connection to data sources
2. **Searching** — Finding matching businesses
3. **Analyzing** — Scoring and enriching results
4. **Complete** — Results ready

### Filter Chips

Use filter chips to narrow results:
- **Niche** — Industry/vertical
- **Country** — Geographic location
- **Stage** — Current pipeline stage

### Saving Leads

Click the **"+"** button on any discovered lead card to save it to your leads database. The lead will appear in the Leads tab with a `discovered` stage.

### Discover Suggestions

The AI suggests search queries based on your niche and past searches. These appear below the search bar as clickable chips.

---

## Lead Management

### Viewing Leads

The **Leads** tab shows all your leads in a list view with:
- Business name and owner name
- Pipeline stage badge
- Score indicators (reply, conversion, urgency, revenue)
- Niche and country tags
- Email status indicator
- Last contacted date

### Filtering and Sorting

Use the filter bar at the top to:
- Filter by **stage**, **niche**, or **country**
- Search by business name, owner, or email
- Sort by date, name, stage, or any score metric
- Paginate through results

### Lead Detail Panel

Click on a lead to open the detail panel (right side sheet):

**Tabs**:
- **Overview** — Key info, scores, website quality, digital weaknesses
- **Notes** — Add, edit, pin notes
- **Activity** — Timeline of all interactions and changes
- **Communications** — Email, WhatsApp, LinkedIn messages
- **Deals** — Associated deals and their status

### Lead Scoring

Each lead has four AI-generated scores (0-100):

| Score | Meaning | What It Measures |
|-------|---------|------------------|
| **Reply Score** | Likelihood of responding to outreach | Email engagement signals, business activity |
| **Conversion Score** | Likelihood of becoming a customer | Need indicators, budget signals, timing |
| **Urgency Score** | How urgently they need your services | Recent activity, pain points, seasonal factors |
| **Revenue Potential** | Estimated deal value | Business size, market position, spending patterns |

### Enriching Leads

Click **"Enrich"** on a lead to use AI to fill in missing data:
- Find missing email addresses
- Discover social media profiles
- Update business information
- Costs 3 credits per enrichment

### Merging Duplicate Leads

If you find duplicate leads:

1. Select the leads using checkboxes
2. Click **"Merge"**
3. Choose the primary lead (data will be merged into this one)
4. Confirm the merge

### Importing Leads

Import leads from a CSV file:

1. Click the **Import** button on the Leads tab
2. Upload your CSV file or paste JSON data
3. Map CSV columns to AcquisitionOS fields
4. Preview and confirm import

### Exporting Leads

Export leads to CSV:

1. Click the **Export** button
2. Choose which leads to include (all, filtered, or selected)
3. Download the CSV file

---

## Pipeline Management

### Kanban Board

The **Pipeline** tab shows leads organized in a Kanban board:

| Stage | Color | Description |
|-------|-------|-------------|
| Discovered | Gray | Newly found, not yet contacted |
| Analyzed | Cyan | AI analysis completed |
| Contacted | Blue | First outreach sent |
| Replied | Amber | Lead has responded |
| Discussion | Orange | Active conversation ongoing |
| Proposal | Purple | Proposal or quote sent |
| Negotiation | Pink | Negotiating terms |
| Won | Green | Deal closed successfully |
| Lost | Red | Deal lost or lead declined |

### Moving Leads Through Stages

- **Drag and drop** — Click and drag a lead card to a different column
- **Move stage button** — Click the stage badge on a lead and select the new stage
- **API** — Use `POST /api/leads/[id]/move-stage`

### Collapsible Columns (Mobile)

On mobile devices, pipeline columns are collapsible. Click the column header to expand/collapse.

### Pipeline Analytics

The pipeline view includes:
- Lead count per stage
- Total pipeline value
- Conversion rates between stages

---

## Outreach

### Generating Outreach Messages

1. Open a lead and click **"Generate Outreach"**
2. The AI creates personalized messages for multiple channels:
   - **Email** — Subject line and body
   - **WhatsApp** — Concise message
   - **LinkedIn** — Connection request or message
   - **Instagram** — DM
3. Edit any message before sending
4. Costs 3 credits per generation

### Outreach Templates

Create reusable templates:

1. Navigate to **Messaging → Templates**
2. Click **"New Template"**
3. Enter name, channel, subject (for email), and content
4. Use `{{variable}}` placeholders:
   - `{{ownerName}}` — Lead's contact name
   - `{{businessName}}` — Business name
   - `{{niche}}` — Industry/niche
   - `{{city}}` — City
   - `{{country}}` — Country

### Outreach Sequences

Create multi-step outreach sequences:

1. Navigate to **Outreach** tab
2. Click **"New Sequence"**
3. Define steps with delays:
   - Day 1: Welcome email
   - Day 3: Follow-up email
   - Day 7: WhatsApp message
   - Day 14: Final follow-up
4. Enroll leads into the sequence

### Email Tracking

All sent emails include:
- **Open tracking** — Pixel-based tracking for email opens
- **Click tracking** — Link click tracking
- **Bounce detection** — Automatic bounce recording
- **Reply detection** — Linked to conversation threads

---

## Workflows

### Creating Workflows

1. Navigate to the **Workflows** tab
2. Click **"New Workflow"**
3. Define:
   - **Name and description**
   - **Trigger** — What starts the workflow
   - **Steps** — Actions to execute in order

### Trigger Types

| Trigger | Description |
|---------|-------------|
| Lead Stage Change | When a lead moves to a specific stage |
| Lead Reply | When a lead responds to outreach |
| Score Change | When a lead's score crosses a threshold |
| Manual | Triggered by user action |
| Scheduled | Runs on a recurring schedule |
| Payment Received | When a payment is completed |

### Step Types

| Step | Description |
|------|-------------|
| Action | Send email, update lead, create task |
| Condition | Branch based on lead data (if/else) |
| Delay | Wait for a specified duration |
| AI Action | Use AI to generate content or make decisions |

### Workflow Templates

Use pre-built templates for common automations:

- **Lead Nurture** — Auto-nurture new leads with email sequences
- **Follow-up Reminders** — Remind you to follow up with unresponsive leads
- **Score-based Routing** — Route high-scoring leads for priority outreach
- **Deal Stage Automation** — Auto-update pipeline stages based on actions

### Monitoring Workflows

- **Executions** — View all workflow runs with status and timing
- **Logs** — Step-by-step execution details
- **Metrics** — Success rate, average duration, error rate

### Pausing and Resuming

- **Pause** — Temporarily stop a running execution
- **Resume** — Continue a paused execution
- **Cancel** — Permanently stop an execution

---

## Messaging

### Broadcast Campaigns

Send messages to multiple leads at once:

1. Navigate to **Messaging → Broadcasts**
2. Click **"New Broadcast"**
3. Configure:
   - **Name** — Campaign name
   - **Channel** — Email, WhatsApp, or Telegram
   - **Audience Filter** — Define who receives the message
   - **Message Content** — Compose or use a template
   - **Schedule** — Send now or schedule for later
4. Review and confirm

### Audience Filters

Target specific segments:
- **By stage** — e.g., all leads in "discovered" stage
- **By niche** — e.g., all SaaS companies
- **By score** — e.g., leads with conversion score > 70
- **By country** — e.g., leads in the US
- **Combinations** — Stack multiple filters

### Broadcast Status

| Status | Description |
|--------|-------------|
| Draft | Not yet sent, still editable |
| Scheduled | Scheduled for future delivery |
| Running | Currently sending messages |
| Paused | Temporarily stopped |
| Completed | All messages sent |
| Cancelled | Cancelled by user |

### Delivery Stats

After sending, track:
- **Total sent** — Messages dispatched
- **Delivered** — Successfully delivered
- **Opened** — Recipient opened the message
- **Replied** — Recipient responded
- **Bounced** — Failed to deliver

---

## AI Assistant

### Chat Interface

The **Assistant** tab provides an AI chat interface that acts as your sales coach:

1. Open the **Assistant** tab
2. Type your question or request
3. The AI responds with context-aware suggestions

### Capabilities

- **Lead analysis** — "Tell me more about Acme Corp"
- **Outreach coaching** — "How should I approach this lead?"
- **Strategy advice** — "What's the best channel for SaaS leads?"
- **Data insights** — "Which leads should I follow up with today?"
- **Message drafting** — "Write a follow-up email for this lead"

### Sales Coach Mode

Enable **Sales Coach** mode for:
- Objection handling techniques
- Closing strategies
- Pricing negotiation tips
- Competitive positioning advice

### Context Awareness

The assistant is context-aware:
- It knows which tab you're on
- It can reference the currently selected lead
- It has access to your lead data and scores

---

## Deals

### Creating Deals

1. Open a lead and click **"Create Deal"**
2. Fill in:
   - **Project type** — Website, SEO, Social Media, etc.
   - **Proposed price** — Initial quote
   - **Currency** — USD, INR, etc.
   - **Description** — Project details
3. Save the deal

### Deal Status

| Status | Description |
|--------|-------------|
| Draft | Being prepared |
| Sent | Proposal sent to client |
| Viewed | Client has viewed the proposal |
| Negotiation | Discussing terms |
| Accepted | Deal won! |
| Rejected | Deal lost |

### Tracking Revenue

The **Deals** tab shows:
- All deals with status, value, and associated lead
- Total pipeline value
- Won vs. lost ratio
- Average deal value

---

## Competitor Analysis

### Adding Competitors

1. Navigate to the **Competitors** tab
2. Click **"Add Competitor"**
3. Enter:
   - **Competitor name**
   - **Competitor website URL**
   - **Your business name** (optional — for comparison)
   - **Your website URL** (optional — for comparison)
4. The AI analyzes the competitor (costs 8 credits)

### Analysis Results

Each analysis includes:

| Metric | Description |
|--------|-------------|
| SEO Score | Search engine optimization quality (0-100) |
| Social Score | Social media presence strength (0-100) |
| Threat Level | Low, medium, or high |
| Strengths | What they do well |
| Weaknesses | Areas where they underperform |
| Opportunities | Gaps you can exploit |
| Threats | Risks they pose to your business |
| Tech Stack | Technologies they use |
| Pricing Model | Their pricing strategy |
| Traffic Tier | Estimated traffic volume |
| Differentiation | Ways to stand out from them |

### SWOT Analysis

The AI provides a structured SWOT analysis for each competitor, helping you position your offerings strategically.

---

## Settings

Access settings by clicking the **⚙️** icon in the top bar.

### Profile

Update your personal information:
- **Name** — Display name
- **Email** — Login email (requires re-verification)
- **Phone** — Phone number
- **Country** — Location
- **Avatar** — Profile picture URL

### Password

Change your password:
1. Enter your current password
2. Enter and confirm your new password
3. All other sessions are signed out for security

### Security

- **MFA (Two-Factor Auth)** — Enable TOTP-based two-factor authentication
  - Scan the QR code with an authenticator app (Google Authenticator, Authy)
  - Save your backup codes in a secure location
- **Active Sessions** — View and manage all active sessions
- **Known Devices** — Review devices that have logged into your account
- **Security Alerts** — View alerts about suspicious activity

### Notifications

Configure how you receive notifications:

| Channel | Types |
|---------|-------|
| In-App | All notifications (default: on) |
| Email | Important notifications (default: on) |
| Telegram | Real-time alerts (requires Telegram bot) |
| WhatsApp | Critical alerts only |

**Do Not Disturb**: Set quiet hours with timezone support.

### API Keys

Create API keys for programmatic access:

1. Go to **Settings → API Keys**
2. Click **"Create API Key"**
3. Enter a name and select scopes
4. Copy the key immediately (it's shown only once)

**Scopes**:
- `leads:read`, `leads:write`
- `pipeline:read`, `pipeline:write`
- `outreach:read`, `outreach:write`
- `deals:read`, `deals:write`
- `competitors:read`, `competitors:write`
- `insights:read`
- `assistant:read`
- `billing:read`, `billing:write`

**Key Management**:
- Set expiration dates
- Rotate keys (generates new key, old key still works until expiry)
- Revoke keys instantly
- View usage analytics per key

### Organization Settings

If you're on a team plan:

- **Organization name and logo**
- **Custom branding** — Primary color, accent color
- **White-label** — Hide AcquisitionOS branding
- **Custom domain** — Use your own domain
- **Team members** — Invite and manage team members with roles

**Roles**:
| Role | Permissions |
|------|------------|
| Owner | Full access + billing |
| Admin | All features + user management |
| Member | Standard access |
| Viewer | Read-only access |

### Data & Privacy

- **Cookie consent** — Manage cookie preferences
- **Privacy settings** — Control data sharing
- **Data export** — Download all your data (GDPR)
- **Account deletion** — Request permanent deletion

---

## Billing

### Plans

| Feature | Free | Pro | Elite |
|---------|------|-----|-------|
| **Monthly Credits** | 50 | 200 | 500 |
| **Lead Discovery** | ✅ | ✅ | ✅ |
| **Deep Analysis** | ❌ | ✅ | ✅ |
| **Outreach Generation** | ✅ | ✅ | ✅ |
| **Competitor Analysis** | ❌ | ✅ | ✅ |
| **Workflow Automation** | ❌ | ✅ | ✅ |
| **Team Members** | 1 | 3 | Unlimited |
| **API Access** | ❌ | ✅ | ✅ |
| **White-Label** | ❌ | ❌ | ✅ |
| **Priority Support** | ❌ | ❌ | ✅ |
| **Price (INR)** | ₹0 | ₹2,499/mo | ₹7,999/mo |
| **Price (USD)** | $0 | $29/mo | $89/mo |

**Annual discounts**: Save ~20% with yearly billing.

### Credits

Credits are the currency of AcquisitionOS. Each AI action consumes credits:

| Action | Credits |
|--------|---------|
| Lead Discovery (per lead) | 5 |
| Deep Analysis | 10 |
| Outreach Generation | 3 |
| Competitor Analysis | 8 |
| Website Analysis | 5 |
| AI Chat Message | 1 |
| Lead Enrichment | 3 |
| Broadcast Message | 1 |

**Credit Balance** includes:
- **Monthly allocation** — Refreshed each billing cycle
- **Rollover credits** — Unused credits from previous month (Pro+)
- **Addon credits** — Purchased separately
- **Total** — Sum of all credit sources

**Credit Warnings**:
- 🟢 **OK** — Above 20% of monthly allocation
- 🟡 **Low** — Below 20% of monthly allocation
- 🔴 **Zero** — No credits remaining

### Credit Addons

Purchase additional credits when you need them:
- 50 credits — ₹499 / $6
- 200 credits — ₹1,799 / $19
- 500 credits — ₹3,999 / $45

### Upgrading

1. Go to **Settings → Billing** or click the upgrade banner
2. Choose your plan and billing cycle
3. Select currency (INR or USD)
4. Apply a coupon code (if available)
5. Complete payment via Razorpay (INR) or Stripe (USD)

### Invoices

All payments generate invoices accessible at **Settings → Billing → Invoices**.

### Trial

- **Duration**: 14 days
- **Credits**: 50 per month
- **Features**: Free plan features
- A trial banner shows days remaining
- Upgrade anytime to keep your data

---

## Keyboard Shortcuts

Press `⌘K` (Mac) or `Ctrl+K` (Windows/Linux) to open the command palette.

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘N` / `Ctrl+N` | Create new lead |
| `⌘/` | Toggle keyboard shortcuts help |
| `Esc` | Close dialog/panel |

### Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| `1` | Go to Overview |
| `2` | Go to Leads |
| `3` | Go to Discover |
| `4` | Go to Pipeline |
| `5` | Go to Outreach |
| `6` | Go to Assistant |
| `7` | Go to Deals |
| `8` | Go to Insights |
| `9` | Go to Competitors |
| `0` | Go to Workflows |

### Action Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘F` / `Ctrl+F` | Focus search |
| `⌘S` / `Ctrl+S` | Save current item |
| `⌘E` / `Ctrl+E` | Export data |
| `?` | Show keyboard shortcuts |

---

## FAQ

### General

**Q: What is AcquisitionOS?**  
A: AcquisitionOS is an AI-powered B2B lead acquisition platform that helps you discover, analyze, and convert leads into customers using intelligent automation.

**Q: How does the credit system work?**  
A: Each AI action consumes credits. Your plan gives you a monthly allocation, and you can purchase addon credits when needed. Credits refresh at the start of each billing cycle.

**Q: Can I use AcquisitionOS for free?**  
A: Yes! The Free plan includes 50 credits/month with basic features. You also get a 14-day trial when you sign up.

### Leads

**Q: Where do discovered leads come from?**  
A: Leads are discovered using AI-powered web search and analysis. The system searches public business directories, websites, and social media to find matching businesses.

**Q: How accurate are lead scores?**  
A: Lead scores are AI-generated estimates based on publicly available data. They're useful for prioritization but should be used alongside your own judgment.

**Q: Can I import my existing leads?**  
A: Yes! Use the Import feature to upload leads from CSV or paste JSON data. Map your columns to AcquisitionOS fields during import.

### Outreach

**Q: Can I send emails directly from AcquisitionOS?**  
A: Yes, if you connect your Gmail account via Settings. Emails are sent through your Gmail with tracking enabled.

**Q: Do leads see that I'm using AcquisitionOS?**  
A: No. All outreach appears to come directly from you. There's no AcquisitionOS branding unless you choose to add it.

**Q: What's the difference between outreach and broadcasts?**  
A: Outreach is personalized one-to-one communication with individual leads. Broadcasts are one-to-many messages sent to a filtered group of leads simultaneously.

### Billing

**Q: Can I switch between monthly and yearly billing?**  
A: Yes, but changes take effect at the start of your next billing cycle.

**Q: What happens to unused credits?**  
A: On Pro and Elite plans, unused monthly credits roll over to the next month (up to your monthly allocation). Free plan credits do not roll over.

**Q: Can I get a refund?**  
A: Yes, you can request a refund through Settings → Billing. Refund policies depend on your payment provider.

### Security

**Q: Is my data secure?**  
A: Yes. AcquisitionOS uses industry-standard security measures including:
- End-to-end encryption for sensitive data
- bcrypt password hashing with 12 rounds
- JWT-based authentication with token rotation
- Rate limiting to prevent abuse
- CSRF protection
- Security headers (CSP, HSTS, X-Frame-Options)
- Audit logging for all sensitive operations

**Q: Should I enable MFA?**  
A: Absolutely. MFA adds a critical layer of security by requiring a time-based one-time password (TOTP) in addition to your password.

**Q: Can I export my data?**  
A: Yes! Under GDPR regulations, you can request a full data export at any time via Settings → Data & Privacy → Export Data. You can also use the API (`GET /api/gdpr/export`).

### Integrations

**Q: Which email providers are supported?**  
A: Gmail is the primary supported email provider, connected via OAuth. SMTP is also available for custom providers.

**Q: Can I use WhatsApp Business API?**  
A: Yes, WhatsApp integration is supported through Twilio or Meta Business API.

**Q: Is there an API?**  
A: Yes! AcquisitionOS provides a comprehensive REST API. Create API keys in Settings → API Keys. See the [API Reference](./api-reference.md) for full documentation.

---

*Last updated: 2026-03-05 • AcquisitionOS v3.0.0*
