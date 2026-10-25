#!/usr/bin/env python3
"""Phase 26 — Additive DB migration: ModelInvocation table.

Creates the durable model-invocation record store used by the Phase 26
multi-model orchestration engine (one row per logical invocation slot,
UNIQUE invocationKey for DB-level duplicate protection).

ADDITIVE ONLY — no DROP, no DELETE, no TRUNCATE, no reset.
Backs up db/custom.db → db/custom.db.phase26-pre-migration.bak.
Also ensures the Phase 25 ExecutionActivity table exists (additive) if
it is still missing, since Phase 26's MODEL_* events write into it.
"""
import sqlite3, shutil
from pathlib import Path

DB = Path('/home/z/my-project/db/custom.db')
BAK = Path('/home/z/my-project/db/custom.db.phase26-pre-migration.bak')

TABLES = ['User', 'AutopilotRun', 'AutopilotLead', 'WorkflowExecution',
          'WorkflowExecutionLead', 'ExecutionActivity', 'ModelInvocation']


def counts(conn):
    out = {}
    for t in TABLES:
        try:
            out[t] = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        except Exception:
            out[t] = 'TABLE MISSING'
    return out


def main():
    print('=' * 60)
    print('PHASE 26 — ADDITIVE DB MIGRATION: ModelInvocation table')
    print('=' * 60)
    if not BAK.exists():
        shutil.copy2(DB, BAK)
        print(f'Backup: {BAK}')
    else:
        print(f'Backup already exists: {BAK}')

    conn = sqlite3.connect(str(DB))
    conn.execute('PRAGMA foreign_keys=ON')

    print('\nPre-migration row counts:')
    pre = counts(conn)
    for t, c in pre.items():
        print(f'  {t}: {c}')

    # ── Phase 25 guard: ExecutionActivity (additive, if missing) ──
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ExecutionActivity'")
    if not cur.fetchone():
        print('\nExecutionActivity missing — creating (Phase 25 catch-up, additive):')
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ExecutionActivity (
                id           TEXT PRIMARY KEY,
                runId        TEXT,
                executionId  TEXT,
                leadId       TEXT,
                eventType    TEXT NOT NULL,
                fromStatus   TEXT,
                toStatus     TEXT,
                detail       TEXT,
                userId       TEXT NOT NULL,
                createdAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        for idx_name, col in [
            ('ExecutionActivity_runId_idx', 'runId'),
            ('ExecutionActivity_executionId_idx', 'executionId'),
            ('ExecutionActivity_userId_idx', 'userId'),
            ('ExecutionActivity_createdAt_idx', 'createdAt'),
        ]:
            conn.execute(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON ExecutionActivity("{col}")')
        conn.commit()
        print('  created ExecutionActivity + 4 indexes')

    # ── Phase 26: ModelInvocation ──
    print('\nCreating ModelInvocation table...')
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ModelInvocation (
            id            TEXT PRIMARY KEY,
            invocationKey TEXT NOT NULL,
            executionId   TEXT,
            runId         TEXT,
            leadId        TEXT,
            stepName      TEXT,
            actionType    TEXT,
            provider      TEXT NOT NULL,
            model         TEXT NOT NULL,
            role          TEXT,
            status        TEXT NOT NULL DEFAULT 'RUNNING',
            attempt       INTEGER NOT NULL DEFAULT 0,
            startedAt     DATETIME,
            finishedAt    DATETIME,
            durationMs    INTEGER,
            result        TEXT,
            error         TEXT,
            tokensUsed    INTEGER,
            userId        TEXT NOT NULL,
            createdAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute(
        'CREATE UNIQUE INDEX IF NOT EXISTS "ModelInvocation_invocationKey_key" '
        'ON ModelInvocation("invocationKey")')
    for idx_name, col in [
        ('ModelInvocation_executionId_idx', 'executionId'),
        ('ModelInvocation_runId_idx', 'runId'),
        ('ModelInvocation_leadId_idx', 'leadId'),
        ('ModelInvocation_userId_idx', 'userId'),
        ('ModelInvocation_status_idx', 'status'),
    ]:
        conn.execute(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON ModelInvocation("{col}")')
    conn.commit()

    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='ModelInvocation'")
    print(f'ModelInvocation table present: {bool(cur.fetchone())}')
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ModelInvocation'")
    print(f'Indexes: {[r[0] for r in cur.fetchall()]}')

    print(f"\nPRAGMA integrity_check: {conn.execute('PRAGMA integrity_check').fetchone()[0]}")
    fk = conn.execute('PRAGMA foreign_key_check').fetchall()
    print(f'PRAGMA foreign_key_check: {fk or "OK (zero violations)"}')

    print('\nPost-migration row counts (must match pre for existing tables):')
    post = counts(conn)
    for t, c in post.items():
        print(f'  {t}: {c}')

    regressed = [t for t in TABLES
                 if isinstance(pre.get(t), int) and post.get(t) != pre.get(t)]
    if regressed:
        print(f'\nREGRESSION DETECTED in {regressed} — ROLLING BACK')
        conn.close()
        shutil.copy2(BAK, DB)
        print('Restored db/custom.db from backup. ABORT.')
        return 1

    print('\nOK — additive migration complete, no existing data touched.')
    conn.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
