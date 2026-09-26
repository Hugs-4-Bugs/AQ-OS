"""AcquisitionOS — Acquisition Valuation & Readiness Analysis (Report route, ReportLab).
Template 07 Crystal Blue fixed palette. English document -> FreeSerif.
"""
import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Image, KeepTogether, CondPageBreak,
                                HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))
from pdf import install_font_fallback

FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')
install_font_fallback()

# ━━ Template 07 Crystal Blue — fixed body palette (typesetting/cover.md) ━━
PAGE_BG      = colors.HexColor('#f5f8fc')
SECTION_BG   = colors.HexColor('#edf2f9')
CARD_BG      = colors.HexColor('#e4ecf5')
TABLE_STRIPE = colors.HexColor('#eef3fa')
HEADER_FILL  = colors.HexColor('#1a4a7a')
BORDER       = colors.HexColor('#c0d0e2')
ACCENT       = colors.HexColor('#2d7ab3')
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')
TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD  = TABLE_STRIPE

MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

S = {}
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=16.5,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8)
S['lead'] = ParagraphStyle('Lead', parent=S['body'], fontSize=11, leading=17.5,
                           textColor=TEXT_PRIMARY)
S['h1'] = ParagraphStyle('H1x', fontName='FreeSerif', fontSize=19, leading=24,
                         textColor=HEADER_FILL, spaceBefore=16, spaceAfter=4)
S['h2'] = ParagraphStyle('H2x', fontName='FreeSerif', fontSize=13.5, leading=18,
                         textColor=HEADER_FILL, spaceBefore=13, spaceAfter=6)
S['h3'] = ParagraphStyle('H3x', fontName='FreeSerif', fontSize=11.5, leading=16,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=5)
S['bullet'] = ParagraphStyle('Bul', parent=S['body'], alignment=TA_LEFT, leftIndent=14,
                             bulletIndent=2, spaceAfter=4)
S['quote'] = ParagraphStyle('Quo', fontName='FreeSerif-Italic', fontSize=10.5, leading=16,
                            leftIndent=24, textColor=TEXT_MUTED, spaceBefore=6, spaceAfter=8)
S['caption'] = ParagraphStyle('Cap', fontName='FreeSerif', fontSize=8.5, leading=12,
                              alignment=TA_CENTER, textColor=TEXT_MUTED)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9, leading=12,
                         textColor=colors.white, alignment=TA_LEFT)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9, leading=12.5,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S['tdc'] = ParagraphStyle('TDC', parent=S['td'], alignment=TA_CENTER)
S['stat'] = ParagraphStyle('Stat', fontName='FreeSerif', fontSize=17, leading=20,
                           textColor=ACCENT, alignment=TA_CENTER)
S['statl'] = ParagraphStyle('StatL', fontName='FreeSerif', fontSize=7.5, leading=10,
                            textColor=TEXT_MUTED, alignment=TA_CENTER)
S['toc0'] = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=11, leading=17, textColor=TEXT_PRIMARY)
S['tocT'] = ParagraphStyle('TOCT', fontName='FreeSerif', fontSize=20, leading=26,
                           textColor=HEADER_FILL, spaceAfter=14)

story = []

def h1(num, text):
    label = f'{num}.  {text}' if num else text
    key = 'h_' + hashlib.md5(label.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{label}</b>', S['h1'])
    p.bookmark_name, p.bookmark_level, p.bookmark_text, p.bookmark_key = key, 0, label, key
    rule = HRFlowable(width='100%', color=ACCENT, thickness=1.2, spaceBefore=0, spaceAfter=10)
    story.append(CondPageBreak(H1_ORPHAN))
    story.append(KeepTogether([p, rule]))

def h2(text):
    story.append(Paragraph(f'<b>{text}</b>', S['h2']))

def h3(text):
    story.append(Paragraph(f'<b>{text}</b>', S['h3']))

def body(text, style='body'):
    story.append(Paragraph(text, S[style]))

def bullets(items):
    for it in items:
        story.append(Paragraph(it, S['bullet'], bulletText='\u2022'))
    story.append(Spacer(1, 4))

def callout_row(stats):
    """stats: list of (value, label) — renders a row of stat cards."""
    n = len(stats)
    w = (AVAIL_W - 12 * (n - 1)) / n
    cells = []
    for v, l in stats:
        inner = Table([[Paragraph(f'<b>{v}</b>', S['stat'])], [Paragraph(l, S['statl'])]],
                      colWidths=[w - 2])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 0.8, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 8), ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, 1), 1),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
        cells.append(inner)
    row = Table([cells], colWidths=[w] * n, hAlign='CENTER')
    row.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'),
                             ('LEFTPADDING', (0, 0), (-1, -1), 0),
                             ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                             ('TOPPADDING', (0, 0), (-1, -1), 0),
                             ('BOTTOMPADDING', (0, 0), (-1, -1), 0)]))
    story.append(Spacer(1, 6))
    story.append(KeepTogether(row))
    story.append(Spacer(1, 10))

