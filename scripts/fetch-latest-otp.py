#!/usr/bin/env python3
"""Fetch newest AcquisitionOS login-code email from the app's Gmail inbox.
Prints masked code, saves full code to /tmp/.otp_test_code (never printed)."""
import imaplib, re, email as em
from email.header import decode_header

env = {}
for line in open('/home/z/my-project/.env'):
    m = re.match(r'^([A-Z_]+)=(.*)$', line.strip())
    if m:
        env[m.group(1)] = m.group(2)

user = env.get('SMTP_USER') or env.get('GMAIL_USER')
pwd = env.get('SMTP_PASSWORD') or env.get('GMAIL_APP_PASSWORD')
host = env.get('SMTP_HOST') or 'smtp.gmail.com'

m = imaplib.IMAP4_SSL(host)
m.login(user, pwd)
m.select('INBOX')
typ, data = m.search(None, 'SUBJECT', '"login code"')
ids = (data[0] or b'').split()
if not ids:
    print('NO login-code mails found')
    raise SystemExit(1)

t, d = m.fetch(ids[-1], '(RFC822)')
msg = em.message_from_bytes(d[0][1])

body = ''
if msg.is_multipart():
    for part in msg.walk():
        if part.get_content_type() == 'text/plain':
            payload = part.get_payload(decode=True)
            if payload:
                body = payload.decode('utf-8', errors='ignore')
                break
else:
    payload = msg.get_payload(decode=True)
    body = payload.decode('utf-8', errors='ignore') if payload else ''

codes = re.findall(r'\b(\d{6})\b', body)
print('newest login-code mail:', msg['Date'])
print('code:', '***' + codes[0][-2:], '(masked)' if codes else 'NOT FOUND')
if codes:
    open('/tmp/.otp_test_code', 'w').write(codes[0])
m.logout()
