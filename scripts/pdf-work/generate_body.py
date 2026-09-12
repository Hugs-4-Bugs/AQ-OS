#!/usr/bin/env python3
# AcquisitionOS Product Overview Dossier - ReportLab body generator
# Route: Report brief | Cover: Template 07 Crystal Blue (rendered separately, merged via pypdf)
import os, sys, hashlib

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, CondPageBreak, KeepTogether, Image, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ------------------------------------------------------------------
# Fonts (allowed set only)
# ------------------------------------------------------------------
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

from pdf import install_font_fallback
install_font_fallback()

# ------------------------------------------------------------------
# Template 07 Crystal Blue - fixed body palette (typesetting/cover.md)
# ------------------------------------------------------------------
PAGE_BG      = colors.HexColor('#f5f8fc')   # XL tier
SECTION_BG   = colors.HexColor('#edf2f9')   # XL tier
CARD_BG      = colors.HexColor('#e4ecf5')   # L tier
TABLE_STRIPE = colors.HexColor('#eef3fa')   # L tier
HEADER_FILL  = colors.HexColor('#1a4a7a')   # M tier
BORDER       = colors.HexColor('#c0d0e2')   # S tier
ACCENT       = colors.HexColor('#2d7ab3')   # XS tier
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ------------------------------------------------------------------
# Geometry
# ------------------------------------------------------------------
MARGIN = 58
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25

# ------------------------------------------------------------------
# Character safety: this document must contain NO double dashes.
# Scan every content string for em dash, en dash and double hyphen.
# ------------------------------------------------------------------
FORBIDDEN = ['\u2014', '\u2013', '--']

def check_content(obj):
    if isinstance(obj, str):
        for f in FORBIDDEN:
            if f in obj:
                raise SystemExit(f'FORBIDDEN CHARACTER "{f}" found in content string: {obj[:80]}')
    elif isinstance(obj, (list, tuple)):
        for x in obj:
            check_content(x)
    elif isinstance(obj, dict):
        for v in obj.values():
            check_content(v)

# ------------------------------------------------------------------
# Styles
# ------------------------------------------------------------------
S = {}
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=17,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
                           spaceBefore=0, spaceAfter=10)
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif', fontSize=19, leading=24,
                         alignment=TA_LEFT, textColor=HEADER_FILL,
                         spaceBefore=16, spaceAfter=4)
S['intro'] = ParagraphStyle('Intro', parent=S['body'], fontName='FreeSerif-Italic',
                            textColor=TEXT_MUTED, fontSize=10.5)
S['toc_title'] = ParagraphStyle('TocTitle', fontName='FreeSerif', fontSize=19, leading=24,
                                textColor=HEADER_FILL, spaceAfter=14)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5, leading=12.5,
                         textColor=colors.white, alignment=TA_CENTER)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9.2, leading=12.5,
                         textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S['td_b'] = ParagraphStyle('TDB', parent=S['td'], fontName='FreeSerif')
S['td_c'] = ParagraphStyle('TDC', parent=S['td'], alignment=TA_CENTER)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif-Italic', fontSize=8.5,
                              leading=11, textColor=TEXT_MUTED, alignment=TA_CENTER,
                              spaceBefore=3, spaceAfter=6)
S['stat_big'] = ParagraphStyle('StatBig', fontName='FreeSerif', fontSize=15, leading=18,
                               textColor=ACCENT, alignment=TA_CENTER)
S['stat_label'] = ParagraphStyle('StatLabel', fontName='FreeSerif', fontSize=8, leading=10.5,
                                 textColor=TEXT_MUTED, alignment=TA_CENTER)
S['note'] = ParagraphStyle('Note', parent=S['body'], leftIndent=22, firstLineIndent=-22)

# ------------------------------------------------------------------
# TOC document template
# ------------------------------------------------------------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            # Body-relative page number: TOC occupies internal page 1 (shown as roman i)
            self.notify('TOCEntry', (level, text, self.page - 1, key))

def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

MAX_KEEP_HEIGHT = A4[1] * 0.4

def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, A4[1])
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def h1_block(number, title, first_flowables):
    """H1 heading + accent rule + first content, orphan protected."""
    text = f'{number}. {title}'
    head = add_heading(text, S['h1'], level=0)
    rule = HRFlowable(width='100%', thickness=1.2, color=ACCENT,
                      spaceBefore=0, spaceAfter=10)
    out = [CondPageBreak(H1_ORPHAN)]
    out += safe_keep_together([head, rule] + first_flowables)
    return out

