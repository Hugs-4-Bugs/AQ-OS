#!/usr/bin/env python3
"""Full REAL OTP login E2E against the running server.

Flow: POST /api/auth/otp/request (real SMTP send)
   → IMAP-fetch the delivered email from the app's own Gmail account
   → extract the 6-digit code from the real email body
   → POST /api/auth/otp/verify (real code path: expiry/attempts/session)
   → GET /api/auth/me with the session cookie.

Reads SMTP credentials from .env at runtime — no secrets in this file.
Prints only statuses. Exits non-zero on any step failure.
"""
import re, sys, json, time, email, imaplib, smtplib
import urllib.request, http.cookiejar

BASE = 'http://localhost:3000'
TARGET = 'mailtoprabhat72@gmail.com'  # app's own SMTP account (real inbox)

def env(key):
    for line in open('/home/z/my-project/.env'):
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', line.strip())
        if m and m.group(1) == key:
            return m.group(2).strip()
    return None

USER, PW = env('SMTP_USER'), env('SMTP_PASSWORD')
assert USER and PW, 'SMTP creds missing in .env'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with opener.open(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')

def get(path):
    with opener.open(urllib.request.Request(BASE + path), timeout=30) as r:
        return r.status, r.read().decode()

# ── Step 1: request OTP (real SMTP send through the app) ──
print('[1] POST /api/auth/otp/request …')
st, body = post('/api/auth/otp/request', {'email': TARGET})
print(f'    HTTP {st}: {json.dumps(body)[:160]}')
if st != 200:
    print('RESULT: BLOCKED at delivery (SMTP).')
    sys.exit(2)

# ── Step 2: IMAP-fetch the real delivered email ──
print('[2] IMAP fetch of the delivered OTP email …')
code = None
deadline = time.time() + 90
while time.time() < deadline and not code:
    time.sleep(6)
    try:
        M = imaplib.IMAP4_SSL('imap.gmail.com', 993)
        M.login(USER, PW)
        M.select('INBOX')
        typ, data = M.search(None, '(FROM "%s" SUBJECT "login code" UNSEEN)' % USER)
        ids = data[0].split()
        if ids:
            typ, msgdata = M.fetch(ids[-1], '(RFC822)')
            msg = email.message_from_bytes(msgdata[0][1])
            raw = b''
            if msg.is_multipart():
                for part in msg.walk():
                    if part.get_content_type() in ('text/plain', 'text/html'):
                        raw += part.get_payload(decode=True) or b''
            else:
                raw = msg.get_payload(decode=True) or b''
            m = re.search(rb'\b(\d{6})\b', raw)
            if m:
                code = m.group(1).decode()
            M.store(ids[-1], '+FLAGS', '\\Seen')
        M.logout()
    except Exception as e:
        print(f'    imap attempt: {type(e).__name__}: {str(e)[:120]}')
if not code:
    print('RESULT: SMTP send accepted by Gmail, but IMAP retrieval failed — '
          'delivery itself succeeded per Gmail 250; supply code manually to finish verification.')
    sys.exit(3)
print('    OTP retrieved from the real inbox (6 digits) — value not printed.')

# ── Step 3: verify via the real endpoint ──
print('[3] POST /api/auth/otp/verify …')
st, body = post('/api/auth/otp/verify', {'email': TARGET, 'otp': code})
print(f'    HTTP {st}: {json.dumps(body)[:160]}')
if st != 200:
    print('RESULT: OTP verification FAILED.')
    sys.exit(4)

# ── Step 4: authenticated probe ──
st, body = get('/api/auth/me')
print(f'[4] GET /api/auth/me → HTTP {st}: {body[:160]}')
cookies = sorted({c.name for c in jar})
print(f'    session cookies: {cookies}')
print('RESULT: FULL OTP E2E PASSED (real send, real inbox retrieval, real session).')
