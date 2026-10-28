#!/usr/bin/env python3
"""Non-destructive DB verification for AcquisitionOS pre-check."""
import sqlite3, hashlib, os, sys

db_path = "/home/z/my-project/db/custom.db"
print("===DATABASE VERIFICATION (NON-DESTRUCTIVE)===")
print(f"---FILE---  {db_path}")
print(f"  exists: {os.path.exists(db_path)}")
print(f"  size:   {os.path.getsize(db_path)} bytes")
with open(db_path, "rb") as f:
    print(f"  sha256: {hashlib.sha256(f.read()).hexdigest()}")

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print("\n---INTEGRITY CHECK---")
rows = cur.execute("PRAGMA integrity_check").fetchall()
for r in rows:
    print(f"  {r[0]}")

print("\n---FOREIGN KEY CHECK---")
fk = cur.execute("PRAGMA foreign_key_check").fetchall()
print(f"  violations: {len(fk)}")
for r in fk[:5]:
    print(f"  {r}")

print("\n---TABLE COUNT---")
n_tables = cur.execute(
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).fetchone()[0]
print(f"  tables: {n_tables}")

print("\n---DATA COUNTS---")
for tbl in ["User", "Lead", "WorkflowExecution"]:
    try:
        n = cur.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]
        print(f"  {tbl}: {n}")
    except Exception as e:
        print(f"  {tbl}: ERROR {e}")

conn.close()
print("\n===DB VERIFICATION DONE===")
