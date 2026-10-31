// ═══════════════════════════════════════════════════════════════════
// Outreach Reliability: NO FAKE SENT + accurate status states
//
// Verifies the core rule: NEVER mark "sent" / "delivered" unless the
// provider confirms the relevant state. Uses honest states:
//   draft | approval_required | queued | sending | provider_accepted | sent |
//   delivered | failed | rejected | rate_limited | retrying | cancelled |
//   provider_blocked
//
// Also verifies LinkedIn/Instagram return provider_blocked (NOT fake success).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ─── NO FAKE SENT rule ──────────────────────────────────

describe('NO FAKE SENT rule', () => {
  it('LinkedIn stub is GONE — replaced with provider_blocked honest status', () => {
    const src = readSrc('src/lib/messaging-hub-service.ts');
    // The old fake return must NOT be present
    expect(src).not.toContain("providerMessageId: `linkedin-${Date.now()}`");
    expect(src).not.toContain("providerMessageId: `instagram-${Date.now()}`");
    // Honest provider_blocked status MUST be present
    expect(src).toContain("errorCategory: 'provider_blocked'");
    expect(src).toContain("status: 'provider_blocked'");
    // LinkedIn reason mentions Partner Program
    const linkedInBlock = src.match(/case 'linkedin': \{[\s\S]*?return \{[\s\S]*?\};/);
    expect(linkedInBlock).not.toBeNull();
    expect(linkedInBlock![0]).toMatch(/Partner Program/i);
    // Instagram reason mentions App Review + 24h window
    const igBlock = src.match(/case 'instagram': \{[\s\S]*?return \{[\s\S]*?\};/);
    expect(igBlock).not.toBeNull();
    expect(igBlock![0]).toMatch(/App Review/i);
    expect(igBlock![0]).toMatch(/24-hour/i);
  });

  it('WhatsApp service uses provider_accepted (NOT sent) immediately after API call', () => {
    const src = readSrc('src/lib/whatsapp-service.ts');
    const sentStatusCount = (src.match(/status:\s*'sent'/g) || []).length;
    const acceptedCount = (src.match(/status:\s*'provider_accepted'/g) || []).length;
    expect(sentStatusCount).toBe(0);
    expect(acceptedCount).toBeGreaterThanOrEqual(4);
  });

  it('business-email-tools.ts persists provider_accepted state, NOT fake sent', () => {
    const src = readSrc('src/lib/ai/agent-tools/business-email-tools.ts');
    expect(src).toContain("status: 'provider_accepted'");
    expect(src).toContain('providerMessageId: out.messageId');
    expect(src).toContain('providerAcceptedAt');
    expect(src).toContain("deliveryState: 'provider_accepted'");
    // Must NOT use fake sent status
    expect(src).not.toMatch(/status:\s*'sent'/);
  });
});

// ─── Schema status state machine ───────────────────────────────────

describe('OutreachMessage schema documents accurate status states', () => {
  it('OutreachMessage includes provider_accepted + provider_blocked + approval_required', () => {
    const schema = readSrc('prisma/schema.prisma');
    const outreachBlock = schema.match(/model OutreachMessage \{[\s\S]*?\n\}/);
    expect(outreachBlock).not.toBeNull();
    expect(outreachBlock![0]).toContain('provider_accepted');
    expect(outreachBlock![0]).toContain('provider_blocked');
    expect(outreachBlock![0]).toContain('approval_required');
    expect(outreachBlock![0]).toContain('rate_limited');
    expect(outreachBlock![0]).toContain('retrying');
    expect(outreachBlock![0]).toContain('cancelled');
    expect(outreachBlock![0]).toContain('providerMessageId');
    expect(outreachBlock![0]).toContain('providerAcceptedAt');
    expect(outreachBlock![0]).toContain('errorCategory');
  });

  it('MessageDelivery includes provider_accepted + provider_blocked', () => {
    const schema = readSrc('prisma/schema.prisma');
    const deliveryBlock = schema.match(/model MessageDelivery \{[\s\S]*?\n\}/);
    expect(deliveryBlock).not.toBeNull();
    expect(deliveryBlock![0]).toContain('provider_accepted');
    expect(deliveryBlock![0]).toContain('provider_blocked');
  });
});

// ─── Agent activity SSE broadcast ──────────────────────────────────

describe('Agent activity SSE broadcast', () => {
  it('registry.ts broadcasts safe telemetry (no chain-of-thought)', () => {
    const src = readSrc('src/lib/ai/agent-tools/registry.ts');
    expect(src).toContain('sendToUser');
    expect(src).toContain('publishEvent');
    expect(src).toContain('agent.tool.invoked');
    expect(src).toContain('toolName');
    expect(src).toContain('durationMs');
    expect(src).toContain('runId');
    // The payload MUST only contain safe fields, NEVER the input/output content
    const safeEventBlock = src.match(/const safeEvent = \{[\s\S]*?\};/);
    expect(safeEventBlock).not.toBeNull();
    expect(safeEventBlock![0]).not.toContain('params.input');
    expect(safeEventBlock![0]).not.toContain('params.result.output');
    expect(safeEventBlock![0]).not.toContain('params.input.text');
  });
});

// ─── Status state set completeness ─────────────────────────────────

describe('accurate outreach status state set', () => {
  const ACCURATE_STATES = [
    'draft',
    'approval_required',
    'queued',
    'sending',
    'provider_accepted',
    'sent',
    'delivered',
    'opened',
    'replied',
    'bounced',
    'failed',
    'rejected',
    'rate_limited',
    'retrying',
    'cancelled',
    'provider_blocked',
  ];

  it('all accurate states documented in schema', () => {
    const schema = readSrc('prisma/schema.prisma');
    for (const s of ACCURATE_STATES) {
      expect(schema).toContain(s);
    }
  });

  it('OutreachStatusPanel UI maps all accurate states', () => {
    const src = readSrc('src/components/dashboard/outreach-status-panel.tsx');
    for (const s of ACCURATE_STATES) {
      const found = src.includes(`${s}:`) || src.includes(`'${s}'`) || src.includes(`"${s}"`);
      expect(found).toBe(true);
    }
  });
});

// ─── Connected accounts catalog reports provider-blocked honestly ──

describe('Connected accounts catalog honest reporting', () => {
  it('catalog reports LinkedIn as provider_blocked with reason', () => {
    const src = readSrc('src/app/api/connected-accounts/catalog/route.ts');
    expect(src).toContain("status: 'provider_blocked'");
    expect(src).toContain('Partner Program');
    expect(src).toContain('instagram_manage_messages');
    expect(src).toContain('24-hour messaging window');
  });

  it('unified-connected-accounts.tsx renders blocked state distinctly', () => {
    const src = readSrc('src/components/dashboard/unified-connected-accounts.tsx');
    expect(src).toContain('provider_blocked');
    expect(src).toContain('ShieldAlert');
    expect(src).toContain('PROVIDER BLOCKED');
  });
});

// ─── New API routes exist ──────────────────────────────────────────

describe('New API routes wired', () => {
  it('/api/connected-accounts exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/connected-accounts/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/connected-accounts/catalog/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/connected-accounts/connect/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/connected-accounts/[id]/disconnect/route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/app/api/connected-accounts/[id]/validate/route.ts'))).toBe(true);
  });

  it('/api/agents/activity exists + uses userId filter', () => {
    const src = readSrc('src/app/api/agents/activity/route.ts');
    expect(src).toContain('userId: user.id');
    expect(src).toContain('withAuth');
  });

  it('/api/outreach/messages exists + uses userId filter', () => {
    const src = readSrc('src/app/api/outreach/messages/route.ts');
    expect(src).toContain('userId: user.id');
    expect(src).toContain('withAuth');
  });

  it('agents-tab.tsx has RealTimeAgentActivity component', () => {
    const src = readSrc('src/components/dashboard/agents-tab.tsx');
    expect(src).toContain('RealTimeAgentActivity');
    expect(src).toContain("new EventSource('/api/events/ai'");
    expect(src).toContain('agent.tool.invoked');
    expect(src).toContain('No chain-of-thought');
  });

  it('settings-shell.tsx wires UnifiedConnectedAccounts + OutreachStatusPanel', () => {
    const src = readSrc('src/components/dashboard/settings-shell.tsx');
    expect(src).toContain('UnifiedConnectedAccounts');
    expect(src).toContain('OutreachStatusPanel');
  });
});
