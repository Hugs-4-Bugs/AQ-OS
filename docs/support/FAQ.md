# AcquisitionOS — Frequently Asked Questions (FAQ)

**Last updated: 2026-09-09**

Welcome to the AcquisitionOS Help Center. Below are answers to the 30 questions we hear most often, organized into six topics: Getting Started, Pricing & Billing, Features, Integrations, Technical Issues, and Account Management.

If you can't find what you're looking for here, contact us at **support@acquisitionos.com**, browse the [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md), or use the in-app **Feedback** option — we typically respond within one business day.

> **Product:** AcquisitionOS — AI-powered client acquisition
> **Production URL:** https://acquisition.space-z.ai
> **Support:** support@acquisitionos.com · Billing: billing@acquisitionos.com
> **Docs:** [User Guide](./USER-GUIDE.md) · [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md) · [Release Notes](./RELEASE-NOTES-TEMPLATE.md)

---

## Table of Contents

**1. [Getting Started](#1-getting-started)** — Q1–Q5
**2. [Pricing & Billing](#2-pricing--billing)** — Q6–Q11
**3. [Features](#3-features)** — Q12–Q17
**4. [Integrations](#4-integrations)** — Q18–Q22
**5. [Technical Issues](#5-technical-issues)** — Q23–Q27
**6. [Account Management](#6-account-management)** — Q28–Q30
**7. [Still Need Help?](#7-still-need-help)**

---

## Quick Answers Index

In a hurry? Here's every question with a one-line answer. Click any question to jump to the full answer.

| # | Question | One-line answer |
|---|---|---|
| Q1 | What is AcquisitionOS? | An AI platform that finds leads, writes outreach, tracks deals, and books meetings. |
| Q2 | How do I create an account? | Sign up at https://acquisition.space-z.ai via email+OTP, Magic Link, or Google. |
| Q3 | Do I need a credit card to start? | No — the 14-day Free trial needs no card and doesn't auto-charge. |
| Q4 | What should I set up first? | Profile & company settings → integrations → your first discovery run. |
| Q5 | Which countries/niches are covered? | 6 countries (India, UAE, USA, UK, Canada, Australia) and 22+ niches. |
| Q6 | What plans are available? | Free (trial), Pro ₹2,499/mo, Elite ₹7,999/mo — see the full table below. |
| Q7 | How does the credits system work? | Discovery, outreach generation, analysis, and the Assistant consume credits that refill each cycle. |
| Q8 | What payment methods are accepted? | Cards via Stripe (global) or Razorpay for India — UPI, net banking, wallets included. |
| Q9 | Do I get a GST invoice? | Yes — GST invoices for INR payments appear under Billing → Invoices. |
| Q10 | Can I cancel my subscription? | Anytime, from Billing — your plan stays active until period end. |
| Q11 | What happens at my lead limit? | Discovery pauses with an upgrade prompt; everything else keeps working. |
| Q12 | How does lead discovery work? | Google Search + website scoring + AI weakness analysis produce four scores per lead. |
| Q13 | How does AI outreach work? | Select a lead → Generate → edit → Send & Log (lead + confirmation copy to you). |
| Q14 | How does the pipeline work? | A 9-stage Kanban board with drag-and-drop and automatic activity logging. |
| Q15 | How do meetings/Meet links work? | Connected Calendar + availability checking + automatic Google Meet links. |
| Q16 | What can the AI Assistant do? | Chat-based sales coaching: replies, buying signals, closing strategy, meeting intent. |
| Q17 | How do notifications work? | In-app bell alerts, plus optional Telegram push for replies/reminders/meetings. |
| Q18 | Why sign in with Google? | Password-free OAuth login that pre-authorizes Gmail and Calendar connections. |
| Q19 | Why connect Gmail? | Sends outreach from your own mailbox and syncs replies into Inbox. |
| Q20 | How do I connect Google Calendar? | Settings → Meeting Preferences → Connect, then Test Availability. |
| Q21 | How do Telegram notifications work? | Pair the AcquisitionOS bot once; get push alerts on your phone. |
| Q22 | How do API keys work? | Create scoped keys in Settings; limits are 50/500/2,000 req/hr by plan. |
| Q23 | I can't log in — what now? | Reset password, request a fresh magic link, or fall back to email/password. |
| Q24 | Outreach emails aren't sending | Check the lead has an email, Gmail is connected, limits/credits are available. |
| Q25 | Magic link expired/invalid | Links are single-use and last 15 minutes — request a fresh one. |
| Q26 | Payment done, plan not updated | Webhooks can take up to 5 minutes; then contact support with your receipt. |
| Q27 | How do I export my data? | CSV export in Leads, invoices in Billing, full archive via support. |
| Q28 | How do I reset my password? | Login page → Forgot password → follow the emailed reset link. |
| Q29 | How do I delete my account? | Settings → Account → Delete Account (or email support for verified deletion). |
| Q30 | How do I change my plan? | Billing → Change Plan; upgrades are instant, downgrades at period end. |

---

## 1. Getting Started

*New here? These five questions cover everything you need in your first ten minutes. For the guided version with screenshots, start at [User Guide §1](./USER-GUIDE.md#1-what-is-acquisitionos).*

**In this section:** what the product is · creating your account · trial requirements · first-day setup · supported countries & niches.

---

### Q1. What is AcquisitionOS?

AcquisitionOS is a B2B SaaS platform that helps agencies and service providers find and win new clients using AI. You discover business leads via Google Search, get AI-powered website scoring and analysis, send AI-personalized outreach emails, track deals in a visual pipeline, and schedule meetings with Google Calendar/Meet integration — all from one dashboard. It replaces the usual spreadsheet-plus-guesswork workflow with one connected system from first contact to closed deal.

> **Related:** [User Guide §1 — What is AcquisitionOS](./USER-GUIDE.md#1-what-is-acquisitionos)

---

### Q2. How do I create an account?

Go to https://acquisition.space-z.ai and click **Sign Up**. Choose one of three methods: email/password (you'll receive a 6-digit OTP by email to verify your address), Magic Link (a one-time login link sent to your inbox), or **Continue with Google**. Sign-up takes under a minute, and your 14-day Free trial starts immediately.

> **Related:** [User Guide §2 — Signing Up](./USER-GUIDE.md#2-signing-up)

---

### Q3. Do I need a credit card to start the free trial?

No. The Free plan includes a 14-day trial with no card required, and you get real working limits — 50 leads per month, 1 API key, and access to the core features. You only enter payment details when you choose to upgrade to Pro or Elite. We don't auto-charge or auto-convert at the end of the trial.

> **Related:** [FAQ Q6 — Plans & pricing](#6-what-plans-are-available-and-what-do-they-cost)

---

### Q4. What should I set up first after logging in?

Start with three things: (1) complete your profile and company details under **Settings** — including your service description, which the AI uses to personalize outreach; (2) connect Google Sign-in, Gmail, and Google Calendar under integrations; and (3) run your first lead discovery from the **Discover** tab. The full walkthrough with step-by-step instructions is in the [User Guide](./USER-GUIDE.md).

> **Related:** [User Guide §4–§6](./USER-GUIDE.md#4-setting-up-your-profile--company-settings)

---

### Q5. Which countries and niches does lead discovery cover?

Discovery currently supports six countries — India, UAE, USA, UK, Canada, and Australia — and 22+ business niches including Restaurants, Cafes, Gyms, Salons, Clinics, Hotels, Legal, Real Estate, Interior Design, Coaching, Manufacturing, Logistics, Dental, E-commerce, and more. Pick your niche and location in the **Discover** tab and results stream in within seconds. New niches are added regularly — check the release notes for additions.

> **Related:** [User Guide §6 — First Lead Discovery](./USER-GUIDE.md#6-running-your-first-lead-discovery)

---

## 2. Pricing & Billing

*Plans, credits, invoices, and everything money-related. Billing-specific problems have a dedicated section in the [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md#3-payment-issues), and billing@acquisitionos.com handles invoices and refunds directly.*

**In this section:** plan comparison · credits · payment methods · GST invoices · cancellation · usage limits.

---

### Q6. What plans are available and what do they cost?

| Plan | Monthly | Annual | Leads/mo | API Keys | API Rate Limit |
|------|---------|--------|----------|----------|----------------|
| **Free** | Free (14-day trial) | — | 50 | 1 | 50 req/hr |
| **Pro** | ₹2,499/mo ($29/mo) | ₹23,990/yr ($279/yr) | 500 | 5 | 500 req/hr |
| **Elite** | ₹7,999/mo ($89/mo) | ₹76,790/yr ($849/yr) | 2,000 | 50 | 2,000 req/hr |

You can upgrade or downgrade anytime from the **Billing** tab; upgrades take effect immediately and billing is prorated. Annual billing saves roughly two months versus monthly on both paid plans.

> **Related:** [User Guide §14 — Billing & Plans](./USER-GUIDE.md#14-billing--plans)

---

### Q7. How does the credits system work?

AI actions consume credits: lead discovery, AI outreach message generation, lead analysis, and AI Assistant (sales coaching) sessions all draw from your credit balance. Your balance is always visible in the dashboard and refills with each billing cycle. If you run out, upgrade your plan or wait for the next refill — you'll see a clear prompt showing your exact balance and the cost of the action instead of a silent failure.

> **Related:** [FAQ Q11 — Lead limits](#11-what-happens-when-i-hit-my-monthly-lead-limit) · [User Guide §14](./USER-GUIDE.md#14-billing--plans)

---

### Q8. What payment methods do you accept?

We accept all major credit and debit cards. Payments are processed through **Stripe** for global customers and **Razorpay** for customers in India — Razorpay also supports UPI, net banking, and wallets, which avoids international-card issues on Indian cards. Indian customers are billed in INR and automatically receive GST-compliant invoices.

> **Related:** [FAQ Q9 — GST invoices](#9-do-i-get-a-gst-invoice) · [Troubleshooting §3.2 — Card declined](./TROUBLESHOOTING-GUIDE.md#32-card-declined)

---

### Q9. Do I get a GST invoice?

Yes. If you're billed in INR via Razorpay, a GST-compliant invoice is generated for every payment and appears under **Billing → Invoices** within minutes. Make sure your company name and GSTIN are filled in under **Settings → Company** *before* paying so they appear correctly on the invoice. If details need correcting, billing@acquisitionos.com can reissue — see the Troubleshooting Guide.

> **Related:** [Troubleshooting §3.3 — GST invoice issues](./TROUBLESHOOTING-GUIDE.md#33-gst-invoice-missing-or-incorrect)

---

### Q10. Can I cancel my subscription?

Yes, anytime. Go to **Billing → Manage Subscription** and click Cancel. Your plan stays active until the end of the current billing period, after which your account moves to the Free tier. Your leads, pipeline, and data are fully preserved — nothing is deleted when you downgrade, and you can resubscribe whenever you're ready.

> **Related:** [FAQ Q30 — Changing plans](#30-how-do-i-change-my-plan-upgrade-or-downgrade)

---

### Q11. What happens when I hit my monthly lead limit?

Discovery pauses and shows an upgrade prompt when you reach your plan's lead cap — 50/month on Free, 500 on Pro, or 2,000 on Elite. Your existing leads remain fully accessible: you can still send outreach, manage the pipeline, run the Assistant, and schedule meetings. Limits reset automatically at the start of each billing cycle.

> **Related:** [FAQ Q7 — Credits](#7-how-does-the-credits-system-work) · [User Guide §6](./USER-GUIDE.md#6-running-your-first-lead-discovery)

---

## 3. Features

*How the core product works, feature by feature — one question per major capability. Every feature below is covered in depth in the [User Guide](./USER-GUIDE.md).*

**In this section:** lead discovery · AI outreach · sales pipeline · meetings & Meet links · AI Assistant · notifications.

---

### Q12. How does AI lead discovery work?

Enter a niche (e.g., "Dental") and a country/location, and AcquisitionOS searches Google for matching businesses. Each result is scored on website quality and digital presence, then the AI analyzes weaknesses — missing site, poor mobile experience, weak SEO — to estimate urgency and revenue potential. You get four scores per lead (Reply, Conversion, Urgency, Revenue Potential) plus the AI's reasoning, so you can prioritize the hottest prospects first.

> **Related:** [User Guide §6 — Discovery](./USER-GUIDE.md#6-running-your-first-lead-discovery) · [Troubleshooting §4.1 — No results](./TROUBLESHOOTING-GUIDE.md#41-lead-discovery-returns-no-results)

---

### Q13. How does AI outreach work?

Open the **Outreach** tab, select a lead, and click **Generate** — the AI writes a personalized email based on the lead's niche, its digital weaknesses, and your service description. Review and edit the draft, then click **Send & Log**. The email is delivered to the lead's company email, and a confirmation copy is automatically sent to your own inbox so you always have a record of exactly what was sent.

> **Related:** [User Guide §9 — Outreach](./USER-GUIDE.md#9-sending-outreach) · [Troubleshooting §2.1 — Not delivering](./TROUBLESHOOTING-GUIDE.md#21-outreach-emails-not-delivering--not-sending)

---

### Q14. How does the sales pipeline work?

The **Pipeline** tab is a Kanban board with nine stages: Discovered → Analyzed → Contacted → Replied → Discussion → Proposal → Negotiation → Won/Lost. Drag and drop lead cards between stages as deals progress; stage changes are logged automatically in the lead's activity history. Each card shows key scores and deal value at a glance, and the board summary tracks total pipeline value live.

> **Related:** [User Guide §8 — Pipeline](./USER-GUIDE.md#8-managing-the-pipeline)

---

### Q15. How do meetings and Google Meet links work?

Connect Google Calendar under integrations, then schedule from the **Meetings** tab — AcquisitionOS checks your real availability, respects your working hours and buffer time, and automatically generates a Google Meet link with every booking. Configure defaults (duration, buffer, timezone, and autonomy mode: Approval/Assisted/Autonomous) under **Settings → Meeting Preferences**, and use **Test Availability** to verify the connection.

> **Related:** [User Guide §11 — Meetings](./USER-GUIDE.md#11-meetings) · [Troubleshooting §4.3](./TROUBLESHOOTING-GUIDE.md#43-meeting-scheduling-requires-google-calendar)

---

### Q16. What can the AI Assistant do?

The Assistant is a chat-based sales coach that knows your pipeline. Describe your situation — "a dentist replied asking about pricing, what do I say?" — and it suggests responses, identifies buying signals and hesitation factors, recommends closing strategies, and can even detect meeting intent so you can propose slots in one click. Assistant conversations consume credits, just like outreach generation and lead analysis.

> **Related:** [User Guide §10 — Assistant](./USER-GUIDE.md#10-using-the-ai-assistant)

---

### Q17. How do notifications work?

The bell icon in the dashboard header shows in-app notifications for replies, stage changes, follow-up reminders, and meeting events. If you connect **Telegram**, you'll also receive real-time notifications on your phone, and Pro/Elite add daily digest options. Delivery is near-real-time but not instant — if alerts seem consistently delayed, see the Troubleshooting Guide.

> **Related:** [User Guide §15 — Notifications](./USER-GUIDE.md#15-notifications--feedback) · [Troubleshooting §5.2 — Delayed](./TROUBLESHOOTING-GUIDE.md#52-notifications-delayed-or-missing)

---

## 4. Integrations

*Google, Gmail, Calendar, Telegram, and the API. Integration issues (expired connections, OAuth failures) are the #1 support topic — the [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md#1-login-issues) covers all of them with numbered fixes.*

**In this section:** Google sign-in · Gmail · Google Calendar · Telegram · API keys.

---

### Q18. What are the benefits of signing in with Google?

**Continue with Google** uses OAuth, so there's no separate password to remember and no OTP step — one click signs you in securely. It also pre-authorizes the account, making it faster to connect Gmail and Google Calendar later. Your Google password is never shared with AcquisitionOS, and you can switch to email/password anytime by setting one via **Forgot password**.

> **Related:** [Troubleshooting §1.3 — Google sign-in failed](./TROUBLESHOOTING-GUIDE.md#13-google-sign-in-failed)

---

### Q19. Why do I need to connect Gmail?

Gmail connection is what actually delivers your outreach emails through your own account, which dramatically improves deliverability compared to anonymous bulk senders. Replies to your outreach also sync back into the **Inbox** tab, linked to the originating lead where possible. Note that Gmail applies a daily sending limit of roughly 500 emails per day on standard accounts — that's a Google-side cap, so pace your campaigns.

> **Related:** [User Guide §12 — Inbox](./USER-GUIDE.md#12-inbox) · [Troubleshooting §2.4 — Gmail limits](./TROUBLESHOOTING-GUIDE.md#24-hit-the-daily-gmail-sending-limit)

---

### Q20. How do I connect Google Calendar?

Go to **Settings → Meeting Preferences** (or the Calendar tab) and click **Connect Google Calendar**. Approve the OAuth permission screen — it needs calendar access and Meet link creation — then click **Test Availability** to confirm the connection is live. Once connected, scheduling a meeting automatically checks your availability and creates the calendar event with a Google Meet link.

> **Related:** [Troubleshooting §4.4 — Calendar not connected](./TROUBLESHOOTING-GUIDE.md#44-calendar-shows-not-connected)

---

### Q21. How do Telegram notifications work?

Under integrations, connect Telegram and follow the pairing steps — you'll link the AcquisitionOS bot to your Telegram account in a couple of taps. After that, you'll get push notifications for replies, reminders, and meetings directly in Telegram. It's completely optional; in-app notifications work without it, and you can mute or disconnect whenever you like.

> **Related:** [FAQ Q17 — Notifications](#17-how-do-notifications-work) · [Troubleshooting §5.2](./TROUBLESHOOTING-GUIDE.md#52-notifications-delayed-or-missing)

---

### Q22. How do API keys work?

Create keys under **Settings → API Keys**: name the key, select its scopes (read vs. read/write permissions — grant the minimum needed), and copy it immediately, because keys are shown only once at creation. Each plan includes different quotas — Free: 1 key at 50 req/hr; Pro: 5 keys at 500 req/hr; Elite: 50 keys at 2,000 req/hr. Full API documentation is at **/api-docs** on the production site.

> **Related:** [User Guide §13 — API Keys](./USER-GUIDE.md#13-api-keys)

---

## 5. Technical Issues

*Quick answers here; full step-by-step fixes (Symptom → Cause → Fix → Escalation) live in the [Troubleshooting Guide](./TROUBLESHOOTING-GUIDE.md).*

**In this section:** login problems · emails not sending · magic links · payment/webhook delays · data export.

---

### Q23. I can't log in — what should I do?

First, identify your login method. For email/password, use **Forgot password** to reset it. For Magic Links, remember they expire after **15 minutes** and are **single-use** — request a fresh one and click it promptly. For Google sign-in failures, try email/password instead. The Troubleshooting Guide has numbered fixes for every login scenario, including account locks.

> **Related:** [Troubleshooting §1 — Login issues](./TROUBLESHOOTING-GUIDE.md#1-login-issues)

---

### Q24. My outreach emails aren't sending — why?

The most common cause is that the lead has no email address on file — check the lead's detail panel. Second, verify your Gmail connection hasn't expired (reconnect under integrations if so). Third, confirm you haven't hit Gmail's ~500/day sending limit and that your credit balance isn't empty; the Outreach tab shows an explicit error naming the exact cause in every case.

> **Related:** [Troubleshooting §2 — Email issues](./TROUBLESHOOTING-GUIDE.md#2-email-issues)

---

### Q25. My magic link says it's expired or invalid. What now?

Magic links expire **15 minutes** after they're issued and can only be used **once** — clicking the link twice, or opening it on a different device, invalidates it. Request a new link from the login page and use it promptly in the same browser. Also check your spam folder, as magic-link emails sometimes land there.

> **Related:** [Troubleshooting §1.2 — Magic link](./TROUBLESHOOTING-GUIDE.md#12-magic-link-expired-or-invalid)

---

### Q26. My payment succeeded but my plan didn't update.

Plan upgrades are confirmed by a payment webhook, which can take **up to 5 minutes** to process — this resolves the vast majority of cases. Wait five minutes, hard-refresh the Billing tab (Ctrl/Cmd+Shift+R), and don't retry the payment while waiting. If your plan still hasn't updated after that, contact support@acquisitionos.com with your payment receipt and we'll activate it manually — you never lose entitlement for a completed payment.

> **Related:** [Troubleshooting §3.1 — Plan not updated](./TROUBLESHOOTING-GUIDE.md#31-payment-succeeded-but-plan-not-updated)

---

### Q27. How do I export my data?

You can export your leads (CSV) from the **Leads** tab using the Export button — it exports your current filtered view — and download invoices from **Billing → Invoices**. For a complete account data export (GDPR-style, machine-readable), email support@acquisitionos.com from your registered address and we'll provide a full archive within 30 days.

> **Related:** [User Guide §7 — Leads](./USER-GUIDE.md#7-managing-leads) · [User Guide §14 — Invoices](./USER-GUIDE.md#14-billing--plans)

---

## 6. Account Management

*Passwords, deletion, and plan changes. These actions touch your data permanently — read the full answer before confirming anything.*

**In this section:** password reset · account deletion · plan changes.

---

### Q28. How do I reset my password?

On the login page, click **Forgot password**, enter your account email, and we'll send you a reset link. Follow it promptly to set a new password — the link is valid for a limited window, so request a fresh one if it expires. If you signed up with Google, you don't have a separate password; sign in with Google or create one via the same flow. For extra security, enable 2FA under **Settings → Security** (TOTP apps like Google Authenticator are supported).

> **Related:** [Troubleshooting §1.4 — Account locked](./TROUBLESHOOTING-GUIDE.md#14-account-locked)

---

### Q29. How do I delete my account?

Go to **Settings → Account** and select **Delete Account**, then confirm. Deletion removes your leads, pipeline, and personal data in line with our data retention policy, so export anything you need first. If you'd rather pause, downgrading to Free keeps everything intact at no cost. For immediate, verified deletion, email support@acquisitionos.com from your registered address.

> **Related:** [FAQ Q27 — Data export](#27-how-do-i-export-my-data) · [User Guide §4 — Settings](./USER-GUIDE.md#4-setting-up-your-profile--company-settings)

---

### Q30. How do I change my plan (upgrade or downgrade)?

Open the **Billing** tab and click **Change Plan**, then pick Pro or Elite (or downgrade to Free). Upgrades apply instantly — you're charged a prorated amount and your limits and credits update immediately. Downgrades take effect at the end of the current billing period, so you keep everything you've paid for. Payments are handled by Stripe (global) or Razorpay (India).

> **Related:** [FAQ Q6 — Plans](#6-what-plans-are-available-and-what-do-they-cost) · [FAQ Q10 — Cancellation](#10-can-i-cancel-my-subscription)

---

## 7. Still Need Help?

We're here for you. Reach out through any of these channels:

| Channel | Details | Best for | Response time |
|---|---|---|---|
| 📧 **Email** | support@acquisitionos.com | All questions | Within one business day |
| 💳 **Billing** | billing@acquisitionos.com | Invoices, refunds, payment issues — subject line "[Billing]" | Within one business day, prioritized |
| 🛠 **Troubleshooting** | [TROUBLESHOOTING-GUIDE.md](./TROUBLESHOOTING-GUIDE.md) | Self-serve fixes for known issues | Instant |
| 📖 **User Guide** | [USER-GUIDE.md](./USER-GUIDE.md) | Full end-to-end walkthrough | Instant |
| 💬 **In-app Feedback** | Feedback option in the dashboard | Bugs and feature requests with automatic context | Reviewed continuously |

### What to include when you contact us

| Include | Why it helps |
|---|---|
| Registered account email | Locates your account instantly |
| Plan (Free/Pro/Elite) | Determines limits and entitlements |
| Exact error text or screenshot | Matches the issue to a known cause |
| Timestamp + your timezone | Correlates with server logs |
| Browser & operating system | Reproduces environment-specific bugs |
| Steps you already tried | Avoids repeating the same fixes |

**Pro tip:** the in-app **Feedback** option attaches your current tab and session context automatically — it can cut resolution time in half.

### About this document

- **Scope:** the 30 most common questions, organized by topic, with links into deeper docs.
- **Update cadence:** reviewed with every major release; pricing and limits verified against current plans.
- **Found an error or a missing question?** Use in-app **Feedback** or email support@acquisitionos.com — user suggestions shape this page.

### Document map

| Document | Read it when… |
|---|---|
| [FAQ.md](./FAQ.md) *(this page)* | You have a quick question |
| [USER-GUIDE.md](./USER-GUIDE.md) | You want the full walkthrough, start to finish |
| [TROUBLESHOOTING-GUIDE.md](./TROUBLESHOOTING-GUIDE.md) | Something is broken and you need a fix now |
| [RELEASE-NOTES-TEMPLATE.md](./RELEASE-NOTES-TEMPLATE.md) | You want to know what shipped in the latest release |
| [VIDEO-SCRIPT.md](./VIDEO-SCRIPT.md) | You prefer watching the 5-minute onboarding video |

---

*AcquisitionOS Support Documentation · Last updated: 2026-09-09 · © QuantumFusion Solutions*
