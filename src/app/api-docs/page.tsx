import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Documentation — AcquisitionOS',
  description:
    'Complete reference for the AcquisitionOS REST API. Authentication, endpoints, rate limits per plan, code examples, error codes, and webhooks.',
};

// ═══════════════════════════════════════════════════════════════════
// Static API documentation data — kept on the server so the page can
// render fully even without a session (the page is opened in a new tab
// from the in-app API Keys panel and must be readable while logged in
// or not). All content is derived from the real routes in src/app/api/.
// ═══════════════════════════════════════════════════════════════════

const ENDPOINT_GROUPS: Array<{
  category: string;
  endpoints: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    scope: string;
    description: string;
  }>;
}> = [
  {
    category: 'Leads',
    endpoints: [
      { method: 'GET', path: '/api/leads', scope: 'leads.read', description: 'List all leads with filtering, sorting, and pagination' },
      { method: 'POST', path: '/api/leads', scope: 'leads.write', description: 'Create a new lead (subject to per-month plan limit when using API keys)' },
      { method: 'GET', path: '/api/leads/{id}', scope: 'leads.read', description: 'Get a specific lead with notes, analysis, activities, and scores' },
      { method: 'PUT', path: '/api/leads/{id}', scope: 'leads.write', description: 'Update a lead' },
      { method: 'DELETE', path: '/api/leads/{id}', scope: 'leads.write', description: 'Soft-delete a lead' },
      { method: 'GET', path: '/api/leads/search?q={query}', scope: 'leads.read', description: 'Search leads by name, email, niche, or city' },
      { method: 'GET', path: '/api/leads/export', scope: 'leads.read', description: 'Export leads data (CSV/JSON)' },
      { method: 'POST', path: '/api/leads/import', scope: 'leads.write', description: 'Bulk import leads' },
      { method: 'GET', path: '/api/leads/stats', scope: 'leads.read', description: 'Aggregate lead statistics' },
      { method: 'POST', path: '/api/leads/{id}/analyze', scope: 'ai.write', description: 'Trigger AI analysis for a lead' },
      { method: 'POST', path: '/api/leads/{id}/enrich', scope: 'leads.write', description: 'Enrich a lead with additional data' },
      { method: 'POST', path: '/api/leads/{id}/move-stage', scope: 'leads.write', description: 'Move a lead to a different pipeline stage' },
    ],
  },
  {
    category: 'Pipeline',
    endpoints: [
      { method: 'GET', path: '/api/pipeline', scope: 'workflows.read', description: 'Get pipeline view (leads grouped by stage)' },
      { method: 'GET', path: '/api/pipeline?stage={stage}', scope: 'workflows.read', description: 'Get leads for a specific stage' },
    ],
  },
  {
    category: 'Deals',
    endpoints: [
      { method: 'GET', path: '/api/deals', scope: 'leads.read', description: 'Get all deals with lead information' },
      { method: 'GET', path: '/api/deals/{id}', scope: 'leads.read', description: 'Get a specific deal' },
    ],
  },
  {
    category: 'AI Analysis',
    endpoints: [
      { method: 'POST', path: '/api/ai/analyze', scope: 'ai.write', description: 'Run AI analysis on leads or text' },
      { method: 'GET', path: '/api/ai/analysis/{leadId}', scope: 'ai.read', description: 'Get AI analysis result for a lead' },
      { method: 'POST', path: '/api/ai/score', scope: 'ai.write', description: 'Score a lead using the AI model' },
      { method: 'POST', path: '/api/ai/vector-search', scope: 'ai.read', description: 'Vector similarity search' },
      { method: 'POST', path: '/api/ai/rag/context', scope: 'ai.read', description: 'Get RAG context for a query' },
    ],
  },
  {
    category: 'Notifications',
    endpoints: [
      { method: 'GET', path: '/api/notifications', scope: 'leads.read', description: 'Fetch notifications for the authenticated user' },
      { method: 'PATCH', path: '/api/notifications', scope: 'leads.read', description: 'Mark notifications as read' },
      { method: 'POST', path: '/api/notifications/read', scope: 'leads.read', description: 'Mark a single notification as read' },
    ],
  },
  {
    category: 'Insights & Analytics',
    endpoints: [
      { method: 'GET', path: '/api/insights', scope: 'analytics.read', description: 'Get business insights and analytics' },
      { method: 'GET', path: '/api/analytics', scope: 'analytics.read', description: 'Get analytics overview' },
      { method: 'GET', path: '/api/messaging/analytics', scope: 'analytics.read', description: 'Get messaging analytics' },
    ],
  },
  {
    category: 'Competitors',
    endpoints: [
      { method: 'GET', path: '/api/competitor', scope: 'analytics.read', description: 'List competitor analyses' },
      { method: 'POST', path: '/api/competitor', scope: 'ai.write', description: 'Create a competitor analysis' },
      { method: 'GET', path: '/api/competitors', scope: 'analytics.read', description: 'List competitor records' },
      { method: 'POST', path: '/api/competitors/analyze', scope: 'ai.write', description: 'Run a competitor analysis' },
    ],
  },
  {
    category: 'Workflows',
    endpoints: [
      { method: 'GET', path: '/api/workflows', scope: 'workflows.read', description: 'List all workflows' },
      { method: 'POST', path: '/api/workflows', scope: 'workflows.write', description: 'Create a workflow' },
      { method: 'POST', path: '/api/workflows/{id}/execute', scope: 'workflows.write', description: 'Execute a workflow' },
    ],
  },
  {
    category: 'Outreach & Messages',
    endpoints: [
      { method: 'GET', path: '/api/messages', scope: 'messages.read', description: 'List messages' },
      { method: 'GET', path: '/api/outreach', scope: 'messages.read', description: 'List outreach campaigns' },
      { method: 'POST', path: '/api/outreach/send', scope: 'messages.write', description: 'Send an outreach message' },
    ],
  },
  {
    category: 'Settings / API Keys',
    endpoints: [
      { method: 'GET', path: '/api/settings/api-keys', scope: '(session only)', description: 'List your API keys — session auth required, never API key' },
      { method: 'POST', path: '/api/settings/api-keys', scope: '(session only)', description: 'Create a new API key — raw key is returned only once' },
      { method: 'DELETE', path: '/api/settings/api-keys/{id}', scope: '(session only)', description: 'Permanently delete an API key' },
      { method: 'POST', path: '/api/settings/api-keys/{id}/rotate', scope: '(session only)', description: 'Rotate an API key — old key revoked, new key returned' },
      { method: 'POST', path: '/api/settings/api-keys/{id}/revoke', scope: '(session only)', description: 'Revoke an API key (deactivates immediately)' },
      { method: 'GET', path: '/api/settings/api-keys/analytics', scope: '(session only)', description: 'Per-key usage analytics (24h/7d/30d, endpoint breakdown, status codes)' },
    ],
  },
];

