// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Lead Discovery Normalization 
// src/lib/lead-discovery/normalization.ts
//
// Guards the canonical field-level normalization shared by the discovery
// service, the dedup service and the discover API route.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  extractDomain,
  normalizeBusinessName,
  normalizeEmail,
  normalizeLeadFields,
  normalizeLocationToken,
  normalizePhoneDisplay,
  normalizePhoneForMatch,
  normalizeUrl,
  parseCountryList,
  parseNicheList,
  sameLocation,
  MAX_COUNTRIES_PER_JOB,
  MAX_NICHES_PER_JOB,
} from '@/lib/lead-discovery/normalization';

describe('normalizeUrl', () => {
  it('adds https:// to bare domains', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('example.com/about')).toBe('https://example.com/about');
  });
  it('preserves an explicit protocol', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });
  it('trims whitespace and returns empty string for junk', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
    expect(normalizeUrl('   ')).toBe('');
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl(undefined)).toBe('');
  });
});

describe('extractDomain', () => {
  it('extracts the registrable host, www-stripped and lowercased', () => {
    expect(extractDomain('https://www.Example.com/path')).toBe('example.com');
    expect(extractDomain('example.com')).toBe('example.com');
    expect(extractDomain('HTTPS://Sub.Example.co.uk/x')).toBe('sub.example.co.uk');
  });
  it('returns null for unparseable input — never a guess', () => {
    expect(extractDomain('not a url at all')).toBeNull();
    expect(extractDomain('')).toBeNull();
    expect(extractDomain(null)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Info@Acme.COM ')).toBe('info@acme.com');
  });
  it('rejects non-email noise with null (never persisted as contact)', () => {
    expect(normalizeEmail('hello')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('missing@domain')).toBeNull();
    expect(normalizeEmail('two@@at.com')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('normalizePhoneDisplay / normalizePhoneForMatch', () => {
  it('display form collapses internal whitespace', () => {
    expect(normalizePhoneDisplay(' +91 98765   43210 ')).toBe('+91 98765 43210');
  });
  it('display form drops digit-less noise', () => {
    expect(normalizePhoneDisplay('call us')).toBeNull();
    expect(normalizePhoneDisplay('')).toBeNull();
  });
  it('match form strips non-digits', () => {
    expect(normalizePhoneForMatch('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhoneForMatch('(022) 2654-3210')).toBe('02226543210');
  });
  it('match form strips the 00 international prefix', () => {
    expect(normalizePhoneForMatch('0091 98765 43210')).toBe('919876543210');
  });
  it('match form strips a leading US 1 for 11-digit numbers', () => {
    expect(normalizePhoneForMatch('+1 415 555 2671')).toBe('4155552671');
  });
  it('match form rejects too-short values (noise, not a phone)', () => {
    expect(normalizePhoneForMatch('123456')).toBeNull();
    expect(normalizePhoneForMatch('')).toBeNull();
  });
});

describe('normalizeBusinessName', () => {
  it('strips legal suffixes and punctuation', () => {
    expect(normalizeBusinessName('Apollo Hospitals Pvt Ltd')).toBe('apollohospitals');
    expect(normalizeBusinessName('Acme, Inc.')).toBe('acme');
    expect(normalizeBusinessName('Foo Bar LLC')).toBe('foobar');
    expect(normalizeBusinessName('Bar & Co. Pvt. Ltd.')).toBe('bar');
  });
  it('is case-insensitive and tolerant of null', () => {
    expect(normalizeBusinessName('  ACME  ')).toBe('acme');
    expect(normalizeBusinessName(null)).toBe('');
  });
  it('keeps genuinely different names different', () => {
    expect(normalizeBusinessName('Apollo Hospitals')).not.toBe(normalizeBusinessName('Apollo Clinics'));
  });
});

describe('location helpers', () => {
  it('normalizeLocationToken strips punctuation/case', () => {
    expect(normalizeLocationToken('New York City')).toBe('newyorkcity');
    expect(normalizeLocationToken('St. Louis')).toBe('stlouis');
  });
  it('sameLocation is case/punctuation insensitive', () => {
    expect(sameLocation('Mumbai', 'mumbai')).toBe(true);
    expect(sameLocation('New York', 'new-york')).toBe(true);
  });
  it('sameLocation never treats absence as a match', () => {
    expect(sameLocation('', 'Mumbai')).toBe(false);
    expect(sameLocation(null, null)).toBe(false);
    expect(sameLocation(undefined, undefined)).toBe(false);
  });
});

describe('parseNicheList', () => {
  it('splits a comma-separated multi-niche input (the bug input)', () => {
    expect(parseNicheList('hospital, dentist').niches).toEqual(['hospital', 'dentist']);
  });
  it('supports semicolons, dedupes case-insensitively, preserves order', () => {
    expect(parseNicheList(' Hospital ; dentist ; Dental ; gym ').niches).toEqual([
      'Hospital',
      'dentist',
      'Dental',
      'gym',
    ]);
  });
  it('accepts an explicit array', () => {
    expect(parseNicheList(['hospital', 'dentist']).niches).toEqual(['hospital', 'dentist']);
  });
  it('returns empty for unusable input', () => {
    expect(parseNicheList(' , , , ').niches).toEqual([]);
    expect(parseNicheList(null).niches).toEqual([]);
    expect(parseNicheList('').niches).toEqual([]);
  });
  it('flags truncation above the cap instead of silently dropping', () => {
    const many = Array.from({ length: MAX_NICHES_PER_JOB + 1 }, (_, i) => `niche${i}`);
    const parsed = parseNicheList(many);
    expect(parsed.truncated).toBe(true);
    expect(parsed.niches).toHaveLength(MAX_NICHES_PER_JOB);
  });
});

describe('parseCountryList', () => {
  it('splits multi-country input', () => {
    expect(parseCountryList('India, United States').countries).toEqual(['India', 'United States']);
  });
  it('accepts arrays and dedupes', () => {
    expect(parseCountryList(['India', 'india', 'Brazil']).countries).toEqual(['India', 'Brazil']);
  });
  it('empty result means Worldwide (no silent substitution either way)', () => {
    expect(parseCountryList(undefined).countries).toEqual([]);
    expect(parseCountryList('  ').countries).toEqual([]);
  });
  it('flags truncation above the cap', () => {
    const many = Array.from({ length: MAX_COUNTRIES_PER_JOB + 1 }, (_, i) => `Country${i}`);
    expect(parseCountryList(many).truncated).toBe(true);
  });
});

describe('normalizeLeadFields', () => {
  it('canonicalizes a full discovered-lead record', () => {
    const out = normalizeLeadFields({
      businessName: '  Apollo   Hospitals ',
      website: 'apollohospitals.com',
      email: '  Info@Apollo.COM ',
      phone: ' +91 98765 43210 ',
      linkedin: 'linkedin.com/company/apollo',
      rating: 9.5,
    });
    expect(out.businessName).toBe('Apollo Hospitals');
    expect(out.website).toBe('https://apollohospitals.com');
    expect(out.email).toBe('info@apollo.com');
    expect(out.phone).toBe('+91 98765 43210');
    expect(out.linkedin).toBe('https://linkedin.com/company/apollo');
    expect(out.rating).toBe(5); // clamped to 0..5
  });
  it('drops provably-noise contact values (no fake contacts)', () => {
    const out = normalizeLeadFields({
      businessName: 'Acme',
      email: 'not-an-email',
      phone: 'no digits here',
      website: '   ',
    });
    expect(out.email).toBeUndefined();
    expect(out.phone).toBeUndefined();
    expect(out.website).toBeUndefined();
  });
  it('never invents missing values', () => {
    const out = normalizeLeadFields({ businessName: 'Acme' });
    expect(out.website).toBeUndefined();
    expect(out.email).toBeUndefined();
    expect(out.phone).toBeUndefined();
    expect(out.rating).toBeUndefined();
  });
});
