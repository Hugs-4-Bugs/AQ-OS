# Cost Analysis — AcquisitionOS

> Owner: Finance + Operations. Status: Living document. Last reviewed: 2026-09-09.
> Source: [SCALABILITY-PLAN.md](../technical/SCALABILITY-PLAN.md), [PRICING-STRATEGY.md](../product/PRICING-STRATEGY.md), `.env` (provider list), `package.json`.

## 1. Cost Lines

| Line item | Provider / driver | Variable | Notes |
|---|---|---|---|
| **Hosting** (Next.js app) | Aliyun FC / Vercel / Railway | Per instance + per-request | Vercel Hobby $0 (within limits); Railway $5/mo base + usage; Aliyun FC per-request |
| **Database** | SQLite (now) → PostgreSQL (Supabase/Neon) | Per storage + per-compute | SQLite $0 (file); Supabase free → $25/mo → $100+/mo as you grow |
| **Redis** (when ADR-011 ships) | Upstash / Redis Cloud | Per GB + per-op | Upstash free → $10/mo → $100/mo |
| **AI** (chat + embeddings + scoring + outreach gen) | Z-AI | Per token (in + out) | Dominant cost; ~$3–$8/mo per Pro user; ~$15–$40/mo per Elite user |
| **Email** (SMTP / Resend) | Per-user Gmail (free) + Resend fallback | Per email | Gmail free (500/day limit); Resend $0.01/email after the free 3k/mo |
| **Search API** (lead discovery) | Google Custom Search | Per query ($5/1k) | Discovery = 1 query per niche/location + ~20 scrapes (free) per discovery |
| **Payments** | Stripe / Razorpay | Per transaction | Stripe 2.9% + $0.30; Razorpay 2% + GST |
| **Sentry + observability** | Sentry (Team) + OTel collector | Per event | Sentry Team $26/mo; OpenTelemetry self-hosted (existing `monitoring/`) |
| **Twilio** (WhatsApp) | Per message | WhatsApp Business API | Per-message; only for users who enable WhatsApp notifications |
| **CDN** (when configured) | Cloudflare / Vercel CDN | Per GB | Cloudflare free → $5/mo for Pro; Vercel CDN included |

## 2. Cost at Different User Scales

### Stage A — 100 paying accounts (~$3,500 MRR)
| Line | Monthly cost | Notes |
|---|---|---|
| Hosting (1 instance) | $20 | Aliyun FC or Railway |
| Database (SQLite file) | $0 | Local file |
| Redis | $0 | Not yet used |
| AI (Z-AI) | $300 | 100 users × ~$3/mo average |
| Email (per-user Gmail; Resend for those without OAuth) | $50 | ~50 users on Resend × $1/mo |
| Google CSE | $20 | ~4k queries/mo |
| Stripe fees | $100 | 2.9% + $0.30 × ~$3.5k |
| Sentry Team | $26 | |
| Twilio (WhatsApp, ~10 users) | $20 | Per-message |
| CDN | $0 | Not yet configured |
| **Total** | **~$536/mo** | |
| **MRR** | ~$3,500 | |
| **Gross margin** | **~85%** | |

### Stage B — 1,000 paying accounts (~$35,000 MRR)
| Line | Monthly cost | Notes |
|---|---|---|
| Hosting (2 web + 2 worker) | $200 | |
| Database (managed Postgres) | $50 | Supabase Pro |
| Redis (managed) | $20 | Upstash |
| AI | $3,000 | 1k users × ~$3/mo |
| Email (Resend for ~500 users) | $500 | |
| Google CSE | $200 | ~40k queries/mo |
| Stripe fees | $1,000 | 2.9% × $35k |
| Sentry Business | $100 | |
| Twilio (~100 users) | $200 | |
| CDN (Cloudflare Pro) | $5 | |
| Observability (Prometheus/Grafana hosting) | $50 | |
| **Total** | **~$5,425/mo** | |
| **MRR** | ~$35,000 | |
| **Gross margin** | **~84%** | |

### Stage C — 10,000 paying accounts (~$350,000 MRR)
| Line | Monthly cost | Notes |
|---|---|---|
| Hosting (10 web + 10 worker) | $2,000 | |
| Database (Postgres primary + 2 replicas) | $500 | |
| Redis cluster | $200 | |
| AI | $30,000 | 10k users × ~$3/mo (Pro-skewed average) |
| Email (Resend for ~5k users) | $5,000 | |
| Google CSE | $2,000 | ~400k queries/mo |
| Stripe fees | $10,000 | 2.9% × $350k |
| Sentry Business | $500 | |
| Twilio (~1k users) | $2,000 | |
| CDN | $50 | |
| Observability + logging | $500 | |
| **Total** | **~$52,750/mo** | |
| **MRR** | ~$350,000 | |
| **Gross margin** | **~85%** | |

## 3. Cost per Plan (unit economics)

| Plan | Price/mo | AI cost | Email cost | Search cost | Stripe fee | **Gross cost** | **Gross margin** |
|---|---|---|---|---|---|---|---|
| Free | $0 | ~$0.80 (50-credit cap) | ~$0.20 | ~$0.10 | $0 | ~$1.10 | **-100%** (acquisition cost) |
| Pro | $29 | ~$3–$8 | ~$0.50 | ~$0.20 | ~$1.15 | ~$5–$10 | **66–83%** |
| Elite | $99 | ~$15–$40 | ~$1 | ~$0.50 | ~$3.20 | ~$20–$45 | **55–80%** |
| Add-on 500-credit pack | $19 | ~$5 (one-time) | ~$0.20 | ~$0.10 | ~$0.85 | ~$6 | **68%** |

