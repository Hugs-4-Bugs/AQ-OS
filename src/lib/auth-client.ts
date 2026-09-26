// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Remember-me client preference (P5, Sep 2026)
//
// The sign-in checkbox is now a CONTROLLED input. The choice is carried
// through multi-step flows (password → MFA, password → Google redirect)
// via a SHORT-LIVED (10 min), non-sensitive, non-httpOnly cookie that the
// API routes read with readRememberMeCookie(). Forging it only changes
// session LIFETIME POLICY (30d absolute + 48h idle) — never privileges.
// ═══════════════════════════════════════════════════════════════════

export const REMEMBER_ME_COOKIE = 'aqos_remember_me';
const TEN_MINUTES_SECONDS = 10 * 60;

export function setRememberMeCookie(checked: boolean): void {
  if (typeof document === 'undefined') return;
  if (checked) {
    document.cookie = `${REMEMBER_ME_COOKIE}=1; path=/; max-age=${TEN_MINUTES_SECONDS}; samesite=lax`;
  } else {
    document.cookie = `${REMEMBER_ME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}

/** Read the client-side remember-me preference (for MFA verify step). */
export function getRememberMePreference(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith(`${REMEMBER_ME_COOKIE}=1`));
}
