#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════
# AcquisitionOS — Acquisition Readiness & Valuation Analysis (PDF)
# Route: Report (ReportLab body) + Template 07 Crystal Blue cover
# ═══════════════════════════════════════════════════════════════
import os, sys, hashlib, subprocess

BASE = '/home/z/my-project'
SKILL = f'{BASE}/skills/pdf'
OUT_DIR = f'{BASE}/download'
os.makedirs(OUT_DIR, exist_ok=True)

# ── Fonts (allowed set only) ────────────────────────────────────
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

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

sys.path.insert(0, f'{SKILL}/scripts')
from pdf import install_font_fallback
install_font_fallback()

# ── Template 07 Crystal Blue body palette (fixed per cover.md) ──
from reportlab.lib import colors
PAGE_BG      = colors.HexColor('#f5f8fc')
CARD_BG      = colors.HexColor('#e4ecf5')
TABLE_STRIPE = colors.HexColor('#eef3fa')
HEADER_FILL  = colors.HexColor('#1a4a7a')
BORDER       = colors.HexColor('#c0d0e2')
ACCENT       = colors.HexColor('#2d7ab3')
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

# ── Styles ──────────────────────────────────────────────────────
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle

body = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=17,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=8)
bullet = ParagraphStyle('Bullet', parent=body, alignment=TA_LEFT, leftIndent=16,
                        bulletIndent=4, spaceAfter=5)
h1 = ParagraphStyle('H1x', fontName='FreeSerif', fontSize=20, leading=26,
                    textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10)
h2 = ParagraphStyle('H2x', fontName='FreeSerif', fontSize=14, leading=20,
                    textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=7)
caption = ParagraphStyle('Cap', fontName='FreeSerif', fontSize=8.5, leading=12,
                         textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6)
quote = ParagraphStyle('Quote', parent=body, fontName='FreeSerif-Italic',
                       leftIndent=24, textColor=TEXT_MUTED)
tbl_head = ParagraphStyle('TblHead', fontName='FreeSerif', fontSize=9.5, leading=13,
                          textColor=colors.white, alignment=TA_CENTER)
tbl_cell = ParagraphStyle('TblCell', fontName='FreeSerif', fontSize=9.5, leading=13,
                          textColor=TEXT_PRIMARY, alignment=TA_LEFT)
tbl_cell_c = ParagraphStyle('TblCellC', parent=tbl_cell, alignment=TA_CENTER)
stat_big = ParagraphStyle('StatBig', fontName='FreeSerif', fontSize=19, leading=23,
                          textColor=ACCENT, alignment=TA_CENTER)
stat_lbl = ParagraphStyle('StatLbl', fontName='FreeSerif', fontSize=8.5, leading=11.5,
                          textColor=TEXT_MUTED, alignment=TA_CENTER)

# ── TOC-capable doc template ────────────────────────────────────
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, KeepTogether, CondPageBreak, Image)
from reportlab.platypus.tableofcontents import TableOfContents

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

H1_ORPHAN = (A4[1] - 1.35 * inch) * 0.15

def section(story, num, title):
    story.append(CondPageBreak(H1_ORPHAN))
    story.append(add_heading(f'{num}. {title}', h1, level=0))

def sub(story, title):
    story.append(add_heading(title, h2, level=1))

# ── Table helpers ───────────────────────────────────────────────
def make_table(headers, rows, ratios, align_map=None):
    avail = A4[0] - 2 * 0.85 * inch
    widths = [r * avail for r in ratios]
    data = [[Paragraph(f'<b>{h}</b>', tbl_head) for h in headers]]
    for row in rows:
        cells = []
        for i, c in enumerate(row):
            st = tbl_cell if (align_map or {}).get(i, 'L') == 'L' else tbl_cell_c
            cells.append(Paragraph(str(c), st))
        data.append(cells)
    t = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(('BACKGROUND', (0, i), (-1, i),
                      TABLE_STRIPE if i % 2 == 0 else colors.white))
    t.setStyle(TableStyle(style))
    return t

def add_table(story, title, headers, rows, ratios, align_map=None):
    story.append(Spacer(1, 12))
    t = make_table(headers, rows, ratios, align_map)
    if len(rows) <= 14:
        story.append(KeepTogether([t, Spacer(1, 5), Paragraph(title, caption)]))
    else:
        story.append(t)
        story.append(Spacer(1, 5))
        story.append(Paragraph(title, caption))
    story.append(Spacer(1, 12))

def callout_row(story, stats):
    """Row of stat callout boxes: stats = [(value, label), ...]"""
    n = len(stats)
    avail = A4[0] - 2 * 0.85 * inch
    w = min(160, (avail - 12 * (n - 1)) / n)
    cells = []
    for val, lab in stats:
        inner = Table([[Paragraph(f'<b>{val}</b>', stat_big)],
                       [Paragraph(lab, stat_lbl)]], colWidths=[w])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 1, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        cells.append(inner)
    outer = Table([cells], colWidths=[w + 12] * n, hAlign='CENTER')
    outer.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                               ('LEFTPADDING', (0, 0), (-1, -1), 6),
                               ('RIGHTPADDING', (0, 0), (-1, -1), 6)]))
    story.append(Spacer(1, 8))
    story.append(KeepTogether(outer))
    story.append(Spacer(1, 10))

def label(txt):
    color_map = {'VERIFIED': '#2d7ab3', 'BENCHMARK': '#5a7a96',
                 'ESTIMATE': '#1a4a7a', 'ASSUMPTION': '#5a7a96', 'UNKNOWN': '#8a9aa8'}
    return f'<font color="{color_map.get(txt, "#5a7a96")}"><b>[{txt}]</b></font>'

