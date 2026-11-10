// AcquisitionOS — Retention policy semantics tests
// Verifies that the declared action matches the actual DB operation.

import { describe, it, expect } from 'vitest';
import { RETENTION_POLICIES, type RetentionPolicy } from '@/lib/compliance/retention';

describe('Retention Policy — Action/Implementation Consistency', () => {
  // Map each category to its declared action
  const policyMap = new Map(RETENTION_POLICIES.map((p) => [p.category, p]));

  it('login_history declares anonymize (not delete)', () => {
    const p = policyMap.get('login_history');
    expect(p).toBeDefined();
    expect(p!.action).toBe('anonymize');
  });

  it('audit_logs declares archive (not delete) — tamper-evident chain preserved', () => {
    const p = policyMap.get('audit_logs');
    expect(p).toBeDefined();
    expect(p!.action).toBe('archive');
  });

  it('email_messages declares anonymize (not delete)', () => {
    const p = policyMap.get('email_messages');
    expect(p).toBeDefined();
    expect(p!.action).toBe('anonymize');
  });

  it('ai_chat_history declares anonymize (not delete)', () => {
    const p = policyMap.get('ai_chat_history');
    expect(p).toBeDefined();
    expect(p!.action).toBe('anonymize');
  });

  it('usage_analytics declares delete (changed from anonymize — no PII to anonymize)', () => {
    const p = policyMap.get('usage_analytics');
    expect(p).toBeDefined();
    expect(p!.action).toBe('delete');
  });

  it('security_alerts declares archive (not delete)', () => {
    const p = policyMap.get('security_alerts');
    expect(p).toBeDefined();
    expect(p!.action).toBe('archive');
  });

  it('financial_records declares archive (not delete or count-only)', () => {
    const p = policyMap.get('financial_records');
    expect(p).toBeDefined();
    expect(p!.action).toBe('archive');
    expect(p!.retentionDays).toBe(2555); // 7 years
  });

  it('user_sessions declares delete', () => {
    const p = policyMap.get('user_sessions');
    expect(p).toBeDefined();
    expect(p!.action).toBe('delete');
  });

  it('notifications declares delete', () => {
    const p = policyMap.get('notifications');
    expect(p).toBeDefined();
    expect(p!.action).toBe('delete');
  });

  it('api_key_usage declares delete', () => {
    const p = policyMap.get('api_key_usage');
    expect(p).toBeDefined();
    expect(p!.action).toBe('delete');
  });

  it('workflow_logs declares delete', () => {
    const p = policyMap.get('workflow_logs');
    expect(p).toBeDefined();
    expect(p!.action).toBe('delete');
  });
});

describe('Retention Policy — Action Distribution', () => {
  it('has exactly 11 policies', () => {
    expect(RETENTION_POLICIES).toHaveLength(11);
  });

  it('has at least one delete policy', () => {
    expect(RETENTION_POLICIES.some((p) => p.action === 'delete')).toBe(true);
  });

  it('has at least one anonymize policy', () => {
    expect(RETENTION_POLICIES.some((p) => p.action === 'anonymize')).toBe(true);
  });

  it('has at least one archive policy', () => {
    expect(RETENTION_POLICIES.some((p) => p.action === 'archive')).toBe(true);
  });

  it('all policies have required fields', () => {
    for (const p of RETENTION_POLICIES) {
      expect(p.category).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.retentionDays).toBeGreaterThan(0);
      expect(['delete', 'anonymize', 'archive']).toContain(p.action);
      expect(p.legalBasis).toBeTruthy();
      expect(p.gdprArticle).toBeTruthy();
    }
  });

  it('no policy uses "delete" for categories that should anonymize or archive', () => {
    // These categories MUST NOT be "delete" because they contain PII
    // that must be anonymized OR have legal retention requirements
    const mustNotDelete = ['login_history', 'audit_logs', 'email_messages', 'ai_chat_history', 'security_alerts', 'financial_records'];
    for (const cat of mustNotDelete) {
      const p = RETENTION_POLICIES.find((p) => p.category === cat);
      expect(p).toBeDefined();
      expect(p!.action).not.toBe('delete');
    }
  });
});

describe('Retention Policy — Anonymize Implementation Verification', () => {
  // These tests verify that the retention.ts source code actually
  // performs anonymization (updateMany with [anonymized] values)
  // rather than deletion (deleteMany) for the categories that declare
  // 'anonymize'. We inspect the source code text since we can't run
  // the DB operations in a unit test without a seeded database.

  it('login_history uses updateMany (anonymize) not deleteMany', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/compliance/retention.ts', 'utf-8');
    const loginHistorySection = source.split("case 'login_history'")[1]?.split('break;')[0] ?? '';
    expect(loginHistorySection).toContain('updateMany');
    expect(loginHistorySection).toContain('[anonymized]');
    expect(loginHistorySection).not.toContain('deleteMany');
  });

  it('email_messages uses updateMany (anonymize) not deleteMany', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/compliance/retention.ts', 'utf-8');
    const emailSection = source.split("case 'email_messages'")[1]?.split('break;')[0] ?? '';
    expect(emailSection).toContain('updateMany');
    expect(emailSection).toContain('[anonymized]');
    expect(emailSection).not.toContain('deleteMany');
  });

  it('ai_chat_history uses updateMany (anonymize) not deleteMany', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/compliance/retention.ts', 'utf-8');
    const aiChatSection = source.split("case 'ai_chat_history'")[1]?.split('break;')[0] ?? '';
    expect(aiChatSection).toContain('updateMany');
    expect(aiChatSection).toContain('[anonymized]');
    expect(aiChatSection).not.toContain('deleteMany');
  });

  it('audit_logs does NOT delete or modify hash chain (archive only)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/compliance/retention.ts', 'utf-8');
    const auditSection = source.split("case 'audit_logs'")[1]?.split('break;')[0] ?? '';
    // Archive = count only, no deletion, no modification
    expect(auditSection).not.toContain('deleteMany');
    expect(auditSection).not.toContain('updateMany');
    expect(auditSection).toContain('No deletion');
  });

  it('security_alerts does NOT delete (archive + anonymize IP)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/compliance/retention.ts', 'utf-8');
    const alertsSection = source.split("case 'security_alerts'")[1]?.split('break;')[0] ?? '';
    expect(alertsSection).not.toContain('deleteMany');
    expect(alertsSection).toContain('updateMany'); // anonymize IP
    expect(alertsSection).toContain('[archived]');
  });

  it('financial_records does NOT delete (archive only, 7-year legal retention)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/lib/compliance/retention.ts', 'utf-8');
    const financialSection = source.split("case 'financial_records'")[1]?.split('break;')[0] ?? '';
    expect(financialSection).not.toContain('deleteMany');
    expect(financialSection).toContain('No deletion');
  });
});
