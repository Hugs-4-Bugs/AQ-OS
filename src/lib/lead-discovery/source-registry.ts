// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Discovery Source Registry
//
// Single source of truth for every lead-discovery source:
//   - What env vars / credentials it needs
//   - Whether it is currently usable (connected / not_configured / error)
//   - The exact user-facing configuration message to show when unusable
//
// PRINCIPLE: a source is only "usable" when its real credentials exist.
// Discovery NEVER runs against an unconfigured source and NEVER returns
// fake, mock, or placeholder leads.
// ═══════════════════════════════════════════════════════════════════

export type DiscoverySourceId =
  | 'ai_search'
  | 'google_maps'
  | 'google_business'
  | 'justdial'
  | 'indiamart'
  | 'yelp'
  | 'yellow_pages'
  | 'sulekha'
  | 'linkedin'
  | 'instagram'
  | 'facebook';

export type SourceStatus = 'connected' | 'not_configured' | 'error';

export interface SourceEnvVar {
  /** Exact environment variable name (safe to display — never the value). */
  name: string;
  /** Human label, e.g. "API Key". */
  label: string;
  /** Whether the source cannot run without it. */
  required: boolean;
}

export interface SourceMeta {
  id: DiscoverySourceId;
  label: string;
  /** ai = built-in AI web search, api = official vendor API, scrape = public web scraping. */
  type: 'ai' | 'api' | 'scrape';
  description: string;
  /** Required env vars — all must be present for an "api" source to run. */
  requiredEnvVars: SourceEnvVar[];
  /** Optional env vars that unlock extra behaviour. */
  optionalEnvVars: SourceEnvVar[];
  /** Where the user can obtain the credentials. */
  signupUrl?: string;
  /** Honest caveats shown in Settings (e.g. partner access required). */
  notes?: string;
  /** Free sources that need zero configuration. */
  noSetupRequired?: boolean;
}

export interface SourceStatusInfo extends SourceMeta {
  status: SourceStatus;
  /** Exact message shown to the user when the source cannot run. */
  configMessage: string;
}

// ═══════════════════════════════════════════════════════════════════
// REGISTRY DEFINITION
// ═══════════════════════════════════════════════════════════════════

