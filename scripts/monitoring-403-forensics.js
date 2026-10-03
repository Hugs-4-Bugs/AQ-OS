// READ-ONLY forensics for Monitoring 403 — runs on a SNAPSHOT COPY of the DB.
// No writes to the real database. No secrets printed.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const REAL_DB = '/home/z/my-project/db/custom.db';
const TMP = '/home/z/my-project/.test-tmp';
const COPY = path.join(TMP, 'monitoring-403-snapshot.db');

fs.mkdirSync(TMP, { recursive: true });
fs.copyFileSync(REAL_DB, COPY);

const db = new DatabaseSync(COPY, { readOnly: true });

console.log('=== USER ROLE DISTRIBUTION ===');
const roles = db.prepare(
  `SELECT role, COUNT(*) AS n FROM "User" WHERE "deletedAt" IS NULL GROUP BY role ORDER BY n DESC`
).all();
for (const r of roles) console.log(`  role=${r.role}  count=${r.n}`);

console.log('\n=== ACTIVE USERS (id, role, email-masked, lastLoginAt) ===');
const users = db.prepare(
  `SELECT id, role, email, "isActive", "lastLoginAt", "createdAt"
   FROM "User" WHERE "deletedAt" IS NULL AND "isActive" = 1
   ORDER BY "lastLoginAt" DESC NULLS LAST LIMIT 12`
).all();
for (const u of users) {
  const [local, domain] = String(u.email).split('@');
  const masked = `${local.slice(0, 2)}***@${domain}`;
  console.log(`  ${u.id}  role=${u.role}  ${masked}  lastLogin=${u.lastLoginAt}`);
}

console.log('\n=== MOST RECENT SESSIONS (who is logged in now) ===');
const sess = db.prepare(
  `SELECT s."userId", u.role, s."createdAt", s."expiresAt"
   FROM "UserSession" s JOIN "User" u ON u.id = s."userId"
   ORDER BY s."createdAt" DESC LIMIT 8`
).all();
for (const s of sess) console.log(`  user=${s.userId}  role=${s.role}  created=${s.createdAt}  expires=${s.expiresAt}`);

console.log('\n=== RECENT AUDIT: any 403 / metrics access ===');
try {
  const audits = db.prepare(
    `SELECT action, COUNT(*) AS n FROM "AuditLog"
     WHERE "createdAt" >= datetime('now', '-14 days')
     GROUP BY action ORDER BY n DESC LIMIT 20`
  ).all();
  for (const a of audits) console.log(`  ${a.action}  x${a.n}`);
} catch (e) {
  console.log('  AuditLog query failed:', e.message);
}

db.close();
console.log('\n(read-only snapshot; real DB untouched)');
