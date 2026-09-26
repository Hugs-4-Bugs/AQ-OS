// ═══════════════════════════════════════════════════════════════════
// Discovery hard-criteria unit tests (AI Lead Discovery filter fix)
// Covers the deterministic layer that CANNOT be influenced by the AI:
//   - employee-range extraction from natural language (edge tests A–E)
//   - exclusion + website-requirement extraction
//   - the hard validator (matchHardCriteria): unknown counts are
//     rejected, out-of-range counts are rejected, verified counts pass
//   - criteria merge (client + server re-extraction)
// ═══════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  extractHardCriteria,
  extractEmployeeCriteria,
  extractExclusions,
  extractWebsiteRequirement,
  matchHardCriteria,
  mergeHardCriteria,
  hasEnforceableCriteria,
  normalizeCriteriaInput,
  describeHardCriteria,
  type HardCriteria,
} from '@/lib/discovery/hard-criteria';

const NO_CRITERIA: HardCriteria = {
  website: 'any',
  excludeTypes: [],
  growthSignals: false,
  hiringSignals: false,
};

describe('extractEmployeeCriteria', () => {
  it('parses "20 to 200 employees" as an inclusive range', () => {
    expect(extractEmployeeCriteria('Find companies with 20 to 200 employees')).toEqual({
      employeeMin: 20,
      employeeMax: 200,
    });
  });

  it('parses hyphenated "20-200 employees"', () => {
    expect(extractEmployeeCriteria('companies 20-200 employees')).toEqual({
      employeeMin: 20,
      employeeMax: 200,
    });
  });

  it('parses "between 50 and 100 employees" (edge test A)', () => {
    expect(extractEmployeeCriteria('Find companies with between 50 and 100 employees')).toEqual({
      employeeMin: 50,
      employeeMax: 100,
    });
  });

  it('parses "fewer than 100 employees" as max 99 (edge test B)', () => {
    expect(extractEmployeeCriteria('Find SaaS companies with fewer than 100 employees')).toEqual({
      employeeMax: 99,
    });
  });

  it('parses "more than 500 employees" as min 501 (edge test C)', () => {
    expect(extractEmployeeCriteria('Find US companies with more than 500 employees')).toEqual({
      employeeMin: 501,
    });
  });

  it('parses "exactly 50 employees" (edge test D)', () => {
    expect(extractEmployeeCriteria('Find companies with exactly 50 employees')).toEqual({
      exactEmployeeCount: 50,
    });
  });

  it('parses "20–200 employees" with a unicode dash', () => {
    expect(extractEmployeeCriteria('20–200 employees')).toEqual({
      employeeMin: 20,
      employeeMax: 200,
    });
  });

  it('parses thousands with commas: "1,000 employees"', () => {
    expect(extractEmployeeCriteria('companies with 1,000 employees')).toEqual({
      exactEmployeeCount: 1000,
    });
  });

  it('parses k-suffix: "10k employees"', () => {
    expect(extractEmployeeCriteria('companies with 10k employees')).toEqual({
      exactEmployeeCount: 10000,
    });
  });

  it('parses "500+ employees" as min 500', () => {
    expect(extractEmployeeCriteria('companies with 500+ employees')).toEqual({
      employeeMin: 500,
    });
  });

  it('parses "at least 20 employees" as min 20', () => {
    expect(extractEmployeeCriteria('companies with at least 20 employees')).toEqual({
      employeeMin: 20,
    });
  });

  it('parses "up to 200 employees" as max 200', () => {
    expect(extractEmployeeCriteria('companies with up to 200 employees')).toEqual({
      employeeMax: 200,
    });
  });

  it('never confuses the request COUNT with employee counts', () => {
    // "Find 20 restaurants..." — 20 is a lead count, not employees
    expect(extractEmployeeCriteria('Find 20 restaurants in Dubai')).toEqual({});
    expect(extractEmployeeCriteria('Find 20 B2B SaaS companies in the United States')).toEqual({});
  });

  it('ignores numbers not anchored to employee wording', () => {
    expect(extractEmployeeCriteria('companies with 20 meetings per week')).toEqual({});
  });
});

describe('extractExclusions', () => {
  it('extracts the test exclusions', () => {
    expect(extractExclusions('Exclude agencies, freelancers, consultants, and companies without a website')).toEqual([
      'agency',
      'freelancer',
      'consultant',
    ]);
  });

  it('does not treat a mere mention as an exclusion', () => {
    expect(extractExclusions('we help agencies grow')).toEqual([]);
  });

  it('understands "no agencies" and "not consultants"', () => {
    expect(extractExclusions('no agencies, not consultants')).toEqual(['agency', 'consultant']);
  });
});

