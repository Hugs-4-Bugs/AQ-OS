// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Knowledge Base Seed Script
//
// Seeds the Support Center knowledge base with verified articles that
// document ONLY functionality that actually exists in this codebase
// (verified against src/lib/entitlement-service.ts, subscription-store,
// credit costs, payment providers and auth flows).
//
//   node scripts/seed-kb.mjs            (idempotent — upserts by slug)
//   node scripts/seed-kb.mjs --prune    (also unpublish stale slugs)
//
// SAFETY: additive only. Never touches users, tickets, payments or any
// other table. Safe to re-run.
// ═══════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const ARTICLES = [
  // ─── Getting Started ──────────────────────────────────────────────
  {
    slug: 'getting-started-with-acquisitionos',
    title: 'Getting started with AcquisitionOS',
    category: 'getting_started',
    summary: 'Set up your account, learn the dashboard layout and run your first prospecting workflow.',
    tags: ['account setup', 'dashboard', 'getting started', 'prospecting', 'first steps'],
    keywords: ['onboarding', 'tour', 'beginner', 'start', 'home'],
    sortOrder: 1,
    content: `Welcome to AcquisitionOS — an AI-driven client acquisition workspace. This guide walks you through the essentials so you can be productive in your first session.

**1. Create and verify your account**

Sign up with your email and verify it with the OTP we send you, or sign in with Google. Both options are available from the sign-in screen. If your OTP never arrives, see the "Login and account access issues" article.

**2. Learn the dashboard**

The left sidebar is the main navigation. Key areas:

- **Dashboard** — your stats, activity feed and analytics overview.
- **Leads** — discover, import, filter and analyze leads.
- **Outreach** — send messages and run multi-touch sequences.
- **Deals** — track acquisition deals through your pipeline.
- **Competitors** — run AI competitor analyses.
- **Settings** — profile, notifications, connected services and plan/billing.

**3. Understand credits**

Almost every AI action in AcquisitionOS consumes credits from your monthly balance: discovering leads, running deep analysis, generating outreach, coaching and more. Your remaining balance is always visible in the sidebar. Read "How credits work" for the exact per-action costs.

**4. Try your first discovery**

Open the Leads area, start a discovery run and the system will find businesses matching your offer profile. Each discovered lead costs 1 credit. From there you can run a Deep Lead Analysis (5 credits) to get website quality, digital maturity, decision-maker insights and ready-to-send outreach drafts.

**5. Manage your plan**

You can view plan details and upgrade any time from the billing screen (click Billing in the account menu). Downgrades are handled by our support team — see "How to downgrade your plan".`,
  },
  {
    slug: 'dashboard-basics',
    title: 'Dashboard and navigation basics',
    category: 'getting_started',
    summary: 'Where to find your stats, leads pipeline, outreach tools, notifications and settings.',
    tags: ['dashboard', 'navigation', 'stats', 'activity feed', 'notifications'],
    keywords: ['menu', 'sidebar', 'layout', 'tabs', 'where is'],
    sortOrder: 2,
    content: `The dashboard is your control center. Here is a quick map of what lives where.

**Stats and overview**

The main dashboard shows your key acquisition metrics: leads discovered, outreach activity, deal pipeline value and credit usage. Charts update as you work, so you can spot momentum or bottlenecks early.

**Working with tabs**

Each sidebar item opens a focused workspace: Leads, Outreach, Deals, Competitors, Analytics and more. Your active tab is highlighted; on smaller screens the sidebar collapses so the workspace keeps the full width.

**Notifications**

Notifications arrive in the bell menu — deal wins, lead replies, credit warnings, payment confirmations and support ticket updates. If you connect Telegram or WhatsApp in Settings → Notifications, important alerts can also reach you there.

**Account menu**

Your avatar menu (top right) gives quick access to Profile, Settings, Billing and this Support Center. Billing opens the plan selector where you can upgrade or buy credit add-ons.

**Command shortcuts**

Use the search/command palette to jump between leads, deals and sections without clicking through menus.`,
  },

  // ─── Credits ──────────────────────────────────────────────────────
  {
    slug: 'how-credits-work',
    title: 'How credits work',
    category: 'credits',
    summary: 'Every AI action has a fixed credit cost — here is the exact price list for each feature.',
    tags: ['credits', 'consumption', 'cost', 'balance', 'usage'],
    keywords: ['credit cost', 'pricing', 'deduct', 'how many credits'],
    sortOrder: 1,
    content: `Credits are the currency for AI actions in AcquisitionOS. Every plan includes a monthly credit allowance, and you can top up with add-on packs that never expire.

**Credit costs per action**

- Lead Discovery — 1 credit per lead discovered
- Outreach Message — 2 credits per message generated
- Sales Coaching — 3 credits per session
- Deep Lead Analysis — 5 credits per lead
- Data Export (PDF) — 5 credits per export
- Competitor Analysis — 8 credits per analysis
- Outreach Sequence — 8 credits per sequence

**Where you can see your balance**

Your remaining balance is always visible in the sidebar, and the credit usage breakdown in Settings shows exactly which actions consumed credits.

**What happens when you run low**

When your balance drops to 20% or less you get a low-credit warning. At zero, AI actions are blocked until your monthly reset or until you buy an add-on pack.

**Plans and monthly allowances**

Free — 50 credits/month · Starter — 150 · Pro — 750 · Elite — 2,000. See "Plans overview" for the full comparison, and "Credit add-on packs" if you need extra credits mid-cycle.

**Didn't solve your problem?**

Use the Contact Support button below and our team will check your credit ledger.`,
  },
  {
    slug: 'credit-balance-and-reset',
    title: 'Credit balance, monthly reset and rollover',
    category: 'credits',
    summary: 'When your credits reset each month, what happens to unused credits and how rollover works.',
    tags: ['credit reset', 'rollover', 'balance', 'monthly', 'expiration'],
    keywords: ['renewal', 'reset date', 'unused credits', 'carry over'],
    sortOrder: 2,
    content: `Your monthly credit allowance refreshes with your subscription cycle. This article explains exactly what happens to your balance over time.

**Monthly reset**

At the start of each billing period your monthly allowance is restored to your plan's level (Free 50, Starter 150, Pro 750, Elite 2,000). The reset follows your subscription renewal date, not the calendar month.

**Rollover of unused credits**

If you do not use all your monthly credits, the unused portion is saved as rollover on paid plans. Rollover is consumed after your fresh monthly allowance — so you never lose credits you already paid for just because you had a slow month.

**Purchased add-on credits never expire**

Credits from add-on packs (100, 500 or 1,000) are kept separate from your monthly allowance and never expire, regardless of plan.

**Checking your breakdown**

The credit display in the sidebar and the usage breakdown in Settings split your balance into monthly, rollover and add-on portions, so you always know what you have and where it came from.

**Something looks wrong?**

If your balance changed unexpectedly, contact support — we can audit your credit ledger and correct genuine errors.`,
  },
  {
    slug: 'credit-add-on-packs',
    title: 'Buying and using credit add-on packs',
    category: 'credits',
    summary: 'Add 100, 500 or 1,000 extra credits any time — add-on credits never expire.',
    tags: ['credit packs', 'add-on', 'buy credits', 'top up', 'extra credits'],
    keywords: ['purchase credits', 'addon', 'top-up', 'never expire'],
    sortOrder: 3,
    content: `Need more credits before your next monthly reset? Add-on packs let you top up instantly, on any plan.

**Available packs**

- 100 Credits — ₹499 (+ 18% GST)
- 500 Credits — ₹1,999 (+ 18% GST)
- 1,000 Credits — ₹3,499 (+ 18% GST)

**How to buy**

Open Billing from your account menu (or the Choose Your Plan screen), scroll to the Credit Add-Ons section and click Buy Now. You pay through the same secure checkout as subscriptions — card payments via Stripe, or UPI, net banking and cards via Razorpay.

**Never expire**

Add-on credits are separate from your monthly allowance and never expire. They are consumed automatically when your monthly allowance runs short.

**Seeing them in your balance**

The sidebar credit display shows the combined balance; the usage breakdown splits it into monthly, rollover and add-on portions.

**Payment succeeded but no credits?**

Credits are provisioned by the payment provider's webhook confirmation — this usually takes seconds. If your balance has not updated after a few minutes, refresh the page and check Billing → Invoices. If the invoice exists but credits are missing, contact support with the invoice reference.`,
  },

  // ─── Leads ────────────────────────────────────────────────────────
  {
    slug: 'finding-and-filtering-leads',
    title: 'Finding and filtering leads',
    category: 'leads',
    summary: 'Run lead discovery, apply filters and work your lead list efficiently.',
    tags: ['lead discovery', 'filters', 'search leads', 'prospecting', 'lead list'],
    keywords: ['find leads', 'discover', 'segments', 'search'],
    sortOrder: 1,
    content: `Lead Discovery finds businesses that match your offer profile. Here is how to get the most out of it.

**Running a discovery**

Open the Leads area and start a discovery run. Each lead found costs 1 credit, and results are added to your lead list automatically. Keep your offer profile in Settings up to date — discovery quality depends on it.

**Filtering your list**

Narrow your list by country, city, niche, score, stage and more. Filters combine, so you can slice a large list into a focused work queue (for example: high reply-score leads in one city that have not been contacted yet).

**Lead quality signals**

Every lead carries AI-estimated quality and scoring signals — reply score, conversion score, urgency and revenue potential — so you can prioritize the hottest opportunities first.

**Working a lead**

Open a lead to see the full profile: website quality, digital weaknesses, best contact person and channel, recommended services and drafted outreach messages. From there you can generate outreach, create a deal, or export the analysis as a PDF (Pro and above).

**Lead limits**

Lead discovery access depends on your plan — Free is capped at 10 leads, Starter at 25, Pro and Elite are unlimited. See "Lead limits by plan" for details.`,
  },
  {
    slug: 'lead-limits-by-plan',
    title: 'Lead limits by plan',
    category: 'leads',
    summary: 'Free 10 leads, Starter 25 leads, Pro and Elite unlimited — what happens when you hit the cap.',
    tags: ['lead limits', 'cap', 'limit reached', 'unlimited leads', 'plan limits'],
    keywords: ['maximum leads', 'quota', 'allowance', 'cap reached'],
    sortOrder: 2,
    content: `Each plan includes a monthly lead discovery allowance.

**Limits**

- Free — up to 10 leads
- Starter — up to 25 leads
- Pro — unlimited leads
- Elite — unlimited leads

**When you hit the cap**

Once you reach your plan's limit, further lead discovery stops until the allowance resets with your next billing cycle — or you upgrade to a plan with a higher limit. Your existing leads are never removed; you keep everything you already discovered.

**Upgrading for more leads**

Upgrades are self-serve: open Billing from your account menu, pick the plan you want and complete checkout. New limits apply immediately after the payment provider confirms the subscription.

**Not sure which plan fits?**

If you regularly hit the Starter cap, Pro's unlimited discovery plus deep analysis and sequences is usually the natural next step. Compare everything in "Plans overview".`,
  },
  {
    slug: 'deep-lead-analysis',
    title: 'Deep Lead Analysis explained',
    category: 'leads',
    summary: 'What the 5-credit deep analysis produces: website quality, decision makers, outreach drafts and strategy.',
    tags: ['deep analysis', 'analysis', 'website quality', 'decision maker', 'AI analysis'],
    keywords: ['analyze lead', 'audit', 'score', 'insights'],
    sortOrder: 3,
    content: `Deep Lead Analysis is AcquisitionOS's flagship AI inspection of a single lead. It costs 5 credits and is available on Pro and Elite.

**What you get**

- **Website quality and digital maturity scores** — how well the lead's online presence performs and where it is weak.
- **Weaknesses** — concrete digital gaps (missing features, poor pages, weak reviews presence) you can sell against.
- **Decision-maker insights** — the likely contact name and role, the best channel to reach them, and the recommended approach style.
- **Ready-to-send outreach drafts** — email subject and body, WhatsApp message, LinkedIn message and Instagram DM, personalized from the analysis.
- **Closing strategy and deal estimates** — recommended services, estimated deal value and a best-contact-time recommendation.

**Running an analysis**

Open any lead and choose Deep Analysis. The run takes a few seconds to a minute depending on the lead's web presence, and the result is stored on the lead permanently — you only pay once per analysis.

**Stale analyses**

If a lead's website state changes after the analysis was generated, the analysis can be flagged as stale so you know to re-run it before reaching out.

**Exports**

You can export the full analysis as a branded PDF (5 credits) to share with your team or use in a pitch — available on Pro and above.`,
  },

  // ─── Outreach ─────────────────────────────────────────────────────
  {
    slug: 'outreach-messages',
    title: 'Generating and sending outreach messages',
    category: 'outreach',
    summary: 'Create personalized email, WhatsApp, LinkedIn and Instagram drafts from lead analysis (2 credits per message).',
    tags: ['outreach', 'messages', 'email', 'whatsapp', 'linkedin', 'drafts'],
    keywords: ['send message', 'contact lead', 'email draft', 'personalized'],
    sortOrder: 1,
    content: `Outreach messages are AI-drafted, analysis-driven communications tailored to each lead. Generating a message costs 2 credits.

**Channels**

From a lead's profile you can draft and manage outreach across email, WhatsApp, LinkedIn and Instagram DM. The drafts reuse the lead's deep analysis — weaknesses, recommended services and decision-maker style — so the message lands with context instead of sounding generic.

**Email sending**

Connect your email account in Settings to send outreach directly from AcquisitionOS and keep replies tracked against the lead. Sent messages, opens, bounces and replies are recorded on the lead's activity timeline.

**Tracking replies**

When a lead replies, the reply is attached to the conversation on the lead and triggers a notification, so you can respond while the lead is warm.

**Limits by plan**

Free and Starter can generate up to 50 outreach messages; Pro and Elite are unlimited. Sequences (multi-touch automated follow-up) are available on Pro and above — see "Outreach sequences".`,
  },
  {
    slug: 'outreach-sequences',
    title: 'Outreach sequences (Pro and Elite)',
    category: 'outreach',
    summary: 'Automate multi-touch follow-ups with sequences — create, enroll leads, pause and resume.',
    tags: ['sequences', 'automation', 'follow-up', 'drip', 'multi-touch'],
    keywords: ['sequence', 'automated outreach', 'follow ups', 'enroll'],
    sortOrder: 2,
    content: `Sequences automate your follow-up: a lead enters a sequence and receives a series of touchpoints over the following days, with you stepping in when they reply. Starting a sequence costs 8 credits. Available on Pro and Elite.

**Creating a sequence**

In the Outreach area, create a sequence and define its steps — the initial message and timed follow-ups. Drafts can be AI-generated per lead, personalized from their analysis.

**Enrolling leads**

Enroll leads individually or in bulk from your filtered lead list. Each enrolled lead tracks its own progress through the steps, and replies pause the automation so a human (you) takes over at the right moment.

**Managing sequences**

Pause, resume and monitor sequences from the sequences dashboard. Analytics show enrollment counts, step completion and replies so you can see which sequences convert.

**Do not touch credits for reads**

Reviewing sequence progress and analytics costs nothing — credits are consumed when the sequence runs outreach, not when you inspect it.`,
  },

  // ─── AI Features ──────────────────────────────────────────────────
  {
    slug: 'ai-features-overview',
    title: 'AI features: coaching, proposals and competitor analysis',
    category: 'ai_features',
    summary: 'What each AI feature does and what it costs — sales coaching (3), proposals (10), competitor analysis (8).',
    tags: ['AI', 'sales coaching', 'proposal', 'competitor analysis', 'chatbot'],
    keywords: ['ai assistant', 'coaching', 'pitch', 'proposal generation', 'competitors'],
    sortOrder: 1,
    content: `AcquisitionOS includes several focused AI assistants. All of them run on credits and are available on Pro and above.

**Sales Coaching — 3 credits per session**

A coaching session helps you prepare for a specific deal: objection handling, positioning and next-step strategy based on the deal and lead context.

**Proposal Generation — 10 credits per proposal**

Generates a client-ready proposal from the lead's analysis: scope, recommended services and pricing structure aligned with the weaknesses and opportunities found. Export the result as a branded PDF.

**Competitor Analysis — 8 credits per analysis**

Produces an AI report on a competitor: their web presence, positioning and gaps you can exploit. Store multiple analyses and compare them over time.

**AI assistant and chatbot**

Pro and above include the AI assistant for free-form questions about your pipeline and leads, with chat sessions saved so you can continue later.

**Credit consumption questions?**

If an AI action failed but credits were consumed, contact support with the approximate time of the action — we can inspect your credit ledger and restore wrongly consumed credits.`,
  },

  // ─── Plans & Billing ──────────────────────────────────────────────
  {
    slug: 'plans-overview',
    title: 'Plans overview: Free, Starter, Pro and Elite',
    category: 'plans_billing',
    summary: 'Full comparison of limits, credits and features across the four AcquisitionOS plans.',
    tags: ['plans', 'free', 'starter', 'pro', 'elite', 'comparison', 'pricing'],
    keywords: ['plan comparison', 'tiers', 'which plan', 'upgrade options'],
    sortOrder: 1,
    content: `AcquisitionOS has four plans. All paid plans include the monthly credit allowance and GST is added at checkout (18%).

**Free — ₹0**

50 credits/month · up to 10 leads · basic discovery and outreach messages (50) · basic dashboard. AI analysis, sequences, exports and API access are not included.

**Starter — ₹499/month (₹4,999/year)**

150 credits/month · up to 25 leads · same feature set as Free — ideal for validating your workflow before committing.

**Pro — ₹1,599/month (₹14,999/year)**

750 credits/month · unlimited leads · all AI features: deep analysis, sequences, sales coaching, proposals, competitor analysis, PDF export · Gmail integration · workflows · API access · AI assistant · 3 team members.

**Elite — ₹5,199/month (₹44,999/year)**

2,000 credits/month · unlimited everything · all Pro features plus WhatsApp and Telegram integrations · 10 team members · white-label reports · custom integrations.

**Yearly billing**

Yearly plans cost less than 12× the monthly price (for example Pro yearly saves ₹4,189 vs monthly). The exact saving is shown on each card before checkout.

**Changing plans**

Upgrades are self-serve from Billing. Downgrades are handled by support — see "How to downgrade your plan".`,
  },
  {
    slug: 'upgrade-your-plan',
    title: 'Upgrading your plan',
    category: 'plans_billing',
    summary: 'How to upgrade to Starter, Pro or Elite and when the new limits apply.',
    tags: ['upgrade', 'change plan', 'billing', 'checkout', 'switch plan'],
    keywords: ['buy plan', 'subscribe', 'get pro', 'get elite', 'annual'],
    sortOrder: 2,
    content: `Upgrades are fully self-serve and take effect as soon as your payment is confirmed.

**Step by step**

1. Open your account menu (top right) and click **Billing** — or open any screen that shows the plan selector.
2. Compare plans on the cards, switch between Monthly and Yearly to see savings.
3. Click the upgrade button on the plan you want. If both Stripe and Razorpay are configured you will be asked to choose a gateway; otherwise checkout starts with the available one.
4. Complete the payment in the secure checkout window. Card payments run via Stripe; UPI, net banking and cards via Razorpay for Indian users.
5. You return to the app and the plan activates automatically once the payment provider confirms the payment (usually seconds).

**What applies immediately**

The new plan's credit allowance, lead limits and feature unlocks apply right away. Your existing data — leads, deals, messages, credits — is untouched.

**Switching billing cycle**

On the plan selector you can also switch your current plan between monthly and yearly billing.

**If something goes wrong**

If payment succeeded but your plan did not change, wait a minute and refresh — activation is driven by the provider's webhook. If it still has not updated, check Billing → Invoices and contact support with the invoice reference. Never pay twice for the same upgrade.`,
  },
  {
    slug: 'downgrade-your-plan',
    title: 'How to downgrade your plan',
    category: 'plans_billing',
    summary: 'Downgrades go through our support team — submit a ticket and we handle the change safely.',
    tags: ['downgrade', 'contact support', 'change plan', 'lower plan', 'cancel'],
    keywords: ['downgrade plan', 'reduce plan', 'switch to starter', 'switch to free', 'lower tier'],
    sortOrder: 3,
    content: `Downgrades are handled by our support team rather than a self-serve button — this protects you from accidentally losing features or mis-timed billing changes. Here is how the flow works.

**Step 1 — Submit the request**

In the plan selector, click **Contact Support to Downgrade** on the plan card you want to move to. A support form opens with the category, your current plan, your requested plan and your billing cycle already filled in. Add a subject and a short description of what you need, then submit.

**Step 2 — Get your reference number**

You immediately receive a ticket reference number (like SUP-2026-XXXXXX) and a confirmation notification. You can track the conversation anytime under Support → My Tickets.

**Step 3 — We process the change**

A support agent confirms the change with you and applies it through the official subscription flow with our payment provider. Nothing about your subscription is modified by the form itself — only an authorized agent can execute the change, and it goes through normal provider verification.

**What happens to your data and credits**

Your leads, deals, messages and purchased add-on credits are never deleted by a downgrade. Plan allowance changes (credits, limits, features) take effect according to your billing cycle and the plan you move to.

**Need something else?**

If your situation is urgent (double billing, wrong plan after an upgrade), set the priority to High or Urgent in the form, or reply to your ticket after submitting.`,
  },
  {
    slug: 'payment-methods-and-failures',
    title: 'Payment methods and payment failures',
    category: 'plans_billing',
    summary: 'Supported payment methods (cards, UPI, net banking) and what to do when a payment fails.',
    tags: ['payment', 'payment failure', 'UPI', 'card', 'razorpay', 'stripe', 'declined'],
    keywords: ['payment failed', 'declined', 'card error', 'billing issue', 'retry payment'],
    sortOrder: 4,
    content: `AcquisitionOS supports two payment providers so you can pay the way you want.

**Supported methods**

- **Stripe** — international and Indian credit/debit cards.
- **Razorpay** — UPI, net banking, wallets and cards (recommended for Indian users).

All prices are shown in INR and 18% GST is added at checkout. The exact total (base + GST) is displayed on every plan card and add-on before you pay.

**When a payment fails**

1. Check the error message in the checkout window — bank-declined payments usually resolve by trying another card or method.
2. Nothing is charged for failed payments; no plan or credits are provisioned.
3. Retry from the same button — the order is only completed on a confirmed payment.

**Payment succeeded but nothing changed?**

Plan and credit activation is driven by the payment provider's confirmation webhook and usually completes in seconds. If the change has not appeared after a few minutes: refresh the page, then check Billing → Invoices. If the charge appears on your bank statement but there is no invoice in the app, contact support immediately with the payment amount, method and time — do not retry the payment.

**Refunds**

For refund requests (duplicate charge, wrong plan), submit a support ticket under Billing & Subscription → Refund. Our team reviews against the refund policy and processes approved refunds through the original payment method.`,
  },
  {
    slug: 'invoices-and-billing-history',
    title: 'Invoices and billing history',
    category: 'plans_billing',
    summary: 'Where to find your invoices, receipts and subscription history.',
    tags: ['invoices', 'receipts', 'billing history', 'GST', 'invoice download'],
    keywords: ['invoice', 'receipt', 'billing page', 'payment history'],
    sortOrder: 5,
    content: `Every successful payment is recorded with an invoice you can reference any time.

**Where to look**

Open Billing from your account menu. The billing history section lists your payments — subscriptions, upgrades and credit add-on purchases — with the amount, date and status.

**Invoice details**

Each invoice includes the plan or pack purchased, the base amount, the 18% GST component and the total charged — the breakdown matches what was shown before checkout, so your accounting stays clean.

**Missing invoice?**

If a payment succeeded but no invoice appears, wait a few minutes and refresh (invoices are created on the provider's confirmation). If it is still missing, contact support under Billing & Subscription → Invoice / Receipt with the payment date and amount.

**Changing your billing details**

Profile details used for billing (name, company) can be updated in Settings → Profile. For corrections on already-issued invoices, submit a support ticket and our team will assist.`,
  },

  // ─── Account & Security ───────────────────────────────────────────
  {
    slug: 'login-and-account-access',
    title: 'Login and account access issues (OTP, Google, password)',
    category: 'account_security',
    summary: 'Fix OTP verification problems, Google sign-in errors and reset your password.',
    tags: ['login', 'OTP', 'verification', 'google login', 'password reset', 'sign in'],
    keywords: ['cannot log in', 'otp not received', 'locked out', 'forgot password', 'email verification'],
    sortOrder: 1,
    content: `Locked out? Work through these fixes for the three most common access problems.

**OTP / email verification**

1. Check your spam or promotions folder — verification emails sometimes land there.
2. Request a new OTP from the verification screen; only the latest code is valid.
3. OTP codes expire after a short window. If yours expired, request a fresh one.
4. After several wrong attempts the OTP check locks briefly to protect your account — wait a few minutes and try again with a fresh code.

**Google sign-in**

Use the "Sign in with Google" button on the sign-in screen and pick the same Google account you registered with. If you originally signed up with email + password, Google sign-in will not match that account — use your password instead, or link accounts after signing in.

**Password reset**

Use "Forgot password" on the sign-in screen. We email a one-time reset code to your registered address; set a new password right after entering it.

**Account locked or email not recognized**

Make sure you are using the exact email you registered with. If you recently requested account deletion or the address is misspelled, contact support under Account & Security → Login Issue and we will check the account state.

**Security note**

Support will NEVER ask for your password or OTP codes. Anyone requesting them is not us.`,
  },

  // ─── Troubleshooting ──────────────────────────────────────────────
  {
    slug: 'dashboard-and-error-troubleshooting',
    title: 'Dashboard problems, errors and slow requests',
    category: 'troubleshooting',
    summary: 'Quick fixes for blank screens, stuck actions, errors and slowness — before you contact support.',
    tags: ['troubleshooting', 'errors', 'slow', 'blank screen', 'browser', 'refresh'],
    keywords: ['not working', 'stuck', 'loading', 'crash', 'bug', 'broken'],
    sortOrder: 1,
    content: `Most transient issues are fixed by one of the steps below. Work top to bottom.

**1. Refresh the page**

A stale session or a half-loaded chunk can make the dashboard look broken. A hard refresh (Ctrl/Cmd + Shift + R) reloads all assets.

**2. Check your connection and retry**

AI actions (analysis, proposals, competitor runs) take seconds to a minute. If a request times out, wait a moment and retry — credits are only consumed for actions that actually run.

**3. Try another browser or private window**

AcquisitionOS supports current versions of Chrome, Firefox, Edge and Safari. Old cached data can break the UI — a private window rules out extensions and cache in one step.

**4. Check status indicators**

If outreach sends are failing, check that your email account is still connected in Settings. Payment availability depends on the configured gateway — if checkout reports a configuration problem, it is on our side and usually temporary.

**5. Report it properly**

If the problem persists, submit a ticket under Technical Troubleshooting. Include: what you clicked, what you expected, what happened instead, the time it occurred and your browser. Screenshots or error text help enormously — with those details we can usually reproduce and fix quickly.`,
  },
  {
    slug: 'using-the-support-center',
    title: 'Using the Support Center and tickets',
    category: 'troubleshooting',
    summary: 'How to search the knowledge base, submit a ticket and track the conversation to resolution.',
    tags: ['support', 'tickets', 'help', 'contact support', 'ticket status'],
    keywords: ['get help', 'support center', 'my tickets', 'reference number', 'reopen ticket'],
    sortOrder: 2,
    content: `The Support Center (Support in your account menu) is the fastest way to solve problems.

**1. Search first**

Type your question in the search box — articles rank by relevance across titles, content, categories and tags. Browsing by category works too.

**2. Try the article**

Guides include the exact steps for real AcquisitionOS features. Mark articles helpful or not helpful — the feedback directly shapes what we improve.

**3. Submit a ticket if unresolved**

Every article ends with Contact Support / Submit a Ticket buttons. When you submit, pick the category that fits, set an honest priority (Urgent is for blocked billing or access issues) and describe the problem with times and error messages.

**4. Track the conversation**

Open My Tickets to see all your requests with status and the assigned agent. Click a ticket to read replies and continue the conversation — you get notified in-app (and by email) whenever support replies or the status changes.

**5. Status meanings**

Open — received and queued · In Progress — being worked on · Waiting for You — we replied and need your input · Resolved — proposed fix delivered · Closed — finished. Reopen a closed ticket if the problem comes back.

**Privacy**

Only you and the support team can see your tickets. Internal support notes are never visible to you or other users.`,
  },

  // ─── Integrations & API ───────────────────────────────────────────
  {
    slug: 'api-access-and-keys',
    title: 'API access and API keys (Pro and Elite)',
    category: 'integrations_api',
    summary: 'Create API keys in Settings and call the AcquisitionOS API from your own tools.',
    tags: ['API', 'API keys', 'integrations', 'developer', 'access token'],
    keywords: ['api key', 'developer', 'custom integration', 'bearer token', 'api errors'],
    sortOrder: 1,
    content: `Pro and Elite plans include API access so you can connect AcquisitionOS to your own tools and workflows.

**Creating a key**

Open Settings → API Keys (or the API Keys panel from the dashboard) and create a new key. Give it a clear name and the scopes you need — keys are scoped, so a reporting integration does not need write access. Copy the key immediately when shown: for security, the full value is displayed only once.

**Using the API**

Authenticate requests with your key according to the scopes it carries. The API documentation is available at /api-docs. Usage is logged per key, so you can audit which integration called what.

**Common API errors**

- 401 — missing or invalid key: check the Authorization header.
- 403 — the key's scopes do not cover the endpoint: create a key with broader scopes.
- 429 — rate limited: slow down and retry with backoff.

**Rotating and revoking**

Revoke a key any time from the same panel — integrations using it stop immediately, so rotate by creating the new key first, switching your tool over, then revoking the old one.

**Integration help**

For custom integration questions or API behavior that looks wrong, submit a ticket under Integrations & API with the request you made (endpoint, method, time) and the response you received.`,
  },
];

