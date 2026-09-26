// Case-variant normalization proof: an UPPERCASE email must resolve to the
// SAME canonical lowercase User row (no duplicate accounts).
import { DatabaseSync } from 'node:sqlite';

const r = await fetch('http://localhost:3000/api/auth/otp/request', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'KattyBoy785@GMAIL.COM' }),
});
console.log('uppercase otp/request status:', r.status, '(200 = found + real SMTP send)');

const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });
const u = db.prepare("SELECT id, loginOtp IS NOT NULL AS otpSet FROM User WHERE email = ?").get('kattyboy785@gmail.com');
console.log('canonical row (lowercase lookup):', u.id, '| OTP stored on SAME row:', u.otpSet === 1);
console.log('total users (duplicate check, must be 1):', db.prepare('SELECT COUNT(*) c FROM User').get().c);
console.log('dev/demo users (must be 0):', db.prepare("SELECT COUNT(*) c FROM User WHERE email LIKE '%acquisitionos.local%'").get().c);