# ── Page furniture ──────────────────────────────────────────────
DOC_TITLE = 'AcquisitionOS - Acquisition Readiness & Valuation Analysis'

def on_page(canvas, doc):
    canvas.saveState()
    # page background (Template 07 light blue body)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, A4[0], A4[1], stroke=0, fill=1)
    # header
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(0.85 * inch, A4[1] - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(0.85 * inch, A4[1] - 0.62 * inch, A4[0] - 0.85 * inch, A4[1] - 0.62 * inch)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(0.85 * inch, 0.62 * inch, A4[0] - 0.85 * inch, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.drawString(0.85 * inch, 0.45 * inch, 'Internal analysis - prepared for the founder')
    canvas.drawRightString(A4[0] - 0.85 * inch, 0.45 * inch, f'Page {doc.page}')
    canvas.restoreState()

# ── Chart: valuation ranges (horizontal bars, palette colors) ───
import matplotlib
matplotlib.use('Agg')
import matplotlib.font_manager as fm
for _fp in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
            '/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']:
    try:
        fm.fontManager.addfont(_fp)
    except Exception:
        pass
import matplotlib.pyplot as plt
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Noto Sans SC']
plt.rcParams['axes.unicode_minus'] = False

CHART = f'{OUT_DIR}/valuation_ranges.png'
fig, ax = plt.subplots(figsize=(7.4, 3.0), constrained_layout=True)
scenarios = ['Strategic case\n(conditional)', 'Base case\n(most defensible)', 'Conservative\n(fast sale)']
low = [100, 25, 10]
high = [250, 75, 25]
bar_colors = ['#7aa8cc', '#2d7ab3', '#a8c4dc']
y = range(len(scenarios))
ax.barh(y, [h - l for l, h in zip(low, high)], left=low, color=bar_colors, height=0.52, zorder=3)
for i, (l, hval) in enumerate(zip(low, high)):
    ax.text(l - 4, i, f'${l}K', va='center', ha='right', fontsize=10, color='#142840')
    ax.text(hval + 4, i, f'${hval}K', va='center', ha='left', fontsize=10, color='#142840')
ax.set_yticks(list(y)); ax.set_yticklabels(scenarios, fontsize=10, color='#142840')
ax.set_xlim(0, 300)
ax.set_xlabel('Indicative enterprise value (USD thousands)', fontsize=10, color='#5a7a96')
ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
ax.spines['left'].set_color('#c0d0e2'); ax.spines['bottom'].set_color('#c0d0e2')
ax.tick_params(colors='#5a7a96')
ax.xaxis.grid(True, linestyle='--', alpha=0.2, color='#5a7a96', zorder=0)
ax.set_axisbelow(True)
fig.savefig(CHART, dpi=200)
plt.close(fig)

# ── Build story ─────────────────────────────────────────────────
story = []

# TOC page
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle('TOC1', fontName='FreeSerif', fontSize=11, leading=17, leftIndent=14, textColor=TEXT_PRIMARY),
    ParagraphStyle('TOC2', fontName='FreeSerif', fontSize=9.5, leading=14, leftIndent=34, textColor=TEXT_MUTED),
]
story.append(Paragraph('<b>Table of Contents</b>',
             ParagraphStyle('TOCTitle', parent=h1, spaceBefore=6)))
story.append(Spacer(1, 10))
story.append(toc)
story.append(PageBreak())

P = story.append

# ═══ 1. EXECUTIVE SUMMARY ═══════════════════════════════════════
section(story, 1, 'Executive Summary')
P(Paragraph(
    'AcquisitionOS is an AI-powered lead-generation and outreach platform consisting of a large Next.js codebase '
    '(1,051 TypeScript files, roughly 336,000 lines of source, 496 API routes, 104 database models) with a working '
    'authentication stack, credit system, discovery engine, AI analysis services, and an extensive dashboard. This '
    'analysis was produced by direct inspection of the current codebase and production database, and every material '
    'conclusion is labeled as verified, a market benchmark, a calculated estimate, an assumption, or unknown.', body))
P(Paragraph(
    'The commercial picture is difficult and this report does not soften it: the platform has <b>29 registered '
    'accounts, of which at most 3-4 are real persons</b>, and <b>zero verified revenue</b> - there are no paid '
    'payment orders in the database, no deals, no outreach messages sent, and no credit-ledger activity. The three '
    '"active" paid subscriptions in the database are QA/test fixtures, not customer purchases. On current evidence '
    'the defensible value of the business lies almost entirely in its technology, not its traction.', body))
callout_row(story, [
    ('$0', 'Verified revenue (VERIFIED)'),
    ('29', 'Registered accounts (VERIFIED)'),
    ('3-4', 'Real-person accounts (VERIFIED)'),
    ('88', 'Leads in production DB (VERIFIED)'),
])
P(Paragraph(
    'The complete valuation picture: a conservative fast sale plausibly clears <b>USD 10,000-25,000</b>; a properly '
    'marketed base-case sale of the technology asset supports roughly <b>USD 25,000-75,000</b>; and a strategic '
    'buyer who could fold the workflow/AI-lead-intelligence stack into an existing distribution channel might pay '
    '<b>USD 100,000-250,000</b>, but only under conditions that do not exist today (working pilots, documented '
    'integration value, clean full-codebase security audit). These ranges are calculated estimates anchored to '
    'micro-SaaS asset benchmarks, not guarantees. In Indian Rupees (assumption: 1 USD = INR 84) the ranges are '
    'roughly INR 8.4-21 lakh, INR 21-63 lakh, and INR 84 lakh-2.1 crore respectively.', body))

