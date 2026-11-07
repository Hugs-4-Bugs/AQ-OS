// INFRA-001: Client IP extraction — prefer X-Real-IP, reject spoofed XFF.
//
// Tests verify:
//   1. X-Real-IP preferred over X-Forwarded-For.
//   2. Spoofed XFF ignored when X-Real-IP is absent.
//   3. Missing both headers returns 'unknown'.
//   4. No fallback to 127.0.0.1.
//   5. All shared extraction paths behave consistently.
//   6. API-key usage logging does not record spoofed XFF.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock db — required by auth.ts and distributed-rate-limiter.ts imports.
vi.mock('@/lib/db', () => ({
  db: {
    userSession: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    loginHistory: { create: vi.fn(), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
    $disconnect: vi.fn(),
  },
}));

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    headers: new Headers(headers),
  });
}

beforeEach(() => {
  vi.resetModules();
});

describe('INFRA-001: getClientIp() — src/lib/auth.ts', () => {
  it('1. prefers X-Real-IP over X-Forwarded-For', async () => {
    const { getClientIp } = await import('@/lib/auth');
    const req = makeRequest({
      'x-real-ip': '203.0.113.1',
      'x-forwarded-for': '198.51.100.99',
    });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('2. ignores spoofed XFF when X-Real-IP is absent', async () => {
    const { getClientIp } = await import('@/lib/auth');
    const req = makeRequest({
      'x-forwarded-for': '198.51.100.99',
    });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('3. returns unknown when both headers are missing', async () => {
    const { getClientIp } = await import('@/lib/auth');
    const req = makeRequest({});
    expect(getClientIp(req)).toBe('unknown');
  });

  it('4. does NOT fall back to 127.0.0.1', async () => {
    const { getClientIp } = await import('@/lib/auth');
    const req = makeRequest({});
    const ip = getClientIp(req);
    expect(ip).not.toBe('127.0.0.1');
    expect(ip).toBe('unknown');
  });

  it('5. trims whitespace from X-Real-IP', async () => {
    const { getClientIp } = await import('@/lib/auth');
    const req = makeRequest({ 'x-real-ip': '  203.0.113.1  ' });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });
});

describe('INFRA-001: getClientIp() — src/lib/security/rate-limiter.ts (consistent behavior)', () => {
  // rate-limiter.ts getClientIp is not exported — test via source inspection.
  it('rate-limiter getClientIp prefers X-Real-IP (source check)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(
      join(process.cwd(), 'src/lib/security/rate-limiter.ts'),
      'utf-8',
    );
    // Must use x-real-ip as the primary source
    expect(source).toContain("request.headers.get('x-real-ip')");
    // Must NOT fall back to x-forwarded-for
    expect(source.includes("x-forwarded-for")).toBe(false);
  });
});

describe('INFRA-001: getTrustedClientIP() — distributed-rate-limiter.ts', () => {
  it('1. prefers X-Real-IP over X-Forwarded-For', async () => {
    const { getTrustedClientIP } = await import('@/lib/security/distributed-rate-limiter');
    const req = makeRequest({
      'x-real-ip': '203.0.113.2',
      'x-forwarded-for': '198.51.100.99',
    });
    expect(getTrustedClientIP(req)).toBe('203.0.113.2');
  });

  it('2. ignores spoofed XFF when X-Real-IP is absent', async () => {
    const { getTrustedClientIP } = await import('@/lib/security/distributed-rate-limiter');
    const req = makeRequest({
      'x-forwarded-for': '198.51.100.99',
    });
    expect(getTrustedClientIP(req)).toBe('unknown');
  });

  it('3. returns unknown when both headers are missing', async () => {
    const { getTrustedClientIP } = await import('@/lib/security/distributed-rate-limiter');
    const req = makeRequest({});
    expect(getTrustedClientIP(req)).toBe('unknown');
  });

  it('4. does NOT fall back to 127.0.0.1', async () => {
    const { getTrustedClientIP } = await import('@/lib/security/distributed-rate-limiter');
    const req = makeRequest({});
    const ip = getTrustedClientIP(req);
    expect(ip).not.toBe('127.0.0.1');
    expect(ip).toBe('unknown');
  });

  it('5. does NOT use request.ip (removed broken trusted-proxy check)', async () => {
    // Even if request.ip is set, it should NOT affect the result — X-Real-IP is the source.
    const { getTrustedClientIP } = await import('@/lib/security/distributed-rate-limiter');
    const req = {
      headers: { get: (name: string) => name === 'x-real-ip' ? '203.0.113.3' : null },
      ip: '198.51.100.99', // should be ignored
    };
    expect(getTrustedClientIP(req)).toBe('203.0.113.3');
  });
});

describe('INFRA-001: auth-middleware.ts — API-key usage logging', () => {
  it('uses X-Real-IP not XFF (source check)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(
      join(process.cwd(), 'src/lib/auth-middleware.ts'),
      'utf-8',
    );
    // All IP extraction must use x-real-ip, not x-forwarded-for
    const xffUsages = source.split('\n').filter(l =>
      l.includes('x-forwarded-for') && !l.trim().startsWith('//') && !l.trim().startsWith('*')
    );
    expect(xffUsages, `auth-middleware must NOT use x-forwarded-for. Found: ${JSON.stringify(xffUsages)}`).toHaveLength(0);
    // Must use x-real-ip
    expect(source).toContain("request.headers.get('x-real-ip')");
  });
});

