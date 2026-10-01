// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Z-AI Gateway Credential Status (read-only pre-flight)
//
// WHY THIS EXISTS (2026-09-26, "missing X-Token header" RCA):
// The z-ai-web-dev-sdk attaches the REQUIRED `X-Token` header only when
// the resolved gateway config JSON contains a non-empty `token` field
// (SDK src: `if (token) { headers['X-Token'] = token; }`). When that
// field is missing, requests still go out (baseUrl+apiKey are enough for
// the SDK to accept the file) but the gateway rejects them with
// `401 {"error":"missing X-Token header"}` — a cryptic error that hides
// the actual fix. This module performs a read-only pre-flight check so
// the provider adapter can fail fast with an actionable message.
//
// SECURITY: this module NEVER returns credential values — only
// existence booleans and file paths. Same candidate resolution order as
// the SDK (project cwd → home dir → /etc), first VALID file wins.
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ZaiGatewayConfigStatus {
  /** True when a candidate file was found AND satisfies the SDK's validity rule (baseUrl + apiKey present). */
  resolved: boolean;
  /** Absolute path of the winning candidate file (null when none resolved). */
  path: string | null;
  /** Field presence booleans — NEVER their values. */
  hasBaseUrl: boolean;
  hasApiKey: boolean;
  /**
   * True when the `token` field exists and is non-blank. The gateway
   * requires it for the `X-Token` header on every request.
   */
  hasToken: boolean;
  /** Human-readable reason when not resolved (no secret material). */
  reason: string | null;
}

/** Default candidate paths — must mirror z-ai-web-dev-sdk loadConfig() exactly. */
export function zaiConfigCandidatePaths(): string[] {
  return [
    path.join(process.cwd(), '.z-ai-config'),
    path.join(os.homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ];
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Read-only inspection of the gateway config candidates.
 * `pathsOverride` is for tests only — production callers use the SDK's
 * default resolution order.
 */
export function readZaiGatewayConfigStatus(pathsOverride?: string[]): ZaiGatewayConfigStatus {
  const candidates = pathsOverride ?? zaiConfigCandidatePaths();

  for (const filePath of candidates) {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue; // ENOENT/EACCES — mirror SDK: silently try next candidate
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // Invalid JSON — SDK skips to next candidate, so do we
    }

    const hasBaseUrl = isNonBlankString(parsed.baseUrl);
    const hasApiKey = isNonBlankString(parsed.apiKey);

    // SDK validity rule (loadConfig): `if (config.baseUrl && config.apiKey)`
    if (!hasBaseUrl || !hasApiKey) continue;

    return {
      resolved: true,
      path: filePath,
      hasBaseUrl,
      hasApiKey,
      hasToken: isNonBlankString(parsed.token),
      reason: null,
    };
  }

  return {
    resolved: false,
    path: null,
    hasBaseUrl: false,
    hasApiKey: false,
    hasToken: false,
    reason:
      'No valid z-ai gateway config found. Checked: ' +
      candidates.join(', ') +
      ". A candidate file must be valid JSON with non-empty 'baseUrl' and 'apiKey' fields.",
  };
}
