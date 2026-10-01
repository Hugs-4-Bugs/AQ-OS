// Minimal live verification: does the z-ai gateway accept the CURRENT config?
// - Direct SDK call (NOT through the app) → no user credits, no DB writes
// - Tiny prompt, thinking disabled, minimal output
// - Prints only success/failure + error class; never prints config values
import ZAI from 'z-ai-web-dev-sdk';

try {
  const zai = await ZAI.create();
  const t0 = Date.now();
  const completion = await zai.chat.completions.create({
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    thinking: { type: 'disabled' },
  });
  const latency = Date.now() - t0;
  const content = completion.choices?.[0]?.message?.content || '';
  console.log(JSON.stringify({
    authVerified: true,
    latencyMs: latency,
    model: completion.model || 'unknown',
    responseSample: content.slice(0, 40),
  }, null, 2));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({
    authVerified: false,
    errorClass: /status 401/.test(msg) ? 'AUTH_401'
      : /status 403/.test(msg) ? 'AUTH_403'
      : /Configuration file not found/.test(msg) ? 'CONFIG_MISSING'
      : /timed out|timeout/i.test(msg) ? 'TIMEOUT'
      : 'OTHER',
    // Redact any potential secret-looking substrings before printing
    errorMessage: msg.replace(/[A-Za-z0-9_\-.]{32,}/g, '<redacted>').slice(0, 300),
  }, null, 2));
  process.exit(1);
}
