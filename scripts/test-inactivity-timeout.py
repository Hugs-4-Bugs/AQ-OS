#!/usr/bin/env python3
"""Inactivity timeout edge-case tests.

Tests the following scenarios for Issue 6:
  1. Activity ping resets the timer (secondsLeft should jump back to ~600)
  2. Server refuses to extend an expired session (simulated by setting
     lastActivityAt far in the past)
  3. Session-status poll does NOT extend the timer (read-only)
  4. Multiple pings within the throttle window don't cause DB writes
"""

import json
import subprocess
import sys
import urllib.request
import urllib.error
import sqlite3
import time

BASE = 'http://localhost:3000'
DB_PATH = '/home/z/my-project/db/custom.db'


def mint_session():
    result = subprocess.run(
        ['python3', '/home/z/my-project/scripts/mint-admin-session.py'],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print('ERROR minting session:', result.stderr, file=sys.stderr)
        sys.exit(1)
    stdout_lines = [l for l in result.stdout.split('\n') if l.strip()]
    return json.loads(stdout_lines[-1])


def req(method, path, body=None, cookies=None):
    url = BASE + path
    data = None
    h = {'Content-Type': 'application/json'}
    if cookies:
        h['Cookie'] = '; '.join(f'{k}={v}' for k, v in cookies.items())
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return -1, str(e)


def get_session_last_activity(refresh_token):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'SELECT lastActivityAt, isRevoked FROM UserSession WHERE refreshToken=?',
        (refresh_token,),
    )
    row = c.fetchone()
    conn.close()
    return row  # (lastActivityAt_ms, isRevoked)


