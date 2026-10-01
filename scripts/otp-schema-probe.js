// READ-ONLY schema + value-type forensics (snapshot copy).
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

const SRC = '/home/z/my-project/db/custom.db';
const SNAP = '/home/z/my-project/.test-tmp/otp-forensics-snapshot.db';
fs.mkdirSync('/home/z/my-project/.test-tmp', { recursive: true });
fs.copyFileSync(SRC, SNAP);
const db = new DatabaseSync(SNAP, { readOnly: true });

console.log('=== Tables ===');
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
for (const t of tables) console.log(t.name);

console.log('\n=== User OTP rows: raw types ===');
try {
  const r = db.prepare(`SELECT email, typeof(loginOtp) AS tOtp, typeof(loginOtpExpiry) AS tExp,
    length(loginOtp) AS lenOtp, loginOtpExpiry
    FROM User WHERE loginOtp IS NOT NULL LIMIT 5`).all();
  for (const x of r) console.log(JSON.stringify({ email: x.email, tOtp: x.tOtp, lenOtp: x.lenOtp, tExp: x.tExp, expiry: x.loginOtpExpiry }));
} catch (e) { console.log('ERR:', e.message); }

console.log('\n=== AuthEvent schema ===');
try { for (const c of db.prepare(`PRAGMA table_info('AuthEvent')`).all()) console.log(c.name, c.type); } catch (e) { console.log('ERR:', e.message); }

console.log('\n=== Session-like tables schema ===');
for (const t of tables.map(t => t.name)) {
  if (/session/i.test(t)) {
    console.log('TABLE:', t);
    for (const c of db.prepare(`PRAGMA table_info('${t}')`).all()) console.log('  ', c.name, c.type);
  }
}

console.log('\n=== LoginAttempt-like tables ===');
for (const t of tables.map(t => t.name)) {
  if (/login/i.test(t)) {
    console.log('TABLE:', t);
    for (const c of db.prepare(`PRAGMA table_info('${t}')`).all()) console.log('  ', c.name, c.type);
  }
}

db.close();