def body(text):
    return Paragraph(text, S['body'])

def make_table(rows, ratios, header=True, first_col_bold=True):
    """rows: list of list of (text, style_key). ratios sum to 1.0."""
    col_widths = [r * AVAIL_W for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5, 'table exceeds available width'
    data = []
    for ri, row in enumerate(rows):
        line = []
        for ci, cell in enumerate(row):
            txt, sk = cell
            st = S[sk]
            if ri == 0 and header:
                st = S['th']
                txt = f'<b>{txt}</b>'
            elif ci == 0 and first_col_bold and sk == 'td':
                st = S['td_b']
                txt = f'<b>{txt}</b>'
            line.append(Paragraph(txt, st))
        data.append(line)
    t = Table(data, colWidths=col_widths, hAlign='CENTER', repeatRows=1 if header else 0)
    style = [
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    if header:
        style.append(('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR))
        for ri in range(1, len(rows)):
            bg = TABLE_ROW_ODD if ri % 2 == 1 else TABLE_ROW_EVEN
            style.append(('BACKGROUND', (0, ri), (-1, ri), bg))
    t.setStyle(TableStyle(style))
    return t

def stat_row(stats):
    """stats: list of (big, label). Rendered as one row of callout cells."""
    n = len(stats)
    w = AVAIL_W / n
    cells = []
    for big, label in stats:
        inner = Table(
            [[Paragraph(f'<b>{big}</b>', S['stat_big'])],
             [Paragraph(label, S['stat_label'])]],
            colWidths=[w - 10])
        inner.setStyle(TableStyle([
            ('TOPPADDING', (0, 0), (-1, 0), 7),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 7),
            ('TOPPADDING', (0, -1), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 1),
            ('LEFTPADDING', (0, 0), (-1, -1), 2),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ]))
        cells.append(inner)
    t = Table([cells], colWidths=[w] * n, hAlign='CENTER')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 1, ACCENT),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t

def embed_image(path, max_width, max_height):
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)

# ------------------------------------------------------------------
# Page decoration: background + header + footer
# ------------------------------------------------------------------
DOC_TITLE = 'AcquisitionOS · Product Overview'

def decorate(canvas, doc):
    canvas.saveState()
    # page background (Template 07 XL tier)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # header
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 34, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 40, PAGE_W - MARGIN, 40)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 28, 'Product Engineering Division')
    if doc.page == 1:
        num = 'i'                      # front matter: roman
    else:
        num = str(doc.page - 1)        # body resets to arabic 1
    canvas.drawRightString(PAGE_W - MARGIN, 28, num)
    canvas.restoreState()

# ------------------------------------------------------------------
# Content
# ------------------------------------------------------------------
story = []

# ---- TOC (internal page 1, roman i) ----
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=11, leading=18,
                   leftIndent=16, firstLineIndent=-16, textColor=TEXT_PRIMARY),
]
story.append(Paragraph('<b>Table of Contents</b>', S['toc_title']))
story.append(HRFlowable(width='100%', thickness=1.2, color=ACCENT, spaceBefore=0, spaceAfter=14))
story.append(toc)
story.append(PageBreak())

# ================= 1. MISSION =================
story += h1_block(1, 'Mission', [
    body('AcquisitionOS is an AI market intelligence platform that automates the full '
         'client acquisition lifecycle: finding businesses, qualifying them, contacting '
         'them and closing the deal. It is built for agencies, consultancies and sales '
         'teams that need to run acquisition at scale without growing headcount at the '
         'same rate. The product consolidates what used to be a patchwork of maps, '
         'directories, spreadsheets and messaging apps into one command center.'),
])
story.append(body(
    'Our mission is simple to state and hard to do: make client acquisition a '
    'measurable, repeatable engineering process instead of a personality driven art. '
    'Every business that can be discovered should be discoverable inside the platform. '
    'Every lead should arrive with context and a score a salesperson can act on the '
    'same day. Every conversation should be logged, every follow up scheduled and '
    'every rupee of pipeline visible to the whole team, not just to the person who '
    'opened the account.'))
