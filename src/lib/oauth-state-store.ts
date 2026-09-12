// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Server-side OAuth state store (in-memory, TTL)
//
// Prevents CSRF attacks on the OAuth callback by storing state
// server-side and verifying it on callback. Entries auto-expire
// after TTL_MS milliseconds. A periodic cleanup removes stale entries.
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface OAuthStateEntry {
  nonce: string;
  origin: string;
  createdAt: number;
}

// In-memory store: nonce → entry
const store = new Map<string, OAuthStateEntry>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** Remove expired entries */
function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(key);
    }
  }
}

/** Ensure the periodic cleanup timer is running */
function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
  // Allow the Node.js process to exit even if the timer is still active
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Generate a new OAuth state nonce, store it with the given origin,
 * and return the nonce.
 */
export function storeState(origin: string): string {
  ensureCleanup();

  const nonce = crypto.randomBytes(16).toString('hex');
  store.set(nonce, {
    nonce,
    origin,
    createdAt: Date.now(),
  });

  return nonce;
}

/**
 * Verify an OAuth state: check that the nonce+origin pair exists,
 * has not expired, and consume it (one-time use).
 *
 * Returns `true` if valid, `false` otherwise.
 */
export function verifyState(nonce: string, origin: string): boolean {
  const entry = store.get(nonce);
  if (!entry) return false;

  // Check expiry
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(nonce);
    return false;
  }

  // Check origin matches
  if (entry.origin !== origin) {
    // Don't delete — this might be a different origin attack attempt,
    // but the nonce is still valid for the correct origin.
    return false;
  }

  // Consume the nonce (one-time use)
  store.delete(nonce);
  return true;
}