const PLAN_LEAD_LIMITS = [
  { plan: 'Free', limit: '50 leads / month', features: 'Basic features only', price: '$0' },
  { plan: 'Pro', limit: '500 leads / month', features: 'All pro features', price: '$29/mo' },
  { plan: 'Elite', limit: '2,000 leads / month', features: 'All features', price: '$89/mo' },
];

const GENERAL_RATE_LIMITS = [
  { bucket: 'API key — burst', limit: '100 requests / minute', scope: 'Per key' },
  { bucket: 'API key — sustained', limit: '1,000 requests / hour (default)', scope: 'Per key, configurable up to 10,000' },
  { bucket: 'Auth endpoints', limit: '5 requests / minute', scope: 'Per IP — login, OTP, magic link' },
  { bucket: 'MFA endpoints', limit: '5 requests / minute', scope: 'Per IP — MFA verify/setup' },
  { bucket: 'Lead creation (API key)', limit: '50 / 500 / 2,000 per month', scope: 'Per key, plan-based (Free/Pro/Elite)' },
];

const ERROR_CODES = [
  { code: '400', name: 'Bad Request', description: 'The request body or query parameters are missing or invalid. The response includes an "error" field describing what is wrong.' },
  { code: '401', name: 'Unauthorized', description: 'No Authorization header was provided, or the API key was invalid, revoked, or disabled. Re-check your Bearer token.' },
  { code: '403', name: 'Forbidden', description: 'The API key does not have the required scope for this endpoint, or the user\'s plan does not include the feature (e.g. api_access on the Free plan).' },
  { code: '404', name: 'Not Found', description: 'The requested resource (lead, deal, workflow, etc.) does not exist or belongs to a different user / organization.' },
  { code: '429', name: 'Too Many Requests', description: 'Rate limit exceeded. Could be the per-minute burst limit, the per-hour sustained limit, or the per-month lead creation limit. Response includes X-RateLimit-Reset.' },
  { code: '500', name: 'Server Error', description: 'Internal server error. Our team is notified automatically; retry with exponential backoff. If it persists, contact support.' },
];