describe('extractWebsiteRequirement', () => {
  it('"have a professional website" → required', () => {
    expect(extractWebsiteRequirement('companies that have a professional website')).toBe('required');
  });

  it('"with no website" → absent', () => {
    expect(extractWebsiteRequirement('Find restaurants in Dubai with no website')).toBe('absent');
  });

  it('"Exclude companies without a website" → required (inverted)', () => {
    expect(extractWebsiteRequirement('Exclude agencies and companies without a website')).toBe('required');
  });

  it('no website mention → any', () => {
    expect(extractWebsiteRequirement('Find 20 dentists in Mumbai')).toBe('any');
  });
});

describe('extractHardCriteria — the original user query', () => {
  const QUERY =
    'Find 20 B2B SaaS companies in the United States with 20 to 200 employees that are actively growing, ' +
    'have a professional website, and appear to be investing in sales or marketing. Focus on companies where ' +
    'the founder, CEO, or Head of Sales is likely to be involved in acquiring new customers. Exclude agencies, ' +
    'freelancers, consultants, and companies without a website. Prioritize companies that show recent growth or ' +
    'hiring signals and could potentially need help improving their client acquisition process.';

  it('extracts the full structured criteria set', () => {
    const c = extractHardCriteria(QUERY);
    expect(c.employeeMin).toBe(20);
    expect(c.employeeMax).toBe(200);
    expect(c.exactEmployeeCount).toBeUndefined();
    expect(c.website).toBe('required');
    expect(c.excludeTypes).toEqual(['agency', 'freelancer', 'consultant']);
    expect(c.growthSignals).toBe(true);
    expect(c.hiringSignals).toBe(true);
  });

  it('is enforceable', () => {
    expect(hasEnforceableCriteria(extractHardCriteria(QUERY))).toBe(true);
  });
});

describe('matchHardCriteria — the hard validator', () => {
  const RANGE_20_200: HardCriteria = {
    ...NO_CRITERIA,
    employeeMin: 20,
    employeeMax: 200,
  };

  it('REJECTS Salesforce-style counts far above the range', () => {
    const v = matchHardCriteria({ businessName: 'Salesforce', employeeCount: 70000 }, RANGE_20_200);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('employee_count_out_of_range');
  });

  it('REJECTS 201 and 500 employees (strict upper bound)', () => {
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 201 }, RANGE_20_200).match).toBe(false);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 500 }, RANGE_20_200).match).toBe(false);
  });

  it('REJECTS 19 employees (strict lower bound)', () => {
    const v = matchHardCriteria({ businessName: 'A', employeeCount: 19 }, RANGE_20_200);
    expect(v.match).toBe(false);
  });

  it('ACCEPTS boundary counts 20 and 200 (inclusive)', () => {
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 20 }, RANGE_20_200).match).toBe(true);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 200 }, RANGE_20_200).match).toBe(true);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 87 }, RANGE_20_200).match).toBe(true);
  });

  it('REJECTS UNKNOWN employee counts when a range was requested (edge test E)', () => {
    const v = matchHardCriteria({ businessName: 'A', employeeCount: null }, RANGE_20_200);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('employee_count_unverified');
  });

  it('REJECTS candidates with no employee field at all when a range was requested', () => {
    const v = matchHardCriteria({ businessName: 'Workday' }, RANGE_20_200);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('employee_count_unverified');
  });

  it('honours provider RANGES: "51-100" inside 20–200 passes; "201-500" fails', () => {
    expect(matchHardCriteria({ businessName: 'A', employeeRange: '51-100' }, RANGE_20_200).match).toBe(true);
    const v = matchHardCriteria({ businessName: 'A', employeeRange: '201-500' }, RANGE_20_200);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('employee_count_out_of_range');
  });

  it('REJECTS partially-overlapping provider ranges (cannot verify)', () => {
    const v = matchHardCriteria({ businessName: 'A', employeeRange: '100-500' }, RANGE_20_200);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('employee_count_unverified');
  });

  it('exact count: only the exact number passes (edge test D validator)', () => {
    const c: HardCriteria = { ...NO_CRITERIA, exactEmployeeCount: 50 };
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 50 }, c).match).toBe(true);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 51 }, c).match).toBe(false);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: null }, c).match).toBe(false);
  });

  it('fewer-than-100 criteria reject 100+ (edge test B validator)', () => {
    const c: HardCriteria = { ...NO_CRITERIA, employeeMax: 99 };
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 99 }, c).match).toBe(true);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 100 }, c).match).toBe(false);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 5000 }, c).match).toBe(false);
  });

  it('more-than-500 criteria reject 500 and below (edge test C validator)', () => {
    const c: HardCriteria = { ...NO_CRITERIA, employeeMin: 501 };
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 501 }, c).match).toBe(true);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 500 }, c).match).toBe(false);
    expect(matchHardCriteria({ businessName: 'A', employeeCount: 75 }, c).match).toBe(false);
  });

  it('enforces website required', () => {
    const c: HardCriteria = { ...NO_CRITERIA, website: 'required' };
    expect(matchHardCriteria({ businessName: 'A', website: 'https://a.com' }, c).match).toBe(true);
    const v = matchHardCriteria({ businessName: 'A' }, c);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('website_required_missing');
  });

  it('enforces website absent ("no website" requests)', () => {
    const c: HardCriteria = { ...NO_CRITERIA, website: 'absent' };
    expect(matchHardCriteria({ businessName: 'A' }, c).match).toBe(true);
    const v = matchHardCriteria({ businessName: 'A', website: 'https://a.com' }, c);
    expect(v.match).toBe(false);
    expect(v.reason).toBe('website_absent_present');
  });

  it('REJECTS excluded company types by name — even with a perfect employee count', () => {
    const c: HardCriteria = { ...NO_CRITERIA, excludeTypes: ['agency', 'freelancer', 'consultant'] };
    for (const name of ['Acme Consulting', 'Growth Agency LLC', 'Freelance Design Co', 'Bright Consultants']) {
      const v = matchHardCriteria({ businessName: name, employeeCount: 87 }, c);
      expect(v.match).toBe(false);
      expect(v.reason).toBe('excluded_company_type');
    }
  });

  it('passes companies that violate nothing', () => {
    expect(
      matchHardCriteria(
        { businessName: 'Acme CRM', website: 'https://acme.io', employeeCount: 87 },
        RANGE_20_200
      ).match
    ).toBe(true);
  });

  it('passes EVERYTHING when criteria are empty (no hard filters requested)', () => {
    expect(matchHardCriteria({ businessName: 'Salesforce', employeeCount: 70000 }, NO_CRITERIA).match).toBe(true);
    expect(matchHardCriteria({ businessName: 'Anything' }, NO_CRITERIA).match).toBe(true);
  });
});

