#!/usr/bin/env python3
"""Convert withAdmin -> withSuperAdmin in platform-admin routes.
withAdmin accepts role `owner`, which every self-registered user holds,
so admin/**, audit/** etc. were reachable by all ordinary users."""
import io

FILES = [
    "src/app/api/admin/feedback/analytics/route.ts",
    "src/app/api/admin/feedback/route.ts",
    "src/app/api/admin/feedback/[id]/route.ts",
    "src/app/api/admin/feedback/[id]/comment/route.ts",
    "src/app/api/admin/feedback/crashes/route.ts",
    "src/app/api/admin/backup/route.ts",
    "src/app/api/admin/backup/[id]/route.ts",
    "src/app/api/admin/refund/route.ts",
    "src/app/api/admin/billing/route.ts",
    "src/app/api/admin/billing/webhooks/route.ts",
    "src/app/api/admin/billing/failed-payments/route.ts",
    "src/app/api/audit/route.ts",
    "src/app/api/audit/export/route.ts",
    "src/app/api/billing/analytics/route.ts",
    "src/app/api/payments/webhook-replay/route.ts",
    "src/app/api/payments/process-billing/route.ts",
    "src/app/api/gdpr/retention/route.ts",
]

for path in FILES:
    with io.open(path, "r", encoding="utf-8") as f:
        src = f.read()
    orig = src
    src = src.replace("import { withAdmin }", "import { withSuperAdmin }")
    src = src.replace("withAdmin(request", "withSuperAdmin(request")
    if src != orig:
        with io.open(path, "w", encoding="utf-8") as f:
            f.write(src)
        print(f"PATCHED: {path}")
    else:
        print(f"NO-CHANGE: {path}")

print("done")
