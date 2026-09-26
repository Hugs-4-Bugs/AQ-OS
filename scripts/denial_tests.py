"""Denial tests: normal user (org-level 'owner') vs platform super_admin.
Full cookie capture + real endpoints."""
import json, time, urllib.request, urllib.error, subprocess, http.cookiejar

BASE = 'http://localhost:3000'
EMAIL = 'carol.test+ethereal@example.com'

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def get(path):
    req = urllib.request.Request(BASE + path)
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# login
post('/api/auth/otp/request', {'email': EMAIL})
time.sleep(2)
out = subprocess.run(['bun', '-e', f"""
import {{ PrismaClient }} from '@prisma/client'
const db = new PrismaClient()
db.user.findUnique({{ where: {{ email: '{EMAIL}' }}, select: {{ loginOtp: true }} }})
  .then(u => {{ process.stdout.write(u.loginOtp || 'EMPTY'); return db.$disconnect() }})
"""], capture_output=True, text=True, timeout=30)
otp = out.stdout.strip().split('\n')[-1]
code, body = post('/api/auth/otp/verify', {'email': EMAIL, 'otp': otp})
u = json.loads(body).get('user', {})
print(f"logged in as {u.get('email')} role={u.get('role')} (org-level owner, NOT super_admin)")
print('cookies:', [c.name for c in jar])

# TEST 1: normal user GET /admin
code, body = get('/admin')
meta_refresh = 'url=/' in body and 'refresh' in body
admin_content = ('Platform Metrics' in body) or ('Total Users' in body) or ('cmquo' in body)
print(f"GET /admin -> {code} | meta-refresh redirect to '/': {meta_refresh} | admin content leaked: {admin_content}")

# TEST 2: normal user GET admin APIs
for ep in ['overview', 'users', 'billing?action=overview', 'feedback']:
    code, body = get(f'/api/admin/{ep}')
    print(f"GET /api/admin/{ep} -> {code} | {body[:70]}")

# TEST 3: admin mutation attempt (should 403)
code, body = post('/api/admin/refund', {})
print(f"POST /api/admin/refund -> {code} | {body[:70]}")
