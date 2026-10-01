// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — SSRF-Safe URL Guard (spec §6.1 / §14)
//
// Every outbound website-health check (website-scorer, website-service,
// analyze endpoints) MUST go through safeFetch, because lead data comes
// from external providers and can contain attacker-controlled URLs:
//   - only http/https schemes
//   - DNS resolution checked against private / loopback / link-local /
//     cloud-metadata / reserved ranges (IPv4 + IPv6)
//   - redirects followed MANUALLY with re-validation of every hop
//     (prevents the classic redirect-to-internal-host SSRF bypass)
//   - bounded timeout, bounded response size, bounded redirect count
//   - never executes JavaScript, never downloads unrestricted content
// ═══════════════════════════════════════════════════════════════════

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 512 * 1024; // 512 KB

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'HEAD';
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  /** Response time in milliseconds. */
  elapsedMs: number;
  /** Final URL after redirects (validated). */
  finalUrl: string;
  /** Body text truncated to maxBytes. */
  body: string;
  /** Headers we care about. */
  contentType: string;
  /** True when the response was truncated at maxBytes. */
  truncated: boolean;
  /** Redirect hops followed. */
  redirects: number;
  error?: string;
}

// ── Protected network ranges ────────────────────────────────────────

function ipv4ToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const n = ipv4ToLong(ip);
  const inRange = (cidrBase: number, mask: number) => (n & mask) === (cidrBase & mask);
  return (
    n === 0 || // "this" network
    inRange(ipv4ToLong('10.0.0.0'), 0xff000000) || // private
    inRange(ipv4ToLong('100.64.0.0'), 0xffc00000) || // CGNAT
    inRange(ipv4ToLong('127.0.0.0'), 0xff000000) || // loopback
    inRange(ipv4ToLong('169.254.0.0'), 0xffff0000) || // link-local (incl. cloud metadata 169.254.169.254)
    inRange(ipv4ToLong('172.16.0.0'), 0xfff00000) || // private
    inRange(ipv4ToLong('192.0.0.0'), 0xffffff00) || // IETF protocol assignments
    inRange(ipv4ToLong('192.0.2.0'), 0xffffff00) || // TEST-NET-1
    inRange(ipv4ToLong('192.168.0.0'), 0xffff0000) || // private
    inRange(ipv4ToLong('198.18.0.0'), 0xfffe0000) || // benchmarking
    inRange(ipv4ToLong('198.51.100.0'), 0xffffff00) || // TEST-NET-2
    inRange(ipv4ToLong('203.0.113.0'), 0xffffff00) || // TEST-NET-3
    inRange(ipv4ToLong('224.0.0.0'), 0xf0000000) || // multicast + reserved
    n >= 0xf0000000 // reserved class E tail guard
  );
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // strip zone id
  if (
    addr === '::' || // unspecified
    addr === '::1' || // loopback
    addr.startsWith('::ffff:127.') || // IPv4-mapped loopback
    addr.startsWith('::ffff:10.') ||
    addr.startsWith('::ffff:192.168.') ||
    addr.startsWith('::ffff:169.254.') ||
    addr.startsWith('::ffff:172.16.') ||
    addr.startsWith('fe80') || // link-local
    addr.startsWith('fc') || addr.startsWith('fd') || // unique-local
    addr.startsWith('ff') // multicast
  ) {
    return true;
  }
  // IPv4-mapped addresses (::ffff:a.b.c.d) — check the embedded v4
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * True when the given IP (or hostname resolving to it) must never be
 * contacted. Exported for unit testing.
 */
export function isForbiddenIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // not an IP → treat as forbidden
}

/**
 * Validate a URL and resolve every DNS record, refusing private targets.
 * Throws Error('blocked: …') with a reason when the target is unsafe.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('blocked: invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`blocked: scheme ${url.protocol} not allowed`);
  }
  if (!url.hostname) throw new Error('blocked: missing hostname');

  // If the hostname is itself a literal IP, validate it directly
  const literalIp = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literalIp)) {
    if (isForbiddenIp(literalIp)) {
      throw new Error('blocked: target resolves to a forbidden (private/reserved) address');
    }
    return url;
  }

  // Reject credentials-in-URL tricks
  if (url.username || url.password) {
    throw new Error('blocked: credentials in URL are not allowed');
  }

  let records: Array<{ address: string }>;
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('blocked: DNS resolution failed');
  }
  if (records.length === 0) throw new Error('blocked: no DNS records');
  for (const r of records) {
    if (isForbiddenIp(r.address)) {
      throw new Error('blocked: target resolves to a forbidden (private/reserved) address');
    }
  }
  return url;
}

/**
 * SSRF-safe fetch: validates the URL, follows redirects manually with
 * per-hop re-validation, and caps response size and time.
 * The response body is fully consumed (bounded) before returning.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const started = Date.now();

  let currentUrl = rawUrl;
  let redirects = 0;

  for (;;) {
    let url: URL;
    try {
      url = await assertSafeUrl(currentUrl);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        elapsedMs: Date.now() - started,
        finalUrl: currentUrl,
        body: '',
        contentType: '',
        truncated: false,
        redirects,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: options.method ?? 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; AcquisitionOSBot/1.0; +website-health-check)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          ...(options.headers ?? {}),
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        elapsedMs: Date.now() - started,
        finalUrl: currentUrl,
        body: '',
        contentType: '',
        truncated: false,
        redirects,
        error: msg,
      };
    }

    // Manual redirect handling — re-validate EVERY hop (spec §6.1)
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      // Consume body of the redirect response to free the socket
      await res.text().catch(() => '');
      if (!location) {
        return {
          ok: false,
          status: res.status,
          elapsedMs: Date.now() - started,
          finalUrl: currentUrl,
          body: '',
          contentType: '',
          truncated: false,
          redirects,
          error: 'redirect without Location header',
        };
      }
      if (redirects >= MAX_REDIRECTS) {
        return {
          ok: false,
          status: res.status,
          elapsedMs: Date.now() - started,
          finalUrl: currentUrl,
          body: '',
          contentType: '',
          truncated: false,
          redirects,
          error: 'too many redirects (possible redirect loop)',
        };
      }
      const next = new URL(location, url).toString();
      currentUrl = next;
      redirects++;
      continue;
    }

    // Read the body with a hard byte cap
    const contentType = res.headers.get('content-type') ?? '';
    let body = '';
    let truncated = false;
    try {
      const reader = res.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            if (received >= maxBytes) {
              truncated = true;
              await reader.cancel().catch(() => {});
              break;
            }
          }
        }
        const merged = new Uint8Array(Math.min(received, maxBytes));
        let offset = 0;
        for (const chunk of chunks) {
          if (offset >= merged.length) break;
          const view = chunk.subarray(0, Math.min(chunk.byteLength, merged.length - offset));
          merged.set(view, offset);
          offset += view.byteLength;
        }
        body = new TextDecoder('utf-8', { fatal: false }).decode(merged);
      } else {
        body = (await res.text()).slice(0, maxBytes);
      }
    } catch {
      truncated = true; // body read interrupted — treat as truncation
    }

    return {
      ok: res.ok,
      status: res.status,
      elapsedMs: Date.now() - started,
      finalUrl: url.toString(),
      body,
      contentType,
      truncated,
      redirects,
    };
  }
}
