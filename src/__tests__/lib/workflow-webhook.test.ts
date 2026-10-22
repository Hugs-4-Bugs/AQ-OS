// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Webhook Call Hardening (Oct 2026 "fetch failed" incident)
//
// THE BUG this suite locks down: a workflow step 1 webhook_call to a
// placeholder URL (https://api.example.com/search/dental_clinics) failed
// with the opaque "Webhook call failed: fetch failed" — Node hides the
// real cause (DNS ENOTFOUND for a reserved documentation domain) in
// error.cause, which the runtime never surfaced. The run died at 0/6
// steps with zero actionable guidance.
//
// Covers:
//   1. validateWebhookUrl — placeholder/malformed/non-http URLs rejected
//      with actionable messages BEFORE any network I/O; real hosts,
//      localhost, and .test TLDs stay VALID (compat with the existing
//      suite's https://x.test fixtures).
//   2. describeWebhookFetchError — the REAL cause (ENOTFOUND,
//      ECONNREFUSED, timeout, TLS) is surfaced with host/port; the errno
//      token is preserved so workflow-retry's transient classifier still
//      sees it.
//   3. executeAction('webhook_call') against a REAL local HTTP server
//      (node:http) — REAL fetch, REAL requests, NO mocks on the HTTP
//      path: GET params → query string with NO body, POST body shape,
//      custom headers, non-2xx honesty, placeholder fast-fail, real
//      connection-refused surfacing, and the bounded timeout.
//   4. validateDefinition — a webhook step with a placeholder URL is
//      rejected at pre-flight (Run Now) with a repair message.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';

// ── Storage-boundary mocks ONLY — the HTTP path is 100% real ───────
const mocks = vi.hoisted(() => ({
  db: {
    outreachMessage: { create: vi.fn() },
    lead: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
  },
  resolveLeadForExecution: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('@/lib/lead-resolution', () => ({ resolveLeadForExecution: mocks.resolveLeadForExecution }));
vi.mock('@/lib/daily-outreach-quota', () => ({
  reserveDailyOutreachSend: vi.fn(async () => ({ ok: true })),
  DAILY_OUTREACH_LIMIT_EXCEEDED: 'DAILY_OUTREACH_LIMIT_EXCEEDED',
}));
vi.mock('@/lib/ai/sender-signature', () => ({
  buildSenderSignatureBlock: vi.fn(() => ''),
  applySenderSignature: vi.fn((_p: unknown, s: unknown) => String(s ?? '')),
}));
vi.mock('@/lib/ai/outreach-generator', () => ({ loadSenderProfile: vi.fn(async () => null) }));
vi.mock('@/lib/personal-context', () => ({ buildPersonalContextBlockForUser: vi.fn(async () => '') }));

// REAL modules under test
import { executeAction } from '@/lib/workflow-actions';
import {
  validateWebhookUrl,
  describeWebhookFetchError,
  webhookTimeoutMs,
} from '@/lib/workflow-webhook';
import { validateDefinition } from '@/lib/workflow-validation';
import { classifyStepError } from '@/lib/workflow-retry';

// ── REAL local HTTP server (no mock transport) ────────────────────
interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let server: Server;
let serverUrl: string;
const recorded: RecordedRequest[] = [];
let serverBehavior: 'ok' | 'error500' | 'slow' | 'echo' = 'ok';

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      recorded.push({
        method: req.method || '?',
        url: req.url || '/',
        headers: req.headers,
        body,
      });
      if (serverBehavior === 'error500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal' }));
        return;
      }
      if (serverBehavior === 'slow') {
        // Slower than the test's timeout budget — exercises the abort path.
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ late: true }));
        }, 800);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, seen: body ? 'body' : 'no-body' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const context = {
  userId: 'user_1',
  workflowId: 'wf_1',
  executionId: 'exec_1',
  leadId: 'lead_1',
  triggerData: { leadName: 'Sagar Hospitals' },
};

beforeEach(() => {
  recorded.length = 0;
  serverBehavior = 'ok';
});

// ═══ validateWebhookUrl ═══════════════════════════════════════════

describe('validateWebhookUrl', () => {
  it('rejects the incident placeholder api.example.com with actionable guidance', () => {
    const check = validateWebhookUrl('https://api.example.com/search/dental_clinics');
    expect(check.valid).toBe(false);
    expect(check.error).toContain('reserved documentation domain');
    expect(check.error).toContain('api.example.com');
    expect(check.error).toContain('replace it with the real endpoint URL');
  });

  it('rejects example.net / example.org and their subdomains', () => {
    for (const url of ['https://example.net/hook', 'http://sub.example.org/hook', 'https://a.b.example.com/']) {
      const check = validateWebhookUrl(url);
      expect(check.valid, url).toBe(false);
      expect(check.error).toContain('reserved documentation domain');
    }
  });

  it('rejects missing / blank / relative / non-http URLs with clear reasons', () => {
    expect(validateWebhookUrl(undefined).error).toContain('no URL is configured');
    expect(validateWebhookUrl('   ').error).toContain('no URL is configured');
    expect(validateWebhookUrl('/api/relative').error).toContain('not a valid absolute URL');
    expect(validateWebhookUrl('ftp://files.example.dev/x').error).toContain('unsupported scheme');
  });

  it('accepts real hosts, localhost, loopback IPs, and .test TLD fixtures', () => {
    for (const url of [
      'https://hooks.acme.io/api',
      'http://localhost:3000/api/leads',
      'http://127.0.0.1:8080/hook',
      'https://x.test/hook',            // existing suite fixture — stays valid
      'https://provider.integration.test/x',
    ]) {
      expect(validateWebhookUrl(url).valid, url).toBe(true);
      expect(validateWebhookUrl(url).url).toBeInstanceOf(URL);
    }
  });
});

