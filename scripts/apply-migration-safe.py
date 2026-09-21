#!/usr/bin/env python3
"""Apply additive migration safely: backup DB file first, then apply SQL, then verify.
Read-only tables are not touched; only additive DDL is executed."""
import sqlite3, shutil, sys, time

DB = '/home/z/my-project/db/custom.db'
BACKUP = f'/home/z/my-project/scripts/custom.db.backup-{time.strftime("%Y%m%d-%H%M%S")}'

# 1. Safety backup (file copy; server may be writing — use sqlite backup API)
src = sqlite3.connect(DB)
dst = sqlite3.connect(BACKUP)
src.backup(dst)
dst.close()
print(f"backup written: {BACKUP}")

# 2. Verify pre-state
pre_tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
assert 'ProspectPipeline' not in pre_tables, "ProspectPipeline already exists — nothing to do"
ucols = {r[1] for r in src.execute("PRAGMA table_info('UserSettings')").fetchall()}
assert 'servicesOffered' not in ucols, "servicesOffered already exists"
lead_rows = src.execute("SELECT COUNT(*) FROM Lead").fetchone()[0]
user_rows = src.execute("SELECT COUNT(*) FROM UserSettings").fetchone()[0]
print(f"pre-state OK: Lead rows={lead_rows}, UserSettings rows={user_rows} (must be unchanged after)")

# 3. Apply additive SQL
sql = open('/home/z/my-project/scripts/migration-add-prospect-pipeline.sql').read()
try:
    src.executescript(sql)
    src.commit()
except Exception as e:
    src.close()
    print(f"MIGRATION FAILED: {e}; restoring from backup")
    src2 = sqlite3.connect(DB)
    src2.close()
    shutil.copy(BACKUP, DB)
    print("restored from backup — DB unchanged")
    sys.exit(1)

# 4. Post verification
post_tables = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
assert 'ProspectPipeline' in post_tables, "ProspectPipeline missing after migration"
pcols = [r[1] for r in src.execute("PRAGMA table_info('ProspectPipeline')").fetchall()]
ucols2 = {r[1] for r in src.execute("PRAGMA table_info('UserSettings')").fetchall()}
assert 'servicesOffered' in ucols2
lead_rows2 = src.execute("SELECT COUNT(*) FROM Lead").fetchone()[0]
user_rows2 = src.execute("SELECT COUNT(*) FROM UserSettings").fetchone()[0]
pp_rows = src.execute("SELECT COUNT(*) FROM ProspectPipeline").fetchone()[0]
assert (lead_rows, user_rows) == (lead_rows2, user_rows2), "ROW COUNT CHANGED — investigate"
# Orphaned columns must still exist
lcols = {r[1] for r in src.execute("PRAGMA table_info('Lead')").fetchall()}
for c in ['websiteStatus', 'websiteVerifiedAt', 'websiteVerificationSource', 'websiteVerificationConfidence']:
    assert c in lcols, f"orphaned column {c} was dropped — must be preserved"
acols = {r[1] for r in src.execute("PRAGMA table_info('LeadAnalysis')").fetchall()}
for c in ['isStale', 'staleReason']:
    assert c in acols, f"orphaned column {c} was dropped — must be preserved"

print("POST-STATE OK:")
print(f"  ProspectPipeline table: {len(pcols)} columns, {pp_rows} rows")
print(f"  UserSettings.servicesOffered added (default '[]')")
print(f"  Lead rows unchanged: {lead_rows2}; UserSettings rows unchanged: {user_rows2}")
print(f"  Orphaned legacy columns preserved: Lead.websiteStatus* + LeadAnalysis.isStale/staleReason")
src.close()
print("MIGRATION COMPLETE (additive only)")
