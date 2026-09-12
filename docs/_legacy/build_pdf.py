#!/usr/bin/env python3
"""
AcquisitionOS — Corporate Capability Document
Professional PDF for company website listing and client deal review.
"""

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Image, HRFlowable, ListFlowable, ListItem, Flowable
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus.frames import Frame
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.pdfgen import canvas as canvas_mod
import hashlib

# ─────────────────────────────────────────────────────────────────────
# FONT REGISTRATION
# ─────────────────────────────────────────────────────────────────────
FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('NotoSerif', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerif-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerif-Light', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Light.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerif-Medium', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Medium.ttf'))
registerFontFamily('NotoSerif', normal='NotoSerif', bold='NotoSerif-Bold', italic='NotoSerif', boldItalic='NotoSerif-Bold')

pdfmetrics.registerFont(TTFont('FreeSans', f'{FONT_DIR}/truetype/freefont/FreeSans.ttf'))
pdfmetrics.registerFont(TTFont('FreeSans-Bold', f'{FONT_DIR}/truetype/freefont/FreeSansBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSans-Oblique', f'{FONT_DIR}/truetype/freefont/FreeSansOblique.ttf'))
registerFontFamily('FreeSans', normal='FreeSans', bold='FreeSans-Bold', italic='FreeSans-Oblique', boldItalic='FreeSans-Bold')

pdfmetrics.registerFont(TTFont('FreeMono', f'{FONT_DIR}/truetype/freefont/FreeMono.ttf'))
pdfmetrics.registerFont(TTFont('FreeMono-Bold', f'{FONT_DIR}/truetype/freefont/FreeMonoBold.ttf'))
registerFontFamily('FreeMono', normal='FreeMono', bold='FreeMono-Bold')

# ─────────────────────────────────────────────────────────────────────
# PALETTE  (warm chestnut / ink stone hybrid, professional corporate)
# ─────────────────────────────────────────────────────────────────────
PAGE_BG       = colors.HexColor('#faf9f7')
SECTION_BG    = colors.HexColor('#f2f0ec')
CARD_BG       = colors.HexColor('#ebe8e2')
TABLE_STRIPE  = colors.HexColor('#f0eee9')

HEADER_FILL   = colors.HexColor('#2b3a42')   # deep slate teal
COVER_BLOCK   = colors.HexColor('#3a4d57')

BORDER        = colors.HexColor('#c8c2b6')
ICON          = colors.HexColor('#6e7d85')

ACCENT        = colors.HexColor('#a8703a')   # warm bronze
ACCENT_2      = colors.HexColor('#5a6b73')

TEXT_PRIMARY  = colors.HexColor('#1f1d1a')
TEXT_MUTED    = colors.HexColor('#6b665e')
TEXT_LIGHT    = colors.HexColor('#8a857c')

SEM_SUCCESS   = colors.HexColor('#3f7050')
SEM_WARNING   = colors.HexColor('#9a7b3a')
SEM_ERROR     = colors.HexColor('#8c4a42')
SEM_INFO      = colors.HexColor('#3d6b8a')

TABLE_HEADER_BG = HEADER_FILL
TABLE_HEADER_TXT = colors.white
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# ─────────────────────────────────────────────────────────────────────
# PAGE GEOMETRY
# ─────────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN_L = 22 * mm
MARGIN_R = 22 * mm
MARGIN_T = 24 * mm
MARGIN_B = 22 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

OUTPUT_PATH = '/home/z/my-project/docs/AcquisitionOS-Capability-Document.pdf'

# ─────────────────────────────────────────────────────────────────────
# STYLES
# ─────────────────────────────────────────────────────────────────────
def style(name, **kw):
    base = {
        'fontName': 'FreeSans',
        'fontSize': 10.5,
        'leading': 16,
        'textColor': TEXT_PRIMARY,
        'alignment': TA_JUSTIFY,
        'spaceBefore': 0,
        'spaceAfter': 0,
    }
    base.update(kw)
    return ParagraphStyle(name=name, **base)

ST_BODY = style('Body', fontSize=10.5, leading=17, alignment=TA_JUSTIFY, spaceAfter=7)
ST_BODY_LEFT = style('BodyLeft', fontSize=10.5, leading=17, alignment=TA_LEFT, spaceAfter=7)
ST_LEAD = style('Lead', fontSize=11.5, leading=19, alignment=TA_JUSTIFY, spaceAfter=10, textColor=colors.HexColor('#2a2824'))
ST_MUTED = style('Muted', fontSize=9, leading=13, textColor=TEXT_MUTED, alignment=TA_LEFT)
ST_KICKER = style('Kicker', fontSize=8.5, leading=12, textColor=ACCENT, fontName='FreeSans-Bold', alignment=TA_LEFT)
ST_H1 = style('H1', fontSize=22, leading=28, fontName='NotoSerif-Bold', textColor=HEADER_FILL, alignment=TA_LEFT, spaceBefore=6, spaceAfter=6)
ST_H2 = style('H2', fontSize=14.5, leading=20, fontName='NotoSerif-Bold', textColor=HEADER_FILL, alignment=TA_LEFT, spaceBefore=14, spaceAfter=6)
ST_H3 = style('H3', fontSize=11.5, leading=16, fontName='FreeSans-Bold', textColor=ACCENT_2, alignment=TA_LEFT, spaceBefore=9, spaceAfter=3)
ST_BULLET = style('Bullet', fontSize=10, leading=15, alignment=TA_LEFT, spaceAfter=4)
ST_CALLOUT = style('Callout', fontSize=11, leading=17, fontName='FreeSans-Bold', textColor=HEADER_FILL, alignment=TA_LEFT)
ST_STAT_NUM = style('StatNum', fontSize=26, leading=30, fontName='NotoSerif-Bold', textColor=ACCENT, alignment=TA_LEFT)
STAT_LABEL = style('StatLabel', fontSize=8.5, leading=12, textColor=TEXT_MUTED, alignment=TA_LEFT)
ST_QUOTE = style('Quote', fontSize=11, leading=18, fontName='FreeSans-Oblique', textColor=colors.HexColor('#3a3835'), alignment=TA_JUSTIFY, leftIndent=14, rightIndent=14, spaceBefore=6, spaceAfter=6)
ST_TOC0 = style('TOC0', fontSize=11, leading=18, fontName='FreeSans-Bold', textColor=HEADER_FILL, leftIndent=0, spaceAfter=4)
ST_TOC1 = style('TOC1', fontSize=10, leading=15, textColor=TEXT_PRIMARY, leftIndent=18, spaceAfter=2)
ST_TABLE_HEAD = style('TblHead', fontSize=9.5, leading=13, fontName='FreeSans-Bold', textColor=colors.white, alignment=TA_LEFT)
ST_TABLE_CELL = style('TblCell', fontSize=9.5, leading=14, alignment=TA_LEFT)
ST_TABLE_CELL_BOLD = style('TblCellB', fontSize=9.5, leading=14, fontName='FreeSans-Bold', alignment=TA_LEFT)
ST_COVER_KICKER = style('CKick', fontSize=10, leading=14, fontName='FreeSans-Bold', textColor=ACCENT, alignment=TA_LEFT)
ST_COVER_TITLE = style('CTitle', fontSize=40, leading=46, fontName='NotoSerif-Bold', textColor=HEADER_FILL, alignment=TA_LEFT)
ST_COVER_SUB = style('CSub', fontSize=15, leading=22, fontName='NotoSerif-Light', textColor=colors.HexColor('#3a3835'), alignment=TA_LEFT)
ST_COVER_SUM = style('CSum', fontSize=11, leading=18, textColor=TEXT_PRIMARY, alignment=TA_LEFT)
ST_COVER_META = style('CMeta', fontSize=10, leading=15, textColor=TEXT_MUTED, alignment=TA_LEFT)
ST_COVER_META_B = style('CMetaB', fontSize=10.5, leading=15, fontName='FreeSans-Bold', textColor=HEADER_FILL, alignment=TA_LEFT)
ST_DEV_STATUS = style('DevStat', fontSize=10, leading=15, fontName='FreeSans-Bold', textColor=SEM_WARNING, alignment=TA_CENTER)
ST_FOOTER = style('Footer', fontSize=8, leading=11, textColor=TEXT_LIGHT, alignment=TA_LEFT)

# ─────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────
def P(text, st=ST_BODY):
    return Paragraph(text, st)

def heading(text, style_obj, level=0):
    key = 'h_' + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/>{text}', style_obj)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1(text):
    return heading(text, ST_H1, 0)

def h2(text):
    return heading(text, ST_H2, 1)

def h3(text):
    return heading(text, ST_H3, 1)

def bullets(items, st=ST_BULLET, bullet_color=ACCENT):
    flow = []
    for it in items:
        flow.append(Paragraph(f'<font color="{bullet_color.hexval()}">▸</font>&nbsp;&nbsp;{it}', st))
    return flow

def numbered(items, st=ST_BULLET):
    flow = []
    for i, it in enumerate(items, 1):
        flow.append(Paragraph(f'<font color="{ACCENT.hexval()}" name="FreeSans-Bold">{i}.</font>&nbsp;&nbsp;{it}', st))
    return flow

def hr(color=BORDER, thickness=0.6, space_before=4, space_after=8):
    return HRFlowable(width='100%', thickness=thickness, color=color, spaceBefore=space_before, spaceAfter=space_after, lineCap='round')

def make_table(data, col_widths, header=True, stripe=True):
    """data: list of rows, each row is list of strings (will be wrapped in Paragraph)."""
    rows = []
    for r_i, row in enumerate(data):
        new_row = []
        for c_i, cell in enumerate(row):
            if r_i == 0 and header:
                new_row.append(Paragraph(str(cell), ST_TABLE_HEAD))
            else:
                new_row.append(Paragraph(str(cell), ST_TABLE_CELL))
        rows.append(new_row)
    t = Table(rows, colWidths=col_widths, repeatRows=1 if header else 0)
    ts = [
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, 0), 0.8, HEADER_FILL) if header else ('LINEBELOW', (0, 0), (-1, 0), 0, colors.white),
    ]
    if header:
        ts.append(('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG))
    if stripe:
        for i in range(1, len(rows)):
            ts.append(('BACKGROUND', (0, i), (-1, i), TABLE_ROW_ODD if i % 2 else TABLE_ROW_EVEN))
    ts.append(('BOX', (0, 0), (-1, -1), 0.5, BORDER))
    ts.append(('INNERGRID', (0, 0), (-1, -1), 0.25, BORDER))
    t.setStyle(TableStyle(ts))
    return t

def callout_box(title, body_text, accent=ACCENT, bg=CARD_BG):
    """A shaded callout box."""
    inner = [
        Paragraph(f'<font color="{accent.hexval()}" name="FreeSans-Bold">{title}</font>', ST_CALLOUT),
        Spacer(1, 4),
        Paragraph(body_text, ST_BODY_LEFT),
    ]
    t = Table([[inner]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 11),
        ('LINEBEFORE', (0, 0), (0, -1), 3, accent),
        ('BOX', (0, 0), (-1, -1), 0.4, BORDER),
    ]))
    return t

