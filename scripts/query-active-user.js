// READ-ONLY: identify roles of recent active users (emails hashed, no PII)
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });

const h = (s) => (s ? crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 10) : null);

console.log('=== the user active in recent AuditLog (pipeline, refresh) ===');
const active = db.prepare(`
  SELECT u.id, u.email, u.role, u.isActive,
         (SELECT COUNT(*) FROM UserSession s WHERE s.userId = u.id AND s.isRevoked = 0) as liveSessions
  FROM User u WHERE u.id = 'cmqrtgnjx0000qfgnsbhzyzxq'
`).all();
console.log(JSON.stringify(active.map(u => ({ ...u, email: h(u.email) })), null, 2));

console.log('=== the super_admin account ===');
const sa = db.prepare(`SELECT id, email, role, isActive, lastLoginAt FROM User WHERE role = 'super_admin'`).all();
console.log(JSON.stringify(sa.map(u => ({ id: u.id, email: h(u.email), role: u.role, isActive: u.isActive, lastLoginAt: u.lastLoginAt })), null, 2));

console.log('=== recent AuditLog actions by resource=auth/other (last 2h) ===');
const acts = db.prepare(`
  SELECT a.action, a.resource, u.role, datetime(a.createdAt/1000,'unixepoch') as utc
  FROM AuditLog a LEFT JOIN User u ON u.id = a.userId
  WHERE a.createdAt > (strftime('%s','now') - 7200) * 1000
  ORDER BY a.createdAt DESC LIMIT 20
`).all();
console.log(JSON.stringify(acts, null, 2));
db.close();
