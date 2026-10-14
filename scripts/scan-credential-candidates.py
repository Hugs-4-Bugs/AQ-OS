#!/usr/bin/env python3
"""Scan workspace for candidate Google secrets / Gmail app passwords.
Prints ONLY masked metadata (length, 3-char prefix + 2-char suffix, file).
Never prints full values. Compares each candidate to the current .env value.
"""
import re, glob, os

BASE = '/home/z/my-project'
FILES = [
    '.env', '.env.backup',
] + sorted(glob.glob(BASE + '/.env.pre-template-merge.*.bak')) + [
    'ensure-env.sh', 'scripts/boot-recovery.mjs',
] + sorted(glob.glob(BASE + '/CONTROL_CENTER/*')) + sorted(glob.glob(BASE + '/docs/**/*.md', recursive=True))

def masked(v):
    return f"len={len(v)} shape={v[:3]}...{v[-2:]}"

current = {}
for line in open(BASE + '/.env'):
    m = re.match(r'^([A-Z_][A-Z0-9_]*)=(.*)$', line.strip())
    if m:
        current[m.group(1)] = m.group(2).strip()

gsec_re = re.compile(r'GOCSPX-[A-Za-z0-9_\-]{20,}')
app_pw_re = re.compile(r'\b[a-z]{4}\s?[a-z]{4}\s?[a-z]{4}\s?[a-z]{4}\b')

candidates = {}  # value -> set of (file, context)
for f in FILES:
    p = os.path.join(BASE, f) if not f.startswith('/') else f
    if not os.path.exists(p):
        continue
    try:
        text = open(p, encoding='utf-8', errors='replace').read()
    except Exception:
        continue
    for m in gsec_re.finditer(text):
        candidates.setdefault(m.group(0), set()).add((f, 'GOCSPX-pattern'))
    # app-password-like values assigned to password-ish keys
    for m in re.finditer(r'(?i)^\s*(?:export\s+)?([A-Z_]*(?:PASSWORD|PASS|SECRET)[A-Z_]*)\s*=\s*["\']?([^\s"\']+)["\']?\s*$', text, re.M):
        k, v = m.group(1), m.group(2)
        if v.startswith(('replace_', 'your_', '$', '{')) or len(v) < 8:
            continue
        candidates.setdefault(v, set()).add((f, f'key={k}'))

cur_sec = current.get('GOOGLE_CLIENT_SECRET', '')
cur_pw = current.get('SMTP_PASSWORD', '')
print(f"current GOOGLE_CLIENT_SECRET: {masked(cur_sec) if cur_sec else 'MISSING'}")
print(f"current SMTP_PASSWORD       : {masked(cur_pw) if cur_pw else 'MISSING'}")
print(f"total distinct candidates: {len(candidates)}")
for v, srcs in candidates.items():
    rel = []
    if v == cur_sec: rel.append('== current GOOGLE_CLIENT_SECRET')
    if v == cur_pw: rel.append('== current SMTP_PASSWORD')
    files = sorted({s[0] for s in srcs})
    ctx = sorted({s[1] for s in srcs})
    print(f"- candidate {masked(v)} in {files} [{', '.join(ctx)}] {('; ' + '; '.join(rel)) if rel else '<< DIFFERENT from current .env'}")
