/**
 * MASTER-FIX regression tests — Bug #1: discovery lifecycle & credit integrity.
 *
 * Failure modes covered (task spec §2/§14):
 *  - one logical request = one job (same requestId → SAME job, no second create)
 *  - an identical search that is still pending/running is returned, not duplicated
 *  - distinct params while a job is active are NOT blocked (deliberate concurrency)
 *  - a new operation passes its identity (idempotencyKey) to the service
 */
vi.mock('@/lib/db', () => {
  const discoveryJob = {
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  return { db: { discoveryJob } };
});

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: vi.fn((req: unknown, handler: (u: unknown) => unknown) =>
    handler({ id: 'user-1', plan: 'pro', orgId: null })
  ),
}));

vi.mock('@/lib/lead-discovery-service', () => ({
  startDiscoveryJob: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/leads/discover/route';
import { startDiscoveryJob } from '@/lib/lead-discovery-service';
import { db } from '@/lib/db';
import { NextRequest } from 'next/server';

const { discoveryJob } = db as unknown as {
  discoveryJob: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};
const startMock = vi.mocked(startDiscoveryJob);

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/leads/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-existing',
    userId: 'user-1',
    status: 'running',
    source: 'ai_search',
    niche: 'dentists',
    country: 'India',
    city: null,
    idempotencyKey: 'req-abc',
    useBusinessContext: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Fully reset implementations + queued Once-values (clearAllMocks alone
  // leaves the mockResolvedValueOnce queue intact, leaking across tests).
  discoveryJob.findFirst.mockReset();
  discoveryJob.create.mockReset();
  startMock.mockReset();
  startMock.mockResolvedValue({ jobId: 'job-new', status: 'pending', message: 'started' });
});

describe('POST /api/leads/discover — operation identity dedupe', () => {
  it('returns the SAME job (no second create, no second charge) when the same requestId is replayed', async () => {
    discoveryJob.findFirst.mockResolvedValueOnce(makeJob({ idempotencyKey: 'req-abc' }));

    const res = await POST(makeRequest({ niche: 'dentists', source: 'ai_search', requestId: 'req-abc' }));
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data.jobId).toBe('job-existing');
    expect(data.deduped).toBe(true);
    expect(discoveryJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', idempotencyKey: 'req-abc' }),
      })
    );
    // The chargeable service was NEVER invoked for a replayed operation.
    expect(startMock).not.toHaveBeenCalled();
  });

  it('returns the existing job when an IDENTICAL search is still pending/running (no requestId)', async () => {
    // No requestId in the body → exactly ONE findFirst call (identical-params).
    discoveryJob.findFirst.mockResolvedValueOnce(makeJob({ idempotencyKey: null }));

    const res = await POST(makeRequest({ niche: 'dentists', source: 'ai_search', country: 'India' }));
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data.jobId).toBe('job-existing');
    expect(data.deduped).toBe(true);
    expect(startMock).not.toHaveBeenCalled();
  });

  it('starts a NEW job when the requestId is new and no identical active job exists', async () => {
    discoveryJob.findFirst.mockResolvedValueOnce(null);
    discoveryJob.findFirst.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ niche: 'dentists', source: 'ai_search', requestId: 'req-unique-1' }));

    expect(res.status).toBe(202);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        niche: 'dentists',
        idempotencyKey: 'req-unique-1',
      }),
      undefined
    );
  });

  it('does NOT dedupe a DIFFERENT search while another job is active (deliberate concurrency preserved)', async () => {
    discoveryJob.findFirst.mockResolvedValueOnce(null); // no same requestId
    discoveryJob.findFirst.mockResolvedValueOnce(null); // no identical active (different niche)

    const res = await POST(makeRequest({ niche: 'clinics', source: 'ai_search', requestId: 'req-unique-2' }));

    expect(res.status).toBe(202);
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it('persists the EXPLICIT None business-context flag on the job params', async () => {
    discoveryJob.findFirst.mockResolvedValueOnce(null);
    discoveryJob.findFirst.mockResolvedValueOnce(null);

    await POST(
      makeRequest({
        niche: 'dentists',
        source: 'ai_search',
        requestId: 'req-none-1',
        businessProfileId: null,
        useBusinessContext: false,
      })
    );

    expect(startMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ useBusinessContext: false, businessProfileId: null }),
      undefined
    );
  });

  it('rejects a missing niche before any dedupe or job creation', async () => {
    const res = await POST(makeRequest({ source: 'ai_search' }));
    expect(res.status).toBe(400);
    expect(discoveryJob.findFirst).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });
});
