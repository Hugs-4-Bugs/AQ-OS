// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Worldwide Country Dataset (ISO 3166-1)
//
// Complete, maintained country dataset for worldwide lead discovery:
//   - ISO 3166-1 alpha-2 code + common English name for every country
//   - Common alias resolution (USA → United States, UK → United Kingdom …)
//   - Canonical normalization so discovery, persistence, and filters all
//     use ONE canonical name (spec §5: "Normalize country names and codes
//     consistently", "Handle alternate spellings and common aliases")
//
// No network calls, no external dependency — a static snapshot of the
// ISO 3166-1 standard (249 officially assigned codes).
// ═══════════════════════════════════════════════════════════════════

export interface CountryEntry {
  /** ISO 3166-1 alpha-2 code, e.g. "US". */
  code: string;
  /** Canonical English short name, e.g. "United States". */
  name: string;
}

// [alpha-2, canonical name] — ISO 3166-1 officially assigned codes.
const RAW_COUNTRIES: Array<[string, string]> = [
  ['AD', 'Andorra'], ['AE', 'United Arab Emirates'], ['AF', 'Afghanistan'],
  ['AG', 'Antigua and Barbuda'], ['AI', 'Anguilla'], ['AL', 'Albania'],
  ['AM', 'Armenia'], ['AO', 'Angola'], ['AQ', 'Antarctica'], ['AR', 'Argentina'],
  ['AS', 'American Samoa'], ['AT', 'Austria'], ['AU', 'Australia'],
  ['AW', 'Aruba'], ['AX', 'Åland Islands'], ['AZ', 'Azerbaijan'],
  ['BA', 'Bosnia and Herzegovina'], ['BB', 'Barbados'], ['BD', 'Bangladesh'],
  ['BE', 'Belgium'], ['BF', 'Burkina Faso'], ['BG', 'Bulgaria'], ['BH', 'Bahrain'],
  ['BI', 'Burundi'], ['BJ', 'Benin'], ['BL', 'Saint Barthélemy'], ['BM', 'Bermuda'],
  ['BN', 'Brunei Darussalam'], ['BO', 'Bolivia'], ['BQ', 'Bonaire, Sint Eustatius and Saba'],
  ['BR', 'Brazil'], ['BS', 'Bahamas'], ['BT', 'Bhutan'], ['BV', 'Bouvet Island'],
  ['BW', 'Botswana'], ['BY', 'Belarus'], ['BZ', 'Belize'],
  ['CA', 'Canada'], ['CC', 'Cocos (Keeling) Islands'],
  ['CD', 'Congo, Democratic Republic of the'], ['CF', 'Central African Republic'],
  ['CG', 'Congo'], ['CH', 'Switzerland'], ['CI', "Côte d'Ivoire"],
  ['CK', 'Cook Islands'], ['CL', 'Chile'], ['CM', 'Cameroon'], ['CN', 'China'],
  ['CO', 'Colombia'], ['CR', 'Costa Rica'], ['CU', 'Cuba'], ['CV', 'Cabo Verde'],
  ['CW', 'Curaçao'], ['CX', 'Christmas Island'], ['CY', 'Cyprus'],
  ['CZ', 'Czechia'],
  ['DE', 'Germany'], ['DJ', 'Djibouti'], ['DK', 'Denmark'], ['DM', 'Dominica'],
  ['DO', 'Dominican Republic'], ['DZ', 'Algeria'],
  ['EC', 'Ecuador'], ['EE', 'Estonia'], ['EG', 'Egypt'], ['EH', 'Western Sahara'],
  ['ER', 'Eritrea'], ['ES', 'Spain'], ['ET', 'Ethiopia'],
  ['FI', 'Finland'], ['FJ', 'Fiji'], ['FK', 'Falkland Islands (Malvinas)'],
  ['FM', 'Micronesia'], ['FO', 'Faroe Islands'], ['FR', 'France'],
  ['GA', 'Gabon'], ['GB', 'United Kingdom'], ['GD', 'Grenada'],
  ['GE', 'Georgia'], ['GF', 'French Guiana'], ['GG', 'Guernsey'], ['GH', 'Ghana'],
  ['GI', 'Gibraltar'], ['GL', 'Greenland'], ['GM', 'Gambia'], ['GN', 'Guinea'],
  ['GP', 'Guadeloupe'], ['GQ', 'Equatorial Guinea'], ['GR', 'Greece'],
  ['GS', 'South Georgia and the South Sandwich Islands'], ['GT', 'Guatemala'],
  ['GU', 'Guam'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'],
  ['HK', 'Hong Kong'], ['HM', 'Heard Island and McDonald Islands'],
  ['HN', 'Honduras'], ['HR', 'Croatia'], ['HT', 'Haiti'], ['HU', 'Hungary'],
  ['ID', 'Indonesia'], ['IE', 'Ireland'], ['IL', 'Israel'], ['IM', 'Isle of Man'],
  ['IN', 'India'], ['IO', 'British Indian Ocean Territory'], ['IQ', 'Iraq'],
  ['IR', 'Iran'], ['IS', 'Iceland'], ['IT', 'Italy'],
  ['JE', 'Jersey'], ['JM', 'Jamaica'], ['JO', 'Jordan'], ['JP', 'Japan'],
  ['KE', 'Kenya'], ['KG', 'Kyrgyzstan'], ['KH', 'Cambodia'], ['KI', 'Kiribati'],
  ['KM', 'Comoros'], ['KN', 'Saint Kitts and Nevis'], ['KP', "Korea, Democratic People's Republic of"],
  ['KR', 'Korea, Republic of'], ['KW', 'Kuwait'], ['KY', 'Cayman Islands'],
  ['KZ', 'Kazakhstan'],
  ['LA', "Lao People's Democratic Republic"], ['LB', 'Lebanon'],
  ['LC', 'Saint Lucia'], ['LI', 'Liechtenstein'], ['LK', 'Sri Lanka'],
  ['LR', 'Liberia'], ['LS', 'Lesotho'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
  ['LV', 'Latvia'], ['LY', 'Libya'],
  ['MA', 'Morocco'], ['MC', 'Monaco'], ['MD', 'Moldova'], ['ME', 'Montenegro'],
  ['MF', 'Saint Martin (French part)'], ['MG', 'Madagascar'], ['MH', 'Marshall Islands'],
  ['MK', 'North Macedonia'], ['ML', 'Mali'], ['MM', 'Myanmar'], ['MN', 'Mongolia'],
  ['MO', 'Macao'], ['MP', 'Northern Mariana Islands'], ['MQ', 'Martinique'],
  ['MR', 'Mauritania'], ['MS', 'Montserrat'], ['MT', 'Malta'], ['MU', 'Mauritius'],
  ['MV', 'Maldives'], ['MW', 'Malawi'], ['MX', 'Mexico'], ['MY', 'Malaysia'],
  ['MZ', 'Mozambique'],
  ['NA', 'Namibia'], ['NC', 'New Caledonia'], ['NE', 'Niger'],
  ['NF', 'Norfolk Island'], ['NG', 'Nigeria'], ['NI', 'Nicaragua'],
  ['NL', 'Netherlands'], ['NO', 'Norway'], ['NP', 'Nepal'], ['NR', 'Nauru'],
  ['NU', 'Niue'], ['NZ', 'New Zealand'],
  ['OM', 'Oman'],
  ['PA', 'Panama'], ['PE', 'Peru'], ['PF', 'French Polynesia'],
  ['PG', 'Papua New Guinea'], ['PH', 'Philippines'], ['PK', 'Pakistan'],
  ['PL', 'Poland'], ['PM', 'Saint Pierre and Miquelon'], ['PN', 'Pitcairn'],
  ['PR', 'Puerto Rico'], ['PS', 'Palestine, State of'], ['PT', 'Portugal'],
  ['PW', 'Palau'], ['PY', 'Paraguay'],
  ['QA', 'Qatar'],
  ['RE', 'Réunion'], ['RO', 'Romania'], ['RS', 'Serbia'], ['RU', 'Russian Federation'],
  ['RW', 'Rwanda'],
  ['SA', 'Saudi Arabia'], ['SB', 'Solomon Islands'], ['SC', 'Seychelles'],
  ['SD', 'Sudan'], ['SE', 'Sweden'], ['SG', 'Singapore'],
  ['SH', 'Saint Helena, Ascension and Tristan da Cunha'], ['SI', 'Slovenia'],
  ['SJ', 'Svalbard and Jan Mayen'], ['SK', 'Slovakia'], ['SL', 'Sierra Leone'],
  ['SM', 'San Marino'], ['SN', 'Senegal'], ['SO', 'Somalia'], ['SR', 'Suriname'],
  ['SS', 'South Sudan'], ['ST', 'Sao Tome and Principe'], ['SV', 'El Salvador'],
  ['SX', 'Sint Maarten (Dutch part)'], ['SY', 'Syrian Arab Republic'],
  ['SZ', 'Eswatini'],
  ['TC', 'Turks and Caicos Islands'], ['TD', 'Chad'],
  ['TF', 'French Southern Territories'], ['TG', 'Togo'], ['TH', 'Thailand'],
  ['TJ', 'Tajikistan'], ['TK', 'Tokelau'], ['TL', 'Timor-Leste'],
  ['TM', 'Turkmenistan'], ['TN', 'Tunisia'], ['TO', 'Tonga'], ['TR', 'Türkiye'],
  ['TT', 'Trinidad and Tobago'], ['TV', 'Tuvalu'], ['TW', 'Taiwan'],
  ['TZ', 'Tanzania, United Republic of'],
  ['UA', 'Ukraine'], ['UG', 'Uganda'], ['UM', 'United States Minor Outlying Islands'],
  ['US', 'United States'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'],
  ['VA', 'Holy See (Vatican City State)'], ['VC', 'Saint Vincent and the Grenadines'],
  ['VE', 'Venezuela'], ['VG', 'Virgin Islands, British'],
  ['VI', 'Virgin Islands, U.S.'], ['VN', 'Viet Nam'], ['VU', 'Vanuatu'],
  ['WF', 'Wallis and Futuna'], ['WS', 'Samoa'],
  ['YE', 'Yemen'], ['YT', 'Mayotte'],
  ['ZA', 'South Africa'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
];

export const COUNTRIES: CountryEntry[] = RAW_COUNTRIES.map(([code, name]) => ({ code, name }));

/** Canonical name lookup set (lower-cased). */
const NAME_SET = new Set(COUNTRIES.map((c) => c.name.toLowerCase()));

/**
 * Common aliases → canonical ISO name. Handles legacy values already
 * present in saved leads (e.g. "USA", "UK", "UAE") and frequent
 * alternate spellings, without duplicating leads (spec §5).
 */
const ALIASES: Record<string, string> = {
  usa: 'United States',
  'u s a': 'United States',
  'u s': 'United States',
  us: 'United States',
  america: 'United States',
  'united states of america': 'United States',
  'united states': 'United States',
  uk: 'United Kingdom',
  'u k': 'United Kingdom',
  britain: 'United Kingdom',
  'great britain': 'United Kingdom',
  england: 'United Kingdom',
  scotland: 'United Kingdom',
  wales: 'United Kingdom',
  'northern ireland': 'United Kingdom',
  uae: 'United Arab Emirates',
  'u a e': 'United Arab Emirates',
  emirates: 'United Arab Emirates',
  dubai: 'United Arab Emirates',
  'south korea': 'Korea, Republic of',
  korea: 'Korea, Republic of',
  'republic of korea': 'Korea, Republic of',
  'north korea': "Korea, Democratic People's Republic of",
  holland: 'Netherlands',
  'the netherlands': 'Netherlands',
  vietnam: 'Viet Nam',
  turkey: 'Türkiye',
  turkiye: 'Türkiye',
  czech: 'Czechia',
  'czech republic': 'Czechia',
  russia: 'Russian Federation',
  'russian federation': 'Russian Federation',
  iran: 'Iran',
  'islamic republic of iran': 'Iran',
  syria: 'Syrian Arab Republic',
  'syrian arab republic': 'Syrian Arab Republic',
  laos: "Lao People's Democratic Republic",
  bolivia: 'Bolivia',
  'plurinational state of bolivia': 'Bolivia',
  venezuela: 'Venezuela',
  'bolivarian republic of venezuela': 'Venezuela',
  tanzania: 'Tanzania, United Republic of',
  moldova: 'Moldova',
  'republic of moldova': 'Moldova',
  palestine: 'Palestine, State of',
  taiwan: 'Taiwan',
  'taiwan, province of china': 'Taiwan',
  macau: 'Macao',
  'cape verde': 'Cabo Verde',
  swaziland: 'Eswatini',
  macedonia: 'North Macedonia',
  burma: 'Myanmar',
  'ivory coast': "Côte d'Ivoire",
  'cape town': 'South Africa', // rare data-entry slip — city for country
  'saudi': 'Saudi Arabia',
  'ksa': 'Saudi Arabia',
};

/**
 * Normalize a user/provider-supplied country string to its canonical
 * ISO English name. Returns null when the input cannot be confidently
 * resolved (callers keep the raw value rather than guessing).
 */
export function normalizeCountryName(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  // Punctuation/spaces collapse to single spaces so dotted forms
  // ("U.S.A.", "U.K.") resolve through the same alias table.
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Exact canonical name (case-insensitive)
  if (NAME_SET.has(key)) {
    return COUNTRIES.find((c) => c.name.toLowerCase() === key)!.name;
  }

  // Known alias
  if (ALIASES[key]) return ALIASES[key];

  return null;
}

/** ISO alpha-2 code for a country name/alias — null when unresolvable. */
export function countryCodeFor(input?: string | null): string | null {
  const canonical = normalizeCountryName(input);
  if (!canonical) return null;
  return COUNTRIES.find((c) => c.name === canonical)?.code ?? null;
}

/**
 * Extract the country mention from a free-form location string such as
 * "Mumbai, India" or "Austin TX, USA" and canonicalize it.
 * Returns the canonical name, or null when no country is detectable.
 */
export function extractCountryFromLocation(location?: string | null): string | null {
  if (!location) return null;
  const segments = location.split(',').map((s) => s.trim()).filter(Boolean);
  // Try from the most specific (last segment) backwards
  for (let i = segments.length - 1; i >= 0; i--) {
    const normalized = normalizeCountryName(segments[i]);
    if (normalized) return normalized;
  }
  return normalizeCountryName(location);
}

/**
 * Every stored-form variant that means the same country: the canonical
 * name plus all aliases that resolve to it. Used to build tolerant
 * `contains` OR-filters so legacy saved leads (e.g. "USA", "UAE") remain
 * visible when filtering by the canonical name (spec §5: preserve
 * existing saved lead locations).
 */
export function aliasesFor(input: string): string[] {
  const canonical = normalizeCountryName(input);
  if (!canonical) return input.trim() ? [input.trim()] : [];
  const variants = new Set<string>([canonical]);
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (target === canonical) variants.add(alias);
  }
  // Capitalized alias forms (USA stays uppercase; "usa" → "Usa" is not used)
  return Array.from(variants);
}

/** Case-insensitive search over the full dataset (for combobox UIs). */
export function searchCountries(query: string, limit = 12): CountryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES.slice(0, limit);
  const starts: CountryEntry[] = [];
  const contains: CountryEntry[] = [];
  for (const c of COUNTRIES) {
    const name = c.name.toLowerCase();
    const code = c.code.toLowerCase();
    if (name.startsWith(q) || code === q) starts.push(c);
    else if (name.includes(q)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