const WEBHOOKS = [
  {
    name: 'Stripe Webhook',
    method: 'POST',
    url: '/api/payments/webhook/stripe',
    auth: 'Stripe-Signature header (HMAC SHA256 with STRIPE_WEBHOOK_SECRET)',
    description:
      'Receives Stripe events for subscription and payment lifecycle. Events handled: checkout.session.completed, checkout.session.expired, charge.refunded, customer.subscription.updated, customer.subscription.deleted, invoice.payment_succeeded, invoice.payment_failed.',
    payload: `{
  "id": "evt_...",
  "type": "checkout.session.completed",
  "data": { "object": { "id": "cs_test_...", ... } },
  "created": 1700000000
}`,
    verification:
      'Compute HMAC SHA256 of the raw request body using STRIPE_WEBHOOK_SECRET, compare with the Stripe-Signature header (split by "," — each "t=...,v1=..." pair). Reject with 400 if no match. In production this is required; dev mode parses the JSON directly for testing.',
  },
  {
    name: 'Lead Reply Handler',
    method: 'POST',
    url: '/api/reply-handler',
    auth: 'Internal — called by the Gmail/IMAP sync pipeline (not publicly exposed for API keys)',
    description:
      'Processes an incoming email reply and matches it against an existing lead. Updates lead stage, extracts intent, and triggers downstream actions (meeting detection, follow-up).',
    payload: `{
  "from": "prospect@example.com",
  "subject": "Re: Quick question",
  "body": "Sure, let's schedule a call next Tuesday.",
  "threadId": "<gmail-thread-id>",
  "messageId": "<rfc822-message-id>",
  "userId": "<owner user id>"
}`,
    verification: 'Internal endpoint — protected by the user id required in the payload. Not signed like the Stripe webhook.',
  },
  {
    name: 'Gmail Pub/Sub Webhook',
    method: 'POST',
    url: '/api/gmail/pubsub/webhook',
    auth: 'Google OAuth 2.0 verification token (configured via Google Pub/Sub subscription)',
    description:
      'Receives Gmail Pub/Sub push notifications when new mail arrives in a connected inbox. Triggers reply processing for matched threads.',
    payload: `{
  "message": {
    "data": "<base64-encoded email notification>",
    "messageId": "...",
    "publishTime": "..."
  },
  "subscription": "projects/.../subscriptions/..."
}`,
    verification: 'Google Pub/Sub push endpoints verify via OAuth token or the verification token set on the subscription. Ensure your subscription URL is the deployed /api/gmail/pubsub/webhook endpoint.',
  },
];