async function main() {
  const prune = process.argv.includes('--prune');
  let created = 0;
  let updated = 0;

  for (const a of ARTICLES) {
    const existing = await db.knowledgeBaseArticle.findUnique({ where: { slug: a.slug } });
    if (existing) {
      await db.knowledgeBaseArticle.update({
        where: { slug: a.slug },
        data: {
          title: a.title,
          category: a.category,
          summary: a.summary,
          content: a.content,
          tags: JSON.stringify(a.tags),
          keywords: JSON.stringify(a.keywords),
          sortOrder: a.sortOrder,
          published: true,
        },
      });
      updated++;
    } else {
      await db.knowledgeBaseArticle.create({
        data: {
          slug: a.slug,
          title: a.title,
          category: a.category,
          summary: a.summary,
          content: a.content,
          tags: JSON.stringify(a.tags),
          keywords: JSON.stringify(a.keywords),
          sortOrder: a.sortOrder,
          published: true,
        },
      });
      created++;
    }
  }

  if (prune) {
    const slugs = new Set(ARTICLES.map((a) => a.slug));
    const stale = await db.knowledgeBaseArticle.findMany({ where: { published: true } });
    for (const s of stale) {
      if (!slugs.has(s.slug)) {
        await db.knowledgeBaseArticle.update({ where: { id: s.id }, data: { published: false } });
        console.log(`[seed-kb] unpublished stale article: ${s.slug}`);
      }
    }
  }

  console.log(`[seed-kb] done — created=${created} updated=${updated} total-articles=${ARTICLES.length}`);
}

main()
  .catch((e) => {
    console.error('[seed-kb] failed:', e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
