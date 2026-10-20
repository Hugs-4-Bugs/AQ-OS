// SAFETY CONTRACT: This script prints ONLY variable names with PRESENT/ABSENT status
// and SAME-AS-OLD-REVOKED / DIFFERENT-FROM-OLD comparisons. It NEVER prints any value.
// Old revoked values are extracted from git history IN-MEMORY and compared by equality only.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parseEnv(text) {
  const env = {};
  for (const line of String(text).split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.log('.env: ABSENT — cannot verify');
  process.exit(0);
}
const cur = parseEnv(fs.readFileSync(envPath, 'utf8'));

const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'GMAIL_APP_PASSWORD'];
console.log('=== ENV PRESENCE (values never printed) ===');
for (const v of required) {
  const val = cur[v];
  console.log(`${v}: ${val && val.trim().length > 0 ? 'PRESENT' : 'ABSENT'}`);
}

// Old revoked values were committed to git history by platform auto-commit bb03e394e (.env re-tracked then).
let old = {};
let oldSource = 'none';
for (const ref of ['bb03e394e:.env', '9a178ee:ensure-env.sh']) {
  try {
    const out = execSync(`git show ${ref}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], cwd: path.join(__dirname, '..') });
    old = parseEnv(out);
    if (old.GOOGLE_CLIENT_SECRET || old.SMTP_PASSWORD || old.GMAIL_APP_PASSWORD) { oldSource = ref; break; }
  } catch (e) { /* try next source */ }
}
console.log(`\n=== COMPARISON VS OLD REVOKED VALUES (source: ${oldSource}; equality only, no values) ===`);

function cmp(name, curVal, oldVal) {
  if (oldVal == null || String(oldVal).length === 0) { console.log(`${name}: OLD-REFERENCE-UNAVAILABLE`); return; }
  if (!curVal) { console.log(`${name}: ABSENT`); return; }
  console.log(`${name}: ${String(curVal) === String(oldVal) ? 'SAME-AS-OLD-REVOKED' : 'DIFFERENT-FROM-OLD'}`);
}
cmp('GOOGLE_CLIENT_ID', cur.GOOGLE_CLIENT_ID, old.GOOGLE_CLIENT_ID);
cmp('GOOGLE_CLIENT_SECRET', cur.GOOGLE_CLIENT_SECRET, old.GOOGLE_CLIENT_SECRET);
cmp('SMTP_PASSWORD', cur.SMTP_PASSWORD, old.SMTP_PASSWORD);
cmp('GMAIL_APP_PASSWORD', cur.GMAIL_APP_PASSWORD, old.GMAIL_APP_PASSWORD);
