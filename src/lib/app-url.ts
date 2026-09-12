// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — App URL Helper
// Returns the correct public URL for the application.
//
// CRITICAL: Never use `new URL(request.url).origin` or `request.url`
// for URL construction, as the server binds to 0.0.0.0 which makes
// those resolve to http://0.0.0.0:3000 instead of the public domain.
//
// PRIORITY (highest first):
//   0. PRODUCTION_URL constant — hardcoded, always wins on FC/production
//      Aliyun FC strips Host headers; env vars may not load from .env files.
//   1. APP_PUBLIC_URL env var  — explicit override, works on ANY host
//   2. Origin / Referer header — browser-supplied, survives FC gateway
//   3. Request forwarded Host  — only if it's a real public domain
//      (rejects FC internal hostnames like *.fcapp.run, *.aliyuncs.com)
//   4. NEXT_PUBLIC_APP_URL env var
//   5. NEXTAUTH_URL env var
//   6. FALLBACK_URL (preview domain)
//
// WHY Origin/Referer headers are checked:
//   On Aliyun Function Compute, the gateway STRIPS the original Host
//   header and replaces it with the internal FC hostname
//   (e.g. ws-e-cdb-xxx.cn-hongkong-vpc.fcapp.run). This makes
//   x-forwarded-host unreliable. However, the browser-supplied
//   `Origin` and `Referer` headers are NOT stripped — they preserve
//   the real public domain the user is accessing (e.g.
//   acquisition.space-z.ai). We parse these headers to recover the
//   correct public URL.
// ═══════════════════════════════════════════════════════════════════

import type { NextRequest } from 'next/server';

/**
 * PRODUCTION_URL — Hardcoded production domain.
 *
 * WHY: On Aliyun Function Compute, the .env file may not be loaded at
 * runtime, and the gateway strips/replaces Host headers. This constant
 * ensures the correct public URL is ALWAYS used regardless of env var
 * availability or header manipulation by the FC gateway.
 *
 * This is checked FIRST (priority 0), before any env vars or headers.
 */
const PRODUCTION_URL = 'https://acquisition.space-z.ai';

const FALLBACK_URL = 'https://preview-chat-ab88c1b0-d6fd-4199-b9d5-ec3a018502fc.space-z.ai';

/**
 * Internal hostnames used by cloud providers (Aliyun FC, AWS, GCP, etc.)
 * that must NEVER be used as the public app URL. When a request arrives
 * via these hostnames, the gateway has stripped the original Host header
 * and replaced it with the internal compute hostname.
 *
 * Magic links / OAuth redirect_uris built from these hostnames are
 * either unreachable by end users (ERR_CONNECTION_TIMED_OUT) or not
 * registered in Google Cloud Console (redirect_uri_mismatch).
 */
const INTERNAL_HOSTNAME_PATTERNS: RegExp[] = [
  /\.fcapp\.run$/i,           // Aliyun Function Compute
  /\.aliyuncs\.com$/i,        // Aliyun internal services
  /\.fc\.aliyuncs\.com$/i,    // Aliyun FC (explicit)
  /\.functioncompute\.com$/i, // Aliyun FC (alt)
  /\.amazonaws\.com$/i,       // AWS Lambda / API Gateway
  /\.cloudfunctions\.net$/i,  // Google Cloud Functions
  /\.azurewebsites\.net$/i,   // Azure Functions (internal)
];

/**
 * Check if a hostname is an internal cloud-provider hostname that
 * should be rejected. These hostnames are not the public domain the
 * user typed in their browser — they're injected by the cloud gateway.
 */
function isInternalHostname(host: string): boolean {
  const lower = host.toLowerCase();
  for (const pattern of INTERNAL_HOSTNAME_PATTERNS) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

/**
 * Check if a hostname is a valid public domain (not localhost, not
 * internal IP, not internal cloud hostname).
 */
function isPublicHost(host: string): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  // Reject loopback / private addresses
  if (
    lower.startsWith('0.0.0.0') ||
    lower.startsWith('localhost') ||
    lower.startsWith('127.0.0.1') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('10.') ||
    lower.startsWith('172.')
  ) {
    return false;
  }
  // Reject internal cloud-provider hostnames
  if (isInternalHostname(lower)) return false;
  // Reject Google's own domains — on the OAuth callback the browser sends
  // `referer: https://accounts.google.com/...`, which must NEVER be
  // mistaken for the app's public origin.
  if (lower === 'accounts.google.com' || lower.endsWith('.google.com')) return false;
  return true;
}

/**
 * Extract the origin from a URL string (e.g. "https://acquisition.space-z.ai/path"
 * → "https://acquisition.space-z.ai"). Returns null if the string is not a
 * valid URL or points to an internal/loopback host.
 */