def make_table(headers, rows, ratios, caption=None, align_center_cols=()):
    assert abs(sum(ratios) - 1.0) < 0.01, 'ratios must sum to 1'
    widths = [r * AVAIL_W * 0.98 for r in ratios]
    assert sum(widths) <= AVAIL_W + 0.5
    data = [[Paragraph(f'<b>{h}</b>', S['th']) for h in headers]]
    for r in rows:
        cells = []
        for ci, c in enumerate(r):
            st = S['tdc'] if ci in align_center_cols else S['td']
            cells.append(Paragraph(str(c), st))
        data.append(cells)
    t = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(('BACKGROUND', (0, i), (-1, i), TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(style))
    story.append(Spacer(1, 12))
    if len(rows) <= 14 and caption:
        cap = Paragraph(caption, S['caption'])
        story.append(KeepTogether([t, Spacer(1, 6), cap]))
    else:
        story.append(t)
        if caption:
            story.append(Spacer(1, 6))
            story.append(Paragraph(caption, S['caption']))
    story.append(Spacer(1, 12))

def chart(path, caption, max_h=280):
    from PIL import Image as PILImage
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(AVAIL_W / ow, max_h / oh, 1.0)
    img = Image(path, width=ow * ratio, height=oh * ratio)
    story.append(Spacer(1, 18))
    story.append(KeepTogether([img, Spacer(1, 8), Paragraph(caption, S['caption'])]))
    story.append(Spacer(1, 18))

# ━━ Page furniture: TOC page = roman i, body pages = Arabic from 1 ━━
def page_furniture(canvas, doc):
    canvas.saveState()
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, 'AcquisitionOS — Acquisition Valuation & Readiness Analysis')
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.drawString(MARGIN, 0.45 * inch, 'Internal analysis — September 2026')
    roman = {1: 'i'}
    label = roman.get(doc.page, str(doc.page - TOC_PAGES))
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, label)
    canvas.restoreState()

TOC_PAGES = 1  # verified after first build; footer math depends on it

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page - TOC_PAGES, key))

# ━━ FRONT MATTER: TOC ━━
story.append(Paragraph('<b>Table of Contents</b>', S['tocT']))
toc = TableOfContents()
toc.levelStyles = [S['toc0']]
story.append(toc)
story.append(PageBreak())

# ══════════ 1. EXECUTIVE SUMMARY ══════════
h1(1, 'Executive Summary')
body('This analysis answers one question with evidence instead of hope: if the entire AcquisitionOS product were put up for sale today, what could a real buyer reasonably pay for it? The answer below is built exclusively from direct inspection of the current workspace codebase — every route file, the Prisma schema, the test suite, the runtime database, environment configuration, git history, and documentation — and is benchmarked against published 2026 SaaS transaction data. Nothing in this report is based on the feature list, the development effort invested, or what the product could become with funding and customers it does not have.', 'lead')
body('The central findings are uncomfortable but clear. AcquisitionOS is a technically substantial product: a single Next.js 16 modular monolith with 505 API route files, roughly 258 service modules, 105 database models, and about 348,000 lines of TypeScript covering the full lead-acquisition lifecycle from discovery to outreach, meetings, billing, and an API platform. It is also a pre-commercial product with no verifiable revenue, no verifiable paying customers, a development-only database containing test accounts, unconfigured payment providers, 32 failing tests out of 824, roughly 114 hollow test skeletons that pass without asserting anything, no license file, and a git history squashed to 12 commits. The current deployment runs in a development sandbox on SQLite; no production deployment, production database, or operational telemetry was found in evidence.')
callout_row([('$0', 'Verified MRR / ARR [V]'), ('0', 'Verified paying customers [V]'),
             ('29', 'DB users — overwhelmingly test accounts [V]'), ('$5K\u2013$250K', 'Evidence-supported value range today [CE]')])