// ═══ describeWebhookFetchError ════════════════════════════════════

describe('describeWebhookFetchError', () => {
  /** Reproduce undici's wrapper: TypeError("fetch failed") with cause. */
  const wrapped = (code: string, extra: Record<string, unknown> = {}) => {
    const cause = Object.assign(new Error(`${code} mock`), { code, ...extra });
    const outer: Error & { cause?: unknown } = new TypeError('fetch failed');
    outer.cause = cause;
    return outer;
  };

  it('surfaces ENOTFOUND with the hostname (the incident root cause)', () => {
    const msg = describeWebhookFetchError(wrapped('ENOTFOUND', { hostname: 'api.example.com' }));
    expect(msg).toContain('DNS lookup failed');
    expect(msg).toContain('api.example.com');
    expect(msg).toContain('[ENOTFOUND]');
    expect(msg).not.toBe('fetch failed');
  });

  it('surfaces ECONNREFUSED with host and port', () => {
    const msg = describeWebhookFetchError(wrapped('ECONNREFUSED', { hostname: '127.0.0.1', port: 59999 }));
    expect(msg).toContain('connection refused');
    expect(msg).toContain('127.0.0.1:59999');
    expect(msg).toContain('[ECONNREFUSED]');
  });

  it('surfaces AbortError as the bounded timeout wording', () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    const msg = describeWebhookFetchError(abort, 250);
    expect(msg).toContain('did not respond within 250ms');
  });

  it('keeps errno tokens so the retry classifier still sees transient errors', () => {
    const msg = describeWebhookFetchError(wrapped('ENOTFOUND', { hostname: 'x.invalid-host' }));
    expect(classifyStepError(`Webhook call failed: ${msg}`).retryable).toBe(true);
    const refused = describeWebhookFetchError(wrapped('ECONNREFUSED', { hostname: 'h', port: 1 }));
    expect(classifyStepError(`Webhook call failed: ${refused}`).retryable).toBe(true);
  });

  it('falls back to the deepest concrete message, never bare "fetch failed"', () => {
    const inner = new Error('Request with GET/HEAD method cannot have body');
    const outer: Error & { cause?: unknown } = new TypeError('fetch failed');
    outer.cause = inner;
    expect(describeWebhookFetchError(outer)).toContain('GET/HEAD');
  });
});

// ═══ webhookTimeoutMs ═════════════════════════════════════════════

describe('webhookTimeoutMs', () => {
  it('prefers step config timeout, clamps to a sane range', () => {
    expect(webhookTimeoutMs({ timeout: 250 })).toBe(250);
    expect(webhookTimeoutMs({})).toBe(30_000);           // default
    expect(webhookTimeoutMs({ timeout: 999_999 })).toBe(120_000); // max clamp
    expect(webhookTimeoutMs({ timeout: 1 })).toBe(100);           // min clamp
  });
});

// ═══ executeAction('webhook_call') — REAL HTTP ════════════════════

