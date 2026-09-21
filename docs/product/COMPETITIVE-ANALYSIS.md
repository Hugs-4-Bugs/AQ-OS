# Competitive Analysis — AcquisitionOS

> Owner: Product. Status: Living document. Last reviewed: 2026-09-09.
> Comparison is based on public feature pages of the competitors as of 2026, plus the AcquisitionOS codebase (`docs/06-api-reference/API-ROUTES.md`, `docs/01-overview/FEATURE-LIST.md`).

## 1. Market Landscape

The B2B lead-acquisition / sales-engagement market has three rough tiers:

1. **Contact-database platforms** — Apollo.io, ZoomInfo, Hunter.io, Lusha, Seamless.ai. Core value: a pre-built, searchable contact database with emails + phone numbers. You pay for the data; outreach is secondary.
2. **Sales-engagement / sequencing platforms** — Outreach.io, Salesloft, Lemlist, Reply.io, Instantly. Core value: send multi-step email sequences at scale, track opens/replies, automate follow-ups. You bring the list; they send.
3. **All-in-one prospecting suites** — Apollo (again, both tiers), Leadfeeder, Overloop. Combine database + sequencing + some CRM.

AcquisitionOS sits in a fourth, narrower niche: **AI-powered full-loop acquisition for B2B *service* sellers**, where the prospect list is *not pre-built* (we discover from the open web) and the outreach is *highly personalized* (AI references the actual weakness found on the prospect's website), and the loop continues through reply classification, meeting orchestration, and pipeline.

## 2. Feature Comparison Table

Legend: ✅ Full / 🟡 Partial / ❌ None / ➕ Via integration.

| Capability | AcquisitionOS | Apollo.io | Hunter.io | Lemlist | Outreach.io | Salesloft |
|---|---|---|---|---|---|---|
| **Pre-built contact database** | ❌ (real-time discovery) | ✅ 275M+ | ✅ 100M+ | ❌ | ❌ | ❌ |
| **Real-time web discovery (search → scrape)** | ✅ Google CSE + Cheerio | 🟡 (their db) | ❌ | ❌ | ❌ | ❌ |
| **Website-quality scoring** | ✅ custom scorer | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI lead scoring with reasoning** | ✅ reply/conv/urgency/rev + written reasoning | 🟡 AI scoring (no reasoning) | ❌ | ❌ | 🟡 | 🟡 |
| **AI personalized outreach generation** | ✅ per-lead, references weakness | 🟡 templated AI | ❌ | ✅ AI personalization | 🟡 | 🟡 |
| **Multi-step email sequences** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Reply classification (interested/not/meeting)** | ✅ + buying signals | 🟡 sentiment | ❌ | 🟡 | 🟡 | 🟡 |
| **Meeting intent detection → slot proposal** | ✅ calendar free/busy → Meet link | ❌ | ❌ | ❌ | 🟡 (calendar) | 🟡 (calendar) |
| **Google Calendar real-time availability** | ✅ free/busy API | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| **Google Meet link auto-generation** | ✅ via conferenceData | ➕ | ❌ | ➕ | ➕ | ➕ |
| **Autonomous SDR mode (approval/assisted/auto)** | ✅ 3 modes | ❌ | ❌ | ❌ | ❌ | ❌ |
| **In-app AI Copilot / Assistant** | ✅ streaming chat + RAG | 🟡 AI assistant | ❌ | ❌ | 🟡 | ❌ |
| **Credits-based pricing (not seats)** | ✅ | ❌ seat-based | ✅ credit-based | ❌ seat-based | ❌ seat-based | ❌ seat-based |
| **Indian payment (Razorpay) + GST** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Team / org roles** | ✅ owner/admin/member/viewer | ✅ | 🟡 | ✅ | ✅ | ✅ |
| **API + webhooks** | 🟡 API (no webhooks yet) | ✅ API + webhooks | ✅ API | 🟡 | ✅ | ✅ |
| **CRM / pipeline** | ✅ Kanban + deals | ✅ (basic) | ❌ | ❌ | ✅ | ✅ |
| **Workflow builder** | ✅ visual + 30 templates | ❌ | ❌ | ❌ | ✅ (sequences) | ✅ (cadences) |
| **Competitor intelligence** | ✅ discover/analyze/snapshots | 🟡 | ❌ | ❌ | ❌ | ❌ |
| **Custom reports + dashboards** | ✅ builder + shareable | 🟡 | ❌ | ❌ | ✅ | ✅ |
| **White-label / agency partner** | 🟡 half-built | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Deliverability tooling (warm-up, reputation)** | 🟡 bounce intel + unsub + per-user SMTP | ➕ | ❌ | ✅ warm-up | ✅ | ✅ |
| **Phone dialer** | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **LinkedIn automation** | 🟡 message gen only (no automation) | ✅ | ❌ | ✅ | ✅ | ✅ |
| **CRM sync (Salesforce/HubSpot)** | 🟡 API export only | ✅ | ➕ | ✅ | ✅ | ✅ |
| **Mobile app** | ❌ (responsive web) | ✅ | ✅ | ❌ | ✅ | ✅ |
| **SOC 2 / compliance** | 🟡 (audit log + roles; not certified) | ✅ | ✅ | ✅ | ✅ | ✅ |

## 3. Positioning

**AcquisitionOS is NOT a contact database replacement.** If you want to pull a list of 5,000 SaaS VPs of Engineering with verified emails, buy Apollo or ZoomInfo. We will not compete on database breadth.

**AcquisitionOS IS the front-of-funnel + meeting engine for service sellers who don't have (or don't want) a pre-built list.** Our buyer's prospect is "the 200 restaurants in my city with a bad website" — not "5,000 VP Engineering at Series-B SaaS." That prospect doesn't exist in Apollo's database; it exists on Google Maps. We go get it.

