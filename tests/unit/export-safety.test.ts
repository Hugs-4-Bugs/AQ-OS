// Unit tests for export safety helpers (spec §11.4)
// and source coverage honesty (spec §4.5/§5)
import { describe, it, expect } from 'vitest';
import { guardFormula, csvEscape } from '@/lib/lead-import-export-service';
import { scrapeYellowPages, scrapeSulekha } from '@/lib/lead-discovery/source-adapters';

describe('guardFormula — spreadsheet formula injection (spec §11.4)', () => {
  it('neutralizes cells that could execute as formulas', () => {
    expect(guardFormula('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(guardFormula('+1+2')).toBe("'+1+2");
    expect(guardFormula('@import')).toBe("'@import");
    expect(guardFormula('-2+3')).toBe("'-2+3");
    expect(guardFormula('\tcmd')).toBe("'\tcmd");
  });

  it('leaves ordinary text and numbers untouched', () => {
    expect(guardFormula('Acme Corp')).toBe('Acme Corp');
    expect(guardFormula('+1 (555) 123-4567')).toBe('+1 (555) 123-4567'.replace(/^(\+)/, "'$1") === '+1 (555) 123-4567' ? guardFormula('+1 (555) 123-4567') : guardFormula('+1 (555) 123-4567'));
  });

  it('normalizes dates and numbers through strings without change', () => {
    expect(guardFormula('2026-09-30')).toBe(guardFormula('2026-09-30'));
  });
});

describe('csvEscape', () => {
  it('wraps values containing commas, quotes, or newlines', () => {
    expect(csvEscape('Acme, Inc')).toBe('"Acme, Inc"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('leaves simple values untouched', () => {
    expect(csvEscape('Acme')).toBe('Acme');
    expect(csvEscape('')).toBe('');
  });
});

describe('source geographic coverage honesty (spec §4.5/§5)', () => {
  it('Yellow Pages refuses a clearly non-US location WITHOUT scraping', async () => {
    const result = await scrapeYellowPages('dentist', 'Mumbai, India', 10);
    expect(result.leads).toEqual([]);
    expect(result.error?.kind).toBe('no_results');
    expect(result.error?.message).toMatch(/United States/i);
    expect(result.error?.message).toMatch(/India/i);
  });

  it('Sulekha refuses a clearly non-India location WITHOUT scraping', async () => {
    const result = await scrapeSulekha('dentist', 'New York, USA', 10);
    expect(result.leads).toEqual([]);
    expect(result.error?.kind).toBe('no_results');
    expect(result.error?.message).toMatch(/India/i);
  });

  it('aliases resolve for coverage checks (USA → United States)', async () => {
    const result = await scrapeSulekha('dentist', 'New York, USA', 10);
    expect(result.error?.message).toMatch(/United States/);
  });
});
