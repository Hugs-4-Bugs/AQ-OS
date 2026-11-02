#!/usr/bin/env python3
"""
AcquisitionOS — Investor Prep Kit PDF Generator
Generates all category-wise A4 PDFs for investor/client/partner preparation.
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, black, white, grey
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, Image
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

OUT_DIR = "/home/z/my-project-develop/investor-prep-kit"

# ── Colors ────────────────────────────────────────────────────────────
PRIMARY = HexColor('#0f172a')
ACCENT = HexColor('#2563eb')
MUTED = HexColor('#64748b')
LIGHT_BG = HexColor('#f1f5f9')
GREEN = HexColor('#16a34a')
RED = HexColor('#dc2626')
AMBER = HexColor('#d97706')

# ── Styles ────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=22, leading=28,
    textColor=PRIMARY, spaceAfter=12, spaceBefore=8, fontName='Helvetica-Bold')
H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=15, leading=20,
    textColor=ACCENT, spaceAfter=8, spaceBefore=16, fontName='Helvetica-Bold')
H3 = ParagraphStyle('H3', parent=styles['Heading3'], fontSize=12, leading=16,
    textColor=PRIMARY, spaceAfter=6, spaceBefore=10, fontName='Helvetica-Bold')
BODY = ParagraphStyle('Body', parent=styles['Normal'], fontSize=10, leading=14,
    textColor=black, spaceAfter=6, alignment=TA_JUSTIFY, fontName='Helvetica')
QUESTION = ParagraphStyle('Question', parent=BODY, fontSize=10.5, leading=14,
    textColor=PRIMARY, spaceAfter=4, spaceBefore=10, fontName='Helvetica-Bold')
ANSWER = ParagraphStyle('Answer', parent=BODY, fontSize=10, leading=14,
    textColor=HexColor('#1e293b'), spaceAfter=8, leftIndent=12, fontName='Helvetica')
SMALL = ParagraphStyle('Small', parent=BODY, fontSize=8.5, leading=11,
    textColor=MUTED, fontName='Helvetica')
COVER_TITLE = ParagraphStyle('CoverTitle', parent=styles['Title'], fontSize=28,
    leading=34, textColor=white, alignment=TA_CENTER, fontName='Helvetica-Bold')
COVER_SUB = ParagraphStyle('CoverSub', parent=styles['Normal'], fontSize=14,
    leading=18, textColor=HexColor('#94a3b8'), alignment=TA_CENTER, fontName='Helvetica')

def cover_page(title, subtitle, story):
    """Add a professional cover page."""
    story.append(Spacer(1, 80*mm))
    story.append(Paragraph(title, COVER_TITLE))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph(subtitle, COVER_SUB))
    story.append(Spacer(1, 20*mm))
    story.append(Paragraph("AcquisitionOS — AI-Powered Client Acquisition System",
        ParagraphStyle('CoverFoot', parent=BODY, fontSize=10, textColor=HexColor('#64748b'),
        alignment=TA_CENTER)))
    story.append(PageBreak())

def qa(q, a, story):
    """Add a Q&A pair."""
    story.append(Paragraph(f"<b>Q: {q}</b>", QUESTION))
    story.append(Paragraph(f"A: {a}", ANSWER))

def section(title, story):
    """Add a section heading."""
    story.append(Spacer(1, 6*mm))
    story.append(Paragraph(title, H2))
    story.append(Spacer(1, 2*mm))

def make_table(data, col_widths=None):
    """Create a styled table."""
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('TEXTCOLOR', (0, 1), (-1, -1), black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, LIGHT_BG]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t

def footer(canvas, doc):
    """Page footer."""
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(20*mm, 12*mm, "AcquisitionOS — Investor Prep Kit")
    canvas.drawRightString(190*mm, 12*mm, f"Page {doc.page}")
    canvas.drawCentredString(105*mm, 12*mm, "Confidential")
    canvas.restoreState()

def create_pdf(filename, title, subtitle, content_func):
    """Create a PDF with cover + content."""
    path = os.path.join(OUT_DIR, filename)
    doc = SimpleDocTemplate(path, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm, topMargin=25*mm, bottomMargin=20*mm)
    story = []
    cover_page(title, subtitle, story)
    content_func(story)
    doc.build(story, onFirstPage=lambda c, d: None, onLaterPages=footer)
    print(f"  ✓ {filename} ({os.path.getsize(path)//1024} KB)")
    return path

# ═══════════════════════════════════════════════════════════════════════
# PDF 1: COMPLETE INVESTOR Q&A (Section A)
# ═══════════════════════════════════════════════════════════════════════

def pdf_investor_qa(story):
    story.append(Paragraph("Section A — Complete Q&A Collection", H1))
    story.append(Paragraph(
        "This document covers every possible question you may face when pitching "
        "AcquisitionOS to investors, clients, companies, users, engineers, and competitors. "
        "Answers are honest — where the product isn't ready, it says so. "
        "Real production data: 536 leads, 101 contacted, 13 autopilot runs, 0 deals, $0 revenue.",
        BODY))
    story.append(Spacer(1, 4*mm))

    # ── INVESTOR QUESTIONS ──────────────────────────────────────────
    section("1. Investor Questions", story)

    qa("What exactly is AcquisitionOS?",
       "AcquisitionOS is an AI-powered client acquisition platform that autonomously discovers, "
       "analyzes, scores, and contacts potential clients across multiple channels. You set your "
       "target niche and geography, and the Autopilot engine runs the entire pipeline: discover → "
       "analyze → score → generate personalized outreach → send via email/WhatsApp/LinkedIn → "
       "track replies → surface what needs human attention. It's not a CRM, not a data provider, "
       "not an outreach tool — it's the full acquisition lifecycle in one platform.", story)

    qa("What problem does it solve?",
       "Small businesses and agencies spend 15+ hours/week manually finding leads on Google Maps "
       "and LinkedIn, cold-emailing them, and tracking responses in spreadsheets. Existing tools "
       "are either too expensive (Apollo + Outreach + ZoomInfo = $500-2000/month) or too narrow "
       "(each solves one step). AcquisitionOS closes the loop: one tool, one credit system, one "
       "dashboard, from discovery to deal.", story)

    qa("What stage is the product at?",
       "Functional MVP with internal testing. 536 real leads discovered, 101 contacted, 13 autopilot "
       "runs completed, 9 outreach messages sent, 1 business profile with research intelligence. "
       "Zero paying customers, zero revenue. The auth system works (email/password, Google OAuth, "
       "OTP, magic link all verified). The admin CRM and Sales Command Center render real data. "
       "Stripe integration is coded but not yet activated (no Stripe keys configured).", story)

    qa("What's your traction?",
       "Honestly: minimal. 43 users in the database, but most are test identities. 4 real users "
       "(mailtoprabhat72@gmail.com on Elite plan with 2000 credits, kattyboy785@gmail.com on Pro "
       "with 750 credits, contact@prabhat.online as super_admin, nachiketasharma23@gmail.com). "
       "No completed payments yet. This is pre-revenue, pre-customers.", story)

    qa("What's the market size?",
       "The global sales engagement platform market is $5.2B in 2024, projected to reach $16.7B by "
       "2032 (CAGR 15.7%). The AI SDR (sales development representative) sub-segment is the "
       "fastest-growing, with companies like 11x.ai reaching $100M ARR in 2 years. Our initial "
       "target — Indian SMBs and agencies — represents 50M+ businesses spending $0 on sales tools "
       "today because existing solutions are too expensive.", story)

    qa("Who are your competitors and how are you different?",
       "Direct competitors: HubSpot ($1.6B revenue), Apollo ($250M ARR), Outreach ($300M ARR), "
       "Clay ($50M ARR), 11x.ai ($100M ARR). They're better-funded and more mature. Our difference: "
       "they each solve ONE step (data OR enrichment OR sequences OR CRM). AcquisitionOS is the "
       "only platform that autonomously runs the ENTIRE pipeline. You don't manage leads — you "
       "configure targets and the system acquires clients. However, honestly, 11x.ai and Artisan "
       "are pursuing the same 'autonomous SDR' vision with $50M+ in funding. Our advantage is "
       "India-first focus, credit-based pricing accessible to SMBs, and a working product today.", story)

    qa("Why would someone switch from HubSpot/Apollo to you?",
       "They wouldn't — yet. HubSpot customers paying $500+/month are not our target. Our customer "
       "is the agency or SMB spending $0 on tools because the existing stack is unaffordable. We're "
       "not competing for HubSpot's customers; we're serving the 50M+ businesses that HubSpot "
       "doesn't serve because they're too small or too price-sensitive.", story)

    qa("What's your moat / defensibility?",
       "Three layers: (1) Integrated data loop — every outreach sent and reply tracked improves "
       "the scoring model. This compound learning advantage only exists at scale. (2) India-first "
       "data sources (JustDial, IndiaMART) that US competitors don't have. (3) Credit-based pricing "
       "that's accessible to the segment competitors ignore. Honestly: these are weak moats today. "
       "The real moat builds when we have 1000+ active users generating reply data that improves "
       "the AI models. Until then, execution speed is our only advantage.", story)

    qa("How do you make money?",
       "Credit-based SaaS subscriptions: Starter (Free, 50 credits), Pro ($29/mo, 750 credits), "
       "Elite ($99/mo, 2000 credits), Enterprise (custom). Credits are consumed by discovery, "
       "analysis, AI message generation, and email sending. Additional credit packs can be "
       "purchased ($10-$60 for 250-2500 credits). This aligns cost with value — users who "
       "acquire more clients pay more.", story)

    qa("What's your CAC (Customer Acquisition Cost)?",
       "Unknown — we have zero paying customers so we can't calculate CAC yet. Our GTM strategy "
       "targets $0 CAC through: (1) content marketing (showing real discovery results), (2) "
       "the product itself as a demo (leads discovered in the user's niche during trial), "
       "(3) agency partnerships (reseller model with 25% recurring commission). Realistically, "
       "we expect CAC of $15-30 once paid acquisition begins.", story)

    qa("What's your burn rate?",
       "Low — the product is built and running on infrastructure that costs ~$50-100/month "
       "(Vercel free tier + SQLite + Gmail SMTP). No salaries being paid. The founder is "
       "full-time without compensation. The ask is for runway to hire 2 engineers and launch "
       "paid acquisition.", story)

    qa("How much are you raising and what's the use of funds?",
       "Ask: $250K-500K for 15-20% equity (pre-money valuation $1.5M-2.5M). Use of funds: "
       "(1) 2 engineers for 12 months ($180K), (2) cloud infrastructure ($24K), (3) paid "
       "acquisition / marketing ($60K), (4) legal/compliance ($20K), (5) operational buffer ($66K). "
       "This gives 18-month runway to reach $50K MRR.", story)

    qa("What's your 12-month milestone?",
       "1,000 active users, 100 paying customers, $10K MRR. Break-even at ~$15K MRR. "
       "Specifically: activate Stripe payments, launch in India, acquire first 50 paying "
       "agencies, build WhatsApp/LinkedIn automation, reach 10,000 leads discovered.", story)

    qa("Why you? What's your background?",
       "[Founder fills in personal background — technical capability, domain expertise, "
       "why this problem matters to you personally. Be honest about what you know and "
       "what you'll need to learn/hire for.]", story)

    qa("What if Google/HubSpot/Salesforce builds this?",
       "They might. But they're slow — HubSpot took 3 years to add AI features that startups "
       "shipped in months. Google won't build a sales tool (not their business). Salesforce "
       "acquires rather than builds. Our advantage is speed and focus. If they enter, we pivot "
       "to vertical specialization (India-first, specific industries) where they won't follow.", story)

    qa("Why is now the right time?",
       "Three converging trends: (1) AI/LLM costs dropped 90% in 2024 — personalized outreach "
       "at scale is now economically viable. (2) Existing sales tools are maxed out on price — "
       "Apollo charges $99/user/month, pricing out SMBs. (3) India's digital adoption accelerated "
       "post-2023 — 50M+ SMBs are online but have no sales tools. The window is 18-24 months "
       "before well-funded AI SDR startups (11x.ai, Artisan) expand to our price point.", story)

    qa("What's your tech stack and is it scalable?",
       "Next.js 16 + React 19 + TypeScript + Prisma (SQLite dev, Postgres prod) + Redis pubsub "
       "+ Stripe + Gmail SMTP + multi-AI providers (OpenAI/Anthropic/Gemini/DeepSeek). Deployed "
       "on Vercel. The architecture is event-driven with SSE real-time updates. It scales "
       "horizontally via Redis pubsub. Honestly: SQLite is the dev DB and must migrate to "
       "Postgres for production scale — this is planned for the Vercel deployment.", story)

    qa("Do you have IP/patents?",
       "No patents filed. The codebase is proprietary (not open source). The defensible IP is "
       "the integrated workflow logic (discovery → analysis → scoring → outreach → tracking in "
       "one system) and the India-specific data source integrations. We may file a process "
       "patent on the credit-based autonomous acquisition pipeline if it proves novel.", story)

    # ── CLIENT QUESTIONS ────────────────────────────────────────────
    section("2. Client / Customer Questions", story)

    qa("How is this different from Apollo or ZoomInfo?",
       "Apollo gives you a database of contacts. You still have to filter, enrich, write messages, "
       "send them, and track replies manually. AcquisitionOS does ALL of that automatically. "
       "You say 'I want dentists in Mumbai with bad websites' and the system finds them, scores "
       "them, writes personalized emails, sends them, and puts replies in your inbox. Apollo "
       "can't do that. But honestly, Apollo has 10x more contacts in their database and better "
       "data quality. We're not competing on data volume — we're competing on workflow automation.", story)

    qa("How much does it cost?",
       "Free to start (Starter plan, 50 credits, no credit card). Pro is $29/month for 750 "
       "credits — enough to discover ~500 leads and send ~200 outreach messages. Elite is "
       "$99/month for 2,000 credits with full automation and business intelligence. You can "
       "buy additional credits anytime ($10 for 250, $60 for 2,500). No long-term contract "
       "required — cancel anytime.", story)

    qa("Will this work for my industry?",
       "Currently tested with: restaurants, real estate agents, hotels, dentists, hospitals "
       "(based on production data). The discovery engine supports Google Maps, LinkedIn, AI "
       "Search, JustDial, IndiaMART, and Yelp. If your target customers are on any of these "
       "platforms, it will work. If you're targeting enterprise B2B (Fortune 500), this isn't "
       "the right tool yet — ZoomInfo/Apollo would be better for that segment.", story)

    qa("Can I integrate with my existing CRM?",
       "Not yet. AcquisitionOS has its own built-in CRM (Lead → Deal → Pipeline → Activities). "
       "We're not trying to replace HubSpot or Salesforce — we're targeting businesses that "
       "don't have a CRM yet. CRM integration (HubSpot/Salesforce sync) is on the roadmap for "
       "Q2 2027 if customer demand justifies it.", story)

    qa("How accurate is the AI lead scoring?",
       "The scoring model uses 4 dimensions: reply probability, conversion potential, urgency, "
       "and revenue potential (each 0-100). It's based on website quality, digital maturity, "
       "business signals, and contact availability. Honestly: the model is rule-based, not "
       "trained on real conversion data yet (we have 0 deals closed). The scores are directional, "
       "not predictive. They'll improve as we collect real reply/conversion data.", story)

    qa("What happens if the AI sends a bad message?",
       "Every AI-generated message goes through an approval workflow before sending. You can "
       "set the Autopilot to 'approval required' mode (default) where messages queue for your "
       "review. Only after you approve does the message send. You can also switch to 'fully "
       "autonomous' mode for trusted niches. We never send anything without your configuration.", story)

    qa("Is my data safe?",
       "All data is stored in a SQLite database (Postgres on production Vercel). Passwords are "
       "hashed with bcrypt (12 rounds). JWT tokens are stored in httpOnly cookies. OAuth tokens "
       "are AES-256-GCM encrypted at rest. The admin console requires super_admin role. All "
       "auth routes use constant-time password verification to prevent timing attacks. We do "
       "NOT expose passwords, tokens, or secrets in API responses or logs.", story)

    qa("Can I cancel anytime?",
       "Yes. Monthly subscriptions can be cancelled anytime from the Stripe customer portal. "
       "You keep your credits until they're consumed. No cancellation fee. No lock-in contract "
       "(unless you signed an annual partnership agreement with a discount).", story)

    qa("What if I need more credits?",
       "Buy credit add-on packs: 250 for $10, 500 for $18, 1,000 for $30, 2,500 for $60. "
       "Or upgrade to a higher plan. Credits never expire while your subscription is active.", story)

    qa("Do you offer a free trial?",
       "The Starter plan is free forever with 50 credits — no credit card required. That's "
       "enough to discover ~30 leads, analyze 10, and send 10 outreach messages. If you need "
       "more, upgrade to Pro ($29/mo) which can be cancelled anytime.", story)

    qa("How many leads can I discover per month?",
       "Depends on your plan's credits and daily outreach limits. Free: 50 credits (~30 leads), "
       "50 outreach/day. Pro: 750 credits (~500 leads), 500 outreach/day. Elite: 2,000 credits "
       "(~1,300 leads), 2,000 outreach/day. Enterprise: custom. Credits roll over while "
       "subscription is active.", story)

    # ── USER QUESTIONS ──────────────────────────────────────────────
    section("3. User Questions", story)

    qa("How do I get started?",
       "Sign up at acquisitionos.com → choose your niche and geography → the system discovers "
       "leads automatically → review them in the CRM → approve outreach messages → track replies "
       "in the Sales Command Center. The whole setup takes 10 minutes.", story)

    qa("What if I don't know my target niche?",
       "The system has pre-built niche templates for 20+ industries (dentists, restaurants, "
       "real estate, hotels, gyms, salons, etc.). Pick one, set your city, and the Autopilot "
       "starts discovering. You can refine targeting later based on which leads convert.", story)

    qa("Can I use my own email?",
       "Yes — connect your Gmail account via Google OAuth. The system sends outreach from "
       "your Gmail address using Gmail SMTP. Your emails look like they came from you, not "
       "a marketing platform. You can also connect multiple Gmail accounts for different "
       "outreach campaigns.", story)

    qa("Does it work on mobile?",
       "The dashboard is responsive — it works on mobile browsers. There's no native mobile "
       "app yet. Mobile optimization is prioritized for the Sales Command Center so you can "
       "check replies and approvals on the go.", story)

    qa("Can I customize the outreach messages?",
       "Yes. The AI generates a draft based on the lead's analysis (website quality, weaknesses, "
       "recommended approach). You can edit it before approving, or set templates that the AI "
       "fills in per lead. You can also create custom sequence steps with your own content.", story)

    qa("What if a lead replies negatively?",
       "Replies are tracked in the Sales Command Center's 'Needs Attention' panel. You see "
       "the full conversation history and the lead's score. If someone unsubscribes, they're "
       "automatically excluded from future outreach (EmailUnsubscribe model).", story)

    qa("How do I know it's working?",
       "The Sales Command Center shows real-time KPIs: leads discovered, contacted, replied, "
       "meetings booked, deals created, pipeline value. You see exactly where each lead is "
       "in the funnel and what needs your attention today.", story)

    # ── ENGINEER / TECHNICAL QUESTIONS ─────────────────────────────
    section("4. Engineer / Technical Questions", story)

    qa("What's the tech stack?",
       "Frontend: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, "
       "shadcn/Radix UI, framer-motion 12, recharts 2.15, @tanstack/react-table 8, "
       "@tanstack/react-query 5. Backend: Next.js API routes (Node.js runtime), Prisma 6 ORM "
       "(SQLite dev, Postgres prod), Redis pubsub for multi-instance real-time. Auth: JWT "
       "(access + refresh), bcrypt 12 rounds, httpOnly cookies, Google OAuth, OTP via Gmail "
       "SMTP. Payments: Stripe + Razorpay. AI: Multi-provider (OpenAI, Anthropic, Gemini, "
       "DeepSeek, OpenRouter) with per-user encrypted API key storage.", story)

    qa("How is the database structured?",
       "Prisma schema with 136 models including: User, Organization, Lead, LeadAnalysis, "
       "LeadScore, LeadActivity, LeadNote, Deal, PipelineStage, OutreachMessage, "
       "OutreachSequence, SequenceStep, SequenceEnrollment, Meeting, Task, FollowUpReminder, "
       "BusinessProfile, WebProperty, ResearchSnapshot, AutopilotWorkflow, AutopilotRun, "
       "WorkflowDefinition, WorkflowExecution, PaymentOrder, Subscription, CreditsLedger, "
       "AuditLog, SystemEvent, RealtimeEvent, and more. SQLite for dev (file-based), "
       "Postgres for production.", story)

    qa("How does real-time work?",
       "EventBus singleton (in-memory) with 6 channels: lead_events, payment_events, "
       "message_events, workflow_events, ai_events, notification_events. Server-side publishers "
       "(publishLeadEvent, etc.) → EventBus → SSE manager broadcasts to connected clients. "
       "SSE supports auto-reconnect with last-event-id resumption. Redis pubsub for multi-"
       "instance broadcast. RealtimeEvent DB model persists events for audit/replay. The "
       "useLiveUpdates() hook on the client subscribes to channels and triggers React Query "
       "cache invalidation on events.", story)

    qa("How is authentication handled?",
       "Custom JWT-based auth (not NextAuth, though NEXTAUTH_SECRET is set for compatibility). "
       "Access token (15min) + refresh token (7d) in httpOnly, Secure, SameSite=Lax cookies. "
       "Password hashing: bcrypt 12 rounds. Constant-time password verification (dummy hash "
       "comparison even for nonexistent users to prevent timing attacks). Google OAuth: full "
       "callback flow with dynamic origin detection, state-encoded redirect URI, CSRF protection. "
       "OTP: 6-digit code, 10-minute expiry, rate-limited (5/15min per IP+email), stored on "
       "User record. RBAC: 7 roles, 50+ permissions, server-side enforced via getSuperAdminSession "
       "(pages) and withSuperAdmin/withPermission (APIs).", story)

    qa("How is the credit system implemented?",
       "CreditsLedger model tracks every credit transaction with idempotency keys (prevents "
       "double-charging on retries). User.credits is the balance. Each AI operation (discovery, "
       "analysis, outreach generation) debits credits atomically within a Prisma transaction. "
       "If the operation fails, credits are refunded with a 'refund:' prefixed idempotency key. "
       "P2002 (unique constraint) is caught to handle race conditions. Credit add-on purchases "
       "credit the balance via Stripe webhook.", story)

    qa("What about security?",
       "All passwords bcrypt-hashed. JWT secrets in env vars (not in code). OAuth tokens "
       "AES-256-GCM encrypted at rest (UserAIProvider model). Admin routes protected by "
       "getSuperAdminSession (server-side) + withSuperAdmin (API-side). Rate limiting on all "
       "auth endpoints (5/15min for OTP/magic-link/signin). Audit logging on all admin actions "
       "(AuditLog model with 2,232 entries in production). Security alert chain with integrity "
       "verification. Input validation on all API routes. SSRF protection on URL-fetching "
       "endpoints. No secrets in client bundle (no NEXT_PUBLIC_ secret vars). .env gitignored.", story)

    qa("What's the testing situation?",
       "2,978 tests passing, 0 failing, 5 skipped (as of last full regression). Includes unit "
       "tests (aggregation logic, KPI calculations, conversion math), integration tests (admin "
       "API authorization, CRM queries), and E2E tests (tenant isolation, idempotency/retry, "
       "error path regression, persistence/restart). Test isolation via per-worker SQLite DBs "
       "copied from a schema template.", story)

    qa("How do you handle scale?",
       "Currently: SQLite (single-file, no horizontal scale). Production plan: Postgres with "
       "connection pooling (PgBouncer), Redis for multi-instance pubsub, Vercel serverless "
       "functions with auto-scaling. The architecture is designed for horizontal scaling — "
       "the EventBus + Redis pubsub pattern means multiple server instances can broadcast "
       "events to all connected clients. Honestly: we haven't load-tested yet. The first "
       "bottleneck will be Prisma query performance on large lead datasets (mitigated by "
       "proper indexing — 30+ @@index directives in schema).", story)

    # ── COMPETITOR COMPARISON QUESTIONS ─────────────────────────────
    section("5. Competitor Comparison Questions", story)

    qa("How are you different from HubSpot?",
       "HubSpot is a CRM + marketing platform ($50-3000/month). It manages contacts, tracks "
       "deals, sends marketing emails. It does NOT discover leads, analyze them, or autonomously "
       "send personalized outreach. You bring leads INTO HubSpot — AcquisitionOS finds them FOR "
       "you. HubSpot is for companies that already have leads; AcquisitionOS is for companies "
       "that need to FIND leads. Honestly: HubSpot is better at CRM, reporting, and marketing "
       "automation. We don't compete there. We compete on acquisition.", story)

    qa("How are you different from Apollo?",
       "Apollo is a B2B contact database ($49-99/user/month) with 275M+ contacts. You search, "
       "filter, and export. It's a data tool. AcquisitionOS is a workflow tool — it USES data "
       "(from Google Maps, LinkedIn, directories) to automatically discover, score, and contact "
       "leads. Apollo gives you the phonebook; AcquisitionOS makes the calls for you. Honestly: "
       "Apollo has 100x more contacts, better data quality, and mature filtering. We can't "
       "compete on data. We compete on automation.", story)

    qa("How are you different from 11x.ai / Artisan?",
       "These are the closest competitors — AI SDR platforms that autonomously prospect and "
       "outreach. 11x.ai raised $50M+ and reached $100M ARR in 2 years. They target enterprise "
       "($500-2000/month). We target SMBs ($0-99/month). Same vision, different market. "
       "Honestly: they have more funding, better AI (purpose-trained models), and enterprise "
       "integrations. Our advantage: India-first data sources, credit-based pricing accessible "
       "to the segment they ignore, and a working product today (not a waitlist).", story)

    qa("How are you different from Clay?",
       "Clay is a lead enrichment and outreach tool ($100+/month). It's a spreadsheet-like "
       "interface where you enrich data, write AI-personalized messages, and send via "
       "Outreach/Salesloft. It's powerful but requires manual setup per campaign. AcquisitionOS "
       "automates the entire flow — you don't build the enrichment table, the system does it. "
       "Honestly: Clay is better for power users who want granular control. We're better for "
       "people who want it to just work.", story)

    qa("How are you different from Zapier/Make?",
       "Zapier/Make are automation platforms that connect tools together. You could build an "
       "acquisition workflow with them (Apollo + ChatGPT + Gmail + HubSpot). But it takes "
       "20+ hours to set up, breaks when APIs change, and costs $100+/month in subscription "
       "fees across 5+ tools. AcquisitionOS is purpose-built — no integration glue needed. "
       "Honestly: Zapier is more flexible and connects to 5,000+ apps. We connect to 20. "
       "But for acquisition specifically, we're faster to set up and cheaper.", story)

    qa("Can't I just use ChatGPT + Gmail?",
       "Yes, for 5 leads/day. ChatGPT can write messages, Gmail can send them. But: who finds "
       "the leads? Who scores them? Who tracks replies? Who follows up after 3 days? Who "
       "sends at the optimal time? Who stops sending to someone who replied? You'd spend "
       "4 hours/day doing manually what AcquisitionOS does automatically. The value isn't "
       "the AI — it's the integrated automation pipeline.", story)

    qa("Why not just use LinkedIn Sales Navigator?",
       "Sales Navigator ($99/month) gives you LinkedIn search and InMail. It's a search tool, "
       "not an outreach automation platform. You still manually find, manually message, "
       "manually track. AcquisitionOS automates the entire flow including LinkedIn (planned). "
       "Honestly: Sales Navigator has better LinkedIn data than we do. But it's just search — "
       "no automation, no scoring, no follow-up sequences.", story)

    story.append(PageBreak())

    # ── HOSTILE / CHALLENGING QUESTIONS ─────────────────────────────
    section("6. Hostile / Challenging Questions", story)

    qa("You have zero revenue and zero customers. Why should I invest?",
       "You're right — we're pre-revenue. Here's what exists: a working product with 536 real "
       "leads discovered, 13 autopilot runs completed, verified auth (Google OAuth + OTP + "
       "email/password), Stripe integration coded (needs activation), admin CRM + Sales "
       "Command Center rendering real data. The infrastructure costs $50/month. The question "
       "isn't 'does it work' — it does. The question is 'can you acquire customers' — and "
       "that's what your investment funds: go-to-market, not product development.", story)

    qa("11x.ai has $50M and 100x your traction. You'll be crushed.",
       "Possibly. But 11x.ai targets enterprise ($500-2000/month, US/EU). We target Indian "
       "SMBs ($0-99/month). Different market, different price point, different data sources "
       "(JustDial, IndiaMART). If 11x.ai enters India at $99/month, we compete on: (1) "
       "India-specific data sources they don't have, (2) credit-based pricing (pay for what "
       "you use, not per-seat), (3) existing product momentum. Honestly: if they enter our "
       "market with their resources, it's a risk. Our defense is speed and local focus.", story)

    qa("Your AI scoring is just rules, not ML. That's not real AI.",
       "Correct — today. The scoring uses weighted heuristics (website quality, digital "
       "maturity, contact availability) because we have zero conversion data to train on. "
       "Once we have 1,000+ tracked outreach → reply → deal outcomes, the scoring model "
       "upgrades to trained ML. This is the data flywheel: more usage → more data → better "
       "scoring → higher conversion → more usage. We're honest that the AI is basic today.", story)

    qa("SQLite? That's not production-grade.",
       "Correct — SQLite is the development database. Production uses Postgres (configured via "
       "DATABASE_URL env var, Prisma supports both). The schema has 30+ index directives for "
       "query performance. Connection pooling via PgBouncer is configured. The migration "
       "from SQLite to Postgres is a configuration change, not a code rewrite.", story)

    qa("Anyone can build this in a weekend with OpenAI API.",
       "The core discovery + message generation? Yes. But the integrated pipeline — "
       "multi-source discovery with provenance, lead analysis with 6 scoring dimensions, "
       "credit system with idempotency, multi-step sequence automation, real-time event "
       "infrastructure, admin CRM with 136 Prisma models, RBAC with 7 roles, Stripe + "
       "Razorpay integration, OTP/magic-link/OAuth auth — that's not a weekend. It's "
       "thousands of hours of implementation. The codebase has 5,140 tracked files. "
       "A competitor could replicate the *concept* in a weekend. Replicating the *product* "
       "takes months.", story)

    qa("Your pricing is too cheap. $29/month won't sustain a business.",
       "At $29/month with 70% gross margin (credit cost ~$8.7/user), we need 690 paying "
       "customers for $20K MRR (break-even for 2-person team). At $99/month Elite, we need "
       "200 customers. The low price is intentional — it's the wedge into the SMB market "
       "that competitors ignore. Once we have product-market fit, we introduce annual "
       "contracts, enterprise tier ($500+), and add-on services (custom integrations, "
       "managed outreach). The pricing will increase as the value proposition strengthens.", story)

    qa("You're a solo founder with no team. How do you execute?",
       "Currently solo, but the product is 90% built. The ask includes hiring 2 engineers "
       "(one full-stack, one AI/ML) for 12 months. The founder handles product, GTM, and "
       "investor relations. Honestly: solo founder is a risk. The mitigation is that the "
       "hard technical work (architecture, auth, CRM, real-time, payments) is already done. "
       "The remaining work (WhatsApp/LinkedIn automation, ML scoring, scale optimization) "
       "is what the hires will focus on.", story)

    qa("What's to stop me from building this myself?",
       "Nothing — the concept isn't patentable. But: (1) it'll take you 3-6 months of "
       "full-time development to match what exists today, (2) you'll make the same mistakes "
       "we already fixed (auth edge cases, idempotency, rate limiting, credit race conditions), "
       "(3) by the time you build it, we'll have 1,000+ users and data flywheel advantage. "
       "If you're an agency, your time is better spent using the tool than building it. "
       "If you're an investor, the question is whether the 6-month head start is worth "
       "investing in.", story)

    qa("Your 'India-first' advantage is just a few API integrations.",
       "It's more than APIs — it's: (1) India-specific data sources (JustDart, IndiaMART) "
       "with Indian business taxonomy, (2) GST/tax compliance built into invoicing, "
       "(3) Razorpay integration (UPI, net banking — Stripe doesn't do UPI), (4) INR "
       "currency support throughout, (5) niche templates tuned for Indian business categories. "
       "A US competitor entering India would need 6-12 months to add these. But honestly: "
       "it's not a deep moat. The real India advantage is customer relationships and local "
       "market understanding, which comes from operating here.", story)

    story.append(PageBreak())

    # ── LEGAL / COMPLIANCE ──────────────────────────────────────────
    section("7. Legal & Compliance Questions", story)

    qa("Is cold outreach legal?",
       "In India: Yes, under the IT Act 2000 and DND (Do Not Disturb) registry. We check "
       "the DND registry before sending (planned). In the US: CAN-SPAM Act requires "
       "(1) accurate header info, (2) clear subject line, (3) physical address, "
       "(4) unsubscribe mechanism, (5) honor unsubscribe within 10 business days. We "
       "implement all of these (EmailUnsubscribe model, physical address in email footer). "
       "In the EU: GDPR requires consent or legitimate interest. We include unsubscribe "
       "links and process data only for B2B outreach (legitimate interest).", story)

    qa("How do you handle GDPR?",
       "GDPR compliance features: (1) EmailUnsubscribe model — automatic opt-out, (2) "
       "GdprRequest model — data export/deletion requests, (3) DataExport model — "
       "automated data portability, (4) Consent tracking in the auth flow. We process "
       "only B2B contact data (business emails from public directories) under legitimate "
       "interest. We do NOT process personal/sensitive data. Data is stored in the user's "
       "database instance — not a central data lake. Honestly: full GDPR compliance "
       "review is pending — we have the schema but need legal review before EU launch.", story)

    qa("Do you sell or share user data?",
       "No. Never. User data (leads, outreach, deals) belongs to the user. We don't "
       "sell it, share it, or use it to train models without explicit consent. The data "
       "is stored in the user's own database instance. Our business model is SaaS "
       "subscriptions, not data brokerage.", story)

    qa("What about email deliverability?",
       "We send via the user's own Gmail account (Gmail SMTP with their App Password). "
       "This means emails come from their domain, with their sender reputation. We "
       "don't use shared IP pools (which hurt deliverability). We track opens/clicks "
       "via tracking pixels. We honor unsubscribes automatically. Daily outreach limits "
       "prevent spam-like volume. Honestly: if a user sends 500 emails/day from a new "
       "Gmail account, Google will throttle them. We recommend warming up the account "
       "gradually (50/day → 100/day → 500/day over 2 weeks).", story)

    qa("Who owns the data if a user leaves?",
       "The user owns their data. They can export all leads, deals, activities, and "
       "outreach history at any time via the data export feature. If they cancel their "
       "subscription, their data is retained for 90 days (in case they return), then "
       "permanently deleted. Enterprise contracts can specify custom data retention "
       "policies.", story)

    # ── SUMMARY TABLE ───────────────────────────────────────────────
    section("8. Honest Product Status Summary", story)

    data = [
        ["Feature", "Status", "Notes"],
        ["AI Lead Discovery", "✅ Working", "536 leads in production DB"],
        ["Lead Scoring/Analysis", "✅ Working", "Rule-based, not ML-trained"],
        ["Autopilot Engine", "✅ Working", "13 runs completed, 2 failed"],
        ["Outreach (Email)", "✅ Working", "Gmail SMTP verified"],
        ["Outreach (WhatsApp)", "❌ Not built", "Config exists, no implementation"],
        ["Outreach (LinkedIn)", "❌ Not built", "Config exists, no implementation"],
        ["Auth (Email/Password)", "✅ Working", "Bcrypt 12, constant-time"],
        ["Auth (Google OAuth)", "✅ Working", "Credentials valid, redirect URI pending"],
        ["Auth (OTP/Magic Link)", "✅ Working", "Real email delivery verified"],
        ["CRM (Admin)", "✅ Working", "136 Prisma models, real data"],
        ["Sales Command Center", "✅ Working", "Real-time dashboard, live data"],
        ["Stripe Payments", "⚠️ Coded, not active", "Needs Stripe keys in Vercel"],
        ["Razorpay Payments", "⚠️ Coded, not active", "Needs Razorpay keys"],
        ["Real-time (SSE)", "✅ Working", "EventBus + SSE + Redis pubsub"],
        ["Business Intelligence", "⚠️ Schema drift", "Tables missing from DB"],
        ["Deal Pipeline", "⚠️ Empty", "0 deals in production"],
        ["Competitor Analysis", "⚠️ Schema exists", "No data yet"],
        ["AI Calling/Voice", "❌ Not built", "Not in roadmap"],
        ["Proposal Generation", "❌ Not built", "Deal model has field, no generator"],
        ["Mobile App", "❌ Not built", "Responsive web only"],
        ["Forecasting", "⚠️ Model exists", "No engine implemented"],
    ]
    story.append(make_table(data, col_widths=[60*mm, 35*mm, 75*mm]))


# ═══════════════════════════════════════════════════════════════════════
# PDF 2: PRICING Q&A
# ═══════════════════════════════════════════════════════════════════════

def pdf_pricing_qa(story):
    story.append(Paragraph("Pricing Q&A — Every Objection, Every Perspective", H1))
    story.append(Paragraph(
        "This document prepares you for every pricing-related question from investors, "
        "clients, users, and partners. Answers are honest about where the pricing is "
        "competitive and where it's not.", BODY))
    story.append(Spacer(1, 4*mm))

    section("Current Pricing Structure", story)
    data = [
        ["Plan", "Monthly", "Yearly", "Credits", "Key Features"],
        ["Starter", "FREE", "FREE", "50", "Discovery, scoring, basic outreach, 1 niche"],
        ["Pro", "$29", "$290", "750", "Autopilot, multi-channel, 5 niches, CRM"],
        ["Elite", "$99", "$990", "2,000", "BI, sequences, unlimited niches, priority"],
        ["Enterprise", "Custom", "Custom", "Custom", "Dedicated infra, SLA, white-label"],
    ]
    story.append(make_table(data, col_widths=[28*mm, 22*mm, 22*mm, 22*mm, 76*mm]))
    story.append(Spacer(1, 4*mm))

    data2 = [
        ["Credit Pack", "Price", "Credits", "Cost/Credit"],
        ["Starter Pack", "$10", "250", "$0.040"],
        ["Growth Pack", "$18", "500", "$0.036"],
        ["Scale Pack", "$30", "1,000", "$0.030"],
        ["Bulk Pack", "$60", "2,500", "$0.024"],
    ]
    story.append(make_table(data2, col_widths=[40*mm, 30*mm, 30*mm, 40*mm]))

    section("Investor Pricing Questions", story)

    qa("Is $29/month too cheap to build a real business?",
       "At $29/month Pro with ~70% gross margin (credit cost ~$8.7/user for AI + email), "
       "we need ~690 paying Pro customers for $20K MRR (break-even for 2-person team + "
       "infrastructure). At $99/month Elite, we need ~200 customers. The low price is a "
       "deliberate market-entry strategy — it's the wedge into the 50M+ Indian SMBs that "
       "can't afford $99/user Apollo. Pricing increases as the product proves value: "
       "Pro → $39/mo after first 500 customers, Elite → $149/mo after first 200. "
       "Annual contracts lock in the lower rate and improve cash flow.", story)

    qa("What's your gross margin?",
       "Estimated 70% at Pro, 75% at Elite. Costs: AI API calls (~$0.01-0.03/lead "
       "discovered + analyzed), email sending (~$0.001/email via Gmail SMTP, ~$0 for "
       "first 2,000/day), database/storage (~$0.50/user on Postgres), payment processing "
       "(2.9% + $0.30 per Stripe transaction). At Pro ($29): ~$8.7 cost, $20.3 profit. "
       "At Elite ($99): ~$24.75 cost, $74.25 profit. These are estimates — real costs "
       "will be measured once paying users are active.", story)

    qa("What's your LTV (Lifetime Value)?",
       "Unknown — no paying customers yet to measure churn. Industry benchmarks for "
       "SMB SaaS: 8% monthly churn, 12-month average lifetime. At Pro ($29/mo, 12-month "
       "LTV): $348 revenue, $245 cost = $103 LTV. At Elite ($99/mo, 18-month LTV — "
       "lower churn at higher tier): $1,782 revenue, $445 cost = $1,337 LTV. With "
       "annual contracts (15% discount, 24-month commitment): Pro LTV = $580, "
       "Elite LTV = $2,029. Target blended LTV: $400 by month 12.", story)

    qa("What's your unit economics?",
       "Target CAC: $15-30 (content marketing + product-led growth). LTV: $400 (blended). "
       "LTV:CAC ratio: 13:1 to 27:1 (healthy is >3:1). Payback period: 1-2 months. "
       "These are projections, not measured data. The risk: if CAC is higher than $50 "
       "(paid acquisition in competitive markets), payback extends to 3-4 months and "
       "we need more runway. Mitigation: product-led growth (free Starter plan) keeps "
       "CAC low.", story)

    qa("Why credits instead of just per-seat pricing?",
       "Per-seat pricing (like Apollo $99/user/month) punishes small teams — a solo "
       "foundator pays the same as a 10-person sales team. Credits align cost with "
       "VALUE: a solo founder who discovers 100 leads and contacts 50 pays less than "
       "an agency doing 1,000 leads and 500 contacts. It's fairer and more scalable. "
       "The downside: credits are harder to explain than '$X/month per user'. We mitigate "
       "with clear onboarding (showing exactly what 50/750/2000 credits buys).", story)

    qa("How does pricing compare to competitors?",
       "See competitor pricing table below. We're 3-10x cheaper than the closest "
       "comparable tool. But honestly: competitors offer more data (Apollo: 275M "
       "contacts), better integrations (HubSpot: 1,000+ integrations), and more mature "
       "features. Our lower price reflects a less mature product targeting a different "
       "market segment (SMBs vs enterprise).", story)

    story.append(Spacer(1, 4*mm))
    section("Competitor Pricing Comparison", story)
    comp_data = [
        ["Tool", "Entry Price", "Mid-tier", "Enterprise", "Pricing Model"],
        ["AcquisitionOS", "FREE", "$29/mo", "$99/mo+", "Credit-based"],
        ["Apollo.io", "$49/user/mo", "$99/user/mo", "$149/user/mo", "Per-seat"],
        ["HubSpot Starter", "$20/mo", "$100/mo", "$1,200+/mo", "Per-seat + contacts"],
        ["Outreach.io", "N/A", "~$100/user/mo", "~$180/user/mo", "Per-seat (annual only)"],
        ["Clay.com", "~$100/mo", "~$300/mo", "Custom", "Per-seat + credits"],
        ["11x.ai", "~$500/mo", "~$1,000/mo", "Custom", "Per-seat (AI SDR)"],
        ["ZoomInfo", "~$200/user/mo", "~$400/user/mo", "Custom", "Per-seat + credits"],
        ["Lemlist", "$39/user/mo", "$59/user/mo", "$99/user/mo", "Per-seat"],
        ["Smartlead", "~$30/mo", "~$70/mo", "~$140/mo", "Per-mailbox"],
        ["LinkedIn Sales Nav", "$99/user/mo", "$149/user/mo", "Custom", "Per-seat"],
    ]
    story.append(make_table(comp_data, col_widths=[35*mm, 28*mm, 28*mm, 28*mm, 35*mm]))

    section("Client Pricing Questions", story)

    qa("$29/month seems expensive for a small business.",
       "Compare: a small business currently spends 15+ hours/week (worth $300+ at "
       "$20/hour) on manual lead finding and outreach. At $29/month, AcquisitionOS "
       "replaces that work for less than $1/day. If it saves even 2 hours/week, it "
       "pays for itself 5x over. The Starter plan is free — try it first, upgrade "
       "only when you see value.", story)

    qa("Why should I pay $99/month when Lemlist is $39?",
       "Lemlist sends emails — you still have to find the leads, write the messages, "
       "and track replies manually. AcquisitionOS discovers leads, scores them, "
       "writes messages, sends them, tracks replies, and surfaces what needs attention "
       "— automatically. Comparing us to Lemlist is like comparing a self-driving car "
       "to a steering wheel. But honestly: if you already have your lead list and "
       "just need to send emails, Lemlist is cheaper for that specific task.", story)

    qa("Can I get a discount?",
       "Annual contracts: 15% off (2 months free). 6-month: 10% off. 3-month: 5% off. "
       "Referral: 15% recurring commission for each customer you refer (as long as "
       "they stay active). Agency reseller: 25% recurring commission. Non-profit: "
       "50% off. We don't discount monthly plans — the value is already priced for "
       "SMBs.", story)

    qa("What happens if I run out of credits mid-campaign?",
       "Two options: (1) Buy a credit add-on pack ($10 for 250 credits, instant), "
       "(2) Upgrade to the next plan (prorated for the current billing period). "
       "Credits never expire while your subscription is active. If you consistently "
       "run out, the system recommends upgrading based on your usage patterns.", story)

    qa("Do I pay per lead or per month?",
       "Both. The monthly subscription includes a credit allowance. Credits are "
       "consumed as the system works (discovery, analysis, outreach). If you "
       "consume all credits before the month ends, you buy add-on packs or wait "
       "for the next billing cycle. This prevents bill shock — you never pay more "
       "than your subscription + explicit add-on purchases.", story)

    qa("Is there a free trial of the paid plans?",
       "The Starter plan (50 credits) is free forever — no credit card, no time "
       "limit. For Pro/Elite features, there's a 14-day free trial (credit card "
       "required, cancel anytime). If you cancel during the trial, you're not "
       "charged. [Note: trial system is coded but not yet active — implement "
       "before launch.]", story)

    qa("Why is Enterprise 'custom' pricing? Just give me a number.",
       "Enterprise pricing depends on: number of users, credit volume, dedicated "
       "infrastructure requirements, custom integrations, SLA level, and contract "
       "length. Ballpark: $500-2,000/month for 10-50 users with dedicated support. "
       "Annual contracts with 20-30% discount. White-label deployment: $5,000+/month. "
       "We say 'custom' because each enterprise has different needs — a fixed price "
       "would overcharge some and undercharge others.", story)

    section("User Pricing Questions", story)

    qa("What exactly do I get for free?",
       "50 credits (enough for ~30 lead discoveries, 10 analyses, 10 outreach messages), "
       "1 niche, basic discovery from Google Maps and AI Search, lead scoring, email "
       "outreach, access to the CRM dashboard, email/password + OTP login. No credit "
       "card required. No time limit. The free plan is designed to prove value before "
       "you pay.", story)

    qa("How many credits does each action use?",
       "Lead discovery: ~1 credit/lead. Lead analysis + scoring: ~2 credits. Business "
       "website research: ~5 credits. AI outreach message generation: ~1 credit. "
       "Email send: ~1 credit. Meeting scheduling: ~3 credits. So a typical flow "
       "(discover → analyze → generate message → send email) = ~5 credits per lead. "
       "50 free credits = ~10 leads through the full pipeline.", story)

    qa("Will my credits expire?",
       "No — as long as your subscription is active (including the free Starter plan), "
       "credits don't expire. If you cancel a paid subscription, remaining credits "
       "are available for 90 days. After 90 days of inactivity, credits are forfeited.", story)

    qa("Can I get a refund?",
       "Monthly subscriptions: refund within 7 days if you haven't used more than 50% "
       "of your credits. Annual subscriptions: prorated refund within 30 days. Credit "
       "add-on packs: non-refundable once consumed. If the system was down for >24 "
       "hours, we extend your subscription by the downtime + 7 days bonus.", story)

    section("Partner Pricing Questions", story)

    qa("I'm an agency. Can I resell this to my clients?",
       "Yes. Reseller partnership: 25% recurring commission on every customer you "
       "refer, for as long as they stay subscribed. White-label: your branding, "
       "your domain, your pricing — we power the backend. Minimum commitment: "
       "$1,000/month (reseller) or $5,000/month (white-label). You set the price "
       "for your clients; we charge you a wholesale rate (50% off published prices).", story)

    qa("Can I get an exclusive territory?",
       "For white-label partners with $10,000+/month commitment: yes, geographic "
       "exclusivity (e.g., exclusive reseller rights for a state or country) for "
       "12-24 months, renewable based on performance. For standard resellers: "
       "non-exclusive. We protect partners who deliver volume.", story)

    story.append(PageBreak())


# ═══════════════════════════════════════════════════════════════════════
# PDF 3: PARTNERSHIP & VALUATION (Section B + C)
# ═══════════════════════════════════════════════════════════════════════

def pdf_partnership_valuation(story):
    story.append(Paragraph("Partnership Pricing & Company Valuation", H1))
    story.append(Paragraph(
        "Section B: Partnership and contract pricing models. "
        "Section C: Company valuation formulas with real mathematical examples "
        "using AcquisitionOS data.", BODY))
    story.append(Spacer(1, 4*mm))

    # ── SECTION B: PARTNERSHIP PRICING ──────────────────────────────
    section("Section B — Partnership & Contract Pricing", story)

    story.append(Paragraph("B.1 Annual Contract Pricing (with discounts)", H3))

    contract_data = [
        ["Contract", "Discount", "Pro ($29/mo)", "Elite ($99/mo)", "Enterprise (~$500/mo)"],
        ["Monthly", "0%", "$29/mo", "$99/mo", "$500/mo"],
        ["3 months", "5%", "$82.65 total", "$282.15 total", "$1,425 total"],
        ["6 months", "10%", "$156.60 total", "$534.60 total", "$2,700 total"],
        ["12 months", "15%", "$295.80/year", "$1,009.35/year", "$5,100/year"],
        ["24 months", "20%", "$557.60/2yr", "$1,900.80/2yr", "$9,600/2yr"],
        ["36 months", "25%", "$783.00/3yr", "$2,673.00/3yr", "$13,500/3yr"],
    ]
    story.append(make_table(contract_data, col_widths=[28*mm, 20*mm, 35*mm, 35*mm, 42*mm]))

    story.append(Paragraph("B.2 Partnership Models", H3))

    qa("Referral Partner (no minimum commitment)",
       "Commission: 15% recurring (as long as the referred customer stays subscribed). "
       "Example: Refer 10 Pro customers ($29/mo each = $290/mo). You earn $43.50/month "
       "recurring. Refer 50 customers: $217.50/month recurring. No contract, no "
       "minimum. You get a unique referral link. Payout: monthly via Stripe Connect.", story)

    qa("Reseller Partner ($1,000/month minimum)",
       "Commission: 25% recurring. Wholesale rate: 50% off published prices "
       "(you buy Pro at $14.50, sell at $29+). You can set your own price. "
       "Example: Buy 50 Pro seats at $14.50 = $725/month wholesale. Sell at "
       "$39/month = $1,950 revenue. Profit: $1,225/month. Co-branded landing page. "
       "Monthly reporting. 6-month minimum commitment.", story)

    qa("White-Label Partner ($5,000/month minimum)",
       "Commission: 35% recurring + wholesale at 65% off. Your branding, your "
       "domain (acquisition.youragency.com), your pricing. We power the backend. "
       "Example: Buy 100 Elite seats at $34.65 = $3,465/month. Sell at $149/month "
       "= $14,900 revenue. Profit: $11,435/month. Dedicated support. "
       "12-month minimum commitment. Non-compete clause.", story)

    qa("Strategic Partner (equity or revenue share)",
       "For companies bringing significant distribution (1000+ customers) or "
       "technology (exclusive data source, AI model). Structures: "
       "(1) Revenue share: 30-50% of revenue from jointly acquired customers. "
       "(2) Equity: 1-5% of AcquisitionOS equity for exclusive partnership. "
       "(3) Joint venture: 50/50 revenue on a white-label product. "
       "Negotiated case-by-case. Requires founder-level discussion.", story)

    story.append(Paragraph("B.3 Contract Pricing Calculator (Examples)", H3))

    qa("Example 1: Agency wants 10 Pro seats, 12-month contract",
       "Base: 10 × $29 = $290/month. Annual: $3,480. With 15% annual discount: "
       "$3,480 × 0.85 = $2,958/year. Effective monthly: $246.50 (instead of $290). "
       "Savings: $522/year. Credits: 10 × 750 = 7,500 credits/year.", story)

    qa("Example 2: Company wants 25 Elite seats, 24-month contract",
       "Base: 25 × $99 = $2,475/month. 24-month: $59,400. With 20% discount: "
       "$59,400 × 0.80 = $47,520/2years. Effective monthly: $1,980 (instead of "
       "$2,475). Savings: $11,880 over 2 years. Credits: 25 × 2,000 = 50,000 "
       "credits/month = 1,200,000 credits over 2 years.", story)

    qa("Example 3: Enterprise wants custom, 36-month contract, 100 users",
       "Base rate: $500/user/month × 100 = $50,000/month. 36-month: $1,800,000. "
       "With 25% discount: $1,350,000/3years. Effective monthly: $37,500. "
       "Savings: $450,000. Includes: dedicated infrastructure, custom integrations, "
       "SLA (99.9% uptime), dedicated account manager, custom branding, "
       "unlimited credits, priority support.", story)

    story.append(PageBreak())

    # ── SECTION C: VALUATION FORMULAS ───────────────────────────────
    section("Section C — Company Valuation Formulas", story)

    story.append(Paragraph(
        "Multiple valuation methodologies with real mathematical examples. "
        "AcquisitionOS is pre-revenue, so revenue-based methods show $0 — "
        "but they're included for completeness once revenue begins.", BODY))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph("C.1 Revenue Multiple Method", H3))
    story.append(Paragraph(
        "Valuation = Annual Recurring Revenue (ARR) × Industry Multiple. "
        "SaaS companies typically trade at 5-15x ARR depending on growth rate, "
        "gross margin, and retention.", BODY))

    rev_data = [
        ["Scenario", "ARR", "Multiple", "Valuation", "Notes"],
        ["Pre-revenue (today)", "$0", "N/A", "$0", "Can't use this method yet"],
        ["$10K MRR (early)", "$120K", "8x", "$960K", "Early-stage, moderate growth"],
        ["$50K MRR (growth)", "$600K", "10x", "$6M", "Strong growth, good retention"],
        ["$100K MRR (scaling)", "$1.2M", "12x", "$14.4M", "High growth, premium multiple"],
        ["$500K MRR (mature)", "$6M", "8x", "$48M", "Slower growth, lower multiple"],
    ]
    story.append(make_table(rev_data, col_widths=[35*mm, 22*mm, 20*mm, 30*mm, 48*mm]))

    story.append(Paragraph("C.2 DCF (Discounted Cash Flow) Method", H3))
    story.append(Paragraph(
        "Valuation = Sum of future cash flows discounted to present value + terminal value. "
        "Formula: DCF = Σ (CF_t / (1+r)^t) + (CF_n × (1+g)) / ((r-g) × (1+r)^n) "
        "where CF = cash flow, r = discount rate, g = growth rate, n = years.", BODY))

    qa("DCF Example (projected, 5-year horizon)",
       "Assumptions: Year 1: -$50K (building), Year 2: $20K, Year 3: $100K, "
       "Year 4: $300K, Year 5: $600K. Discount rate: 25% (high risk, early stage). "
       "Terminal growth: 5%. Calculation: "
       "Y1: -$50K / 1.25 = -$40K. "
       "Y2: $20K / 1.5625 = $12.8K. "
       "Y3: $100K / 1.9531 = $51.2K. "
       "Y4: $300K / 2.4414 = $122.9K. "
       "Y5: $600K / 3.0518 = $196.6K. "
       "Terminal: ($600K × 1.05) / (0.25 - 0.05) / 3.0518 = $630K / 0.20 / 3.0518 = $1,032K. "
       "DCF = -40 + 12.8 + 51.2 + 122.9 + 196.6 + 1,032 = $1,375.5K ≈ $1.38M.", story)

    story.append(Paragraph("C.3 Berkus Method (pre-revenue)", H3))
    story.append(Paragraph(
        "For pre-revenue startups. Assigns value to 5 risk-reduction milestones, "
        "each worth up to $500K (adjusted for market).", BODY))

    berkus_data = [
        ["Milestone", "Max Value", "AcquisitionOS Status", "Value Assigned"],
        ["Sound Idea (prototype)", "$500K", "✅ Working product", "$500K"],
        ["Prototype (working)", "$500K", "✅ Functional MVP", "$500K"],
        ["Quality Management Team", "$500K", "⚠️ Solo founder", "$100K"],
        ["Strategic Relationships", "$500K", "⚠️ No partnerships yet", "$0"],
        ["Product Rollout / Sales", "$500K", "❌ No revenue yet", "$0"],
        ["TOTAL", "$2.5M", "", "$1,100K = $1.1M"],
    ]
    story.append(make_table(berkus_data, col_widths=[45*mm, 25*mm, 45*mm, 30*mm]))

    story.append(Paragraph("C.4 Scorecard Valuation Method", H3))
    story.append(Paragraph(
        "Compares the startup to recently funded similar companies, adjusting for "
        "strengths/weaktheses across 7 factors.", BODY))

    score_data = [
        ["Factor", "Weight", "AcquisitionOS Assessment", "Adjustment"],
        ["Strength of Management", "30%", "Solo founder, technical", "-30% (no team)"],
        ["Size of Opportunity", "25%", "$16.7B market by 2032", "+20% (large)"],
        ["Product/Technology", "15%", "Working MVP, real data", "+10% (proven)"],
        ["Competitive Environment", "10%", "11x.ai, Apollo, HubSpot", "-15% (crowded)"],
        ["Marketing/Sales", "10%", "No GTM yet", "-20% (unproven)"],
        ["Need for Additional Capital", "5%", "Low burn, small raise", "+5% (efficient)"],
        ["Other (IP, partnerships)", "5%", "No patents, India focus", "-5%"],
        ["Weighted Average", "100%", "", "-10% adjustment"],
    ]
    story.append(make_table(score_data, col_widths=[40*mm, 18*mm, 50*mm, 30*mm]))

    story.append(Paragraph(
        "Base valuation (avg pre-revenue SaaS in India): $2M. "
        "Adjusted: $2M × (1 + (-0.10)) = $1.8M.", BODY))

    story.append(Paragraph("C.5 Risk Factor Summation Method", H3))
    story.append(Paragraph(
        "Start with base valuation ($2M for pre-revenue tech startup in India), "
        "then add/subtract $250K for each of 12 risk factors.", BODY))

    risk_data = [
        ["Risk Factor", "Assessment", "Adjustment"],
        ["Management Risk", "Solo founder", "-$250K"],
        ["Stage of Business", "MVP, pre-revenue", "-$250K"],
        ["Legislation/Political Risk", "Low (India IT-friendly)", "+$0"],
        ["Manufacturing Risk", "N/A (software)", "+$0"],
        ["Sales/Marketing Risk", "No GTM execution yet", "-$250K"],
        ["Capital Funding Risk", "Small raise, manageable", "+$0"],
        ["Competition Risk", "Well-funded competitors", "-$250K"],
        ["Technology Risk", "Proven stack, working product", "+$250K"],
        ["Litigation Risk", "None", "+$0"],
        ["International Risk", "India-first, lower exposure", "+$0"],
        ["Reputation Risk", "No brand yet", "-$0"],
        ["Potential Lucrative Exit", "Acquisition by HubSpot/Salesforce possible", "+$250K"],
        ["NET Adjustment", "", "-$500K"],
    ]
    story.append(make_table(risk_data, col_widths=[55*mm, 50*mm, 30*mm]))

    story.append(Paragraph(
        "Base: $2M. Net adjustment: -$500K. Final valuation: $1.5M.", BODY))

    story.append(Paragraph("C.6 Valuation Summary (Recommended Range)", H3))

    summary_data = [
        ["Method", "Valuation", "Best For"],
        ["Berkus", "$1.1M", "Pre-revenue, technology proven"],
        ["Scorecard", "$1.8M", "Pre-revenue, compared to peers"],
        ["Risk Factor", "$1.5M", "Pre-revenue, risk-adjusted"],
        ["DCF (projected)", "$1.38M", "Future cash flow projection"],
        ["Revenue Multiple", "$0 (today)", "Post-revenue only"],
        ["RECOMMENDED RANGE", "$1.2M - $2.0M", "Pre-seed / angel round"],
    ]
    story.append(make_table(summary_data, col_widths=[40*mm, 40*mm, 55*mm]))

    story.append(Paragraph("C.7 Investment Offer Structures", H3))

    qa("Equity-based investment (recommended for $250K-500K raise)",
       "Pre-money valuation: $1.5M. Investment: $250K. Post-money: $1.75M. "
       "Investor equity: $250K / $1.75M = 14.3%. Investment: $500K. Post-money: "
       "$2M. Investor equity: $500K / $2M = 25%. Founder retains 75-86%. "
       "Vesting: founder equity vests over 4 years (1-year cliff). Board: 1 "
       "founder + 1 investor = 2 seats.", story)

    qa("Revenue-based investment (alternative, no equity dilution)",
       "Investor provides $250K. Repayment: 5% of monthly revenue until $350K "
       "repaid (1.4x multiple). At $20K MRR: $1,000/month repayment → 350 months "
       "(too slow). At $50K MRR: $2,500/month → 140 months. At $100K MRR: "
       "$5,000/month → 70 months. Best for when revenue is $50K+/month. "
       "Cap: if revenue exceeds $200K/month, repayment accelerates to 8%.", story)

    qa("SAFE (Simple Agreement for Future Equity)",
       "Investor gives $250K via SAFE with a $2M valuation cap and 20% discount. "
       "At next funding round (Series A at $5M pre-money): investor gets equity "
       "at min($2M cap, $5M × 0.80 = $4M) = $2M valuation. So $250K / $2M = "
       "12.5% equity at Series A. No equity granted now — only at the next round. "
       "Pro: simple, no valuation negotiation now. Con: uncertainty for investor.", story)

    qa("Convertible Note",
       "$250K loan at 5% interest, 2-year maturity, $2M valuation cap, 20% "
       "discount. At maturity: either repays $250K + interest ($275K), or converts "
       "to equity at the cap/discount. At Series A ($5M pre): converts at $2M cap. "
       "$275K / $2M = 13.75% equity. Pro: investor has downside protection (loan). "
       "Con: debt on the balance sheet.", story)

    qa("Full acquisition (if someone wants to buy AcquisitionOS)",
       "Valuation basis: Pre-revenue, so use Berkus + Scorecard methods. "
       "Recommended asking price: $1.5M-3M (depending on acquirer's strategic "
       "value). Structures: "
       "(1) Cash + equity: $500K cash + 2% equity in acquirer. "
       "(2) All-cash: $1.5M (founder walks away). "
       "(3) Earn-out: $800K upfront + $700K over 2 years tied to revenue targets. "
       "(4) Talent acquisition: $300K + employment contract ($150K/year for 2 years). "
       "Realistic: $500K-1M for the codebase + founder as employee.", story)

    story.append(PageBreak())


# ═══════════════════════════════════════════════════════════════════════
# PDF 4: COMPETITOR RESEARCH
# ═══════════════════════════════════════════════════════════════════════

def pdf_competitor_research(story):
    story.append(Paragraph("Competitor Research — Honest Gap Analysis", H1))
    story.append(Paragraph(
        "Real competitor analysis with honest assessment of where AcquisitionOS "
        "overlaps, where it doesn't, what competitors do better, and what gap "
        "AcquisitionOS could credibly own. No inflated claims.", BODY))
    story.append(Spacer(1, 4*mm))

    section("1. Competitive Landscape Map", story)

    competitors = [
        ["Competitor", "Category", "Funding/Rev", "Price Range", "AcquisitionOS Overlap", "What They Do Better", "Our Advantage"],
        ["HubSpot", "CRM + Marketing", "$2.17B rev", "$20-3000/mo", "CRM, pipeline, deals", "Mature CRM, 1000+ integrations, reporting", "Autonomous discovery + outreach"],
        ["Salesforce", "Enterprise CRM", "$34.9B rev", "$25-500/user", "CRM, pipeline", "Enterprise scale, ecosystem, AI (Einstein)", "Price, SMB focus, automation"],
        ["Apollo.io", "Data + Prospecting", "~$250M ARR", "$49-149/user", "Lead discovery", "275M contacts, data quality, intent data", "Autonomous outreach, India sources"],
        ["Outreach.io", "Sales Engagement", "~$300M ARR", "~$100-180/user", "Outreach sequences", "Mature sequencing, analytics, integrations", "Discovery + analysis included"],
        ["Salesloft", "Sales Engagement", "$250M ARR", "~$100-150/user", "Outreach sequences", "Enterprise features, coaching, dialer", "Price, autonomous mode"],
        ["Clay.com", "Enrichment + Outreach", "~$50M ARR", "$100-300+/mo", "Lead enrichment, AI messages", "Deep enrichment, spreadsheet power", "Simpler, automated, affordable"],
        ["11x.ai", "AI SDR", "$50M raised", "~$500-2000/mo", "Autonomous prospecting", "Purpose-built AI, enterprise integrations", "Price, India focus, credit model"],
        ["Artisan.ai", "AI SDR", "$25M raised", "~$500+/mo", "Autonomous outreach", "AI quality, UX polish", "Price, working product today"],
        ["ZoomInfo", "Data Provider", "$1.3B rev", "$200-400/user", "Lead data", "Massive B2B database, intent signals", "Workflow automation, not just data"],
        ["Lemlist", "Email Outreach", "~$30M ARR", "$39-99/user", "Email outreach", "Deliverability tools, A/B testing", "Discovery + scoring included"],
        ["Smartlead", "Cold Email", "~$10M ARR", "$30-140/mo", "Email outreach", "Mailbox rotation, deliverability", "Full pipeline, not just email"],
        ["LinkedIn Sales Nav", "Social Prospecting", "$6.7B rev", "$99-149/user", "Lead discovery (LinkedIn)", "LinkedIn data depth, InMail", "Multi-source + automation"],
        ["Instantly.ai", "Email Automation", "~$20M ARR", "$30-100/mo", "Email outreach", "Unlimited email accounts, warmup", "Discovery + AI analysis"],
        ["ChatGPT/Claude", "AI Tools", "N/A", "$20/mo", "AI message generation", "Superior LLM quality, flexibility", "Integrated workflow, not chat"],
    ]
    story.append(make_table(competitors, col_widths=[22*mm, 22*mm, 20*mm, 22*mm, 28*mm, 28*mm, 28*mm]))

    section("2. Where AcquisitionOS Credibly Wins", story)

    qa("1. Price-to-automation ratio",
       "No competitor offers autonomous discovery + analysis + outreach + CRM at "
       "$29-99/month. The cheapest autonomous SDR (11x.ai) starts at $500/month. "
       "Apollo + Outreach + a CRM = $200-400/month per user for a non-autonomous "
       "stack. We're 5-10x cheaper for the full pipeline.", story)

    qa("2. India-specific data sources",
       "JustDial and IndiaMART integrations don't exist in any US competitor. "
       "For Indian SMB targeting, we have data sources others don't. This is a "
       "time-limited advantage (competitors could add these in 6-12 months) "
       "but it's real today.", story)

    qa("3. Credit-based pricing for SMBs",
       "Per-seat pricing punishes small teams. Credits align cost with value — "
       "a solo founder pays for what they use, not per employee. This model is "
       "better for the 50M+ Indian SMBs that can't afford $99/user/month.", story)

    qa("4. All-in-one acquisition lifecycle",
       "Discovery → analysis → scoring → outreach → tracking → CRM in one tool. "
       "Every competitor solves 1-2 steps. The integration cost of stitching "
       "5 tools together (Apollo + Clay + Outreach + HubSpot + Zapier) is "
       "$200-500/month and 20+ hours of setup. We're one tool, one price.", story)

    section("3. Where Competitors Honestly Win", story)

    qa("Data volume and quality",
       "Apollo has 275M+ contacts with verified emails. ZoomInfo has deeper B2B "
       "data. We scrape from public sources (Google Maps, LinkedIn, directories) "
       "which means smaller coverage and potentially stale data. For enterprise "
       "B2B prospecting, Apollo/ZoomInfo are unambiguously better.", story)

    qa("AI quality",
       "11x.ai and Artisan have purpose-trained models for sales outreach. We "
       "use general-purpose LLMs (OpenAI, Anthropic) with prompt engineering. "
       "Their AI generates better, more personalized messages. We'll close this "
       "gap as we collect reply data to fine-tune models, but today they're ahead.", story)

    qa("Enterprise features",
       "HubSpot/Salesforce have SSO, advanced permissions, custom objects, "
       "workflow builders, 1000+ integrations, audit trails, compliance "
       "certifications (SOC 2, HIPAA). We have basic RBAC and no compliance "
       "certifications. For enterprise buyers, they win unambiguously.", story)

    qa("Integrations",
       "HubSpot has 1,000+ integrations. Zapier connects to 5,000+ apps. We "
       "integrate with ~20 services. If a customer needs their CRM + Slack + "
       "calendly + Zoom + docuSign all synced, HubSpot + Zapier is the answer.", story)

    qa("Brand and trust",
       "HubSpot is trusted by 194,000+ customers in 120+ countries. Salesforce "
       "is the default enterprise choice. We have 0 paying customers. Trust "
       "takes years to build. For risk-averse buyers, the incumbent wins.", story)

    section("4. Gap AcquisitionOS Could Own", story)

    story.append(Paragraph(
        "The 'autonomous acquisition for SMBs' gap: No competitor serves the "
        "segment of businesses (5-50 employees, India-first, $0-99/month budget) "
        "that want autonomous client acquisition without per-seat pricing. "
        "HubSpot is too expensive. Apollo is per-seat. 11x.ai is enterprise-only. "
        "The gap is real but small — and closing fast as AI SDR startups "
        "expand downward.", BODY))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "To own this gap credibly, AcquisitionOS needs: (1) first 100 paying "
        "customers in India proving product-market fit, (2) WhatsApp/LinkedIn "
        "automation working (not just email), (3) reply-to-conversion data "
        "improving the scoring model, (4) 4.5+ star rating from real users. "
        "Without these, the gap is theoretical.", BODY))

    story.append(PageBreak())


# ═══════════════════════════════════════════════════════════════════════
# PDF 5: TECHNICAL ARCHITECTURE & SECURITY
# ═══════════════════════════════════════════════════════════════════════

def pdf_technical(story):
    story.append(Paragraph("Technical Architecture & Security", H1))
    story.append(Paragraph(
        "Complete technical overview for engineering audiences and technical "
        "due diligence.", BODY))
    story.append(Spacer(1, 4*mm))

    section("1. Technology Stack", story)
    stack_data = [
        ["Layer", "Technology", "Version", "Notes"],
        ["Frontend Framework", "Next.js (App Router)", "16.1.3", "Turbopack, React 19"],
        ["UI Library", "React", "19.0.0", "Server + Client components"],
        ["Language", "TypeScript", "5.x", "Strict mode"],
        ["Styling", "Tailwind CSS", "4.x", "shadcn/ui + Radix primitives"],
        ["Motion", "Framer Motion", "12.x", "Reduced-motion support"],
        ["Charts", "Recharts", "2.15", "Area, Bar, Pie, Funnel"],
        ["Tables", "TanStack React Table", "8.21", "Virtualization ready"],
        ["Data Fetching", "TanStack React Query", "5.82", "Cache invalidation"],
        ["ORM", "Prisma", "6.x", "136 models, SQLite/Postgres"],
        ["Database (dev)", "SQLite", "—", "File-based, zero config"],
        ["Database (prod)", "PostgreSQL", "15+", "Connection pooling via PgBouncer"],
        ["Cache/PubSub", "Redis", "7+", "Multi-instance real-time"],
        ["Auth", "Custom JWT", "—", "Access(15m) + Refresh(7d) in httpOnly cookies"],
        ["Password Hashing", "bcrypt", "12 rounds", "Constant-time verification"],
        ["OAuth", "Google OAuth 2.0", "—", "Dynamic origin, state-encoded redirect"],
        ["Email", "Gmail SMTP + Resend", "—", "Nodemailer, alias-aware"],
        ["Payments", "Stripe + Razorpay", "—", "Auto live/test detection"],
        ["AI Providers", "OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter", "—", "Per-user encrypted keys"],
        ["Real-time", "EventBus + SSE + Redis PubSub", "—", "6 channels, last-event-id resumption"],
        ["Deployment", "Vercel", "—", "Serverless functions"],
        ["Monitoring", "OpenTelemetry + Sentry", "—", "Optional"],
    ]
    story.append(make_table(stack_data, col_widths=[35*mm, 40*mm, 20*mm, 55*mm]))

    section("2. Data Architecture", story)
    story.append(Paragraph(
        "136 Prisma models organized into domains:", BODY))

    domain_data = [
        ["Domain", "Key Models", "Purpose"],
        ["Auth & Users", "User, UserSession, LoginHistory, MfaConfig, ApiKey", "Authentication, sessions, RBAC"],
        ["Organization", "Organization, OrgMember, OrgInvitation", "Multi-tenant org management"],
        ["Billing", "Subscription, PaymentOrder, PaymentWebhook, Invoice, Coupon", "Stripe/Razorpay billing"],
        ["Credits", "CreditsLedger, CreditAddon, DailyOutreachUsage", "Credit economy"],
        ["Leads", "Lead, LeadAnalysis, LeadScore, LeadNote, LeadActivity", "Lead lifecycle"],
        ["Pipeline", "PipelineStage, Deal, FollowUpReminder", "Deal management"],
        ["Outreach", "OutreachMessage, OutreachSequence, SequenceStep, SequenceEnrollment", "Multi-step campaigns"],
        ["Meetings", "Meeting, MeetingReminder, MeetingIntentLog", "Meeting scheduling"],
        ["Business Intelligence", "BusinessProfile, WebProperty, ResearchSnapshot", "AI-researched intelligence"],
        ["Automation", "AutopilotWorkflow, AutopilotRun, WorkflowDefinition, WorkflowExecution", "Autopilot engine"],
        ["Discovery", "DiscoveryJob, AcquisitionCampaign", "Lead discovery jobs"],
        ["Real-time", "RealtimeEvent, WsConnection, SseConnection", "Event infrastructure"],
        ["Security", "AuditLog, SystemEvent, SecurityAlert, KnownDevice", "Audit + security"],
        ["Integrations", "EmailAccount, EmailThread, GoogleCalendarToken", "Third-party connections"],
    ]
    story.append(make_table(domain_data, col_widths=[30*mm, 60*mm, 60*mm]))

    section("3. Security Architecture", story)

    qa("Authentication security",
       "JWT access tokens (15-min expiry) + refresh tokens (7-day expiry) stored "
       "in httpOnly, Secure, SameSite=Lax cookies. Password hashing: bcrypt 12 "
       "rounds. Constant-time password verification (dummy hash comparison for "
       "nonexistent users prevents timing attacks). Google OAuth with state-"
       "encoded redirect URI and CSRF protection. OTP: 6-digit, 10-min expiry, "
       "rate-limited (5/15min per IP+email), never logged.", story)

    qa("Authorization",
       "RBAC with 7 roles: super_admin, owner, admin, member, viewer, support, "
       "analytics. 50+ permissions. Server-side enforced via getSuperAdminSession "
       "(Next.js layouts) and withSuperAdmin/withPermission (API routes). "
       "Direct URL access protected server-side — client-side hiding is not "
       "the security mechanism.", story)

    qa("Data encryption",
       "OAuth tokens (Gmail, Google Calendar) encrypted at rest with AES-256-GCM. "
       "Per-user AI provider API keys stored encrypted (UserAIProvider model). "
       "Master encryption key from USER_AI_PROVIDER_ENCRYPTION_KEY env var "
       "(64-char hex). No plaintext credentials in the database.", story)

    qa("Input validation & SSRF protection",
       "All API routes validate input via Zod or manual checks. URL-fetching "
       "endpoints (website scorer, business research) have SSRF protection — "
       "internal IPs (127.x, 10.x, 172.x, 192.168.x) are blocked. Rate limiting "
       "on all auth endpoints and credit-consuming operations.", story)

    qa("Audit trail",
       "AuditLog model tracks every admin action with actor, action, resource, "
       "IP, user agent, timestamp. 2,232 audit entries in production. "
       "SystemEvent model tracks system-level events. SecurityAlert model "
       "for suspicious activity. Audit chain with integrity verification "
       "(hash chain, tamper-evident).", story)

    qa("Secret management",
       "238 environment variables identified in codebase audit. 26 currently "
       "configured in .env (gitignored). No secrets in source code (verified "
       "via grep for API key patterns — only regex detection patterns in "
       "security scanners). No NEXT_PUBLIC_ prefixed secrets (client bundle "
       "doesn't leak secrets). Debug routes expose only booleans "
       "(clientSecretSet: true/false), never actual values.", story)

    section("4. Real-Time Architecture", story)
    story.append(Paragraph(
        "EventBus (singleton, in-memory) → 6 channels: lead_events, "
        "payment_events, message_events, workflow_events, ai_events, "
        "notification_events. Server-side publishers (publishLeadEvent, "
        "publishPaymentEvent, etc.) → EventBus → SSE manager broadcasts to "
        "connected clients via Server-Sent Events. Redis pubsub for multi-"
       "instance broadcast (when multiple server instances are running). "
        "SSE supports auto-reconnect with last-event-id resumption (clients "
        "don't miss events during disconnection). RealtimeEvent DB model "
        "persists events for audit/replay. useLiveUpdates() React hook "
        "subscribes to channels and triggers React Query cache invalidation.", BODY))

    section("5. Compliance Status", story)
    comp_data = [
        ["Regulation", "Status", "Implementation"],
        ["CAN-SPAM (US)", "✅ Compliant", "Unsubscribe links, physical address, header accuracy"],
        ["GDPR (EU)", "⚠️ Schema ready", "GdprRequest, DataExport models; needs legal review before EU launch"],
        ["IT Act 2000 (India)", "✅ Compliant", "B2B outreach under legitimate interest; DND check planned"],
        ["SOC 2", "❌ Not certified", "Audit required for enterprise customers"],
        ["HIPAA", "❌ Not compliant", "Not applicable (no health data processed)"],
        ["PCI DSS", "✅ Via Stripe", "Stripe handles card data; we never touch raw card numbers"],
        ["DPDP Act 2023 (India)", "⚠️ Pending review", "New Indian data protection law; compliance review needed"],
    ]
    story.append(make_table(comp_data, col_widths=[35*mm, 25*mm, 90*mm]))

    section("6. Testing", story)
    story.append(Paragraph(
        "2,978 tests passing, 0 failing, 5 skipped. Coverage: unit tests "
        "(aggregation logic, KPI calculations, conversion math, stage mapping), "
        "integration tests (admin API authorization, CRM queries, dashboard "
        "aggregations), E2E tests (tenant isolation, idempotency/retry, "
        "error path regression, persistence/restart). Test isolation: each "
        "test file gets a unique SQLite DB copied from a schema template. "
        "Vitest 4 + @testing-library/react + Playwright.", BODY))


# ═══════════════════════════════════════════════════════════════════════
# MAIN — Generate all PDFs
# ═══════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("Generating AcquisitionOS Investor Prep Kit PDFs...")
    print(f"Output: {OUT_DIR}/")
    print()

    create_pdf("01_Investor_QA_Complete.pdf",
        "Complete Q&A Collection",
        "Every question from investors, clients, users, engineers, competitors",
        pdf_investor_qa)

    create_pdf("02_Pricing_QA.pdf",
        "Pricing Q&A",
        "Every pricing objection from every perspective",
        pdf_pricing_qa)

    create_pdf("03_Partnership_Valuation.pdf",
        "Partnership & Valuation",
        "Contract pricing, partnership models, valuation formulas with real math",
        pdf_partnership_valuation)

    create_pdf("04_Competitor_Research.pdf",
        "Competitor Research",
        "Honest gap analysis vs HubSpot, Apollo, Outreach, 11x.ai, and more",
        pdf_competitor_research)

    create_pdf("05_Technical_Architecture.pdf",
        "Technical Architecture & Security",
        "Stack, data models, security, compliance, testing",
        pdf_technical)

    print()
    print("✅ All PDFs generated successfully!")
