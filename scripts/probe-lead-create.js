// Reproduce the POST /api/leads 500: build the exact leadData the route
// builds and call db.lead.create with the app's own Prisma client, then
// delete the row (cleanup of own probe data).
const path = require('path');
process.chdir(path.join(__dirname, '..'));

async function main() {
  const { DatabaseSync } = require('node:sqlite');
  const ro = new DatabaseSync('file:./db/custom.db?mode=ro', { readOnly: true });
  const qa = ro.prepare("SELECT id FROM User WHERE email = 'qa@test.com'").get();
  ro.close();

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const body = { businessName: 'Probe Co', city: 'Testville' };
    const leadData = {
      businessName: body.businessName.trim(),
      ownerName: body.ownerName?.trim() || null,
      website: body.website?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      whatsapp: body.whatsapp?.trim() || null,
      linkedin: body.linkedin?.trim() || null,
      instagram: body.instagram?.trim() || null,
      facebook: body.facebook?.trim() || null,
      googleMapsListing: body.googleMapsListing?.trim() || null,
      reviews: body.reviews || null,
      rating: body.rating ?? null,
      estimatedQuality: body.estimatedQuality || 'medium',
      estimatedRevenue: body.estimatedRevenue || 'medium',
      city: body.city?.trim() || null,
      country: body.country?.trim() || null,
      niche: body.niche?.trim() || null,
      stage: body.stage || 'discovered',
      hasWebsite: body.hasWebsite ?? !!body.website,
      websiteQuality: body.websiteQuality || 'none',
      digitalWeaknesses: null,
      opportunityNotes: null,
      bestContactPerson: null,
      bestChannel: null,
      bestTiming: null,
      outreachStyle: null,
      source: body.source?.trim() || null,
      notes: body.notes?.trim() || null,
      tags: null,
      replyScore: 0,
      conversionScore: 0,
      urgencyScore: 0,
      revenuePotentialScore: 0,
      userId: qa.id,
    };
    const lead = await prisma.lead.create({ data: leadData });
    console.log('CREATE OK:', lead.id, lead.businessName);
    await prisma.lead.delete({ where: { id: lead.id } });
    console.log('cleanup OK');
  } catch (e) {
    console.error('CREATE FAILED:', e.constructor.name);
    console.error('code:', e.code);
    console.error('message:', e.message?.slice(0, 600));
    if (e.meta) console.error('meta:', JSON.stringify(e.meta));
  } finally {
    await prisma.$disconnect();
  }
}
main();
