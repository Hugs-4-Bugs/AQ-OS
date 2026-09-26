#!/usr/bin/env python3
"""Read-only inspection of db/custom.db: users, leads, workflows, executions."""
import sqlite3, json

con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()

def q(sql, args=()):
    try:
        return [dict(r) for r in cur.execute(sql, args).fetchall()]
    except Exception as e:
        return [{"ERROR": str(e)}]

print("=== USERS ===")
for r in q("SELECT id, email, name, plan, isActive, createdAt FROM User ORDER BY createdAt LIMIT 20"):
    print(json.dumps(r, default=str))

print("\n=== LEADS (id, owner, name, active, deleted) ===")
for r in q("SELECT id, userId, businessName, isActive, deletedAt, createdAt FROM Lead ORDER BY createdAt DESC LIMIT 25"):
    print(json.dumps(r, default=str))

print("\n=== LEAD COUNTS PER USER ===")
for r in q("SELECT userId, COUNT(*) as n, SUM(isActive) as active FROM Lead GROUP BY userId"):
    print(json.dumps(r, default=str))

print("\n=== WORKFLOWS ===")
for r in q("SELECT id, userId, name, status, triggerType, isActive, createdAt FROM Workflow ORDER BY createdAt DESC LIMIT 15"):
    print(json.dumps(r, default=str))

print("\n=== WORKFLOW EXECUTIONS (recent) ===")
for r in q("SELECT id, workflowId, leadId, userId, status, startedAt, completedAt, error FROM WorkflowExecution ORDER BY startedAt DESC LIMIT 15"):
    print(json.dumps(r, default=str))

print("\n=== PROSPECT PIPELINES (recent) ===")
for r in q("SELECT id, leadId, userId, status, currentStep, progress, error, createdAt FROM ProspectPipeline ORDER BY createdAt DESC LIMIT 10"):
    print(json.dumps(r, default=str))

tables = [r["name"] for r in q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
print("\n=== TABLES ===")
print(", ".join(tables))

con.close()
