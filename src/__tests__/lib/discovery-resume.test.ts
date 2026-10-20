// ═════════════════════════════════════════════════════════════════════
// Unit Tests: Discovery Resume helpers (src/lib/discovery-resume.ts)
// Guards the resume-on-navigation contract: a returning client re-attaches
// to the most recent running job WITHOUT issuing a new discovery request.
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  pickResumableJob,
  pickResumableJobFromStorage,
  DISCOVERY_JOBS_STORAGE_KEY,
} from '@/lib/discovery-resume';

describe('discovery-resume', () => {
  const runningJob = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
    id,
    status: 'running',
    niche: 'dentists',
    country: 'India',
    source: 'all',
    createdAt,
    ...extra,
  });

  describe('pickResumableJob', () => {
    it('picks the most recent running job', () => {
      const jobs = [
        runningJob('job-old', '2026-10-04T03:00:00Z'),
        runningJob('job-new', '2026-10-04T04:00:00Z'),
      ];
      const picked = pickResumableJob(jobs);
      expect(picked).not.toBeNull();
      expect(picked!.id).toBe('job-new');
      expect(picked!.status).toBe('running');
      expect(picked!.niche).toBe('dentists');
    });

    it('never resumes completed or failed jobs', () => {
      const jobs = [
        { id: 'job-done', status: 'completed', niche: 'x', createdAt: '2026-10-04T04:00:00Z' },
        { id: 'job-fail', status: 'failed', niche: 'x', createdAt: '2026-10-04T04:01:00Z' },
      ];
      expect(pickResumableJob(jobs)).toBeNull();
    });

    it('resumes pending jobs (job accepted but not yet running)', () => {
      const jobs = [{ id: 'job-pending', status: 'pending', niche: 'x', createdAt: '2026-10-04T04:00:00Z' }];
      const picked = pickResumableJob(jobs);
      expect(picked).not.toBeNull();
      expect(picked!.status).toBe('pending');
    });

    it('prefers a running job over an older completed one and ignores garbage entries', () => {
      const jobs = [
        { id: 'job-done', status: 'completed', createdAt: '2026-10-04T05:00:00Z' },
        'garbage-string',
        null,
        { noId: true },
        runningJob('job-live', '2026-10-04T04:30:00Z'),
      ];
      const picked = pickResumableJob(jobs);
      expect(picked!.id).toBe('job-live');
    });

    it('returns null for empty, non-array, or null input', () => {
      expect(pickResumableJob([])).toBeNull();
      expect(pickResumableJob(null)).toBeNull();
      expect(pickResumableJob({ id: 'x' })).toBeNull();
      expect(pickResumableJob('nope')).toBeNull();
    });

    it('tolerates snapshots without createdAt by falling back to array order', () => {
      const jobs = [
        { id: 'job-a', status: 'running', niche: 'a' },
        { id: 'job-b', status: 'running', niche: 'b' },
      ];
      // Stable sort keeps original order when timestamps are unparseable;
      // index 0 is the newest (component unshifts newest first).
      expect(pickResumableJob(jobs)!.id).toBe('job-a');
    });

    it('defaults missing optional display fields defensively', () => {
      const picked = pickResumableJob([{ id: 'job-x', status: 'running' }]);
      expect(picked!.niche).toBe('');
      expect(picked!.country).toBe('');
      expect(picked!.source).toBe('all');
      expect(picked!.city).toBeUndefined();
    });
  });

  describe('pickResumableJobFromStorage', () => {
    it('reads the persisted snapshot list and picks the resumable job', () => {
      const storage = {
        getItem: (key: string) =>
          key === DISCOVERY_JOBS_STORAGE_KEY
            ? JSON.stringify([runningJob('job-1', '2026-10-04T04:00:00Z')])
            : null,
      };
      expect(pickResumableJobFromStorage(storage)!.id).toBe('job-1');
    });

    it('returns null when the key is absent', () => {
      const storage = { getItem: () => null };
      expect(pickResumableJobFromStorage(storage)).toBeNull();
    });

    it('returns null for corrupt JSON — never throws, never blocks the tab', () => {
      const storage = { getItem: () => '{not-json!!' };
      expect(pickResumableJobFromStorage(storage)).toBeNull();
    });

    it('returns null when storage is unavailable', () => {
      expect(pickResumableJobFromStorage(null)).toBeNull();
      expect(pickResumableJobFromStorage(undefined)).toBeNull();
      expect(pickResumableJobFromStorage({} as Pick<Storage, 'getItem'>)).toBeNull();
    });
  });
});