# ═══ 2. WHAT ACQUISITIONOS ACTUALLY IS ═════════════════════════
section(story, 2, 'What AcquisitionOS Actually Is')
P(Paragraph(
    'AcquisitionOS is a single-tenant-to-multitenant-capable B2B SaaS aimed at agencies and service sellers: it '
    'discovers business leads from multiple sources (Google Custom Search, z-ai web search, and directory-style '
    'sources), enriches them, scores them, runs AI analysis (website quality, gap detection, outreach angles), and '
    'orchestrates outreach sequences and workflows with a credit-based monetization meter. The product ships a '
    'dashboard with 181 dashboard components, a workflow builder with a template library, messaging/outreach '
    'surfaces, an API-key system with plan entitlements, and billing integrations for Stripe and Razorpay.', body))
P(Paragraph(
    'Verified subsystems, from direct code and runtime inspection: OTP/magic-link/Google OAuth authentication with '
    'real Gmail SMTP delivery (all three proven end-to-end during this analysis session), session and MFA scaffolding, '
    'rate limiting, audit logging, a lead-resolution authorization layer, a website discovery-and-verification service, '
    'credit accounting, plan entitlement middleware, observability hooks, and 145 internal documentation files. The '
    'database is SQLite via Prisma - acceptable for a sandbox, but a genuine production-readiness gap (see Section 5).', body))
P(Paragraph(
    'What it is not, honestly: it is not a proven revenue machine, and parts of the surface area are newer than they '
    'look. A git lineage reset in a prior session destroyed several feature commits (including an earlier pipeline UI '
    'and isolation fixes), which is why portions of this session were spent re-applying lost security work. Buyers '
    'performing due diligence on git history will see discontinuities; that must be explained rather than hidden.', body))

# ═══ 3. CURRENT PRODUCT MATURITY ═══════════════════════════════
section(story, 3, 'Current Product Maturity')
P(Paragraph(
    'Classification: <b>late MVP / early beta</b> - functional, wide, and demonstrably improvable, but not yet '
    'commercially deployable. The evidence for "functional" is strong: the auth stack delivers real email; discovery '
    'jobs complete; the enrichment pipeline discovered and verified real company websites (cytecare.com, nakheel.com) '
    'during this session with evidence-based verification; the UI renders a full dashboard. The evidence against '
    '"commercially deployable" is equally strong: zero production payments, a database engine not suited to '
    'multi-writer production, a partially completed application-wide security audit, and only 12 test files across '
    'a 336k-line codebase.', body))
add_table(story,
    'Table 1 - Maturity assessment by layer (VERIFIED unless noted).',
    ['Layer', 'State', 'Evidence / gap'],
    [
        ['Authentication & sessions', 'Production-usable', 'OTP, magic link, Google OAuth verified live; MFA scaffold present'],
        ['Lead discovery & enrichment', 'Beta', 'Multi-source fan-out works; website verification added this session'],
        ['AI analysis & research', 'Beta', 'Evidence guardrails added this session; prompt quality varies by provider'],
        ['Workflow automation', 'Beta', 'Engine + templates present; UI for one flagship flow lost in lineage reset'],
        ['Billing (Stripe/Razorpay)', 'Incomplete', 'Models and code exist; no live keys configured; zero payment orders'],
        ['Data layer', 'MVP', 'SQLite in production path; no migration discipline before this session'],
        ['Tests & CI', 'Weak', '12 test files; no CI pipeline in repository'],
        ['Observability & ops', 'Scaffold', 'Health/metrics routes exist; no external monitoring or alerting'],
    ],
    [0.24, 0.18, 0.58])
P(Paragraph(
    'Known defects as of this session: an unauthenticated website-analysis endpoint (fixed), cross-account lead '
    'visibility via a fail-open org check (fixed), missing user scoping on lead creation and search (fixed), and a '
    'full 40-plus-resource isolation audit that remains pending. Technical debt is concentrated in duplicated '
    'scaffolding components, inconsistent authorization middleware adoption across the 496 routes, and sparse tests.', body))

# ═══ 4. VERIFIED BUSINESS METRICS ══════════════════════════════
section(story, 4, 'Verified Business Metrics')
P(Paragraph(
    'All figures below were queried directly from the production database (db/custom.db) on 21 September 2026. '
    'Where a metric cannot be established from data, it is explicitly marked Unknown; nothing here is invented.', body))
add_table(story,
    'Table 2 - Verified metrics from the production database (21 Sep 2026).',
    ['Metric', 'Value', 'Status', 'Note'],
    [
        ['Registered users', '29', 'VERIFIED', 'Includes QA/pentest fixtures'],
        ['Real-person accounts', '3-4', 'VERIFIED', 'Owner accounts + one 2026-06 signup'],
        ['Active users (30d / 7d)', '3 / 2', 'VERIFIED', 'Effectively founder + testers'],
        ['Paying customers', '0', 'VERIFIED', 'No paid PaymentOrder rows exist'],
        ['MRR / ARR', '0 / 0', 'VERIFIED', 'Revenue-multiple valuation base is nil'],
        ['Active paid subscriptions', '3 pro + 1 elite', 'VERIFIED (fixture)', 'Created by QA scripts, not checkout'],
        ['Leads in DB', '88 (29 with website)', 'VERIFIED', '87 in "discovered" stage, 1 analyzed'],
        ['Outreach messages / emails sent', '0 / 0', 'VERIFIED', 'Core loop never exercised at scale'],
        ['Deals / pipeline value', '0 / 0', 'VERIFIED', 'No sales execution history'],
        ['Credit ledger rows', '0', 'VERIFIED', 'Credit system never used commercially'],
        ['API keys', '2', 'VERIFIED', 'Developer-access surface present'],
        ['Workflow definitions / executions', '1 / 2', 'VERIFIED', 'Includes this session\'s tests'],
        ['Churn, retention, CAC, LTV', '-', 'UNKNOWN', 'No cohort history to compute from'],
        ['AI/API cost and infra cost', '-', 'UNKNOWN', 'No cost records exported by the platform'],
    ],
    [0.30, 0.16, 0.16, 0.38])
