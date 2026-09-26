"""Controlled verification of OTP flow for a normal (non-admin) user.
Reads the OTP from the server's own dev DB (equivalent to reading the mailbox)
and submits it through the REAL verify endpoint."""
import json, time, urllib.request, urllib.error, subprocess

BASE = 'http://localhost:3000'
EMAIL = 'carol.test+ethereal@example.com'

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), e.headers

# 1. request OTP
code, body, _ = post('/api/auth/otp/request', {'email': EMAIL})
print('request ->', code, body[:80])
time.sleep(2)

# 2. read OTP from DB (server-side stored verification state)
out = subprocess.run(['bun', '-e', f"""
import {{ PrismaClient }} from '@prisma/client'
const db = new PrismaClient()
db.user.findUnique({{ where: {{ email: '{EMAIL}' }}, select: {{ loginOtp: true }} }})
  .then(u => {{ process.stdout.write(u.loginOtp || 'EMPTY'); return db.$disconnect() }})
"""], capture_output=True, text=True, timeout=30)
otp = out.stdout.strip().split('\n')[-1]
print('db otp repr:', repr(otp), 'len:', len(otp))

# 3. verify via REAL endpoint
code, body, _ = post('/api/auth/otp/verify', {'email': EMAIL, 'otp': otp})
print('verify ->', code, body[:300])
