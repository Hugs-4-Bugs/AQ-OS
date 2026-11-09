// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Authorization Test Helper
//
// Centralizes the boilerplate for testing withAuth / withPermission /
// withSuperAdmin / withPermissionAndMfa against a mocked getAuthUser.
//
// Each helper:
//   1. Mocks @/lib/auth.getAuthUser to return the provided user (or null).
//   2. Builds a NextRequest with the appropriate URL/method.
//   3. Returns the response from the wrapper under test.
//
// All assertions are left to the caller — these helpers do NOT weaken
// or skip any check.
// ═══════════════════════════════════════════════════════════════════

import { vi, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import type { AuthUser } from '@/lib/auth';

// Module-level mock for getAuthUser. Tests set the return value per case.
export const mockGetAuthUser: Mock = vi.fn();

// Install the @/lib/auth mock ONCE per test file via:
//   vi.mock('@/lib/auth', () => ({ getAuthUser: (...a: unknown[]) => mockGetAuthUser(...a), AuthError: ... }))
// We cannot call vi.mock here because it must run before imports are
// hoisted. Test files own the vi.mock call; they import mockGetAuthUser
// from this helper and re-export it as the mock implementation.

// ─── Request builders ──────────────────────────────────────────────

export function buildGetRequest(url = 'http://localhost:3000/api/test'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

export function buildPostRequest(
  url: string,
  body: Record<string, unknown> = {},
): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function buildPatchRequest(
  url: string,
  body: Record<string, unknown> = {},
): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function buildDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'DELETE' });
}

// ─── Auth-state setters ────────────────────────────────────────────

/** Configure getAuthUser to return the given user (or null for unauthenticated). */
export function setAuthUser(user: AuthUser | null): void {
  mockGetAuthUser.mockResolvedValue(user);
}

/** Configure getAuthUser to throw an AuthError-shaped error. */
export function setAuthError(message: string, statusCode = 401): void {
  // We throw a plain Error with a statusCode property to mirror AuthError.
  // The withAuth catch checks `error instanceof AuthError` — to make that
  // true, the test file must own a vi.mock that exposes a real AuthError
  // class. For the default case here, a plain Error is enough because
  // withAuth falls through to the 500 path for non-AuthError exceptions.
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  err.name = 'AuthError';
  mockGetAuthUser.mockRejectedValue(err);
}

/** Configure getAuthUser to throw a non-AuthError (infrastructure) error. */
export function setInfraError(message = 'DB connection failed'): void {
  mockGetAuthUser.mockRejectedValue(new Error(message));
}

// ─── Assertion helpers ─────────────────────────────────────────────

export async function expectJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export async function expectStatus(
  response: Response,
  expected: number,
): Promise<void> {
  expect(response.status).toBe(expected);
}

export async function expectErrorBody(
  response: Response,
  expectedStatus: number,
  expectedError: string,
): Promise<Record<string, unknown>> {
  const body = await expectJson(response);
  expect(response.status).toBe(expectedStatus);
  expect(body.error).toBe(expectedError);
  return body;
}
