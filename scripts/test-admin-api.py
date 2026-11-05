#!/usr/bin/env python3
"""End-to-end API verification for Issues 6, 7, 8.

Tests the admin API endpoints that were returning 401:
  - GET /api/admin/users
  - GET /api/admin/billing?action=overview
  - GET /api/admin/operations/system-health
  - GET /api/admin/security/audit
  - GET /api/admin/crm/leads (control — was working)

Also tests the new inactivity-timeout endpoints:
  - GET /api/auth/session-status
  - POST /api/auth/activity

And the entitlements endpoint with the platform-admin policy:
  - GET /api/subscriptions/entitlements
"""

import json
import subprocess
import sys
import urllib.request
import urllib.error

BASE = 'http://localhost:3000'

# Mint a fresh session
result = subprocess.run(
    ['python3', '/home/z/my-project/scripts/mint-admin-session.py'],
    capture_output=True, text=True,
)
if result.returncode != 0:
    print('ERROR minting session:', result.stderr, file=sys.stderr)
    sys.exit(1)
# The script prints the JSON dict on the last non-empty stdout line.
stdout_lines = [l for l in result.stdout.split('\n') if l.strip()]
session = json.loads(stdout_lines[-1])
ACCESS = session['accessToken']
REFRESH = session['refreshToken']
print(f'Session minted: userId={session["userId"]}', file=sys.stderr)
print(f'Access token expires at: {session["accessExp"]}', file=sys.stderr)
print('', file=sys.stderr)


def req(method, path, body=None, headers=None, cookies=None):
    url = BASE + path
    data = None
    h = headers or {}
    h['Content-Type'] = 'application/json'
    if cookies:
        h['Cookie'] = '; '.join(f'{k}={v}' for k, v in cookies.items())
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            body_text = resp.read().decode()
            return status, body_text
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)


def show(label, status, body, max_chars=400):
    body_short = body[:max_chars] + ('…' if len(body) > max_chars else '')
    print(f'{label:50s}  HTTP {status}  body: {body_short}')


cookies = {'access_token': ACCESS, 'refresh_token': REFRESH}

print('=== AUTHENTICATED SUPER-ADMIN REQUESTS ===')
print()
show('GET /api/auth/me',
     *req('GET', '/api/auth/me', cookies=cookies))
show('GET /api/auth/session-status',
     *req('GET', '/api/auth/session-status', cookies=cookies))
show('POST /api/auth/activity {source:mouse}',
     *req('POST', '/api/auth/activity', body={'source': 'mouse'}, cookies=cookies))
show('GET /api/subscriptions/entitlements',
     *req('GET', '/api/subscriptions/entitlements', cookies=cookies))
print()
print('=== ADMIN API ENDPOINTS (previously 401) ===')
print()
show('GET /api/admin/users',
     *req('GET', '/api/admin/users', cookies=cookies))
show('GET /api/admin/users?search=admin',
     *req('GET', '/api/admin/users?search=admin', cookies=cookies))
show('GET /api/admin/billing?action=overview',
     *req('GET', '/api/admin/billing?action=overview', cookies=cookies))
show('GET /api/admin/operations/system-health',
     *req('GET', '/api/admin/operations/system-health', cookies=cookies))
show('GET /api/admin/security/audit?limit=5',
     *req('GET', '/api/admin/security/audit?limit=5', cookies=cookies))
print()
print('=== CONTROL: ADMIN CRM ENDPOINTS (were working) ===')
print()
show('GET /api/admin/crm/leads',
     *req('GET', '/api/admin/crm/leads', cookies=cookies))
show('GET /api/admin/crm/overview',
     *req('GET', '/api/admin/crm/overview', cookies=cookies))
show('GET /api/admin/overview',
     *req('GET', '/api/admin/overview', cookies=cookies))
print()
print('=== UNAUTHENTICATED REQUESTS (should be 401) ===')
print()
show('GET /api/admin/users (no cookies)',
     *req('GET', '/api/admin/users'))
show('GET /api/auth/session-status (no cookies)',
     *req('GET', '/api/auth/session-status'))
show('POST /api/auth/activity (no cookies)',
     *req('POST', '/api/auth/activity', body={'source': 'mouse'}))
print()
print('=== INVALID SESSION (should be 401) ===')
print()
bad_cookies = {'access_token': 'invalid.token.here', 'refresh_token': 'invalid.refresh.here'}
show('GET /api/admin/users (invalid cookies)',
     *req('GET', '/api/admin/users', cookies=bad_cookies))
show('GET /api/auth/session-status (invalid cookies)',
     *req('GET', '/api/auth/session-status', cookies=bad_cookies))
