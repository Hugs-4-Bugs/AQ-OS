# Product Vision — AcquisitionOS

> Owner: Product. Status: Living document. Last reviewed: 2026-09-09.

## 1. The Problem We Solve

Client acquisition for B2B service sellers (agencies, freelancers, small sales teams) is a **manual, repetitive, low-leverage loop**:

1. **Find** prospective businesses on Google Maps, directories, LinkedIn — hours of searching.
2. **Judge** whether each business has a real, fixable digital weakness — gut-based, inconsistent.
3. **Write** cold outreach emails one by one — slow, low response rate, generic.
4. **Triage** replies in an inbox — interested / not / meeting request / unsubscribe mixed together.
5. **Schedule** meetings — calendar ping-pong, no reminders, lost follow-ups.
6. **Track** everything in a spreadsheet that nobody updates.

Every step is pattern-shaped and automatable, but no single tool wraps the full loop. Agencies either buy 5 disjointed tools (search + verifier + sequencer + inbox + CRM) or do it by hand. Both options leak time and lose deals.

## 2. The Product

AcquisitionOS is a **web-based, AI-powered client-acquisition operating system**. One Next.js application wraps the entire lifecycle:

- **Discovery** — queries Google Custom Search for businesses in a niche + location, scrapes each website, computes a website-quality score that identifies digital weaknesses.
- **Qualification** — AI scores each lead on reply likelihood, conversion likelihood, urgency and revenue potential, with written reasoning.
- **Outreach** — AI generates a personalized email per lead referencing the actual weaknesses found; multi-touch sequences with delays.
- **Reply handling** — inbound replies are classified (interested / not / meeting request / unsubscribe), buying signals extracted, meeting intent detected.
- **Meetings** — orchestration engine proposes slots from the user's Google Calendar availability, confirms, sends reminders, generates prep notes and follow-ups.
- **Pipeline & analytics** — CRM-style pipeline, deals, custom dashboards, reports, competitive intelligence.
- **Monetization** — the platform itself is sold as a SaaS: plan tiers (free / pro / elite), credits metering AI-heavy actions, add-on packs, coupons, invoices, GST/tax handling.

## 3. Who It Is For

- **Freelancers and agencies** selling web design, marketing, SEO or automation services to local businesses — the primary persona. The scoring model is explicitly tuned to find businesses with weak websites and reachable owners.
- **Solo founders / small B2B sales teams** who want an autonomous SDR — the "Autonomous Outreach" module can run discover → score → generate → send cycles on a schedule with an autonomy-mode toggle.
- **Teams** — organizations with owner/admin/member/viewer roles, invitations, team leaderboards, shared pipeline.
- **The platform operator** — admin endpoints and feedback/crash reporting systems exist for operating the SaaS itself.

## 4. What Makes Us Different

| Differentiator | Why it matters |
|---|---|
| **Full-loop, single app** | One login, one data model, one bill. No copy-paste between search → verifier → sequencer → inbox → CRM. |
| **Website-quality scoring** | We don't just find businesses — we quantify *why* they need you (slow site, no SSL, missing meta, poor mobile). Outreach references real weaknesses, not "I came across your website." |
| **AI reasoning, not just AI text** | Every lead score ships with written reasoning. Every outreach references the specific gap. Replies are classified with buying signals, not just sentiment. |
| **Autonomous SDR mode** | Approval / Assisted / Autonomous — the user chooses how much the AI does without them. Most competitors stop at "generate a draft, you send it." |
| **Reply-driven meeting orchestration** | When a lead replies "let's talk next week," the system detects the intent, proposes slots from your real calendar availability, and (in autonomous mode) books the meeting + sends a Google Meet link. |
| **Credits, not seats** | Pricing meters AI-heavy actions (discovery, scoring, outreach generation) instead of charging per seat. A power user on the free tier who doesn't use AI pays nothing; a heavy user upgrades naturally. |
| **India-ready** | Razorpay + GST handling, Indian DPDP Act awareness, SMTP via Gmail App Password. Most competitors are US-only in payments and compliance posture. |

## 5. Long-Term Vision

**AcquisitionOS becomes the operating system for the "supply side" of the B2B services economy — the place a freelancer or agency runs their entire book of business, not just the top of the funnel.**

The funnel today is discovery → outreach → reply → meeting. The vision extends it forward and backward:

- **Backward (supply):** eventually the platform also tells you *what services to sell* — by analysing which niches convert best, which weaknesses are most lucrative to fix, which competitors are undercharging.
- **Forward (delivery):** after the meeting, the platform helps you scope the work (AI-generated proposals), sign the contract (e-signature), invoice (already half-built), and track delivery — turning AcquisitionOS from "client acquisition" into "client lifecycle."

