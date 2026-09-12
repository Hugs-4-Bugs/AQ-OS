#!/usr/bin/env python3
"""Inventory all API routes: path, HTTP methods, auth pattern."""
import os, re, json

API = '/home/z/my-project/src/app/api'
routes = []

for root, dirs, files in os.walk(API):
    if 'route.ts' in files:
        p = os.path.join(root, 'route.ts')
        rel = '/' + os.path.relpath(root, API).replace(os.sep, '/')
        if rel == '/':
            rel = '/ (root)'
        with open(p) as f:
            src = f.read()
        methods = [m for m in ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] if re.search(r'export\s+(async\s+)?function\s+' + m, src)]
        auth = bool(re.search(r'getAuthUser|requireAuth|getSessionUser|verifySession|requireAdmin|getAuthUserFromRequest', src))
        cron = '/cron/' in rel
        webhook = 'webhook' in rel or rel.endswith('/sentry')
        kind = 'cron' if cron else ('webhook' if webhook else ('auth' if auth else 'public/mixed'))
        routes.append({'path': rel, 'methods': methods, 'auth': kind, 'lines': len(src.splitlines())})

routes.sort(key=lambda r: r['path'])
with open('/home/z/my-project/scripts/api-inventory.json', 'w') as f:
    json.dump(routes, f, indent=1)
print(f"Total routes: {len(routes)}")
from collections import Counter
print(Counter(r['auth'] for r in routes))
