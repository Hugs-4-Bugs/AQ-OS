import { NextResponse } from 'next/server';

/**
 * Auth configuration endpoint.
 *
 * Returns which auth providers are available.
 *
 * IMPORTANT: googleAvailable is PERMANENTLY true — Google OAuth credentials
 * are always configured in the Secrets panel. We no longer compute this from
 * env var existence checks because Aliyun FC may not load .env files on cold
 * starts, causing false "unavailable" states. The Google OAuth routes
 * (/api/auth/google, /api/auth/google/callback, /api/auth/callback/google)
 * still validate credentials at call time and will return proper errors if
 * truly missing.
 *
 * CRITICAL: This route MUST NEVER crash. The frontend's fetch().catch()
 * handler sets googleAvailable=false when this endpoint fails, which
 * hides the Google Sign-In button. All imports that could fail (email,
 * nodemailer, etc.) are now lazy-loaded inside the handler with try/catch.
 *
 * PERMANENT — Do not make googleAvailable dynamic or computed from env vars.
 */
export async function GET() {
  // PERMANENT — Do not make this dynamic or computed
  const googleAvailable = true;

  // Lazy-load email config check — MUST NOT throw.
  // If the import fails (e.g. nodemailer not available on FC), we default
  // to emailConfigured=false rather than crashing the entire endpoint.
  let emailConfigured = false;
  try {
    const emailMod = await import('@/lib/email');
    emailConfigured = !!emailMod.isEmailServiceConfigured?.();
  } catch (err) {
    console.warn('[Auth Config] Failed to check email config (non-fatal):', err instanceof Error ? err.message : err);
  }

  // Log presence (not values) for debugging — helps confirm which env vars
  // the runtime actually received. Also lazy-loaded to prevent crash.
  try {
    const etherealMod = await import('@/lib/email-ethereal');
    const clientId = etherealMod.getGoogleClientId?.();
    const clientSecret = etherealMod.getGoogleClientSecret?.();
    console.warn(
      `[AUTH-CONFIG] GOOGLE_CLIENT_ID set: ${!!clientId}, GOOGLE_CLIENT_SECRET set: ${!!clientSecret}, ` +
      `emailConfigured: ${emailConfigured}, ` +
      `SMTP_HOST: ${process.env.SMTP_HOST || 'MISSING'}, SMTP_USER: ${process.env.SMTP_USER || 'MISSING'}, ` +
      `SMTP_PASSWORD: ${process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD ? 'SET' : 'MISSING'}, ` +
      `APP_URL: ${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'MISSING'}`
    );
  } catch (err) {
    // Logging failed — non-fatal. The response is still correct.
    console.warn('[Auth Config] Failed to log credential status (non-fatal):', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    googleAvailable,
    emailConfigured,
  });
}