/** Check that at least one of the given env var names has a non-empty value. */
function anyEnvSet(names: string[]): boolean {
  return names.some((n) => {
    const v = process.env[n];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

/** Check that ALL of the given env var names have non-empty values. */
function allEnvSet(names: string[]): boolean {
  return names.every((n) => {
    const v = process.env[n];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

export const DISCOVERY_SOURCE_REGISTRY: SourceMeta[] = [
  {
    id: 'ai_search',
    label: 'AI Search',
    type: 'ai',
    description:
      'AI-powered web search that finds real businesses from live search engine results. No API key setup required.',
    requiredEnvVars: [],
    optionalEnvVars: [],
    noSetupRequired: true,
  },
  {
    id: 'google_maps',
    label: 'Google Maps',
    type: 'api',
    description:
      'Real businesses from the official Google Places API: name, address, phone, website, rating and place ID.',
    requiredEnvVars: [
      { name: 'GOOGLE_MAPS_API_KEY', label: 'API Key', required: true },
    ],
    optionalEnvVars: [],
    signupUrl:
      'https://console.cloud.google.com/apis/library/places-backend.googleapis.com',
    notes:
      'Enable the Places API on a Google Cloud project and create an API key with Places restrictions.',
  },
  {
    id: 'google_business',
    label: 'Google Business',
    type: 'api',
    description:
      'Business profiles via the official Google Places API (same key as Google Maps).',
    requiredEnvVars: [
      { name: 'GOOGLE_MAPS_API_KEY', label: 'API Key', required: true },
    ],
    optionalEnvVars: [],
    signupUrl:
      'https://console.cloud.google.com/apis/library/places-backend.googleapis.com',
  },
  {
    id: 'yelp',
    label: 'Yelp',
    type: 'api',
    description:
      'Real businesses from the Yelp Fusion API: name, phone, address, rating, categories and Yelp listing URL.',
    requiredEnvVars: [{ name: 'YELP_API_KEY', label: 'API Key', required: true }],
    optionalEnvVars: [],
    signupUrl: 'https://www.yelp.com/developers/v3/manage_app',
    notes: 'Free tier available. Create an app in the Yelp developer portal to get a Fusion API key.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    type: 'api',
    description:
      'Companies from the official LinkedIn Organization Search API.',
    requiredEnvVars: [
      { name: 'LINKEDIN_CLIENT_ID', label: 'Client ID', required: true },
      { name: 'LINKEDIN_CLIENT_SECRET', label: 'Client Secret', required: true },
    ],
    optionalEnvVars: [],
    signupUrl: 'https://www.linkedin.com/developers/apps',
    notes:
      'Organization Search requires LinkedIn Marketing API partner approval. If LinkedIn rejects the call, the exact API error is shown — no substitute data is returned.',
  },
  {
    id: 'justdial',
    label: 'JustDial',
    type: 'api',
    description:
      'Business listings via the JustDial partner API.',
    requiredEnvVars: [
      { name: 'JUSTDIAL_API_KEY', label: 'API Key', required: true },
    ],
    optionalEnvVars: [
      { name: 'JUSTDIAL_API_URL', label: 'Partner API Endpoint URL', required: false },
    ],
    notes:
      'JustDial issues API access through partner onboarding. Set JUSTDIAL_API_KEY plus JUSTDIAL_API_URL (the endpoint URL provided by JustDial).',
  },
  {
    id: 'indiamart',
    label: 'IndiaMart',
    type: 'api',
    description:
      'Real buyer enquiries from your own IndiaMart account via the official Lead Manager API.',
    requiredEnvVars: [
      { name: 'INDIAMART_API_KEY', label: 'Access Token', required: true },
    ],
    optionalEnvVars: [],
    signupUrl: 'https://crm.indiamart.com/',
    notes:
      'Uses the IndiaMart Lead Manager API, which returns enquiries from YOUR IndiaMart seller account filtered by your niche keywords.',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    type: 'api',
    description:
      'Business Pages from the official Facebook Graph API Pages Search.',
    requiredEnvVars: [
      { name: 'FACEBOOK_APP_ID', label: 'App ID', required: true },
      { name: 'FACEBOOK_APP_SECRET', label: 'App Secret', required: true },
    ],
    optionalEnvVars: [],
    signupUrl: 'https://developers.facebook.com/apps',
    notes:
      'Pages Search may require additional App Review permissions from Meta. If Meta rejects the call, the exact API error is shown.',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    type: 'api',
    description:
      'Business accounts via the Instagram / Meta Graph API.',
    requiredEnvVars: [
      { name: 'INSTAGRAM_APP_ID', label: 'App ID', required: true },
    ],
    optionalEnvVars: [
      { name: 'INSTAGRAM_APP_SECRET', label: 'App Secret', required: false },
    ],
    signupUrl: 'https://developers.facebook.com/apps',
    notes:
      'Instagram restricts search to approved business tokens. If Meta rejects the call, the exact API error is shown — no substitute data is returned.',
  },
  {
    id: 'yellow_pages',
    label: 'Yellow Pages',
    type: 'scrape',
    description:
      'Live results scraped from yellowpages.com search pages: business name, phone, address, website and category.',
    requiredEnvVars: [],
    optionalEnvVars: [],
    noSetupRequired: true,
  },
  {
    id: 'sulekha',
    label: 'Sulekha',
    type: 'scrape',
    description:
      'Live results scraped from sulekha.com search pages: business name, phone, location and category.',
    requiredEnvVars: [],
    optionalEnvVars: [],
    noSetupRequired: true,
  },
];

// ═══════════════════════════════════════════════════════════════════
// STATUS RESOLUTION
// ═══════════════════════════════════════════════════════════════════

/** Env var groups: a source is connected when ALL required groups have at least one set var. */
const EXTRA_STATUS_RULES: Record<
  string,
  { requiresAny: string[][]; errorMessage?: (missing: string) => string }
> = {
  justdial: {
    requiresAny: [['JUSTDIAL_API_KEY']],
    errorMessage: (missing) =>
      `JustDial API key found, but ${missing} is not set. Add the JustDial partner endpoint URL to environment variables (Settings → Integrations → Discovery Sources shows the required names).`,
  },
  instagram: {
    requiresAny: [['INSTAGRAM_APP_ID']],
  },
};

/**
 * Resolve the current status of a single source from the actual environment.
 * Never reads or exposes secret values — only their presence.
 */
export function getSourceStatusInfo(id: DiscoverySourceId): SourceStatusInfo {
  const meta = DISCOVERY_SOURCE_REGISTRY.find((s) => s.id === id);
  if (!meta) {
    return {
      id,
      label: id,
      type: 'api',
      description: '',
      requiredEnvVars: [],
      optionalEnvVars: [],
      status: 'error',
      configMessage: `Unknown discovery source: ${id}`,
    };
  }

  // Free / no-setup sources (AI search, scrapers) are always ready.
  if (meta.noSetupRequired) {
    return { ...meta, status: 'connected', configMessage: '' };
  }

  const requiredNames = meta.requiredEnvVars.filter((v) => v.required).map((v) => v.name);
  const allRequiredSet = allEnvSet(requiredNames);

  if (!allRequiredSet) {
    const missing = requiredNames.filter((n) => !anyEnvSet([n]));
    return {
      ...meta,
      status: 'not_configured',
      configMessage: `${meta.label} requires API configuration. Go to Settings → Integrations to connect this source. Missing: ${missing.join(', ')}.`,
    };
  }

  // Extra rules (e.g. JustDial needs the partner endpoint URL in addition to the key)
  const rule = EXTRA_STATUS_RULES[id];
  if (rule) {
    for (const group of rule.requiresAny) {
      if (!anyEnvSet(group)) {
        return {
          ...meta,
          status: 'error',
          configMessage: rule.errorMessage
            ? rule.errorMessage(group.join(' / '))
            : `${meta.label} is not fully configured.`,
        };
      }
    }
  }

  return { ...meta, status: 'connected', configMessage: '' };
}

/** True when a source can run a real discovery right now. */
export function isSourceReady(id: DiscoverySourceId): boolean {
  return getSourceStatusInfo(id).status === 'connected';
}

/** The canonical user-facing configuration message for an unusable source. */
export function getSourceConfigMessage(id: DiscoverySourceId): string {
  return getSourceStatusInfo(id).configMessage;
}

/** Statuses for every registered source (for the Settings UI + dropdown hints). */
export function listSourceStatuses(): SourceStatusInfo[] {
  return DISCOVERY_SOURCE_REGISTRY.map((s) => getSourceStatusInfo(s.id));
}