story.append(body(
    'The platform is in active development. The core loop of discovery, scoring, '
    'outreach and pipeline management is operational in the current build, and the '
    'remaining work is hardening, the move to PostgreSQL and launch polish. We state '
    'this openly in every client conversation. This document should be read as an '
    'engineering dossier on a working system under construction, not as marketing for '
    'a finished box.'))
story.append(Spacer(1, 6))
story.append(stat_row([
    ('IN DEVELOPMENT', 'Current project status'),
    ('1,032', 'TypeScript source files'),
    ('326,000+', 'Lines of code in the repo'),
    ('53+', 'Database tables designed'),
]))
story.append(Spacer(1, 14))

# ================= 2. THE PROBLEM =================
story += h1_block(2, 'The Problem · Before', [
    body('Client acquisition, as most service businesses run it today, is manual at '
         'every step. The problems below describe the operating state we built this '
         'platform to escape, and we have lived inside each of them ourselves.'),
])
story.append(body(
    '<b>Finding businesses to pitch was slow, manual work.</b> Someone scanned Google '
    'Maps and trade directories city by city, copied names into a spreadsheet, opened '
    'each website in a tab and formed an opinion by hand. Covering twenty two niches '
    'across six countries meant the work never finished; it only paused. The moment '
    'research stopped, the pipeline stopped with it.'))
story.append(body(
    '<b>Deciding who deserved attention was guesswork.</b> Nothing in a spreadsheet '
    'row says whether a business is about to spend money. Urgency lived in the head '
    'of whoever did the research, and it left the company when that person did. Two '
    'salespeople looking at the same lead would disagree completely about its value, '
    'and there was no shared evidence to settle the argument.'))
story.append(body(
    '<b>Outreach was generic because personalization takes time nobody had.</b> First '
    'messages went out in bulk with a name swapped in. Replies landed in personal '
    'inboxes that no manager could see. Follow ups lived in memory and sticky notes, '
    'and a deal that went quiet simply stayed quiet. Nothing reminded anyone to return '
    'to a warm conversation that had cooled.'))
story.append(body(
    '<b>Management ran on opinions.</b> There was no funnel to inspect, no conversion '
    'rate between stages, no record of who contacted whom and when. Weekly reviews '
    'reconstructed the past from recollection. The result was a familiar pattern: '
    'high effort, low visibility and quality that depended on who was working rather '
    'than on what the process enforced.'))

# ================= 3. WHAT WE BUILT =================
story += h1_block(3, 'What We Built', [
    body('AcquisitionOS is one platform with five working surfaces. Each surface maps '
         'to a module in the repository with its own routes, data model and tests. The '
         'table below is the honest map of the system, including the state of each '
         'part in the current build.'),
])
story.append(Spacer(1, 8))
story.append(make_table([
    [('Surface', 'th'), ('What it does', 'th'), ('State', 'th')],
    [('Lead Intelligence', 'td'),
     ('OSINT discovery across Google Maps, LinkedIn, Yelp and IndiaMART. Automated '
      'digital audit of every prospect website. Four composite scores with AI written '
      'explanations.', 'td'),
     ('Operational in build', 'td_c')],
    [('Engagement', 'td'),
     ('Sequence based outreach across Email, WhatsApp, LinkedIn and Instagram. Five '
      'template categories with variable interpolation and AI message generation.', 'td'),
     ('Operational in build', 'td_c')],
    [('Deal Room', 'td'),
     ('Kanban pipeline with drag and drop stages, aging alerts and velocity metrics. '
      'AI proposal generation, meetings and calendar integration.', 'td'),
     ('Operational in build', 'td_c')],
    [('Revenue', 'td'),
     ('Subscriptions, credits ledger, entitlements and payment orders running on '
      'Stripe and Razorpay with invoices and coupons.', 'td'),
     ('In hardening', 'td_c')],
    [('Control', 'td'),
     ('Teams and roles, audit trail, GDPR endpoints, workflow definitions, realtime '
      'notifications and a command palette for navigation.', 'td'),
     ('In hardening', 'td_c')],
], [0.16, 0.66, 0.18]))
story.append(Paragraph('Table 1: The five surfaces of the platform and their build state', S['caption']))
story.append(body(
    'The scale of what exists is concrete. Discovery runs across 22 business niches '
    'and 6 countries. Scoring produces 4 composite scores per lead: Reply Score, Deal '
    'Conversion Score, Urgency Score and Revenue Potential Score. Outreach reaches '
    'leads on 4 channels from 5 template categories. Underneath, the API surface '
    'spans more than 60 route groups and the schema carries more than 50 tables with '
    'their relations, indexes and migration annotations already in place.'))

