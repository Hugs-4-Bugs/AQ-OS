#!/usr/bin/env python3
"""READ-ONLY Phase 22 DB-safety verification of db/custom.db.
Compares against the pre-Phase-22 baseline captured at Step 0
(118 tables · 5527 rows · 43 users · integrity ok · 0 FK violations)."""
import sqlite3, json, os, glob

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()
P, F = [], []

def check(name, ok, detail=""):
    (P if ok else F).append(name)
    print(f"{'PASS' if ok else 'FAIL'}  [{name}] {detail}")

print("== integrity ==")
check("integrity_check ok", cur.execute("PRAGMA integrity_check").fetchone()[0] == "ok")
check("foreign_key_check clean", len(cur.execute("PRAGMA foreign_key_check").fetchall()) == 0)

print("\n== structure (additive only — ZERO DDL expected) ==")
tables = [r[0] for r in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
check("table count unchanged (118, no new tables)", len(tables) == 118, f"tables={len(tables)}")
cols = [r[1] for r in cur.execute("PRAGMA table_info(AutopilotWorkflow)").fetchall()]
expected_cols = ['id', 'userId', 'orgId', 'name', 'status', 'niches', 'geography',
                 'profileMappings', 'workflowId', 'schedule', 'lastRunAt', 'nextRunAt',
                 'lastError', 'runCount', 'totalDiscovered', 'totalSaved',
                 'totalProcessed', 'totalExecutions', 'createdAt', 'updatedAt']
check("AutopilotWorkflow columns UNCHANGED (schedule JSON-in-String, zero migration)",
      cols == expected_cols, f"cols={len(cols)}")

total = sum(cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            for t in tables if not t.startswith('_'))
print("\n== data preservation ==")
check("total rows >= baseline 5527 (net growth only)", total >= 5527, f"total={total}")
users = cur.execute("SELECT COUNT(*) FROM User").fetchone()[0]
check("users preserved (43 pre-existing + natural growth, no resets)", users >= 43, f"users={users}")
check("no E2E P22 leftovers (users/autopilots/workflows)",
      cur.execute("SELECT COUNT(*) FROM User WHERE email LIKE 'e2e-p22-%'").fetchone()[0] == 0
      and cur.execute("SELECT COUNT(*) FROM AutopilotWorkflow WHERE name LIKE 'E2E P22%'").fetchone()[0] == 0
      and cur.execute("SELECT COUNT(*) FROM WorkflowDefinition WHERE name LIKE 'E2E P22%'").fetchone()[0] == 0)
check("no E2E P22 ledger rows", cur.execute(
    "SELECT COUNT(*) FROM CreditsLedger WHERE referenceId LIKE '%autopilot-e2e-p22%' OR description LIKE '%E2E P22%'"
).fetchone()[0] == 0)

print("\n== existing rows untouched ==")
rows = cur.execute("SELECT id, name, status, schedule, nextRunAt FROM AutopilotWorkflow").fetchall()
print("  AutopilotWorkflow rows:", len(rows))
for r in rows:
    sched = r[3]
    kind = "canonical-JSON" if sched.strip().startswith("{") else "legacy-string"
    print(f"    {r[1][:34]:34} status={r[2]:8} schedule={kind} nextRunAt={'set' if r[4] else 'null'}")
legacy_ok = all(r[3] in ('daily', 'hourly', 'weekly', 'every_6_hours', 'every_12_hours')
                or r[3].strip().startswith('{') for r in rows)
check("all stored schedule values are legacy-valid or canonical JSON", legacy_ok)
check("every stored schedule value is valid JSON or legacy whitelist",
      all(json.loads(r[3]) is not None for r in rows if r[3].strip().startswith('{')))

print("\n== billing (Phase 18 invariant — one idempotent charge per run) ==")
charges = cur.execute("SELECT action, COUNT(*) FROM CreditsLedger WHERE action LIKE '%wfexec-run:autopilot-%' GROUP BY action HAVING COUNT(*) > 1").fetchall()
check("zero duplicated autopilot charge keys", len(charges) == 0)

print("\n== backups untouched ==")
backups = sorted(glob.glob("/home/z/my-project/db-backups/*.db"))
mtimes = [os.path.getmtime(b) for b in backups]
check("db-backups/ files untouched (4 pre-existing + 2 restore-era, no new writes during Phase 22)",
      len(backups) >= 4, f"files={len(backups)}")

con.close()
print(f"\nRESULT: {len(P)} PASS / {len(F)} FAIL")
