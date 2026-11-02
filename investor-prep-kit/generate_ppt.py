#!/usr/bin/env python3
"""AcquisitionOS — Investor Presentation Generator"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
import os

OUT = "/home/z/my-project-develop/investor-prep-kit/AcquisitionOS_Presentation.pptx"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Colors
DARK = RGBColor(0x0f, 0x17, 0x2a)
BLUE = RGBColor(0x25, 0x63, 0xeb)
WHITE = RGBColor(0xff, 0xff, 0xff)
GREY = RGBColor(0x64, 0x74, 0x8b)
LIGHT = RGBColor(0xf1, 0xf5, 0xf9)
GREEN = RGBColor(0x16, 0xa3, 0x4a)
RED = RGBColor(0xdc, 0x26, 0x26)

def add_slide(bg=DARK):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    bg_shape = slide.shapes.add_shape(1, 0, 0, prs.slide_width, prs.slide_height)
    bg_shape.fill.solid()
    bg_shape.fill.fore_color.rgb = bg
    bg_shape.line.fill.background()
    return slide

def add_text(slide, text, left, top, width, height, size=18, color=WHITE, bold=False, align=PP_ALIGN.LEFT):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.alignment = align
    return txBox

def add_bullets(slide, items, left, top, width, height, size=14, color=WHITE):
    txBox = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = f"• {item}"
        p.font.size = Pt(size)
        p.font.color.rgb = color
        p.space_after = Pt(8)
    return txBox

# ═══════════════════════════════════════════════════════════════
# Slide 1: Title
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "AcquisitionOS", 1, 2, 11, 1.5, 48, WHITE, True, PP_ALIGN.CENTER)
add_text(slide, "AI-Powered Autonomous Client Acquisition System", 1, 3.8, 11, 0.8, 20, RGBColor(0x94, 0xa3, 0xb8), False, PP_ALIGN.CENTER)
add_text(slide, "Discover → Analyze → Contact → Close — Automatically", 1, 4.8, 11, 0.6, 14, BLUE, False, PP_ALIGN.CENTER)
add_text(slide, "Investor & Partner Presentation", 1, 6, 11, 0.5, 12, GREY, False, PP_ALIGN.CENTER)

# ═══════════════════════════════════════════════════════════════
# Slide 2: The Problem
# ═══════════════════════════════════════════════════════════════
slide = add_slide(LIGHT)
add_text(slide, "The Problem", 0.5, 0.5, 12, 1, 36, DARK, True)
add_text(slide, "Finding clients is manual, expensive, and fragmented", 0.5, 1.4, 12, 0.6, 18, GREY)

problems = [
    ("15+ hrs/week", "Agencies spend finding leads manually on Google Maps & LinkedIn"),
    ("$500-2000/mo", "Cost of Apollo + Outreach + ZoomInfo + CRM — too expensive for SMBs"),
    ("5-10 tools", "Stitched together with Zapier — breaks when APIs change"),
    ("$0 budget", "50M+ Indian SMBs spend nothing on sales tools because they can't afford it"),
]
for i, (stat, desc) in enumerate(problems):
    y = 2.5 + i * 1.1
    add_text(slide, stat, 1, y, 3, 0.8, 24, RED, True)
    add_text(slide, desc, 4.5, y, 8, 0.8, 14, DARK)

# ═══════════════════════════════════════════════════════════════
# Slide 3: The Solution
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "The Solution: AcquisitionOS", 0.5, 0.5, 12, 1, 36, WHITE, True)
add_text(slide, "One platform. The entire acquisition lifecycle. Autonomous.", 0.5, 1.4, 12, 0.6, 18, RGBColor(0x94, 0xa3, 0xb8))

add_text(slide, "You set the target:", 1, 2.5, 5, 0.5, 16, BLUE, True)
add_bullets(slide, [
    "Niche: 'Dentists in Mumbai'",
    "Budget: $5,000+ revenue potential",
    "Criteria: Bad website, no online booking",
], 1, 3, 5, 2, 14, WHITE)

add_text(slide, "Autopilot does the rest:", 7, 2.5, 5, 0.5, 16, GREEN, True)
add_bullets(slide, [
    "Discovers leads from Google Maps, LinkedIn",
    "Analyzes & scores each lead (0-100)",
    "Writes personalized outreach messages",
    "Sends via email/WhatsApp automatically",
    "Tracks replies → surfaces what needs you",
], 7, 3, 5, 3, 14, WHITE)

# ═══════════════════════════════════════════════════════════════
# Slide 4: How It Works
# ═══════════════════════════════════════════════════════════════
slide = add_slide(LIGHT)
add_text(slide, "How It Works — 4-Step Autonomous Pipeline", 0.5, 0.5, 12, 1, 32, DARK, True)

steps = [
    ("01", "AI Discovers", "Multi-source: Google Maps, LinkedIn, AI Search, JustDial, IndiaMART", BLUE),
    ("02", "AI Analyzes", "Scores: reply probability, conversion, urgency, revenue potential", RGBColor(0x8b, 0x5c, 0xf6)),
    ("03", "AI Contacts", "Personalized outreach sequences: email, WhatsApp, LinkedIn", GREEN),
    ("04", "You Close", "Replies & meetings flow into CRM. You focus on closing deals.", RGBColor(0xf5, 0x9e, 0x0b)),
]
for i, (num, title, desc, color) in enumerate(steps):
    x = 0.5 + i * 3.15
    # Number circle
    shape = slide.shapes.add_shape(1, Inches(x), Inches(2), Inches(2.5), Inches(2.5))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    add_text(slide, num, x+0.5, 2.3, 1.5, 0.8, 28, WHITE, True, PP_ALIGN.CENTER)
    add_text(slide, title, x+0.5, 3, 1.5, 0.5, 14, WHITE, True, PP_ALIGN.CENTER)
    # Description below
    add_text(slide, desc, x-0.2, 4.8, 3, 1.5, 11, DARK)

# ═══════════════════════════════════════════════════════════════
# Slide 5: Key Features
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "Key Features", 0.5, 0.5, 12, 1, 36, WHITE, True)

features = [
    ("AI Lead Discovery", "Multi-source, provenance-tracked"),
    ("Lead Intelligence", "4-dimension scoring + AI analysis"),
    ("Autopilot Engine", "Scheduled, autonomous, idempotent"),
    ("Outreach Sequences", "Multi-step, multi-channel campaigns"),
    ("CRM Command Center", "KPIs, funnel, pipeline, activities"),
    ("Sales Command Center", "Real-time dashboard, live data"),
    ("Business Intelligence", "Website research, SWOT, positioning"),
    ("Real-time Infrastructure", "EventBus + SSE + Redis pubsub"),
    ("Stripe + Razorpay", "Credit-based billing, dual providers"),
]
for i, (title, desc) in enumerate(features):
    col = i % 3
    row = i // 3
    x = 0.5 + col * 4.1
    y = 2 + row * 1.6
    add_text(slide, f"✓ {title}", x, y, 3.8, 0.5, 14, GREEN, True)
    add_text(slide, desc, x+0.3, y+0.5, 3.5, 0.5, 11, RGBColor(0x94, 0xa3, 0xb8))

# ═══════════════════════════════════════════════════════════════
# Slide 6: Real Production Data
# ═══════════════════════════════════════════════════════════════
slide = add_slide(LIGHT)
add_text(slide, "Real Production Data", 0.5, 0.5, 12, 1, 36, DARK, True)
add_text(slide, "Not projections. Not demo data. Real numbers from the live system.", 0.5, 1.4, 12, 0.5, 14, GREY)

stats = [
    ("536", "Leads Discovered", BLUE),
    ("101", "Leads Contacted", GREEN),
    ("13", "Autopilot Runs", RGBColor(0x8b, 0x5c, 0xf6)),
    ("9", "Outreach Messages Sent", RGBColor(0xf5, 0x9e, 0x0b)),
    ("1", "Business Profile", RGBColor(0xec, 0x48, 0x99)),
    ("43", "Users in System", GREY),
]
for i, (num, label, color) in enumerate(stats):
    col = i % 3
    row = i // 3
    x = 1 + col * 4
    y = 2.5 + row * 2
    # Stat card
    shape = slide.shapes.add_shape(1, Inches(x), Inches(y), Inches(3.5), Inches(1.5))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    add_text(slide, num, x+0.5, y+0.2, 2.5, 0.8, 36, WHITE, True, PP_ALIGN.CENTER)
    add_text(slide, label, x+0.5, y+1, 2.5, 0.4, 12, WHITE, False, PP_ALIGN.CENTER)

# Honest status
add_text(slide, "Honest status: 0 deals closed, $0 revenue, pre-customers. The product works — now we need customers.", 0.5, 6.5, 12, 0.5, 12, RED, True, PP_ALIGN.CENTER)

# ═══════════════════════════════════════════════════════════════
# Slide 7: Tech Stack
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "Technical Architecture", 0.5, 0.5, 12, 1, 36, WHITE, True)

stack = [
    ("Frontend", "Next.js 16, React 19, TypeScript, Tailwind, shadcn/Radix, Framer Motion, Recharts"),
    ("Backend", "Next.js API Routes (Node.js), Prisma 6 ORM, 136 data models"),
    ("Database", "SQLite (dev) → PostgreSQL (prod), PgBouncer pooling"),
    ("Real-time", "EventBus + SSE + Redis PubSub, 6 channels, last-event-id resumption"),
    ("Auth", "JWT (access+refresh), bcrypt 12 rounds, Google OAuth, OTP, Magic Link, RBAC (7 roles)"),
    ("Payments", "Stripe + Razorpay, credit-based billing, idempotent ledger"),
    ("AI", "Multi-provider: OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter"),
    ("Deployment", "Vercel serverless, 238 env vars, SOC2-ready architecture"),
]
for i, (layer, tech) in enumerate(stack):
    y = 1.8 + i * 0.65
    add_text(slide, layer, 0.5, y, 2.5, 0.5, 13, BLUE, True)
    add_text(slide, tech, 3, y, 9.5, 0.5, 12, WHITE)

# ═══════════════════════════════════════════════════════════════
# Slide 8: Competitor Landscape
# ═══════════════════════════════════════════════════════════════
slide = add_slide(LIGHT)
add_text(slide, "Competitor Landscape", 0.5, 0.5, 12, 1, 36, DARK, True)
add_text(slide, "Where we overlap, where we don't, where we win", 0.5, 1.4, 12, 0.5, 14, GREY)

comp = [
    ("HubSpot", "CRM + Marketing", "$20-3000/mo", "Better CRM, 1000+ integrations", "Autonomous discovery"),
    ("Apollo", "Data + Prospecting", "$49-149/user", "275M contacts, data quality", "Workflow automation"),
    ("Outreach", "Sales Engagement", "~$100/user", "Mature sequencing", "Discovery + analysis"),
    ("11x.ai", "AI SDR", "~$500+/mo", "Purpose-built AI, enterprise", "Price ($29 vs $500), India focus"),
    ("Clay", "Enrichment + Outreach", "$100-300+", "Deep enrichment", "Simpler, automated"),
    ("ZoomInfo", "Data Provider", "$200-400/user", "Massive B2B database", "Full pipeline, not just data"),
]
# Header row
add_text(slide, "Competitor", 0.5, 2.2, 2, 0.4, 11, DARK, True)
add_text(slide, "Category", 2.5, 2.2, 2.2, 0.4, 11, DARK, True)
add_text(slide, "Price", 4.7, 2.2, 1.8, 0.4, 11, DARK, True)
add_text(slide, "They Do Better", 6.5, 2.2, 3.5, 0.4, 11, DARK, True)
add_text(slide, "Our Edge", 10, 2.2, 3, 0.4, 11, DARK, True)

for i, (name, cat, price, better, edge) in enumerate(comp):
    y = 2.8 + i * 0.65
    add_text(slide, name, 0.5, y, 2, 0.4, 10, DARK, True)
    add_text(slide, cat, 2.5, y, 2.2, 0.4, 10, GREY)
    add_text(slide, price, 4.7, y, 1.8, 0.4, 10, RED)
    add_text(slide, better, 6.5, y, 3.5, 0.4, 10, GREY)
    add_text(slide, edge, 10, y, 3, 0.4, 10, GREEN)

# ═══════════════════════════════════════════════════════════════
# Slide 9: Pricing
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "Pricing — Credit-Based SaaS", 0.5, 0.5, 12, 1, 36, WHITE, True)
add_text(slide, "Pay for what you use. Not per seat.", 0.5, 1.4, 12, 0.5, 18, RGBColor(0x94, 0xa3, 0xb8))

plans = [
    ("Starter", "FREE", "50 credits", "1 niche\nBasic discovery\nLead scoring", RGBColor(0x64, 0x74, 0x8b)),
    ("Pro", "$29/mo", "750 credits", "5 niches\nAutopilot automation\nMulti-channel outreach\nCRM dashboard", BLUE),
    ("Elite", "$99/mo", "2,000 credits", "Unlimited niches\nBusiness intelligence\nSequence automation\nPriority support", GREEN),
    ("Enterprise", "Custom", "Custom", "Dedicated infrastructure\nCustom integrations\nSLA + white-label\nRBAC (7 roles)", RGBColor(0xec, 0x48, 0x99)),
]
for i, (name, price, credits, features, color) in enumerate(plans):
    x = 0.5 + i * 3.15
    # Plan card
    shape = slide.shapes.add_shape(1, Inches(x), Inches(2.5), Inches(3), Inches(4))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    add_text(slide, name, x+0.3, 2.7, 2.5, 0.5, 16, WHITE, True, PP_ALIGN.CENTER)
    add_text(slide, price, x+0.3, 3.2, 2.5, 0.6, 24, WHITE, True, PP_ALIGN.CENTER)
    add_text(slide, credits, x+0.3, 3.9, 2.5, 0.4, 12, WHITE, False, PP_ALIGN.CENTER)
    add_text(slide, features, x+0.3, 4.5, 2.5, 1.8, 10, WHITE)

# ═══════════════════════════════════════════════════════════════
# Slide 10: GTM Strategy
# ═══════════════════════════════════════════════════════════════
slide = add_slide(LIGHT)
add_text(slide, "Go-To-Market Strategy", 0.5, 0.5, 12, 1, 36, DARK, True)

add_text(slide, "Phase 1: India-first (Months 1-6)", 1, 2, 11, 0.5, 18, BLUE, True)
add_bullets(slide, [
    "Target: B2B agencies & SMBs (5-50 employees) in Mumbai/Bangalore/Delhi",
    "Channel: Product-led growth (free Starter plan → Pro upgrade)",
    "Acquisition: Content marketing (real discovery results), agency partnerships",
    "Goal: 100 paying customers, $5K MRR",
], 1, 2.5, 11, 2, 13, DARK)

add_text(slide, "Phase 2: Expand (Months 7-12)", 1, 4.5, 11, 0.5, 18, GREEN, True)
add_bullets(slide, [
    "Add WhatsApp & LinkedIn automation (most-requested features)",
    "Expand to Southeast Asia (same data source model)",
    "Annual contracts + enterprise tier activation",
    "Goal: 1,000 users, 200 paying, $20K MRR",
], 1, 5, 11, 2, 13, DARK)

# ═══════════════════════════════════════════════════════════════
# Slide 11: The Ask
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "The Ask", 0.5, 0.5, 12, 1, 36, WHITE, True)

add_text(slide, "$250K-500K", 1, 2, 11, 1, 48, BLUE, True, PP_ALIGN.CENTER)
add_text(slide, "for 15-20% equity (pre-money valuation $1.5M-2.5M)", 1, 3, 11, 0.5, 16, RGBColor(0x94, 0xa3, 0xb8), False, PP_ALIGN.CENTER)

use = [
    ("Engineering (2 hires, 12mo)", "$180K"),
    ("Cloud infrastructure", "$24K"),
    ("Marketing & paid acquisition", "$60K"),
    ("Legal & compliance", "$20K"),
    ("Operational buffer", "$66K"),
]
for i, (item, amount) in enumerate(use):
    y = 4 + i * 0.5
    add_text(slide, item, 2, y, 6, 0.4, 13, WHITE)
    add_text(slide, amount, 8, y, 3, 0.4, 13, GREEN, True)

add_text(slide, "18-month runway → $50K MRR target → Series A ready", 1, 6.8, 11, 0.4, 14, GREEN, True, PP_ALIGN.CENTER)

# ═══════════════════════════════════════════════════════════════
# Slide 12: Honest Status & Roadmap
# ═══════════════════════════════════════════════════════════════
slide = add_slide(LIGHT)
add_text(slide, "Honest Status & Roadmap", 0.5, 0.5, 12, 1, 36, DARK, True)

add_text(slide, "What Works Today ✅", 0.5, 1.8, 5.5, 0.5, 16, GREEN, True)
add_bullets(slide, [
    "AI lead discovery (536 leads)",
    "Lead scoring & analysis",
    "Autopilot engine (13 runs)",
    "Email outreach (Gmail SMTP)",
    "Auth (OAuth, OTP, magic link)",
    "Admin CRM + Sales dashboard",
    "Stripe code (needs activation)",
    "Real-time infrastructure",
], 0.5, 2.3, 5.5, 3, 12, DARK)

add_text(slide, "What's Next 🔜", 7, 1.8, 5.5, 0.5, 16, RGBColor(0xf5, 0x9e, 0x0b), True)
add_bullets(slide, [
    "Stripe activation + first paying customers",
    "WhatsApp outbound automation",
    "LinkedIn outreach automation",
    "ML-trained scoring (replace rules)",
    "CRM integrations (HubSpot sync)",
    "PostgreSQL migration for scale",
    "SOC 2 compliance for enterprise",
    "Mobile-optimized dashboard",
], 7, 2.3, 5.5, 3, 12, DARK)

add_text(slide, "Stage: Functional MVP, internal testing, pre-revenue, pre-customers", 0.5, 6, 12, 0.5, 13, RED, True, PP_ALIGN.CENTER)

# ═══════════════════════════════════════════════════════════════
# Slide 13: Closing
# ═══════════════════════════════════════════════════════════════
slide = add_slide(DARK)
add_text(slide, "AcquisitionOS", 1, 2.5, 11, 1, 48, WHITE, True, PP_ALIGN.CENTER)
add_text(slide, "The autonomous client acquisition engine.", 1, 3.8, 11, 0.8, 22, BLUE, False, PP_ALIGN.CENTER)
add_text(slide, "Stop chasing leads. Start acquiring clients.", 1, 4.8, 11, 0.6, 18, RGBColor(0x94, 0xa3, 0xb8), False, PP_ALIGN.CENTER)
add_text(slide, "Thank you", 1, 6, 11, 0.5, 14, GREY, False, PP_ALIGN.CENTER)

# Save
prs.save(OUT)
print(f"✅ Presentation saved: {OUT}")
print(f"   Slides: {len(prs.slides)}")
print(f"   Size: {os.path.getsize(OUT)//1024} KB")