**The wedge:** the only platform that (a) finds the prospect in real time from the open web, (b) tells you *why* they need you (website-quality score), (c) writes the email referencing that specific weakness, (d) classifies the reply and books the meeting from your real calendar — in one app, on credits not seats.

## 4. Pricing Comparison

| Tool | Entry paid | Mid | Top | Pricing model |
|---|---|---|---|---|
| **AcquisitionOS** | Free (50 credits) | Pro (~$29/mo) | Elite (~$99/mo) | Credits + plan tier; no per-seat |
| Apollo.io | $49/mo (Basic) | $79/mo (Pro) | $149/mo (Org) | Per seat / per month |
| Hunter.io | $34/mo (Starter) | $69/mo (Growth) | $139/mo (Business) | Credits / month |
| Lemlist | $59/mo (Starter) | $99/mo (Pro) | $159/mo (Enterprise) | Per seat / per month |
| Outreach.io | ~$130/seat/mo (quoted) | custom | custom | Per seat / per month |
| Salesloft | ~$150/seat/mo (quoted) | custom | custom | Per seat / per month |

**AcquisitionOS pricing advantage:** a solo user pays ~$29–$99/mo total. The same user on Outreach pays $130 *per seat*. A 3-person team on Outreach is $390/mo minimum; on AcquisitionOS Elite it's $99/mo (credits shared). This is a structural advantage for the SMB segment.

**AcquisitionOS pricing risk:** credits mean a power user can burn through a plan in a day and face overage / upgrade friction. Seat-based competitors don't have that surprise. We mitigate with: (1) clear pre-action cost preview, (2) monthly grant + rollover, (3) add-on packs, (4) the Free tier is genuinely useful so users self-select.

## 5. Strengths / Weaknesses per Competitor

### Apollo.io — the giant
- **Strength:** 275M+ contact database; AI scoring; multi-channel; brand; sales.
- **Weakness:** you pay for the database even if you only need 50 contacts; outreach is templated; no real-time discovery; no website-quality scoring; USD-only, US-only posture; per-seat pricing penalizes small teams.
- **How we win:** the user who doesn't want a database; the user outside the US; the user who wants personalized AI outreach not templates; the user who objects to per-seat.