# ================= 4. SYSTEM ARCHITECTURE =================
story += h1_block(4, 'System Architecture', [
    body('The system is deliberately monolithic in deployment and modular in code. '
         'One Next.js 16 application serves the React 19 front end and the REST API '
         'through more than sixty route groups, so a single deploy carries the whole '
         'product. This choice keeps early velocity high and defers the operational '
         'cost of splitting services until scale actually demands it.'),
])
story.append(body(
    'Data access goes through Prisma ORM sitting over PostgreSQL in production and '
    'SQLite in local development. Redis handles queues, caching and rate limiting. A '
    'WebSocket service pushes realtime notifications to the dashboard. AI features, '
    'scoring explanations, message generation, proposals and the sales assistant, '
    'call GLM series models through a single SDK facade, so a model change never '
    'touches business logic. Python data services run the crawler and enrichment '
    'workers that feed the intelligence layer.'))
story.append(body(
    'Security is layered rather than bolted on. Authentication supports password '
    'login, one time passwords, magic links and Google OAuth, all behind signed JWT '
    'sessions. Public endpoints are rate limited at the route level, sensitive '
    'actions append to an immutable audit trail, and role and organization checks '
    'run inside the route handlers before any data leaves the server.'))
img = embed_image('/home/z/my-project/scripts/pdf-work/architecture.png',
                  max_width=AVAIL_W, max_height=300)
story.append(Spacer(1, 8))
story += safe_keep_together([img,
    Paragraph('Figure 1: Four stage acquisition flow with platform services on the right', S['caption'])])
story.append(Spacer(1, 6))
story.append(make_table([
    [('Layer', 'th'), ('Owns', 'th')],
    [('Discovery', 'td'),
     ('Source connectors and Python crawler workers. Raw business records with '
      'location, category and contact signals.', 'td')],
    [('Intelligence', 'td'),
     ('Normalization, deduplication, digital audit and the composite scoring engine '
      'with AI explanations.', 'td')],
    [('Engagement', 'td'),
     ('Sequences, channel adapters, reply capture and classification, follow up '
      'scheduling.', 'td')],
    [('Closure', 'td'),
     ('Pipeline stages, proposals, meetings, analytics and reporting.', 'td')],
    [('Platform services', 'td'),
     ('AI models, database and ORM, Redis, authentication and RBAC, audit trail, '
      'realtime transport, billing rails.', 'td')],
], [0.2, 0.8]))
story.append(Paragraph('Table 2: Architectural layers and their responsibilities', S['caption']))

# ================= 5. DATA FLOW =================
story += h1_block(5, 'Data Flow', [
    body('A lead moves through the system in six defined steps. Each step writes its '
         'output to the database and its event to the activity timeline, so the full '
         'history of any lead can be reconstructed from records alone, without asking '
         'anyone what happened.'),
])
story.append(Spacer(1, 8))
story.append(make_table([
    [('Step', 'th'), ('Stage', 'th'), ('What happens', 'th')],
    [('1', 'td_c'), ('Capture', 'td'),
     ('Source connectors pull businesses with location, category, rating and contact '
      'signals from maps and directory sources across the target niches.', 'td')],
    [('2', 'td_c'), ('Normalize', 'td'),
     ('Records are cleaned, deduplicated and keyed so the same business is never '
      'worked twice by different people.', 'td')],
    [('3', 'td_c'), ('Enrich', 'td'),
     ('The digital audit fetches each prospect website and grades interface quality, '
      'SEO fundamentals and technology footprint. Firmographic fields are completed '
      'from source data.', 'td')],
    [('4', 'td_c'), ('Score', 'td'),
     ('The scoring engine computes four composite scores and produces an AI written '
      'explanation for each, so every number carries its reasoning.', 'td')],
    [('5', 'td_c'), ('Engage', 'td'),
     ('Scored leads enter sequences. Messages are generated per channel from audit '
      'context, scheduled and sent. Replies are captured, classified and answered '
      'with suggested follow ups.', 'td')],
    [('6', 'td_c'), ('Close', 'td'),
     ('Engaged leads advance through pipeline stages. Proposals are generated, '
      'meetings are booked through the calendar, and analytics aggregate every '
      'event into funnels and trend views.', 'td')],
], [0.07, 0.15, 0.78]))
story.append(Paragraph('Table 3: The six step lead lifecycle', S['caption']))
story.append(body(
    'Two properties matter more than any single step. First, the flow is idempotent '
    'at every stage: running a step again does not create duplicate work or duplicate '
    'messages. Second, every stage emits events rather than mutating silent state, '
    'which is what makes the dashboards, heatmaps and timelines in the analytics '
    'module a faithful record instead of a decoration.'))

