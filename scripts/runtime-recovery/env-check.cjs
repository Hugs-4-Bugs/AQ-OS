#!/usr/bin/env node
/**
 * RUNTIME RECOVERY — Step 0 / Step 3 pre-check
 * Read-only masked inspection of .env.
 * Prints ONLY: key names, value lengths, and 4-char masked prefixes.
 * NEVER prints full secret values.
 */
const fs = require('fs');

const ENV_PATH = '/home/z/my-project/.env';

const KEYS = [
  'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_PASS', 'SMTP_HOST', 'SMTP_PORT',
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'EMAIL_FROM',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'AUTH_SECRET', 'JWT_SECRET', 'NEXTAUTH_SECRET', 'DATABASE_URL',
  'USER_AI_PROVIDER_ENCRYPTION_KEY',
  'ZAI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY',
];

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.log('ENV_FILE=MISSING');
    process.exit(1);
  }
  const env = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = env.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  console.log('ENV_FILE=present total_kv_lines=' + lines.length);
  for (const k of KEYS) {
    const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
    if (m) {
      const v = m[1].trim();
      // Masked prefix convention (same as prior worklog entries): first 4 chars only.
      const prefix = v.length > 0 ? v.slice(0, 4) + '***' : '(empty)';
      console.log(k + ': present len=' + v.length + ' prefix=' + prefix);
    } else {
      console.log(k + ': MISSING');
    }
  }
}

main();
