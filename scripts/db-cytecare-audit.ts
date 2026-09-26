/**
 * Cytecare website bug audit — inspect actual DB record + related research
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // 1. Find Cytecare lead(s)
  const leads = await db.lead.findMany({
    where: { OR: [{ businessName: { contains: 'Cytecare' } }, { businessName: { contains: 'cytecare' } }] },
  });
  console.log('=== CYTECARE LEADS:', leads.length, '===');
  for (const l of leads) {
    console.log(JSON.stringify({
      id: l.id, businessName: l.businessName, website: l.website, hasWebsite: l.hasWebsite,
      websiteQuality: l.websiteQuality, googleMapsListing: l.googleMapsListing, source: l.source,
      userId: l.userId, orgId: l.orgId, niche: l.niche, city: l.city, country: l.country,
      stage: l.stage, email: l.email, phone: l.phone, tags: l.tags,
      techStack: l.techStack ? l.techStack.slice(0, 200) : null,
      createdAt: l.createdAt, updatedAt: l.updatedAt,
    }, null, 2));
    // Research/analysis records for this lead
    const analyses = await (db as any).leadAnalysis.findMany({ where: { leadId: l.id } }).catch(() => []);
    console.log(`--- LeadAnalysis rows: ${analyses.length}`);
    for (const a of analyses.slice(0, 3)) {
      console.log(JSON.stringify({ id: a.id, type: (a as any).type, createdAt: a.createdAt, data: String((a as any).data ?? (a as any).content ?? '').slice(0, 500) }));
    }
  }

  // 2. Global website stats
  const total = await db.lead.count();
  const withWebsite = await db.lead.count({ where: { website: { not: null } } });
  const hasWebsiteTrue = await db.lead.count({ where: { hasWebsite: true } });
  const websiteSetHasWebsiteFalse = await db.lead.count({ where: { website: { not: null }, hasWebsite: false } });
  const websiteNullHasWebsiteTrue = await db.lead.count({ where: { website: null, hasWebsite: true } });
  console.log('=== WEBSITE STATS ===');
  console.log(JSON.stringify({ total, withWebsite, hasWebsiteTrue, websiteSetHasWebsiteFalse, websiteNullHasWebsiteTrue }));

  // 3. Users + a sample of leads with/without website
  const users = await db.user.findMany({ select: { id: true, email: true } });
  console.log('=== USERS:', users.length, '===');
  console.log(users.map(u => `${u.email} ${u.id}`).join('\n'));
}

main().finally(() => db.$disconnect());
