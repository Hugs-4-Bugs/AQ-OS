import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.communication.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.insight.deleteMany();

  // Create sample leads
  const leads = await Promise.all([
    prisma.lead.create({
      data: {
        businessName: 'Green Leaf Bistro',
        ownerName: 'Maria Santos',
        niche: 'Restaurant',
        country: 'USA',
        city: 'Austin',
        email: 'maria@greenleafbistro.com',
        phone: '+1-512-555-0142',
        website: 'greenleafbistro.com',
        stage: 'replied',
        replyScore: 78,
        conversionScore: 65,
        urgencyScore: 72,
        revenuePotentialScore: 68,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No online ordering system', severity: 'critical' },
          { issue: 'Outdated website design', severity: 'high' },
          { issue: 'No Google Business optimization', severity: 'medium' },
        ]),
        scoreReasoning: 'Restaurant has website but no online ordering - significant revenue loss. Owner is responsive based on reply pattern. Austin market is competitive, urgency is high.',
        bestContactPerson: 'Maria Santos (Owner)',
        bestChannel: 'email',
        bestTiming: 'Tuesday-Thursday, 2-4 PM (between lunch and dinner rush)',
        outreachStyle: 'direct ROI-focused',
        opportunityNotes: 'Strong opportunity. No online ordering means they lose 30-40% of potential orders. Website looks 5+ years old. Competitor restaurants in Austin have modern sites with ordering.',
        source: 'google-maps',
        notes: 'Interested in full digital overhaul',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'Bright Smile Dental',
        ownerName: 'Dr. James Chen',
        niche: 'Dental',
        country: 'Canada',
        city: 'Toronto',
        email: 'info@brightsmile.ca',
        phone: '+1-416-555-0198',
        website: 'brightsmile.ca',
        stage: 'discussion',
        replyScore: 85,
        conversionScore: 72,
        urgencyScore: 80,
        revenuePotentialScore: 82,
        hasWebsite: true,
        websiteQuality: 'average',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No appointment booking system', severity: 'critical' },
          { issue: 'Poor SEO rankings', severity: 'high' },
          { issue: 'No patient reviews strategy', severity: 'medium' },
        ]),
        scoreReasoning: 'Dental practice with no online booking is a major gap. Toronto market demands digital-first experience. Dr. Chen is engaged and asking about scope.',
        bestContactPerson: 'Dr. James Chen (Owner)',
        bestChannel: 'whatsapp',
        bestTiming: 'Monday-Wednesday, 10 AM - 12 PM',
        outreachStyle: 'authority-positioning',
        opportunityNotes: 'Ready to move forward. Main pain: patients calling for appointments when they could book online. Losing potential patients to competitors with online booking.',
        source: 'linkedin',
        notes: 'Ready to move forward, discussing scope',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'Summit Properties',
        ownerName: 'Robert Williams',
        niche: 'Real Estate',
        country: 'UK',
        city: 'London',
        email: 'robert@summitproperties.co.uk',
        website: 'summitproperties.co.uk',
        stage: 'proposal',
        replyScore: 92,
        conversionScore: 88,
        urgencyScore: 85,
        revenuePotentialScore: 90,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No property listing integration', severity: 'critical' },
          { issue: 'No CRM system', severity: 'high' },
        ]),
        scoreReasoning: 'Real estate without property listing integration is operating at a massive disadvantage. High ticket business with strong revenue potential. Already in proposal stage.',
        bestContactPerson: 'Robert Williams (Managing Director)',
        bestChannel: 'linkedin',
        bestTiming: 'Tuesday-Thursday, 9-11 AM',
        outreachStyle: 'direct ROI-focused',
        opportunityNotes: 'Proposal sent for digital transformation package. Property listing integration + CRM will transform their operations.',
        source: 'linkedin',
        notes: 'Proposal sent for digital transformation package',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'TechStyle Fashion',
        ownerName: 'Sarah Kim',
        niche: 'E-commerce',
        country: 'USA',
        city: 'Los Angeles',
        email: 'sarah@techstylefashion.com',
        phone: '+1-310-555-0276',
        website: 'techstylefashion.com',
        stage: 'contacted',
        replyScore: 55,
        conversionScore: 40,
        urgencyScore: 45,
        revenuePotentialScore: 70,
        hasWebsite: true,
        websiteQuality: 'average',
        digitalWeaknesses: JSON.stringify([
          { issue: 'Slow mobile experience', severity: 'high' },
          { issue: 'Poor checkout flow', severity: 'critical' },
        ]),
        scoreReasoning: 'E-commerce with poor checkout = lost sales daily. Medium urgency since they are generating some revenue. LA market is competitive.',
        bestContactPerson: 'Sarah Kim (Founder)',
        bestChannel: 'email',
        bestTiming: 'Monday, 10 AM - 1 PM',
        outreachStyle: 'problem-awareness',
        source: 'instagram',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'FitZone Gym',
        ownerName: 'Mike Thompson',
        niche: 'Gym',
        country: 'Australia',
        city: 'Sydney',
        email: 'mike@fitzone.com.au',
        phone: '+61-2-5555-0143',
        stage: 'discovered',
        replyScore: 42,
        conversionScore: 30,
        urgencyScore: 35,
        revenuePotentialScore: 50,
        hasWebsite: false,
        websiteQuality: 'none',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No website at all', severity: 'critical' },
          { issue: 'No social media presence', severity: 'high' },
        ]),
        scoreReasoning: 'Gym with no website or social media presence is missing huge opportunity. Lower revenue potential but easy sell. Sydney fitness market is growing.',
        bestContactPerson: 'Mike Thompson (Owner)',
        bestChannel: 'whatsapp',
        bestTiming: 'Early morning or late evening (gym owner schedule)',
        outreachStyle: 'casual relationship-building',
        source: 'google-maps',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'Luxe Hair Studio',
        ownerName: 'Aisha Patel',
        niche: 'Salon',
        country: 'UAE',
        city: 'Dubai',
        email: 'aisha@luxehair.ae',
        phone: '+971-50-555-0189',
        website: 'luxehair.ae',
        stage: 'analyzed',
        replyScore: 68,
        conversionScore: 55,
        urgencyScore: 55,
        revenuePotentialScore: 75,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No booking system', severity: 'critical' },
          { issue: 'Instagram not optimized', severity: 'medium' },
        ]),
        scoreReasoning: 'Dubai salon market is premium and competitive. No booking system means lost appointments daily. Instagram presence exists but underperforming.',
        bestContactPerson: 'Aisha Patel (Owner)',
        bestChannel: 'instagram',
        bestTiming: 'Sunday-Thursday, 11 AM - 1 PM',
        outreachStyle: 'authority-positioning',
        source: 'instagram',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'Baker & Associates',
        ownerName: 'David Baker',
        niche: 'Legal',
        country: 'USA',
        city: 'New York',
        email: 'david@bakerlaw.com',
        phone: '+1-212-555-0334',
        website: 'bakerlaw.com',
        stage: 'negotiation',
        replyScore: 95,
        conversionScore: 90,
        urgencyScore: 88,
        revenuePotentialScore: 92,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'Outdated branding', severity: 'high' },
          { issue: 'No client portal', severity: 'critical' },
        ]),
        scoreReasoning: 'Law firm in NYC with outdated brand and no client portal is leaving money on the table. High conversion probability - they are already in negotiation. Premium client.',
        bestContactPerson: 'David Baker (Senior Partner)',
        bestChannel: 'email',
        bestTiming: 'Tuesday-Thursday, 9-11 AM',
        outreachStyle: 'direct ROI-focused',
        opportunityNotes: 'Negotiating final terms for complete rebrand + digital portal. Very close to closing.',
        source: 'linkedin',
        notes: 'Negotiating final terms for complete rebrand + digital',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'AutoPro Service',
        ownerName: 'Carlos Mendez',
        niche: 'Automotive',
        country: 'India',
        city: 'Mumbai',
        email: 'carlos@autopro.in',
        stage: 'lost',
        replyScore: 30,
        conversionScore: 15,
        urgencyScore: 20,
        revenuePotentialScore: 35,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'Basic website needs work', severity: 'medium' },
        ]),
        scoreReasoning: 'Lost to competitor. Low scores across the board. Went with cheaper option.',
        source: 'google-maps',
        notes: 'Went with a competitor',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'MediCare Plus',
        ownerName: 'Dr. Lisa Park',
        niche: 'Healthcare',
        country: 'India',
        city: 'Delhi',
        email: 'lisa@medicareplus.in',
        stage: 'won',
        replyScore: 98,
        conversionScore: 95,
        urgencyScore: 90,
        revenuePotentialScore: 95,
        hasWebsite: true,
        websiteQuality: 'good',
        digitalWeaknesses: JSON.stringify([]),
        scoreReasoning: 'Won deal. Full digital package signed. Premium client in healthcare sector.',
        source: 'linkedin',
        notes: 'Signed contract for full digital package - ₹35L',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'BuildRight Construction',
        ownerName: 'Tom Hardy',
        niche: 'Construction',
        country: 'USA',
        city: 'Dallas',
        email: 'tom@buildright.com',
        phone: '+1-214-555-0456',
        website: 'buildright.com',
        stage: 'contacted',
        replyScore: 50,
        conversionScore: 35,
        urgencyScore: 40,
        revenuePotentialScore: 65,
        hasWebsite: true,
        websiteQuality: 'average',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No project portfolio showcase', severity: 'high' },
          { issue: 'Poor local SEO', severity: 'medium' },
        ]),
        scoreReasoning: 'Construction company without portfolio showcase is missing key sales tool. Medium urgency but good revenue potential in Dallas market.',
        bestContactPerson: 'Tom Hardy (Owner)',
        bestChannel: 'email',
        bestTiming: 'Monday-Thursday, 8-10 AM',
        outreachStyle: 'problem-awareness',
        source: 'google-maps',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'EduLearn Academy',
        ownerName: 'Prof. Alan Green',
        niche: 'Education',
        country: 'India',
        city: 'Mumbai',
        email: 'alan@edulearn.in',
        stage: 'replied',
        replyScore: 72,
        conversionScore: 60,
        urgencyScore: 70,
        revenuePotentialScore: 65,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No LMS integration', severity: 'critical' },
          { issue: 'Poor mobile experience', severity: 'high' },
        ]),
        scoreReasoning: 'Education without LMS is behind the curve post-COVID. High urgency as online learning is expected now. Mumbai market has high demand.',
        bestContactPerson: 'Prof. Alan Green (Director)',
        bestChannel: 'whatsapp',
        bestTiming: 'Monday-Friday, 4-6 PM',
        outreachStyle: 'authority-positioning',
        source: 'google-maps',
      },
    }),
    prisma.lead.create({
      data: {
        businessName: 'Seaside Resort',
        ownerName: 'Emma Laurent',
        niche: 'Hotel',
        country: 'UAE',
        city: 'Abu Dhabi',
        email: 'emma@seasideresort.ae',
        website: 'seasideresort.ae',
        stage: 'analyzed',
        replyScore: 60,
        conversionScore: 45,
        urgencyScore: 50,
        revenuePotentialScore: 80,
        hasWebsite: true,
        websiteQuality: 'poor',
        digitalWeaknesses: JSON.stringify([
          { issue: 'No online booking engine', severity: 'critical' },
          { issue: 'Poor review management', severity: 'medium' },
        ]),
        scoreReasoning: 'Hotel without online booking is losing direct bookings and paying OTA commissions. High revenue potential in UAE hospitality market.',
        bestContactPerson: 'Emma Laurent (General Manager)',
        bestChannel: 'email',
        bestTiming: 'Sunday-Thursday, 10 AM - 12 PM',
        outreachStyle: 'direct ROI-focused',
        source: 'google-maps',
      },
    }),
  ]);

  console.log(`✅ Created ${leads.length} leads`);

  // Create sample communications
  const communications = await Promise.all([
    prisma.communication.create({
      data: {
        leadId: leads[0].id,
        channel: 'email',
        direction: 'outbound',
        content: 'Hi Maria, I noticed your restaurant doesn\'t have online ordering. We can help set that up and boost your revenue by 30%.',
        messageGeneratedByAI: true,
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[0].id,
        channel: 'email',
        direction: 'inbound',
        content: 'That sounds interesting! Can you tell me more about the costs and timeline?',
        intent: 'interested',
        buyingSignals: JSON.stringify(['Asking about pricing', 'Asking about timeline', 'Expressed interest']),
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[1].id,
        channel: 'linkedin',
        direction: 'outbound',
        content: 'Dr. Chen, I see your dental practice could benefit from an online booking system. Would you like a free consultation?',
        messageGeneratedByAI: true,
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[1].id,
        channel: 'whatsapp',
        direction: 'inbound',
        content: 'Yes, I\'ve been thinking about this. Let\'s schedule a call.',
        intent: 'interested',
        buyingSignals: JSON.stringify(['Wants to schedule call', 'Already considering solution']),
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[6].id,
        channel: 'email',
        direction: 'outbound',
        content: 'David, attached is the revised proposal with the adjusted pricing we discussed.',
        messageGeneratedByAI: false,
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[6].id,
        channel: 'email',
        direction: 'inbound',
        content: 'The proposal looks good. Let me review with my partners and get back to you by Friday.',
        intent: 'interested',
        buyingSignals: JSON.stringify(['Proposal looks good', 'Will respond with decision', 'Has partners involved']),
        hesitationReasons: JSON.stringify(['Needs partner approval', 'Timing delay']),
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[10].id,
        channel: 'whatsapp',
        direction: 'outbound',
        content: 'Hi Prof. Green, I noticed EduLearn Academy doesn\'t have an online learning platform. We build LMS solutions for education institutes - would love to show you how we can help.',
        messageGeneratedByAI: true,
      },
    }),
    prisma.communication.create({
      data: {
        leadId: leads[10].id,
        channel: 'whatsapp',
        direction: 'inbound',
        content: 'Yes, we have been looking into this. What\'s the typical cost and timeline for an LMS setup?',
        intent: 'interested',
        buyingSignals: JSON.stringify(['Actively looking for LMS', 'Asking about pricing', 'Asking about timeline']),
      },
    }),
  ]);

  console.log(`✅ Created ${communications.length} communications`);

  // Create sample deals
  const deals = await Promise.all([
    prisma.deal.create({
      data: {
        leadId: leads[2].id,
        projectType: 'Full Digital Transformation',
        projectScope: JSON.stringify({
          items: ['Website redesign', 'CRM integration', 'Property listing portal', 'SEO optimization'],
        }),
        proposedPrice: 35000,
        currency: 'GBP',
        status: 'sent',
        proposalContent: '# Digital Transformation Proposal\n\n## Prepared for: Summit Properties\n\n### Executive Summary\nWe propose a complete digital transformation including website redesign, CRM integration, and property listing portal.\n\n### Investment\n**£35,000**\n\n### Timeline\n- Phase 1 (Weeks 1-2): Discovery & Planning\n- Phase 2 (Weeks 3-6): Development\n- Phase 3 (Weeks 7-8): Testing & Launch',
      },
    }),
    prisma.deal.create({
      data: {
        leadId: leads[6].id,
        projectType: 'Rebrand + Client Portal',
        projectScope: JSON.stringify({
          items: ['Complete rebranding', 'Client portal development', 'Document management system'],
        }),
        proposedPrice: 52000,
        currency: 'USD',
        status: 'negotiating',
        proposalContent: '# Rebranding & Client Portal Proposal\n\n## Prepared for: Baker & Associates\n\n### Executive Summary\nComplete rebrand and client portal development for modern law firm.\n\n### Investment\n**$52,000**',
      },
    }),
    prisma.deal.create({
      data: {
        leadId: leads[8].id,
        projectType: 'Full Digital Package',
        projectScope: JSON.stringify({
          items: ['Website', 'Patient portal', 'Appointment system', 'SEO', 'Social media'],
        }),
        proposedPrice: 3500000,
        currency: 'INR',
        finalPrice: 3500000,
        status: 'accepted',
        proposalContent: '# Digital Package Proposal\n\n## Prepared for: MediCare Plus\n\n### Executive Summary\nFull digital transformation for healthcare practice.\n\n### Investment\n**₹35,00,000**',
      },
    }),
  ]);

  console.log(`✅ Created ${deals.length} deals`);

  // Create insights
  const insights = await Promise.all([
    prisma.insight.create({
      data: {
        type: 'recommendation',
        content: 'Follow up with Baker & Associates - they are in negotiation and close to closing',
      },
    }),
    prisma.insight.create({
      data: {
        type: 'recommendation',
        content: 'Healthcare niche has best conversion - focus discovery there',
      },
    }),
    prisma.insight.create({
      data: {
        type: 'recommendation',
        content: 'WhatsApp shows highest response rate in Indian market',
      },
    }),
    prisma.insight.create({
      data: {
        type: 'best-channel',
        content: 'LinkedIn works best for legal and real estate niches',
        data: JSON.stringify({ channel: 'linkedin', niches: ['Legal', 'Real Estate'] }),
      },
    }),
  ]);

  console.log(`✅ Created ${insights.length} insights`);
  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