## 6. Success Looks Like — 1 Year

- **1,000 paying accounts**, 50+ on Elite, MRR ≥ $40K, churn < 6% monthly.
- **Reply-rate benchmark published** — we publicly state "AcquisitionOS users average X% reply rate vs. industry Y%" because we measure every send and every reply.
- **Autonomous mode is the default** for power users — they set a weekly discovery target and the platform runs the whole loop, surfacing only the deals that need human judgement.
- **Two named verticals** (e.g. web-design agencies, marketing consultants) where the scoring model and outreach templates are tuned to that vertical's signals and language.
- **Mobile-responsive dashboard is genuinely usable on a phone**, not just a desktop app that renders.
- **India market:** 200+ paying Indian accounts, Razorpay live, GST invoices generating, DPDP-aligned.

## 7. Success Looks Like — 3 Years

- **10,000+ paying accounts**, MRR ≥ $500K, net revenue retention ≥ 110%.
- **The platform is a category** — "client-acquisition OS" is a recognised SaaS category and AcquisitionOS is the reference product, the way HubSpot is for marketing automation.
- **Vertical marketplaces / templates** — certified outreach templates, scoring models and report builders for specific verticals, sold by partners.
- **The supply-side intelligence layer** — aggregated, anonymised market data ("the average plumber's website scores 42/100; the average plumber responds to email within 9 hours") is a product in its own right, sold to the businesses we used to prospect.
- **API-first / white-label** — agencies run AcquisitionOS under their own brand (white-label is already half-built) and power-users drive it via API for their own custom CRMs.
- **Geographic expansion** beyond India + US, with local payment providers and data-residency options.

## 8. Non-Goals (What We Deliberately Do Not Do)

- **We are not a generic CRM.** We do not try to replace Salesforce or HubSpot for managing an existing book of business. We are the front of the funnel plus the meeting; the existing CRM stays for post-meeting account management.
- **We are not a bulk-email sending service.** We do not aim to send 10,000 cold emails a day. We aim to send 50 highly-personalized emails that get replies. Volume play is a different business.
- **We are not a lead database.** We do not sell a pre-built contact database the way Apollo or ZoomInfo do. We discover leads in real time from the open web. This is a deliberate positioning choice (and a compliance choice).
- **We do not build a mobile app** in the 1-year horizon — responsive web only.

## 9. Guiding Principles (How We Make Product Decisions)

1. **The loop is the product.** Any feature that breaks the discovery → outreach → reply → meeting loop is rejected, no matter how shiny.
2. **AI augments, the user decides.** Autonomous mode is opt-in; the default is "AI proposes, human approves." We never send an outreach email the user has not at least seen a draft of, except in explicit autonomous mode.
3. **Measure everything, publish the benchmarks.** Every send, every open, every reply, every meeting booked is logged. Aggregated benchmarks are a product.
4. **Credits, not seats.** Pricing follows AI cost; heavy AI users pay more, light users pay nothing. We never gate the core loop behind a seat license.
5. **One app, one data model.** No separate micro-SaaS acquisitions that don't share the user, lead, and pipeline models. If we build it, it lives in the same schema.

## 10. Risks to the Vision

- **AI cost curve.** Every discovery + scoring + outreach generation call costs AI tokens. If token prices spike or free-tier abuse rises, unit economics break. Mitigation: credit gating, AI provider fallback, prompt caching, model routing by task complexity.
- **Deliverability.** Cold outreach email deliverability is a moving target (Gmail/Outlook spam filters). One bad sender reputation can sink the whole product. Mitigation: per-user Gmail OAuth (send as the user), unsubscribe handling, bounce intelligence, warm-up guidance.
- **Compliance drift.** CAN-SPAM, GDPR, India DPDP Act all evolve. A single regulator complaint can force a redesign. Mitigation: legal review cadence, data-retention defaults, right-to-deletion API.
- **Competitive moat is thin.** Apollo, Lemlist, Outreach can copy the surface features in a quarter. The moat is the *quality* of the scoring + outreach personalization + reply classification — which is the AI prompt engineering + the data flywheel. We must keep investing there.

---

*See also: [USER-PERSONAS.md](USER-PERSONAS.md), [FEATURE-ROADMAP.md](FEATURE-ROADMAP.md), [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md), [PRICING-STRATEGY.md](PRICING-STRATEGY.md).*