P(Paragraph(
    'Interpretation: these numbers describe a product with real usage by its builder and effectively no external '
    'adoption. That does not make the asset worthless - it makes it an asset sale rather than a business sale, and '
    'it means any buyer thesis must rest on the technology and the buyer\'s own distribution, not on acquired '
    'customers or revenue. Customer concentration is total: one hundred percent of meaningful activity traces to '
    'the founder\'s accounts.', body))

# ═══ 5. TECHNOLOGY ASSESSMENT ══════════════════════════════════
section(story, 5, 'Technology Assessment')
P(Paragraph(
    'Engineering surface: 1,051 TypeScript/TSX files and roughly 336,000 lines of source, 496 API route files, 231 '
    'React components (181 dashboard plus 50 UI primitives), 104 Prisma models, 172 library modules including a '
    'dedicated AI module layer, and 145 markdown documentation files. A large share of the component and route count '
    'is scaffolded breadth rather than depth - a buyer should value the working cores (auth, discovery, enrichment, '
    'analysis, credits, workflows, audit), not the raw line count.', body))
add_table(story,
    'Table 3 - Major subsystems and engineering replacement perspective (ESTIMATE where noted).',
    ['Subsystem', 'Depth assessment', 'Rebuild effort (ESTIMATE)'],
    [
        ['Auth & account security', 'Deep: three login paths, sessions, MFA scaffold, rate limits, audit trail', '4-6 engineer-weeks'],
        ['Lead discovery engine', 'Solid: source fan-out, dedup, scraping metrics, website discovery + verification', '6-8 engineer-weeks'],
        ['AI analysis & research', 'Moderate-deep: provider failover, prompt manager, evidence guardrails, cost metering', '4-6 engineer-weeks'],
        ['Workflow engine', 'Moderate: definitions, executions, triggers, templates, DLQ, credits integration', '5-7 engineer-weeks'],
        ['Outreach & messaging', 'Broad but thin: many channels scaffolded, none exercised in production', '4-6 engineer-weeks'],
        ['Billing & entitlements', 'Partial: models + middleware present, no live gateway keys, zero transactions', '3-5 engineer-weeks'],
        ['Dashboard UI', 'Very broad, uneven: 181 components, some duplicated or orphaned scaffolding', '8-12 engineer-weeks'],
        ['API surface', 'Very broad: 496 route files with inconsistent middleware adoption', 'audit + 6-10 engineer-weeks'],
    ],
    [0.24, 0.46, 0.30])
P(Paragraph(
    'At Indian market rates a like-for-like rebuild of the verified cores plausibly costs USD 60,000-180,000 in '
    'engineer time (ESTIMATE); at US senior rates the same work is USD 250,000-600,000 (ESTIMATE). Replacement cost '
    'is a supporting perspective only - a no-revenue codebase does not sell at replacement cost, and sophisticated '
    'buyers know it. Security posture after this session\'s fixes is meaningfully better than before (strict lead '
    'resolution, evidence guardrails), but the codebase still requires the full isolation audit before any buyer '
    'pentest. Scalability is the clearest technical ceiling: SQLite plus in-process background jobs will not survive '
    'a multi-tenant production launch without a PostgreSQL migration and a queueing layer (VERIFIED gap).', body))

# ═══ 6. STRATEGIC VALUE ════════════════════════════════════════
section(story, 6, 'Strategic Value')
P(Paragraph(
    'The proprietary-feeling assets are: the website discovery-and-verification engine (candidate extraction, '
    'multi-signal company-match verification with confidence levels and evidence capture - genuinely uncommon in '
    'micro-SaaS), the credit-metered AI workflow architecture, the multi-source discovery fan-out, and the '
    'evidence-guardrail pattern that deterministically strips unsupported AI conclusions. These are reusable '
    'components a strategic buyer could embed in an existing product rather than rebuild.', body))
P(Paragraph(
    'Plausible strategic buyer profiles (capability match, not a claim that any specific buyer will purchase): '
    'sales-automation and lead-generation vendors wanting an AI research layer; marketing agencies wanting a '
    'white-label prospecting engine; CRM platforms wanting enrichment workflows; Indian SaaS portfolio buyers '
    'wanting a ready AI team-lead skeleton. For such buyers the value is time-to-capability: skipping three to six '
    'months of build. No legal/IP verification has been performed; ownership, licenses of third-party dependencies, '
    'and prompt/data provenance all require counsel review before any sale (flagged, not assessed).', body))

# ═══ 7. CURRENT MARKET BENCHMARKS ═════════════════════════════
section(story, 7, 'Current Market Benchmarks')
P(Paragraph(
    'Benchmarks below were retrieved from current public sources in September 2026 and are market data, not '
    'AcquisitionOS-specific evidence.', body))