// Sticky table-of-contents section list
const TOC_SECTIONS = [
  { id: 'authentication', label: 'Authentication' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'rate-limits', label: 'Rate Limits' },
  { id: 'code-examples', label: 'Code Examples' },
  { id: 'errors', label: 'Error Codes' },
  { id: 'webhooks', label: 'Webhooks' },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <code className="text-base font-mono font-semibold text-purple-600 dark:text-purple-400">aq_live_</code>
            <span className="text-sm text-muted-foreground hidden sm:inline truncate">AcquisitionOS API Reference</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/dashboard"
              className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-purple-500/5 to-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="space-y-3 max-w-3xl">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">AcquisitionOS API</h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              Programmatically create leads, run AI analysis, manage your pipeline, and trigger outreach.
              Authenticate with a Bearer API key and start building in minutes.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">Version 1.0.0</code>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">Bearer Token Auth</code>
              <code className="text-xs font-mono bg-muted px-2 py-1 rounded">REST + JSON</code>
            </div>
          </div>
        </div>
      </section>

      {/* Main content: sidebar + content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
          {/* Sticky sidebar TOC — hidden on small screens (mobile collapses) */}
          <aside className="hidden lg:block">
            <nav className="sticky top-20 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                On this page
              </p>
              {TOC_SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="block px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {s.label}
                </a>
              ))}
              <div className="pt-3 mt-3 border-t">
                <p className="text-xs text-muted-foreground px-3">
                  Open this page in a new tab from <strong>Settings → API Keys</strong> any time.
                </p>
              </div>
            </nav>
          </aside>

          {/* Content */}
          <div className="space-y-12 lg:max-w-3xl">
            {/* Authentication */}
            <section id="authentication" className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center text-sm font-mono">1</span>
                Authentication
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All API requests must include your API key as a Bearer token in the <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">Authorization</code> header.
                Keys are prefixed with <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">aq_live_</code> (real data) or <code className="font-mono bg-muted px-1 py-0.5 rounded text-xs">aq_test_</code> (sandbox).
                You can create keys in <strong>Settings → API Keys</strong>; the full raw key is shown only once.
              </p>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Developer Access must be enabled in Settings → API before creating API keys.</strong>{' '}
                  When Developer Access is OFF, API key creation is locked (existing API keys are preserved).
                  API documentation remains available regardless of this setting.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground mb-2">Example request — authenticate with Bearer token</p>
                <pre className="text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-all"><code>{`curl -X GET https://acquisition.space-z.ai/api/leads?limit=5 \\
  -H "Authorization: Bearer aq_live_4f8e2c1b9a3d7e6f5c2b1a0d8e7f6c5b4a3d2e1f0c9b8a7d6e5f4c3b2a1d0e" \\
  -H "Content-Type: application/json"`}</code></pre>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Live key format</p>
                  <code className="text-xs font-mono text-muted-foreground break-all">aq_live_</code>
                  <span className="text-xs text-muted-foreground"> + 64 hex chars</span>
                  <p className="text-xs text-muted-foreground mt-2">Operates on real data. Use with caution.</p>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Test key format</p>
                  <code className="text-xs font-mono text-muted-foreground break-all">aq_test_</code>
                  <span className="text-xs text-muted-foreground"> + 64 hex chars</span>
                  <p className="text-xs text-muted-foreground mt-2">Sandbox mode — no real data is modified.</p>
                </div>
              </div>

              <div className="rounded-lg border bg-amber-500/5 p-4">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Security notes</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Only the SHA-256 hash of your key is stored — the raw key cannot be retrieved after creation.</li>
                  <li>Keys are scoped. Request an endpoint outside your key&apos;s scope and you will get a 403.</li>
                  <li>Lost a key? Rotate it in Settings → API Keys; the old key is revoked immediately.</li>
                  <li>Never commit your key to git or include it in client-side code.</li>
                </ul>
              </div>
            </section>

            {/* Endpoints */}
            <section id="endpoints" className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center text-sm font-mono">2</span>
                Endpoints
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All paths are relative to the application base URL. The full list of supported endpoints (with required scopes) is below.
                Endpoints marked <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">(session only)</code> are not callable with an API key — they require an interactive session.
              </p>

              <div className="space-y-5">
                {ENDPOINT_GROUPS.map((group) => (
                  <div key={group.category}>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2">
                      {group.category}
                    </h3>
                    <div className="rounded-lg border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 w-16">Method</th>
                              <th className="text-left font-medium text-muted-foreground px-3 py-2">Path</th>
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Scope</th>
                              <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.endpoints.map((ep) => (
                              <tr key={ep.method + ep.path} className="border-t">
                                <td className="px-3 py-2">
                                  <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                    ep.method === 'GET' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                    : ep.method === 'POST' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                    : ep.method === 'DELETE' ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                                    : ep.method === 'PUT' || ep.method === 'PATCH' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                    : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {ep.method}
                                  </span>
                                </td>
                                <td className="px-3 py-2"><code className="font-mono break-all">{ep.path}</code></td>
                                <td className="px-3 py-2 hidden sm:table-cell">
                                  <span className="font-mono text-[10px] text-muted-foreground">{ep.scope}</span>
                                </td>
                                <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{ep.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Rate limits */}
            <section id="rate-limits" className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center text-sm font-mono">3</span>
                Rate Limits
              </h2>

              <p className="text-sm text-muted-foreground leading-relaxed">
                Rate limits are applied per API key and per plan. When you exceed a limit you will receive an HTTP
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded mx-1">429</code> response with the
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded mx-1">X-RateLimit-Remaining: 0</code>
                header and an <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded mx-1">X-RateLimit-Reset</code> unix timestamp.
              </p>

              <div>
                <h3 className="text-sm font-semibold mb-2">Lead creation limit per plan (API key only)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  When authenticated via an API key (not a session cookie), <strong>POST /api/leads</strong> enforces a
                  per-month limit based on the key owner&apos;s plan. Counts successful (HTTP 201) creations in the last 30 days.
                </p>
                <div className="rounded-lg border overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2">Plan</th>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2">Lead Limit</th>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Features</th>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PLAN_LEAD_LIMITS.map((p) => (
                        <tr key={p.plan} className="border-t">
                          <td className="px-3 py-2 font-medium">{p.plan}</td>
                          <td className="px-3 py-2 font-mono">{p.limit}</td>
                          <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{p.features}</td>
                          <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{p.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">General rate limits</h3>
                <div className="rounded-lg border overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2">Bucket</th>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2">Limit</th>
                        <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GENERAL_RATE_LIMITS.map((r) => (
                        <tr key={r.bucket} className="border-t">
                          <td className="px-3 py-2 font-medium">{r.bucket}</td>
                          <td className="px-3 py-2 font-mono">{r.limit}</td>
                          <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{r.scope}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Rate limit response headers</h3>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                    <code className="font-mono text-xs text-purple-600 dark:text-purple-400 shrink-0 sm:min-w-[200px]">X-RateLimit-Limit</code>
                    <span className="text-xs text-muted-foreground">Maximum requests allowed in the current window.</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                    <code className="font-mono text-xs text-purple-600 dark:text-purple-400 shrink-0 sm:min-w-[200px]">X-RateLimit-Remaining</code>
                    <span className="text-xs text-muted-foreground">Requests remaining in the current window.</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3">
                    <code className="font-mono text-xs text-purple-600 dark:text-purple-400 shrink-0 sm:min-w-[200px]">X-RateLimit-Reset</code>
                    <span className="text-xs text-muted-foreground">Unix timestamp (seconds) when the window resets.</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Code examples */}
            <section id="code-examples" className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center text-sm font-mono">4</span>
                Code Examples
              </h2>
              <p className="text-sm text-muted-foreground">
                Examples for the two most common operations — <strong>create a lead</strong> and <strong>list leads</strong>.
                Replace <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">aq_live_YOUR_KEY_HERE</code> with your own key.
              </p>

              {/* cURL */}
              <div>
                <h3 className="text-sm font-semibold mb-2">cURL</h3>
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/30 overflow-hidden">
                    <div className="px-3 py-2 border-b bg-muted/50 text-xs font-medium">List leads</div>
                    <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto"><code>{`curl -X GET https://acquisition.space-z.ai/api/leads?limit=10 \\
  -H "Authorization: Bearer aq_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json"`}</code></pre>
                  </div>
                  <div className="rounded-lg border bg-muted/30 overflow-hidden">
                    <div className="px-3 py-2 border-b bg-muted/50 text-xs font-medium">Create a lead</div>
                    <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto"><code>{`curl -X POST https://acquisition.space-z.ai/api/leads \\
  -H "Authorization: Bearer aq_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "businessName": "Acme Corp",
    "email": "hello@acme.com",
    "niche": "SaaS",
    "country": "US",
    "city": "San Francisco",
    "website": "https://acme.com"
  }'`}</code></pre>
                  </div>
                </div>
              </div>

              {/* JavaScript */}
              <div>
                <h3 className="text-sm font-semibold mb-2">JavaScript (fetch)</h3>
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/50 text-xs font-medium">List & create leads</div>
                  <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto"><code>{`const BASE_URL = 'https://acquisition.space-z.ai';
const API_KEY = 'aq_live_YOUR_KEY_HERE';

const headers = {
  'Authorization': \`Bearer \${API_KEY}\`,
  'Content-Type': 'application/json',
};

// List the first 10 leads
async function listLeads() {
  const res = await fetch(\`\${BASE_URL}/api/leads?limit=10\`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(\`API error \${res.status}: \${err.error}\`);
  }
  return res.json();
}

// Create a new lead
async function createLead(data) {
  const res = await fetch(\`\${BASE_URL}/api/leads\`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  if (res.status === 429) {
    const err = await res.json();
    throw new Error(\`Monthly lead limit reached (\${err.used}/\${err.limit}). Upgrade your plan.\`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(\`API error \${res.status}: \${err.error}\`);
  }
  return res.json();
}

// Usage
const { leads, pagination } = await listLeads();
const newLead = await createLead({
  businessName: 'Acme Corp',
  email: 'hello@acme.com',
  niche: 'SaaS',
  country: 'US',
});`}</code></pre>
                </div>
              </div>

              {/* Python */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Python (requests)</h3>
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/50 text-xs font-medium">List & create leads</div>
                  <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto"><code>{`import requests

BASE_URL = "https://acquisition.space-z.ai"
API_KEY = "aq_live_YOUR_KEY_HERE"

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def list_leads(**params):
    """List leads with optional filtering."""
    r = requests.get(f"{BASE_URL}/api/leads", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def create_lead(data):
    """Create a new lead. Raises HTTPError with the plan limit on 429."""
    r = requests.post(f"{BASE_URL}/api/leads", headers=HEADERS, json=data)
    if r.status_code == 429:
        body = r.json()
        raise requests.HTTPError(
            f"Monthly lead limit reached ({body['used']}/{body['limit']}). "
            f"Upgrade your plan."
        )
    r.raise_for_status()
    return r.json()


# Usage
if __name__ == "__main__":
    leads = list_leads(limit=10)
    print(leads)

    new_lead = create_lead({
        "businessName": "Acme Corp",
        "email": "hello@acme.com",
        "niche": "SaaS",
        "country": "US",
    })
    print(new_lead)`}</code></pre>
                </div>
              </div>

              {/* Sample response */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Sample response — POST /api/leads</h3>
                <div className="rounded-lg border bg-muted/30 overflow-hidden">
                  <pre className="p-3 text-xs font-mono leading-relaxed overflow-x-auto"><code>{`// HTTP/1.1 201 Created
{
  "id": "clx9k2p3h0000p8x4n2qrs1tv",
  "businessName": "Acme Corp",
  "ownerName": null,
  "email": "hello@acme.com",
  "niche": "SaaS",
  "country": "US",
  "city": "San Francisco",
  "stage": "discovered",
  "hasWebsite": true,
  "website": "https://acme.com",
  "estimatedQuality": "medium",
  "estimatedRevenue": "medium",
  "replyScore": 0,
  "conversionScore": 0,
  "urgencyScore": 0,
  "revenuePotentialScore": 0,
  "createdAt": "2026-06-18T12:34:56.789Z",
  "updatedAt": "2026-06-18T12:34:56.789Z"
}`}</code></pre>
                </div>
              </div>
            </section>

            {/* Error codes */}
            <section id="errors" className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center text-sm font-mono">5</span>
                Error Codes
              </h2>
              <p className="text-sm text-muted-foreground">
                Every error response uses a consistent JSON envelope:
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded mx-1">{"{ \"error\": \"...\", \"code\": \"...\" }"}</code>
                plus optional fields depending on the error type (e.g. <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">limit</code>,
                <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">used</code> on 429 lead-limit responses).
              </p>
              <div className="rounded-lg border overflow-hidden overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2 w-16">Code</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2 w-40">Name</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ERROR_CODES.map((e) => (
                      <tr key={e.code} className="border-t">
                        <td className="px-3 py-2">
                          <span className={`font-mono text-xs px-1.5 py-0.5 rounded font-semibold ${
                            parseInt(e.code, 10) >= 500 ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                            : parseInt(e.code, 10) >= 400 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          }`}>{e.code}</span>
                        </td>
                        <td className="px-3 py-2 font-medium">{e.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{e.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Webhooks */}
            <section id="webhooks" className="scroll-mt-20 space-y-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <span className="h-7 w-7 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center text-sm font-mono">6</span>
                Webhooks
              </h2>
              <p className="text-sm text-muted-foreground">
                AcquisitionOS accepts incoming webhooks for payment processing and email reply handling.
                These endpoints are <strong>not</strong> callable with an API key — they use signature verification instead.
              </p>
              <div className="space-y-4">
                {WEBHOOKS.map((w) => (
                  <div key={w.name} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="text-sm font-semibold">{w.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">{w.method}</span>
                        <code className="font-mono text-xs">{w.url}</code>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{w.description}</p>
                    <div>
                      <p className="text-xs font-medium mb-1">Authentication / verification</p>
                      <p className="text-xs text-muted-foreground">{w.auth}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-1">Verification details</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{w.verification}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-1">Example payload</p>
                      <pre className="rounded-md border bg-muted/30 p-3 text-[11px] font-mono leading-relaxed overflow-x-auto"><code>{w.payload}</code></pre>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Footer */}
            <footer className="pt-8 mt-8 border-t text-xs text-muted-foreground space-y-1">
              <p>
                The AcquisitionOS REST API is the same API the dashboard uses — every dashboard action maps to one of the endpoints above.
              </p>
              <p>
                Need help? Open a feedback report from the dashboard, or contact your account manager. For plan-specific limits, see <strong>Settings → Billing</strong>.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
