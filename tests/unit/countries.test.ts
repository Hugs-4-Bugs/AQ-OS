// Unit tests for worldwide country dataset + normalization (spec §5)
import { describe, it, expect } from 'vitest';
import {
  COUNTRIES,
  normalizeCountryName,
  countryCodeFor,
  extractCountryFromLocation,
  aliasesFor,
  searchCountries,
} from '@/lib/countries';

describe('COUNTRIES dataset (spec §5: complete, maintained, ISO)', () => {
  it('contains the full ISO 3166-1 officially-assigned set (249)', () => {
    expect(COUNTRIES).toHaveLength(249);
  });

  it('has unique codes and unique names', () => {
    const codes = new Set(COUNTRIES.map((c) => c.code));
    const names = new Set(COUNTRIES.map((c) => c.name));
    expect(codes.size).toBe(COUNTRIES.length);
    expect(names.size).toBe(COUNTRIES.length);
  });

  it('uses 2-letter uppercase alpha-2 codes', () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('is not limited to a handful of countries (spec: no 5-6 country lists)', () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
  });
});

describe('normalizeCountryName', () => {
  it('resolves canonical names case-insensitively', () => {
    expect(normalizeCountryName('united states')).toBe('United States');
    expect(normalizeCountryName('INDIA')).toBe('India');
    expect(normalizeCountryName('Germany')).toBe('Germany');
  });

  it('resolves common aliases (legacy saved values)', () => {
    expect(normalizeCountryName('USA')).toBe('United States');
    expect(normalizeCountryName('U.S.A.')).toBe('United States');
    expect(normalizeCountryName('UK')).toBe('United Kingdom');
    expect(normalizeCountryName('England')).toBe('United Kingdom');
    expect(normalizeCountryName('UAE')).toBe('United Arab Emirates');
    expect(normalizeCountryName('South Korea')).toBe('Korea, Republic of');
    expect(normalizeCountryName('Holland')).toBe('Netherlands');
  });

  it('returns null for unresolvable input (never guesses)', () => {
    expect(normalizeCountryName('Atlantis')).toBeNull();
    expect(normalizeCountryName('')).toBeNull();
    expect(normalizeCountryName(null)).toBeNull();
    expect(normalizeCountryName(undefined)).toBeNull();
  });
});

describe('countryCodeFor', () => {
  it('maps names and aliases to ISO alpha-2', () => {
    expect(countryCodeFor('United States')).toBe('US');
    expect(countryCodeFor('USA')).toBe('US');
    expect(countryCodeFor('India')).toBe('IN');
    expect(countryCodeFor('Germany')).toBe('DE');
  });

  it('returns null when unresolvable', () => {
    expect(countryCodeFor('Narnia')).toBeNull();
  });
});

describe('extractCountryFromLocation', () => {
  it('extracts the country from a "City, Country" string', () => {
    expect(extractCountryFromLocation('Mumbai, India')).toBe('India');
    expect(extractCountryFromLocation('Austin TX, USA')).toBe('United States');
  });

  it('handles city-only strings by trying the whole value (null = no country)', () => {
    expect(extractCountryFromLocation('Mumbai')).toBeNull();
    // City names do NOT imply countries (deliberate anti-guessing rule);
    // only country names/aliases resolve.
    expect(extractCountryFromLocation('London')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(extractCountryFromLocation('')).toBeNull();
    expect(extractCountryFromLocation(null)).toBeNull();
  });
});

describe('aliasesFor (tolerant filters — legacy leads stay visible)', () => {
  it('returns canonical name plus every alias for it', () => {
    const variants = aliasesFor('United States');
    expect(variants).toContain('United States');
    expect(variants).toContain('usa');
    expect(variants).toContain('uk' in {} ? 'never' : 'america');
  });

  it('falls back to the raw value when unresolvable (raw leads keep matching)', () => {
    expect(aliasesFor('Wakanda')).toEqual(['Wakanda']);
  });
});

describe('searchCountries (combobox search)', () => {
  it('matches by prefix first', () => {
    const results = searchCountries('Ger');
    expect(results[0]?.name).toBe('Germany');
  });

  it('matches by ISO code', () => {
    const results = searchCountries('DE');
    expect(results.some((c) => c.code === 'DE')).toBe(true);
  });

  it('returns a bounded list', () => {
    expect(searchCountries('a').length).toBeLessThanOrEqual(12);
  });
});