add_table(story,
    'Table 4 - 2026 SaaS acquisition benchmarks (MARKET BENCHMARK).',
    ['Source / dataset', 'Benchmark'],
    [
        ['FE International, 2026, sub-USD 1M ARR SaaS', '2x-3x ARR (top quartile higher)'],
        ['Acquire.com biannual multiples report', '~5.5x ARR average by end-2025 (down from ~7x)'],
        ['Flippa micro-SaaS data, 2026', 'Sub-USD 1M ARR sells ~2.85x annual profit; top quartile ~6.13x'],
        ['Private SaaS ranges, 2026 commentary', '4x-9x ARR for healthy growth; public index fell to ~3.2x mid-2026'],
        ['Software Equity Group deal volume', '2,698 SaaS M&A transactions in 2025, +28% YoY'],
    ],
    [0.44, 0.56])
P(Paragraph(
    'Every one of these multiples multiplies revenue or profit. AcquisitionOS has none, so the benchmark table '
    'bounds the revenue path (Scenario C yields zero today) and pushes the valuation exercise to asset-value '
    'reasoning: what does a working, broad, security-hardened-but-not-audited AI SaaS codebase with near-zero '
    'traction actually trade for? Marketplace observation says low four figures to low five figures for typical '
    'no-revenue micro-SaaS, with outliers above that when the buyer has an immediate strategic use (ESTIMATE '
    'anchored on the benchmarks above).', body))

# ═══ 8. VALUATION SCENARIOS ════════════════════════════════════
section(story, 8, 'Valuation Scenarios')
P(Paragraph(
    'Scenario A - Technology/asset sale. The buyer acquires source code, architecture, prompts, workflows, and '
    'documentation, with no meaningful recurring revenue. Anchored to no-traction micro-SaaS marketplace outcomes '
    'and discounted replacement cost, a realistic range is USD 10,000-60,000, with disciplined negotiation and a '
    'clean audit package pushing toward the upper end (CALCULATED ESTIMATE).', body))
P(Paragraph(
    'Scenario B - Product acquisition (working SaaS with users). This scenario collapses toward Scenario A because '
    'the verified user base is three to four real accounts and the paying base is zero. A buyer who insists on '
    'valuing "users" here would be valuing the founder\'s own test accounts (VERIFIED data; therefore Scenario B '
    'range equals Scenario A).', body))
P(Paragraph(
    'Scenario C - Revenue-generating SaaS. ARR is verifiably zero, so any revenue multiple applied today yields '
    'zero; this scenario becomes relevant only after real revenue exists. Illustratively (and only illustratively): '
    'at the FE International 2x-3x sub-USD 1M band, every USD 10,000 of verified ARR would add roughly USD 20,000-'
    '30,000 of enterprise value (BENCHMARK arithmetic, not a forecast).', body))
P(Paragraph(
    'Scenario D - Strategic acquisition. A premium is possible only where the buyer can immediately attach the '
    'product to an existing customer base and recover their integration cost within months. Conditions required: '
    'the buyer already sells to the same ICP; the codebase passes their security review (pending full audit); and '
    'at least one or two working external pilots de-risk the "does anyone want this" question. None of those '
    'conditions is met today, so the strategic range is conditional, not current (ASSUMPTION-based scenario).', body))

# ═══ 9-11. RANGES ══════════════════════════════════════════════
section(story, 9, 'Conservative Range')
P(Paragraph(
    'A fast, low-risk sale - priced for certainty, sold quickly, likely as-is with limited support - plausibly '
    'clears USD 10,000-25,000 (INR 8.4-21 lakh at the stated FX assumption). This is the realistic floor zone for '
    'a serious, arms-length buyer of the complete asset (code, docs, DB, and handover), and it assumes the '
    'security-audit and documentation gaps disclosed honestly during diligence (CALCULATED ESTIMATE).', body))
section(story, 10, 'Base Range')
P(Paragraph(
    'A reasonably marketed sale - proper deal packaging, a data room, two to three months of exposure to micro-SaaS '
    'and agency-tool buyers, and a founder available for a transition period - supports roughly USD 25,000-75,000 '
    '(INR 21-63 lakh). The upper end requires the pre-sale fixes in Section 17 to be completed and evidenced, plus '
    'at least one credible external pilot or a demonstrable waitlist to counter the zero-traction objection '
    '(CALCULATED ESTIMATE).', body))
section(story, 11, 'Strategic Range')
P(Paragraph(
    'A strategically aligned buyer valuing capability and time-to-market over current financials could justify USD '
    '100,000-250,000 (INR 84 lakh-2.1 crore). This is explicitly conditional: it requires working pilots with real '
    'users, a clean application-wide security audit, PostgreSQL-grade deployment, and demonstrated integration into '
    'the buyer\'s distribution. Without those conditions the strategic range is theoretical; with them, the '
    'workflow/AI-research stack is the kind of component a larger platform might otherwise spend six figures and '
    'two quarters building (ASSUMPTION-based scenario).', body))

# chart
from PIL import Image as PILImage
def embed_image(path, max_width, max_height=280):
    im = PILImage.open(path)
    ow, oh = im.size
    ratio = min(max_width / ow, max_height / oh, 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)
story.append(Spacer(1, 14))
story.append(embed_image(CHART, A4[0] - 2 * 0.85 * inch))
story.append(Paragraph('Figure 1 - Indicative valuation ranges under the three scenarios (CALCULATED ESTIMATE).', caption))
story.append(Spacer(1, 10))

