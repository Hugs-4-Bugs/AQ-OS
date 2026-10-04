// ═════════════════════════════════════════════════════════════════════
// Discovery Resume Support — one job ↔ one billing event across navigation
// ═════════════════════════════════════════════════════════════════════
// The Discover tab persists job snapshots in localStorage. When the user
// navigates away (tab switch unmounts the component) or refreshes, the
// server-side job KEEPS RUNNING. These helpers let a returning client
// re-attach to that job WITHOUT ever issuing a new discovery request —
// navigation must never create a second job or a second credit charge.
//
// Pure + framework-free so the selection logic is unit-testable.

export const DISCOVERY_JOBS_STORAGE_KEY = 'acquisitionos_discovery_jobs';

/** Loose shape of the snapshots the Discover tab persists (write-side is
 *  owned by the component; this side only needs to read defensively). */
export interface DiscoveryJobSnapshot {
  id: string;
  status?: string;
  niche?: string;
  country?: string;
  city?: string;
  source?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface ResumableDiscoveryJob {
  id: string;
  status: 'pending' | 'running';
  niche: string;
  country: string;
  city?: string;
  source: string;
  createdAt: string;
}

const RESUMABLE_STATUSES = new Set(['pending', 'running']);

function isResumable(
  job: DiscoveryJobSnapshot
): job is DiscoveryJobSnapshot & { status: 'pending' | 'running' } {
  return (
    typeof job === 'object' &&
    job !== null &&
    typeof job.id === 'string' &&
    job.id.length > 0 &&
    RESUMABLE_STATUSES.has(job.status as string)
  );
}

/**
 * From an array of job snapshots, pick the job a returning client should
 * re-attach to: the MOST RECENT pending/running job. Completed/failed jobs
 * are never resumed. Corrupt/foreign shapes yield null — never throw.
 */
export function pickResumableJob(jobs: unknown): ResumableDiscoveryJob | null {
  if (!Array.isArray(jobs)) return null;

  const resumable = jobs.filter(isResumable);
  if (resumable.length === 0) return null;

  // Most recent first by createdAt. Snapshots without parseable timestamps
  // keep their array order (the component unshifts newest-first on creation),
  // and sort stability keeps them behind any timestamped entries.
  const sorted = [...resumable].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });

  const job = sorted[0];
  return {
    id: job.id,
    status: job.status,
    niche: typeof job.niche === 'string' ? job.niche : '',
    country: typeof job.country === 'string' ? job.country : '',
    city: typeof job.city === 'string' && job.city ? job.city : undefined,
    source: typeof job.source === 'string' && job.source ? job.source : 'all',
    createdAt:
      typeof job.createdAt === 'string' ? job.createdAt : new Date(0).toISOString(),
  };
}

/**
 * Read the persisted snapshot list from a Storage-like object and pick the
 * resumable job. Any error (corrupt JSON, unavailable storage) returns null —
 * a broken snapshot must never block the Discover tab or trigger re-discovery.
 */
export function pickResumableJobFromStorage(
  storage: Pick<Storage, 'getItem'> | null | undefined
): ResumableDiscoveryJob | null {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(DISCOVERY_JOBS_STORAGE_KEY);
    if (!raw) return null;
    return pickResumableJob(JSON.parse(raw));
  } catch {
    return null;
  }
}
