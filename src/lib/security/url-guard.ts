// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — SSRF URL Guard
// Validates that a user-supplied URL is safe for server-side fetching:
//   • http/https schemes only
//   • blocks localhost / *.localhost / *.internal style hostnames
//   • blocks private, link-local, loopback and cloud-metadata IP ranges
//     (resolves DNS and validates EVERY resolved address, which also
//     stops "http://metadata.google.internal"-style tricks via DNS names)
//   • blocks non-standard ports for http/https
// ═══════════════════════════════════════════════════════════════════

import { lookup } from 'dns/promises';

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

/** IPv4 ranges that must never be fetched server-side */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                    // 0.0.0.0/8 "this network"
  if (a === 10) return true;                   // 10.0.0.0/8 private
  if (a === 127) return true;                  // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;     // 169.254.0.0/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true;     // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark range
  if (a >= 224) return true;                   // multicast + reserved
  return false;
}

/** IPv6 addresses that must never be fetched server-side */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // link-local
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;   // unique local
  if (normalized.startsWith('ff')) return true;                                  // multicast
  // IPv4-mapped (::ffff:10.0.0.1) — validate the embedded IPv4
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIp(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

/**
 * Assert that `url` is safe to fetch from the server.
 * Throws UnsafeUrlError when the URL must not be fetched.
 */
export async function assertSafeExternalUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new UnsafeUrlError('Non-standard ports are not allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

  // Block obvious internal hostnames before DNS
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new UnsafeUrlError('Internal hostnames are not allowed');
  }

  // Literal IP — validate directly
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeUrlError('Private network addresses are not allowed');
    }
    return parsed;
  }

  // Hostname — resolve and validate EVERY address (DNS-based bypass guard)
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      throw new UnsafeUrlError('Could not resolve URL host');
    }
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        throw new UnsafeUrlError('URL resolves to a private network address');
      }
    }
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    throw new UnsafeUrlError('Could not resolve URL host');
  }

  return parsed;
}
