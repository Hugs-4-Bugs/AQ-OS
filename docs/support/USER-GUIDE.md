# AcquisitionOS — Complete User Guide

**Last updated: 2026-09-09**

This guide walks you through AcquisitionOS end to end — from creating your account to closing your first deal. Follow it top to bottom on day one, or jump to any section using the table of contents.

> **App:** https://acquisition.space-z.ai
> **Support:** support@acquisitionos.com · Billing: billing@acquisitionos.com
> **More help:** [FAQ](./FAQ.md) · [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md)

---

## Table of Contents

1. [What is AcquisitionOS?](#1-what-is-acquisitionos)
2. [Signing Up](#2-signing-up)
3. [First-Login Dashboard Tour](#3-first-login-dashboard-tour)
4. [Setting Up Your Profile & Company Settings](#4-setting-up-your-profile--company-settings)
5. [Connecting Integrations](#5-connecting-integrations)
6. [Running Your First Lead Discovery](#6-running-your-first-lead-discovery)
7. [Managing Leads](#7-managing-leads)
8. [Managing the Pipeline](#8-managing-the-pipeline)
9. [Sending Outreach](#9-sending-outreach)
10. [Using the AI Assistant](#10-using-the-ai-assistant)
11. [Meetings](#11-meetings)
12. [Inbox](#12-inbox)
13. [API Keys](#13-api-keys)
14. [Billing & Plans](#14-billing--plans)
15. [Notifications & Feedback](#15-notifications--feedback)
16. [Keyboard Shortcuts & Command Palette](#16-keyboard-shortcuts--command-palette)

---

## 1. What is AcquisitionOS?

**Goal:** Understand what the platform does and how the pieces fit together.

AcquisitionOS is an AI-powered client acquisition platform for agencies, freelancers, and service businesses. It replaces the messy spreadsheet-plus-guesswork workflow with one connected system:

- **Discover** — find real businesses via Google Search, scored by AI for urgency and revenue potential.
- **Analyze** — each lead's website and digital presence is graded to surface selling angles (missing site, poor SEO, weak mobile experience).
- **Outreach** — generate personalized emails with AI in one click, sent through your own Gmail.
- **Pipeline** — track every deal from Discovered to Won on a Kanban board.
- **Meetings** — book calls with automatic Google Meet links and availability checking.
- **Assistant** — a chat-based AI sales coach that knows your pipeline.

**The core loop:** Discover → Analyze → Outreach → Reply → Meet → Close.

**Tip:** Everything runs in the browser at https://acquisition.space-z.ai — nothing to install.

[Screenshot: High-level product diagram showing the discovery-to-close loop]

---

## 2. Signing Up

**Goal:** Create your account and verify your email in under a minute.

### Steps

1. Go to **https://acquisition.space-z.ai** and click **Sign Up**.
2. Choose one of three methods:

   | Method | How it works | Best for |
   |---|---|---|
   | **Email + Password** | Enter name, email, and a password (min. 8 characters). A 6-digit OTP is emailed to you — enter it to verify. | Users who want a standalone password |
   | **Magic Link** | Enter your email and click the one-time link we send you. Links are **single-use** and **expire in 15 minutes**. | Password-free, quick sign-in |
   | **Continue with Google** | One-click OAuth sign-in with your Google account. | Fastest setup; pre-approves Gmail/Calendar connections |

3. If you chose email/password, check your inbox for the **verification code** and enter it on the next screen. Only the newest code is valid.
4. Complete your name and you're in — your 14-day Free trial starts immediately. No credit card required.

### Tips

- Sign up with **Google** if you plan to use Gmail outreach and Calendar meetings — it makes those connections smoother later.
- Didn't get the OTP? Check spam, wait a minute, then use **Resend code**.
- Enable two-factor authentication (2FA) after your first login: **Settings → Security** (works with TOTP apps like Google Authenticator).

[Screenshot: Sign-up page showing the three sign-up options]

---

## 3. First-Login Dashboard Tour

**Goal:** Know where everything lives before you start working.

### The sidebar

The left sidebar is your navigation hub. Main tabs:

| Tab | What it does |
|---|---|
| **Overview** | Your home dashboard: KPIs (total leads, hot leads, reply rate, close rate, avg deal value), pipeline funnel, and AI recommendations of what to do next |
| **Discover** | Run AI-powered lead discovery by niche and location |
| **Leads** | Your full lead database with filters, search, and the lead detail panel |
| **Pipeline** | Kanban board tracking deals across nine stages |
| **Outreach** | Generate and send AI-personalized emails |
| **Inbox** | Gmail-synced replies from your outreach |
| **Meetings** | Schedule and manage meetings with Google Meet links |
| **Calendar** | Your connected Google Calendar availability and bookings |
| **Assistant** | Chat with the AI sales coach |
| **Workflows** | Automation sequences (Pro plan and above) |
| **Settings** | Profile, company, security, integrations, API keys, preferences |

Depending on your plan you'll also see **Insights** (analytics), **Competitors**, **Messages**, **Team**, and **Billing**.

### Other chrome to know

- **Command palette** — press **Ctrl/Cmd + K** to jump to any tab, lead, or action.
- **Notifications bell** — top of the header; in-app alerts for replies, reminders, and meetings.
- **Credit balance** — visible near the header; consumed by AI actions (discovery, outreach generation, analysis, assistant).

**Tip:** The Overview tab's AI recommendations are a great daily starting point — they point you to the hottest leads and overdue follow-ups.

[Screenshot: Annotated dashboard screenshot with sidebar, header, bell, and credit balance labeled]

---

## 4. Setting Up Your Profile & Company Settings

**Goal:** Make emails and invoices look professional from day one.

### Steps

1. Click **Settings** in the sidebar.
2. Under **Profile**, set your display name, phone, and the email you send outreach from.
3. Under **Company**, enter your **company name, website, service description, and GSTIN** (India) — this data feeds into AI outreach personalization and your GST invoices.
4. Under **Security**, enable **2FA/TOTP** for account protection.
5. Save each section — changes apply immediately.

### Tips

- A rich service description dramatically improves AI outreach quality: the AI uses it to pitch *your* offer against each lead's specific weaknesses.
- Your GSTIN must be set **before** an INR payment to appear on that invoice.

[Screenshot: Settings page with Profile and Company sections highlighted]

---

## 5. Connecting Integrations

**Goal:** Connect the four integrations that unlock the platform's full power.

| Integration | Why connect it | Where |
|---|---|---|
| **Google Sign-in** | Password-free login; pre-authorizes other Google connections | Login page / Settings |
| **Gmail** | Sends your outreach from your own mailbox (better deliverability) and syncs replies into Inbox | Settings → Integrations |
| **Google Calendar** | Real availability checking + automatic **Google Meet** link generation for meetings | Settings → Meeting Preferences |
| **Telegram** | Real-time push notifications on your phone for replies, reminders, and meetings | Settings → Integrations |

### Steps

1. Go to **Settings → Integrations**.
2. Click **Connect** on Gmail, approve the Google OAuth screen (send + read permissions), and send a test message to yourself.
3. Go to **Settings → Meeting Preferences**, click **Connect Google Calendar**, then click **Test Availability** to confirm slots appear.
4. Connect Telegram and follow the bot pairing steps.
5. Each integration shows a green "Connected" badge when live.

### Tips

- If you change your Google password later, reconnect Gmail and Calendar — tokens are revoked on password changes (see Troubleshooting 2.3/4.4).
- Gmail accounts have a ~**500 emails/day** sending cap (Google's limit, not ours). Pace your campaigns.

[Screenshot: Integrations page showing all four connection cards with status badges]

---

## 6. Running Your First Lead Discovery

**Goal:** Find your first batch of scored, analyzable leads.

### Steps

1. Open the **Discover** tab.
2. Pick a **niche** from the list — e.g., Restaurant, Cafe, Gym, Salon, Clinic, Hotel, Legal, Real Estate, Coaching, Dental, E-commerce (22+ available).
3. Pick a **country** — India, UAE, USA, UK, Canada, or Australia — and refine by city/area if you want.
4. Click **Search / Discover**. AcquisitionOS queries Google for matching businesses, then scores each one.
5. Review the results list — every lead shows **four AI scores**:
   - **Reply Score** — likelihood they respond to outreach
   - **Conversion Score** — likelihood they become a client
   - **Urgency Score** — how pressing their digital problem is (Low → Critical)
   - **Revenue Potential** — expected deal size (Low → Premium)
6. Expand a lead to see **digital weaknesses** (e.g., "no website", "not mobile-friendly", "weak SEO") and the AI's **reasoning** for the score.
7. Select the leads worth pursuing and click **Save to Leads**.

### Tips

- Lead discovery consumes credits — keep an eye on your balance.
- Sort by **Urgency** first: businesses with critical weaknesses buy fastest.
- Plan quota: Free 50/mo, Pro 500/mo, Elite 2,000/mo. Usage is shown right on the Discover tab.

[Screenshot: Discover tab with niche/location selectors and a scored results list]

---

## 7. Managing Leads

**Goal:** Keep your lead database organized and act on the best opportunities.

### Steps

1. Open the **Leads** tab — every saved lead appears here.
2. Use **filters and search** to slice by niche, country, stage, score range, tags, or "has website" status.
3. Click a lead to open the **detail panel**, which includes:
   - Contact info (email, phone, website, socials) and best contact person/channel/timing
   - All four AI scores with reasoning
   - **AI Analysis** — website quality assessment and prioritized improvement suggestions you can pitch
   - Activity history (stage changes, outreach sent, meetings)
4. Add **notes** to capture context from calls and research.
5. Set **reminders** — pick a date/time and the lead shows up in your follow-ups and notifications when due.
6. Use **tags** for your own segmentation (e.g., "hot", "Q3-campaign", "referral-possible").

### Tips

- The detail panel's "best timing" hint tells you when outreach is most likely to be read.
- Export any filtered view to CSV with the **Export** button for reporting.

[Screenshot: Leads tab with filter bar open and the lead detail panel expanded]

---

## 8. Managing the Pipeline

**Goal:** Track every opportunity from first contact to a signed deal.

### Steps

1. Open the **Pipeline** tab — a Kanban board with nine stages:

   **Discovered → Analyzed → Contacted → Replied → Discussion → Proposal → Negotiation → Won / Lost**

2. **Drag and drop** lead cards between stages as deals progress — stage changes are logged in the lead's activity history automatically.
3. Click a card to open deal tracking: set **project type, scope, proposed price, and final price** as the deal matures.
4. Watch the board's summary stats — total pipeline value and per-stage counts update live.
5. Move stale deals to **Lost** with a reason; they stay searchable for future re-engagement.

### Tips

- A deal that reaches **Replied** deserves a same-day response — reply rates collapse after 48 hours.
- Use the Overview tab's funnel view to spot bottlenecks (e.g., lots of Contacted, few Replies → improve outreach).

[Screenshot: Pipeline Kanban board with cards in multiple stages]

---

## 9. Sending Outreach

**Goal:** Send a personalized, AI-written email in under two minutes.

### Steps

1. Open the **Outreach** tab and **select a lead** (or start from a lead's detail panel).
2. Click **Generate** — the AI writes a personalized email using the lead's niche, its digital weaknesses, and your service description.
3. **Edit** the draft: adjust the subject line, tone, pricing, and call-to-action. Keep the personalization — it's what gets replies.
4. Click **Send & Log**.
5. What happens next:
   - The email is delivered to the **lead's company email**.
   - A **confirmation copy** is sent to **your** inbox — you always have proof of what was sent and when.
   - The lead's stage advances to **Contacted** and the send is logged in its activity history.

### Tips

- Outreach generation consumes credits per message.
- Respect Gmail's ~500/day limit — pace large batches across days.
- Check the **Inbox** tab for replies; the Assistant can draft your response.
- Workflows (Pro+) can automate multi-step sequences with follow-ups.

[Screenshot: Outreach tab showing lead selection, generated draft, and Send & Log button]

---

## 10. Using the AI Assistant

**Goal:** Get on-demand sales coaching grounded in your actual pipeline data.

### Steps

1. Open the **Assistant** tab.
2. Chat about your real situation, for example:
   - *"A salon owner replied asking about pricing — how do I respond without discounting?"*
   - *"I have 20 leads in Discussion but nothing closing. What am I doing wrong?"*
3. The Assistant responds with **recommended replies**, identifies **buying signals** and **hesitation factors**, and suggests **closing strategies**.
4. When a conversation reaches meeting intent, the Assistant offers to **suggest meeting slots** — one click takes you to scheduling.
5. Use it as a **coaching mode**: paste a lead's reply and ask "what's the best next move?"

### Tips

- Assistant conversations consume credits (sales coaching is an AI action).
- The more complete your leads' AI analysis, the smarter the Assistant's advice.
- Ask for objection-handling scripts specific to the lead's niche — it knows the context.

[Screenshot: Assistant chat showing a coaching exchange with buying signals highlighted]

---

## 11. Meetings

**Goal:** Book prospect calls with zero back-and-forth and automatic Meet links.

### Steps

1. Make sure **Google Calendar is connected** (Settings → Meeting Preferences) and passes **Test Availability**.
2. Open the **Meetings** tab and click **Schedule**.
3. Pick the lead, duration, and a slot — AcquisitionOS checks your **real availability** and only offers times you're actually free.
4. Confirm — the meeting is created on your Google Calendar and a **Google Meet link is generated automatically**.
5. The lead receives the invite details; you'll get reminders per your notification settings.

### Configure meeting preferences (Settings → Meeting Preferences)

| Setting | What it controls |
|---|---|
| **Working hours & days** | The windows bookable slots can fall in |
| **Timezone** | Slot times shown/booked in your timezone |
| **Default duration** | Length pre-filled for new meetings |
| **Buffer time** | Gap between meetings (default 15 min) so you're never back-to-back |
| **Autonomy mode** | **Approval** — you confirm every booking; **Assisted** — semi-automatic with checkpoints; **Autonomous** — bookings proceed automatically within your rules |
| **Connect / Disconnect / Test Availability** | Manage and verify the calendar link |

### Tips

- Approval mode is recommended until you trust your settings; Autonomous mode shows a confirmation dialog before activating because bookings happen without per-meeting sign-off.
- Buffer time protects your focus — 15 minutes is a good default for sales calls.

[Screenshot: Meeting scheduling dialog with availability slots and a generated Meet link]

---

## 12. Inbox

**Goal:** Read and manage replies without leaving the dashboard.

### Steps

1. Open the **Inbox** tab — it syncs with your **connected Gmail**.
2. Replies to your outreach appear here, linked to the originating lead where detected.
3. Click a message to read the thread; the lead's scores and history sit alongside for context.
4. Reply directly, or hand the reply to the **Assistant** for a suggested response.
5. Mark threads handled to keep the inbox focused on what needs action.

### Tips

- If replies stop appearing, your Gmail connection has likely expired — reconnect (Troubleshooting 2.3).
- Inbound replies can trigger notifications in-app and via Telegram — configure which events you want in Settings.

[Screenshot: Inbox tab with a lead reply and its linked lead context panel]

---

## 13. API Keys

**Goal:** Integrate AcquisitionOS data with your own tools and scripts.

### Steps

1. Go to **Settings → API Keys**.
2. Click **Create Key**, give it a descriptive name (e.g., "Zapier sync", "Internal CRM"), and select its **scopes** (read-only vs. read/write — grant the minimum needed).
3. **Copy the key immediately** — it is shown only once at creation.
4. Store it securely (secrets manager, not code or chat).
5. Read the full API documentation at **/api-docs** on https://acquisition.space-z.ai.

### Rate limits & key quotas per plan

| Plan | API Keys | Rate Limit |
|---|---|---|
| Free | 1 | 50 requests/hour |
| Pro | 5 | 500 requests/hour |
| Elite | 50 | 2,000 requests/hour |

### Tips

- Use separate keys per integration so you can revoke one without breaking the others.
- Rotate keys periodically and delete keys for decommissioned tools.
- Hitting 429 errors means you've hit your plan's rate limit — batch requests or upgrade.

[Screenshot: API Keys page with the create-key dialog and scope picker]

---

## 14. Billing & Plans

**Goal:** Pick the right plan, manage credits, and never be surprised by a charge.

### Plans at a glance

| | **Free** | **Pro** | **Elite** |
|---|---|---|---|
| Price | 14-day trial | ₹2,499/mo · ₹23,990/yr ($29/mo · $279/yr) | ₹7,999/mo · ₹76,790/yr ($89/mo · $849/yr) |
| Leads/month | 50 | 500 | 2,000 |
| API keys | 1 | 5 | 50 |
| API rate limit | 50 req/hr | 500 req/hr | 2,000 req/hr |
| Workflows | — | ✅ | ✅ |

### Credits

AI actions consume credits: **lead discovery**, **outreach message generation**, **lead analysis**, and **AI Assistant** sessions. Your balance is always visible in the dashboard and refills each billing cycle. Running low? The platform shows a clear upgrade prompt rather than failing silently.

### Managing your subscription

1. Open the **Billing** tab.
2. **Upgrade/Change plan** — pick Pro or Elite; upgrades apply instantly with prorated billing. Downgrades take effect at period end.
3. **Payment methods** — Stripe for global cards; **Razorpay** for India (UPI, net banking, wallets, domestic cards).
4. **Invoices** — download anytime; INR payments get **GST-compliant invoices** automatically (set your GSTIN in Settings → Company first).
5. **Cancel** — anytime; your plan stays active until period end and your data is preserved.

**Tip:** Annual billing saves roughly two months versus monthly on both Pro and Elite.

[Screenshot: Billing tab showing plan cards, credit balance, and invoice list]

---

## 15. Notifications & Feedback

**Goal:** Stay on top of what matters — and tell us what to improve.

### Notifications

1. The **bell icon** in the header shows in-app notifications: replies, stage changes, follow-up reminders, meeting reminders.
2. Enable **Telegram** notifications (Settings → Integrations) for real-time mobile alerts.
3. Tune which events notify you under **Settings → Notifications**.
4. Follow-up reminders you set on leads fire at their due time in your account timezone.

### Feedback

1. Click the in-app **Feedback** option (bottom-right or in the user menu).
2. Report bugs, request features, or rate new changes — feedback with context (the tab you're on) attaches automatically.
3. For anything urgent, email **support@acquisitionos.com** — we respond within one business day.

**Tip:** The feedback tool is the fastest bug channel — it tells us exactly what page and state you were in.

[Screenshot: Notifications dropdown and the feedback dialog]

---

## 16. Keyboard Shortcuts & Command Palette

**Goal:** Navigate at expert speed.

### Command palette

Press **Ctrl/Cmd + K** anywhere to open the command palette. From there you can:

- Jump to any tab (Overview, Discover, Leads, Pipeline, Outreach, Inbox, Meetings, Assistant, …)
- Search for a lead by business name and jump straight to it
- Trigger common actions (new discovery, schedule meeting, create API key)

### Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Open command palette |
| `Esc` | Close dialogs / panels |
| Sidebar navigation | Every tab is one click away; use the palette for keyboard-only flow |

**Tip:** Power users live in the command palette — it's faster than the sidebar once you know it.

[Screenshot: Command palette open with a lead search in progress]

---

## You're Ready 🚀

That's the full loop: **discover → analyze → outreach → reply → meet → close.** Start with a small discovery batch today, send five personalized emails, and let the pipeline do the tracking.

Need help at any point? **support@acquisitionos.com** · [FAQ](./FAQ.md) · [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md)
