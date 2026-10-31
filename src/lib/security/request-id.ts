// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Request Correlation ID Helper
// Phase 33: Minimal production-grade request/correlation ID propagation.
//
// Policy:
//   - Accept incoming X-Request-ID header ONLY if it matches a safe
//     pattern (alphanumeric + dash, max 64 chars). This prevents
//     attacker-controlled values from creating security ambiguity.
//   - Otherwise generate a new random ID.
//   - The ID is available to security/audit writers via getRequestId().
// ═══════════════════════════════════════════════════════════════════

import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';

const SAFE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{1,64}$/;

/**
 * Extract or generate a request correlation ID from a NextRequest.
 *
 * Security: incoming X-Request-ID is only accepted if it matches
 * a safe pattern (alphanumeric + dash, max 64 chars). This prevents
 * injection of arbitrary strings that could create audit ambiguity.
 */
export function getRequestId(request: NextRequest): string {
  const incoming = request.headers.get('x-request-id');
  if (incoming && SAFE_REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }
  // Generate a new correlation ID
  return randomUUID();
}