# ═══ 12. KEY ASSUMPTIONS ═══════════════════════════════════════
section(story, 12, 'Key Assumptions')
for a in [
    '<b>FX assumption:</b> 1 USD = INR 84 for all conversions; actual transaction FX will differ (ASSUMPTION).',
    '<b>Scope assumption:</b> the sale is the complete product - source, docs, current database, and handover support - not a partial asset (ASSUMPTION).',
    '<b>Data assumption:</b> the production database snapshot analyzed here is complete and unmodified; a buyer will re-run these queries (VERIFIED for this session).',
    '<b>Security assumption:</b> the cross-account isolation fixes verified today hold under a full-codebase audit; until that audit runs, residual unknowns remain (ASSUMPTION over VERIFIED fixes).',
    '<b>Market anchoring:</b> micro-SaaS asset benchmarks from FE International, Acquire.com, and Flippa 2025-2026 data approximate the buyer pool for this asset (MARKET BENCHMARK).',
    '<b>No undisclosed liabilities:</b> no external contracts, debts, or license conflicts were found in the workspace, but external accounts (Google Cloud, Gmail, search API) sit outside the codebase and were not audited (UNKNOWN).',
]:
    P(Paragraph(a, bullet))

# ═══ 13. VALUE-INCREASING FACTORS ═════════════════════════════
section(story, 13, 'Value-Increasing Factors')
for a in [
    '<b>Verified working AI cores:</b> discovery, enrichment with website verification, AI analysis with evidence guardrails, and a credit meter - all demonstrated end-to-end this session (VERIFIED).',
    '<b>Breadth of the platform:</b> 104 database models and 496 API routes give a buyer many entry points to productize without starting from scratch (VERIFIED breadth; depth uneven).',
    '<b>Real authentication stack:</b> OTP, magic link, and Google OAuth with actual email delivery proven live today, plus sessions, MFA scaffolding, rate limiting, and audit logging (VERIFIED).',
    '<b>Documentation volume:</b> 145 internal docs including handover and secrets-management notes reduce diligence friction (VERIFIED; quality varies).',
    '<b>Security trajectory:</b> the isolation fixes re-applied and verified this session show the codebase can be hardened quickly when prioritized (VERIFIED fixes; audit pending).',
    '<b>Clean licensing baseline:</b> standard open-source stack (Next.js, Prisma, Tailwind) with no obvious copyleft contamination in core code (VERIFIED at dependency-list level; formal scan pending).',
]:
    P(Paragraph(a, bullet))

# ═══ 14. VALUE-REDUCING FACTORS ═══════════════════════════════
section(story, 14, 'Value-Reducing Factors')
for a in [
    '<b>Zero revenue and near-zero users:</b> the single largest discount; every revenue-multiple framework prices this at zero (VERIFIED).',
    '<b>Founder dependency:</b> deployment knowledge lives in sandbox scripts and personal accounts (Gmail SMTP, Google Cloud, search API keys); no operational runbook exists for a third party (VERIFIED).',
    '<b>SQLite in the production path:</b> flags scalability immaturity and implies a mandatory migration before real launch (VERIFIED).',
    '<b>Thin tests:</b> 12 test files against 336k lines; a buyer must budget regression risk (VERIFIED).',
    '<b>Git history discontinuity:</b> a lineage reset destroyed prior commits, including once-shipped fixes; history will not read as a clean single narrative (VERIFIED).',
    '<b>Uneven authorization coverage:</b> this session fixed several fail-open patterns; the remaining 400-plus routes are audited only by category, not exhaustively (VERIFIED gap).',
    '<b>Scaffolding inflation:</b> a material share of components/routes is unused or duplicated, which inflates apparent size and will read as noise to technical buyers (VERIFIED).',
    '<b>Payment integrations incomplete:</b> Stripe/Razorpay code exists but has never transacted; gateway accounts are not transferable assets (VERIFIED).',
]:
    P(Paragraph(a, bullet))

# ═══ 15. BUYER DUE-DILIGENCE RISKS ════════════════════════════
section(story, 15, 'Buyer Due-Diligence Risks')
P(Paragraph(
    'A buyer performing diligence today would find the codebase organized and documented but would stumble on '
    'operational ownership and history. The checklist below states what a buyer will ask for and the current state; '
    '"missing" items are the negotiation-leverage losses, not necessarily deal-breakers.', body))
add_table(story,
    'Table 5 - Due-diligence readiness checklist.',
    ['Item', 'Current state', 'Buyer concern level'],
    [
        ['Source code + git history', 'Present, but lineage discontinuity', 'Medium'],
        ['Architecture documentation', '145 docs, uneven quality', 'Low'],
        ['Deployment runbook', 'Sandbox-specific scripts only', 'High'],
        ['Secrets management', 'env vault script; secrets in personal accounts', 'High'],
        ['Database migrations', 'Started this session (2 historical + 1 new)', 'Medium'],
        ['Automated tests / CI', '12 test files; no CI', 'High'],
        ['Monitoring / logging / backups', 'In-app scaffolding; no external ops', 'High'],
        ['Security audit', 'Category-level; full audit pending', 'High'],
        ['Payment system', 'Code present, never transacted', 'Medium'],
        ['Third-party API ownership', 'Gmail/Google Cloud/search keys personal', 'Medium'],
        ['Legal/IP documents', 'None in workspace', 'High'],
        ['Customer data & privacy posture', 'Almost none held; GDPR pages scaffolded', 'Low'],
    ],
    [0.34, 0.42, 0.24], align_map={2: 'C'})

# ═══ 16. ACQUISITION PACKAGE CHECKLIST ════════════════════════
section(story, 16, 'Acquisition Package Checklist')
P(Paragraph(
    'The complete handover package a buyer should receive, with current availability: product walkthrough and '
    'feature map (docs exist; needs curation); full source repository with corrected history notes (ready); '
    'environment template with every variable documented minus secret values (partially done via the vault script); '
    'cloud and third-party account transfers - Google Cloud OAuth client, Gmail app password or a proper transactional '
    'email account, Google Custom Search key, z-ai SDK account (owner action required); database with a documented '
    'schema and the migration discipline started this session (ready); payment gateway accounts or fresh registrations '
    '(Stripe/Razorpay - none exist yet); domain and brand assets (owner inventory required); analytics exports '
    '(nothing meaningful to hand over); legal/IP assignment documents (to be drafted by counsel); and a two-to-four '
    'week founder transition window for deployment knowledge transfer (recommended, and priced into the base range).', body))

