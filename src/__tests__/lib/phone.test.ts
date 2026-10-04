// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Phone & Country Calling Code utilities (src/lib/phone.ts)
// Covers: country list integrity, dial-code parsing, stored-phone parsing,
// local-number validation rules (max 10 digits, digits-only, code separate).
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  COUNTRY_CALLING_CODES,
  MAX_LOCAL_PHONE_DIGITS,
  composePhone,
  countryByIso,
  dialForCountryName,
  filterNationalInput,
  findDialCodeByDigits,
  parseStoredPhone,
  validateSubmittedPhone,
} from '@/lib/phone';

describe('phone country calling codes', () => {
  it('has a comprehensive country list (200+ entries)', () => {
    expect(COUNTRY_CALLING_CODES.length).toBeGreaterThanOrEqual(200);
  });

  it('has unique ISO codes and includes the major markets', () => {
    const isos = COUNTRY_CALLING_CODES.map((c) => c.iso);
    expect(new Set(isos).size).toBe(isos.length);
    for (const iso of ['IN', 'US', 'GB', 'AE', 'DE', 'SG', 'AU']) {
      expect(isos).toContain(iso);
    }
  });

  it('maps India to +91 and the US to +1', () => {
    expect(countryByIso('IN')).toMatchObject({ name: 'India', dial: '91' });
    expect(countryByIso('US')).toMatchObject({ name: 'United States', dial: '1' });
  });

  it('resolves country names to dial codes (case-insensitive)', () => {
    expect(dialForCountryName('India')).toBe('91');
    expect(dialForCountryName('india')).toBe('91');
    expect(dialForCountryName('Unknown Country')).toBeNull();
    expect(dialForCountryName('')).toBeNull();
  });
});

describe('findDialCodeByDigits (longest-prefix match)', () => {
  it('matches India +91 and does not confuse it with shorter prefixes', () => {
    expect(findDialCodeByDigits('919663076023')).toBe('91');
  });

  it('matches 4-digit codes before shorter ones (Anguilla +1264)', () => {
    expect(findDialCodeByDigits('12641234567')).toBe('1264');
    // NANP +1 (US/CA) is matched when no longer country code applies
    expect(findDialCodeByDigits('12125550123')).toBe('1');
  });

  it('matches +998 (Uzbekistan) before +99-prefix dead ends', () => {
    expect(findDialCodeByDigits('998901234567')).toBe('998');
  });

  it('returns null for unknown prefixes', () => {
    expect(findDialCodeByDigits('999')).toBeNull();
  });
});

describe('parseStoredPhone (legacy value display)', () => {
  it('parses the international format', () => {
    expect(parseStoredPhone('+919663076023')).toEqual({
      dial: '91',
      national: '9663076023',
      clean: true,
    });
  });

  it('parses a legacy formatted value with spaces', () => {
    const parsed = parseStoredPhone('+91 98000 1790000123');
    expect(parsed.dial).toBe('91');
    expect(parsed.national).toBe('980001790000123');
    expect(parsed.clean).toBe(false); // 15-digit local part exceeds the limit
  });

  it('parses legacy bare digits using the country hint', () => {
    expect(parseStoredPhone('9663076023', 'India')).toEqual({
      dial: '91',
      national: '9663076023',
      clean: true,
    });
  });

  it('handles empty values', () => {
    expect(parseStoredPhone('', 'India')).toEqual({ dial: '91', national: '', clean: true });
    expect(parseStoredPhone(null)).toEqual({ dial: null, national: '', clean: true });
  });

  it('does not crash on junk and flags it as unclean', () => {
    const parsed = parseStoredPhone('call me maybe');
    expect(parsed.national).toBe('');
    expect(parsed.clean).toBe(false);
  });
});

describe('validateSubmittedPhone (server-authoritative rules)', () => {
  it('accepts a valid 10-digit local number (product example)', () => {
    expect(validateSubmittedPhone('9663076023')).toEqual({ valid: true });
  });

  it('rejects an 11-digit local number (product example)', () => {
    const result = validateSubmittedPhone('96630760234');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 10 digits');
  });

  it('accepts the composed international format (+91 + 10 digits)', () => {
    expect(validateSubmittedPhone('+919663076023')).toEqual({ valid: true });
  });

  it('rejects an international value whose local part exceeds 10 digits', () => {
    const result = validateSubmittedPhone('+9196630760234'); // 11 local digits
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at most 10 digits');
  });

  it('rejects letters and formatting characters', () => {
    expect(validateSubmittedPhone('abc123').valid).toBe(false);
    expect(validateSubmittedPhone('91 9663076023').valid).toBe(false);
  });

  it('rejects an unknown calling code after +', () => {
    expect(validateSubmittedPhone('+9991234567').valid).toBe(false);
  });

  it('allows clearing the phone (empty value)', () => {
    expect(validateSubmittedPhone('')).toEqual({ valid: true });
    expect(validateSubmittedPhone('   ')).toEqual({ valid: true });
  });

  it('enforces the limit constant of 10', () => {
    expect(MAX_LOCAL_PHONE_DIGITS).toBe(10);
  });
});

describe('composePhone + filterNationalInput', () => {
  it('composes the stored international format', () => {
    expect(composePhone('91', '9663076023')).toBe('+919663076023');
  });

  it('separates a pasted country code so it cannot be duplicated (product example 3)', () => {
    // '+919663076023' pasted into the local field → code removed, local part kept
    expect(filterNationalInput('+919663076023')).toBe('9663076023');
    expect(filterNationalInput('+1 (212) 555-0123')).toBe('2125550123');
  });

  it('strips non-digit characters from local input', () => {
    expect(filterNationalInput('91-96630 7602')).toBe('9196630760'); // no '+' → no code assumption
    expect(filterNationalInput('abc')).toBe('');
  });

  it('caps local input at 10 digits', () => {
    expect(filterNationalInput('123456789012345')).toBe('1234567890');
  });
});
