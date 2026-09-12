# Pricing Strategy — AcquisitionOS

> Owner: Product + Finance. Status: Living document. Last reviewed: 2026-09-09.
> Source of truth: `src/lib/plan-gates.ts`, `src/lib/credit-costs.ts`, `src/lib/credit-service.ts`, `src/lib/entitlement-service.ts`, `prisma/schema.prisma` (`Subscription`, `CreditsLedger`, `PlanEntitlement`), `src/components/dashboard/pricing-page.tsx`.

## 1. The Model in One Sentence

**Credits, not seats.** Users pay a monthly plan tier (Free / Pro / Elite) that grants a monthly credit allowance; AI-heavy actions (discovery, scoring, outreach generation) consume credits; add-on packs and overage are available; the core loop is never gated behind a per-seat license.

## 2. Why Credits, Not Seats

| Argument | Seat-based (Apollo, Outreach) | Credits-based (AcquisitionOS) |
|---|---|---|
| Solo user cost | $49–$130/mo regardless of use | $0–$29/mo; pays only when active |
| Adding a teammate | +1 seat = +$50–$150/mo | Same plan, shared credits; near-zero marginal cost |
| Heavy vs light user | Same price | Heavy pays more (fair), light pays less (retained) |
| Surprise bills | None | Possible (credit exhaustion) — we mitigate |
| AI cost alignment | Disconnected (vendor eats AI cost variance) | Direct (user's credits track AI cost) |

**The structural insight:** our unit cost is dominated by AI tokens + search-API calls + SMTP — *not* by user count. A seat-based price would decouple revenue from cost (we'd lose money on power users, overcharge light users). Credits align revenue with cost and let us offer a genuinely useful Free tier without losing money on it.

**Trade-off we accept:** credits introduce a "surprise bill" risk that seat-based pricing doesn't have. We mitigate with: (a) pre-action cost preview, (b) monthly grant + rollover, (c) add-on packs at predictable prices, (d) hard stop (not overage-by-default) when credits run out, (e) the Free tier is useful enough that users self-select into paid before hitting walls.

## 3. The Three Tiers

### Free — $0/mo
- **Credits:** 50/month (rollover up to 100).
- **What you get:** the full loop — discovery, scoring, outreach generation, reply classification, meeting booking, pipeline, 1 Gmail account, 1 Google Calendar.
- **What's limited:** 50 leads/month discovery, 1 outreach sequence, no autonomous mode, no API, no team seats, no custom reports, basic analytics.
- **Who it's for:** Prabhat before he's sure; Sarah testing; anyone evaluating.
- **Why it's free:** the Free tier is our acquisition channel. Users who get value upgrade; users who don't cost us ~$0 in AI (the 50 credits cap our exposure). We do NOT run ads; the Free tier IS the ad.

### Pro — ~$29/mo (or ₹ equivalent)
- **Credits:** 500/month (rollover up to 1,000).
- **What unlocks:** autonomous mode (assisted), 5 outreach sequences, 3 Gmail accounts, API (50 req/hr, 500 leads/month), custom reports, advanced analytics, competitor intelligence, 1 team seat.
- **Who it's for:** Prabhat after his first signed client; Sarah full-time; a solo founder running their own sales.
- **The upgrade trigger from Free:** hitting the 50-lead discovery limit mid-week, OR wanting autonomous mode, OR wanting the API. Both are deliberate value cliffs.

### Elite — ~$99/mo (or ₹ equivalent)
- **Credits:** 2,000/month (rollover up to 4,000).
- **What unlocks:** autonomous mode (full), unlimited sequences, 10 Gmail accounts, API (2,000 req/hr, 2,000 leads/month), 10 team seats, team leaderboard, white-label (half-built → GA), priority support, advanced workflow templates.
- **Who it's for:** Marcus (12-person sales team); Liam (API integrator); an agency running AcquisitionOS for multiple clients.
- **The upgrade trigger from Pro:** team seats (Pro has 1, Elite has 10), API rate limits (Pro 50/hr, Elite 2,000/hr), or monthly lead volume (Pro 500/mo, Elite 2,000/mo).

## 4. Add-Ons

- **Credit packs** (one-time, no subscription): 500 credits for $19, 2,000 for $59, 5,000 for $129. *Why: the user who runs out mid-month and doesn't want to wait for the monthly grant, but doesn't want to upgrade the plan.*
- **Extra team seat** (monthly): $9/seat/mo on Pro, $19/seat/mo on Elite. *Why: for users who are on Pro but want 2 seats without jumping to Elite — a softer upsell.*
- **White-label / agency** (when GA): $199/mo flat, includes Elite-tier credits + unlimited seats + custom branding + custom domain. *Why: agency partners are a different buyer; flat fee simplifies their accounting.*

## 5. Value Delivered at Each Tier

| Tier | Discovery limit | Outreach sequences | Autonomous mode | API | Team seats | Custom reports | What it replaces |
|---|---|---|---|---|---|---|---|
| Free | 50 leads/mo | 1 | ❌ | ❌ | 0 | ❌ | A spreadsheet + manual Google searches |
| Pro | 500 leads/mo | 5 | Assisted | 50 req/hr | 1 | ✅ | Apollo Basic + Lemlist Starter (saves ~$80/mo) |
| Elite | 2,000 leads/mo | Unlimited | Full | 2,000 req/hr | 10 | ✅ | Outreach ($1,300/mo for 10 seats) — saves ~$1,200/mo |

**The economic story for Marcus:** 10 seats on Outreach = $1,300/mo. 10 seats on AcquisitionOS Elite = $99/mo + credit packs as needed (say $60/mo) = ~$160/mo. **He saves ~$1,140/mo** and gets discovery + website scoring + meeting booking that Outreach doesn't have. That's the no-brainer upgrade.

## 6. Upsell Triggers (Engineered, Not Accidental)

1. **Discovery limit hit.** User tries to run discovery #51 on Free → paywall. Message: "You've found 50 leads this month. Upgrade to Pro for 500/mo, or buy a 500-credit pack for $19." *Conversion: highest of all triggers.*
2. **Wanting autonomous mode.** User on Free discovers the autonomous-mode toggle exists but is greyed out → "Autonomous mode is a Pro feature." *Conversion: high for the time-poor persona (Prabhat).*
3. **Wanting the API.** User on Free/Pro wants to integrate → "API access starts on Pro; 2,000 req/hr on Elite." *Conversion: Liam persona.*
4. **Team seat needed.** User invites a teammate → "Pro includes 1 seat; add seats at $9/mo or upgrade to Elite for 10." *Conversion: Marcus.*
5. **Credits exhausted mid-send.** User mid-sequence, runs out → "Buy a 500-credit pack for $19 (one-time) or upgrade for a higher monthly grant." *Conversion: medium; we offer the pack first to avoid forcing a plan upgrade.*
6. **First signed client from AcquisitionOS.** Triggered by the user marking a deal "won" in the pipeline → one-time congratulation email + "Upgrade to Pro for $29" offer with a 20% discount code. *Conversion: highest by LTV; the proof point is fresh.*

## 7. Revenue Model Explanation

### Revenue lines
1. **Monthly subscriptions** (Pro $29, Elite $99) — the base, ~70% of MRR target.
2. **Add-on credit packs** (one-time) — ~15% of MRR; smooths the credit-exhaustion friction.
3. **Add-on seats** (monthly) — ~10% of MRR; the Marcus-tier expansion.
4. **White-label / agency** (when GA) — ~5% of MRR but high ARPA.

### Unit economics (target, per paying user)
- **AI cost:** ~$3–$8/mo for a Pro user (500 credits ≈ 50 outreach generations + 200 scorings + 100 discoveries); ~$15–$40/mo for an Elite user.
- **SMTP cost:** ~$0.50–$2/mo (Gmail SMTP is the user's own; Resend is $0.01/email, mostly free for our volume).
- **Search API cost:** ~$0.50–$2/mo (Google CSE is $5 per 1000 queries; we batch).
- **Hosting:** ~$1–$3/mo amortized (single Next.js instance; scales with users not seats).
- **Payment fees:** Stripe 2.9% + $0.30; Razorpay 2% + GST.
- **Gross margin target:** 70%+ on Pro, 60%+ on Elite (Elite has lower margin because AI cost scales with credits, but seat expansion is near-free).

### The "abuser" risk
A user on Free who burns all 50 credits on day 1 costs us ~$0.80 in AI + search. We cap this: 50 credits is the ceiling; they can't buy more without upgrading. **A Free user can never cost us more than ~$0.80/mo.** That's the design.

A user on Pro who burns all 500 credits on day 1 costs us ~$8 in AI. They pay $29. Gross margin: ~72%. Acceptable. If they do this every month, they're a power user — we want them, not to throttle them.

A user on Elite who burns all 2,000 credits every month costs us ~$40 in AI. They pay $99. Gross margin: ~60%. We watch this; if their pattern persists and they're profitable, we let them run; if they push us into negative margin we introduce a "high-volume custom plan" tier above Elite (not yet shipped).

## 8. Discounts, Coupons, Trials

- **14-day Pro trial** (no card) — the default for any signup that came from a "try Pro" CTA. Trial converts to Free at expiry, not to paid. *Why: forced card capture at trial end has high churn-via-chargeback; we prefer silent downgrade + email nudge.*
- **Coupons** — validated via `/api/payments/validate-coupon`; support percent-off and fixed-off; one per checkout; expiry; max-redemptions. The `LAUNCH20` 20%-off coupon was the launch promo; ongoing coupons are partner-specific.
- **Annual billing** (not yet shipped) — planned: 2 months free on annual prepay. *Why: improves cash flow + reduces monthly churn events.*
- **Education / non-profit** — planned: 50% off Pro on request. *Why: builds the brand; near-zero marginal cost.*

## 9. Indian Market Specifics

- **Razorpay** for card/UPI/NetBanking, in INR, with GST invoices. *Why: Prabhat needs GST input credit; USD-only would lock him out.*
- **GST** computed per the user's state of supply; HSN code for SaaS; place-of-supply rules; reverse-charge handling for cross-border. *Source: `src/lib/gst-service.ts`, `src/lib/tax-service.ts`.*
- **Pricing in INR** — Pro ₹2,499/mo, Elite ₹8,499/mo (approx, pegged to USD with a floor). *Why: INR pricing removes the "USD lock-in" objection that Apollo/Outreach can't address.*

## 10. What We Deliberately Do Not Do

- **No per-seat-only pricing.** We will never be $X/seat/mo with no credits. The credits model is the moat.
- **No unlimited plans.** "Unlimited" invites the abuser; we keep hard caps so unit economics stay positive.
- **No free trial that auto-charges.** Trial converts to Free, not to paid.
- **No multi-year contracts** in the next year. Annual prepay yes; 3-year no. *Why: we're a young product; we don't want to be locked into a price for 3 years while our costs move.*

## 11. KPIs

- **ARPU** (paid): target $35/mo (mix of Pro $29 + Elite $99 + add-ons).
- **Free → Pro conversion**: target 8–12% within 60 days.
- **Pro → Elite conversion**: target 15% within 6 months.
- **Credit-pack attach rate**: target 25% of paid users buy ≥1 pack/year.
- **Gross margin** (paid): target 70%+.
- **Monthly churn** (paid): target < 6%.

---

*See also: [PRODUCT-VISION.md](PRODUCT-VISION.md), [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md), [CHANGELOG.md](CHANGELOG.md).*
