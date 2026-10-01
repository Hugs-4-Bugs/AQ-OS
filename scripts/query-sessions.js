// READ-ONLY forensic: UserSession rememberMe distribution + recency
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/home/z/my-project/db/custom.db', { readOnly: true });

console.log('=== UserSession columns ===');
console.log(JSON.stringify(db.prepare(`PRAGMA table_info(UserSession)`).all().map(c => c.name)));

console.log('=== rememberMe distribution (all live sessions) ===');
console.log(JSON.stringify(db.prepare(
  `SELECT rememberMe, isRevoked, COUNT(*) as n FROM UserSession GROUP BY rememberMe, isRevoked`
).all(), null, 2));

console.log('=== sessions created in last 7 days by day + rememberMe ===');
// createdAt is ms epoch bigint
const week = db.prepare(`
  SELECT date(datetime(createdAt/1000, 'unixepoch')) as day, rememberMe, COUNT(*) as n
  FROM UserSession
  WHERE createdAt > (strftime('%s','now') - 7*86400) * 1000
  GROUP BY day, rememberMe ORDER BY day DESC LIMIT 30
`).all();
console.log(JSON.stringify(week, null, 2));

console.log('=== 10 most recent sessions ===');
const recent = db.prepare(`
  SELECT id, rememberMe, isRevoked,
         datetime(createdAt/1000,'unixepoch') as createdUtc,
         datetime(expiresAt/1000,'unixepoch') as expiresUtc,
         datetime(lastActivityAt/1000,'unixepoch') as lastActUtc,
         absoluteExpiresAt IS NOT NULL as hasAbsolute
  FROM UserSession ORDER BY createdAt DESC LIMIT 10
`).all();
console.log(JSON.stringify(recent, null, 2));

console.log('=== absoluteExpiresAt schema check (nullable?) ===');
console.log(JSON.stringify(db.prepare(`PRAGMA table_info(UserSession)`).all().filter(c => /absolute|lastActivity|rememberMe/i.test(c.name)).map(c => ({name: c.name, notnull: c.notnull, dflt: c.dflt_value}))));
db.close();
