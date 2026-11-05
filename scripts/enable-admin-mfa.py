#!/usr/bin/env python3
"""Insert a verified MfaConfig for the super_admin user.

This is a dev-DB-only operation to enable end-to-end admin API tests.
It generates a real TOTP secret and stores it with isEnabled=true,
simulating a completed MFA enrollment. No production user records
are affected — this DB is the local dev sandbox.

Outputs the base32 secret so we can generate test TOTP codes if
needed for further verification.
"""

import sqlite3
import base64
import os
import secrets
import hashlib
import json
import time

DB_PATH = '/home/z/my-project/db/custom.db'
USER_ID = 'cmquoggx30000nqkon7633chj'

# Generate a base32 TOTP secret (20 random bytes per RFC 6238)
random_bytes = secrets.token_bytes(20)
secret_b32 = base64.b32encode(random_bytes).decode().rstrip('=')

# Hashed backup codes (we don't need to verify them, just store some)
# Use SHA-256 of random strings (the actual auth.ts uses bcrypt, but
# for our test we just need to populate the field — backup codes are
# only consumed by a different endpoint).
backup_codes_plain = [secrets.token_hex(8).upper() for _ in range(8)]
backup_codes_hashed = [hashlib.sha256(c.encode()).hexdigest() for c in backup_codes_plain]

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

# Check if MfaConfig already exists for this user
c.execute('SELECT id, isEnabled FROM MfaConfig WHERE userId=?', (USER_ID,))
existing = c.fetchone()
now_ms = int(time.time() * 1000)

if existing:
    config_id, was_enabled = existing
    c.execute(
        '''UPDATE MfaConfig SET secret=?, backupCodes=?, isEnabled=1, verifiedAt=?, updatedAt=?
           WHERE id=?''',
        (secret_b32, json.dumps(backup_codes_hashed), now_ms, now_ms, config_id),
    )
    print(f'Updated existing MfaConfig id={config_id} (was enabled: {was_enabled})')
else:
    config_id = 'c' + secrets.token_hex(12)
    c.execute(
        '''INSERT INTO MfaConfig (id, userId, secret, backupCodes, isEnabled, verifiedAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)''',
        (config_id, USER_ID, secret_b32, json.dumps(backup_codes_hashed), now_ms, now_ms, now_ms),
    )
    print(f'Created MfaConfig id={config_id}')

conn.commit()

# Verify
c.execute('SELECT id, isEnabled, verifiedAt FROM MfaConfig WHERE userId=?', (USER_ID,))
row = c.fetchone()
print(f'Verified: id={row[0]} isEnabled={row[1]} verifiedAt={row[2]}')
conn.close()

# Output the secret so the test harness can generate valid TOTP codes
print(json.dumps({
    'secret': secret_b32,
    'backupCodes': backup_codes_plain,
    'userId': USER_ID,
}))
