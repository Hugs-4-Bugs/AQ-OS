#!/usr/bin/env python3
"""Phase 24 — Additive DB migration to align local SQLite with Prisma schema.

Brings db/custom.db in sync with prisma/schema.prisma by ADDITIVE operations
ONLY — no DROP, no DELETE, no TRUNCATE, no reset, no reseed. Existing rows
are preserved verbatim; new columns get SQL NULL or DEFAULT values.

Adds:
  · AutopilotRun.runKey        TEXT  (nullable, +UNIQUE index)
  · AutopilotRun.executionId   TEXT  (nullable)
  · AutopilotRun.leadsCompleted INTEGER DEFAULT 0
  · AutopilotRun.leadsFailed    INTEGER DEFAULT 0
  · AutopilotRun_runKey_key    UNIQUE INDEX on runKey (IF NOT EXISTS; NULLs allowed)
  · WorkflowExecutionLead table (CREATE TABLE IF NOT EXISTS — fresh, empty)
  · Lead.discoveryJobId        TEXT  (nullable)
  · Lead_discoveryJobId_idx    INDEX on discoveryJobId (IF NOT EXISTS)

Backs up db/custom.db → db/custom.db.phase24-pre-migration.bak before any
change so the operation is fully recoverable.
"""
import sqlite3
import shutil
import sys
from pathlib import Path

DB = Path('/home/z/my-project/db/custom.db')
BAK = Path('/home/z/my-project/db/custom.db.phase24-pre-migration.bak')

# Migration steps. Each is idempotent (IF NOT EXISTS / guarded by introspection).
# Order matters: ADD COLUMN before CREATE INDEX that references the column;
# CREATE TABLE before its FK target exists (WorkflowExecution already exists).
MIGRATION_STEPS = [
    ('backup', 'shutil.copy2(DB, BAK) if not BAK.exists() else None'),
    ('check+add AutopilotRun.runKey',
     'add_column_if_missing(conn, "AutopilotRun", "runKey", "TEXT")'),
    ('check+add AutopilotRun.executionId',
     'add_column_if_missing(conn, "AutopilotRun", "executionId", "TEXT")'),
    ('check+add AutopilotRun.leadsCompleted',
     'add_column_if_missing(conn, "AutopilotRun", "leadsCompleted", "INTEGER NOT NULL DEFAULT 0")'),
    ('check+add AutopilotRun.leadsFailed',
     'add_column_if_missing(conn, "AutopilotRun", "leadsFailed", "INTEGER NOT NULL DEFAULT 0")'),
    ('create unique index AutopilotRun_runKey_key',
     'create_index_if_not_exists(conn, "AutopilotRun_runKey_key", "AutopilotRun", ["runKey"], unique=True)'),
    ('create table WorkflowExecutionLead',
     '''conn.execute("""
        CREATE TABLE IF NOT EXISTS WorkflowExecutionLead (
            id           TEXT PRIMARY KEY,
            executionId  TEXT NOT NULL,
            leadId       TEXT,
            leadName     TEXT,
            niche        TEXT,
            status       TEXT NOT NULL DEFAULT 'pending',
            attempts     INTEGER NOT NULL DEFAULT 0,
            error        TEXT,
            stepSummary  TEXT,
            startedAt    DATETIME,
            completedAt  DATETIME,
            durationMs   INTEGER,
            createdAt    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt    DATETIME,
            FOREIGN KEY (executionId) REFERENCES WorkflowExecution(id) ON DELETE CASCADE
        )
       """)'''),
    ('create index WorkflowExecutionLead_executionId_idx',
     'create_index_if_not_exists(conn, "WorkflowExecutionLead_executionId_idx", "WorkflowExecutionLead", ["executionId"], unique=False)'),
    ('create index WorkflowExecutionLead_leadId_idx',
     'create_index_if_not_exists(conn, "WorkflowExecutionLead_leadId_idx", "WorkflowExecutionLead", ["leadId"], unique=False)'),
    ('create index WorkflowExecutionLead_status_idx',
     'create_index_if_not_exists(conn, "WorkflowExecutionLead_status_idx", "WorkflowExecutionLead", ["status"], unique=False)'),
    ('check+add Lead.discoveryJobId',
     'add_column_if_missing(conn, "Lead", "discoveryJobId", "TEXT")'),
    ('create index Lead_discoveryJobId_idx',
     'create_index_if_not_exists(conn, "Lead_discoveryJobId_idx", "Lead", ["discoveryJobId"], unique=False)'),
]

def table_columns(conn, table):
    cur = conn.execute(f'PRAGMA table_info("{table}")')
    return [r[1] for r in cur.fetchall()]

