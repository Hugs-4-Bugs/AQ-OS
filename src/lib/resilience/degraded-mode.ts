// AcquisitionOS — Graceful degradation controller
// Allows the app to intentionally disable non-critical features when a
// dependency is unavailable, while preserving core read functionality.

import logger from '@/lib/logger';

export type DegradableFeature =
  | 'lead-discovery'
  | 'ai-enrichment'
  | 'ai-chat'
  | 'autonomous-outreach'
  | 'rag-ingest'
  | 'email-sending'
  | 'whatsapp-sending'
  | 'telegram-sending';

const ALL_DEGRADABLE: DegradableFeature[] = [
  'lead-discovery',
  'ai-enrichment',
  'ai-chat',
  'autonomous-outreach',
  'rag-ingest',
  'email-sending',
  'whatsapp-sending',
  'telegram-sending',
];

const runtimeDegraded = new Set<DegradableFeature>();
let envParsed = false;
const envDegraded = new Set<DegradableFeature>();

function parseEnvOnce(): void {
  if (envParsed) return;
  envParsed = true;
  const list = process.env.DEGRADED_FEATURES || '';
  if (list.trim()) {
    for (const item of list.split(',')) {
      const trimmed = item.trim();
      if (isDegradableFeature(trimmed)) {
        envDegraded.add(trimmed);
      }
    }
  }
  if (process.env.DEGRADED_MODE === 'true') {
    for (const f of ALL_DEGRADABLE) envDegraded.add(f);
  }
  if (envDegraded.size > 0) {
    logger.warn('Graceful degradation enabled at startup', undefined, {
      degradedFeatures: Array.from(envDegraded),
    });
  }
}

export function _resetEnvParsedForTests(): void {
  envParsed = false;
  envDegraded.clear();
}

function isDegradableFeature(s: string): s is DegradableFeature {
  return (ALL_DEGRADABLE as string[]).includes(s);
}

export function isFeatureDegraded(feature: DegradableFeature): boolean {
  parseEnvOnce();
  return envDegraded.has(feature) || runtimeDegraded.has(feature);
}

export function getDegradedFeatures(): DegradableFeature[] {
  parseEnvOnce();
  const all = new Set<DegradableFeature>([...envDegraded, ...runtimeDegraded]);
  return Array.from(all);
}

export function setFeatureDegraded(feature: DegradableFeature, degraded: boolean): void {
  if (!isDegradableFeature(feature)) return;
  if (degraded) {
    runtimeDegraded.add(feature);
  } else {
    runtimeDegraded.delete(feature);
  }
  logger.warn('Feature degradation toggled', undefined, { feature, degraded });
}

export function degradedResponse(feature: DegradableFeature): {
  status: number;
  body: Record<string, unknown>;
} {
  return {
    status: 503,
    body: {
      error: 'service_unavailable',
      feature,
      message: `${feature} is temporarily unavailable. Core lead/pipeline data is still accessible.`,
      retryAfterSeconds: 300,
    },
  };
}
