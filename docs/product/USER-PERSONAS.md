# User Personas — AcquisitionOS

> Owner: Product. Status: Living document. Personas are based on the feature set actually shipped (discovery, scoring, outreach, meetings, pipeline, billing) and the auth/role model in `prisma/schema.prisma` (`User.role`: owner/admin/member/viewer; `Organization` + `OrgMember` models).

## How to Use This Document

Every product decision should be tested against at least one persona. When you write a feature spec, paste the relevant persona at the top. When you write copy or a tooltip, read it aloud as that persona. When you triage a bug, ask "which persona does this hurt most?"

---

## Persona 1 — "Prabhat", the Solo Agency Owner

**Role:** Founder + sole operator of a 1–2 person web-design / SEO agency.
**Company size:** 1 (solo) to 3 (solo + 2 contractors).
**Location / market:** India. Sells to local Indian businesses (restaurants, clinics, real-estate agents). Pays in INR.
**Plan today:** Pro (₹ equivalents), was on Free for 6 weeks then upgraded after the first client signed from an AcquisitionOS-sourced lead.
**Auth:** Email/password + OTP login. Has Google Calendar connected for meetings. Uses Gmail SMTP for outreach.

### Pain Points
- Has 4–6 hours a week to do sales; the rest is delivery. Cannot afford to spend that time searching Google Maps manually.
- Writes the same cold-email template over and over, personalizes maybe 10% of it. Reply rate is ~4%.
- Has no CRM. Tracks leads in a Google Sheet that he updates "later" (never). Forgets to follow up. Loses deals that said "call me next month."
- Hates paying in USD; wants an Indian invoice with GSTIN for his accounting.

### Goals
- Fill the pipeline to a 3-month backlog so he can stop selling and just deliver.
- Spend ≤ 90 minutes a week on sales, end to end.
- Have a defensible, written reason for every lead he contacts (so he can explain the approach if a prospect asks "how did you find me?").
- Get Indian invoices with GST for tax credit.

### How He Uses AcquisitionOS
1. **Monday morning, 30 min:** runs an Autonomous discovery for "restaurants in Bengaluru without a mobile-friendly site." Reviews the top 20 leads the AI scored. Approves 12 for outreach.
2. **Tuesday, 20 min:** reviews the AI-generated outreach drafts, edits 3 of them (the AI is too formal for his voice), sends all 12. Each send is BCC'd to his own inbox.
3. **Wednesday–Friday:** replies land in Gmail. The reply-intelligence module classifies them. He opens AcquisitionOS once a day for 10 min to act on "interested" + "meeting request" replies. Autonomous mode proposes meeting slots from his Google Calendar; he approves.
4. **End of month:** upgrades credits pack when he runs out, downloads his GST invoice from the billing page.

### What Makes Him Upgrade (Free → Pro → Elite)
- Hitting the free-tier lead-discovery limit mid-week (50 leads/month). The friction of stopping is higher than the upgrade cost.
- Seeing a signed client that came from an AcquisitionOS-sourced lead — that's the proof point.
- Wanting autonomous mode (Pro unlocks it) so he can set a weekly target and not touch the app daily.

### What Makes Him Churn
- A deliverability disaster: his outreach emails start landing in spam because the platform's sending reputation dropped. He'll blame the platform, not Gmail.
- An AI cost surprise: he runs a big discovery, burns all his credits in a day, and feels nickeled-and-dimed.
- The sheet-he-never-updates outperforming the platform because he can't be bothered to log in.

### How We Win Him
- Ship a **weekly digest email** ("12 new leads scored, 3 replies, 1 meeting booked") so the value is visible even when he doesn't log in.
- Make the **GST invoice + Razorpay** path flawless. He will not chase a refund through a US payment gateway.
- Keep the **AI cost predictable**: show him the credit cost *before* he runs a discovery, not after.

---

## Persona 2 — "Sarah", the Growth-Minded Freelance Marketing Consultant

