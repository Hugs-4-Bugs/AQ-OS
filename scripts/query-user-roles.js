// READ-ONLY: user role distribution + recent users
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });
const roles = db.prepare(`SELECT role, COUNT(*) as n FROM User GROUP BY role`).all();
console.log('=== role distribution ===');
console.log(JSON.stringify(roles, null, 2));
const recent = db.prepare(`SELECT email, name, role, isActive, createdAt FROM User ORDER BY createdAt DESC LIMIT 8`).all();
console.log('=== recent users (email/name PII minimised) ===');
console.log(JSON.stringify(recent.map(u => ({
  emailDomain: String(u.email).split('@')[1] || 'unknown',
  emailHash: require('crypto').createHash('sha256').update(String(u.email)).digest('hex').slice(0, 8),
  name: u.name ? '<present>' : null,
  role: u.role,
  isActive: u.isActive,
})), null, 2));
db.close();