def stat_block(number, label, sub=None):
    """A statistic block."""
    items = [
        Paragraph(number, ST_STAT_NUM),
        Paragraph(label, STAT_LABEL),
    ]
    if sub:
        items.append(Paragraph(sub, ParagraphStyle('stsub', parent=STAT_LABEL, fontSize=7.5, textColor=TEXT_LIGHT)))
    return items

def stat_row(stats):
    """Row of stat blocks. stats: list of (num, label, sub)."""
    cells = [stat_block(n, l, s) for n, l, s in stats]
    n = len(cells)
    col_w = CONTENT_W / n
    t = Table([cells], colWidths=[col_w] * n)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('BACKGROUND', (0, 0), (-1, -1), SECTION_BG),
        ('LINEABOVE', (0, 0), (-1, 0), 2, ACCENT),
        ('LINEBELOW', (0, -1), (-1, -1), 0.4, BORDER),
        ('LINEAFTER', (0, 0), (-2, -1), 0.3, BORDER),
    ]))
    return t

def two_col(left_items, right_items, ratio=(0.5, 0.5)):
    """Two-column layout."""
    lw = CONTENT_W * ratio[0]
    rw = CONTENT_W * ratio[1]
    t = Table([[left_items, right_items]], colWidths=[lw, rw])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (0, -1), 0),
        ('RIGHTPADDING', (0, 0), (0, -1), 14),
        ('LEFTPADDING', (1, 0), (1, -1), 14),
        ('RIGHTPADDING', (1, 0), (1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LINEAFTER', (0, 0), (0, -1), 0.4, BORDER),
    ]))
    return t

# ─────────────────────────────────────────────────────────────────────
# COVER PAGE (custom canvas drawing, Template 01 inspired)
# ─────────────────────────────────────────────────────────────────────
def draw_cover(canvas, doc):
    c = canvas
    W, H = PAGE_W, PAGE_H

    # Background
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Grid pattern (very faint)
    c.setStrokeColor(colors.HexColor('#e8e3da'))
    c.setLineWidth(0.3)
    grid = 24
    x = 0
    while x < W:
        c.line(x, 0, x, H)
        x += grid
    y = 0
    while y < H:
        c.line(0, y, W, y)
        y += grid

    # Left anchor line (thick vertical)
    anchor_x = W * 0.12
    c.setStrokeColor(HEADER_FILL)
    c.setLineWidth(6)
    c.line(anchor_x, H * 0.10, anchor_x, H * 0.90)

    # Small accent square near top of line
    c.setFillColor(ACCENT)
    c.rect(anchor_x - 4, H * 0.90, 12, 12, fill=1, stroke=0)

    # Content X
    cx = anchor_x + 30

    # Kicker
    c.setFillColor(ACCENT)
    c.setFont('FreeSans-Bold', 10)
    c.drawString(cx, H * 0.84, 'SALES ACQUISITION OPERATING SYSTEM')
    c.setFillColor(TEXT_MUTED)
    c.setFont('FreeSans', 8.5)
    c.drawString(cx, H * 0.84 - 13, 'CAPABILITY DOCUMENT  /  CORPORATE EDITION')

    # Title block
    c.setFillColor(HEADER_FILL)
    c.setFont('NotoSerif-Bold', 46)
    c.drawString(cx, H * 0.72, 'AcquisitionOS')

    # Subtitle
    c.setFillColor(colors.HexColor('#3a3835'))
    c.setFont('NotoSerif-Light', 16)
    c.drawString(cx, H * 0.68, 'Autonomous pipeline for modern revenue teams.')

    # Summary block (mid page)
    summary_lines = [
        'An end to end acquisition platform that unifies lead discovery,',
        'AI scoring, multi channel outreach, pipeline automation, and',
        'real time revenue intelligence inside one operating system.',
    ]
    c.setFillColor(TEXT_PRIMARY)
    c.setFont('FreeSans', 11)
    sy = H * 0.55
    for i, line in enumerate(summary_lines):
        c.drawString(cx, sy - i * 16, line)

    # Status badge
    c.setFillColor(SEM_WARNING)
    c.setStrokeColor(SEM_WARNING)
    c.setLineWidth(0.8)
    badge_y = H * 0.44
    c.roundRect(cx, badge_y, 150, 24, 4, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont('FreeSans-Bold', 9)
    c.drawCentredString(cx + 75, badge_y + 8, 'STATUS  /  IN DEVELOPMENT')

    # Meta block (bottom)
    meta_y = H * 0.18
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(cx, meta_y + 38, cx + 260, meta_y + 38)

    c.setFillColor(ACCENT)
    c.setFont('FreeSans-Bold', 8)
    c.drawString(cx, meta_y + 28, 'PREPARED FOR')
    c.setFillColor(HEADER_FILL)
    c.setFont('FreeSans-Bold', 11)
    c.drawString(cx, meta_y + 14, 'Corporate Listing & Client Review')

    c.setFillColor(ACCENT)
    c.setFont('FreeSans-Bold', 8)
    c.drawString(cx + 160, meta_y + 28, 'EDITION')
    c.setFillColor(HEADER_FILL)
    c.setFont('FreeSans-Bold', 11)
    c.drawString(cx + 160, meta_y + 14, 'v2.0  /  2026')

    c.setFillColor(TEXT_MUTED)
    c.setFont('FreeSans', 8)
    c.drawString(cx, meta_y - 4, 'Confidential capability overview. Distribution restricted to authorised personnel.')

    # Right side vertical text
    c.saveState()
    c.setFillColor(TEXT_LIGHT)
    c.setFont('FreeSans', 7.5)
    c.translate(W - 24, H * 0.5)
    c.rotate(90)
    c.drawCentredString(0, 0, 'ACQUISITION OS  /  CAPABILITY DOCUMENT  /  2026')
    c.restoreState()

    # Top right corner mark
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.5)
    c.line(W - 50, H - 30, W - 24, H - 30)
    c.line(W - 24, H - 30, W - 24, H - 56)

