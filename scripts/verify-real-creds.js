// verify-real-creds.js — Verify SMTP + Google OAuth credentials WITHOUT printing secrets
const nodemailer = require('nodemailer');

async function main() {
  require('dotenv').config({ path: '/home/z/my-project/.env' });

  // ── 1. SMTP verification (login only, no email sent) ──
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  console.log('SMTP: user=' + (user ? 'SET' : 'MISSING') + ', pass=' + (pass ? 'SET' : 'MISSING'));
  if (user && pass) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: false,
      auth: { user, pass },
    });
    try {
      await transporter.verify();
      console.log('SMTP VERIFY: ✅ SUCCESS — Gmail accepted credentials (real email CAN be sent)');
    } catch (e) {
      console.log('SMTP VERIFY: ❌ FAILED — ' + (e.message || e).split('\n')[0]);
    }
  }

  // ── 2. Google OAuth client verification ──
  const cid = process.env.GOOGLE_CLIENT_ID;
  console.log('GOOGLE: client_id=' + (cid ? 'SET [' + cid.length + ' chars]' : 'MISSING') + ', client_secret=' + (process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING'));
  if (cid) {
    const redirectUri = 'http://localhost:3000/api/auth/callback/google';
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=' + encodeURIComponent(cid)
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&response_type=code&scope=openid%20email%20profile&state=test-probe';
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const loc = res.headers.get('location') || '';
      const body = res.status === 200 ? await res.text() : '';
      const hasError = /redirect_uri_mismatch|invalid_client|error=/i.test(loc) || /redirect_uri_mismatch|invalid_client|Error 40[03]/i.test(body);
      if (/invalid_client/.test(loc + body)) {
        console.log('GOOGLE OAUTH CHECK: ❌ invalid_client — client ID/secret rejected by Google');
      } else if (/redirect_uri_mismatch/.test(loc + body)) {
        console.log('GOOGLE OAUTH CHECK: ⚠️ client_id VALID but redirect_uri http://localhost:3000 NOT whitelisted in Google Cloud Console (must be added for local dev)');
      } else if (res.status === 302 || res.status === 200) {
        console.log('GOOGLE OAUTH CHECK: ✅ client_id accepted by Google' + (loc.includes('accounts.google.com') ? ' (consent flow reachable)' : ''));
      } else {
        console.log('GOOGLE OAUTH CHECK: status=' + res.status + ' — manual verification required');
      }
    } catch (e) {
      console.log('GOOGLE OAUTH CHECK: network error — ' + (e.message || e).split('\n')[0]);
    }
  }
}
main().catch((e) => { console.error('Script error:', e.message); process.exit(1); });
