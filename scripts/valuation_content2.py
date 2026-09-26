"""Chapters 9-20 of the AcquisitionOS valuation report."""


def add_late_chapters(ctx):
    story = ctx['story']
    h1, h2, body, bullets = ctx['h1'], ctx['h2'], ctx['body'], ctx['bullets']
    make_table, chart, callout_row = ctx['make_table'], ctx['chart'], ctx['callout_row']
    Paragraph, Spacer = ctx['Paragraph'], ctx['Spacer']
    S = ctx['S']

    # ══════════ 9. CONSERVATIVE RANGE ══════════
    h1(9, 'Conservative Range')
    body('<b>$5,000 \u2013 $15,000 (\u20b948,000 \u2013 \u20b91,44,000 at \u20b996/USD) [CE].</b> This is what a fast, low-risk sale looks like: a micro-acquirer or indie buyer purchasing the codebase as-is, as an asset, with minimal warranties and no transition support beyond a short handover. It is anchored by the pre-revenue benchmark ($500\u2013$25K [MB]), positioned in its upper half because the codebase is coherent, documented, and functionally rich rather than a prototype. The assumptions: sale completes within weeks; buyer accepts the product with 32 failing tests, hollow e2e suites, no license file, SQLite-only verified runtime, and unconfigured payment providers; no earnout; founder does minimal knowledge transfer. In a rushed sale to the wrong audience \u2014 or with the repository\u2019s fictional metrics document and contradictory legacy docs left in place to poison due diligence \u2014 the low end of this band, or no sale at all, is the realistic outcome.')

    # ══════════ 10. BASE RANGE ══════════
    h1(10, 'Base Range')
    body('<b>$25,000 \u2013 $60,000 (\u20b924,00,000 \u2013 \u20b957,60,000) [CE].</b> This is the most defensible outcome for a reasonably marketed acquisition: a 4\u20138 week process listing the asset where technical founders, agencies, and micro-SaaS operators look (Acquire.com-style marketplaces, FE International-style brokers for this size, targeted outreach to sales-automation teams). It assumes the pre-sale cleanup in Section 17 is done: license added, failing tests triaged, hollow tests removed or implemented, fictional documents quarantined, a working demo with configured payment sandbox, and a short architecture/DD pack built from the existing docs suite. The upper half of the band requires a buyer who values the documentation and the autonomy architecture; the lower half reflects the median buyer who discounts anything without revenue. Supporting logic: replacement-cost perspective ($150K\u2013$400K for the functional core [CE]) tells the buyer they are buying at 15\u201335 cents on the rebuild dollar \u2014 a fair framing that does not pretend rebuild cost equals value.')

    # ══════════ 11. STRATEGIC RANGE ══════════
    h1(11, 'Strategic Range')
    body('<b>$75,000 \u2013 $250,000 (\u20b972,00,000 \u2013 \u20b92,40,00,000) [CE], conditional.</b> A strategically aligned buyer \u2014 one with an existing customer base, distribution, and a roadmap gap this product fills \u2014 could justify paying beyond financial performance for capabilities: the autonomous SDR loop, credits-metered AI architecture, Developer Access API, and a meetings-autonomy engine with human approval. Every dollar of this range depends on the five conditions in Section 8 Scenario D (roadmap fit, low integration cost, clean IP, founder transition support, risk-absorbing structure). Above ~$100K, expect earnouts or milestone payments rather than all cash: the buyer is paying for integration success they cannot verify pre-close. This range is explicitly not a promise \u2014 strategic buyers at this size are rare, processes take months, and the most common failure mode is no strategic buyer appearing at all, in which case the Base Range governs.')

    # ══════════ 12. KEY ASSUMPTIONS ══════════
    h1(12, 'Key Assumptions and Evidence Classification')
    body('Every conclusion in this report carries one of five evidence labels. [V] Verified \u2014 read directly from the codebase, database, or configuration during this inspection. [MB] Market benchmark \u2014 published 2026 transaction data from named sources (Section 7). [CE] Calculated estimate \u2014 derived here from verified inputs and stated logic. [A] Assumption \u2014 a condition taken as given for a range. [U] Unknown \u2014 no data source exists; the item cannot be established today.')
    make_table(
        ['Assumption', 'Class', 'If wrong, impact'],
        [
            ['Only the dev SQLite database is available; no production DB or billing history exists anywhere', 'V / A', 'A production DB with real revenue would move pricing to Scenario C mechanics immediately'],
            ['Buyer acquires code + docs + architecture, not customers/revenue/team', 'A', 'Financial buyers would value at near-zero without revenue regardless of code'],
            ['USD/INR \u2248 96 (Sep 21, 2026 observed ~95.86)', 'MB', '\u00b15% FX moves INR figures proportionally'],
            ['Founder provides 2\u20136 weeks transition support in Base/Strategic cases', 'A', 'Without it, subtract roughly 20\u201330% from buyer willingness [CE]'],
            ['Pre-sale cleanup (Section 17) is completed before marketing', 'A', 'Cleanup skipped \u2192 Conservative range governs; DD failure risk rises sharply'],
            ['~348K LOC includes heavy AI-generated volume; replacement cost framed 12\u201350 engineer-months', 'CE', 'A buyer using naive LOC\u00d7rate math would overpay; this report refuses that method'],
            ['No license/ownership encumbrance beyond the missing LICENSE file', 'A / U', 'Any co-ownership or third-party code dispute would impair or block a sale'],
        ],
        [0.46, 0.10, 0.44],
        'Table 8 \u2014 Load-bearing assumptions. Labels follow the Section 12 evidence scheme.')

    # ══════════ 13. VALUE-INCREASING FACTORS ══════════
    h1(13, 'Value-Increasing Factors')
    body('Only verified strengths are listed; each cites its evidence.')
    bullets([
        '<b>End-to-end automation depth</b> [V]: the full discover \u2192 score \u2192 research \u2192 outreach \u2192 reply \u2192 meeting chain exists as working code, not mockups \u2014 the rarest object in this buyer class.',
        '<b>Four-factor AI scoring with explanations</b> [V]: reply/conversion/urgency/revenue-potential scores with generated reasoning (scoring-engine.ts, explain-scores routes) \u2014 defensible product IP.',
        '<b>Credits + entitlements architecture</b> [V]: per-action metering, enforcement before AI calls, ledger, addons, coupons, two-provider billing scaffolding \u2014 monetization plumbing most competitors lack at MVP stage.',
        '<b>Developer Access API platform</b> [V]: hashed keys, rotation, revocation, usage analytics \u2014 a genuine platform seam.',
        '<b>Security maturity for its size</b> [V]: MFA, session revocation, device fingerprinting, rate limiting, CSRF/CORS/headers, webhook signature verification, two internal pentest reports with honest findings.',
        '<b>Documentation suite</b> [V]: current (2026-09) architecture docs, ADRs, full API reference, runbooks, KT/handover material \u2014 materially lowers technical DD friction and was re-verified and classified during this analysis.',
        '<b>Honest self-knowledge</b> [V]: the feature-status matrix (88 working / 27 partial / 3 planned), scalability plan, and GO/NO-GO review record real limits \u2014 buyers price honesty better than surprises.',
        '<b>Real unit/integration test core</b> [V]: 678 passing assertion-backed tests across auth, credits, billing, AI, security subsystems.',
    ])

    # ══════════ 14. VALUE-REDUCING FACTORS ══════════
    h1(14, 'Value-Reducing Factors')
    body('Every factor below is verified in the current codebase; none is speculative.')
    bullets([
        '<b>No revenue, no customers</b> [V]: the single largest value destroyer; removes revenue-multiple pricing entirely.',
        '<b>Dev-only runtime</b> [V]: SQLite sandbox, middleware disabled, no production deployment, no monitoring backend (Sentry/OTLP unset) \u2014 buyer inherits a deploy project, not a running business.',
        '<b>Payment providers unconfigured</b> [V]: billing never processed real money; a buyer must validate Stripe/Razorpay flows from scratch.',
        '<b>Test integrity gap</b> [V]: 32 failing tests and ~114 zero-assertion skeleton tests inflate green counts; signals weak release discipline.',
        '<b>No LICENSE file</b> [V]: README badge claims MIT but no license exists \u2014 immediate IP transfer blocker.',
        '<b>Squashed git history</b> [V]: 12 commits, initial commit Sep 2026; no development archaeology, no authorship trail \u2014 hurts IP provenance confidence.',
        '<b>Repo hygiene</b> [V]: dev.log, db/custom.db, screenshots committed; fictional metrics document and legacy contradictory docs present (now bannered, but a DD reviewer will still find them).',
        '<b>Schema drift</b> [V]: production schema covers 6 of 105 models; code references fields missing from Prisma models (schema-gap-report.json).',
        '<b>Isolation assurance incomplete</b> [V]: a prior cross-account leakage incident was partially remediated (lead-resolution hardening); without a completed tenancy audit, buyers assume worst-case multi-tenancy risk.',
        '<b>Founder/agent concentration</b> [V]: architecture and operational context live largely with one founder plus AI-agent sessions; no second operator has run the system.',
        '<b>Third-party dependencies</b> [V]: Google Search API, Gmail OAuth, Z-AI/OpenAI, and channel APIs \u2014 cost exposure and ToS dependency transfer to the buyer.',
    ])

    # ══════════ 15. BUYER DUE-DILIGENCE RISKS ══════════
    h1(15, 'Buyer Due-Diligence Risks (incl. Founder Dependency & DD Readiness)')
    body('A buyer running due diligence today would pass several checks and fail others. The readiness assessment below mirrors a standard technical DD checklist.')
    make_table(
        ['DD area', 'Status today', 'Buyer concern it triggers'],
        [
            ['Source organization', 'Good \u2014 coherent src/ layout, thin routes, fat services', 'None material'],
            ['Git history', 'Weak \u2014 12 squashed commits, agent + single human authors', 'Provenance: who wrote this, and do they have the right to sell it?'],
            ['Documentation', 'Strong current suite; legacy contradiction bannered; 1 fictional doc flagged', 'Which document do I trust? (answered by docs/readme.md + banners)'],
            ['Architecture docs', 'Verified modular-monolith classification with diagram + ADRs', 'None material'],
            ['Deployment docs', 'Multi-cloud options documented; verified path = single Railway/Vercel-style web service', 'Which target is real? (Railway recommendation is authoritative)'],
            ['Environment/secrets', 'env-validation + safeguard code; .env present in workspace (must be excluded from transfer)', 'Secret hygiene; rotated keys required at close'],
            ['Migrations', '3 real migrations + db-push habit; PostgreSQL migration unexecuted', 'Data-layer maturity; SQLite-to-PG execution risk'],
            ['Tests', '678 real passing; 32 failing; ~114 hollow; no CI config found', 'Release engineering maturity'],
            ['Monitoring/logging', 'In-process logger/OTel hooks; health endpoints; no external backend', 'Who gets paged when it breaks?'],
            ['Security', 'Controls present; pentest reports honest; isolation audit partial', 'Multi-tenant data leakage is a blocking defect if unfixed'],
            ['Payments', 'Coded, idempotent, unconfigured; 2 test invoices', 'Revenue pipeline unproven'],
            ['Licenses/dependencies', 'No LICENSE file; npm tree not audited for copyleft in-report', 'IP transfer risk \u2014 must fix before close'],
            ['Backup/recovery', 'scripts/backup + infra/ strategy docs exist', 'Verify restore actually runs'],
            ['Account ownership', 'Sandbox-era accounts (Google, Gmail, Z-AI); no production cloud', 'Clean handover checklist required (Section 16)'],
        ],
        [0.22, 0.40, 0.38],
        'Table 9 \u2014 Buyer DD readiness by area.')
    h2('15.1 Founder dependency')
    body('The system is meaningfully founder-dependent despite good documentation. Deployment knowledge (sandbox keepalive scripts, env-restore mechanism, proxy setup), architectural intent behind AI-generated volume, provider account ownership (Google OAuth client, Gmail app password, Z-AI SDK access), and every product decision history sit with one person [V \u2014 no second-operator evidence exists in the repo or worklog]. A buyer will price this as transition risk: expect requests for 4\u201312 weeks of paid transition support, pair-on-call time, or an earnout tied to successful handover. Mitigations that measurably help: record a deployment walkthrough, transfer provider accounts to a dedicated entity, and complete the ops runbook gaps flagged in Section 17.')

    # ══════════ 16. ACQUISITION PACKAGE CHECKLIST ══════════
    h1(16, 'Acquisition Package Checklist')
    body('What must be handed over at close, compiled from the verified inventory. Secrets are referenced by location only \u2014 never transferred inside the repository.')
    make_table(
        ['Category', 'Items', 'Verified location / note'],
        [
            ['Product', 'Source repo (clean history export), docs/ suite, API reference, KT document', 'Whole repo minus secrets/runtime artifacts'],
            ['Infrastructure', 'Deployment target config (railway.json or chosen platform), Caddyfile/nginx references, keepalive scripts (retire or document)', 'deploy/railway/; root scripts'],
            ['Cloud accounts', 'Hosting account, object storage if used, DNS/domain registrar', 'Domain ownership: verify \u2014 not evidenced in workspace'],
            ['Database', 'Schema (105 models), migration history, prod schema variant + its 6-model limitation disclosed, dev DB (test data only)', 'prisma/'],
            ['Payments', 'Stripe/Razorpay accounts + webhook secrets, invoice templates', 'Accounts must be created/transferred \u2014 none exist configured'],
            ['AI/API accounts', 'Z-AI or OpenAI keys, Google Search API + CX, SerpAPI if used', '.env references \u2014 rotate at close'],
            ['Integrations', 'Google OAuth client (redirect URIs!), Gmail credentials, Telegram bot, WhatsApp/Twilio if activated', 'docs/04 + OAUTH_SETUP_GUIDE'],
            ['Documentation', 'Architecture + diagram, ADRs, runbooks, security reports, feature-status matrix, this valuation pack', 'docs/'],
            ['Legal/IP', 'LICENSE file (to be created), IP assignment from any contributors, dependency license audit, fictional-docs quarantine record', 'Gap \u2014 required before close'],
            ['Customer data', 'None exists [V] \u2014 hand over dev DB only as sample data with disclosure', 'db/custom.db'],
            ['Analytics', 'Nothing to hand over (no production analytics) [V]', '\u2014'],
            ['Security', 'Secrets inventory + rotation record, pentest reports, known-issues list (isolation audit status)', 'docs/security/, infra/secret-rotation.md'],
            ['Operations', 'Cron schedule + CRON_SECRET handling, backup/restore runbooks, monitoring stack (optional, currently not running)', 'docs/operations/, monitoring/'],
        ],
        [0.16, 0.46, 0.38],
        'Table 10 \u2014 Handover checklist. All secrets rotate at close; nothing sensitive ships inside the repo.')

    # ══════════ 17. WHAT MUST BE FIXED BEFORE SELLING ══════════
    h1(17, 'What Must Be Fixed Before Selling (incl. Exit Scorecard)')
    body('Ranked by DD-blocking severity. Items 1\u20135 are effectively mandatory; 6\u201310 raise the achievable band toward the Base/Strategic ranges.')
    bullets([
        '<b>1. Add a LICENSE and clean IP provenance</b> \u2014 decide MIT vs proprietary, record authorship (including AI-assisted authorship disclosure), remove the committed dev DB/dev.log/screenshots. [V gap]',
        '<b>2. Complete the account-isolation audit</b> \u2014 finish the 40-resource \u00d7 all-method tenancy review the product history demands, with automated regression tests; publish the result in the DD pack. [V gap]',
        '<b>3. Triage the test suite</b> \u2014 fix or remove the 32 failures; delete or implement the ~114 hollow e2e/load skeletons so green means green. [V gap]',
        '<b>4. Quarantine fiction and legacy</b> \u2014 keep the fictional interview document and the abandoned-stack docs out of the DD data room (banners exist; physically separate them for the data room). [V]',
        '<b>5. Produce a working demo</b> \u2014 one environment with configured Stripe test mode + Google OAuth + a seeded demo tenant; buyers pay more for what they can click. [A]',
        '<b>6. Execute the PostgreSQL migration once</b> on the full 105-model schema and record the result; retire or reconcile the 6-model production variant. [V gap]',
        '<b>7. Stand up minimal external monitoring</b> \u2014 Sentry (free tier) + one health-check uptime monitor; converts "in-process observability" from a claim to evidence. [V gap]',
        '<b>8. Record a founder walkthrough</b> \u2014 60\u201390 minutes: deploy, env restore, provider accounts, cron, backup/restore. Directly attacks the founder-dependency discount. [A]',
        '<b>9. Assemble the DD pack</b> \u2014 architecture summary, this report\u2019s Sections 2\u20135, feature-status matrix, security posture, known-issues list, handover checklist. [A]',
        '<b>10. Prepare the improvement story</b> \u2014 the Section 20 table shows buyers what revenue would do to value; it also shows the seller what to build before selling if a fast exit is not forced. [CE]',
    ])
    h2('17.1 Exit readiness scorecard')
    make_table(
        ['Category', 'Current evidence', 'Missing information', 'Buyer concern', 'Required action'],
        [
            ['Product completeness', '88 working / 27 partial features [V]', 'None material', 'Partial areas (payments live, CRM sync)', 'Items 5, 6'],
            ['Revenue', '$0 verified [V]', 'Everything financial', 'Valuation floor', 'Revenue first, then sell'],
            ['Growth', 'No data [U]', 'Analytics', 'No momentum signal', 'Instrument analytics if operating'],
            ['Retention', 'No data [U]', 'Cohorts', 'Churn unknown', 'Requires customers first'],
            ['Technology', 'Strong depth [V]', 'Prod DB parity', 'Migration risk', 'Item 6'],
            ['Security', 'Controls + honest pentests [V]', 'Completed isolation audit', 'Tenant leakage', 'Item 2'],
            ['Scalability', 'Limits documented [V]', 'Load evidence', 'Single-process ceiling', 'Queue + PG if scaling story needed'],
            ['Documentation', 'Strong [V]', 'Deploy walkthrough video', 'Bus factor', 'Item 8'],
            ['Operations', 'Runbooks exist [V]', 'Live ops evidence', 'Operational maturity', 'Item 7'],
            ['Founder dependency', 'High [V]', 'Second operator', 'Transition risk', 'Item 8'],
            ['Customer base', 'None [V]', '\u2014', 'Priced as asset sale', 'Revenue first'],
            ['Financial quality', 'No financials [U]', 'Accounting records', 'Cannot underwrite', 'Create records if operating'],
            ['Legal/IP', 'LICENSE missing [V]', 'Ownership chain', 'Transfer blocker', 'Item 1'],
        ],
        [0.16, 0.20, 0.16, 0.22, 0.26],
        'Table 11 \u2014 Exit readiness scorecard (factual, evidence-cited; no invented composite score).')

    # ══════════ 18. WHAT ADDITIONAL DATA IS REQUIRED ══════════
    h1(18, 'What Additional Data Is Required')
    body('To move any conclusion in this report from [U] to established fact \u2014 and therefore to re-price with confidence \u2014 the following data would need to exist. Each item names the decision it would change.')
    bullets([
        '<b>Production database export / billing history</b> \u2014 changes Scenario C from $0 to a computable EV; the single highest-impact missing artifact.',
        '<b>Payment provider statements</b> (Stripe/Razorpay) \u2014 verifies revenue vs subscriptions rows; required for any revenue claim.',
        '<b>Analytics export</b> (signups, WAU/MAU, feature usage) \u2014 establishes active users and engagement for Scenario B.',
        '<b>Completed isolation audit report</b> with test results \u2014 removes the tenancy-risk discount and the "blocking defect" flag.',
        '<b>IP documentation</b> \u2014 contributor assignments, AI-authorship disclosure, dependency license scan \u2014 unblocks close.',
        '<b>Provider cost history</b> (AI spend, search API spend) \u2014 lets a buyer model gross margin; currently only the metering mechanism exists.',
        '<b>Domain and brand assets</b> \u2014 ownership evidence, traffic stats if any; brand is part of the package only if ownership is proven.',
        '<b>Churn/retention cohorts</b> \u2014 would upgrade multiple range from generic 2\u20135\u00d7 to a defensible band.',
    ])

    # ══════════ 19. FINAL CURRENT VALUATION RANGE ══════════
    h1(19, 'Final Current Valuation Range')
    body('If the entire AcquisitionOS product were put up for sale today \u2014 as-is, with the verified evidence in this report \u2014 the defensible answer is:')
    callout_row([('$5K \u2013 $15K', 'Conservative / fast sale [CE]'),
                 ('$25K \u2013 $60K', 'Base \u2014 most defensible [CE]'),
                 ('$75K \u2013 $250K', 'Strategic, conditional [CE]')])
    make_table(
        ['Scenario', 'USD', 'INR (at \u20b996/USD [MB])', 'What it assumes'],
        [
            ['Low / Conservative', '$5,000 \u2013 $15,000', '\u20b948,000 \u2013 \u20b91,44,000', 'Fast asset sale, no cleanup, minimal handover, risk-heavy buyer'],
            ['Base / Most defensible', '$25,000 \u2013 $60,000', '\u20b924,00,000 \u2013 \u20b957,60,000', '4\u20138 week marketed process, Section 17 items 1\u20135 done, 2\u20136 week founder transition'],
            ['High / Strategic', '$75,000 \u2013 $250,000', '\u20b972,00,000 \u2013 \u20b92,40,00,000', 'Aligned buyer with distribution, full cleanup, IP clean, earnout structure likely above $100K'],
        ],
        [0.20, 0.18, 0.24, 0.38],
        'Table 12 \u2014 Final answer. Enterprise value for an asset sale \u2248 equity value here (no debt, no cash line to reconcile).')
    body('Terms clarification a founder needs at this size: asking price is the number you list; enterprise value and equity value converge for a debt-free asset sale; cash at closing is typically below headline in strategic deals (earnouts, escrows of 10\u201320%, transition holdbacks); seller financing (a note for part of the price) is common in micro-SaaS and can add 10\u201330% to achievable price for creditworthy structures [CE/MB]. None of these numbers is a guaranteed sale price; they are the ranges current evidence supports.')

    # ══════════ 20. POTENTIAL VALUATION AFTER IMPROVEMENTS ══════════
    h1(20, 'Potential Valuation After Specific Improvements')
    body('Improvements are ranked by valuation mechanics, not effort. Revenue-related rows dominate everything else: no other lever moves value by an order of magnitude. Where reliable evidence does not exist (e.g., precisely how much a specific fix adds), the impact is given as a direction and band with its reasoning \u2014 invented point estimates are deliberately omitted.')
    make_table(
        ['Metric / improvement', 'Current state', 'Target', 'Potential valuation impact [CE]'],
        [
            ['MRR (real paying customers)', '$0 verified', '$1K\u2013$5K MRR', 'Moves pricing to Scenario C: $24K\u2013$240K EV; the only order-of-magnitude lever'],
            ['ARR sustained + growth', 'None', '$50K\u2013$100K ARR, >10% MoM', 'Enters 3\u20135\u00d7 ARR band: $150K\u2013$500K'],
            ['Retention evidence', 'No cohorts', 'NRR \u2265 90% documented', 'Upgrades multiple band ~+0.5\u20131.0\u00d7 within same ARR'],
            ['Customer concentration', 'N/A', 'No customer >25% of revenue', 'Prevents \u221230% concentration discount'],
            ['Isolation audit complete', 'Partial', 'Full audit + regression tests published', 'Removes blocking-defect flag; enables strategic range at all'],
            ['LICENSE + IP chain', 'Missing', 'LICENSE + assignments recorded', 'Unblocks close; without it every range collapses'],
            ['Test suite integrity', '32 fail / ~114 hollow', 'All green, assertions real, CI configured', 'Supports upper-Base pricing; weak signal otherwise'],
            ['Production deployment (PG + monitoring)', 'Sandbox/SQLite', 'One live env on Railway/PG + Sentry', 'Converts "code asset" to "working SaaS" (Scenario B premium)'],
            ['Founder dependency', 'High', 'Walkthrough video + 2nd operator or SOW', 'Reduces transition discount ~20\u201330% [CE]'],
            ['Documentation consistency', 'Achieved this week [V]', 'Maintained', 'Preserves DD speed advantage; low cost, real effect'],
        ],
        [0.24, 0.18, 0.24, 0.34],
        'Table 13 \u2014 Improvement \u2192 valuation map. Direction/bands only; no invented point estimates.')
    body('Closing statement of objectivity: on today\u2019s verified evidence \u2014 zero revenue, test accounts only, unconfigured payments, incomplete isolation assurance \u2014 AcquisitionOS is worth materially less than its build effort and materially more than a weekend prototype. The technology justifies patience; the business metrics justify humility. If a fast sale is desired, sell the asset well after the Section 17 cleanup and expect the Base Range. If revenue is achievable before selling, every month of real MRR does more for the exit number than any other action in this report.')
