#!/usr/bin/env python3
"""Generate /docs/02-architecture/DATABASE-SCHEMA.md from prisma/schema.prisma (parsed JSON)."""
import json, re

with open('/home/z/my-project/scripts/schema-parsed.json') as f:
    data = json.load(f)

# Purpose map: model -> (purpose, category)
PURPOSE = {
 'User': ('Root identity entity. Stores credentials, plan, credits, OTP/magic-link tokens, and links to every other table.', 'Auth & Users'),
 'UserSession': ('One row per active login session (refresh token). Enables session listing and revocation.', 'Auth & Users'),
 'LoginHistory': ('Audit of every sign-in attempt (success/failure, IP, geo) used for security alerts and suspicious-login detection.', 'Auth & Users'),
 'MfaConfig': ('Encrypted TOTP secret + hashed backup codes for a user who enabled Multi-Factor Auth.', 'Auth & Users'),
 'Organization': ('Tenant/workspace for teams: branding, custom domain, custom pipeline stages.', 'Organizations'),
 'OrgMember': ('Membership join table User<->Organization with role (owner/admin/member/viewer).', 'Organizations'),
 'OrgInvitation': ('Pending email invitations to join an organization, with unique token and expiry.', 'Organizations'),
 'Subscription': ('Current plan state per user: status lifecycle (trialing/active/past_due/canceled/expired), Stripe/Razorpay IDs, period bounds, credit counters.', 'Billing & Payments'),
 'CreditsLedger': ('Append-only credit transaction log (add/deduct) with running balance and reference to the entity that caused it.', 'Billing & Payments'),
 'CreditAddon': ('One-time credit packs purchased on top of a plan; optional expiry.', 'Billing & Payments'),
 'PaymentOrder': ('A checkout attempt via Stripe or Razorpay with amount, tax/GST, coupon, idempotency key.', 'Billing & Payments'),
 'PaymentWebhook': ('Raw webhook events received from payment providers, deduplicated by eventId, with processing status/error.', 'Billing & Payments'),
 'Invoice': ('Generated invoice (1:1 with PaymentOrder) with tax breakdown, line items JSON, HTML content and PDF URL.', 'Billing & Payments'),
 'Coupon': ('Discount codes (percent or fixed), usage caps, plan restrictions.', 'Billing & Payments'),
 'TaxRate': ('Per-country/region tax rates (GST/VAT) applied at checkout.', 'Billing & Payments'),
 'UsageTracking': ('Per-user per-feature usage counters within a billing period (entitlement enforcement).', 'Billing & Payments'),
 'FeatureFlag': ('Global feature toggles, optionally restricted to plan list.', 'Platform Config'),
 'PlanEntitlement': ('Matrix of plan -> feature -> numeric limit (null = unlimited) used by entitlement middleware.', 'Platform Config'),
 'Lead': ('Central sales prospect record: business info, contact channels, website quality, AI scores (reply/conversion/urgency/revenue), pipeline stage, email status.', 'Leads & Pipeline'),
 'LeadAnalysis': ('AI deep-analysis result for one lead (1:1): website/digital maturity scores, weaknesses, decision maker profile, recommended services, deal value estimates.', 'Leads & Pipeline'),
 'LeadScore': ('Explainable score components attached to a lead.', 'Leads & Pipeline'),
 'LeadNote': ('Free-form notes on a lead.', 'Leads & Pipeline'),
 'PipelineStage': ('Default pipeline stage definition per user.', 'Leads & Pipeline'),
 'PipelineCustomStage': ('Organization-defined custom pipeline stage.', 'Leads & Pipeline'),
 'OutreachMessage': ('Single outreach email generated/sent to a lead, with subject/body, status and tracking data.', 'Outreach & Email'),
 'OutreachSequence': ('Named multi-step outreach sequence owned by a user.', 'Outreach & Email'),
 'SequenceStep': ('One step in a sequence (delay, template).', 'Outreach & Email'),
 'SequenceEnrollment': ('A lead enrolled in a sequence with progress tracking.', 'Outreach & Email'),
 'EmailAccount': ('Connected sending mailbox (OAuth Gmail or SMTP) per user.', 'Outreach & Email'),
 'EmailThread': ('Conversation thread grouping email messages.', 'Outreach & Email'),
 'EmailMessage': ('Individual email in a thread (direction, content, read status).', 'Outreach & Email'),
 'EmailBounce': ('Bounce record for a sent email with type/reason.', 'Outreach & Email'),
 'EmailUnsubscribe': ('Per-lead/user unsubscribe record honoring opt-out.', 'Outreach & Email'),
 'Conversation': ('Messaging conversation with a lead (cross-channel).', 'Conversations & Messaging'),
 'ConversationMessage': ('Message inside a conversation.', 'Conversations & Messaging'),
 'TelegramConfig': ('User Telegram integration: bot token/chat id, link code, notification prefs.', 'Integrations'),
 'WhatsappConfig': ('User WhatsApp integration (Twilio or Meta Cloud API): credentials, verified number, OTP state, prefs.', 'Integrations'),
 'Notification': ('In-app notification row (type, title, body, read/archived).', 'Notifications'),
 'NotificationPreferences': ('Per-user channel preferences (in-app/email/telegram/whatsapp/push) per event type.', 'Notifications'),
 'AiChatSession': ('AI assistant chat session (title, context lead).', 'AI'),
 'AiChatMessage': ('Message in an AI chat session (role, content, tokens).', 'AI'),
 'WorkflowDefinition': ('Automation workflow: trigger config + steps JSON, enabled state.', 'Workflows'),
 'WorkflowStep': ('Ordered step rows composing a workflow.', 'Workflows'),
 'WorkflowExecution': ('One run of a workflow with status, timings, output/error.', 'Workflows'),
 'WorkflowLog': ('Log lines for a workflow execution (level, message, data).', 'Workflows'),
 'WorkflowTemplate': ('Reusable prebuilt workflow templates.', 'Workflows'),
 'CompetitorData': ('Raw scraped competitor datapoint.', 'Competitor Intelligence'),
 'CompetitorAnalysis': ('AI competitor analysis for a user: competitors list, SWOT/pricing/SEO/social insights JSON.', 'Competitor Intelligence'),
 'AuditLog': ('Security-relevant action audit (who, what, target, IP).', 'Audit & Compliance'),
 'SystemEvent': ('System-level event stream entries (startup, errors, jobs).', 'Audit & Compliance'),
 'ApiKey': ('User-generated API keys (hashed) with scopes, rotation and expiry.', 'Audit & Compliance'),
 'ApiKeyUsage': ('Per-request usage rows for API keys.', 'Audit & Compliance'),
 'GdprRequest': ('GDPR data subject requests (export/delete) and their processing state.', 'Audit & Compliance'),
 'DataExport': ('Generated user data export files (GDPR Art. 20).', 'Audit & Compliance'),
 'OnboardingProgress': ('Step-by-step onboarding checklist state per user.', 'Audit & Compliance'),
 'Communication': ('Legacy CRM communication log entry tied to a lead (kept for existing UI).', 'CRM (Legacy Compatibility)'),
 'Deal': ('Deal/opportunity record with value and stage linked to lead.', 'CRM (Legacy Compatibility)'),
 'LeadActivity': ('Activity timeline entries for leads.', 'CRM (Legacy Compatibility)'),
 'FollowUpReminder': ('Reminder to follow up on a lead at a future time.', 'CRM (Legacy Compatibility)'),
 'Insight': ('Simple stored insight strings shown in UI.', 'CRM (Legacy Compatibility)'),
 'UserSettings': ('Wide per-user settings table (profile, notifications, integrations flags, meeting provider, autonomy mode...).', 'CRM (Legacy Compatibility)'),
 'GoogleCalendarToken': ('OAuth tokens for a user\'s Google Calendar (access/refresh, scopes, expiry).', 'Calendar & Meetings'),
 'CalendarWatch': ('Google Calendar push-notification watch channels (channel id, expiry).', 'Calendar & Meetings'),
 'Meeting': ('Meeting orchestrated by the platform: lead, proposed/confirmed slots, provider link, status lifecycle, AI prep/notes.', 'Calendar & Meetings'),
 'MeetingIntentLog': ('Detected scheduling intent from lead replies with confidence and extracted entities.', 'Calendar & Meetings'),
 'DiscoveryJob': ('A lead-discovery run: query params, status, counts found/analyzed/qualified, error.', 'Lead Discovery'),
 'SecurityAlert': ('Raised security alerts for a user (new device, suspicious login, lock).', 'Security'),
 'KnownDevice': ('Fingerprinted trusted devices per user.', 'Security'),
 'SystemMetrics': ('Point-in-time system metrics (memory, latency, counts) for monitoring.', 'Monitoring'),
 'AiCostRecord': ('Per-call AI cost accounting: provider, model, tokens, estimated cost, feature.', 'AI'),
 'PromptTemplate': ('Reusable AI prompt templates per user/feature.', 'AI'),
 'FileContext': ('Files uploaded to give AI chat additional context (parsed text).', 'AI'),
 'ProxyEndpoint': ('Rotating proxy pool endpoints with health stats for scraping.', 'Scraping Infrastructure'),
 'ScrapingMetric': ('Scrape attempt outcomes for observability (success, duration, blocks).', 'Scraping Infrastructure'),
 'RealtimeEvent': ('Persisted realtime events delivered over WebSocket/SSE.', 'Realtime'),
 'WsConnection': ('Active WebSocket connection registry.', 'Realtime'),
 'SseConnection': ('Active Server-Sent-Events connection registry.', 'Realtime'),
 'MediaFile': ('Uploaded media for messaging (images/docs) with metadata.', 'Messaging Hub'),
 'MessageBroadcast': ('Bulk message campaign across channels with scheduling.', 'Messaging Hub'),
 'BroadcastTarget': ('Per-recipient row of a broadcast with delivery state.', 'Messaging Hub'),
 'MessageTemplateApproval': ('Approval workflow for message templates (esp. WhatsApp).', 'Messaging Hub'),
 'ScheduledEmail': ('Email scheduled for future sending with status and send attempt info.', 'Email Scheduling & Tracking'),
 'EmailOpenEvent': ('Tracking-pixel open events (timestamp, UA, IP).', 'Email Scheduling & Tracking'),
 'EmailClickEvent': ('Link click events from tracked links.', 'Email Scheduling & Tracking'),
 'EmailTrackingLink': ('Wrapped tracking links generated for emails.', 'Email Scheduling & Tracking'),
 'MeetingReminder': ('Queued reminder for a meeting (channel, scheduledFor, sent).', 'Calendar & Meetings'),
 'MessageDelivery': ('Cross-channel delivery record with full lifecycle (pending->queued->sent->delivered->read / failed->bounced) and provider receipts.', 'Messaging Hub'),
 'DeliveryDeadLetter': ('Dead-letter queue for failed message deliveries after retries.', 'Messaging Hub'),
 'FeedbackReport': ('User-submitted feedback/bug report with category, severity, screenshots, admin status + assignment.', 'Feedback & Support'),
 'FeedbackComment': ('Discussion comments on a feedback report.', 'Feedback & Support'),
 'FeedbackStatusLog': ('Status change history of a feedback report.', 'Feedback & Support'),
 'CrashReport': ('Client crash reports (stack, browser, url) for debugging.', 'Feedback & Support'),
 'AcquisitionCampaign': ('Campaign grouping discovery+outreach efforts with budget/goals.', 'Campaigns & Reporting'),
 'Report': ('Saved report definition + last result (scheduled or on-demand).', 'Campaigns & Reporting'),
 'CompetitorSnapshot': ('Point-in-time snapshot of a competitor website/pricing.', 'Campaigns & Reporting'),
 'MessageTemplate': ('Reusable message templates for outreach/messaging.', 'Campaigns & Reporting'),
 'AnalyticsPrediction': ('ML-style predictions (revenue, churn, pipeline) with confidence.', 'Analytics Engine'),
 'AnalyticsInsight': ('Auto-generated insights for dashboards.', 'Analytics Engine'),
 'AnalyticsAnomaly': ('Detected anomalies in metrics with severity.', 'Analytics Engine'),
 'DashboardShare': ('Shared dashboard links (token, scope, expiry).', 'Analytics Engine'),
 'AnalyticsFormula': ('Custom metric formulas defined by user.', 'Analytics Engine'),
 'RagDocument': ('Documents ingested for RAG context (source, chunks, embeddings meta).', 'Analytics Engine'),
 'AnalyticsBenchmark': ('Benchmark comparisons (industry/region).', 'Analytics Engine'),
 'AnalyticsSnapshot': ('Periodic snapshot of dashboard metrics for trend history.', 'Analytics Engine'),
}