# ================= 6. BEFORE -> AFTER =================
story += h1_block(6, 'Before → After', [
    body('The comparison below is qualitative by design. We will publish measured '
         'numbers after the pilot cohort completes; until then we describe direction '
         'rather than invent magnitudes. Each row maps to a module listed in section '
         'three, at the build state shown there.'),
])
story.append(Spacer(1, 8))
story.append(make_table([
    [('Dimension', 'th'), ('Before', 'th'), ('With AcquisitionOS', 'th')],
    [('Prospecting', 'td'),
     ('Manual scanning of maps and directories, niche by niche, spreadsheet by '
      'spreadsheet.', 'td'),
     ('Continuous discovery across 22 niches and 6 countries from inside the '
      'platform.', 'td')],
    [('Qualification', 'td'),
     ('Gut feel applied to a spreadsheet row.', 'td'),
     ('Four composite scores per lead with written AI reasoning.', 'td')],
    [('First contact', 'td'),
     ('Generic templates sent in bulk with a name swapped in.', 'td'),
     ('Channel aware messages generated from each prospect audit context.', 'td')],
    [('Follow ups', 'td'),
     ('Memory, sticky notes and personal inboxes.', 'td'),
     ('Scheduled reminders with overdue alerts visible to the whole team.', 'td')],
    [('Deal tracking', 'td'),
     ('Reconstructing history from email threads.', 'td'),
     ('Kanban pipeline with stage aging, velocity metrics and win and loss '
      'analysis.', 'td')],
    [('Team visibility', 'td'),
     ('Weekly verbal updates from each salesperson.', 'td'),
     ('Live funnels, score heatmaps and activity timelines.', 'td')],
], [0.16, 0.4, 0.44]))
story.append(Paragraph('Table 4: Operating state before the platform and after', S['caption']))
story.append(body(
    'None of these rows claim magic. Each one names a specific capability that '
    'exists as running code today, and the build state of that capability is stated '
    'in Table 1. That traceability, from promise to module to state, is the honest '
    'way to present a product that is still in development, and it is how we prefer '
    'to be judged.'))

# ================= 7. TECHNOLOGY STACK =================
story += h1_block(7, 'Technology Stack', [
    body('The stack was chosen for hiring reality and long term maintainability, not '
         'for novelty. Every item below is in the repository today, with the version '
         'pinned in the manifest and the integration exercised by the running build.'),
])
story.append(Spacer(1, 8))
story.append(make_table([
    [('Frontend', 'th'), ('Role', 'th')],
    [('Next.js 16 with App Router', 'td'), ('Application framework and routing', 'td')],
    [('React 19', 'td'), ('UI runtime', 'td')],
    [('TypeScript 5', 'td'), ('End to end typing across UI and API', 'td')],
    [('Tailwind CSS 4', 'td'), ('Styling system with design tokens', 'td')],
    [('shadcn and Radix UI', 'td'), ('Accessible component primitives', 'td')],
    [('Recharts', 'td'), ('Dashboards, funnels and heatmaps', 'td')],
    [('Framer Motion', 'td'), ('Interaction and transition layer', 'td')],
    [('zustand', 'td'), ('Lightweight client state', 'td')],
    [('react-hook-form with Zod', 'td'), ('Forms and schema validation at the edge', 'td')],
], [0.4, 0.6]))
story.append(Paragraph('Table 5: Frontend stack', S['caption']))
story.append(make_table([
    [('Backend and data', 'th'), ('Role', 'th')],
    [('Next.js API routes', 'td'), ('REST service surface, 60 plus route groups', 'td')],
    [('Prisma ORM 6', 'td'), ('Database access, migrations, typed client', 'td')],
    [('PostgreSQL (Supabase)', 'td'), ('Production database, 53 plus tables', 'td')],
    [('SQLite', 'td'), ('Local development database with identical schema', 'td')],
    [('Redis via ioredis', 'td'), ('Queues, caching and rate limiting', 'td')],
    [('NextAuth and JWT (jose)', 'td'), ('Sessions, refresh and signed tokens', 'td')],
    [('bcryptjs', 'td'), ('Password hashing', 'td')],
    [('Nodemailer and Resend', 'td'), ('Transactional email delivery', 'td')],
    [('WebSocket service', 'td'), ('Realtime notifications and presence', 'td')],
], [0.4, 0.6]))
story.append(Paragraph('Table 6: Backend and data stack', S['caption']))
story.append(body(
    'Python powers the data services layer. The discovery and enrichment workers are '
    'separate Python processes so heavy crawling, parsing and batch transforms never '
    'compete with the request path of the main application. They expose small '
    'internal APIs, are scheduled independently and write their results back through '
    'the same database contracts the platform uses.'))