**The Free tier is a deliberate loss-leader** (~$1.10/mo per active free user). The conversion to Pro (8–12% target) recovers this within the first paid month.

**Elite has the lowest margin** because AI cost scales with credits (2,000 credits ≈ $15–$40 of AI cost). This is acceptable — Elite users are the highest LTV + the highest expansion (seats, add-ons).

## 4. The "Abuser" Economics

- A Free user can burn all 50 credits in a day (~$0.80 AI cost). **Max monthly cost per Free user: $0.80.** Capped by the 50-credit limit; they can't buy more without upgrading.
- A Pro user can burn all 500 credits in a day (~$8 AI cost). They pay $29. **Gross margin: ~72%.** Acceptable.
- An Elite user can burn all 2,000 credits every month (~$40 AI cost). They pay $99. **Gross margin: ~60%.** Watch this; if persistent + profitable, leave alone; if negative-margin, introduce a "high-volume custom" tier above Elite.

## 5. AI Cost Drivers (the dominant variable)

| Action | AI tokens (rough) | Cost per call (rough) | Credits deducted |
|---|---|---|---|
| Lead scoring (reply + conversion + urgency + revenue + reasoning) | ~1.5k in + 800 out | ~$0.02 | 1 |
| Outreach email generation (per lead) | ~1.5k in + 600 out | ~$0.02 | 2 |
| Reply classification | ~800 in + 300 out | ~$0.01 | 1 |
| AI chat (per turn, non-streaming) | ~1k in + 500 out | ~$0.015 | 1 |
| RAG embedding (per doc) | ~500 in | ~$0.005 | 1 |
| Vector search | ~50 in + 500 out | ~$0.005 | 1 |
| Meeting prep notes | ~1k in + 800 out | ~$0.02 | 2 |
| Meeting follow-up email | ~1k in + 600 out | ~$0.015 | 2 |

**Cost-management levers:**
1. **Model routing** — use the cheap model for classification + scoring; the expensive model for outreach generation + chat. (ADR-006 fallback chain enables this.)
2. **Prompt caching** — cache the scoring prompt for the same lead (currently no cache; opportunity).
3. **Per-tenant cost caps** — alert when a user's daily AI cost > 3× their revenue (not yet shipped).
4. **Credits** — the structural cap; users can't spend beyond their balance.

## 6. Email Cost Drivers

| Provider | Cost | Limit | When to use |
|---|---|---|---|
| Per-user Gmail (OAuth) | $0 | 500/day (free), 2k/day (Workspace) | Default — best deliverability |
| Per-user Gmail (App Password / SMTP) | $0 | Same | Fallback for users without OAuth |
| Resend | $0.01/email after 3k/mo free | High | Fallback for users without Gmail; higher deliverability than raw SMTP |
| (SendGrid / Postmark — not integrated) | ~$0.01/email | High | Optional future fallback |

**Cost-management:** default to per-user Gmail (free); only use Resend when the user has no Gmail connected. The `sendEmail()` function tries Resend first if configured, then SMTP.

## 7. Cost-Reduction Opportunities (ranked)

1. **Prompt caching for scoring** — re-scoring the same lead (e.g. after a small data change) wastes the full prompt; cache the result by a content hash. **Saves ~30% of scoring cost.**
2. **Model routing by task** — classification on a cheaper model, generation on a stronger one. **Saves ~20% of AI cost.**
3. **Per-tenant AI cost caps + alerts** — catch the abuser before the bill arrives.
4. **Self-hosted embeddings** — for RAG, the embedding model is small enough to self-host (Llama-embed); removes per-call cost.
5. **Pre-materialise analytics** — the dashboard aggregations re-scan large tables; a nightly snapshot table saves DB cost.
6. **CDN for static assets** — reduces origin bandwidth.
7. **Move from Google CSE to a self-hosted index** — at scale, the per-query cost dominates discovery. CSE is fine to ~1k users; beyond, evaluate self-hosted (MeiliSearch / Typesense) on the lead corpus.

## 8. Cost Alerts

- **AI cost/day > 3× the 7-day average** → email the founder (anomaly).
- **AI cost per tenant > 3× their MRR** → email the founder (abuser).
- **Stripe webhook failure rate > 10%** → page on-call (revenue at risk).
- **MRR drop > 5% month-over-month** → email founder (churn spike).
- **Hosting cost > 120% of the budget** → email founder (scale event or abuse).

## 9. Review Cadence

- **Monthly** — review the actual cost lines vs. this projection; tune.
- **Quarterly** — review the cost-reduction roadmap; prioritise.
- **On each plan / pricing change** — re-run the unit-economics table.

---

*See also: [PRICING-STRATEGY.md](../product/PRICING-STRATEGY.md), [SCALABILITY-PLAN.md](../technical/SCALABILITY-PLAN.md), [MONITORING-AND-ALERTING.md](MONITORING-AND-ALERTING.md), [MONETIZATION improvements](../IMPROVEMENT-RECOMMENDATIONS.md#section-7--monetization-improvements).*
