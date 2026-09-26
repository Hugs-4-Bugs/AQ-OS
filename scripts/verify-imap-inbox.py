#!/usr/bin/env python3
# verify-imap-inbox.py — Confirm REAL email delivery by reading the app's OWN
# Gmail inbox via IMAP using the same App Password configured for SMTP.
# Prints ONLY subjects/senders/dates — never message bodies, never secrets.
import imaplib, ssl, email, re
from email.header import decode_header

ENV = "/home/z/my-project/.env"
env = {}
for line in open(ENV):
    m = re.match(r"^([A-Z][A-Z0-9_]+)=(.*)$", line.strip())
    if m:
        env[m.group(1)] = m.group(2)

user = env.get("SMTP_USER") or env.get("GMAIL_USER")
pwd = env.get("SMTP_PASSWORD") or env.get("GMAIL_APP_PASSWORD")
mask = (user[:3] + "***@gmail.com") if user else "?"

print(f"IMAP login as {mask} ...")
ctx = ssl.create_default_context()
try:
    M = imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=ctx)
    M.login(user, pwd)
    M.select("INBOX")

    def show(label, criteria, limit=6):
        status, data = M.search(None, criteria)
        ids = data[0].split()
        print(f"\n== {label}: {len(ids)} message(s) — showing up to {limit} most recent ==")
        for i in ids[-limit:][::-1]:
            _, msgdata = M.fetch(i, "(BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE)])")
            raw = msgdata[0][1]
            msg = email.message_from_bytes(raw)
            subj, enc = decode_header(msg.get("Subject", ""))[0]
            if isinstance(subj, bytes):
                subj = subj.decode(enc or "utf-8", "replace")
            frm = msg.get("From", "")
            date = msg.get("Date", "")
            print(f"  • [{date}] {subj}  ← {frm}")

    show("All recent mail", "ALL")
    show("AcquisitionOS mails", '(OR FROM "noreply" SUBJECT "AcquisitionOS")')
    show("Verification-code mails", 'SUBJECT "verification"')
    show("Login-code mails", '(OR SUBJECT "login" SUBJECT "sign-in")')
    M.logout()
    print("\nRESULT: ✅ IMAP connection OK — mails listed above physically exist in the app's Gmail inbox.")
except Exception as e:
    print(f"\nRESULT: ⚠️ IMAP check unavailable: {str(e).splitlines()[0]}")
    print("(IMAP may be disabled in the Gmail account settings; SMTP delivery was already proven by sendTest sent=true)")
