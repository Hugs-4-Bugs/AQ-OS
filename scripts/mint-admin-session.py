#!/usr/bin/env python3
"""Mint a fresh super-admin access+refresh token pair for end-to-end
API tests. Creates a UserSession row directly via sqlite3.

This does NOT modify any User table records (no password change, no
MFA enrollment) — it only creates a fresh session for the existing
super_admin user so we can verify the admin API behavior.
"""

import sqlite3
import json
import time
import hmac
import hashlib
import base64
import os
import sys

DB_PATH = '/home/z/my-project/db/custom.db'
SUPER_ADMIN_USER_ID = 'cmquoggx30000nqkon7633chj'

# Read secrets from .env
env = {}
with open('/home/z/my-project/.env') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            k, _, v = line.partition('=')
            env[k.strip()] = v.strip().strip('"').strip("'")

JWT_SECRET = env.get('JWT_SECRET')
JWT_REFRESH_SECRET = env.get('JWT_REFRESH_SECRET')

if not JWT_SECRET or not JWT_REFRESH_SECRET:
    print('ERROR: JWT secrets not found in .env', file=sys.stderr)
    sys.exit(1)


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def jwt_sign(payload: dict, secret: str) -> str:
    header = {'alg': 'HS256', 'typ': 'JWT'}
    h = b64url(json.dumps(header, separators=(',', ':')).encode())
    p = b64url(json.dumps(payload, separators=(',', ':')).encode())
    signing_input = (h + '.' + p).encode()
    sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return h + '.' + p + '.' + b64url(sig)


def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'SELECT id, email, name, role, plan, orgId, isTrial, trialEndsAt FROM User WHERE id=?',
        (SUPER_ADMIN_USER_ID,),
    )
    row = c.fetchone()
    if not row:
        print('ERROR: super_admin user not found', file=sys.stderr)
        sys.exit(1)
    user_id, email, name, role, plan, org_id, is_trial, trial_ends_at = row
    print(f'User: {email} role={role} plan={plan}', file=sys.stderr)

    # Include a unique jti (JWT ID) so each mint produces a unique token.
    # Without this, two mints within the same second produce identical
    # signatures and the second INSERT fails on the UNIQUE(refreshToken)
    # constraint.
    import secrets as pysecrets
    jti_access = pysecrets.token_hex(8)
    jti_refresh = pysecrets.token_hex(8)

    now = int(time.time())
    access_exp = now + 15 * 60  # 15 minutes
    refresh_exp = now + 30 * 24 * 60 * 60  # 30 days

    access_payload = {
        'sub': user_id,
        'email': email,
        'role': role,
        'plan': plan,
        'orgId': org_id,
        'isTrial': bool(is_trial),
        'trialEndsAt': trial_ends_at,
        'type': 'access',
        'iat': now,
        'exp': access_exp,
        'aud': 'acquisitionos-api',
        'iss': 'acquisitionos',
        'jti': jti_access,
    }
    refresh_payload = {
        'sub': user_id,
        'email': email,
        'role': role,
        'plan': plan,
        'orgId': org_id,
        'isTrial': bool(is_trial),
        'trialEndsAt': trial_ends_at,
        'type': 'refresh',
        'iat': now,
        'exp': refresh_exp,
        'aud': 'acquisitionos-api',
        'iss': 'acquisitionos',
        'jti': jti_refresh,
    }

    access_token = jwt_sign(access_payload, JWT_SECRET)
    refresh_token = jwt_sign(refresh_payload, JWT_REFRESH_SECRET)

    # Create a UserSession row.
    session_id = 'c' + pysecrets.token_hex(12)
    last_activity_ms = now * 1000
    expires_at_ms = refresh_exp * 1000
    absolute_expires_ms = refresh_exp * 1000  # 30 days absolute

    c.execute(
        '''INSERT INTO UserSession (id, userId, refreshToken, deviceInfo, ipAddress, userAgent,
               expiresAt, isRevoked, rememberMe, lastActivityAt, absoluteExpiresAt, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)''',
        (
            session_id,
            user_id,
            refresh_token,
            'admin-test-cli',
            '127.0.0.1',
            'admin-test-script/1.0',
            expires_at_ms,
            last_activity_ms,
            absolute_expires_ms,
            now * 1000,
            now * 1000,
        ),
    )
    conn.commit()
    conn.close()

    # Emit tokens to stdout (parseable by the test harness)
    print(json.dumps({
        'accessToken': access_token,
        'refreshToken': refresh_token,
        'sessionId': session_id,
        'userId': user_id,
        'accessExp': access_exp,
    }))


if __name__ == '__main__':
    main()