def set_session_last_activity(refresh_token, ms):
    """Directly update lastActivityAt for testing — bypasses the API."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        'UPDATE UserSession SET lastActivityAt=? WHERE refreshToken=?',
        (ms, refresh_token),
    )
    conn.commit()
    conn.close()


def test_activity_ping_resets_timer(session):
    """Test 1: POST /api/auth/activity should reset the timer."""
    print('\n=== TEST 1: Activity ping resets timer ===')
    cookies = {'access_token': session['accessToken'], 'refresh_token': session['refreshToken']}

    # Get initial status
    status, body = req('GET', '/api/auth/session-status', cookies=cookies)
    initial = json.loads(body)
    print(f'  Initial secondsLeft: {initial["secondsLeft"]}')

    # Manually set lastActivityAt to 5 minutes ago
    five_min_ago_ms = (int(time.time()) - 5 * 60) * 1000
    set_session_last_activity(session['refreshToken'], five_min_ago_ms)

    # Verify the timer reflects the 5-minute-old activity
    status, body = req('GET', '/api/auth/session-status', cookies=cookies)
    after_set = json.loads(body)
    print(f'  After setting lastActivityAt to 5min ago — secondsLeft: {after_set["secondsLeft"]} (expected ~300)')

    # Now send an activity ping — this should reset the timer to ~600
    status, body = req('POST', '/api/auth/activity', body={'source': 'keyboard'}, cookies=cookies)
    ping = json.loads(body)
    print(f'  After activity ping — secondsLeft: {ping["secondsLeft"]} (expected ~600)')

    # Verify the server actually wrote to DB (since 5min > 30s throttle)
    db_la, db_rev = get_session_last_activity(session['refreshToken'])
    db_la_ms = int(db_la) if db_la else 0
    db_age_s = int((int(time.time() * 1000) - db_la_ms) / 1000)
    print(f'  DB lastActivityAt age: {db_age_s}s (expected ~0 since ping was just processed)')
    print(f'  DB persisted: {ping.get("persisted")}')

    assert ping['secondsLeft'] > 590, f'Timer should be reset to ~600, got {ping["secondsLeft"]}'
    assert ping.get('persisted') == True, 'DB write should have happened (5min > 30s throttle)'
    print('  PASS: Activity ping reset the timer')


def test_throttle_prevents_per_click_writes(session):
    """Test 2: Multiple pings within 30s should not cause DB writes."""
    print('\n=== TEST 2: Throttle prevents per-click DB writes ===')
    cookies = {'access_token': session['accessToken'], 'refresh_token': session['refreshToken']}

    # Send 5 pings within 5 seconds
    persisted_count = 0
    for i in range(5):
        status, body = req('POST', '/api/auth/activity', body={'source': 'mouse'}, cookies=cookies)
        if status == 200:
            data = json.loads(body)
            if data.get('persisted'):
                persisted_count += 1
        time.sleep(0.5)

    print(f'  Sent 5 pings over 2.5s — DB writes: {persisted_count} (expected ≤1)')
    assert persisted_count <= 1, f'Throttle should prevent multiple writes, got {persisted_count}'
    print('  PASS: Throttle prevented per-click DB writes')


def test_session_status_does_not_extend(session):
    """Test 3: GET /api/auth/session-status should NOT extend the timer."""
    print('\n=== TEST 3: Session-status poll does NOT extend timer ===')
    cookies = {'access_token': session['accessToken'], 'refresh_token': session['refreshToken']}

    # Set lastActivityAt to 3 minutes ago
    three_min_ago_ms = (int(time.time()) - 3 * 60) * 1000
    set_session_last_activity(session['refreshToken'], three_min_ago_ms)

    # Get the DB lastActivityAt BEFORE the status poll
    db_la_before, _ = get_session_last_activity(session['refreshToken'])
    db_la_before_ms = int(db_la_before) if db_la_before else 0

    # Poll session-status 3 times
    for i in range(3):
        req('GET', '/api/auth/session-status', cookies=cookies)
        time.sleep(0.1)

    # Get the DB lastActivityAt AFTER the status polls
    db_la_after, _ = get_session_last_activity(session['refreshToken'])
    db_la_after_ms = int(db_la_after) if db_la_after else 0

    print(f'  DB lastActivityAt before polls: {db_la_before_ms}')
    print(f'  DB lastActivityAt after polls:  {db_la_after_ms}')
    assert db_la_before_ms == db_la_after_ms, 'Status poll should NOT modify lastActivityAt'
    print('  PASS: Session-status poll did NOT extend timer')


def test_expired_session_rejected(session):
    """Test 4: An expired session should be rejected (401) on activity ping."""
    print('\n=== TEST 4: Expired session is rejected (not extended) ===')
    cookies = {'access_token': session['accessToken'], 'refresh_token': session['refreshToken']}

    # Set lastActivityAt to 15 minutes ago (beyond 10min timeout)
    fifteen_min_ago_ms = (int(time.time()) - 15 * 60) * 1000
    set_session_last_activity(session['refreshToken'], fifteen_min_ago_ms)

    # Try to ping /api/auth/activity — should be rejected with 401
    status, body = req('POST', '/api/auth/activity', body={'source': 'mouse'}, cookies=cookies)
    print(f'  POST /api/auth/activity on expired session: HTTP {status}')
    print(f'  Body: {body[:200]}')
    assert status == 401, f'Expired session should be rejected with 401, got {status}'
    data = json.loads(body)
    assert data.get('code') == 'SESSION_EXPIRED_INACTIVITY', f'Expected SESSION_EXPIRED_INACTIVITY, got {data.get("code")}'
    print('  PASS: Expired session was rejected (not extended)')

    # Verify the session was revoked in DB
    _, is_revoked = get_session_last_activity(session['refreshToken'])
    print(f'  DB isRevoked: {is_revoked} (expected 1)')
    assert is_revoked == 1, 'Session should be revoked after expiry rejection'
    print('  PASS: Expired session was revoked in DB')


def test_unauthenticated_denied():
    """Test 5: Unauthenticated requests should be denied."""
    print('\n=== TEST 5: Unauthenticated requests denied ===')
    status, body = req('GET', '/api/auth/session-status')
    print(f'  GET /api/auth/session-status (no cookies): HTTP {status}')
    assert status == 401
    print('  PASS: Unauthenticated request denied')


def main():
    session = mint_session()
    print(f'Session minted for user {session["userId"]}')

    test_activity_ping_resets_timer(session)

    # Mint a fresh session for each subsequent test (since test 4 revokes)
    session = mint_session()
    test_throttle_prevents_per_click_writes(session)

    session = mint_session()
    test_session_status_does_not_extend(session)

    session = mint_session()
    test_expired_session_rejected(session)

    test_unauthenticated_denied()

    print('\n=== ALL TESTS PASSED ===')


if __name__ == '__main__':
    main()
