// Read-only inspection of .z-ai-config candidates.
// Reports: existence, key names, non-empty booleans. NEVER prints values.
import fs from 'fs';
import path from 'path';
import os from 'os';

const candidates = [
  path.join(process.cwd(), '.z-ai-config'),
  path.join(os.homedir(), '.z-ai-config'),
  '/etc/.z-ai-config',
];

for (const filePath of candidates) {
  const entry: Record<string, unknown> = { path: filePath };
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    entry.exists = true;
    try {
      const cfg = JSON.parse(raw);
      entry.validJson = true;
      entry.keys = Object.keys(cfg).sort();
      // Boolean presence map only — no values
      const presence: Record<string, boolean> = {};
      for (const k of Object.keys(cfg)) {
        const v = cfg[k];
        presence[k] = typeof v === 'string' ? v.trim().length > 0 : v != null;
      }
      entry.fieldPresence = presence;
      entry.hasBaseUrl = typeof cfg.baseUrl === 'string' && cfg.baseUrl.length > 0;
      entry.hasApiKey = typeof cfg.apiKey === 'string' && (cfg.apiKey as string).trim().length > 0;
      entry.hasToken = typeof cfg.token === 'string' && (cfg.token as string).trim().length > 0;
      // Safe metadata about baseUrl only (not a secret; needed to identify endpoint)
      if (entry.hasBaseUrl) {
        try { entry.baseUrlHost = new URL(cfg.baseUrl).host; } catch { entry.baseUrlHost = 'unparseable'; }
      }
    } catch {
      entry.validJson = false;
    }
  } catch (e: any) {
    entry.exists = false;
    entry.errorCode = e?.code || 'unknown';
  }
  console.log(JSON.stringify(entry, null, 2));
}

// Also check env fallbacks the SDK does NOT use — to document what's missing
console.log('--- env vars relevant to AI providers (presence only) ---');
for (const k of ['ZAI_API_KEY', 'ZAI_TOKEN', 'Z_AI_TOKEN', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY', 'AI_LOCAL_ENDPOINT']) {
  const v = process.env[k];
  console.log(`${k}: ${v && v.trim().length > 0 ? 'configured=true' : 'configured=false'}`);
}
