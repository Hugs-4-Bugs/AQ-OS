// AcquisitionOS — k6 load test: Scenario B (Gradually increasing load)
// 5 stages: 100 → 200 → 400 → 800 VUs over 14 min. Finds saturation point.

import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || 'loadtest-user-1@example.com';
const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || 'LoadTest123!';

export const options = {
  stages: [
    { duration: '3m', target: 100 },
    { duration: '3m', target: 200 },
    { duration: '3m', target: 400 },
    { duration: '3m', target: 800 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
  },
  noConnectionReuse: false,
  userAgent: 'k6-loadtest/1.0 (AcquisitionOS Scenario B — ramp-up)',
};

const tokens = {};

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/signin`,
    JSON.stringify({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  if (res.status !== 200) return null;
  return res.cookies['access_token']?.[0]?.value;
}

export default function () {
  if (!tokens[__VU]) {
    const token = login();
    if (!token) { sleep(1); return; }
    tokens[__VU] = token;
  }
  const authHeaders = {
    Cookie: `access_token=${tokens[__VU]}`,
    'Content-Type': 'application/json',
  };
  const r = Math.random();
  if (r < 0.70) {
    group('leads list', () => {
      const res = http.get(`${BASE_URL}/api/leads?take=20`, { headers: authHeaders });
      check(res, { 'leads 200': (r) => r.status === 200 });
    });
  } else if (r < 0.85) {
    group('dashboard summary', () => {
      const res = http.get(`${BASE_URL}/api/dashboard/executive-summary`, { headers: authHeaders });
      check(res, { 'dashboard 200': (r) => r.status === 200 });
    });
  } else if (r < 0.95) {
    group('notifications', () => {
      const res = http.get(`${BASE_URL}/api/notifications?take=10`, { headers: authHeaders });
      check(res, { 'notifications 200': (r) => r.status === 200 });
    });
  } else {
    group('health', () => {
      const res = http.get(`${BASE_URL}/api/health/live`);
      check(res, { 'health 200': (r) => r.status === 200 });
    });
  }
  sleep(0.5);
}
