// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Phone & Country Calling Code Utilities
// Shared by client (Settings → Profile) and server (profile API).
//
// Product rules (Settings → Profile → Phone):
//   1. The country calling code is selected via a dedicated dropdown.
//   2. The local phone number field accepts DIGITS ONLY.
//   3. The local number is at most MAX_LOCAL_PHONE_DIGITS digits.
//      The country code does NOT count toward that limit.
//   4. A stored phone is kept in international format: +<dial><national>.
//      Legacy values (bare digits or formatted strings) are preserved and
//      parsed for display; they are only re-validated when the user edits
//      them (see validateSubmittedPhone usage in the profile API).
// ═══════════════════════════════════════════════════════════════════

// ── Country calling codes (ITU E.164 assignments) ───────────────────
// Tuple: [ISO 3166-1 alpha-2, Country name, dial code without '+'].
// Shared dial codes (NANP +1, +7, +44 …) appear once per country/territory
// so the dropdown lists them comprehensively; code EXTRACTION always uses
// longest-prefix matching, so +1 vs +1242 etc. resolve correctly.

type RawCountry = [iso: string, name: string, dial: string];

const RAW_COUNTRY_CODES: RawCountry[] = [
  ['AF', 'Afghanistan', '93'],
  ['AX', 'Åland Islands', '358'],
  ['AL', 'Albania', '355'],
  ['DZ', 'Algeria', '213'],
  ['AS', 'American Samoa', '1684'],
  ['AD', 'Andorra', '376'],
  ['AO', 'Angola', '244'],
  ['AI', 'Anguilla', '1264'],
  ['AG', 'Antigua & Barbuda', '1268'],
  ['AR', 'Argentina', '54'],
  ['AM', 'Armenia', '374'],
  ['AW', 'Aruba', '297'],
  ['AU', 'Australia', '61'],
  ['AT', 'Austria', '43'],
  ['AZ', 'Azerbaijan', '994'],
  ['BS', 'Bahamas', '1242'],
  ['BH', 'Bahrain', '973'],
  ['BD', 'Bangladesh', '880'],
  ['BB', 'Barbados', '1246'],
  ['BY', 'Belarus', '375'],
  ['BE', 'Belgium', '32'],
  ['BZ', 'Belize', '501'],
  ['BJ', 'Benin', '229'],
  ['BM', 'Bermuda', '1441'],
  ['BT', 'Bhutan', '975'],
  ['BO', 'Bolivia', '591'],
  ['BA', 'Bosnia & Herzegovina', '387'],
  ['BW', 'Botswana', '267'],
  ['BR', 'Brazil', '55'],
  ['IO', 'British Indian Ocean Territory', '246'],
  ['BN', 'Brunei', '673'],
  ['BG', 'Bulgaria', '359'],
  ['BF', 'Burkina Faso', '226'],
  ['BI', 'Burundi', '257'],
  ['KH', 'Cambodia', '855'],
  ['CM', 'Cameroon', '237'],
  ['CA', 'Canada', '1'],
  ['CV', 'Cape Verde', '238'],
  ['KY', 'Cayman Islands', '1345'],
  ['CF', 'Central African Republic', '236'],
  ['TD', 'Chad', '235'],
  ['CL', 'Chile', '56'],
  ['CN', 'China', '86'],
  ['CX', 'Christmas Island', '61'],
  ['CC', 'Cocos (Keeling) Islands', '61'],
  ['CO', 'Colombia', '57'],
  ['KM', 'Comoros', '269'],
  ['CG', 'Congo (Republic)', '242'],
  ['CD', 'Congo (DRC)', '243'],
  ['CK', 'Cook Islands', '682'],
  ['CR', 'Costa Rica', '506'],
  ['CI', "Côte d'Ivoire", '225'],
  ['HR', 'Croatia', '385'],
  ['CU', 'Cuba', '53'],
  ['CW', 'Curaçao', '599'],
  ['CY', 'Cyprus', '357'],
  ['CZ', 'Czechia', '420'],
  ['DK', 'Denmark', '45'],
  ['DJ', 'Djibouti', '253'],
  ['DM', 'Dominica', '1767'],
  ['DO', 'Dominican Republic', '1809'],
  ['EC', 'Ecuador', '593'],
  ['EG', 'Egypt', '20'],
  ['SV', 'El Salvador', '503'],
  ['GQ', 'Equatorial Guinea', '240'],
  ['ER', 'Eritrea', '291'],
  ['EE', 'Estonia', '372'],
  ['SZ', 'Eswatini', '268'],
  ['ET', 'Ethiopia', '251'],
  ['FK', 'Falkland Islands', '500'],
  ['FO', 'Faroe Islands', '298'],
  ['FJ', 'Fiji', '679'],
  ['FI', 'Finland', '358'],
  ['FR', 'France', '33'],
  ['GF', 'French Guiana', '594'],
  ['PF', 'French Polynesia', '689'],
  ['GA', 'Gabon', '241'],
  ['GM', 'Gambia', '220'],
  ['GE', 'Georgia', '995'],
  ['DE', 'Germany', '49'],
  ['GH', 'Ghana', '233'],
  ['GI', 'Gibraltar', '350'],
  ['GR', 'Greece', '30'],
  ['GL', 'Greenland', '299'],
  ['GD', 'Grenada', '1473'],
  ['GP', 'Guadeloupe', '590'],
  ['GU', 'Guam', '1671'],
  ['GT', 'Guatemala', '502'],
  ['GG', 'Guernsey', '44'],
  ['GN', 'Guinea', '224'],
  ['GW', 'Guinea-Bissau', '245'],
  ['GY', 'Guyana', '592'],
  ['HT', 'Haiti', '509'],
  ['HN', 'Honduras', '504'],
  ['HK', 'Hong Kong', '852'],
  ['HU', 'Hungary', '36'],
  ['IS', 'Iceland', '354'],
  ['IN', 'India', '91'],
  ['ID', 'Indonesia', '62'],
  ['IR', 'Iran', '98'],
  ['IQ', 'Iraq', '964'],
  ['IE', 'Ireland', '353'],
  ['IM', 'Isle of Man', '44'],
  ['IL', 'Israel', '972'],
  ['IT', 'Italy', '39'],
  ['JM', 'Jamaica', '1876'],
  ['JP', 'Japan', '81'],
  ['JE', 'Jersey', '44'],
  ['JO', 'Jordan', '962'],
  ['KZ', 'Kazakhstan', '7'],
  ['KE', 'Kenya', '254'],
  ['KI', 'Kiribati', '686'],
  ['XK', 'Kosovo', '383'],
  ['KW', 'Kuwait', '965'],
  ['KG', 'Kyrgyzstan', '996'],
  ['LA', 'Laos', '856'],
  ['LV', 'Latvia', '371'],
  ['LB', 'Lebanon', '961'],
  ['LS', 'Lesotho', '266'],
  ['LR', 'Liberia', '231'],
  ['LY', 'Libya', '218'],
  ['LI', 'Liechtenstein', '423'],
  ['LT', 'Lithuania', '370'],
  ['LU', 'Luxembourg', '352'],
  ['MO', 'Macau', '853'],
  ['MG', 'Madagascar', '261'],
  ['MW', 'Malawi', '265'],
  ['MY', 'Malaysia', '60'],
  ['MV', 'Maldives', '960'],
  ['ML', 'Mali', '223'],
  ['MT', 'Malta', '356'],
  ['MH', 'Marshall Islands', '692'],
  ['MQ', 'Martinique', '596'],
  ['MR', 'Mauritania', '222'],
  ['MU', 'Mauritius', '230'],
  ['YT', 'Mayotte', '262'],
  ['MX', 'Mexico', '52'],
  ['FM', 'Micronesia', '691'],
  ['MD', 'Moldova', '373'],
  ['MC', 'Monaco', '377'],
  ['MN', 'Mongolia', '976'],
  ['ME', 'Montenegro', '382'],
  ['MS', 'Montserrat', '1664'],
  ['MA', 'Morocco', '212'],
  ['MZ', 'Mozambique', '258'],
  ['MM', 'Myanmar', '95'],
  ['NA', 'Namibia', '264'],
  ['NR', 'Nauru', '674'],
  ['NP', 'Nepal', '977'],
  ['NL', 'Netherlands', '31'],
  ['NC', 'New Caledonia', '687'],
  ['NZ', 'New Zealand', '64'],
  ['NI', 'Nicaragua', '505'],
  ['NE', 'Niger', '227'],
  ['NG', 'Nigeria', '234'],
  ['NU', 'Niue', '683'],
  ['NF', 'Norfolk Island', '672'],
  ['KP', 'North Korea', '850'],
  ['MK', 'North Macedonia', '389'],
  ['MP', 'Northern Mariana Islands', '1670'],
  ['NO', 'Norway', '47'],
  ['OM', 'Oman', '968'],
  ['PK', 'Pakistan', '92'],
  ['PW', 'Palau', '680'],
  ['PS', 'Palestine', '970'],
  ['PA', 'Panama', '507'],
  ['PG', 'Papua New Guinea', '675'],
  ['PY', 'Paraguay', '595'],
  ['PE', 'Peru', '51'],
  ['PH', 'Philippines', '63'],
  ['PL', 'Poland', '48'],
  ['PT', 'Portugal', '351'],
  ['PR', 'Puerto Rico', '1787'],
  ['QA', 'Qatar', '974'],
  ['RE', 'Réunion', '262'],
  ['RO', 'Romania', '40'],
  ['RU', 'Russia', '7'],
  ['RW', 'Rwanda', '250'],
  ['BL', 'Saint Barthélemy', '590'],
  ['SH', 'Saint Helena', '290'],
  ['KN', 'Saint Kitts & Nevis', '1869'],
  ['LC', 'Saint Lucia', '1758'],
  ['MF', 'Saint Martin', '590'],
  ['PM', 'Saint Pierre & Miquelon', '508'],
  ['VC', 'Saint Vincent & the Grenadines', '1784'],
  ['WS', 'Samoa', '685'],
  ['SM', 'San Marino', '378'],
  ['ST', 'São Tomé & Príncipe', '239'],
  ['SA', 'Saudi Arabia', '966'],
  ['SN', 'Senegal', '221'],
  ['RS', 'Serbia', '381'],
  ['SC', 'Seychelles', '248'],
  ['SL', 'Sierra Leone', '232'],
  ['SG', 'Singapore', '65'],
  ['SX', 'Sint Maarten', '1721'],
  ['SK', 'Slovakia', '421'],
  ['SI', 'Slovenia', '386'],
  ['SB', 'Solomon Islands', '677'],
  ['SO', 'Somalia', '252'],
  ['ZA', 'South Africa', '27'],
  ['KR', 'South Korea', '82'],
  ['SS', 'South Sudan', '211'],
  ['ES', 'Spain', '34'],
  ['LK', 'Sri Lanka', '94'],
  ['SD', 'Sudan', '249'],
  ['SR', 'Suriname', '597'],
  ['SE', 'Sweden', '46'],
  ['CH', 'Switzerland', '41'],
  ['SY', 'Syria', '963'],
  ['TW', 'Taiwan', '886'],
  ['TJ', 'Tajikistan', '992'],
  ['TZ', 'Tanzania', '255'],
  ['TH', 'Thailand', '66'],
  ['TL', 'Timor-Leste', '670'],
  ['TG', 'Togo', '228'],
  ['TK', 'Tokelau', '690'],
  ['TO', 'Tonga', '676'],
  ['TT', 'Trinidad & Tobago', '1868'],
  ['TN', 'Tunisia', '216'],
  ['TR', 'Turkey', '90'],
  ['TM', 'Turkmenistan', '993'],
  ['TC', 'Turks & Caicos Islands', '1649'],
  ['TV', 'Tuvalu', '688'],
  ['UG', 'Uganda', '256'],
  ['UA', 'Ukraine', '380'],
  ['AE', 'United Arab Emirates', '971'],
  ['GB', 'United Kingdom', '44'],
  ['US', 'United States', '1'],
  ['UY', 'Uruguay', '598'],
  ['UZ', 'Uzbekistan', '998'],
  ['VU', 'Vanuatu', '678'],
  ['VA', 'Vatican City', '39'],
  ['VE', 'Venezuela', '58'],
  ['VN', 'Vietnam', '84'],
  ['VG', 'Virgin Islands (British)', '1284'],
  ['VI', 'Virgin Islands (U.S.)', '1340'],
  ['WF', 'Wallis & Futuna', '681'],
  ['EH', 'Western Sahara', '212'],
  ['YE', 'Yemen', '967'],
  ['ZM', 'Zambia', '260'],
  ['ZW', 'Zimbabwe', '263'],
];

