/**
 * Development Authentication Delivery Guard
 *
 * When the server has NO real email provider (SMTP_USER/SMTP_PASSWORD or
 * RESEND_API_KEY) and NO real Google OAuth credentials (GOOGLE_CLIENT_ID),
 * every email-based auth flow (OTP login, magic link, forgot password,
 * email verification) and the Google sign-in button would be completely
 * unusable — the user sees "Email delivery is not configured" or
 * "Google sign-in could not start" with no way forward.
 *
 * This module gates a DEV-ONLY convenience: when enabled, auth routes
 * include the generated code / link directly in the API response
 * (`devDelivery` field) so the requesting user's own browser can display
 * it and continue the flow. The code is NEVER delivered to any external
 * mailbox or third party — it only travels back to the same client that
 * made the request.
 *
 * In a production build (NODE_ENV === 'production') this is ALWAYS
 * disabled, so real deployments behave exactly as before. It can also be
 * force-disabled in a dev environment by setting AUTH_DEV_MODE=false.
 */

export interface DevDeliveryPayload {
  /** What kind of credential is being delivered. */
  type: 'otp' | 'magic-link';
  /** 6-digit OTP code (when type === 'otp'). */
  code?: string;
  /** Magic-link URL (when type === 'magic-link'). */
  url?: string;
  /** Short explanation rendered to the user in the dev panel. */
  note?: string;
}

/**
 * Whether dev-mode auth delivery is allowed on this server.
 *
 * Enabled only when ALL of the following hold:
 *   1. Not a production build (NODE_ENV !== 'production')
 *   2. AUTH_DEV_MODE is not explicitly set to 'false'
 */
export function isDevAuthDeliveryEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.AUTH_DEV_MODE !== 'false';
}

/**
 * Build the `devDelivery` response payload for an OTP-based flow, or
 * undefined when dev delivery is disabled (production / AUTH_DEV_MODE=false).
 */
export function devOtpDelivery(code: string, what: string): DevDeliveryPayload | undefined {
  if (!isDevAuthDeliveryEnabled()) return undefined;
  return {
    type: 'otp',
    code,
    note: `Email delivery is not configured on this server, so the ${what} could not be emailed. Development mode: your ${what} was generated locally and is shown below so you can continue testing.`,
  };
}

/**
 * Build the `devDelivery` response payload for a magic-link flow, or
 * undefined when dev delivery is disabled.
 */
export function devMagicLinkDelivery(url: string): DevDeliveryPayload | undefined {
  if (!isDevAuthDeliveryEnabled()) return undefined;
  return {
    type: 'magic-link',
    url,
    note: 'Email delivery is not configured on this server, so the sign-in link could not be emailed. Development mode: your sign-in link was generated locally and can be opened below.',
  };
}