**Role:** Solo consultant doing content + SEO for SaaS startups.
**Company size:** 1.
**Location / market:** US/UK. Sells to remote SaaS founders. Pays in USD.
**Plan today:** Pro, considering Elite for the team-seat feature (she's about to hire a VA).
**Auth:** Google OAuth (no password to remember). Uses Resend for outreach (higher deliverability than her Gmail).

### Pain Points
- Sells to a crowded, sceptical audience (SaaS founders get 30 cold emails a day). Generic outreach is invisible. She needs *evidence she read their site* in every email.
- Has imposter syndrome about whether a lead is "good." Wants a second opinion before she sends.
- Works from a laptop in cafes; the app must work on a 13" screen and be usable on her phone when she's on a train.
- Hates "AI-written" emails — can spot them a mile off and refuses to send anything that smells of GPT.

### Goals
- Sign 2 new retainers a quarter at $4K/mo each.
- Never send an email she'd be embarrassed to have forwarded.
- Have a credible answer to "how did you find us?" that doesn't sound like a scraper.

### How She Uses AcquisitionOS
1. Runs **targeted discovery** for "B2B SaaS with a blog that hasn't published in 60 days" — the weakness (stale blog) is the outreach hook.
2. Reads the **AI score reasoning** for each lead — uses it as a triage signal but overrides it ~20% of the time based on her own judgement.
3. Edits every AI outreach draft heavily. Uses the **AI Copilot** in the Assistant tab to rewrite subject lines ("make this punchier, less salesy, under 6 words").
4. Schedules meetings directly from the lead detail panel; sends a Google Meet link generated by the platform.

### What Makes Her Upgrade
- The **Assistant tab** (AI Copilot) — she'd pay for that alone if it were a separate product. It's the difference between "AI wrote my email" and "AI helped me write a better email."
- **Team seats** when she hires the VA — she needs the VA to run discovery but not to see her billing.
- **Custom report builder** — her retainers include monthly reporting; if the platform produces those reports she can drop a separate tool.

### What Makes Her Churn
- If the AI outreach ever sounds templated (the "I came across your website" tell). She will lose trust in one send and cancel.
- If she catches the platform sending an email she didn't approve (autonomous mode misconfiguration).
- If a prospect replies "did you use a tool to find me?" and she has no honest, non-creepy answer.

### How We Win Her
- Make the **AI reasoning visible and editable** — show the prompt, show the model's reasoning, let her steer it.
- **Never default to autonomous mode.** The default is "draft for me, I send."
- Publish a **deliverability and consent posture** — "we send as you, through your own Gmail/Resend, we never share your recipient list, we honor unsubscribes in <1 hour."

---

## Persona 3 — "Marcus", the Sales Lead at a 12-Person B2B SaaS Company

**Role:** Head of Sales / SDR team lead. Manages 3 SDRs.
**Company size:** 12 (3 in sales).
**Location / market:** US. Sells DevOps tooling to mid-market engineering leaders. Pays in USD on a company card.
**Plan today:** Elite (needs the team seats + the workflow automation + the API).
**Auth:** Google OAuth for all users. Organization with owner/admin/member roles. Team leaderboard is on.

### Pain Points
- SDRs hate the manual prospecting part of the job; it's why they churn from the role in <12 months.
- He has to build the list, score it, write the sequence, AND coach the SDRs on replies. He's spread thin.
- The team uses Salesforce as the system of record. He does not want to replace it; he wants AcquisitionOS to feed it.
- He needs **attribution**: which discovery, which outreach, which reply led to the closed-won.

### Goals
- Each SDR books 8 meetings/week (today: 3). He believes AI-assisted prospecting + reply triage gets them there.
- Cut SDR ramp time from 6 weeks to 2.
- Have a defensible pipeline forecast for the board.

### How He Uses AcquisitionOS
1. **Admin:** sets up the Organization, invites 3 SDRs as `member` role, sets the team target.
2. **Discovery:** each SDR runs discovery in their assigned vertical. Marcus reviews the leaderboard weekly.
3. **Workflows:** uses the Workflow Builder to enforce the sequence (Day 0 email → Day 3 follow-up → Day 7 LinkedIn) so SDRs can't skip steps.
4. **API:** pushes booked meetings from AcquisitionOS into Salesforce via the API key (Elite plan).
5. **Reports:** the executive-summary dashboard is his weekly board-prep artifact.

### What Makes Him Upgrade / Expand
- The **API** (Elite plan) — he needs AcquisitionOS to be a node in his stack, not an island.
- **Workflow templates** that codify his playbook (he's built them in Outreach; he'll rebuild them here if the platform is cheaper and the AI is better).
- **Team analytics** — he wants to coach SDRs on reply quality, not just activity volume.

### What Makes Him Churn
- **Data lock-in.** If he can't export his leads + sequences + meeting history to CSV/Salesforce at any time, he won't commit the team.
- **A single SDR's bad send** that gets the company domain flagged. He'll blame the platform's deliverability tooling.
- **Pricing per seat** — if Elite is $X/seat he'll only buy 3 seats; if it's credits-based he'll buy 10.

### How We Win Him
- Keep the **API first-class** — documented, versioned, rate-limited but generous, with webhooks for meeting-booked and reply-classified.
- **Role-based access** that genuinely separates billing (owner) from pipeline (member) — he needs that for SOC 2 at his own company.
- **Usage-based pricing for the SDR team** so he can scale seats without a renegotiation.

---

## Persona 4 — "Ananya", the Operator / Admin of the Platform Itself

**Role:** Internal — the person running AcquisitionOS as a SaaS business (founder, ops lead, or first hire).
**Company size:** 1–5 (the company behind AcquisitionOS).
**Location / market:** India. Pays the cloud bills in INR/USD.
**Plan today:** N/A — she has admin access to the admin endpoints.
**Auth:** Email/password + MFA (TOTP). Admin role.

### Pain Points
- Doesn't know if the app is up at 3am. Needs the on-call runbook.
- Gets a support ticket "my magic link doesn't work" and has to reproduce it. Needs diagnostic endpoints.
- Stripe webhooks fail silently. Needs to know which payments are stuck.
- Wants to kill spam signups without deleting real users by accident.

### Goals
- 99.5% uptime with zero 3am pages.
- Average support response time < 4 hours.
- Spot a billing anomaly before the customer emails about it.

### How She Uses AcquisitionOS
1. **Admin endpoints:** `/api/admin/billing`, `/api/admin/feedback`, `/api/admin/backup`, `/api/admin/refund`.
2. **Observability dashboard** (in-app) for error rate, p95, AI cost.
3. **Cron jobs:** monitors that the 12 cron endpoints fire (expire-api-keys, sdr-cycle, autonomous-outreach, etc.).
4. **Feedback / crash reports:** triages crash reports that auto-flow into the admin feedback queue.

### What Makes Her Upgrade (Internal Tooling)
- The **observability dashboard** being good enough to replace a separate Sentry/Datadog bill.
- **Crash → ticket auto-triage** (AI triage is already half-built in `src/lib/feedback/ai-triage.ts`).
- **Backup/restore** one-button scripts (already in `scripts/backup/`).

### What Makes Her Churn (Stop Running the Product)
- A data-loss event with no recoverable backup.
- A security breach that she can't explain to users.
- The cost of running the platform (AI + SMTP + hosting) exceeding MRR.

### How We Win Her
- Make the **ops surface area small**: one observability page, one backup script, one rollback procedure.
- **Cost dashboards** that show AI spend per tenant, so she can spot the abuser before the bill arrives.
- **Honest incident comms** templates so a breach doesn't become two crises.

---

## Persona 5 — "Liam", the Power User / API Integrator

**Role:** Technical founder or RevOps engineer at a small company. Wants to drive AcquisitionOS from scripts / their own CRM.
**Company size:** 2–10.
**Location / market:** Anywhere. Pays in USD.
**Plan today:** Elite (for the API access + the higher rate limits).
**Auth:** Has a password, but primarily uses an API key (`aq_live_…`) with scoped permissions.
**Integrations:** Uses the `/api-docs` page (already shipped) as his reference.

### Pain Points
- Most SaaS APIs are an afterthought: rate-limited, undocumented, no webhooks. He wants a real API.
- Wants to programmatically discover → score → push to his CRM → trigger outreach without clicking the UI.
- Wants per-key usage analytics so he can attribute cost to the right internal project.

### Goals
- Run his entire prospecting pipeline from a single Python script on a cron.
- Pay only for the AI credits he actually burns (credits, not seats).

### How He Uses AcquisitionOS
1. **API key** with scopes `leads.write`, `messages.write`, `ai.write`, `analytics.read`.
2. **POST /api/leads** to create leads from his own list. **POST /api/leads/[id]/outreach** to generate the email. **POST /api/leads/[id]/communications** to send + log it.
3. **GET /api/settings/api-keys/analytics** to track usage; budgets per key.
4. Reads `/api-docs` for the endpoint catalog and code examples.

### What Makes Him Upgrade / Expand
- **Webhooks** — he wants `lead.replied`, `meeting.booked`, `credits.low` pushed to his system. (Currently partially built — `src/app/api/workflows/webhook/` is an outbound webhook executor; inbound event subscription is the gap.)
- **Higher rate limits** on Elite (Free 50 req/hour → Elite 2000 req/hour is already shipped).
- **Per-key monthly lead quotas** (50/500/2000 — shipped) so he can run multiple projects on one account.

### What Makes Him Churn
- API breakage without versioning. A rename or a removed field in a non-major release will break his script and he'll leave.
- Rate limits too low for his volume.
- No webhooks means he has to poll; polling at his volume hits the rate limit.

### How We Win Him
- **Version the API** (`/api/v1/…`) before the first breaking change. Currently the API is unversioned; this is a near-term must.
- **Webhooks for the key events** (lead.created, lead.replied, meeting.booked, credits.low, subscription.cancelled).
- **Generous, predictable rate limits** documented in `/api-docs`.

---

## Persona Summary Table

| Persona | Role | Plan | Primary auth | Core loop | Upgrade trigger | Churn risk |
|---|---|---|---|---|---|---|
| Prabhat | Solo agency | Pro | OTP + Gmail SMTP | Monday discovery, daily reply triage | Credits limit; first signed client | Deliverability; AI cost surprise |
| Sarah | Freelance consultant | Pro → Elite | Google OAuth + Resend | Targeted discovery, heavy edit, Copilot | Team seats; Copilot quality | Templated AI output; creepy prospecting |
| Marcus | Sales lead, 12-person | Elite | Google OAuth, org roles | Team discovery, workflows, API to SFDC | API quality; team analytics | Data lock-in; per-seat pricing |
| Ananya | Platform operator | Admin | Password + MFA | Observability, backups, incident response | Internal tooling quality | Data loss; breach; cost > MRR |
| Liam | API integrator | Elite | API key (scoped) | Script-driven prospecting | Webhooks; rate limits; API versioning | Breaking API changes; no webhooks |

---

*See also: [PRODUCT-VISION.md](PRODUCT-VISION.md), [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md), [PRICING-STRATEGY.md](PRICING-STRATEGY.md).*
