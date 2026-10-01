// Unit tests for the SSRF guard (spec §6.1/§14)
import { describe, it, expect } from 'vitest';
import { isForbiddenIp, assertSafeUrl } from '@/lib/net/url-guard';

describe('isForbiddenIp — IPv4 (private/loopback/link-local/metadata)', () => {
  it('blocks loopback', () => {
    expect(isForbiddenIp('127.0.0.1')).toBe(true);
    expect(isForbiddenIp('127.8.8.8')).toBe(true);
  });

  it('blocks RFC1918 private ranges', () => {
    expect(isForbiddenIp('10.0.0.5')).toBe(true);
    expect(isForbiddenIp('172.16.0.1')).toBe(true);
    expect(isForbiddenIp('172.31.255.255')).toBe(true);
    expect(isForbiddenIp('192.168.1.1')).toBe(true);
  });

  it('blocks the cloud-metadata endpoint (link-local)', () => {
    expect(isForbiddenIp('169.254.169.254')).toBe(true);
    expect(isForbiddenIp('169.254.0.1')).toBe(true);
  });

  it('blocks CGNAT, benchmarking, TEST-NETs, multicast and reserved tails', () => {
    expect(isForbiddenIp('100.64.0.1')).toBe(true);
    expect(isForbiddenIp('198.18.0.5')).toBe(true);
    expect(isForbiddenIp('192.0.2.9')).toBe(true);
    expect(isForbiddenIp('198.51.100.7')).toBe(true);
    expect(isForbiddenIp('203.0.113.9')).toBe(true);
    expect(isForbiddenIp('224.0.0.1')).toBe(true);
    expect(isForbiddenIp('240.0.0.1')).toBe(true);
    expect(isForbiddenIp('0.0.0.0')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isForbiddenIp('8.8.8.8')).toBe(false);
    expect(isForbiddenIp('1.1.1.1')).toBe(false);
    expect(isForbiddenIp('93.184.216.34')).toBe(false);
    expect(isForbiddenIp('172.32.0.1')).toBe(false); // just outside 172.16/12
  });
});

describe('isForbiddenIp — IPv6', () => {
  it('blocks loopback and unspecified', () => {
    expect(isForbiddenIp('::1')).toBe(true);
    expect(isForbiddenIp('::')).toBe(true);
  });

  it('blocks unique-local and link-local', () => {
    expect(isForbiddenIp('fd00::1')).toBe(true);
    expect(isForbiddenIp('fe80::1')).toBe(true);
  });

  it('blocks IPv4-mapped private targets', () => {
    expect(isForbiddenIp('::ffff:127.0.0.1')).toBe(true);
    expect(isForbiddenIp('::ffff:10.0.0.1')).toBe(true);
  });

  it('allows public IPv6', () => {
    expect(isForbiddenIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertSafeUrl — scheme and literal-IP guards', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow(/scheme/);
    await expect(assertSafeUrl('gopher://example.com')).rejects.toThrow(/scheme/);
    await expect(assertSafeUrl('ftp://example.com/file')).rejects.toThrow(/scheme/);
  });

  it('rejects literal private IPs', async () => {
    await expect(assertSafeUrl('http://127.0.0.1/')).rejects.toThrow(/forbidden/);
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/forbidden/);
    await expect(assertSafeUrl('http://10.1.2.3/')).rejects.toThrow(/forbidden/);
    await expect(assertSafeUrl('http://192.168.0.10/admin')).rejects.toThrow(/forbidden/);
  });

  it('allows literal public IPs without DNS', async () => {
    const url = await assertSafeUrl('http://8.8.8.8/dns-query');
    expect(url.hostname).toBe('8.8.8.8');
  });

  it('rejects URLs with embedded credentials', async () => {
    await expect(assertSafeUrl('http://user:pass@example.com/')).rejects.toThrow(/credentials/);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertSafeUrl('not a url at all')).rejects.toThrow(/invalid|blocked/i);
  });

  it('rejects hostnames that fail DNS (public names are checked via DNS in integration)', async () => {
    await expect(assertSafeUrl('http://this-domain-does-not-exist-9x7q2.invalid/')).rejects.toThrow();
  });
});