describe("executeAction('webhook_call') against a real HTTP server", () => {
  it('POST: sends the JSON body with execution context and returns a parsed 200', async () => {
    const result = await executeAction('webhook_call', { url: `${serverUrl}/hook` }, context);
    expect(result.success).toBe(true);
    expect(result.output?.statusCode).toBe(200);
    expect(result.output?.body).toMatchObject({ ok: true, seen: 'body' });

    expect(recorded).toHaveLength(1);
    const req = recorded[0];
    expect(req.method).toBe('POST');
    const sent = JSON.parse(req.body);
    expect(sent.workflowId).toBe('wf_1');
    expect(sent.executionId).toBe('exec_1');
    expect(sent.leadId).toBe('lead_1');
    expect(sent.triggerData).toEqual({ leadName: 'Sagar Hospitals' });
  });

  it('POST: merges a configured body object with the execution context (existing shape preserved)', async () => {
    const result = await executeAction(
      'webhook_call',
      { url: `${serverUrl}/hook`, body: { custom: 'payload' } },
      context
    );
    expect(result.success).toBe(true);
    const sent = JSON.parse(recorded[0].body);
    expect(sent.custom).toBe('payload');
    expect(sent.executionId).toBe('exec_1');
  });

  it('GET: maps params onto the query string and sends NO body (fetch GET+body is illegal)', async () => {
    const result = await executeAction(
      'webhook_call',
      {
        url: `${serverUrl}/search`,
        method: 'GET',
        params: { search: 'dental', city: 'Varanasi', limit: '20' },
      },
      context
    );
    expect(result.success).toBe(true);
    expect(recorded).toHaveLength(1);
    const req = recorded[0];
    expect(req.method).toBe('GET');
    expect(req.body).toBe(''); // no body on GET
    expect(req.url).toContain('/search?');
    expect(req.url).toContain('search=dental');
    expect(req.url).toContain('city=Varanasi');
    expect(req.url).toContain('limit=20');
  });

  it('GET without params: plain request, no body, still succeeds', async () => {
    const result = await executeAction(
      'webhook_call',
      { url: `${serverUrl}/ping`, method: 'GET' },
      context
    );
    expect(result.success).toBe(true);
    expect(recorded[0].body).toBe('');
    expect(recorded[0].url).toBe('/ping');
  });

  it('forwards configured headers (Authorization) to the endpoint', async () => {
    await executeAction(
      'webhook_call',
      {
        url: `${serverUrl}/hook`,
        method: 'GET',
        headers: { Authorization: 'Bearer aq_live_test_key' },
      },
      context
    );
    expect(recorded[0].headers.authorization).toBe('Bearer aq_live_test_key');
  });

  it('non-2xx response: honest failure with the status code (no throw)', async () => {
    serverBehavior = 'error500';
    const result = await executeAction('webhook_call', { url: `${serverUrl}/hook` }, context);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Webhook returned 500');
    expect(result.output?.statusCode).toBe(500);
  });

  it('placeholder URL fails FAST with the actionable message and makes NO request', async () => {
    const result = await executeAction(
      'webhook_call',
      { url: 'https://api.example.com/search/dental_clinics' },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Webhook call failed');
    expect(result.error).toContain('reserved documentation domain');
    expect(result.error).toContain('api.example.com');
    expect(recorded).toHaveLength(0); // nothing left the process
  });

  it('unreachable port: surfaces the real cause (connection refused), not "fetch failed"', async () => {
    // Bind + close to obtain a port that is (almost certainly) dead.
    const { createServer: cs } = await import('node:http');
    const tmp = cs();
    const deadPort: number = await new Promise((resolve) => {
      tmp.listen(0, '127.0.0.1', () => {
        const p = (tmp.address() as AddressInfo).port;
        tmp.close(() => resolve(p));
      });
    });
    const result = await executeAction(
      'webhook_call',
      { url: `http://127.0.0.1:${deadPort}/hook`, timeout: 2000 },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('connection refused');
    expect(result.error).toContain('[ECONNREFUSED]');
    expect(result.error).not.toBe('Webhook call failed: fetch failed');
  });

  it('slow endpoint: aborts at the configured timeout with the timeout wording', async () => {
    serverBehavior = 'slow';
    const result = await executeAction(
      'webhook_call',
      { url: `${serverUrl}/slow`, timeout: 200 },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('did not respond within 200ms');
  });

  it('unsupported HTTP method: honest, actionable rejection', async () => {
    const result = await executeAction(
      'webhook_call',
      { url: `${serverUrl}/hook`, method: 'NOTAMETHOD' },
      context
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('unsupported HTTP method');
    expect(recorded).toHaveLength(0);
  });
});

// ═══ validateDefinition — pre-flight gate ═════════════════════════

describe('validateDefinition webhook URL pre-flight', () => {
  const step = (actionType: string, config: Record<string, unknown>, name = 'Step') => ({
    id: 's1', type: 'action', name, config, order: 0,
  });

  it('rejects the incident workflow definition with a repair message', () => {
    // Exactly the persisted config of the "Dental Clinic Outreach" step 1.
    const validation = validateDefinition(
      [step('webhook_call', {
        url: 'https://api.example.com/search/dental_clinics',
        params: { location: 'Varanasi, India', industry: 'dental' },
        actionType: 'webhook_call',
      }, 'Search dental clinics in Varanasi')],
      null
    );
    expect(validation.valid).toBe(false);
    const issue = validation.issues.find((i) => i.field === 'url');
    expect(issue).toBeDefined();
    expect(issue?.message).toContain('reserved documentation domain');
    expect(issue?.stepName).toBe('Search dental clinics in Varanasi');
    expect(issue?.stepIndex).toBe(0);
  });

  it('accepts a real endpoint URL (localhost stays valid)', () => {
    const validation = validateDefinition(
      [step('webhook_call', {
        url: 'http://localhost:3000/api/leads',
        method: 'GET',
        actionType: 'webhook_call',
      })],
      null
    );
    expect(validation.valid).toBe(true);
    expect(validation.issues).toHaveLength(0);
  });

  it('flags malformed webhook URLs as issues, not crashes', () => {
    const validation = validateDefinition(
      [step('webhook_call', { url: 'not a url at all', actionType: 'webhook_call' })],
      null
    );
    expect(validation.valid).toBe(false);
    expect(validation.issues[0].message).toContain('not a valid absolute URL');
  });
});