### Hunter.io — the email-finder
- **Strength:** best-in-class email finding + verification; cheap; simple; API.
- **Weakness:** it's an email finder, not an outreach engine; no sequences, no reply handling, no meetings, no CRM. You still need 2-3 more tools.
- **How we win:** the full loop. Hunter is a feature, not a product; we may eventually integrate Hunter as a verification layer rather than compete head-on.

### Lemlist — the personalization-first sequencer
- **Strength:** AI personalization; warm-up tool; deliverability focus; multi-channel; the closest direct competitor to our outreach.
- **Weakness:** no discovery (you bring the list); no website scoring (so the personalization is shallow — "I saw your recent post"); no meeting orchestration; no CRM; per-seat pricing.
- **How we win:** deeper personalization (we reference the *actual weakness on their site*, not their LinkedIn); the loop continues past the send (reply → meeting → pipeline); credits not seats.

### Outreach.io / Salesloft — the enterprise sequencer
- **Strength:** enterprise-grade; phone dialer; Salesforce sync; coaching; reporting; brand; the enterprise sales team's default.
- **Weakness:** priced for enterprise ($130–$150/seat/mo); overkill for a 1–10 person team; no discovery; no website scoring; US-only posture; per-seat.
- **How we win:** the SMB segment they don't sell to; the user outside the US; the user who wants discovery + meetings + CRM in one bill; the user who objects to per-seat pricing. We do not compete head-on for the 50-person enterprise SDR team.

## 6. Differentiation Summary (the 30-second pitch)

> Apollo sells you a database. Outreach sells you a sequencer. Lemlist sells you personalization. **AcquisitionOS runs the whole front-of-funnel** — finds the prospect in real time, tells you why they need you, writes the email, sends it, reads the reply, books the meeting, and puts it in your pipeline. One app, one bill, credits not seats. And it works if you're in India paying in INR with GST.

## 7. Risks to the Positioning

- **Apollo adds real-time discovery.** If Apollo ships a "find local businesses with weak websites" feature, our wedge narrows. Mitigation: keep investing in the *quality* of the scoring + the *depth* of the personalization + the loop continuation (reply → meeting → pipeline) — those are harder to copy.
- **Lemlist adds discovery + meetings.** Lemlist is closest in personalization; if they acquire a discovery tool + a calendar tool, they converge on us. Mitigation: ship the supply-side intelligence layer (niche benchmarks) which they can't easily copy without the data flywheel.
- **A vertical-specific competitor** (e.g. "AcquisitionOS for dentists") takes a vertical we target. Mitigation: ship our own vertical templates first and own the vertical narrative.
- **AI commoditization.** If every sequencer ships "AI personalization that references the website," our differentiator erodes. Mitigation: the differentiator is the *reasoning* (written justification for every score) + the *autonomous mode* + the *loop* — not just "AI wrote the email."

## 8. Recommended Positioning Statements

- **For Prabhat (solo agency, India):** "Find local businesses with weak websites, send personalized outreach that actually mentions their problem, book the meeting on your calendar — in Hindi-friendly INR pricing with GST invoices. No per-seat fee, no USD lock-in."
- **For Sarah (freelance consultant, US):** "AI that reads your prospect's site and writes an email you'd actually send. Reply classification + calendar booking built in. You edit, you send — autonomous mode only if you opt in."
- **For Marcus (sales lead, 12-person):** "An SDR co-pilot that runs discover → score → sequence → reply triage → meeting booking, with an API that pushes to Salesforce. Credits-based, so you scale seats without renegotiating."
- **For Liam (API integrator):** "A real API with scopes, rate limits, and (soon) webhooks. Drive the whole prospecting loop from a Python script. Pay only for the AI you burn."

---

*See also: [PRODUCT-VISION.md](PRODUCT-VISION.md), [USER-PERSONAS.md](USER-PERSONAS.md), [PRICING-STRATEGY.md](PRICING-STRATEGY.md).*
