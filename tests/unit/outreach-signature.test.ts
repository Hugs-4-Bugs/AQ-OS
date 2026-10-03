// ═══════════════════════════════════════════════════════════════════
// Unit Tests — Sender signature personalization (outreach)
//
// Covers the "[Your Name]" placeholder fix:
//  - AI-generated bodies with placeholder signatures get the
//    AUTHENTICATED user's real saved profile values
//  - missing profile fields are omitted cleanly (no literal
//    placeholders, no "undefined"/"null", no dangling labels)
//  - legitimate content and non-signature placeholders ([Day]) are
//    untouched; real signatures are not duplicated or rewritten
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';

import {
  applySenderSignature,
  buildSenderSignatureBlock,
  type SenderProfile,
} from '@/lib/ai/sender-signature';

const FULL_PROFILE: SenderProfile = {
  name: 'Priya Sharma',
  email: 'priya@example.com',
  phone: '+91 98765 43210',
  company: 'Sharma Digital',
};

describe('applySenderSignature', () => {
  it('replaces every placeholder token with the real saved profile values', () => {
    const body = [
      'Hi Ravi,',
      '',
      'Loved your clinic website.',
      '',
      'Best regards,',
      '[Your Name]',
      '[Your Company]',
      '[Your Phone]',
      '[Your Email]',
    ].join('\n');

    const out = applySenderSignature(body, FULL_PROFILE);

    expect(out).toContain('Best regards,\nPriya Sharma');
    expect(out).toContain('Sharma Digital');
    expect(out).toContain('+91 98765 43210');
    expect(out).toContain('priya@example.com');
    expect(out).not.toContain('[Your');
  });

  it('handles case and spacing variants of the placeholders', () => {
    const body = 'Best regards,\n[YOUR NAME]\n[Your Company Name]';
    const out = applySenderSignature(body, FULL_PROFILE);
    expect(out).toContain('Priya Sharma');
    expect(out).toContain('Sharma Digital');
    expect(out).not.toContain('[');
  });

  it('omits missing profile fields cleanly — no placeholders, no blank labels', () => {
    const profile: SenderProfile = { name: 'Priya Sharma', email: 'priya@example.com' };
    const body = 'Best regards,\n[Your Name]\n[Your Company]\n[Your Phone]';

    const out = applySenderSignature(body, profile);

    expect(out).toContain('Priya Sharma');
    expect(out).not.toContain('[Your Company]');
    expect(out).not.toContain('[Your Phone]');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('null');
    // No dangling empty lines where the removed fields were
    expect(out.endsWith('Best regards,\nPriya Sharma')).toBe(true);
  });

  it('leaves a message with a real signature untouched (no duplication)', () => {
    const body = 'Best regards,\nPriya Sharma\nSharma Digital\npriya@example.com';
    const out = applySenderSignature(body, FULL_PROFILE);
    expect(out).toBe(body);
  });

  it('does not append contact info when the body has no placeholders', () => {
    const body = 'Hi Ravi,\n\nShall we talk tomorrow?\n\nBest regards,';
    const out = applySenderSignature(body, FULL_PROFILE);
    expect(out).toBe('Hi Ravi,\n\nShall we talk tomorrow?\n\nBest regards,');
  });

  it('never touches non-signature placeholders like [Day] at [Time]', () => {
    const body = 'Are you available?\n• [Day] at [Time]\n\nBest regards,\n[Your Name]';
    const out = applySenderSignature(body, FULL_PROFILE);
    expect(out).toContain('[Day] at [Time]');
    expect(out).toContain('Priya Sharma');
  });

  it('uses an empty profile without emitting placeholder text', () => {
    const body = 'Best regards,\n[Your Name]\n[Your Company]';
    const out = applySenderSignature(body, {});
    expect(out).toBe('Best regards,');
  });

  it('returns empty bodies unchanged', () => {
    expect(applySenderSignature('', FULL_PROFILE)).toBe('');
  });

  it('strips whitespace left behind by removed tokens', () => {
    const body = 'Best regards,\n[Your Name]\n   \n[Your Company]\n\n\n\n';
    const out = applySenderSignature(body, { name: 'Priya Sharma' });
    expect(out).toBe('Best regards,\nPriya Sharma');
  });
});

describe('buildSenderSignatureBlock', () => {
  it('lists every available profile field', () => {
    const block = buildSenderSignatureBlock(FULL_PROFILE);
    expect(block).toContain('Name: Priya Sharma');
    expect(block).toContain('Company: Sharma Digital');
    expect(block).toContain('Email: priya@example.com');
    expect(block).toContain('Phone: +91 98765 43210');
    expect(block).toContain('NEVER invent or use placeholder text');
  });

  it('omits fields that are missing, null or whitespace-only', () => {
    const block = buildSenderSignatureBlock({ name: 'Priya Sharma', phone: '   ' });
    expect(block).toContain('Name: Priya Sharma');
    expect(block).not.toContain('Company:');
    expect(block).not.toContain('Email:');
    expect(block).not.toContain('Phone:');
  });

  it('instructs the model to use a plain sign-off when the profile is empty', () => {
    const block = buildSenderSignatureBlock({});
    expect(block).toContain('no contact details on file');
    expect(block).toContain('Do NOT use placeholders such as [Your Name]');
  });
});
