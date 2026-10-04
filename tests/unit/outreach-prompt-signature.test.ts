// ═══════════════════════════════════════════════════════════════════
// Unit Tests — Outreach prompt templates carry the sender signature block
//
// The "[Your Name]" defect: the generation prompts had no sender identity
// so the model invented placeholders. The current prompt versions must
// substitute the {{senderSignature}} variable (built from the
// authenticated user's profile) with no unresolved tokens left behind.
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';

import { getPrompt } from '@/lib/ai/prompt-manager';
import { buildSenderSignatureBlock } from '@/lib/ai/sender-signature';

describe('outreach prompt templates — sender signature wiring', () => {
  it('outreach-generation current version substitutes {{senderSignature}} fully', () => {
    const prompt = getPrompt('outreach-generation', {
      senderSignature: buildSenderSignatureBlock({ name: 'Priya Sharma', email: 'priya@example.com' }),
    });

    expect(prompt.version).toBe(3);
    expect(prompt.content).toContain('Name: Priya Sharma');
    expect(prompt.content).toContain('Email: priya@example.com');
    expect(prompt.content).not.toContain('{{senderSignature}}');
    expect(prompt.content).toContain('never use placeholders like [Your Name]');
  });

  it('followup-generation current version substitutes {{senderSignature}} fully', () => {
    const prompt = getPrompt('followup-generation', {
      senderSignature: buildSenderSignatureBlock({ name: 'Priya Sharma' }),
    });

    expect(prompt.version).toBe(2);
    expect(prompt.content).toContain('Name: Priya Sharma');
    expect(prompt.content).not.toContain('{{senderSignature}}');
  });

  it('signing rule present even when the sender profile is empty', () => {
    const prompt = getPrompt('outreach-generation', {
      senderSignature: buildSenderSignatureBlock({}),
    });

    expect(prompt.content).toContain('no contact details on file');
    expect(prompt.content).not.toContain('{{senderSignature}}');
  });
});
