// Debug: capture the signin error by hitting the endpoint with verbose output
const res = await fetch('http://localhost:3000/api/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'starter-e2e-20260923@test.local', password: 'StarterE2E!2026x' }),
});
console.log('status:', res.status);
console.log('body:', await res.text());
