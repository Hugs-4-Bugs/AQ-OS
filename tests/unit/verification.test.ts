// Unit tests for evidence-based verification + website classification (spec §6.2/§7.2)
import { describe, it, expect } from 'vitest';
import {
  deriveImportVerificationStatus,
  classifyWebsite,
  VERIFICATION_STATUSES,
  WEBSITE_CATEGORY_LABELS,
} from '@/lib/lead-discovery/verification';

describe('verification labels (spec §7.2)', () => {
  it('exposes exactly the five required labels', () => {
    expect(VERIFICATION_STATUSES).toEqual([
      'verified',
      'partially_verified',
      'unverified',
      'verification_failed',
      'conflicting',
    ]);
  });

  it('single-source discovery is UNVERIFIED — discovered is not verified', () => {
    expect(deriveImportVerificationStatus(false)).toBe('unverified');
  });

  it('two independent sources is PARTIALLY VERIFIED — corroboration, not proof', () => {
    expect(deriveImportVerificationStatus(true)).toBe('partially_verified');
  });
});

describe('classifyWebsite (spec §6.2 — evidence-based, never guessed)', () => {
  it('no URL and no website → No Website Found', () => {
    const c = classifyWebsite({ website: null, hasWebsite: false });
    expect(c.category).toBe('no_website_found');
  });

  it('probed-but-absent website → No Website Found with evidence', () => {
    const c = classifyWebsite({ website: null, hasWebsite: false, websiteStatus: 'NOT_FOUND_AFTER_RESEARCH' });
    expect(c.category).toBe('no_website_found');
    expect(c.evidence.length).toBeGreaterThan(0);
  });

  it('INVALID status → Website Unreachable (distinct from no website)', () => {
    const c = classifyWebsite({ website: 'http://dead.example', hasWebsite: true, websiteStatus: 'INVALID' });
    expect(c.category).toBe('website_unreachable');
  });

  it('verified + high measured score → Website Appears Functional', () => {
    const c = classifyWebsite({ website: 'https://good.example', hasWebsite: true, websiteStatus: 'VERIFIED', websiteScore: 85 });
    expect(c.category).toBe('website_appears_functional');
  });

  it('verified + mid measured score → Potential Improvement Opportunity', () => {
    const c = classifyWebsite({ website: 'https://ok.example', hasWebsite: true, websiteStatus: 'VERIFIED', websiteScore: 55 });
    expect(c.category).toBe('potential_improvement_opportunity');
  });

  it('verified + low measured score → Website Health Issue', () => {
    const c = classifyWebsite({ website: 'https://bad.example', hasWebsite: true, websiteStatus: 'VERIFIED', websiteScore: 20 });
    expect(c.category).toBe('website_health_issue');
  });

  it('verified but no measurement → honest estimate-based fallback, never fabricated quality', () => {
    const c = classifyWebsite({ website: 'https://x.example', hasWebsite: true, websiteStatus: 'VERIFIED', websiteQuality: 'medium' });
    expect(c.category).toBe('potential_improvement_opportunity');
    expect(c.evidence.some((e) => /estimate/i.test(e))).toBe(true);
  });

  it('URL present but never probed → Not Yet Verified (a missing check is NOT a bad website)', () => {
    const c = classifyWebsite({ website: 'https://unknown.example', hasWebsite: true, websiteStatus: 'UNKNOWN' });
    expect(c.category).toBe('not_yet_verified');
  });

  it('all labels are user-facing strings', () => {
    for (const key of Object.keys(WEBSITE_CATEGORY_LABELS)) {
      expect(WEBSITE_CATEGORY_LABELS[key as keyof typeof WEBSITE_CATEGORY_LABELS]).toBeTruthy();
    }
  });
});
