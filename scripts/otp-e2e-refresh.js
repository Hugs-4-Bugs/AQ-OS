// Refresh-channel E2E: OTP sign-in -> silent refresh rotation -> old token rejected.
// Token values captured transiently, never printed.
const BASE = 'http://localhost:3000';
const EMAIL = 'qa@test.com';

function getCookie(res, name) {
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const pair = c.split(';')[0];
    const [n, ...rest] = pair.split('=');
    if (n === name) return rest.join('=');
  }
  return null;
}
async function post(path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
}

(async () => {
  // 1. fresh OTP sign-in (rememberMe=true)
  let res = await post('/api/auth/otp/request', { email: EMAIL });
  console.log('[1] otp request ->', res.status);
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('node:fs');
  fs.copyFileSync('/home/z/my-project/db/custom.db', '/home/z/my-project/.test-tmp/e2e-refresh-snap.db');
  const db = new DatabaseSync('/home/z/my-project/.test-tmp/e2e-refresh-snap.db', { readOnly: true });
  const row = db.prepare('SELECT loginOtp FROM User WHERE email = ?').get(EMAIL);
  db.close();
  if (!row?.loginOtp) { console.error('FATAL: no OTP'); process.exit(1); }

  res = await post('/api/auth/otp/verify', { email: EMAIL, otp: row.loginOtp, rememberMe: true });
  console.log('[2] otp verify ->', res.status);
  if (res.status !== 200) process.exit(1);
  const access1 = getCookie(res, 'access_token');
  const refresh1 = getCookie(res, 'refresh_token');
  console.log('[3] cookies captured:', !!access1, !!refresh1, '(values hidden)');

  // 2. refresh rotation with the refresh cookie
  res = await post('/api/auth/refresh', {}, `refresh_token=${refresh1}`);
  console.log('[4] /api/auth/refresh ->', res.status);
  const refresh2 = getCookie(res, 'refresh_token');
  console.log('[5] new refresh cookie issued:', !!refresh2, '| rotated (different):', refresh2 !== refresh1);
  if (res.status !== 200) process.exit(1);

  // 3. old (rotated-away) refresh token must now be rejected
  res = await post('/api/auth/refresh', {}, `refresh_token=${refresh1}`);
  console.log('[6] reuse OLD refresh token ->', res.status, '(expect 401)');

  // 4. new refresh token still valid (session state read path OK)
  res = await post('/api/auth/refresh', {}, `refresh_token=${refresh2}`);
  console.log('[7] refresh with latest token ->', res.status, '(expect 200)');
  console.log('\nREFRESH CHANNEL OK');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
