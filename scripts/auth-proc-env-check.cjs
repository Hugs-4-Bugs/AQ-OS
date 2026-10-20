// SAFETY CONTRACT: Reads the RUNNING SERVER's /proc/<pid>/environ and prints ONLY
// PRESENT/ABSENT and SAME-AS-OLD-REVOKED / DIFFERENT-FROM-OLD per variable.
// It NEVER prints any value. Old revoked values come from git history in-memory.
const fs = require('fs');
const { execSync } = require('child_process');

function parseEnv(text) {
  const env = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

// Old revoked reference (committed .env in platform bootstrap auto-commit)
let old = {};
try {
  old = parseEnv(execSync('git show bb03e394e:.env', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
} catch (e) { console.log('old reference unavailable'); }

const pids = process.argv.slice(2);
if (pids.length === 0) { console.log('no pids given'); process.exit(0); }

for (const pid of pids) {
  console.log(`\n=== RUNNING PROCESS ${pid} ENVIRONMENT (values never printed) ===`);
  let procEnv = {};
  try {
    const raw = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
    for (const pair of raw.split('\0')) {
      const i = pair.indexOf('=');
      if (i > 0) procEnv[pair.slice(0, i)] = pair.slice(i + 1);
    }
  } catch (e) { console.log(`process ${pid}: unreadable (${e.code || e.message})`); continue; }

  for (const v of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'GMAIL_APP_PASSWORD']) {
    const val = procEnv[v];
    if (!val || val.trim().length === 0) { console.log(`${v}: ABSENT`); continue; }
    let rel = 'PRESENT';
    if (old[v] && String(old[v]).length > 0) {
      rel += String(val) === String(old[v]) ? ' (SAME-AS-OLD-REVOKED)' : ' (DIFFERENT-FROM-OLD)';
    }
    console.log(`${v}: ${rel}`);
  }
}
