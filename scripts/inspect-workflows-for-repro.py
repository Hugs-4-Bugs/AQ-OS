#!/usr/bin/env python3
"""Read-only: user cmu6j3fde, WorkflowDefinition/WorkflowExecution schema + recent rows."""
import sqlite3, json

con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()

def q(sql, args=()):
    try:
        return [dict(r) for r in cur.execute(sql, args).fetchall()]
    except Exception as e:
        return [{"ERROR": f"{e} :: {sql}"}]

print("=== USER cmu6j3fde ===")
for r in q("SELECT * FROM User WHERE id='cmu6j3fde0000oqummqmm7mqm'"):
    d = dict(r); d.pop('password', None)
    print(json.dumps(d, default=str))

print("\n=== WorkflowExecution SCHEMA ===")
for r in q("PRAGMA table_info(WorkflowExecution)"):
    print(r.get('name'), r.get('type'))

print("\n=== WorkflowDefinition SCHEMA ===")
for r in q("PRAGMA table_info(WorkflowDefinition)"):
    print(r.get('name'), r.get('type'))

print("\n=== WORKFLOW DEFINITIONS (recent) ===")
for r in q("SELECT * FROM WorkflowDefinition ORDER BY rowid DESC LIMIT 10"):
    d = dict(r)
    for k in list(d):
        if isinstance(d[k], str) and len(d[k]) > 300: d[k] = d[k][:300] + '...'
    print(json.dumps(d, default=str))

print("\n=== WORKFLOW EXECUTIONS (recent 12) ===")
for r in q("SELECT * FROM WorkflowExecution ORDER BY rowid DESC LIMIT 12"):
    d = dict(r)
    for k in list(d):
        if isinstance(d[k], str) and len(d[k]) > 500: d[k] = d[k][:500] + '...'
    print(json.dumps(d, default=str))

print("\n=== ALL USERS (full list, id/email) ===")
for r in q("SELECT id, email, name, plan, isActive FROM User ORDER BY createdAt"):
    print(json.dumps(r, default=str))

con.close()
