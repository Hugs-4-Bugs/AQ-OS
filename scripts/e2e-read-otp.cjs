const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('db/custom.db', { readOnly: true });
const cols = db.prepare('PRAGMA table_info(User)').all().map((c) => c.name).filter((n) => /otp|verif/i.test(n));
console.log('cols:', cols);
const u = db.prepare(`SELECT ${cols.join(', ')} FROM User WHERE email='discover-e2e@example.com'`).get();
console.log(u);
