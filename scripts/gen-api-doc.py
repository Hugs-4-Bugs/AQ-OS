#!/usr/bin/env python3
"""Generate /docs/06-api-reference/API-ROUTES.md from api-inventory.json."""
import json, re
from collections import OrderedDict

with open('/home/z/my-project/scripts/api-inventory.json') as f:
    routes = json.load(f)

def norm(p):
    return re.sub(r'\d+|\[|\]', '', p)

# Curated descriptions keyed by exact path or by prefix (checked in order)
EXACT = {
 '/api/health': 'Liveness probe. Returns 200 with basic uptime info. No auth.',
 '/api/health/detailed': 'Deep health: DB connectivity, memory, AI provider, SMTP status. No auth.',
 '/api/health/database': 'Database-specific health check (Prisma ping).',
 '/api/auth/config': 'Public capability probe: returns {googleAvailable, emailConfigured, otpEnabled, magicLinkEnabled}. Used by the sign-in UI.',
 '/api/auth/debug': 'Debug auth/session state (dev aid).',
 '/api/auth/email-diagnostic': 'Diagnoses SMTP/email pipeline; can be protected by CRON_SECRET.',
 '/api/auth/signup': 'Create account (email/password). Body: {email, password, name}. Sends verification OTP if email configured.',
 '/api/auth/signin': 'Password sign-in. Sets httpOnly JWT access+refresh cookies. Body: {email, password}.',
 '/api/auth/signout': 'Revokes current session and clears auth cookies.',
 '/api/auth/me': 'Returns current user profile + plan + credits. Requires auth cookie.',
 '/api/auth/refresh': 'Rotates access token using refresh cookie.',
 '/api/auth/otp/request': 'Request a login OTP code by email. Body: {email}.',
 '/api/auth/otp/verify': 'Verify OTP code and establish session. Body: {email, code}. Rate-limited; lockout after repeated failures (otpLockedUntil).',
 '/api/auth/magic-link/request': 'Email a magic sign-in link. Body: {email}.',
 '/api/auth/magic-link/verify': 'Consume magic link token and sign in. Query: token.',
 '/api/auth/forgot-password': 'Send password reset OTP. Body: {email}.',
 '/api/auth/reset-password': 'Reset password using OTP. Body: {email, code, newPassword}.',
 '/api/auth/verify-email': 'Verify signup email with OTP. Body: {email, code}.',
 '/api/auth/resend-verification': 'Resend email verification OTP.',
 '/api/auth/mfa/setup': 'Begin TOTP MFA enrollment; returns secret + otpauth URL.',
 '/api/auth/mfa/confirm': 'Confirm TOTP code, enable MFA, return backup codes.',
 '/api/auth/mfa/verify': 'Verify TOTP/backup code during sign-in.',
 '/api/auth/mfa/disable': 'Disable MFA (requires password).',
 '/api/auth/security/devices': 'List known devices for current user.',
 '/api/auth/security/alerts': 'List security alerts for current user.',
 '/api/auth/security/lock-status': 'Check account lock status (failed-attempt lockout).',
 '/api/auth/google/state': 'OAuth entry: builds Google consent URL with redirect_uri resolved DYNAMICALLY from request headers (?origin= → x-forwarded-host+proto → host → Origin → Referer → env fallback). Returns authUrl + state (base64url JSON containing redirectUri + origin).',
 '/api/auth/google/callback': 'Google OAuth callback: validates state, exchanges code using redirectUri read from state JSON (same dynamic domain), fetches profile, upserts User, sets auth cookies, redirects to dashboard (or relay fallback when origins differ).',
 '/api/auth/google/redirect-uri': 'Diagnostic helper reporting the exact redirect_uri this deployment would use for the calling domain.',
 '/api/auth/google/relay': 'Cross-domain session relay fallback (createRelayToken) — only used when callback domain differs from app origin.',
 '/api/calendar/connect': 'Start Google Calendar OAuth connect flow.',
 '/api/calendar/callback': 'Google Calendar OAuth callback; stores GoogleCalendarToken.',
 '/api/calendar/webhook': 'Google Calendar push webhook (renew/stop watch).',
 '/api/gmail/connect': 'Start Gmail OAuth (read/send scope) connect flow.',
 '/api/gmail/callback': 'Gmail OAuth callback; stores encrypted tokens in EmailAccount.',
 '/api/gmail/pubsub/webhook': 'Gmail Pub/Sub push webhook: new-message triggers reply processing.',
 '/api/payments/create-stripe-session': 'Create Stripe Checkout Session. Body: {plan|priceId, billingCycle}. Requires STRIPE_SECRET_KEY.',
 '/api/payments/webhook/stripe': 'Stripe webhook endpoint (checkout.session.completed, customer.subscription.*, invoice.*, charge.refunded). Signature-verified with STRIPE_WEBHOOK_SECRET; idempotent via PaymentWebhook.eventId.',
 '/api/payments/webhook/razorpay': 'Razorpay webhook endpoint (payment.captured, subscription events).',
 '/api/whatsapp/twilio/webhook': 'Twilio WhatsApp inbound message webhook.',
 '/api/whatsapp/meta/webhook': 'Meta WhatsApp Cloud API webhook (hub verification + events).',
 '/api/telegram/webhook': 'Telegram bot webhook for inbound messages/commands.',
 '/api/workflows/webhook/[id]': 'Inbound webhook trigger to start a workflow by id.',
 '/api/cron/process-sequences': 'Cron: advance outreach sequence steps that are due.',
 '/api/cron/sdr-cycle': 'Cron: run the autonomous SDR cycle (discover → score → outreach).',
 '/api/cron/meeting-reminders': 'Cron: send due meeting reminders.',
 '/api/cron/hot-lead-scan': 'Cron: scan replies/signals to promote hot leads.',
 '/api/cron/credit-renewal': 'Cron: renew monthly credit allotments.',
 '/api/cron/end-of-period': 'Cron: end-of-billing-period processing (rollover, resets).',
 '/api/cron/renew-subscriptions': 'Cron: process subscription renewals.',
 '/api/cron/payment-reconciliation': 'Cron: reconcile pending/failed payments with provider.',
 '/api/cron/process-gmail-replies': 'Cron: pull and process Gmail replies (fallback for Pub/Sub).',
 '/api/cron/autonomous-outreach': 'Cron: dispatch queued autonomous outreach.',
 '/api/cron/expire-api-keys': 'Cron: disable expired API keys.',
 '/api/cron/sequence-processing': 'Cron: secondary sequence processing entrypoint.',
 '/api/discovery/start': 'Start a lead discovery job. Body: {niche, location, maxResults}. Uses Google Custom Search (or SerpAPI fallback).',
 '/api/discovery/status': 'Poll discovery job status by ?jobId=.',
 '/api/lead-discovery': 'Status/capability endpoint: reports which discovery providers are configured (Google Search, SerpAPI).',
 '/api/leads/discover': 'Alternative discovery entrypoint with suggestions support.',
 '/api/outreach/send': 'Send (or queue) outreach email to a lead. Body: {leadId, subject, body}. Deducts credits.',
 '/api/ai/outreach/generate': 'AI-generate personalized outreach email for a lead. Body: {leadId, tone?, goal?}.',
 '/api/ai/analyze': 'Run AI deep analysis on an arbitrary text/website. Body: {leadId?, url?, text?}.',
 '/api/ai/score': 'AI scoring for a lead (reply/conversion/urgency/revenue).',
 '/api/ai/chat': 'AI assistant chat (non-streaming). Body: {sessionId?, message, leadId?}.',
 '/api/ai/chat/stream': 'Streaming variant of AI chat (SSE).',
 '/api/feedback': 'Submit feedback/bug report. Body: {type, title, description, severity?}.',
 '/api/feedback/crash': 'Submit client crash report (auto from error boundary).',
 '/api/credits': 'Current credit balance + plan info for user.',
 '/api/notifications': 'List in-app notifications (paginated).',
 '/api/settings/integrations/whatsapp/verify': 'Verify WhatsApp number via OTP and enable channel.',
 '/api/integrations/whatsapp/send-otp': 'Send WhatsApp OTP for number verification (Twilio/Meta).',
 '/api/telegram/send': 'Send a Telegram message to the linked chat (used by notification engine).',
 '/api/export': 'Export data (leads/report) as CSV/JSON. Query-driven.',
 '/api/ws': 'WebSocket upgrade/info endpoint for realtime updates.',
 '/api/sentry': 'Sentry error ingest tunnel (if configured).',
}

