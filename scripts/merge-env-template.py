#!/usr/bin/env python3
"""Compare current .env vs uploaded env template. Masked output only."""
import re, sys

ENV_PATH = "/home/z/my-project/.env"
TPL_PATH = "/home/z/my-project/upload/env.example (ACQUISITION-OS Latest)"

# Keys whose values are safe to show in full (non-secret).
SAFE_SHOW = {
    "DATABASE_URL", "NEXT_PUBLIC_APP_URL", "APP_URL", "NEXTAUTH_URL",
    "APP_PUBLIC_URL", "SMTP_HOST", "SMTP_PORT", "EMAIL_FROM",
    "AUTH_DEV_MODE", "ENABLE_GOOGLE_OAUTH", "ENABLE_OTP_LOGIN",
    "ENABLE_MAGIC_LINK", "AUTH_BYPASS_EMAIL", "AUTH_AUTO_VERIFY",
    "NODE_ENV", "PORT",
}

def mask(v: str) -> str:
    if len(v) <= 6:
        return "*" * len(v)
    return v[:3] + "..." + v[-2:] + f" (len={len(v)})"

def parse_env(path):
    out = {}
    try:
        with open(path) as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
                if m:
                    k, v = m.group(1), m.group(2).strip().strip('"').strip("'")
                    out[k] = v
    except FileNotFoundError:
        pass
    return out

def parse_template_active(path):
    """Only ACTIVE (uncommented) assignments from the template."""
    return parse_env(path)

env = parse_env(ENV_PATH)
tpl = parse_template_active(TPL_PATH)

def show(k, v):
    return v if (k in SAFE_SHOW and v) else mask(v)

print("=" * 70)
print(f"CURRENT .env: {len(env)} keys | TEMPLATE (active lines): {len(tpl)} keys")
print("=" * 70)

print("\n[1] Keys in TEMPLATE but MISSING from .env (would be ADDED):")
missing = [k for k in tpl if k not in env]
if missing:
    for k in missing:
        print(f"    + {k} = {show(k, tpl[k])}")
else:
    print("    (none)")

print("\n[2] Keys in BOTH — value comparison (masked unless safe):")
same, diff = [], []
for k in tpl:
    if k in env:
        if env[k] == tpl[k]:
            same.append(k)
            print(f"    = {k}  IDENTICAL  -> {show(k, env[k])}")
        else:
            diff.append(k)
            print(f"    ~ {k}")
            print(f"        .env    : {show(k, env[k])}")
            print(f"        template: {show(k, tpl[k])}")

print("\n[3] Keys in .env NOT in template (kept as-is):")
extra = [k for k in env if k not in tpl]
if extra:
    for k in sorted(extra):
        print(f"    - {k} = {show(k, env[k])}")
else:
    print("    (none)")

# Sensitive keys present check
print("\n[4] Sensitive key inventory in current .env (presence only):")
sensitive = ["JWT_SECRET", "AUTH_SECRET", "NEXTAUTH_SECRET", "GOOGLE_CLIENT_ID",
             "GOOGLE_CLIENT_SECRET", "SMTP_USER", "SMTP_PASSWORD", "CRON_SECRET",
             "ENCRYPTION_KEY", "GMAIL_ENCRYPTION_KEY", "RESEND_API_KEY",
             "GOOGLE_SEARCH_API_KEY", "GOOGLE_SEARCH_CX", "STRIPE_SECRET_KEY",
             "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "ZAI_API_KEY"]
for k in sensitive:
    print(f"    {'SET' if k in env and env[k] else 'UNSET':5s}  {k}"
          + (f"  (placeholder={env[k].startswith('replace_')})" if k in env and env[k].startswith('replace_') else ""))

# Placeholder scan in current .env
print("\n[5] Current .env keys holding PLACEHOLDER values:")
ph = [k for k, v in env.items() if v.startswith("replace_") or v in ("replace_me",)]
if ph:
    for k in ph:
        print(f"    ! {k}")
else:
    print("    (none)")
