/**
 * Feature Flag System — DISABLED
 *
 * All dev-mode / simulation flags are permanently disabled.
 * Auth always requires real email delivery, real OTP verification,
 * and real magic link clicking. No bypasses exist.
 */

/** AUTH_DEV_MODE is always OFF. */
export function isDevMode(): boolean {
  return false;
}

/** Signup NEVER auto-verifies — user must verify email. */
export function shouldAutoVerifyEmail(): boolean {
  return false;
}

/** API responses NEVER include OTPs/tokens. */
export function shouldReturnDevOtp(): boolean {
  return false;
}

/** OTPs are NEVER logged to console (security). */
export function shouldLogOtp(): boolean {
  return false;
}

/** Email sending is NEVER skipped. */
export function shouldBypassEmail(): boolean {
  return false;
}

/** Whether the current Node environment is production. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}