body('Under those conditions, market evidence for pre-revenue software assets (2026) suggests most sell for $500\u2013$25,000 [MB]. AcquisitionOS sits above the median pre-revenue asset on depth, breadth, and documentation, which supports a base-case asset value of roughly $25,000\u2013$60,000 (\u20b924 lakh \u2013 \u20b958 lakh) in a well-run sale, a conservative floor of $5,000\u2013$15,000 in a fast sale, and a strategic ceiling of $75,000\u2013$250,000 only if an aligned buyer with an existing customer base and distribution channel values the technology beyond its financials, and only after specific cleanup listed in this report. Every range assumes the buyer acquires code and architecture \u2014 not customers, revenue, or team. Sections 8\u201311 derive these numbers; Section 17 states the final answer; Section 19 separates verified fact from estimate throughout.')

# ══════════ 2. WHAT ACQUISITIONOS ACTUALLY IS ══════════
h1(2, 'What AcquisitionOS Actually Is')
body('AcquisitionOS (package name "vantage" v0.2.0 \u2014 a leftover from an earlier product iteration [V]) is an AI-powered B2B client-acquisition SaaS. Its verified core loop: discover businesses via search APIs, score their websites, research them with LLMs, compute four predictive scores (reply, conversion, urgency, revenue potential), generate personalized outreach, send it over email with open/click/reply tracking, detect buying signals in replies, orchestrate meetings through Google Calendar with a human-approval autonomy mode, and manage the resulting pipeline. A credits system meters every AI action; subscriptions (Free/Pro/Elite) with Stripe and Razorpay billing are fully coded; a Developer Access API-key platform, workflow automation engine, competitor intelligence, RAG with vector search, and multi-channel notifications (in-app, email, Telegram, WhatsApp, web push) round out the surface.')
make_table(
    ['Property', 'Verified value [V]', 'Evidence'],
    [
        ['Architecture', 'Modular monolith \u2014 one Next.js 16 process, one database', 'package.json; src tree; docs/02-architecture/SYSTEM-ARCHITECTURE.md'],
        ['API surface', '505 route.ts files in ~40 domains', 'rg --files src/app/api -g route.ts'],
        ['Business logic', '~258 service modules in src/lib', 'file count, verified 2026-09-21'],
        ['Data model', '105 Prisma models on SQLite (db/custom.db)', 'prisma/schema.prisma'],
        ['Frontend', 'Client-rendered SPA behind AuthGate; 247 components; React 19, Tailwind 4', 'src/app/page.tsx; component counts'],
        ['Auth', 'Custom JWT sessions (not NextAuth runtime): email/OTP, magic link, Google OAuth, TOTP MFA, revocable sessions, RBAC', 'src/lib/auth.ts; /api/auth/* routes'],
        ['AI stack', 'Z-AI SDK primary + OpenAI-compatible fallback; per-call cost metering; credit enforcement; RAG + vector search', 'src/lib/ai/ai-provider.ts; ai-cost-tracker.ts'],
        ['Background work', 'No queue/worker \u2014 in-process execution + 12 HTTP cron endpoints (CRON_SECRET)', 'src/app/api/cron/*; ADR-011'],
        ['Realtime', 'WebSocket (/api/ws) + SSE (/api/events/*), in-process event bus; optional Redis (unconfigured)', 'realtime-event-bus.ts; .env'],
        ['Payments', 'Stripe + Razorpay fully coded (webhooks, invoices, refunds, GST, credits) but unconfigured \u2014 no keys in env', 'src/lib/payments/*; .env inspection'],
        ['Code volume', '~348,000 lines of TS/TSX in src/ (incl. AI-generated density)', 'wc -l over src tree'],
    ],
    [0.18, 0.42, 0.40],
    'Table 1 \u2014 The product as verified by code inspection (not by documentation claims).')
