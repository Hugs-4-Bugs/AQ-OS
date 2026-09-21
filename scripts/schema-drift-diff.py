#!/usr/bin/env python3
"""Read-only: diff prisma schema models/fields vs actual SQLite tables/columns."""
import sqlite3, re, json

con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
db_tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
db_cols = {}
for t in db_tables:
    try:
        db_cols[t] = {r[1] for r in cur.execute(f"PRAGMA table_info('{t}')").fetchall()}
    except Exception:
        db_cols[t] = set()

schema = open('/home/z/my-project/prisma/schema.prisma').read()
# Parse models: model Name { ... }
models = {}
for m in re.finditer(r'model\s+(\w+)\s+\{(.*?)\n\}', schema, re.S):
    name, body = m.group(1), m.group(2)
    cols = set()
    for line in body.splitlines():
        line = line.strip()
        if not line or line.startswith('//') or line.startswith('@@'):
            continue
        parts = line.split()
        if len(parts) >= 2:
            cols.add(parts[0])
    models[name] = cols

missing_tables = [n for n in models if n not in db_tables]
extra_tables = sorted(db_tables - set(models) - {'_prisma_migrations', 'sqlite_sequence'})

print("=== MODELS MISSING AS TABLES ===")
for n in missing_tables:
    print(f"  {n} ({len(models[n])} columns)")

print("\n=== TABLES NOT IN SCHEMA (extra) ===")
for t in extra_tables:
    print(f"  {t}")

print("\n=== MISSING COLUMNS IN EXISTING TABLES ===")
for name, cols in models.items():
    if name in db_tables:
        missing = cols - db_cols[name]
        if missing:
            print(f"  {name}: missing {sorted(missing)}")

print("\n=== EXTRA COLUMNS IN DB (not in schema) ===")
for name in models:
    if name in db_cols:
        extra = db_cols[name] - models[name]
        if extra:
            print(f"  {name}: extra {sorted(extra)}")
