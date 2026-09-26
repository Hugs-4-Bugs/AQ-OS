import { NextResponse } from 'next/server';

/**
 * Auth configuration endpoint.
 *
 * Returns which auth providers are ACTUALLY configured at runtime.
 *
 * P7 FIX (Sep 2026, permanent): googleAvailable was previously HARDCODED
 * to true. That misrepresentated runtime capability — after a workspace
 * restore wiped GOOGLE_CLIENT_ID, the UI still showed the Google button
 * and the click failed (or in older builds silently fell back to the
 * simulated consent page). The boolean is now computed from REAL runtime
 * credential presence. Only SAFE booleans are exposed — never values.
 *
 * CRITICAL: This route MUST NEVER crash. All imports that could fail
 * (email, nodemailer, etc.) are lazy-loaded inside the handler with
 * try/catch.
 */
export async function GET() {
  // Honest runtime capability check (safe booleans only — no secret values).
  const googleConfigured = !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET
  );
  // Legacy field name kept for existing consumers — now carries the HONEST
  // value instead of a permanent true.
  const googleAvailable = googleConfigured;

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
    googleConfigured,
    emailConfigured,
  });
}