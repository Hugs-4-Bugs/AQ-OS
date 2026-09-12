// Cleanup: purge browser-extension noise rows from CrashReport.
// The M_ID flood ("Cannot read properties of undefined (reading 'M_ID')")
// came from chrome-extension frames and was faithfully logged by the
// crash reporter. Client+server filters now block them; this removes the
// accumulated noise (NOT user data).
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const NOISE = /(chrome-extension|moz-extension|safari-extension|safari-web-extension|edge-extension|extensions::)/i;

async function main() {
  const all = await db.crashReport.findMany({
    select: { id: true, errorMessage: true, stackTrace: true, componentName: true },
  });
  const noiseIds = all
    .filter((r) => NOISE.test(r.errorMessage || '') || NOISE.test(r.stackTrace || '') || NOISE.test(r.componentName || ''))
    .map((r) => r.id);
  if (noiseIds.length === 0) {
    console.log('No extension-noise crash rows found.');
    return;
  }
  const res = await db.crashReport.deleteMany({ where: { id: { in: noiseIds } } });
  console.log(`Deleted ${res.count} extension-noise crash rows (of ${all.length} total).`);
  const remaining = await db.crashReport.count();
  console.log(`Remaining crash reports: ${remaining}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