export interface CountryCallingCode {
  iso: string;
  name: string;
  dial: string;
}

/** Comprehensive list of countries/territories with their calling codes (dropdown source). */
export const COUNTRY_CALLING_CODES: CountryCallingCode[] = RAW_COUNTRY_CODES
  .map(([iso, name, dial]) => ({ iso, name, dial }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Maximum number of digits allowed in the LOCAL (national) phone number. */
export const MAX_LOCAL_PHONE_DIGITS = 10;

/** ISO code used as the default dial-code selection (product's primary market). */
export const DEFAULT_PHONE_ISO = 'IN';

// Lookup maps (built once at module load)
const DIAL_CODES_BY_LENGTH: string[] = Array.from(
  new Set(RAW_COUNTRY_CODES.map(([, , dial]) => dial))
).sort((a, b) => b.length - a.length);

const ISO_TO_COUNTRY = new Map(RAW_COUNTRY_CODES.map(([iso, name, dial]) => [iso, { iso, name, dial }]));
const NAME_TO_DIAL = new Map(
  RAW_COUNTRY_CODES.map(([, name, dial]) => [name.toLowerCase(), dial])
);

/** Get a country entry by ISO code (e.g. 'IN' → India/+91). */
export function countryByIso(iso: string): CountryCallingCode | null {
  return ISO_TO_COUNTRY.get(iso) ?? null;
}

/**
 * Longest-prefix match a dial code against a digit string.
 * E.g. '919663076023' → '91' (India), '12421234567' → '1242' (Anguilla),
 * '998901234567' → '998' (Uzbekistan).
 */
export function findDialCodeByDigits(digits: string): string | null {
  for (const dial of DIAL_CODES_BY_LENGTH) {
    if (digits.startsWith(dial)) return dial;
  }
  return null;
}

/** Resolve the dial code for a stored country NAME (e.g. 'India' → '91'). */
export function dialForCountryName(name: string | null | undefined): string | null {
  if (!name) return null;
  return NAME_TO_DIAL.get(name.trim().toLowerCase()) ?? null;
}

export interface ParsedStoredPhone {
  /** Dial code without '+' — null when it could not be determined. */
  dial: string | null;
  /** Local (national) digits. */
  national: string;
  /**
   * False when the stored value does not satisfy the current product rules
   * (e.g. a legacy number whose local part exceeds 10 digits). The UI uses
   * this to warn the user; such values are still preserved until edited.
   */
  clean: boolean;
}

/**
 * Parse an existing stored phone value for display in the two-field UI.
 * Handles: international format (+<dial><national>), legacy bare digits,
 * legacy formatted strings (spaces/dashes), and junk. Never throws.
 */
export function parseStoredPhone(
  raw: string | null | undefined,
  countryHint?: string | null
): ParsedStoredPhone {
  const hintDial = dialForCountryName(countryHint);
  const value = (raw ?? '').trim();

  if (!value) return { dial: hintDial ?? null, national: '', clean: true };

  const hasPlus = value.startsWith('+');
  const digits = value.replace(/\D/g, '');

  if (!digits) return { dial: hintDial ?? null, national: '', clean: false };

  if (hasPlus) {
    const dial = findDialCodeByDigits(digits);
    if (dial) {
      const national = digits.slice(dial.length);
      return {
        dial,
        national,
        clean: national.length >= 1 && national.length <= MAX_LOCAL_PHONE_DIGITS,
      };
    }
    // Leading '+' but no recognizable calling code — surface the digits so
    // the user can correct them; do not guess.
    return { dial: null, national: digits, clean: false };
  }

  // Legacy bare/formatted value — keep digits as the local number and use
  // the profile's country (when it maps uniquely) as the selected code.
  return {
    dial: hintDial ?? null,
    national: digits,
    clean: digits.length <= MAX_LOCAL_PHONE_DIGITS,
  };
}

/** Compose the stored international format: '+<dial><national>'. */
export function composePhone(dial: string, national: string): string {
  return `+${dial}${national}`;
}

/**
 * Input filter for the LOCAL number field: strips every non-digit character
 * and caps the value at MAX_LOCAL_PHONE_DIGITS. If the pasted/typed value
 * contains a '+' (i.e. someone tries to enter a country code here), the
 * recognized calling code is separated out and removed so it can never be
 * duplicated inside the local number — the code belongs to the dropdown and
 * does NOT count toward the 10-digit limit. The submitted value is validated
 * again independently (client + server) — do not rely on this filter alone.
 */
export function filterNationalInput(value: string): string {
  const hasPlus = value.includes('+');
  let digits = value.replace(/\D/g, '');
  if (hasPlus && digits) {
    const dial = findDialCodeByDigits(digits);
    if (dial) digits = digits.slice(dial.length);
  }
  return digits.slice(0, MAX_LOCAL_PHONE_DIGITS);
}

export interface PhoneValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Server-authoritative validation for a phone value SUBMITTED to the API.
 * A submitted value is either:
 *   - empty            → allowed (phone is optional)
 *   - bare local digits → at most MAX_LOCAL_PHONE_DIGITS digits
 *   - international     → '+' + known dial code + 1..MAX_LOCAL_PHONE_DIGITS digits
 * Anything else (letters, unknown calling code, local part > 10 digits) is
 * rejected. NOTE: values that merely round-trip an existing stored record are
 * handled by the caller (see the profile API) so legacy data is never
 * corrupted or blocked from unrelated profile saves.
 */
export function validateSubmittedPhone(raw: string): PhoneValidationResult {
  const value = (raw ?? '').trim();

  if (!value) return { valid: true };

  if (!/^\+?[0-9]+$/.test(value)) {
    return {
      valid: false,
      error: 'Phone number can contain digits only. Select the country code with the dropdown — do not type it into the number field.',
    };
  }

  if (value.startsWith('+')) {
    const digits = value.slice(1);
    const dial = findDialCodeByDigits(digits);
    if (!dial) {
      return { valid: false, error: 'Unrecognized country calling code. Pick the country from the dropdown instead.' };
    }
    const national = digits.slice(dial.length);
    if (!national) {
      return { valid: false, error: 'Phone number is missing the local number after the country code.' };
    }
    if (national.length > MAX_LOCAL_PHONE_DIGITS) {
      return {
        valid: false,
        error: `Local phone number must be at most ${MAX_LOCAL_PHONE_DIGITS} digits — the country code +${dial} is not counted.`,
      };
    }
    return { valid: true };
  }

  if (value.length > MAX_LOCAL_PHONE_DIGITS) {
    return {
      valid: false,
      error: `Local phone number must be at most ${MAX_LOCAL_PHONE_DIGITS} digits — the country code is selected separately and is not counted.`,
    };
  }

  return { valid: true };
}
