#!/usr/bin/env python3
"""
Phase 34 — Schema-drift migration safety test.

Procedure:
1. Build a FRESH, isolated SQLite DB at prisma/_drift_apply_test/fresh.db
   (deleted first if it exists).
2. Run `prisma migrate deploy` against the fresh DB using ONLY the
   migrations directory. This is exactly what a fresh deployment does.
3. After migrate deploy, introspect the fresh DB and verify that EVERY
   column this migration claims to add is present.
4. ALSO verify that the production db/custom.db carries the same columns
   (proving the migration describes the already-existing production state).
5. Produce a JSON report under prisma/_drift_apply_test/RESULT.json.

This script does NOT touch db/custom.db. It does NOT run any DROP, RENAME,
TRUNCATE, or DELETE. It only creates and reads an isolated test DB.
"""

import json
import os
import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

REPO = Path("/home/z/my-project")
TEST_DIR = REPO / "prisma" / "_drift_apply_test"
FRESH_DB = TEST_DIR / "fresh.db"
PROD_DB = REPO / "db" / "custom.db"
MIGRATION_NAME = "20261031000000_phase34_schema_drift_additive"

# Columns this migration adds — must match migration.sql exactly.
EXPECTED_NEW_COLUMNS = {
    "Lead": [
        "discoveryJobId", "discoveredVia", "verificationStatus",
        "employeeCount", "employeeRange", "sourceUrl",
    ],
    "BusinessProfile": ["isDefault"],
    "AuditLog": [
        "securityEventType", "severity", "eventHash", "previousHash",
        "sequence", "requestId", "confirmed", "beforeState",
        "afterState", "outcome", "metadata",
    ],
    "DataExport": ["type"],
    "WorkflowLog": ["retryAttempt"],
}

def run(cmd, **kw):
    print(f"$ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, **kw)

def cols_in_db(db_path, table):
    con = sqlite3.connect(str(db_path))
    try:
        return sorted(r[1] for r in con.execute(f"PRAGMA table_info({table});").fetchall())
    finally:
        con.close()

def main():
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    # 1. Clean slate for fresh DB
    if FRESH_DB.exists():
        FRESH_DB.unlink()
    # 2. Run prisma migrate deploy against the fresh DB.
    env = os.environ.copy()
    env["DATABASE_URL"] = f"file:{FRESH_DB.resolve()}"
    # Prisma migrate deploy uses the migrations/ directory by default.
    # We do NOT pass --schema because we want the default schema.prisma.
    res = run(
        ["npx", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
        env=env,
    )
    print("STDOUT:", res.stdout)
    print("STDERR:", res.stderr)
    if res.returncode != 0:
        print("FAIL: prisma migrate deploy returned non-zero")
        return 1

    # 3. Verify each expected column is present in the fresh DB.
    results = {"fresh_db": {}, "prod_db": {}, "migrations_table": []}
    for table, cols in EXPECTED_NEW_COLUMNS.items():
        fresh_cols = cols_in_db(FRESH_DB, table)
        prod_cols = cols_in_db(PROD_DB, table)
        results["fresh_db"][table] = {
            "expected": cols,
            "present": [c for c in cols if c in fresh_cols],
            "missing": [c for c in cols if c not in fresh_cols],
            "all_db_cols": fresh_cols,
        }
        results["prod_db"][table] = {
            "expected": cols,
            "present": [c for c in cols if c in prod_cols],
            "missing": [c for c in cols if c not in prod_cols],
        }

    # 4. Inspect _prisma_migrations table on fresh DB.
    con = sqlite3.connect(str(FRESH_DB))
    try:
        rows = con.execute(
            "SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY migration_name;"
        ).fetchall()
        results["migrations_table"] = [
            {"migration_name": r[0], "finished_at": r[1], "applied_steps_count": r[2]}
            for r in rows
        ]
    finally:
        con.close()

    # Write report
    (TEST_DIR / "RESULT.json").write_text(json.dumps(results, indent=2))

    # 5. Print summary
    all_ok = True
    print("\n=== SUMMARY ===")
    print(f"Fresh DB: {FRESH_DB}")
    print(f"Migrations applied: {len(results['migrations_table'])}")
    for m in results["migrations_table"]:
        status = "OK" if m["finished_at"] else "FAILED"
        print(f"  - {m['migration_name']} [{status}]")
    print()
    for table in EXPECTED_NEW_COLUMNS:
        f_missing = results["fresh_db"][table]["missing"]
        p_missing = results["prod_db"][table]["missing"]
        fresh_ok = not f_missing
        prod_ok = not p_missing
        print(f"[{table}] fresh: {'OK' if fresh_ok else 'MISSING '+str(f_missing)} | prod: {'OK' if prod_ok else 'MISSING '+str(p_missing)}")
        if not fresh_ok or not prod_ok:
            all_ok = False

    if all_ok:
        print("\nPASS: migration brings fresh DB to schema parity for all expected columns.")
        print("PASS: production DB also carries all expected columns (no drift on these columns).")
        return 0
    else:
        print("\nFAIL: see above.")
        return 2

if __name__ == "__main__":
    sys.exit(main())
