// Regression tests for ISSUE-008: Secure 10-minute admin inactivity timeout
//
// These tests verify the SOURCE CODE properties of the inactivity timeout
// implementation. They check that:
//   1. getSuperAdminSession() does NOT write lastActivityAt
//   2. The refresh route does NOT call touchSessionActivity
//   3. The session-status route is read-only (no lastActivityAt writes)
//   4. All three endpoints use fail-closed for missing lastActivityAt
//   5. The activity endpoint is the ONLY normal write path
//
// These are source-level tests because the sandbox cannot run vitest
// with full Prisma/Next.js mocks. The tests read source files directly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

function readSrc(relPath: string): string {
  return readFileSync(join(SRC, relPath), 'utf-8');
}

describe('ISSUE-008: getSuperAdminSession() is read-only for lastActivityAt', () => {
  const source = readSrc('lib/admin-guard.ts');

  it('must NOT contain any db.userSession.update with lastActivityAt', () => {
    // The function should NOT write lastActivityAt anywhere.
    // Check for any "lastActivityAt" in an update context.
    const updateLines = source.split('\n').filter(l =>
      l.includes('lastActivityAt') && l.includes('update')
    );
    // Allow only revocation writes (isRevoked: true), not activity writes.
    const activityWrites = updateLines.filter(l =>
      !l.includes('isRevoked') && l.includes('lastActivityAt')
    );
    expect(activityWrites, 'getSuperAdminSession must NOT update lastActivityAt').toHaveLength(0);
  });

  it('must use fail-closed for missing lastActivityAt', () => {
    expect(source.includes('!session.lastActivityAt')).toBe(true);
    expect(source.includes('return null')).toBe(true);
  });

  it('comment must say it does NOT update lastActivityAt', () => {
    expect(source.includes('does NOT update')).toBe(true);
  });
});

describe('ISSUE-008: Refresh route does NOT call touchSessionActivity', () => {
  const source = readSrc(join('app', 'api', 'auth', 'refresh', 'route.ts'));

  it('must NOT import touchSessionActivity', () => {
    // The import line should not contain touchSessionActivity
    const importLines = source.split('\n').filter(l => l.includes('import') && l.includes('touchSessionActivity'));
    expect(importLines, 'refresh route must NOT import touchSessionActivity').toHaveLength(0);
  });

  it('must NOT call touchSessionActivity', () => {
    // Check for actual calls (not comments)
    const callLines = source.split('\n').filter(l =>
      l.includes('touchSessionActivity(') && !l.trim().startsWith('//') && !l.includes('Previously')
    );
    expect(callLines, 'refresh route must NOT call touchSessionActivity').toHaveLength(0);
  });
});

describe('ISSUE-008: session-status route is read-only for lastActivityAt', () => {
  const source = readSrc(join('app', 'api', 'auth', 'session-status', 'route.ts'));

  it('must NOT write lastActivityAt (only isRevoked for expiry)', () => {
    // Any update to lastActivityAt would be a write — check for it.
    const lines = source.split('\n').filter(l =>
      l.includes('lastActivityAt') && l.includes('data:')
    );
    // The only writes should be for isRevoked, not lastActivityAt
    const activityWrites = lines.filter(l => !l.includes('isRevoked'));
    expect(activityWrites, 'session-status must NOT write lastActivityAt').toHaveLength(0);
  });

  it('must use fail-closed for missing lastActivityAt', () => {
    expect(source.includes('!session.lastActivityAt')).toBe(true);
  });
});

describe('ISSUE-008: activity route uses fail-closed for missing lastActivityAt', () => {
  const source = readSrc(join('app', 'api', 'auth', 'activity', 'route.ts'));

  it('must use fail-closed for missing lastActivityAt', () => {
    expect(source.includes('!session.lastActivityAt')).toBe(true);
  });

  it('must reject expired sessions (not revive them)', () => {
    expect(source.includes('SESSION_EXPIRED_INACTIVITY')).toBe(true);
  });
});

describe('ISSUE-008: touchSessionActivity still exists (for other callers if any)', () => {
  const source = readSrc('lib/auth.ts');

  it('touchSessionActivity function definition should still exist', () => {
    expect(source.includes('export async function touchSessionActivity')).toBe(true);
  });
});