function originFromUrlString(urlStr: string | null | undefined): string | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const u = new URL(urlStr);
    if (!isPublicHost(u.hostname)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Extract the public origin from a request's forwarded headers.
 *
 * Checks (in order):
 *   1. `x-forwarded-host` + `x-forwarded-proto` — proxy headers set by the
 *      gateway that actually received the request. Whatever public domain
 *      the login request came in on is the domain we use.
 *   2. `origin` header         — browser sends on fetch/XHR
 *   3. `referer` header        — browser sends on navigations
 *   4. `host` header           — last proxy-derived source
 *
 * Returns null if no valid public origin can be determined.
 */
function getOriginFromRequest(request?: NextRequest): string | null {
  if (!request) return null;

  // 1. x-forwarded-host + x-forwarded-proto — set by the proxy/gateway
  //    (Caddy, nginx, preview gateway). This is the public domain the
  //    request actually arrived on, so it is the MOST reliable signal
  //    for building redirect_uri and redirect targets.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost && isPublicHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  // 2. Origin header — the browser sets this on fetch/XHR requests.
  const originHeader = request.headers.get('origin');
  const fromOrigin = originFromUrlString(originHeader);
  if (fromOrigin) return fromOrigin;

  // 3. Referer header — browser sets this on most requests.
  //    (accounts.google.com is rejected inside isPublicHost, so the
  //    OAuth callback's referer can never hijack the origin.)
  const refererHeader = request.headers.get('referer');
  const fromReferer = originFromUrlString(refererHeader);
  if (fromReferer) return fromReferer;

  // 4. host header — last proxy-derived source.
  const hostHeader = request.headers.get('host');
  if (hostHeader && isPublicHost(hostHeader)) {
    return `${forwardedProto}://${hostHeader}`;
  }

  return null;
}

/**
 * Get the public base URL of the application.
 *
 * PRIORITY (highest first):
 *   0. Origin / Referer / forwarded-host header — browser-supplied, survives FC gateway
 *   1. APP_PUBLIC_URL env var  — explicit override; works on ANY host
 *   2. NEXT_PUBLIC_APP_URL env var
 *   3. NEXTAUTH_URL env var
 *   4. PRODUCTION_URL constant — hardcoded fallback (Aliyun FC with stripped headers)
 *   5. FALLBACK_URL (preview domain)
 *
 * CRITICAL FIX (2026-09-01): Previously this function ALWAYS returned PRODUCTION_URL,
 * ignoring the request entirely. This caused Google OAuth redirect_uri to ALWAYS be
 * https://acquisition.space-z.ai/... even when the user was on a preview domain
 * (e.g. https://preview-chat-xxx.space-z.ai). Google would redirect the user back
 * to the PRODUCTION domain, breaking authentication on preview domains and causing
 * "Sorry, there was a problem deploying the code" errors when production deployment
 * was broken.
 *
 * Now we use dynamic origin detection FIRST. The browser-supplied `origin` and
 * `referer` headers are NOT stripped by the FC gateway, so they reliably carry
 * the real public domain the user is on. PRODUCTION_URL is only a last-resort
 * fallback (e.g. server-to-server requests with no browser headers).
 */
export function getAppUrl(request?: NextRequest): string {
  // 0. Dynamic origin from request headers (HIGHEST priority).
  //    The browser sends `origin`/`referer` headers that survive the FC gateway,
  //    so we can detect the actual domain the user is on.
  const dynamicOrigin = getOriginFromRequest(request);
  if (dynamicOrigin) {
    return dynamicOrigin;
  }

  // 1. APP_PUBLIC_URL — explicit env override
  const appPublicUrl = process.env.APP_PUBLIC_URL;
  if (appPublicUrl) {
    try {
      const u = new URL(appPublicUrl);
      if (isPublicHost(u.hostname)) return appPublicUrl;
    } catch {
      // ignore malformed env var
    }
  }

  // 2. NEXT_PUBLIC_APP_URL
  const nextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (nextPublicAppUrl) {
    try {
      const u = new URL(nextPublicAppUrl);
      if (isPublicHost(u.hostname)) return nextPublicAppUrl;
    } catch {
      // ignore malformed env var
    }
  }

  // 3. NEXTAUTH_URL
  const nextauthUrl = process.env.NEXTAUTH_URL;
  if (nextauthUrl) {
    try {
      const u = new URL(nextauthUrl);
      if (isPublicHost(u.hostname)) return nextauthUrl;
    } catch {
      // ignore malformed env var
    }
  }

  // 4. FALLBACK_URL — last-resort fallback (server-to-server requests with
  //    no usable browser headers). Points at the currently active preview
  //    workspace deployment, which is the only guaranteed-reachable public
  //    URL in this environment.
  return FALLBACK_URL;
}

/**
 * Get the origin (scheme + host) from the app URL.
 */
export function getAppOrigin(request?: NextRequest): string {
  try {
    return new URL(getAppUrl(request)).origin;
  } catch {
    return FALLBACK_URL;
  }
}

/**
 * Build a full URL for a given path, using the correct app base URL.
 * @param path - The path (e.g., '/api/auth/callback/google')
 * @param request - Optional request for forwarded-host detection
 */
export function buildAppUrl(path: string, request?: NextRequest): string {
  const base = getAppUrl(request);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Create a redirect URL for NextResponse.redirect().
 * NEVER use: new URL('/', request.url) — it resolves to http://0.0.0.0:3000
 * ALWAYS use: buildRedirectUrl('/') or buildRedirectUrl('/?auth_error=...')
 */
export function buildRedirectUrl(path: string, request?: NextRequest): URL {
  const base = getAppUrl(request);
  try {
    return new URL(path, base);
  } catch {
    // If URL construction fails, fall back to FALLBACK_URL
    return new URL(path, FALLBACK_URL);
  }
}
