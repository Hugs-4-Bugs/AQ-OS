// ═══════════════════════════════════════════════════════════════════
// Unit Tests: User Preference / Personal Business Context helpers
// src/lib/personal-context.ts — parse / sanitize / AI block builder.
// Pure functions only; no DB, no AI, no network.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  parsePersonalContext,
  sanitizePersonalContext,
  buildPersonalContextBlock,
  PERSONAL_CONTEXT_FIELD_LIMITS,
} from '@/lib/personal-context';

describe('parsePersonalContext', () => {
  it('returns {} for null / undefined / non-string input', () => {
    expect(parsePersonalContext(null)).toEqual({});
    expect(parsePersonalContext(undefined)).toEqual({});
    expect(parsePersonalContext(42)).toEqual({});
    expect(parsePersonalContext({})).toEqual({});
  });

  it('returns {} for malformed JSON (never throws)', () => {
    expect(parsePersonalContext('{not json')).toEqual({});
    expect(parsePersonalContext('')).toEqual({});
  });

  it('returns {} for JSON arrays and non-object JSON', () => {
    expect(parsePersonalContext('[]')).toEqual({});
    expect(parsePersonalContext('"str"')).toEqual({});
  });

  it('parses valid stored JSON and trims values', () => {
    const stored = JSON.stringify({ whatYouDo: '  I run a marketing agency  ', goals: 'Sign 5 clients' });
    expect(parsePersonalContext(stored)).toEqual({
      whatYouDo: 'I run a marketing agency',
      goals: 'Sign 5 clients',
    });
  });

  it('drops unknown fields and non-string values', () => {
    const stored = JSON.stringify({ whatYouDo: 'ok', evil: 'x', goals: 42 });
    expect(parsePersonalContext(stored)).toEqual({ whatYouDo: 'ok' });
  });

  it('caps over-long stored values at the field limit', () => {
    const stored = JSON.stringify({ whatYouDo: 'x'.repeat(PERSONAL_CONTEXT_FIELD_LIMITS.whatYouDo + 50) });
    expect(parsePersonalContext(stored).whatYouDo!.length).toBe(PERSONAL_CONTEXT_FIELD_LIMITS.whatYouDo);
  });
});

describe('sanitizePersonalContext', () => {
  it('accepts a valid object and trims values', () => {
    const { context, errors } = sanitizePersonalContext({ whatYouDo: '  dev  ' });
    expect(errors).toEqual([]);
    expect(context).toEqual({ whatYouDo: 'dev' });
  });

  it('rejects non-object input', () => {
    expect(sanitizePersonalContext(null).errors.length).toBe(1);
    expect(sanitizePersonalContext([1]).errors.length).toBe(1);
    expect(sanitizePersonalContext('x').errors.length).toBe(1);
  });

  it('reports errors for non-string values', () => {
    const { errors } = sanitizePersonalContext({ goals: 42 });
    expect(errors).toContain('"goals" must be a string.');
  });

  it('reports errors for over-limit values and excludes them', () => {
    const { context, errors } = sanitizePersonalContext({
      goals: 'x'.repeat(PERSONAL_CONTEXT_FIELD_LIMITS.goals + 1),
    });
    expect(errors.length).toBe(1);
    expect(context.goals).toBeUndefined();
  });

  it('ignores null / undefined / empty-string fields silently', () => {
    const { context, errors } = sanitizePersonalContext({ goals: null, notes: undefined, whatYouDo: '   ' });
    expect(errors).toEqual([]);
    expect(context).toEqual({});
  });

  it('drops unknown fields without error', () => {
    const { context, errors } = sanitizePersonalContext({ whatYouDo: 'ok', hackerField: 'x' });
    expect(errors).toEqual([]);
    expect(context).toEqual({ whatYouDo: 'ok' });
  });
});

describe('buildPersonalContextBlock', () => {
  it('returns "" for empty / null contexts', () => {
    expect(buildPersonalContextBlock(null)).toBe('');
    expect(buildPersonalContextBlock({})).toBe('');
  });

  it('renders labelled lines for provided fields only', () => {
    const block = buildPersonalContextBlock({ whatYouDo: 'I build websites', goals: 'Grow B2B pipeline' });
    expect(block).toContain('ABOUT THE USER');
    expect(block).toContain('- What the user does: I build websites');
    expect(block).toContain('- Current goals: Grow B2B pipeline');
    expect(block).not.toContain('Interests');
  });

  it('mentions personalization guidance', () => {
    const block = buildPersonalContextBlock({ notes: 'prefers short emails' });
    expect(block).toContain('personalize');
  });
});
