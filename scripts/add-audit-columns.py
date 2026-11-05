#!/usr/bin/env python3
"""Safe additive column migration for AuditLog table.

The Prisma schema defines these optional columns on AuditLog:
  sequence, previousHash, eventHash, severity, requestId,
  outcome, beforeState, afterState, securityEventType, confirmed

The local dev DB is missing them (schema drift). This script adds
ONLY the missing columns via ALTER TABLE ADD COLUMN — additive,
non-destructive, no data loss. Existing rows get NULL for the new
columns (which matches their optional (`?`) declaration in schema).

This is NOT `prisma db push --accept-data-loss`. It is a targeted,
forward-only column addition.
"""

import sqlite3
import sys

DB_PATH = '/home/z/my-project/db/custom.db'

# (column_name, column_type, default_clause)
# Defaults are NULL — matches the schema's optional declaration.
COLUMNS_TO_ADD = [
    ('sequence', 'INTEGER'),
    ('previousHash', 'TEXT'),
    ('eventHash', 'TEXT'),
    ('severity', 'TEXT'),
    ('requestId', 'TEXT'),
    ('outcome', 'TEXT'),
    ('beforeState', 'TEXT'),
    ('afterState', 'TEXT'),
    ('securityEventType', 'TEXT'),
    ('confirmed', 'BOOLEAN'),
]


def main():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('PRAGMA table_info(AuditLog)')
    existing_cols = {r[1] for r in c.fetchall()}
    print(f'Existing AuditLog columns ({len(existing_cols)}):', sorted(existing_cols))

    added = []
    skipped = []
    for col_name, col_type in COLUMNS_TO_ADD:
        if col_name in existing_cols:
            skipped.append(col_name)
            continue
        try:
            c.execute(
                f'ALTER TABLE AuditLog ADD COLUMN "{col_name}" {col_type}'
            )
            added.append(col_name)
            print(f'  Added column: {col_name} ({col_type})')
        except sqlite3.OperationalError as e:
            print(f'  FAILED to add column {col_name}: {e}', file=sys.stderr)
            sys.exit(1)

    conn.commit()

    # Verify
    c.execute('PRAGMA table_info(AuditLog)')
    final_cols = [r[1] for r in c.fetchall()]
    print(f'\nFinal AuditLog columns ({len(final_cols)}):', sorted(final_cols))

    if added:
        print(f'\nAdded {len(added)} columns: {added}')
    if skipped:
        print(f'Skipped {len(skipped)} already-present columns: {skipped}')

    conn.close()


if __name__ == '__main__':
    main()