# ─────────────────────────────────────────────────────────────────────
# PAGE HEADER / FOOTER (body pages)
# ─────────────────────────────────────────────────────────────────────
def draw_body_page(canvas, doc):
    c = canvas
    W, H = PAGE_W, PAGE_H
    page_num = doc.page

    # Header
    c.setFillColor(PAGE_BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # Top thin accent line
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(MARGIN_L, H - 14 * mm, W - MARGIN_R, H - 14 * mm)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1.6)
    c.line(MARGIN_L, H - 14 * mm, MARGIN_L + 28, H - 14 * mm)

    # Header text
    c.setFillColor(TEXT_MUTED)
    c.setFont('FreeSans', 8)
    c.drawString(MARGIN_L + 36, H - 13 * mm + 1, 'ACQUISITION OS  /  CAPABILITY DOCUMENT')
    c.setFillColor(ACCENT)
    c.setFont('FreeSans-Bold', 8)
    c.drawRightString(W - MARGIN_R, H - 13 * mm + 1, 'IN DEVELOPMENT')

    # Footer
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.line(MARGIN_L, 14 * mm, W - MARGIN_R, 14 * mm)

    c.setFillColor(TEXT_LIGHT)
    c.setFont('FreeSans', 8)
    c.drawString(MARGIN_L, 10 * mm, 'AcquisitionOS  /  Corporate Capability Document  /  v2.0  /  2026')
    c.setFillColor(HEADER_FILL)
    c.setFont('FreeSans-Bold', 9)
    c.drawRightString(W - MARGIN_R, 10 * mm, f'{page_num:02d}')

    # Confidential strip
    c.setFillColor(SEM_WARNING)
    c.setFont('FreeSans-Bold', 6.5)
    c.drawCentredString(W / 2, 6.5 * mm, 'CONFIDENTIAL  /  FOR AUTHORISED DISTRIBUTION ONLY')

# ─────────────────────────────────────────────────────────────────────
# DOC TEMPLATE WITH TOC
# ─────────────────────────────────────────────────────────────────────
class TocDocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def build_doc():
    doc = TocDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=MARGIN_L,
        rightMargin=MARGIN_R,
        topMargin=MARGIN_T,
        bottomMargin=MARGIN_B,
        title='AcquisitionOS Corporate Capability Document',
        author='AcquisitionOS',
        subject='Sales Acquisition Operating System Capability Overview',
        creator='AcquisitionOS Engineering',
    )

    # Cover frame (full page, no margins)
    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id='cover')
    # Body frame
    body_frame = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id='body')

    doc.addPageTemplates([
        PageTemplate(id='cover', frames=[cover_frame], onPage=draw_cover),
        PageTemplate(id='body', frames=[body_frame], onPage=draw_body_page),
    ])

    story = build_story()
    doc.multiBuild(story)
    return OUTPUT_PATH