body('Two verification gaps matter for a buyer\u2019s understanding of the product. First, the production deployment story is aspirational: a reduced 6-model PostgreSQL schema (prisma/schema.production.prisma) exists for a Supabase/Vercel target, but it covers a fraction of the 105-model dev schema, and no production database or deployment was found in evidence. Second, several headline integrations are credential-gated shells: the payment, WhatsApp, Telegram, and push channels are implemented end-to-end in code but have never processed a real transaction in this environment, because their keys are absent. A buyer is therefore acquiring working code, not working businesses plumbing.')

# ══════════ 3. CURRENT PRODUCT MATURITY ══════════
h1(3, 'Current Product Maturity')
body('Classification: <b>advanced pre-commercial MVP \u2014 between Beta and Production-ready on code quality, but not commercially deployed, and not acquisition-ready as a business.</b> The label is justified per dimension below, because a single word would hide the asymmetry: the software is far more mature than the business around it.')
make_table(
    ['Stage', 'Verdict', 'Evidence for the verdict'],
    [
        ['MVP', 'Exceeded', 'The core loop (discover \u2192 score \u2192 outreach \u2192 reply \u2192 meeting) is complete and deep, with 505 routes vs a typical MVP\u2019s dozens.'],
        ['Beta', 'Met (software)', 'Feature suite docs claim 88 working / 27 partial / 3 planned features; auth, credits, workflows, and admin are implemented with real test coverage in unit/integration suites.'],
        ['Production-ready', 'Not met operationally', 'SQLite in current runtime; middleware disabled; 32 failing tests; no configured payment keys; no external monitoring (Sentry/OTLP unset); no production deploy found in evidence.'],
        ['Commercially deployable', 'Not met', 'No verifiable customers, revenue, or billing runs; onboarding-to-payment loop unexercised with real money.'],
        ['Enterprise-ready', 'Not met', 'No SSO/SCIM, no org-level audit certifications, no SOC2/ISO artifacts, single-process scaling limits documented in docs/technical/SCALABILITY-PLAN.md.'],
        ['Acquisition-ready', 'Not met \u2014 cleanup required', 'No LICENSE file, squashed git history (12 commits), fictional metrics document present in repo, legacy contradictory docs (now bannered), no financial records.'],
    ],
    [0.20, 0.16, 0.64],
    'Table 2 \u2014 Maturity classification by stage, with the evidence that forces each verdict.')
h2('3.1 Unfinished and partially implemented features')
bullets([
    'Payments: Stripe/Razorpay flows coded but never executed end-to-end with live keys \u2014 checkout fails fast by design until configured [V].',
    'Middleware: src/middleware.ts disabled in this deployment (middleware.ts.disabled); edge-level checks compensated per-route [V].',
    'CRM sync: meeting/crm-sync.ts is a scaffold; HubSpot/Salesforce sync not implemented [V].',
    'Schema drift: code references fields missing from Prisma models (schema-gap-report.json); production schema covers 6 of 105 models [V].',
    'Tests: tests/e2e/* and tests/load/* are empty skeletons \u2014 114 test cases with zero assertions that pass trivially [V].',
    'A/B testing for outreach, and multi-replica horizontal scaling: documented as planned, not implemented [V].',
])
h2('3.2 Technical debt, security and scalability risks')
body('The most consequential debt is the SQLite-to-PostgreSQL gap: the entire schema, indexes, and the production variant exist, but the migration has not been run or validated at full scale, and three real migrations exist against a mostly db-push-driven workflow. Security work is genuinely present \u2014 rate limiting, CSRF, input validation, webhook signature verification, MFA, session revocation, device fingerprinting, and two internal penetration-test reports (which honestly record that only 12 of 492 routes were rate-limited at test time) \u2014 but the cross-account isolation audit that this product\u2019s history demanded was only partially completed, and a buyer will treat any residual tenancy leakage as a blocking defect. Scalability is bounded by design: one process, in-memory caching, in-process SSE/WebSocket affinity, and no queue; the repo\u2019s own scalability plan documents these limits honestly.')

