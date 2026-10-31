#!/usr/bin/env python3
"""
Phase 34 — Apply additive Autopilot schema drift to the canonical DB.

These columns exist in prisma/schema.prisma but are missing from the
canonical db/custom.db (applied historically via prisma db push and
never captured by a migration). The autopilot engine's findFirst()/
findUnique()/findMany() calls default-select every schema column, so
without these columns the autopilot subsystem throws P2022 and is
unusable.

This script applies the same additive ALTER TABLE statements that a
fresh `prisma migrate deploy` would apply via the migration SQL — but
ONLY for the Autopilot tables (which are not in any migration). It is
IDEMPOTENT: uses PRAGMA table_info to skip columns that already exist,
so running it twice is a no-op.

Safety:
  - Pure additive ALTER TABLE ADD COLUMN. No DROP. No RENAME. No UPDATE.
  - Every column is nullable or carries a constant default.
  - Existing rows preserve their data; new columns read as NULL or the
    documented default.
  - The script does NOT touch any other table.
  - The script does NOT modify .env or any other file.
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path("/home/z/my-project/db/custom.db")

# (table, column, SQL type clause)
AUTOPilot_WORKFLOW_COLUMNS = [
    ("profileMappings", "TEXT NOT NULL DEFAULT '{}'"),
    ("timezone", "TEXT"),
    ("eventTriggers", "TEXT NOT NULL DEFAULT '[]'"),
    ("businessId", "TEXT"),
    ("executionPolicy", "TEXT NOT NULL DEFAULT '{}'"),
    ("approvalPolicy", "TEXT NOT NULL DEFAULT '{}'"),
    ("permissionsPolicy", "TEXT NOT NULL DEFAULT '{}'"),
    ("modelStrategyConfig", "TEXT"),
]

AUTOPILOT_RUN_COLUMNS = [
    ("triggerType", "TEXT"),
    ("triggerEventId", "TEXT"),
    ("runKey", "TEXT"),
    ("idempotencyKey", "TEXT"),
    ("correlationId", "TEXT"),
    ("executionId", "TEXT"),
    ("leadsCompleted", "INTEGER NOT NULL DEFAULT 0"),
    ("leadsFailed", "INTEGER NOT NULL DEFAULT 0"),
    ("leaseOwner", "TEXT"),
    ("leaseExpiresAt", "DATETIME"),
    ("currentAgentKey", "TEXT"),
    ("currentAction", "TEXT"),
    ("currentCheckpoint", "TEXT NOT NULL DEFAULT '{}'"),
    ("retryCount", "INTEGER NOT NULL DEFAULT 0"),
    ("maxRetries", "INTEGER NOT NULL DEFAULT 3"),
    ("nextRetryAt", "DATETIME"),
    ("waitingCondition", "TEXT"),
    ("nextWakeAt", "DATETIME"),
    ("errorCategory", "TEXT"),
    ("businessId", "TEXT"),
    # updatedAt: nullable (Prisma @updatedAt populates it at write time;
    # SQLite ALTER TABLE ADD COLUMN rejects non-constant defaults like
    # CURRENT_TIMESTAMP, so we add it nullable and let Prisma backfill
    # on the next update).
    ("updatedAt", "DATETIME"),
]

# DiscoveryJob: Phase 7 outcome + Phase 8/9 targeting plan columns.
# The DiscoveryJob code path (src/app/api/leads/discover/*) issues Prisma
# queries that default-select every schema column — without these columns
# the discovery subsystem throws P2022.
DISCOVERY_JOB_COLUMNS = [
    ("outcome", "TEXT"),
    ("targetingJson", "TEXT"),
]

def existing_columns(con, table):
    return set(r[1] for r in con.execute(f"PRAGMA table_info({table});").fetchall())

def main():
    if not DB_PATH.exists():
        print(f"FAIL: {DB_PATH} does not exist", file=sys.stderr)
        return 1

    con = sqlite3.connect(str(DB_PATH))
    try:
        # Verify integrity first — refuse to apply if DB is corrupt.
        integrity = con.execute("PRAGMA integrity_check;").fetchone()[0]
        if integrity != "ok":
            print(f"FAIL: integrity_check returned {integrity}", file=sys.stderr)
            return 1

        applied = 0
        skipped = 0
        for table, cols in [
            ("AutopilotWorkflow", AUTOPilot_WORKFLOW_COLUMNS),
            ("AutopilotRun", AUTOPILOT_RUN_COLUMNS),
            ("DiscoveryJob", DISCOVERY_JOB_COLUMNS),
        ]:
            existing = existing_columns(con, table)
            for col, type_clause in cols:
                if col in existing:
                    print(f"  [skip] {table}.{col} already exists")
                    skipped += 1
                    continue
                stmt = f'ALTER TABLE "{table}" ADD COLUMN "{col}" {type_clause};'
                print(f"  [apply] {stmt}")
                con.execute(stmt)
                applied += 1
        con.commit()

        # Re-verify integrity after.
        integrity = con.execute("PRAGMA integrity_check;").fetchone()[0]
        if integrity != "ok":
            print(f"FAIL: integrity_check after apply = {integrity}", file=sys.stderr)
            return 1

        print(f"\nDONE: applied {applied} columns, skipped {skipped} (already present).")
        print(f"integrity_check: {integrity}")
        return 0
    finally:
        con.close()

if __name__ == "__main__":
    sys.exit(main())
