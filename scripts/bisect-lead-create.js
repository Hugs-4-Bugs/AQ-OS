// Bisect which field in the route's leadData triggers PrismaClientValidationError.
// Cumulative: core + group[i]. Every successful create is deleted immediately.
const path = require('path');
process.chdir(path.join(__dirname, '..'));

async function main() {
  const { DatabaseSync } = require('node:sqlite');
  const ro = new DatabaseSync('file:./db/custom.db?mode=ro', { readOnly: true });
  const qa = ro.prepare("SELECT id FROM User WHERE email = 'qa@test.com'").get();
  ro.close();
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const core = { businessName: 'Probe Co', userId: qa.id };
  const groups = [
    ['strings', { ownerName: null, website: null, email: null, phone: null, whatsapp: null, linkedin: null, instagram: null, facebook: null, googleMapsListing: null, reviews: null, city: null, country: null, niche: null, source: null, notes: null, tags: null }],
    ['enums', { estimatedQuality: 'medium', estimatedRevenue: 'medium', stage: 'discovered', websiteQuality: 'none' }],
    ['boolsNums', { hasWebsite: false, rating: null, replyScore: 0, conversionScore: 0, urgencyScore: 0, revenuePotentialScore: 0 }],
    ['weak', { digitalWeaknesses: null, opportunityNotes: null }],
    ['best', { bestContactPerson: null, bestChannel: null, bestTiming: null, outreachStyle: null }],
  ];

  let cumulative = { ...core };
  console.log('core alone:', JSON.stringify(core));
  try {
    const l = await prisma.lead.create({ data: { ...cumulative } });
    await prisma.lead.delete({ where: { id: l.id } });
    console.log('core: OK');
  } catch (e) {
    console.log('core: FAIL —', (e.message || '').split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300));
  }

  for (const [name, fields] of groups) {
    cumulative = { ...cumulative, ...fields };
    try {
      const l = await prisma.lead.create({ data: { ...cumulative } });
      await prisma.lead.delete({ where: { id: l.id } });
      console.log(`+${name}: OK`);
    } catch (e) {
      const msg = (e.message || '');
      console.log(`+${name}: FAIL ${e.constructor.name}`);
      const lines = msg.split('\n').filter(Boolean);
      console.log('  tail:', lines.slice(-3).join(' | ').slice(0, 400));
      if (msg.includes('Unknown argument')) {
        const m = msg.match(/Unknown argument[^`]*`([^`]+)`/);
        if (m) console.log('  unknown field:', m[1]);
      }
    }
  }
  await prisma.$disconnect();
}
main();
