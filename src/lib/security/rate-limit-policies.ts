/**
 * AcquisitionOS — Rate Limit Policies
 *
 * Configurable rate-limit policies for authentication, account-recovery,
 * and email-dispatch endpoints.
 *
 * These are initial defaults — override via environment variables for
 * production tuning without code changes.
 */

import { RateLimitPolicy } from './distributed-rate-limiter';

// ── Helper: parse env-configured policy ────────────────────────────

function parsePolicy(envVar: string, defaultMax: number, defaultWindow: number, failClosed = false): RateLimitPolicy {
  const envValue = process.env[envVar];
  if (envValue) {
    const [max, window] = envValue.split(':').map(Number);
    if (max && window) {
      return { maxRequests: max, windowSeconds: window, failClosed };
    }
  }
  return { maxRequests: defaultMax, windowSeconds: defaultWindow, failClosed };
}

// ── Authentication Endpoint Policies ───────────────────────────────

/**
 * Forgot password: 3 requests per 15 min per account, 5 per 15 min per IP.
 * Fail-closed: yes (prevents email flooding when store is down)
 */
export const FORGOT_PASSWORD_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_FORGOT_PASSWORD_ACCOUNT',
  3, 900, true
);

export const FORGOT_PASSWORD_IP_POLICY = parsePolicy(
  'RATE_LIMIT_FORGOT_PASSWORD_IP',
  5, 900, true
);

/**
 * OTP request: 3 requests per 10 min per account, 5 per 10 min per IP.
 * Fail-closed: yes (prevents OTP/email flooding)
 */
export const OTP_REQUEST_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_OTP_REQUEST_ACCOUNT',
  3, 600, true
);

export const OTP_REQUEST_IP_POLICY = parsePolicy(
  'RATE_LIMIT_OTP_REQUEST_IP',
  5, 600, true
);

/**
 * OTP verification: 5 failed attempts per 10 min per account.
 * Fail-closed: no (verification is read-only, not expensive)
 */
export const OTP_VERIFY_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_OTP_VERIFY_ACCOUNT',
  5, 600, false
);

/**
 * MFA verification: 5 failed attempts per 10 min per account.
 * Fail-closed: no (verification is read-only)
 */
export const MFA_VERIFY_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_MFA_VERIFY_ACCOUNT',
  5, 600, false
);

/**
 * MFA verification per IP: 10 attempts per 10 min per IP.
 */
export const MFA_VERIFY_IP_POLICY = parsePolicy(
  'RATE_LIMIT_MFA_VERIFY_IP',
  10, 600, false
);

/**
 * Login failures: account-based, 5 failed attempts per 15 min → lockout.
 * Fail-closed: no (login failure recording is DB-backed)
 */
export const LOGIN_FAILURE_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_LOGIN_FAILURE_ACCOUNT',
  5, 900, false
);

/**
 * Login attempts per IP: 10 per 5 min per IP.
 */
export const LOGIN_ATTEMPT_IP_POLICY = parsePolicy(
  'RATE_LIMIT_LOGIN_ATTEMPT_IP',
  10, 300, false
);

/**
 * MFA setup: authenticated account, 3 per hour (strict cooldown).
 * Fail-closed: yes (prevents brute-force on password during setup)
 */
export const MFA_SETUP_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_MFA_SETUP_ACCOUNT',
  3, 3600, true
);

/**
 * MFA confirmation: authenticated account, 5 per 10 min.
 */
export const MFA_CONFIRM_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_MFA_CONFIRM_ACCOUNT',
  5, 600, false
);

/**
 * MFA disable: authenticated account, 3 per hour (strict — requires reauth).
 * Fail-closed: yes (prevents brute-force on password + TOTP)
 */
export const MFA_DISABLE_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_MFA_DISABLE_ACCOUNT',
  3, 3600, true
);

/**
 * Signup: 3 per hour per IP (prevents automated account creation).
 */
export const SIGNUP_IP_POLICY = parsePolicy(
  'RATE_LIMIT_SIGNUP_IP',
  3, 3600, false
);

/**
 * Signup: 1 per 10 min per email (prevents duplicate registrations).
 */
export const SIGNUP_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_SIGNUP_ACCOUNT',
  1, 600, false
);

/**
 * Resend verification email: 3 per 15 min per account.
 * Fail-closed: yes (prevents email flooding)
 */
export const RESEND_VERIFICATION_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_RESEND_VERIFICATION_ACCOUNT',
  3, 900, true
);

/**
 * Magic link request: 3 per 15 min per account.
 * Fail-closed: yes (prevents email flooding)
 */
export const MAGIC_LINK_REQUEST_ACCOUNT_POLICY = parsePolicy(
  'RATE_LIMIT_MAGIC_LINK_REQUEST_ACCOUNT',
  3, 900, true
);

/**
 * Magic link request per IP: 5 per 15 min.
 */
export const MAGIC_LINK_REQUEST_IP_POLICY = parsePolicy(
  'RATE_LIMIT_MAGIC_LINK_REQUEST_IP',
  5, 900, true
);

// ── Cooldown Policies ──────────────────────────────────────────────

/**
 * Email dispatch cooldowns: prevent duplicate emails within a short window.
 */
export const COOLDOWNS = {
  /** Prevent another password-reset email within 60 seconds */
  PASSWORD_RESET_EMAIL: 60,

  /** Prevent duplicate OTP email within 60 seconds */
  OTP_EMAIL: 60,

  /** Prevent duplicate magic-link email within 60 seconds */
  MAGIC_LINK_EMAIL: 60,

  /** Prevent duplicate verification email within 60 seconds */
  VERIFICATION_EMAIL: 60,
} as const;

// ── Progressive Abuse Response ─────────────────────────────────────

/**
 * Progressive penalties for repeated abuse.
 * After exceeding the normal limit, apply escalating cooldowns.
 */
export const PROGRESSIVE_PENALTIES = {
  // After 2x the normal limit within 24h: 1-hour cooldown
  escalationLevel1: {
    threshold: 2,
    cooldownSeconds: 3600,
  },
  // After 5x the normal limit within 24h: 24-hour cooldown
  escalationLevel2: {
    threshold: 5,
    cooldownSeconds: 86400,
  },
} as const;