describe('INFRA-001: api-key-middleware.ts — API-key usage logging', () => {
  it('uses X-Real-IP not XFF (source check)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(
      join(process.cwd(), 'src/lib/api-key-middleware.ts'),
      'utf-8',
    );
    const xffUsages = source.split('\n').filter(l =>
      l.includes('x-forwarded-for') && !l.trim().startsWith('//')
    );
    expect(xffUsages, `api-key-middleware must NOT use x-forwarded-for. Found: ${JSON.stringify(xffUsages)}`).toHaveLength(0);
    expect(source).toContain("request.headers.get('x-real-ip')");
  });
});

describe('INFRA-001: security-audit.ts — audit IP recording', () => {
  it('uses X-Real-IP not XFF (source check)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(
      join(process.cwd(), 'src/lib/security/security-audit.ts'),
      'utf-8',
    );
    const xffUsages = source.split('\n').filter(l =>
      l.includes('x-forwarded-for') && !l.trim().startsWith('//')
    );
    expect(xffUsages, `security-audit must NOT use x-forwarded-for. Found: ${JSON.stringify(xffUsages)}`).toHaveLength(0);
    expect(source).toContain("request.headers.get('x-real-ip')");
  });
});

describe('INFRA-001: nginx config — XFF overwrite', () => {
  it('nginx.conf overwrites XFF with $remote_addr (not appends)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(join(process.cwd(), 'nginx.conf'), 'utf-8');
    expect(source.includes('$proxy_add_x_forwarded_for'),
      'nginx.conf must NOT use $proxy_add_x_forwarded_for (appends — spoofable)').toBe(false);
    expect(source.includes('X-Forwarded-For $remote_addr'),
      'nginx.conf must overwrite XFF with $remote_addr').toBe(true);
  });

  it('nginx.prod.conf overwrites XFF with $remote_addr (not appends)', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(join(process.cwd(), 'nginx.prod.conf'), 'utf-8');
    expect(source.includes('$proxy_add_x_forwarded_for'),
      'nginx.prod.conf must NOT use $proxy_add_x_forwarded_for (appends — spoofable)').toBe(false);
    expect(source.includes('X-Forwarded-For $remote_addr'),
      'nginx.prod.conf must overwrite XFF with $remote_addr').toBe(true);
  });
});

describe('INFRA-001: docker-compose.yml — localhost binding', () => {
  it('frontend port 3000 is bound to 127.0.0.1 only', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const source = readFileSync(join(process.cwd(), 'docker-compose.yml'), 'utf-8');
    expect(source.includes('"3000:3000"'),
      'docker-compose.yml must NOT expose port 3000 to all interfaces').toBe(false);
    expect(source.includes('"127.0.0.1:3000:3000"'),
      'docker-compose.yml must bind port 3000 to localhost only').toBe(true);
  });
});