CATS = ['Auth & Users','Organizations','Billing & Payments','Platform Config','Leads & Pipeline','Outreach & Email','Conversations & Messaging','Integrations','Notifications','AI','Workflows','Competitor Intelligence','Audit & Compliance','CRM (Legacy Compatibility)','Calendar & Meetings','Lead Discovery','Security','Monitoring','Scraping Infrastructure','Realtime','Messaging Hub','Email Scheduling & Tracking','Feedback & Support','Campaigns & Reporting','Analytics Engine']

def fmt_type(t):
    return t.replace('String?', 'String?').strip()

lines = []
lines.append('# AcquisitionOS — Database Schema Reference')
lines.append('')
lines.append('> Generated from `prisma/schema.prisma` (v2.0). **104 models**, datasource **SQLite** (`DATABASE_URL`), with annotated migration path to PostgreSQL. Every model and field below is taken verbatim from the schema file.')
lines.append('')
lines.append('## Legend')
lines.append('')
lines.append('- `?` suffix = nullable field. `@default(...)` shown where declared.')
lines.append('- JSON-typed columns are stored as `String` containing JSON (SQLite). Marked `// JSON` in schema.')
lines.append('- `Cascade` = row deleted when parent deleted; `SetNull` = FK nulled on parent delete.')
lines.append('')
lines.append('## Categories')
lines.append('')
for c in CATS:
    n = sum(1 for m in data['models'] if m['name'] in PURPOSE and PURPOSE[m['name']][1] == c)
    if n: lines.append(f'- **{c}** — {n} models')