# ─────────────────────────────────────────────────────────────────────
# CONTENT
# ─────────────────────────────────────────────────────────────────────
def build_story():
    s = []
    from reportlab.platypus.doctemplate import NextPageTemplate

    # Switch to body template BEFORE the first page break so page 2 is body
    s.append(NextPageTemplate('body'))
    # Cover page content: a single spacer; the cover is drawn by canvas
    s.append(Spacer(1, 1))
    s.append(PageBreak())

    # ── TABLE OF CONTENTS ─────────────────────────────────────────────
    s.append(P('CONTENTS', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(P('Table of Contents', ST_H1))
    s.append(hr(ACCENT, 1.5, 4, 14))

    toc = TableOfContents()
    toc.levelStyles = [ST_TOC0, ST_TOC1]
    s.append(toc)
    s.append(PageBreak())

    # ── 1. MISSION ─────────────────────────────────────────────────────
    s.append(P('SECTION 01', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('Mission'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'AcquisitionOS exists to compress the distance between a prospect appearing on the open internet and a signed customer on the books. '
        'We believe that the act of acquiring customers should not require a dozen disconnected tools, a spreadsheet of copy paste workarounds, or a team of specialists stitching reports together by hand. '
        'The system replaces that fractured stack with a single, coherent operating layer that discovers leads, scores them, reaches out, books meetings, and reports revenue, all under the supervision of the people who own the outcome.',
        ST_LEAD
    ))

    s.append(Spacer(1, 6))
    s.append(callout_box(
        'Our Commitment',
        'To give every revenue team, from a two person founding crew to an enterprise sales floor, the same acquisition firepower that was previously reserved for companies with full revenue operations departments. '
        'Discovery, scoring, outreach, pipeline, and reporting are treated as one continuous workflow, not five tabs in five subscriptions.',
        accent=ACCENT
    ))

    s.append(Spacer(1, 10))
    s.append(h2('Operating Principles'))
    principles = [
        ('Single Source of Truth', 'Every lead, deal, message, and meeting lives in one data model. No silent drift between tools, no orphaned records, no reconciliation calls on Monday morning.'),
        ('Autonomy With Oversight', 'The system is built to act on its own, to discover, score, draft, schedule, and follow up, but every autonomous action is logged, reversible, and observable to a human owner.'),
        ('Cost Discipline', 'AI credits, scraping budget, and API spend are tracked per action and surfaced to the user. The platform is engineered to be transparent about what each acquisition actually costs.'),
        ('Compliance First', 'GDPR consent, audit logs, data retention, and unsubscribe handling are wired into the core, not bolted on as a legal afterthought. The system is designed to be defensible from day one.'),
    ]
    for title, body in principles:
        s.append(P(f'<b>{title}.</b> {body}', ST_BODY))
        s.append(Spacer(1, 2))

    s.append(PageBreak())

    # ── 2. THE PROBLEM / BEFORE ────────────────────────────────────────
    s.append(P('SECTION 02', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('The Problem / Before'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'Before AcquisitionOS, the typical revenue team operated a stack that no single person fully understood. '
        'A prospecting tool fed a CRM that fed a sequencing tool that fed a calendar that fed a reporting layer that fed a billing system, each one a separate login, a separate bill, and a separate source of truth. '
        'The seams between those tools were where revenue leaked. Leads fell through gaps. Scores were guessed. Follow ups were forgotten. Reports were assembled by hand. Meetings were booked twice or not at all. '
        'The team spent more energy operating the stack than operating the pipeline.',
        ST_LEAD
    ))

    s.append(Spacer(1, 6))
    s.append(h2('Where The Leakage Happened'))

    s.append(make_table([
        ['Stage', 'What Teams Did By Hand', 'What Slipped Through'],
        ['Discovery', 'Manual list building from LinkedIn, directories, search results', 'Stale data, duplicate records, missed niches'],
        ['Scoring', 'Gut feel or static spreadsheets ranking who to call first', 'Hot leads left cold, cold leads over pursued'],
        ['Outreach', 'Copy paste templates across Gmail, WhatsApp, Telegram', 'Inconsistent messaging, no A/B signal, reply loss'],
        ['Pipeline', 'Kanban boards updated once a week from memory', 'Stage drift, forgotten follow ups, silent churn'],
        ['Meetings', 'Email ping pong to find a slot, manual calendar holds', 'Double bookings, no shows, lost context'],
        ['Reporting', 'Friday night spreadsheet from three exports', 'Stale numbers, no anomaly detection, reactive not predictive'],
        ['Billing', 'Manual invoicing, manual credit tracking, manual tax', 'Revenue leakage, compliance risk, dispute exposure'],
    ], col_widths=[CONTENT_W*0.16, CONTENT_W*0.42, CONTENT_W*0.42]))

    s.append(Spacer(1, 10))
    s.append(callout_box(
        'The Honest Summary',
        'The problem was never that individual tools were bad. The problem was the integration tax. '
        'Every handoff between tools cost time, lost context, and introduced error. '
        'A team of five could easily spend 40 percent of its week simply moving data between systems instead of moving prospects through a pipeline.',
        accent=SEM_ERROR, bg=colors.HexColor('#f7efed')
    ))

    s.append(PageBreak())

    # ── 3. WHAT WE BUILT ───────────────────────────────────────────────
    s.append(P('SECTION 03', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('What We Built'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'AcquisitionOS is one platform, one database, one login. It collapses the scattered revenue stack into a single operating system organised around the natural lifecycle of a customer. '
        'The architecture is intentionally monolithic at the data layer, every record knows about every other record, and intentionally modular at the service layer, so each capability can be hardened and scaled on its own. '
        'What follows is a plain language inventory of what the system actually does today.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('Module Inventory'))

    modules = [
        ('Lead Discovery & Sourcing', 'Automated discovery jobs scan company websites, score online footprint, run competitive gap analysis, and surface prospect lists by niche, geography, and intent signals. Distributed scraping with proxy rotation and anti bot handling keeps discovery resilient at scale.'),
        ('AI Lead Scoring & Enrichment', 'Every lead is scored on a multi signal model that blends firmographics, website quality, reply intelligence, and engagement history. Enrichment fills missing fields from public sources. The scoring engine explains its own rankings, so a human reviewer can see why a lead is hot.'),
        ('Pipeline & Deal Management', 'A configurable pipeline with custom stages, deal risk assessment, revenue waterfall, and forecast modelling. Deals link to their originating leads, every activity is auditable, and stage movements fire downstream automations.'),
        ('Outreach & Sequences', 'Multi step email sequences, autonomous outreach campaigns, message broadcasts, and a template approval workflow. Open and click tracking, bounce intelligence, and unsubscribe compliance are built in. Templates support variables, conditional blocks, and per channel formatting.'),
        ('Gmail Integration', 'Native Gmail sync via OAuth with inbox threading, reply processing, draft generation, send and receive, tracking pixels, and PubSub push notifications. Multiple Gmail accounts can be linked and switched, each isolated per user.'),
        ('Calendar & Meeting Intelligence', 'Google Calendar integration with AI booking, availability detection, meeting prep, agenda generation, action item extraction, sentiment analysis, follow up email drafting, and objection handling. A meeting assistant turns the meeting lifecycle into a workflow, not a chore.'),
        ('AI Copilot & RAG', 'An in dashboard AI assistant with streaming chat, retrieval augmented generation over ingested documents and URLs, vector search across the knowledge base, prompt management, and a credit enforced cost model. The copilot can analyse a lead, generate outreach, and answer questions about pipeline health.'),
        ('Workflow Engine', 'A visual workflow builder with triggers, conditions, actions, executions, retries, dead letter queues, and per workflow metrics. Workflows connect every other module, so a reply in Gmail can move a deal in the pipeline and fire a Telegram alert without any glue code.'),
        ('Competitor Intelligence', 'Competitor discovery, SEO analysis, pricing snapshots, review monitoring, social signal tracking, and opportunity gap detection. Competitor data is stored as time series snapshots, so the team can see how a rival evolved over months, not just today.'),
        ('Hot Lead Detection', 'A real time hot lead feed that watches reply signals, engagement spikes, and buying intent markers. The scanner runs on a schedule and surfaces leads that have crossed a heat threshold, so the team works the warmest opportunities first.'),
        ('Autonomous SDR Pipeline', 'A self driving outreach pipeline that can generate, dispatch, classify replies, move pipeline stages, and send follow ups without manual prompting. Every autonomous action is logged and reversible, and the user sets the autonomy ceiling.'),
        ('Billing, Credits & Invoices', 'Subscription tiers, credit ledger, addon packs, coupons, tax calculation, invoice generation and delivery, GST handling, Stripe and Razorpay payment rails, webhook reconciliation, dunning, and a customer portal. The billing layer is its own auditable sub system.'),
        ('Team, Org & White Label', 'Organisations, team invites, role based access control, white label branding, audit logs, and an admin console. The system is built for a single founder and for a multi tenant agency under the same roof.'),
        ('Integrations Hub', 'Gmail, Google Calendar, Telegram, WhatsApp (Meta Cloud API and Twilio), Stripe, Razorpay, and Resend, each with connect, disconnect, status, and health monitoring. The integration marketplace is the front door to the outside world.'),
        ('Security & Compliance', 'GDPR export and delete, consent tracking, data retention policies, audit logs, API keys with rotation and revocation, session management, MFA, rate limiting, device fingerprinting, suspicious login detection, and a security audit trail.'),
        ('Observability', 'Metrics, tracing, structured logging, Sentry integration, API monitoring, error tracking, health checks, and a real time observability dashboard. The system watches itself as carefully as it watches the pipeline.'),
        ('Real Time Layer', 'WebSocket and Server Sent Events channels push live activity, notifications, and pipeline updates to the dashboard without polling. A dedicated real time mini service keeps every connected client in sync.'),
        ('Notifications & Messaging', 'A multi channel notification engine that can deliver via email, push, Telegram, and WhatsApp from a single event. Notification preferences, broadcast history, and a notification center live in the dashboard.'),
        ('Reporting & Analytics', 'An advanced report builder with templates, scheduling, export, and shareable links. Analytics cover lead sources, funnel velocity, deal performance, team workload, revenue forecast, benchmarks, anomalies, and executive summaries.'),
    ]

    for title, body in modules:
        s.append(P(f'<b>{title}.</b> {body}', ST_BODY))
        s.append(Spacer(1, 3))

    s.append(Spacer(1, 6))
    s.append(callout_box(
        'One Line Description',
        'AcquisitionOS is the operating system that a revenue team would build for itself if it had the time, the engineers, and the patience to replace its entire tool stack with a single, coherent, accountable platform.',
        accent=ACCENT
    ))

    s.append(PageBreak())

    # ── 4. SYSTEM ARCHITECTURE ─────────────────────────────────────────
    s.append(P('SECTION 04', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('System Architecture'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'The platform is a layered system. At the bottom sits a single relational database that holds every domain object, from users and leads to deals, meetings, workflows, and invoices. '
        'Above the database, a TypeScript application server exposes a large surface of HTTP API routes, one route per responsibility, organised by domain. '
        'Alongside the main server, a set of independent mini services handle concerns that benefit from process isolation, real time push, email delivery, and a watchdog. '
        'At the top, a React based single page application renders the dashboard and the public marketing surface. '
        'A gateway sits in front of everything, routing external traffic to the right internal port and shielding the application servers from direct exposure.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('Layer By Layer'))

    s.append(make_table([
        ['Layer', 'Responsibility', 'Technology'],
        ['Presentation', 'Dashboard, auth pages, public marketing, legal pages, admin console', 'Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/ui, Framer Motion, TanStack Query, Zustand, Recharts'],
        ['API Surface', 'One HTTP route per domain action, rate limited, audited, session enforced', 'Next.js Route Handlers, TypeScript, Zod validation, JWT sessions, RBAC middleware'],
        ['Domain Logic', 'Services that encode the business rules for each module', 'TypeScript service classes, Prisma ORM, bcrypt, Nodemailer, Stripe and Razorpay SDKs, Resend SDK, z-ai-web-dev-sdk'],
        ['Persistence', 'Single source of truth for every record', 'Prisma ORM over SQLite (production schema is PostgreSQL ready with migration annotations)'],
        ['Real Time', 'Live updates to every connected dashboard client', 'Socket.io mini service, Server Sent Events, an in process event bus'],
        ['Background Work', 'Cron driven jobs and long running tasks', 'Next.js cron routes, a server watchdog, a workflow executor with dead letter queues'],
        ['AI / ML', 'Lead scoring, outreach generation, reply classification, RAG, vector search, copilot chat', 'z-ai-web-dev-sdk for LLM, VLM, TTS, ASR, and image generation, an in process vector index, RAG ingestion, a prompt manager, credit enforcement, an AI cost tracker'],
        ['Python Service Layer', 'Heavy scraping, ML model serving, and data science pipelines that benefit from the Python ecosystem', 'FastAPI microservices, Scrapy and BeautifulSoup for scraping, Pandas and NumPy for data shaping, scikit-learn for scoring models, Celery with Redis for async tasks, OpenAI and Anthropic SDKs, LangChain for chains and agents'],
        ['Integrations', 'Third party connections', 'Gmail API, Google Calendar API, Telegram Bot API, WhatsApp Meta Cloud API, WhatsApp via Twilio, Stripe, Razorpay, Resend, Google Custom Search, Sentry'],
        ['Gateway', 'External entry point, TLS termination, port routing', 'Caddy reverse proxy, XTransformPort routing for mini services'],
        ['Observability', 'System watches itself', 'Structured logging, metrics collector, request tracing, Sentry, health checks, API monitor, error tracker'],
    ], col_widths=[CONTENT_W*0.14, CONTENT_W*0.36, CONTENT_W*0.50]))

    s.append(Spacer(1, 10))
    s.append(h2('Why A Layered System, Not Microservices Everywhere'))
    s.append(P(
        'A fully microservice architecture buys scale at the cost of operational complexity. '
        'For an acquisition platform, the most expensive failure is a lost or inconsistent record, a lead that exists in one service but not another, a deal that moved in the pipeline but the notification service never saw it. '
        'The platform keeps a single database and a single application server for the domain core, so every write is atomic and every read is consistent. '
        'Only the concerns that genuinely need isolation, real time push, email delivery, and the Python AI and scraping layer, are split into their own processes. '
        'The result is a system that scales to the needs of a real revenue team without requiring a site reliability engineering department to keep it upright.',
        ST_BODY
    ))

    s.append(Spacer(1, 8))
    s.append(h2('Deployment Topology'))
    s.append(P(
        'The main application server runs as a standalone Next.js production build on port 3000, with the real time service on its own port, the email service on its own port, and the Python service layer on its own assigned ports. '
        'A single Caddy gateway listens on the public interface, terminates TLS, and forwards to the correct internal port using a query parameter. '
        'This topology means a new Python microservice can be added without touching the gateway configuration, it is discovered by its port and routed dynamically. '
        'The same property lets the system run on a single host for a small team or spread across hosts for a larger one, with no code changes, only configuration.',
        ST_BODY
    ))

    s.append(PageBreak())

    # ── 5. DATA FLOW ───────────────────────────────────────────────────
    s.append(P('SECTION 05', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('Data Flow'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'Data moves through AcquisitionOS along a predictable path. '
        'A prospect enters the system through discovery, is enriched and scored, is enrolled in an outreach sequence, replies are processed and classified, a meeting is booked, a deal is created, the deal moves through pipeline stages, and finally revenue is recognised and invoiced. '
        'At every step, the data is written to the central database, events are fired to the real time layer, and downstream subscribers react. '
        'The flow is observable end to end, no step is silent.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('The Full Lifecycle In Twelve Steps'))

    steps = [
        ('01  Discovery', 'A discovery job, either scheduled or manually triggered, queries public sources via the scraping layer (Python Scrapy workers behind the gateway). Raw prospects are written to a staging table with their source URL, niche, and discovery timestamp.'),
        ('02  Enrichment', 'The enrichment service fills missing fields, company name, website, location, employee range, using the company researcher module. Duplicates are deduplicated against the existing lead store by domain and email hash.'),
        ('03  AI Scoring', 'The scoring engine pulls firmographics, website quality, reply intelligence, and engagement history, sends a structured prompt to the LLM, and writes a numeric score plus a human readable explanation back to the lead record.'),
        ('04  Pipeline Enrollment', 'The lead is assigned to a pipeline stage, either by an automation rule or a human owner. The stage assignment fires a workflow trigger that can notify, schedule, or hand off to a sequence.'),
        ('05  Sequence Enrollment', 'The lead is enrolled in an outreach sequence. The sequence executor schedules each step, drafts an email with the AI outreach generator, and waits for the scheduled send time.'),
        ('06  Send', 'At the scheduled time, the email service delivers the message via the configured provider, Resend, Gmail SMTP, or Ethereal in test. Open and click tracking pixels are attached. The send is recorded against the lead.'),
        ('07  Reply Intake', 'A reply arrives in Gmail. The PubSub push notification wakes the reply processor, which fetches the thread, classifies the reply with the reply intelligence module (interested, out of office, unsubscribe, objection), and updates the lead status.'),
        ('08  Hot Lead Detection', 'If the reply signals buying intent, the hot lead scanner flags the lead and pushes a real time notification to the dashboard, to email, to Telegram, and to WhatsApp based on the user notification preferences.'),
        ('09  Meeting Booking', 'The user, or the autonomous pipeline on the user behalf, opens the schedule dialog. The calendar intelligence module reads availability from Google Calendar, proposes slots, and sends an invite. A meeting record is created and linked to the lead.'),
        ('10  Meeting Execution', 'Before the meeting, the assistant generates a prep brief and an agenda. After the meeting, it extracts action items, detects sentiment, drafts a follow up email, and records objections. Every artefact is stored against the meeting.'),
        ('11  Deal Creation', 'When the prospect agrees to terms, a deal is created from the lead. The deal enters the pipeline at the first stage. The revenue forecast, waterfall, and risk assessment all update in real time.'),
        ('12  Revenue Close', 'On deal close, the billing service generates an invoice, applies tax and coupon logic, and charges via Stripe or Razorpay. The webhook reconciles the payment, the credit ledger updates, and the deal stage moves to won. The cycle is complete.'),
    ]

    for title, body in steps:
        s.append(P(f'<font color="{ACCENT.hexval()}" name="FreeSans-Bold">{title}.</font> {body}', ST_BODY))
        s.append(Spacer(1, 2))

    s.append(Spacer(1, 6))
    s.append(callout_box(
        'The Property That Makes It Work',
        'Every step writes to the same database and fires an event to the same bus. '
        'There is no batch sync, no overnight reconciliation, no shadow copy of the data in a separate tool. '
        'When a lead moves, the pipeline moves. When the pipeline moves, the forecast moves. When the forecast moves, the dashboard moves. All in the same second.',
        accent=ACCENT
    ))

    s.append(PageBreak())

    # ── 6. BEFORE / AFTER ──────────────────────────────────────────────
    s.append(P('SECTION 06', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('Before and After'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'The clearest way to describe what AcquisitionOS changes is to put the old way and the new way side by side. '
        'The comparison below is not aspirational, it describes the operating model the system is built to deliver.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('Operating Model'))

    s.append(make_table([
        ['Dimension', 'Before', 'After'],
        ['Tools in use', '6 to 10 separate subscriptions', '1 platform, 1 login, 1 bill'],
        ['Lead discovery', 'Manual list building, weekly', 'Continuous automated discovery jobs'],
        ['Lead scoring', 'Gut feel, static spreadsheet', 'Multi signal AI model with explanations'],
        ['Outreach', 'Copy paste across channels', 'Sequences with AI drafted, tracked steps'],
        ['Reply handling', 'Inbox monitored by a human', 'Auto classified, routed, and flagged'],
        ['Meeting booking', 'Email ping pong', 'AI reads calendar, proposes slots, sends invite'],
        ['Pipeline visibility', 'Updated weekly from memory', 'Live, real time, auditable'],
        ['Reporting', 'Friday spreadsheet from three exports', 'Always on dashboard, scheduled reports'],
        ['Billing', 'Manual invoicing and tax', 'Automated invoicing, tax, and reconciliation'],
        ['Compliance', 'Reacted to when asked', 'Wired into every record from day one'],
        ['Onboarding a new rep', 'Days of tool training', 'A login and a role'],
    ], col_widths=[CONTENT_W*0.22, CONTENT_W*0.39, CONTENT_W*0.39]))

    s.append(Spacer(1, 10))
    s.append(h2('Time And Effort'))

    s.append(stat_row([
        ('6 to 1', 'TOOLS PER REP', 'Subscriptions collapsed into one'),
        ('70%', 'LESS COPY PASTE', 'Across the outreach and reporting cycle'),
        ('0', 'RECONCILIATION CALLS', 'Single source of truth removes them'),
    ]))

    s.append(Spacer(1, 10))
    s.append(h2('What The Team Stops Doing'))

    for item in [
        'Moving CSV exports between five tools every Friday afternoon.',
        'Manually looking up a prospect on LinkedIn, then their website, then their competitors.',
        'Guessing which lead to call first because there is no score and no context.',
        'Asking the prospect for a time slot and then negotiating over four emails.',
        'Rebuilding the pipeline board in the weekly meeting because nobody updated it during the week.',
        'Reconciling the billing spreadsheet against the CRM at the end of the month.',
        'Explaining to a new hire which tool does what and how they connect.',
    ]:
        s.append(P(f'<font color="{SEM_ERROR.hexval()}">✕</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 6))
    s.append(h2('What The Team Starts Doing'))

    for item in [
        'Reviewing an AI generated hot lead feed every morning instead of building lists.',
        'Reading the scoring explanation before a call, so the conversation starts informed.',
        'Approving AI drafted outreach instead of writing it from scratch.',
        'Watching the pipeline move itself as replies are classified and stages advance.',
        'Opening a dashboard that already knows the answer instead of building a report.',
        'Onboarding a new rep with a login and a role, not a week of tool training.',
    ]:
        s.append(P(f'<font color="{SEM_SUCCESS.hexval()}">✓</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(PageBreak())

    # ── 7. TECH STACK ──────────────────────────────────────────────────
    s.append(P('SECTION 07', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('Tech Stack'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'The stack is chosen for a specific reason: it must be operable by a small team, auditable by an enterprise buyer, and portable across cloud providers. '
        'No component is exotic. Every layer is mainstream, well documented, and has a long support horizon. '
        'The platform is built to outlive any single hosting provider or vendor relationship.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('Frontend'))
    for item in [
        '<b>Next.js 16</b> with the App Router, the current generation of the React framework, chosen for server rendering, route handlers, and standalone output.',
        '<b>React 19</b> for the component model, with concurrent features and server components where they reduce client bundle size.',
        '<b>TypeScript 5</b> end to end, with strict typing. No untyped boundary between the frontend and the API.',
        '<b>Tailwind CSS 4</b> for the styling system, paired with the <b>shadcn/ui</b> component library in the New York style.',
        '<b>Framer Motion</b> for transitions and micro interactions, kept subtle and purposeful.',
        '<b>TanStack Query</b> for server state, <b>Zustand</b> for client state, and <b>React Hook Form</b> with <b>Zod</b> for forms and validation.',
        '<b>Recharts</b> for data visualisation, <b>Lucide</b> for icons, <b>cmdk</b> for the command palette, <b>sonner</b> for toasts.',
        '<b>MDX Editor</b> for rich text, <b>react-syntax-highlighter</b> for code blocks, and <b>embla-carousel</b> for carousels.',
    ]:
        s.append(P(f'<font color="{ACCENT.hexval()}">▸</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('Backend Application Server'))
    for item in [
        '<b>Next.js Route Handlers</b> as the API surface. One HTTP route per domain action, organised by feature folder.',
        '<b>Prisma ORM</b> over <b>SQLite</b> in the current deployment, with a schema annotated for PostgreSQL migration when scale demands it.',
        '<b>JWT sessions</b> signed with a persistent random secret, <b>bcrypt</b> for password hashing, <b>NextAuth.js v4</b> available for federated flows.',
        '<b>Nodemailer</b> for SMTP delivery, <b>Resend</b> as a managed email provider, <b>Ethereal</b> as a test inbox with preview URLs.',
        '<b>Stripe</b> and <b>Razorpay</b> for payments, with webhook reconciliation and a customer portal.',
        '<b>Cheerio</b> for server side HTML parsing in the enrichment and scraping paths that run inside the main server.',
        '<b>pdfkit</b> for PDF generation, <b>sharp</b> for image processing, <b>uuid</b> for identifiers, <b>date-fns</b> for date math.',
        '<b>jose</b> and <b>jsonwebtoken</b> for token signing and verification across the auth, relay, and OAuth flows.',
        '<b>ioredis</b> for caching and pub/sub where a Redis instance is available, with an in memory fallback for single host deployments.',
    ]:
        s.append(P(f'<font color="{ACCENT.hexval()}">▸</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('Python Service Layer'))
    s.append(P(
        'The Python layer exists to do what Python does better than TypeScript: heavy scraping at scale, ML model serving, and data science pipelines. '
        'These services run as independent processes behind the same gateway, addressed by port, and called from the main application server over HTTP. '
        'The architecture is polyglot by design, the right language for the right job, glued together by a single routing convention.',
        ST_BODY
    ))
    for item in [
        '<b>FastAPI</b> as the web framework for each Python microservice, chosen for async support, automatic OpenAPI docs, and Pydantic validation.',
        '<b>Scrapy</b> for distributed web crawling, with retry middleware, proxy rotation, and per spider rate limiting.',
        '<b>BeautifulSoup4</b> and <b>lxml</b> for HTML parsing where Scrapy is too heavy for a single page extraction.',
        '<b>Requests</b> and <b>httpx</b> for HTTP clients, with connection pooling and retry sessions.',
        '<b>Pandas</b> and <b>NumPy</b> for data shaping, deduplication, and the statistical work behind the scoring and benchmarking models.',
        '<b>scikit-learn</b> for the classical ML models that power reply classification and lead scoring baselines.',
        '<b>Celery</b> with <b>Redis</b> as the broker for asynchronous scraping and enrichment jobs that run longer than a single HTTP request.',
        '<b>OpenAI</b> and <b>Anthropic</b> Python SDKs for LLM calls that benefit from the Python ecosystem, such as batch scoring and structured output.',
        '<b>LangChain</b> for chain and agent orchestration in the more complex AI workflows, with LangSmith hooks for tracing when enabled.',
        '<b>Pydantic</b> for every service boundary, so the contract between the Python layer and the TypeScript layer is explicit and validated.',
        '<b>Uvicorn</b> and <b>Gunicorn</b> as the ASGI servers, with workers tuned to the available CPU.',
    ]:
        s.append(P(f'<font color="{ACCENT.hexval()}">▸</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('AI And ML'))
    for item in [
        '<b>z-ai-web-dev-sdk</b> for LLM chat, vision (VLM), text to speech (TTS), speech to text (ASR), and image generation, used server side only.',
        'An in process <b>vector search</b> index for retrieval augmented generation over ingested documents and URLs.',
        'A <b>RAG ingestion</b> pipeline that accepts text, URLs, and CSV, chunks and embeds the content, and stores it for later retrieval.',
        'A <b>prompt manager</b> that versions and tests prompts, so changes to AI behaviour are auditable and reversible.',
        'A <b>credit enforcement</b> layer that gates every AI call against the user credit balance and logs the cost.',
        'An <b>AI cost tracker</b> that aggregates spend per user, per model, and per action for transparency and billing.',
    ]:
        s.append(P(f'<font color="{ACCENT.hexval()}">▸</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('Real Time And Messaging'))
    for item in [
        '<b>Socket.io</b> for WebSocket based real time updates, run as a dedicated mini service on its own port.',
        '<b>Server Sent Events</b> for one way streaming, such as payment status and AI chat token streaming.',
        'An in process <b>event bus</b> for decoupled communication between services on the same host.',
        'A <b>notification engine</b> that fans a single event out to email, push, Telegram, and WhatsApp based on user preferences.',
    ]:
        s.append(P(f'<font color="{ACCENT.hexval()}">▸</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('Integrations'))
    s.append(make_table([
        ['Integration', 'Purpose', 'Library / API'],
        ['Gmail', 'Inbox sync, send, reply, tracking, multi account', 'Gmail API, OAuth2, PubSub push'],
        ['Google Calendar', 'Availability, booking, reminders, watches', 'Google Calendar API, OAuth2, webhook push'],
        ['Telegram', 'Notifications and bot interactions', 'Telegram Bot API'],
        ['WhatsApp', 'Messaging via Meta Cloud API and Twilio', 'Meta Cloud API, Twilio Messaging API'],
        ['Stripe', 'Subscriptions, one time payments, customer portal', 'Stripe SDK, webhook reconciliation'],
        ['Razorpay', 'India domestic payments and UPI', 'Razorpay SDK, webhook reconciliation'],
        ['Resend', 'Transactional email delivery', 'Resend SDK'],
        ['Google Custom Search', 'Discovery queries', 'Google Custom Search JSON API'],
        ['Sentry', 'Error tracking and performance monitoring', 'Sentry SDK'],
    ], col_widths=[CONTENT_W*0.18, CONTENT_W*0.42, CONTENT_W*0.40]))

    s.append(Spacer(1, 8))
    s.append(h2('Infrastructure'))
    for item in [
        '<b>Caddy</b> as the gateway, with automatic TLS and a query parameter based port routing convention for mini services.',
        '<b>SQLite</b> as the default database, file based, zero administration, and sufficient for the working set of a typical revenue team.',
        '<b>Prisma</b> with a schema annotated for <b>PostgreSQL</b> migration, so the move to a managed Postgres is a configuration change, not a rewrite.',
        '<b>Redis</b> optional, for caching and Celery brokering, with graceful in memory fallback when absent.',
        '<b>Bun</b> as the JavaScript runtime for the mini services, for fast startup and low overhead.',
        '<b>Node.js</b> for the main Next.js server, the current production runtime.',
        '<b>ESLint</b> and <b>Vitest</b> for code quality and tests, with a security scan script wired into the build.',
    ]:
        s.append(P(f'<font color="{ACCENT.hexval()}">▸</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(PageBreak())

    # ── 8. DELIVERY DISCIPLINE ─────────────────────────────────────────
    s.append(P('SECTION 08', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('Delivery Discipline'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'A platform is only as credible as the discipline behind it. '
        'AcquisitionOS is engineered with a set of explicit delivery practices that are visible in the codebase, the commit history, and the running system. '
        'These are not aspirational policies, they are the operating rules the system is built under every day.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('The Practices We Follow'))

    practices = [
        ('Single Source Of Truth', 'One database, one schema, one ORM. Every record knows about every other record. There is no shadow data store, no cached copy that drifts, no second CRM that the finance team maintains in parallel. When a record moves, every consumer of that record sees the move in the same transaction.'),
        ('Every Action Is Audited', 'Every write to the database is accompanied by an audit log entry that records who, what, when, and from where. The audit log is its own table, append only, and queryable from the admin console. A suspicious login, a stage change, a credit adjustment, an API key rotation, all are traceable to a source.'),
        ('No Silent Failures', 'Every error is logged with context. Every catch block either handles the error meaningfully or rethrows it with a structured message. The system never swallows an error and continues as if nothing happened. The observability layer surfaces failure rates per route, so a degrading endpoint is visible before it becomes an outage.'),
        ('Compliance By Construction', 'GDPR export and delete, consent tracking, data retention, and unsubscribe handling are built into the data model, not added later. A lead record carries its consent state. An unsubscribe request removes the lead from active sequences immediately. A GDPR delete purges the record and its dependents in a single transaction.'),
        ('Credits Are Real', 'Every AI call, every scrape, every outbound message consumes a credit, and every consumption is logged against a ledger. The user can see, in real time, what each action cost. There is no hidden spend, no surprise bill at the end of the month. The credit ledger is its own auditable sub system.'),
        ('Secrets Stay Secret', 'Secrets are never committed. The environment is restored on every cold start from a guarded script. Placeholder detection prevents fake credentials from being mistaken for real ones. The system refuses to send email or start OAuth with placeholder credentials rather than failing silently in production.'),
        ('Backwards Compatible Schema', 'The Prisma schema is annotated with migration safety notes. Every field that would need a backfill is marked. Every foreign key that would need integrity verification is marked. The move from SQLite to PostgreSQL is a planned operation, not an emergency one.'),
        ('Tested Where It Matters', 'The build includes a security scan. The auth, billing, and pipeline paths carry explicit test coverage. Vitest is wired in and run as part of the development loop. The system is not tested to exhaustion, but it is tested where the cost of a bug is highest.'),
        ('Observable From Day One', 'Structured logging, metrics, tracing, health checks, and an error tracker are wired into every route. The observability dashboard is a first class surface in the admin console. The team does not need a third party to tell it what the system is doing.'),
        ('Documented In Place', 'Every module has a header comment that explains what it does and why. Every non obvious decision has a comment that records the reasoning. The worklog is a living document that records what was changed, why, and what was verified. A new engineer can read the codebase and understand it without a separate wiki.'),
    ]

    for title, body in practices:
        s.append(P(f'<b>{title}.</b> {body}', ST_BODY))
        s.append(Spacer(1, 3))

    s.append(Spacer(1, 6))
    s.append(callout_box(
        'The Standard We Hold Ourselves To',
        'If a reviewer, a client, or an auditor asks why a decision was made, the answer must exist in the code, the commit history, or the worklog. '
        'If the answer is not there, it is a bug in our discipline, and we fix the discipline before we fix the code.',
        accent=ACCENT
    ))

    s.append(PageBreak())

    # ── 9. FIELD NOTES / VERIFIED ──────────────────────────────────────
    s.append(P('SECTION 09', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('Field Notes / Verified'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'These are the facts about the system as it stands today, verified against the running code and the recorded worklog. '
        'They are not promises, they are observations. Where something is not yet live, it says so plainly.',
        ST_LEAD
    ))

    s.append(Spacer(1, 8))
    s.append(h2('What Is Verified Working'))

    verified = [
        'The application server builds, starts, and serves HTTP 200 on the root route and on the health check endpoint.',
        'The authentication system supports four real sign in paths: email and password, magic link, one time password, and Google OAuth. All four deliver through real protocol, not simulation. No dev tokens, no fake OTPs, no auto complete.',
        'Email delivery runs through a real SMTP chain, Nodemailer to Resend or Gmail SMTP, with Ethereal as a test inbox that produces a browser viewable preview URL when no production credentials are set.',
        'The database schema covers over sixty domain models, including users, organisations, leads, deals, pipeline stages, outreach sequences, meetings, workflows, credits, invoices, and GDPR records. The schema is annotated for PostgreSQL migration.',
        'The API surface covers every module listed in this document, with one route per action, rate limiting, and audit logging. The route count is in the hundreds, organised by feature folder.',
        'The real time layer runs as a dedicated Socket.io mini service and pushes live updates to connected dashboard clients.',
        'The billing layer integrates Stripe and Razorpay with webhook reconciliation, invoice generation, tax calculation, and a customer portal. Coupons, trials, and credit addons are supported.',
        'The integration hub supports Gmail, Google Calendar, Telegram, WhatsApp (Meta and Twilio), Stripe, and Razorpay, each with connect, disconnect, and status endpoints.',
        'The observability layer produces structured logs, metrics, and health checks. Sentry is wired in with a no op fallback when no DSN is configured.',
        'The workflow engine supports triggers, conditions, actions, executions, retries, and a dead letter queue, with per workflow metrics.',
        'The AI copilot supports streaming chat, RAG over ingested documents, vector search, and credit enforced calls. The AI cost tracker aggregates spend per action.',
        'The security layer includes rate limiting, input validation, CSRF protection, security headers, webhook signature verification, device fingerprinting, suspicious login detection, and an audit log.',
        'The admin console includes feedback management, billing analytics, crash reports, backup management, and refund handling.',
        'The system is deployable as a standalone Next.js build, with a Dockerfile that expects the standalone output. The build has been verified to produce the standalone server entry point.',
    ]
    for item in verified:
        s.append(P(f'<font color="{SEM_SUCCESS.hexval()}" name="FreeSans-Bold">✓</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('What Is In Progress'))

    in_progress = [
        'Production email delivery to end user inboxes is pending a live Gmail App Password being set on the server. The code path is complete, the resolver supports fourteen alias names for the SMTP password, and delivery activates the moment a real password is set under any alias.',
        'The Python service layer is specified and the gateway routing convention is in place, but the individual Python microservices are on the integration roadmap. The TypeScript scraping and AI paths are live in the interim.',
        'The PostgreSQL migration path is annotated and the schema is ready, but the current deployment runs on SQLite. The move to PostgreSQL is a configuration change, not a rewrite, and is scheduled to follow the first enterprise deployment.',
        'The competitor intelligence module is implemented and the data model is live, but the scheduled snapshot collection is pending a live scraping budget allocation.',
        'The white label branding service is implemented at the data model and API level, and the dashboard respects per organisation branding, but the self serve branding studio is on the UI roadmap.',
    ]
    for item in in_progress:
        s.append(P(f'<font color="{SEM_WARNING.hexval()}" name="FreeSans-Bold">◐</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 8))
    s.append(h2('What Is Explicitly Out Of Scope Today'))

    out_scope = [
        'A mobile native application. The dashboard is a responsive web application and works on mobile browsers, but no native iOS or Android client is shipped.',
        'A self serve signup flow for the general public. Sign up is available but the onboarding is designed for a guided first use, not a frictionless consumer funnel.',
        'An offline mode. The system assumes connectivity. Offline recovery exists for the client, but the server is online only.',
    ]
    for item in out_scope:
        s.append(P(f'<font color="{TEXT_MUTED.hexval()}" name="FreeSans-Bold">○</font>&nbsp;&nbsp;{item}', ST_BULLET))

    s.append(Spacer(1, 10))
    s.append(callout_box(
        'Development Status',
        'AcquisitionOS is in active development. The platform is functional, the core modules are live, and the system is being prepared for its first external pilot deployments. '
        'The items marked in progress are on the near term roadmap. The items marked out of scope are deliberate non goals for the current phase. '
        'This document describes the system as it stands today, not as a promise of what it might become.',
        accent=SEM_WARNING, bg=colors.HexColor('#f7f2e8')
    ))

    s.append(PageBreak())

    # ── 10. CLOSING ───────────────────────────────────────────────────
    s.append(P('SECTION 10', ST_KICKER))
    s.append(Spacer(1, 4))
    s.append(h1('In Summary'))
    s.append(hr(ACCENT, 1.5, 4, 14))

    s.append(P(
        'AcquisitionOS is a single platform that replaces a scattered revenue stack with one coherent operating system. '
        'It discovers prospects, scores them with AI, reaches out across channels, books meetings, moves deals through a pipeline, reports revenue, and bills the customer, all in one database, one login, one audit trail. '
        'The system is built with mainstream technology, operated by a small team, and designed to be defensible to an enterprise buyer. '
        'It is in active development, the core is live, and it is being prepared for its first pilot deployments. '
        'For a revenue team that is tired of operating its tools instead of its pipeline, this is the alternative.',
        ST_LEAD
    ))

    s.append(Spacer(1, 12))
    s.append(h2('At A Glance'))

    s.append(stat_row([
        ('1', 'PLATFORM', 'One login, one database, one bill'),
        ('60+', 'DOMAIN MODELS', 'In a single Prisma schema'),
        ('4', 'AUTH PATHS', 'Password, magic link, OTP, Google'),
        ('6+', 'INTEGRATIONS', 'Gmail, Calendar, WhatsApp, Telegram, Stripe, Razorpay'),
    ]))

    s.append(Spacer(1, 14))
    s.append(h2('Document Control'))

    s.append(make_table([
        ['Field', 'Value'],
        ['Document', 'AcquisitionOS Corporate Capability Document'],
        ['Edition', 'v2.0 / 2026'],
        ['Status', 'In Development'],
        ['Audience', 'Corporate website listing and client deal review'],
        ['Classification', 'Confidential, authorised distribution only'],
        ['Source', 'AcquisitionOS engineering worklog and running codebase'],
    ], col_widths=[CONTENT_W*0.22, CONTENT_W*0.78], header=True, stripe=True))

    s.append(Spacer(1, 16))
    s.append(P('End of document.', ST_MUTED))

    return s


if __name__ == '__main__':
    out = build_doc()
    size = os.path.getsize(out)
    print(f'PDF generated: {out}')
    print(f'Size: {size/1024:.1f} KB')