def add_column_if_missing(conn, table, column, definition):
    cols = table_columns(conn, table)
    if column in cols:
        return f"  column {table}.{column} already exists — skip"
    conn.execute(f'ALTER TABLE "{table}" ADD COLUMN "{column}" {definition}')
    return f"  added column {table}.{column} {definition}"

def create_index_if_not_exists(conn, name, table, columns, unique=False):
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (name,))
    if cur.fetchone():
        return f"  index {name} already exists — skip"
    cols_sql = ', '.join(f'"{c}"' for c in columns)
    uniq = 'UNIQUE' if unique else ''
    conn.execute(f'CREATE {uniq} INDEX "{name}" ON "{table}" ({cols_sql})')
    return f"  created {uniq} index {name} on {table}({cols_sql})"

def row_counts(conn):
    counts = {}
    for t in ['User','Subscription','BusinessProfile','WorkflowDefinition',
              'AutopilotWorkflow','AutopilotRun','AutopilotLead',
              'WorkflowExecution','WorkflowExecutionLead','WorkflowLog',
              'Lead','DiscoveryJob','CreditsLedger']:
        try:
            cur = conn.execute(f'SELECT COUNT(*) FROM "{t}"')
            counts[t] = cur.fetchone()[0]
        except sqlite3.OperationalError:
            counts[t] = 'TABLE MISSING'
    return counts

def main():
    print('=' * 70)
    print('PHASE 24 — ADDITIVE DB MIGRATION (no drops, no resets)')
    print('=' * 70)
    print(f'\nDB: {DB}')
    print(f'Backup: {BAK}')

    if not DB.exists():
        print(f'\n!!! DB not found at {DB} — ABORT')
        return 1

    if not BAK.exists():
        shutil.copy2(DB, BAK)
        print(f'\n[1] Backup created: {BAK}')
    else:
        print(f'\n[1] Backup already exists from a prior run: {BAK} (left intact)')

    conn = sqlite3.connect(str(DB))
    conn.execute('PRAGMA foreign_keys=ON')

    print('\n[2] Pre-migration row counts:')
    pre = row_counts(conn)
    for t, c in pre.items():
        print(f'  {t}: {c}')

    print('\n[3] Applying additive migration steps:')
    for label, code in MIGRATION_STEPS[1:]:
        print(f'\n  -> {label}')
        try:
            result = eval(code, {'conn': conn, 'add_column_if_missing': add_column_if_missing,
                                  'create_index_if_not_exists': create_index_if_not_exists,
                                  'shutil': shutil, 'DB': DB, 'BAK': BAK})
            if result:
                print(result)
        except Exception as e:
            conn.close()
            print(f'  !!! STEP FAILED: {e}')
            return 1
    conn.commit()
    print('\n  All steps committed.')

    print('\n[4] Post-migration row counts:')
    post = row_counts(conn)
    for t, c in post.items():
        marker = '+' if pre.get(t) == c else '-'
        print(f'  {marker} {t}: {c}')

    print('\n[5] Verifying new schema objects exist:')
    cols = table_columns(conn, 'AutopilotRun')
    print(f'  AutopilotRun.runKey present: {"runKey" in cols}')
    print(f'  AutopilotRun.executionId present: {"executionId" in cols}')
    print(f'  AutopilotRun.leadsCompleted present: {"leadsCompleted" in cols}')
    print(f'  AutopilotRun.leadsFailed present: {"leadsFailed" in cols}')
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='AutopilotRun_runKey_key'")
    print(f'  AutopilotRun_runKey_key unique index present: {bool(cur.fetchone())}')
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='WorkflowExecutionLead'")
    print(f'  WorkflowExecutionLead table present: {bool(cur.fetchone())}')
    cols = table_columns(conn, 'Lead')
    print(f'  Lead.discoveryJobId present: {"discoveryJobId" in cols}')

    print('\n[6] Foreign key integrity check:')
    conn.execute('PRAGMA foreign_keys=ON')
    fk_violations = conn.execute('PRAGMA foreign_key_check').fetchall()
    if fk_violations:
        print(f'  !!! FK violations: {fk_violations}')
    else:
        print('  PRAGMA foreign_key_check: OK (zero violations)')

    print('\n[7] PRAGMA integrity_check:')
    integrity = conn.execute('PRAGMA integrity_check').fetchone()[0]
    print(f'  {integrity}')

    conn.close()
    print('\n' + '=' * 70)
    print('PHASE 24 ADDITIVE MIGRATION: COMPLETE')
    print('=' * 70)
    return 0

if __name__ == '__main__':
    sys.exit(main())