# ═══ 17. WHAT MUST BE FIXED BEFORE SELLING ════════════════════
section(story, 17, 'What Must Be Fixed Before Selling')
add_table(story,
    'Table 6 - Pre-sale priorities ordered by valuation impact (ESTIMATE for impact).',
    ['Priority', 'Action', 'Why it moves value'],
    [
        ['P0', 'Complete the application-wide authorization audit (all resource types, all 496 routes)', 'One more fail-open leak discovered by a buyer re-prices everything'],
        ['P0', 'Migrate SQLite to PostgreSQL; add a real deployment runbook', 'Removes the "prototype data layer" objection'],
        ['P1', 'Stand up CI with a smoke suite over the verified cores', 'Converts "336k lines, 12 tests" fear into evidence'],
        ['P1', 'Move email/search/oauth to owned accounts; write the secrets runbook', 'Removes founder-dependency from the critical path'],
        ['P1', 'Get 2-3 external pilots (even free) with usage data', 'The cheapest possible answer to zero traction'],
        ['P2', 'Prune dead scaffolding; document the true core surface', 'Diligence cleanliness; shrinks the perceived-audit surface'],
        ['P2', 'Wire one payment gateway end-to-end with a real transaction', 'Turns billing from "code exists" to "pipeline works"'],
    ],
    [0.12, 0.44, 0.44], align_map={0: 'C'})

# ═══ 18. WHAT ADDITIONAL DATA IS REQUIRED ════════════════════
section(story, 18, 'What Additional Data Is Required')
for a in [
    'Cost records: LLM/API spend per analysis and infra cost per month - required to argue unit economics (currently UNKNOWN).',
    'Cohort data: any signup/activation/retention history once real users exist; today there is none to analyze (UNKNOWN).',
    'Conversion evidence: discovery-to-analysis-to-outreach funnel counts from real campaigns rather than QA fixtures (UNKNOWN).',
    'Competitive pricing evidence: what comparable AI prospecting tools charge, to justify the credit price list (UNKNOWN).',
    'Legal inventory: IP assignments, domain ownership, third-party account ownership, and any contractual constraints (UNKNOWN).',
    'External security report: an independent audit or pentest report would materially de-risk the buyer\'s own review (not yet performed).',
]:
    P(Paragraph(a, bullet))

# ═══ 19. FINAL CURRENT VALUATION RANGE ═══════════════════════
section(story, 19, 'Final Current Valuation Range')
P(Paragraph(
    'Direct answer to "what could AcquisitionOS realistically sell for today": <b>Conservative USD 10,000-25,000 '
    '(INR 8.4-21 lakh); Base USD 25,000-75,000 (INR 21-63 lakh); Strategic USD 100,000-250,000 (INR 84 lakh-2.1 '
    'crore, conditional)</b>. The conservative and base ranges price the technology and the option it represents; '
    'the strategic range prices what the platform could become inside an existing distribution channel, and it '
    'requires conditions - pilots, audit, infrastructure - that do not currently hold.', body))
P(Paragraph(
    'These are enterprise-value framings for a 100 percent asset sale; asking price, equity value, cash at closing, '
    'earnouts, and seller financing are deal-structure variables a broker or counsel would layer on top. In the '
    'current state, an earnout tied to post-acquisition activation is the most likely structure a buyer would '
    'propose, precisely because the verified traction base is so thin (CALCULATED ESTIMATE grounded in the '
    'benchmarks of Section 7).', body))

# ═══ 20. POTENTIAL VALUATION AFTER IMPROVEMENTS ══════════════
section(story, 20, 'Potential Valuation After Specific Improvements')
P(Paragraph(
    'The table below shows how specific, verifiable changes would move the value range. Valuation-impact figures '
    'are directional estimates anchored to the Section 7 benchmarks - not promises - and only become "real" when '
    'the underlying metric is real.', body))
add_table(story,
    'Table 7 - Improvement-to-valuation map (ESTIMATE).',
    ['Metric / improvement', 'Current state', 'Target', 'Potential valuation impact'],
    [
        ['Verified MRR', 'USD 0 (VERIFIED)', 'USD 1-2k MRR from 10-20 paying users', 'Moves valuation from asset-base (USD 25-75k) to revenue-base (2x-3x ARR = USD 24-72k, overlapping but bankable)'],
        ['Real activated users', '3-4 accounts (VERIFIED)', '25-50 with weekly activity', 'Unlocks Scenario B credibility; +30-60% on base range'],
        ['Security audit', 'Pending (VERIFIED gap)', 'Independent pass + fixes', 'Removes the largest diligence haircut; +10-25%'],
        ['Data layer', 'SQLite (VERIFIED)', 'PostgreSQL + runbook + backups', 'Removes prototype objection; +10-20%'],
        ['Pilot case studies', '0 (VERIFIED)', '2-3 documented outcomes', 'Supports strategic-range conversations'],
        ['Founder dependency', 'High (VERIFIED)', 'Runbook + 2-4 week transition', 'Reduces execution risk discount'],
    ],
    [0.20, 0.18, 0.24, 0.38])