describe('mergeHardCriteria + normalizeCriteriaInput', () => {
  it('intersects numeric bounds strictly', () => {
    const merged = mergeHardCriteria(
      { ...NO_CRITERIA, employeeMin: 20, employeeMax: 200 },
      { ...NO_CRITERIA, employeeMin: 50, employeeMax: 100 }
    );
    expect(merged.employeeMin).toBe(50);
    expect(merged.employeeMax).toBe(100);
  });

  it('unions exclusions and takes the stricter website rule', () => {
    const merged = mergeHardCriteria(
      { ...NO_CRITERIA, excludeTypes: ['agency'], website: 'required' },
      { ...NO_CRITERIA, excludeTypes: ['consultant'] }
    );
    expect(merged.excludeTypes.sort()).toEqual(['agency', 'consultant']);
    expect(merged.website).toBe('required');
  });

  it('normalizeCriteriaInput drops unknown exclusion types and junk numbers', () => {
    const c = normalizeCriteriaInput({
      employeeMin: '30',
      employeeMax: -5,
      exactEmployeeCount: 'abc',
      excludeTypes: ['agency', 'wizard'],
      website: 'REQUIRED',
    });
    expect(c.employeeMin).toBe(30);
    expect(c.employeeMax).toBeUndefined();
    expect(c.exactEmployeeCount).toBeUndefined();
    expect(c.excludeTypes).toEqual(['agency']);
    expect(c.website).toBe('required');
  });

  it('REGRESSION: AI null employee fields must never become "exactly 0" constraints', () => {
    // The AI parser used to map null → Number(null) === 0 → a hard filter
    // of "exactly 0 employees" that would reject every company.
    const c = normalizeCriteriaInput({
      employeeMin: null,
      employeeMax: null,
      exactEmployeeCount: 0,
    });
    expect(c.employeeMin).toBeUndefined();
    expect(c.employeeMax).toBeUndefined();
    expect(c.exactEmployeeCount).toBeUndefined();
    expect(hasEnforceableCriteria(c)).toBe(false);
  });

  it('describeHardCriteria produces a human label', () => {
    expect(describeHardCriteria({ ...NO_CRITERIA, employeeMin: 20, employeeMax: 200 })).toBe('20–200 employees');
    expect(describeHardCriteria({ ...NO_CRITERIA, exactEmployeeCount: 50 })).toBe('exactly 50 employees');
  });
});
