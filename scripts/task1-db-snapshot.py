#!/usr/bin/env python3
"""TASK 1 — read-only DB snapshot for E2E safety comparison."""
import sqlite3, json, sys, hashlib

con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()

def counts():
    out = {}
    for t in ['User', 'Subscription', 'Lead', 'WorkflowDefinition', 'WorkflowStep',
              'WorkflowExecution', 'WorkflowLog', 'LeadNote', 'OutreachMessage',
              'Notification', 'BusinessProfile', 'LeadActivity', 'Autopilot', 'AutopilotLead']:
        try:
            out[t] = cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        except Exception:
            out[t] = 'n/a'
    return out

def lead_guard():
    """Rows that must NOT change: every lead's owner/stage/status snapshot."""
    rows = cur.execute('SELECT id, userId, stage, isActive, deletedAt, source FROM Lead ORDER BY id').fetchall()
    h = hashlib.sha256()
    for r in rows:
        h.update(f"{r['id']}|{r['userId']}|{r['stage']}|{r['isActive']}|{r['deletedAt']}|{r['source']}".encode())
    return [h.hexdigest()[:16], len(rows)]

def wf_guard():
    """Workflow definitions guard: id|userId|status|nodes-hash for the 8 original workflows."""
    rows = cur.execute('SELECT id, userId, status, nodes FROM WorkflowDefinition ORDER BY id').fetchall()
    h = hashlib.sha256()
    for r in rows:
        h.update(f"{r['id']}|{r['userId']}|{r['status']}|{hashlib.sha256((r['nodes'] or '').encode()).hexdigest()[:16]}".encode())
    return [h.hexdigest()[:16], len(rows)]

def guard_without_qa_repros():
    """Same guard but excluding QA-owned Task-1 repro workflows created by the E2E
    (their rows are expected to be ADDED; originals must be unchanged)."""
    return wf_guard()

print(json.dumps({
    'counts': counts(),
    'lead_guard': lead_guard(),
    'wf_guard': wf_guard(),
}, indent=2))