lines.append('')
lines.append('---')
lines.append('')

for m in data['models']:
    purpose, cat = PURPOSE.get(m['name'], ('', 'Other'))
    rel = m['relations']
    lines.append(f"## `{m['name']}`")
    lines.append(f"*Category: {cat} · defined at schema line {m['line']}*")
    lines.append('')
    lines.append(f"**Purpose:** {purpose}")
    lines.append('')
    if m['fields']:
        lines.append('| Field | Type | Attributes / Default |')
        lines.append('|---|---|---|')
        for f2 in m['fields']:
            attrs = f2.get('attrs', '')
            comment = f2.get('comment', '')
            extra = ''
            if attrs:
                extra = '`' + attrs.replace('|', '\\|') + '`'
            if comment:
                extra += (' — ' + comment) if extra else comment
            lines.append(f"| `{f2['name']}` | `{f2['type']}` | {extra} |")
    if rel:
        lines.append('')
        lines.append('**Relations:**')
        for r in rel:
            lines.append(f"- `{r['name']}` → `{r['type']}`")
    if m['indexes']:
        lines.append('')
        lines.append('**Indexes/constraints:** ' + ' · '.join('`' + i.replace('|','\\|') + '`' for i in m['indexes']))
    lines.append('')

out = '\n'.join(lines)
with open('/home/z/my-project/docs/02-architecture/DATABASE-SCHEMA.md', 'w') as f:
    f.write(out)
print(f"Wrote DATABASE-SCHEMA.md: {len(out.splitlines())} lines, {len(out)} chars")