P(Paragraph(
    'Bottom line: as it stands today the product is a technically rich, commercially unproven asset whose honest '
    'base value sits in the tens of thousands of dollars, not hundreds. The fastest genuine value creators are '
    'real revenue and an independent security pass - both achievable, neither fudgeable, and both exactly what a '
    'serious buyer will check first. This report deliberately offers no sale recommendation; it documents what the '
    'evidence supports.', body))

# ── Build body PDF ──────────────────────────────────────────────
BODY_PDF = f'{OUT_DIR}/_valuation_body.pdf'
doc = TocDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=0.85 * inch, rightMargin=0.85 * inch,
    topMargin=0.9 * inch, bottomMargin=0.8 * inch,
    title=DOC_TITLE, author='Z.ai', creator='Z.ai',
    subject='Acquisition readiness and valuation analysis of AcquisitionOS',
)
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print('BODY OK:', BODY_PDF)

# ── Cover: Template 07 Crystal Blue ─────────────────────────────
COVER_HTML = f'{OUT_DIR}/_valuation_cover.html'
COVER_PDF = f'{OUT_DIR}/_valuation_cover.pdf'
cover = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;700;900&display=swap" rel="stylesheet">
  <style>
    @page { size: 794px 1123px; margin: 0; }
    :root {
      --c-bg: #0a1628; --c-accent: #4da8da; --c-text: #e8f0f8;
      --c-muted: #7a9bb8; --c-glow: #2d7ab3;
    }
    html, body { margin: 0; padding: 0; width: 794px; height: 1123px;
      background: var(--c-bg); color: var(--c-text);
      font-family: 'Inter', sans-serif; }
    @media screen {
      html { height: auto; display: flex; justify-content: center; min-height: 100vh; background: var(--c-bg); }
      body { transform-origin: top center; scale: min(1, calc(100vw / 794), calc(100vh / 1123)); margin: 0 auto; box-shadow: 0 0 60px rgba(0,0,0,0.4); }
    }
    .cover { width: 794px; height: 1123px; position: relative; box-sizing: border-box; }
    .bg-layer { position: absolute; inset: 0; overflow: hidden; z-index: 1; }
    .glow-a { position: absolute; left: 40px; top: 60px; width: 420px; height: 420px;
      background: radial-gradient(circle, rgba(45,122,179,0.10) 0%, rgba(45,122,179,0) 70%); }
    .glow-b { position: absolute; right: 60px; bottom: 90px; width: 480px; height: 480px;
      background: radial-gradient(circle, rgba(45,122,179,0.08) 0%, rgba(45,122,179,0) 70%); }
    .frame { position: absolute; top: 80px; bottom: 80px; left: 60px; right: 60px;
      border: 2px solid var(--c-accent); z-index: 2; }
    .content { position: absolute; inset: 0; z-index: 3; }
    .kicker { position: absolute; left: 90px; top: 135px; font-size: 11pt; font-weight: 300;
      color: var(--c-accent); letter-spacing: 5px; text-transform: uppercase; }
    .title { position: absolute; left: 90px; top: 236px; font-size: 50pt; font-weight: 900;
      line-height: 1.15; font-family: 'Playfair Display', serif; color: var(--c-text);
      max-width: 600px; text-shadow: 0 0 24px rgba(45,122,179,0.35); }
    .summary { position: absolute; left: 90px; top: 505px; font-size: 15pt; line-height: 1.7;
      color: var(--c-muted); max-width: 520px; }
    .org { position: absolute; left: 90px; top: 719px; font-size: 18pt; color: var(--c-text); font-weight: 500; }
    .meta { position: absolute; left: 90px; top: 775px; font-size: 11pt; color: var(--c-muted); line-height: 1.7; }
    .date { position: absolute; left: 90px; bottom: 100px; font-size: 10pt; color: var(--c-muted); letter-spacing: 3px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="cover">
    <div class="bg-layer"><div class="glow-a"></div><div class="glow-b"></div></div>
    <div class="frame"></div>
    <div class="content">
      <div class="kicker">Acquisition Readiness & Valuation Analysis</div>
      <div class="title">Acqui­sitionOS</div>
      <div class="summary">An evidence-based internal assessment of the entire product: verified
        business metrics extracted from the production database, technology depth, market
        benchmarks, and honest valuation ranges under conservative, base, and strategic
        acquisition scenarios.</div>
      <div class="org">Internal Analysis - Prepared for the Founder</div>
      <div class="meta">Based on direct codebase inspection and production data<br>Scenario ranges labeled Verified / Benchmark / Estimate / Assumption</div>
      <div class="date">September 2026</div>
    </div>
  </div>
</body>
</html>
"""
with open(COVER_HTML, 'w') as f:
    f.write(cover)
print('COVER HTML OK:', COVER_HTML)

subprocess.run(['node', f'{SKILL}/scripts/html2poster.js', COVER_HTML,
                '--output', COVER_PDF, '--width', '794px'], check=True)
print('COVER PDF OK:', COVER_PDF)

# ── Merge cover + body ──────────────────────────────────────────
from pypdf import PdfReader, PdfWriter
A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

FINAL = f'{OUT_DIR}/AcquisitionOS-Acquisition-Valuation-Analysis.pdf'
writer = PdfWriter()
writer.add_page(normalize(PdfReader(COVER_PDF).pages[0]))
for pg in PdfReader(BODY_PDF).pages:
    writer.add_page(normalize(pg))
writer.add_metadata({'/Title': DOC_TITLE, '/Author': 'Z.ai', '/Creator': 'Z.ai',
                     '/Subject': 'Acquisition readiness and valuation analysis of AcquisitionOS'})
with open(FINAL, 'wb') as f:
    writer.write(f)
print('FINAL OK:', FINAL, os.path.getsize(FINAL), 'bytes')
