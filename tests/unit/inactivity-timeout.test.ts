// Regression tests for ISSUE-008: Secure 10-minute admin inactivity timeout
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');
function readSrc(relPath: string): string {
  return readFileSync(join(SRC, relPath), 'utf-8');
}
function findUserSessionUpdateDataBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /db\.userSession\.update\(\s*\{\s*[\s\S]*?data:\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) blocks.push(m[1]);
  return blocks;
}

describe('ISSUE-008: getSuperAdminSession() is read-only for lastActivityAt', () => {
  const source = readSrc('lib/admin-guard.ts');
  it('must NOT contain any db.userSession.update whose data includes lastActivityAt', () => {
    const dataBlocks = findUserSessionUpdateDataBlocks(source);
    const activityWrites = dataBlocks.filter(b => b.includes('lastActivityAt'));
    expect(activityWrites).toHaveLength(0);
  });
  it('must use fail-closed for missing lastActivityAt', () => {
    expect(source.includes('!session.lastActivityAt')).toBe(true);
    expect(source.includes('return null')).toBe(true);
  });
  it('must validate Number.isFinite(lastActivityMs)', () => {
    expect(source.includes('Number.isFinite(lastActivityMs)')).toBe(true);
  });
  it('must reject future timestamps beyond clock skew', () => {
    expect(source.includes('lastActivityMs > now + MAX_CLOCK_SKEW_MS')).toBe(true);
  });
  it('comment must say it does NOT update lastActivityAt', () => {
    expect(source.includes('does NOT update')).toBe(true);
  });
  it('must NOT contain the stale page-navigation-is-activity comment', () => {
    expect(source.includes('PAGE NAVIGATION IS GENUINE USER ACTIVITY')).toBe(false);
    expect(source.includes('We update lastActivityAt')).toBe(false);
  });
});

describe('ISSUE-008: Refresh route does NOT call touchSessionActivity', () => {
  const source = readSrc(join('app', 'api', 'auth', 'refresh', 'route.ts'));
  it('must NOT import touchSessionActivity', () => {
    expect(source.split('\n').filter(l => l.includes('import') && l.includes('touchSessionActivity'))).toHaveLength(0);
  });
  it('must NOT call touchSessionActivity', () => {
    expect(source.split('\n').filter(l => l.includes('touchSessionActivity(') && !l.trim().startsWith('//') && !l.includes('Previously'))).toHaveLength(0);
  });
  it('must forward the old session timestamps to createSession()', () => {
    expect(source.includes('lastActivityAt: session.lastActivityAt')).toBe(true);
    expect(source.includes('expiresAt: session.expiresAt')).toBe(true);
    expect(source.includes('absoluteExpiresAt: session.absoluteExpiresAt')).toBe(true);
  });
});

describe('ISSUE-008: session-status route is read-only for lastActivityAt', () => {
  const source = readSrc(join('app', 'api', 'auth', 'session-status', 'route.ts'));
  it('must NOT write lastActivityAt in any db.userSession.update data block', () => {
    const dataBlocks = findUserSessionUpdateDataBlocks(source);
    expect(dataBlocks.filter(b => b.includes('lastActivityAt'))).toHaveLength(0);
  });
  it('must use fail-closed for missing lastActivityAt', () => {
    expect(source.includes('!session.lastActivityAt')).toBe(true);
  });
  it('must validate Number.isFinite(lastActivityMs)', () => {
    expect(source.includes('Number.isFinite(lastActivityMs)')).toBe(true);
  });
  it('must reject future timestamps beyond clock skew', () => {
    expect(source.includes('lastActivityMs > now + MAX_CLOCK_SKEW_MS')).toBe(true);
  });
});

describe('ISSUE-008: activity route — fail-closed + persistence integrity', () => {
  const source = readSrc(join('app', 'api', 'auth', 'activity', 'route.ts'));
  it('must use fail-closed for missing lastActivityAt', () => {
    expect(source.includes('!session.lastActivityAt')).toBe(true);
  });
  it('must reject expired sessions (not revive them)', () => {
    expect(source.includes('SESSION_EXPIRED_INACTIVITY')).toBe(true);
  });
  it('must validate Number.isFinite(lastActivityMs)', () => {
    expect(source.includes('Number.isFinite(lastActivityMs)')).toBe(true);
  });
  it('must reject future timestamps beyond clock skew', () => {
    expect(source.includes('lastActivityMs > now + MAX_CLOCK_SKEW_MS')).toBe(true);
  });
  it('must NOT swallow the lastActivityAt DB write error via .catch(() => {})', () => {
    const idx = source.indexOf('data: { lastActivityAt: new Date(now) }');
    expect(idx).toBeGreaterThan(-1);
    const win = source.substring(idx, idx + 200);
    expect(win.includes('.catch(() => {})')).toBe(false);
  });
  it('must return 500 ACTIVITY_PERSIST_FAILED on DB write failure', () => {
    expect(source.includes("'ACTIVITY_PERSIST_FAILED'") || source.includes('"ACTIVITY_PERSIST_FAILED"')).toBe(true);
    expect(source.includes('status: 500')).toBe(true);
  });
  it('must only set updated=true inside the try block after a successful write', () => {
    const lines = source.split('\n');
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('updated = true')) {
        for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
          if (lines[j].includes('await db.userSession.update')) { found = true; break; }
          if (lines[j].includes('catch')) break;
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe('ISSUE-008: createSession() supports timestamp preservation', () => {
  const source = readSrc('lib/auth.ts');
  it('must accept optional lastActivityAt param', () => { expect(source.includes('lastActivityAt?: Date')).toBe(true); });
  it('must accept optional expiresAt param', () => { expect(source.includes('expiresAt?: Date')).toBe(true); });
  it('must accept optional absoluteExpiresAt param (Date | null)', () => { expect(source.includes('absoluteExpiresAt?: Date | null')).toBe(true); });
  it('must default lastActivityAt to now when not provided', () => { expect(source.includes('params.lastActivityAt ?? new Date(now)')).toBe(true); });
  it('must handle absoluteExpiresAt: null explicitly', () => { expect(source.includes('params.absoluteExpiresAt !== undefined')).toBe(true); });
});

describe('ISSUE-008: dead activity helpers are deprecated', () => {
  const source = readSrc('lib/auth.ts');
  it('touchSessionActivity function definition should still exist', () => {
    expect(source.includes('export async function touchSessionActivity')).toBe(true);
  });
  it('touchSessionActivity must be marked @deprecated', () => {
    const idx = source.indexOf('export async function touchSessionActivity');
    expect(idx).toBeGreaterThan(-1);
    expect(source.substring(Math.max(0, idx - 2000), idx).includes('@deprecated')).toBe(true);
  });
  it('refreshCurrentSessionActivity must be marked @deprecated', () => {
    const idx = source.indexOf('export async function refreshCurrentSessionActivity');
    expect(idx).toBeGreaterThan(-1);
    expect(source.substring(Math.max(0, idx - 4000), idx).includes('@deprecated')).toBe(true);
  });
});