# ══════════ 4. VERIFIED BUSINESS METRICS ══════════
h1(4, 'Verified Business Metrics')
body('The only database available for inspection is the development SQLite file (db/custom.db, ~4.4 MB). No production database, analytics export, billing dashboard, or accounting record exists in the workspace. Metrics below are therefore classified as Verified (read directly from the DB or code), Estimated (calculated with stated assumptions), or Unavailable (no data source exists). Do not mistake Verified dev-database numbers for business traction: they verify what the software recorded during testing, not commercial activity.')
make_table(
    ['Metric', 'Value', 'Class', 'Source / note'],
    [
        ['Registered users', '29 in dev DB \u2014 overwhelmingly synthetic test accounts', 'Verified (as dev data)', 'users table: test@example.com, ethereal test addresses, plus 2\u20133 manual test logins'],
        ['Active users', 'Not measurable \u2014 no telemetry/analytics pipeline in production', 'Unavailable', 'No analytics export exists'],
        ['Paying users', '0 verifiable', 'Verified (absence)', 'PaymentOrder history absent; 2 invoices exist from test flows'],
        ['MRR / ARR / revenue', '$0 verifiable', 'Verified (absence)', 'No live Stripe/Razorpay keys configured; no billing records'],
        ['Churn / retention / conversion / CAC / LTV', 'Unavailable', 'Unavailable', 'No cohort or funnel data recorded'],
        ['Leads created', '89 rows in dev DB', 'Verified (as dev data)', 'leads table'],
        ['Deals closed', '0 rows', 'Verified (absence)', 'deals table empty'],
        ['Subscriptions', '27 rows: 23 trial, 4 marked active during test sessions', 'Verified (as dev data)', 'subscriptions table'],
        ['Credit consumption / AI cost', 'Mechanism exists (AiCostRecord, CreditsLedger); totals are dev-only', 'Unavailable commercially', 'ai_cost_records + credits_ledger in dev DB'],
        ['Infrastructure cost', 'Sandbox-era only; no production bill exists', 'Unavailable', 'No cloud account evidence in workspace'],
        ['Customer concentration', 'N/A \u2014 no customers', 'Verified (absence)', '\u2014'],
    ],
    [0.24, 0.30, 0.16, 0.30],
    'Table 3 \u2014 Business metrics with evidence classification. [V] rows verify software records, not commercial traction.')
body('The honest headline: <b>every financial metric that drives a revenue-multiple valuation is unavailable or zero.</b> Any document claiming otherwise about this product \u2014 including the fictional interview-preparation document found in the repository (\u201c\u20b94.2M MRR, 3,200 organizations\u201d), which is now labeled as fiction \u2014 has no basis in the codebase or database.')

# ══════════ 5. TECHNOLOGY ASSESSMENT ══════════
h1(5, 'Technology Assessment')
body('Judged independently of revenue, the technology is the strongest asset in the sale. The system implements a genuinely long automation chain \u2014 discovery, website scoring, AI research, four-factor scoring with explanations, outreach generation, multi-channel sending, reply intelligence, hot-lead detection, sequence enrollment, meeting autonomy with human approval, workflow engine with dead-letter handling, credits metering, and a Developer Access API \u2014 as coherent service modules rather than one tangled script. Internal modularity is real: thin routes delegate to src/lib services (a "thin routes / fat services" pattern), and domain folders (ai/, lead-discovery/, meeting/, payments/, security/, notification-channels/) mark plausible extraction boundaries.')
h2('5.1 Engineering effort represented (supporting perspective, not valuation)')
body('Naively multiplying 348K lines by salary produces absurd numbers, because a large share of the code is AI-generated, repetitive, or scaffolding. A defensible replacement estimate works from subsystems: a skilled 2\u20133 person team rebuilding functional equivalence of the core loop, auth, credits, workflows, and API platform would need roughly 12\u201324 engineer-months; full parity of all 505 routes and auxiliary systems plausibly reaches 30\u201350 engineer-months. At blended fully-loaded rates of $8K\u2013$15K per engineer-month, that frames a replacement cost of roughly <b>$150K\u2013$400K for the functional core, up to ~$600K for full parity</b> [CE]. This is what the code would cost to rebuild \u2014 it is not what the asset sells for, because replacement cost ignores market demand, revenue, and risk. Buyers discount it heavily; it serves only as a negotiation anchor and an insurance valuation.')
h2('5.2 Subsystem depth ratings')
make_table(
    ['Subsystem', 'Depth (0\u20135)', 'Notes'],
    [
        ['Lead discovery + research', '4', 'Google Custom Search + SerpAPI, website scoring with proxy rotation, AI company research; source adapters registered'],
        ['AI analysis + scoring', '4', 'Four composite scores + reasoning, prompt manager, cost tracking, enforcement before calls'],
        ['Outreach + sequences', '4', 'Generation, scheduling, open/click tracking, bounce intelligence, reply classification, autonomous SDR loop'],
        ['Workflow engine', '3.5', 'Definitions, executor, triggers, DLQ, replay, templates, metrics \u2014 in-process (no durable queue)'],
        ['Meetings orchestration', '4', 'Intent detection, slot search, approvals, Google Meet links, reminders, post-meeting AI notes'],
        ['Billing + credits', '3.5', 'Two providers, idempotent webhooks, invoices/PDF, dunning, GST \u2014 unconfigured in practice'],
        ['Developer Access API', '3', 'API keys (hashed), rotation, revocation, usage tracking, scoped endpoints'],
        ['Security', '3.5', 'MFA, session revocation, device fingerprint, rate limiting, CSRF/CORS/headers, 2 pentest reports'],
        ['Observability', '2.5', 'In-process OTel hooks, health endpoints, loggers \u2014 no external backend configured'],
        ['Tests', '2.5', 'Real unit/integration/security suites (678 passing, 1,900+ assertions); e2e/load hollow; 32 failures'],
        ['Documentation', '4', 'Current 2026-09 suite: architecture, ADRs, API reference, runbooks, KT docs; legacy contradictions now bannered'],
    ],
    [0.30, 0.12, 0.58],
    'Table 4 \u2014 Subsystem depth from code inspection. Ratings are [CE] (assessed estimates), grounded in cited files.')
