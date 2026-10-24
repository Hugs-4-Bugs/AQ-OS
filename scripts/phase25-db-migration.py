#!/usr/bin/env python3
"""Phase 25 — Additive DB migration: ExecutionActivity table.

Creates a unified execution/activity event log that records discrete
events (status transitions, retry events, cancellations, per-lead
outcomes) for the Phase 24 execution engine.

ADDITIVE ONLY — no DROP, no DELETE, no TRUNCATE, no reset.
Backs up db/custom.db → db/custom.db.phase25-pre-migration.bak.
"""
import sqlite3, shutil, sys
from pathlib import Path

DB = Path('/home/z/my-project/db/custom.db')
BAK = Path('/home/z/my-project/db/custom.db.phase25-pre-migration.bak')

def main():
    print('=' * 60)
    print('PHASE 25 — ADDITIVE DB MIGRATION: ExecutionActivity table')
    print('=' * 60)
    if not BAK.exists():
        shutil.copy2(DB, BAK)
        print(f'Backup: {BAK}')
    else:
        print(f'Backup already exists: {BAK}')

    conn = sqlite3.connect(str(DB))
    conn.execute('PRAGMA foreign_keys=ON')

    # Pre-migration row counts
    pre_counts = {}
    for t in ['User','AutopilotRun','AutopilotLead','WorkflowExecution','CreditsLedger','ExecutionActivity']:
        try:
            pre_counts[t] = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        except:
            pre_counts[t] = 'TABLE MISSING'

    print('\nPre-migration row counts:')
    for t, c in pre_counts.items():
        print(f'  {t}: {c}')

    print('\nCreating ExecutionActivity table...')
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

    print('Table + indexes created.')

    # Post-migration verification
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ExecutionActivity'")
    print(f'\nExecutionActivity table present: {bool(cur.fetchone())}')
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ExecutionActivity'")
    print(f'Indexes: {[r[0] for r in cur.fetchall()]}')

    print(f'\nPRAGMA integrity_check: {conn.execute("PRAGMA integrity_check").fetchone()[0]}')
    fk = conn.execute('PRAGMA foreign_key_check').fetchall()
    print(f'PRAGMA foreign_key_check: {fk or "OK (zero violations)"}')

    print('\nPost-migration row counts (must match pre for existing tables):')
    for t in ['User','AutopilotRun','AutopilotLead','WorkflowExecution','CreditsLedger','ExecutionActivity']:
        try:
            post = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
            pre = pre_counts.get(t, '?')
            marker = '✓' if str(pre) == str(post) or pre == 'TABLE MISSING' else '✗'
            print(f'  {marker} {t}: {post} (pre: {pre})')
        except:
            print(f'  - {t}: TABLE MISSING')

    conn.close()
    print('\n' + '=' * 60)
    print('PHASE 25 ADDITIVE MIGRATION: COMPLETE')
    print('=' * 60)
    return 0

if __name__ == '__main__':
    sys.exit(main())