story.append(make_table([
    [('Python data services', 'th'), ('Role', 'th')],
    [('Python 3.11', 'td'), ('Service runtime for crawler and enrichment workers', 'td')],
    [('FastAPI with Uvicorn', 'td'), ('Internal service API for worker control', 'td')],
    [('httpx', 'td'), ('Concurrent HTTP client for source fetching', 'td')],
    [('BeautifulSoup4 with lxml', 'td'), ('HTML parsing for website audits', 'td')],
    [('pandas', 'td'), ('Batch enrichment and tabular transforms', 'td')],
    [('Pydantic', 'td'), ('Configuration and payload validation', 'td')],
    [('APScheduler', 'td'), ('Crawler runs and recurring job scheduling', 'td')],
], [0.4, 0.6]))
story.append(Paragraph('Table 7: Python data services stack', S['caption']))
story.append(make_table([
    [('AI, payments and operations', 'th'), ('Role', 'th')],
    [('z-ai-web-dev-sdk (GLM series)', 'td'),
     ('Scoring explanations, message and proposal generation, sales assistant', 'td')],
    [('Stripe', 'td'), ('Global subscriptions, checkout and webhooks', 'td')],
    [('Razorpay', 'td'), ('Indian payment rails and invoices', 'td')],
    [('Vitest, Testing Library, MSW', 'td'), ('Unit, component and API mock testing', 'td')],
    [('Sentry', 'td'), ('Error tracking and release health', 'td')],
    [('Scripted security scans and backups', 'td'),
     ('Repository scanning plus backup and restore scripts', 'td')],
], [0.4, 0.6]))
story.append(Paragraph('Table 8: AI, payments and operations stack', S['caption']))

# ================= 8. DELIVERY DISCIPLINE =================
story += h1_block(8, 'Delivery Discipline', [
    body('Feature lists win meetings; delivery discipline ships products. These are '
         'the working rules the codebase follows today. They are not aspirations '
         'written for this document; each row names where the practice lives in the '
         'repository.'),
])
story.append(Spacer(1, 8))
story.append(make_table([
    [('Practice', 'th'), ('How it shows up in the repo', 'th')],
    [('Typed end to end', 'td'),
     ('TypeScript across front end and API. No untyped boundaries between modules.', 'td')],
    [('Validate at the edge', 'td'),
     ('Zod schemas guard external input before it reaches business logic.', 'td')],
    [('Migrations, not edits', 'td'),
     ('Schema changes go through Prisma tooling, with a migration safety annotation '
      'system already written into the schema for the PostgreSQL move.', 'td')],
    [('Least privilege by default', 'td'),
     ('Roles and organization scoping enforced in route handlers. Credits and '
      'entitlements are checked server side before any paid action.', 'td')],
    [('Audit what matters', 'td'),
     ('Sensitive actions append to an immutable activity and audit trail with actor, '
      'action and timestamp.', 'td')],
    [('Test what breaks', 'td'),
     ('Vitest with Testing Library and MSW covers the flows that have broken before, '
      'including auth and billing paths.', 'td')],
    [('Watch it live', 'td'),
     ('Health endpoints, structured logs and Sentry feed one operational view.', 'td')],
    [('Recover on purpose', 'td'),
     ('Backup and restore scripts exist and are exercised. Secrets persist outside '
      'the ephemeral environment with restrictive file permissions.', 'td')],
], [0.28, 0.72]))
story.append(Paragraph('Table 9: Engineering practices and where they live', S['caption']))
story.append(body(
    'The discipline is deliberately boring, and boring is the point. It is what '
    'allows a small team to carry a system of this size: the codebase currently '
    'stands at more than one thousand source files and three hundred twenty six '
    'thousand lines, and a new engineer can still find any feature, trace its data '
    'and read its tests within a single day of arrival.'))