body('Deployment readiness is the weakest area: the verified runtime is a sandbox process on SQLite with a keepalive script. Multi-cloud readiness is documentation-level \u2014 deploy/k8s, terraform, render artifacts describe the abandoned FastAPI/Celery generation (now explicitly marked historical), while deploy/railway (single Docker web service) matches the current architecture and is the recommended target in the knowledge-transfer docs.')

# ══════════ 6. STRATEGIC VALUE ══════════
h1(6, 'Strategic Value')
body('Strategic value exists only where a buyer can plug an asset into something they already have. The capabilities below are verified in code; whether any specific buyer class would pay for them is a hypothesis to be tested in a real process \u2014 nothing here claims a named buyer will acquire the product.')
make_table(
    ['Buyer type', 'Capability they could obtain', 'Why it might matter to them'],
    [
        ['Lead-gen / sales-intelligence companies', 'Discovery \u2192 research \u2192 scoring \u2192 outreach chain with reply intelligence', 'Could accelerate their roadmap by months versus building in-house; scoring logic is tunable IP'],
        ['Sales-automation / AI-SDR startups', 'Autonomous SDR pipeline, sequence engine, hot-lead detection, meeting autonomy with approvals', 'Reference implementation of the full autonomous loop including human-in-the-loop controls'],
        ['CRM / marketing platforms', 'Credits metering, entitlements, multi-provider billing scaffolding, Developer Access API', 'Proven metering + API-key monetization plumbing they may lack'],
        ['Agencies (scaled)', 'White-label/org branding, multi-channel notifications, pipeline analytics', 'Productized client-acquisition system they could operate rather than build'],
        ['PE / search-fund operators', 'A complete, documented codebase with KT docs and honest feature-status matrix', 'Lower technical DD friction; a base to roll other lead-gen acquisitions into'],
        ['SaaS portfolio buyers', 'Workflow engine + API platform + credits as reusable infrastructure', 'Cross-portfolio reuse of metering and automation layers'],
    ],
    [0.22, 0.40, 0.38],
    'Table 5 \u2014 Potential strategic capabilities by buyer type (hypotheses, not claims of intent).')
body('The strongest single strategic object is the end-to-end autonomy architecture: credits-enforced AI actions, an event bus feeding SSE/WebSocket surfaces, a workflow engine with dead-letter and replay, and a meeting-autonomy engine that requires human approval \u2014 most comparable products implement fragments of this chain. The weakest is that none of it is proven at production load or with paying tenants, so a strategic buyer is paying for accelerated development time, not for proven unit economics.')