PREFIX = [
 ('/api/admin/', 'Admin-only management API. Requires role=admin/owner. Covers backups, billing ops (failed payments, webhooks, refunds), and feedback moderation (status, comments, analytics, crashes).'),
 ('/api/analytics/', 'Analytics engine: predictions, insights, anomalies, benchmarks, formulas, dashboard sharing, workflow/billing/lead analytics.'),
 ('/api/dashboard/', 'Dashboard widget data endpoints feeding the SPA: pipeline, revenue, forecasts, team, goals, tasks, notifications, telegram/whatsapp config views, AI copilot, exports, etc.'),
 ('/api/settings/', 'User settings: profile, password, sessions, notifications prefs, onboarding, appearance, organization & team management, API keys CRUD, integration linking, data export/delete requests.'),
 ('/api/leads/', 'Lead CRUD and operations: list/create/update/delete, import/export/merge, per-lead analysis, enrichment, research, notes, activities, reminders, stage moves, hot-lead endpoints, reply intelligence, scraping metrics.'),
 ('/api/gmail/', 'Gmail integration: OAuth connect/callback, inbox + threads sync, send/reply/draft, Pub/Sub setup + webhook, reply intelligence, tracking (pixel/click), unsubscribe, outreach-to-draft.'),
 ('/api/calendar/', 'Google Calendar integration + meeting scheduling support: events CRUD, availability, AI booking, intelligence, reminders, watch channels.'),
 ('/api/meetings/', 'Autonomous meeting orchestration: propose/confirm/reschedule/complete, intent detection, slot suggestions, prep, agenda, action items, objections, sentiment, follow-up emails, approvals.'),
 ('/api/payments/', 'Payments & billing operations: Stripe/Razorpay sessions and verification, invoices (list, download, generate, resend), refunds, retries, coupons, SSE payment status, provider status, webhook replay.'),
 ('/api/subscriptions/', 'Subscription lifecycle: current, cancel, trial, upgrade/downgrade preview, entitlements, usage, eligibility.'),
 ('/api/credits/', 'Credit balance and history.'),
 ('/api/entitlements/', 'Plan entitlement checks and quota reporting.'),
 ('/api/ai/', 'AI endpoints: chat (and streaming/cancel), analysis, scoring, outreach generation, RAG ingest/search/context, prompts, usage, costs, vector search.'),
 ('/api/autonomous/', 'Autonomous SDR pipeline: campaign CRUD/parse, research, classify reply, pipeline moves, send outreach.'),
 ('/api/outreach/', 'Outreach execution: send, batch, enroll in sequences, autonomy status/toggle.'),
 ('/api/sequences/', 'Outreach sequences: create/list/update, enroll/pause/resume, analytics, processing.'),
 ('/api/workflows/', 'Automation workflows: CRUD, execute, pause/resume/cancel/duplicate, executions (logs, retry, replay), dead-letter queue, templates, triggers, validation, metrics.'),
 ('/api/notifications/', 'In-app notifications: list, mark read/archive, push subscribe, VAPID keys.'),
 ('/api/whatsapp/', 'WhatsApp providers: Twilio connect/send/webhook and Meta Cloud API connect/send/webhook.'),
 ('/api/telegram/', 'Telegram bot: connect (link code), status, send, webhook.'),
 ('/api/integrations/', 'Integration hub: Gmail, Google (Calendar/Sheets-style), Telegram, WhatsApp connection status + OTP flows.'),
 ('/api/competitors/', 'Competitor intelligence: discover, analyze, snapshots, SEO/social/pricing/reviews/website insights, comparisons, opportunities.'),
 ('/api/company-research/', 'AI company research for a domain/lead.'),
 ('/api/website-score/', 'Standalone website quality scoring endpoint.'),
 ('/api/hot-leads/', 'Hot lead detection: feed + detect.'),
 ('/api/events/', 'Realtime event streams (SSE) for notifications, payments, workflows, messages, AI.'),
 ('/api/realtime/', 'Realtime connection status and recovery.'),
 ('/api/metrics/', 'Internal metrics exposure for monitoring.'),
 ('/api/audit/', 'Audit log query + export (admin/owner).'),
 ('/api/gdpr/', 'GDPR endpoints: consent, export, delete, DPA, policies, retention.'),
 ('/api/reports/', 'Advanced reports: CRUD, execute, export, schedule, templates.'),
 ('/api/messaging/', 'Messaging hub: broadcasts, templates, media, analytics.'),
 ('/api/messages/', 'Direct messages CRUD (conversations).'),
 ('/api/chat-sessions/', 'AI chat session listing/management.'),
 ('/api/email/', 'Email analytics, bounces, scheduling, open/click tracking endpoints.'),
 ('/api/insights/', 'Aggregated insights feed.'),
 ('/api/pipeline/', 'Pipeline overview data (stages + leads per stage).'),
 ('/api/deals/', 'Deals CRUD.'),
 ('/api/reminders/', 'Generic reminders API.'),
 ('/api/templates/', 'Message/email templates listing.'),
 ('/api/team/', 'Team member management + invitation accept/revoke.'),
 ('/api/export/', 'Data export (with preview).'),
 ('/api/gap-analysis/', 'Competitive gap analysis: score, remediation advice.'),
 ('/api/sales-assistant/', 'AI sales assistant endpoint.'),
 ('/api/sdr/', 'Autonomous SDR controls/status.'),
 ('/api/reply-intelligence/', 'Reply classification, buying signals, analytics.'),
 ('/api/reply-handler/', 'Handle inbound lead replies (auto-response pipeline).'),
 ('/api/autonomous-outreach/', 'Autonomous outreach generation/dispatch.'),
 ('/api/billing/', 'User-facing billing analytics/history/invoices.'),
 ('/api/payment', 'Payment endpoints (see /api/payments/).'),
]

