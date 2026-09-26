const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('db/custom.db', { readOnly: true });
const job = db.prepare("SELECT id, status, totalFound, imported, duplicates, failed, filteredOut, resultData FROM DiscoveryJob WHERE id = ?").get(process.argv[2]);
console.log('status:', job.status, '| totalFound:', job.totalFound, '| imported:', job.imported, '| filteredOut:', job.filteredOut);
if (job.resultData) {
  const leads = JSON.parse(job.resultData);
  console.log('resultData leads:', leads.length);
  console.log(JSON.stringify(leads, null, 1).slice(0, 1500));
}