# ══════════ 7. CURRENT MARKET BENCHMARKS ══════════
h1(7, 'Current Market Benchmarks (2026)')
body('Benchmarks below were retrieved in September 2026 from public M&A sources; each is a market data point, not an AcquisitionOS-specific fact. Where sources disagree, the disagreement is shown.')
make_table(
    ['Benchmark', '2026 figure', 'Source (retrieved Sep 2026)'],
    [
        ['Pre-revenue software projects, typical sale', '$500 \u2013 $25,000', 'exitbid.io, Jul 2026'],
        ['Micro-SaaS under $1M ARR, average multiple', '~2.85\u00d7 annual profit (top quartile 6.13\u00d7)', 'Flippa / startupa.ge, Mar 2026'],
        ['Small SaaS listings, median', '2.0\u00d7 trailing revenue or 3.4\u00d7 profit (651 listings)', 'bigideasdb, Jul 2026'],
        ['Bootstrapped SaaS, typical', '~4.8\u00d7 (revenue basis)', 'Flippa 2026 guidance'],
        ['SaaS at $1M\u2013$50M ARR', '4.0\u00d7 \u2013 8.0\u00d7 ARR', 'AdAstra Equity, Jun 2026'],
        ['Private SaaS deals, median', '~4.7\u00d7 EV/Revenue (public median ~6.1\u00d7)', 'Aventis Advisors, Aug 2026'],
        ['Market context', 'Global TMT deal value +41% YoY to $2.4T (Jan\u2013May 2026); below ~$5M EV, EBITDA/SDE multiples dominate', 'FE International, Aug\u2013Sep 2026'],
    ],
    [0.34, 0.33, 0.33],
    'Table 6 \u2014 2026 market benchmarks [MB]. Application to AcquisitionOS starts in Section 8, never as a blind multiple.')
body('Two structural rules from these sources govern this analysis. First, revenue multiples are for businesses with revenue; below roughly $500K ARR, buyers switch to profit (SDE) multiples, and with zero profit the price collapses toward asset value. Second, pre-revenue assets trade in a narrow band set by code quality, transferability, and buyer-specific strategic fit \u2014 which is exactly the Scenario A/B/D structure used next.')

# ══════════ 8. VALUATION SCENARIOS ══════════
h1(8, 'Valuation Scenarios')
h2('Scenario A \u2014 Technology / asset sale (as-is today)')
body('Assumes a buyer acquires source code, architecture, AI logic, and product with little or no meaningful recurring revenue \u2014 which is the verified state. The pre-revenue benchmark ($500\u2013$25K [MB]) sets the frame; AcquisitionOS justifies the upper part of that band and modestly beyond it on depth (505 routes, 258 services, 105 models), coherence, and unusually complete documentation, while hollow e2e tests, 32 failures, the absent license, dev-only database, and unconfigured payments pull the price back down. <b>Realistic range: $5,000 \u2013 $60,000 [CE]</b>, with the low end a fast sale and the upper end requiring a patient, well-marketed process to the right micro-acquirer or agency.')
h2('Scenario B \u2014 Product acquisition (working SaaS + users)')
body('Assumes a buyer values a working SaaS with users, workflows, integrations, and product maturity. Today this scenario cannot be fully priced because its prerequisite \u2014 real users \u2014 is unverified; effectively it collapses toward Scenario A. Illustratively [CE]: if the product had 10\u201330 paying subscribers at $29\u2013$99 (ARR \u2248 $6K\u2013$20K), micro-SaaS profit/revenue multiples of 2\u20134\u00d7 would imply $15K\u2013$80K before any strategic adjustment. The honest as-is statement: <b>$15,000 \u2013 $75,000, conditional on traction materializing that does not currently exist in evidence; as-is, treat as Scenario A.</b>')
h2('Scenario C \u2014 Revenue-generating SaaS')
body('With verified MRR of $0, the revenue-multiple formula yields $0 \u2014 it is included to show the mechanics a buyer would use the moment real revenue exists. Justified multiple for a sub-$1M-ARR, no-growth-history SaaS: 2\u20135\u00d7 ARR [CE, from Table 6 bands].')
make_table(
    ['Hypothetical MRR', 'ARR', 'Multiple (2\u20135\u00d7)', 'Implied EV [CE]', 'INR at \u20b996/USD'],
    [
        ['$0 (verified today)', '$0', '\u2014', '$0', '\u20b90'],
        ['$1,000', '$12,000', '2\u20134\u00d7', '$24K \u2013 $48K', '\u20b923L \u2013 \u20b946L'],
        ['$5,000', '$60,000', '2.5\u20134\u00d7', '$150K \u2013 $240K', '\u20b91.44Cr \u2013 \u20b92.3Cr'],
        ['$20,000', '$240,000', '3\u20135\u00d7', '$720K \u2013 $1.2M', '\u20b96.9Cr \u2013 \u20b911.5Cr'],
    ],
    [0.22, 0.14, 0.16, 0.24, 0.24],
    'Table 7 \u2014 Scenario C mechanics: what revenue would have to exist for revenue-multiple pricing to matter.',
    align_center_cols=(1, 2))
