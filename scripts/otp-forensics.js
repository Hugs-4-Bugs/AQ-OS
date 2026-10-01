// READ-ONLY forensics for OTP verification failure (Task G).
// Never prints OTP values, hashes, or secrets. Uses a snapshot copy to be extra safe.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SRC = '/home/z/my-project/db/custom.db';
const SNAP = '/home/z/my-project/.test-tmp/otp-forensics-snapshot.db';

fs.mkdirSync(path.dirname(SNAP), { recursive: true });
fs.copyFileSync(SRC, SNAP); // read from a snapshot copy; original never opened for write

const db = new DatabaseSync(SNAP, { readOnly: true });

function rows(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    return [{ __error: e.message }];
  }
}

const now = new Date().toISOString();
console.log('=== NOW (UTC):', now, '===');

// 1. Users with a pending login OTP (presence + expiry only, NEVER the code)
console.log('\n--- Users with loginOtp set (values hidden) ---');
const otpUsers = rows(`
  SELECT id, email, emailVerified, isActive, createdAt, lastLoginAt,
         (loginOtp IS NOT NULL) AS hasOtp,
         loginOtpExpiry,
         (loginOtpExpiry IS NOT NULL AND loginOtpExpiry < ?) AS expired
  FROM User
  WHERE loginOtp IS NOT NULL
  ORDER BY loginOtpExpiry DESC LIMIT 10
`, [now]);
for (const u of otpUsers) {
  console.log(JSON.stringify({
    id: u.id, email: u.email, emailVerified: u.emailVerified, isActive: u.isActive,
    hasOtp: !!u.hasOtp, expiry: u.loginOtpExpiry, expired: !!u.expired,
  }));
}
if (!otpUsers.length) console.log('(none)');

// 2. Recent auth events (last 3 hours) — actions + details, no tokens
console.log('\n--- AuthEvent (last 3h, otp/signin related) ---');
const events = rows(`
  SELECT createdAt, action, details, ipAddress
  FROM AuthEvent
  WHERE createdAt > datetime('now', '-3 hours')
    AND (action LIKE '%otp%' OR action IN ('signin','signin_failed'))
  ORDER BY createdAt DESC LIMIT 40
`);
for (const e of events) console.log(`${e.createdAt} | ${e.action} | ${String(e.details).slice(0, 120)} | ip=${e.ipAddress ?? '-'}`);
if (!events.length) console.log('(none)');

// 3. LoginAttempt rows (last 3h)
console.log('\n--- LoginAttempt (last 3h) ---');
const attempts = rows(`
  SELECT la.createdAt, la.success, la.failReason, la.ipAddress, u.email
  FROM LoginAttempt la LEFT JOIN User u ON u.id = la.userId
  WHERE la.createdAt > datetime('now', '-3 hours')
  ORDER BY la.createdAt DESC LIMIT 40
`);
for (const a of attempts) console.log(`${a.createdAt} | success=${a.success} | ${String(a.failReason ?? '-').slice(0, 80)} | ${a.email ?? '(no user)'} | ip=${a.ipAddress ?? '-'}`);
if (!attempts.length) console.log('(none)');

// 4. Sessions created in last 3h
console.log('\n--- Sessions (last 3h) ---');
const sessions = rows(`
  SELECT s.id, s.createdAt, s.expiresAt, s.rememberMe, u.email
  FROM Session s LEFT JOIN User u ON u.id = s.userId
  WHERE s.createdAt > datetime('now', '-3 hours')
  ORDER BY s.createdAt DESC LIMIT 20
`);
for (const s of sessions) console.log(`${s.createdAt} | rememberMe=${s.rememberMe} | expires=${s.expiresAt} | ${s.email ?? '?'}`);
if (!sessions.length) console.log('(none)');

// 5. Schema check: User OTP columns + Session columns actually present
console.log('\n--- Schema: User OTP columns ---');
const userCols = rows(`PRAGMA table_info('User')`).map(c => c.name);
console.log('has loginOtp:', userCols.includes('loginOtp'), '| has loginOtpExpiry:', userCols.includes('loginOtpExpiry'));
console.log('\n--- Schema: Session columns ---');
const sessCols = rows(`PRAGMA table_info('Session')`).map(c => c.name);
console.log(sessCols.join(', '));

db.close();
console.log('\n(done — snapshot used, original DB untouched)');