# ================= 9. FIELD NOTES =================
story += h1_block(9, 'Field Notes · Verified', [
    body('These notes are recorded from build experience, not assembled from a deck. '
         'Each one cost the team real time before it hardened into a rule. We share '
         'them because they say more about how this product is built than any '
         'feature table can.'),
])
notes = [
    ('OAuth redirect URIs are exact strings.',
     'Google rejects a redirect_uri that differs by even one path segment. We '
     'register one canonical callback path and every initiation route resolves its '
     'redirect_uri to that exact value. Internal hostnames are rejected before any '
     'external URL is constructed, so a gateway can never leak a private address '
     'into an OAuth flow.'),
    ('Session secrets must be random and must survive restarts.',
     'A predictable signing key breaks the trust model, and a rotated key logs every '
     'active user out at once. Signing secrets are now generated randomly and '
     'persisted outside the application directory with restrictive file modes, so '
     'sessions survive redeployments without weakening security.'),
    ('Email configuration fails silently.',
     'A mailer that reports configured while every send fails is worse than one that '
     'reports unconfigured, because nobody looks for the problem. Credential '
     'resolution now skips placeholder values across every supported alias, so a '
     'test password can never masquerade as a real one.'),
    ('Gateways rewrite Host headers.',
     'Behind a TLS proxy the application sees an internal host rather than the '
     'public domain. The platform therefore derives public URLs from browser '
     'supplied origin headers, validates them against a public host rule and falls '
     'back to the canonical production domain when validation fails.'),
    ('Plan the database move inside the schema.',
     'Every field in our schema carries a migration annotation and every table sits '
     'in a dependency ordered phase list. The move from SQLite to PostgreSQL is '
     'therefore a planned operation with known backfill points, not an archaeology '
     'project discovered midway.'),
    ('Scores need explanations.',
     'A number without reasoning does not get trusted, and an untrusted score gets '
     'ignored. Each composite score ships with AI written reasoning that cites the '
     'signals behind it, which is what turned scoring from a dashboard feature into '
     'a daily working habit for the team.'),
    ('Add the boring walls early.',
     'Rate limiting, audit logging and GDPR data endpoints were built before launch '
     'features rather than after the first incident. Retrofitting walls into a '
     'moving system costs roughly three times the effort of pouring them with the '
     'foundation.'),
]
for i, (title, text) in enumerate(notes, 1):
    story.append(Paragraph(f'<b>Note {i}. {title}</b> {text}', S['note']))
    story.append(Spacer(1, 4))

# ------------------------------------------------------------------
# Build
# ------------------------------------------------------------------
BODY_PDF = '/home/z/my-project/scripts/pdf-work/body.pdf'
doc = TocDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    title='AcquisitionOS Product Overview and Engineering Dossier',
    author='Product Engineering Division',
    creator='Z.ai',
    subject='AI market intelligence and client acquisition platform: mission, architecture, stack and delivery discipline',
)
doc.multiBuild(story, onFirstPage=decorate, onLaterPages=decorate)
print('body built:', BODY_PDF)

# ------------------------------------------------------------------
# Merge cover + body into the final single PDF
# ------------------------------------------------------------------
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

FINAL = '/home/z/my-project/download/AcquisitionOS_Product_Overview.pdf'
os.makedirs(os.path.dirname(FINAL), exist_ok=True)
writer = PdfWriter()
cover_page = PdfReader('/home/z/my-project/scripts/pdf-work/cover.pdf').pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(BODY_PDF).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    '/Title': 'AcquisitionOS Product Overview and Engineering Dossier',
    '/Author': 'Product Engineering Division',
    '/Creator': 'Z.ai',
    '/Subject': 'AI market intelligence and client acquisition platform: mission, architecture, stack and delivery discipline',
})
with open(FINAL, 'wb') as f:
    writer.write(f)
print('final merged:', FINAL)