h2('Scenario D \u2014 Strategic acquisition')
body('A buyer that can immediately plug the product into an existing customer base and distribution channel can extract value beyond financials: months of roadmap acceleration, a metered-AI reference architecture, and an outreach/automation surface to resell. No invented premium is claimed here; the conditions required for a strategic premium are specific and checkable: (1) the buyer\u2019s roadmap includes lead-gen/SDR capability; (2) integration cost into their stack is low (clean single-process code and docs help); (3) IP is transferable \u2014 license file added, founder-ownership clean, no encumbrances; (4) transition support from the founder is agreed (the codebase carries meaningful undocumented context despite good docs); (5) deal structure absorbs risk (earnout or asset warranty). <b>Conditional range: $75,000 \u2013 $250,000 [CE]</b>, with anything above $100K realistically involving earnout components tied to integration or revenue milestones, not all cash at closing.')
chart('/home/z/my-project/scripts/chart_scenarios.png',
      'Figure 1 \u2014 Scenario ranges [CE]. Scenario B is shown at its conditional band; as-is it collapses to Scenario A.')

# ---- PART 2 CONTINUES IN valuation_content2.py ----
from valuation_content2 import add_late_chapters
CTX = dict(story=story, S=S, h1=h1, h2=h2, h3=h3, body=body, bullets=bullets,
           callout_row=callout_row, make_table=make_table, chart=chart,
           Spacer=Spacer, KeepTogether=KeepTogether, Paragraph=Paragraph,
           HRFlowable=HRFlowable, ACCENT=ACCENT, HEADER_FILL=HEADER_FILL,
           CARD_BG=CARD_BG, BORDER=BORDER, TEXT_MUTED=TEXT_MUTED, TEXT_PRIMARY=TEXT_PRIMARY,
           AVAIL_W=AVAIL_W)
add_late_chapters(CTX)

# ━━ BUILD ━━
OUT_BODY = '/home/z/my-project/scripts/valuation_body.pdf'
doc = TocDocTemplate(OUT_BODY, pagesize=A4,
                     leftMargin=MARGIN, rightMargin=MARGIN,
                     topMargin=MARGIN, bottomMargin=MARGIN,
                     title='AcquisitionOS — Acquisition Valuation and Readiness Analysis',
                     author='Z.ai', creator='Z.ai',
                     subject='Evidence-based acquisition valuation of the AcquisitionOS product')
doc.multiBuild(story, onFirstPage=page_furniture, onLaterPages=page_furniture)
print('body built:', OUT_BODY)

# ━━ MERGE COVER + BODY ━━
from pypdf import PdfReader, PdfWriter

def normalize_a4(page):
    from pypdf.generic import RectangleObject
    w, h = 595.2755905511812, 841.8897637795277
    page.scale_to(w, h)
    return page

writer = PdfWriter()
# Cover (794x1123px Playwright output) -> scale to exact A4; body pages are already exact A4
writer.add_page(normalize_a4(PdfReader('/home/z/my-project/scripts/valuation_cover.pdf').pages[0]))
for p in PdfReader(OUT_BODY).pages:
    writer.add_page(p)
writer.add_metadata({'/Title': 'AcquisitionOS — Acquisition Valuation and Readiness Analysis',
                     '/Author': 'Z.ai', '/Creator': 'Z.ai',
                     '/Subject': 'Evidence-based acquisition valuation of the AcquisitionOS product'})
FINAL = '/home/z/my-project/download/AcquisitionOS-Acquisition-Valuation-Analysis.pdf'
os.makedirs(os.path.dirname(FINAL), exist_ok=True)
with open(FINAL, 'wb') as f:
    writer.write(f)
print('final:', FINAL)