def describe(path):
    if path in EXACT:
        return EXACT[path]
    for pref, d in PREFIX:
        if path.startswith(pref.rstrip('/')):
            return d
    return ''

def cat_of(path):
    seg = path.split('/')[2] if path.count('/') >= 2 else ''
    return seg if seg else 'root'

order = ['health','auth','google','calendar','gmail','integrations','leads','discovery','lead-discovery','website-score','company-research','hot-leads','ai','autonomous','autonomous-outreach','sdr','sales-assistant','outreach','sequences','email','gmail-tracking','meetings','calendar-2','notifications','events','realtime','ws','messaging','messages','chat-sessions','whatsapp','telegram','payments','billing','subscriptions','credits','entitlements','dashboard','analytics','reports','insights','pipeline','deals','competitors','gap-analysis','workflows','settings','team','admin','feedback','audit','gdpr','cron','export','metrics','sentry','reply','templates','reminders','root']

lines = []
lines.append('# AcquisitionOS — API Route Reference')
lines.append('')
lines.append(f'> Generated from `src/app/api/**/route.ts`. **{len(routes)} route files**. Auth column: `auth` = requires session cookie (JWT); `cron` = requires `Authorization: Bearer ${"CRON_SECRET"}`; `webhook` = provider-signature verified; `public/mixed` = no session required or mixed (some check session conditionally).')
lines.append('')
lines.append('Conventions:')
lines.append('- All handlers live in `route.ts` files under `src/app/api/` (Next.js App Router).')
lines.append('- Session auth = httpOnly cookie JWT (`access_token`, issued by `/api/auth/*`), verified via `getAuthUser()` in `src/lib/auth.ts`.')
lines.append('- Success responses are JSON; errors use `{ error: string }` with proper HTTP status codes.')
lines.append('- Cron endpoints accept `GET` with Bearer token or `?key=` and are meant for external schedulers.')
lines.append('')
lines.append('## Table of Contents')
lines.append('')

# group by category
groups = OrderedDict()
for r in routes:
    cat = cat_of(r['path'])
    groups.setdefault(cat, []).append(r)

for g in groups:
    lines.append(f"- [{g}](#{g.lower().replace(' ','-').replace('.','').replace('/','')}) — {len(groups[g])} routes")
lines.append('')
lines.append('---')
lines.append('')

for g in groups:
    lines.append(f'## {g}')
    lines.append('')
    lines.append('| Route | Methods | Auth | Description |')
    lines.append('|---|---|---|---|')
    for r in groups[g]:
        meth = ', '.join(r['methods']) or '—'
        desc = describe(r['path'])
        p = r['path'].replace('|', '\\|')
        d = desc.replace('|', '\\|')
        lines.append(f"| `{p}` | {meth} | {r['auth']} | {d} |")
    lines.append('')

out = '\n'.join(lines)
with open('/home/z/my-project/docs/06-api-reference/API-ROUTES.md', 'w') as f:
    f.write(out)
print(f"Wrote API-ROUTES.md: {len(out.splitlines())} lines, {len(out)} chars")
