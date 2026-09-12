import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const leads = await db.lead.findMany({
        where: { userId: user.id, isActive: true },
        select: { email: true, phone: true, niche: true, country: true, stage: true, replyScore: true, conversionScore: true },
      });

      const totalLeads = leads.length;
      const withEmail = leads.filter(l => l.email).length;
      const withPhone = leads.filter(l => l.phone).length;
      const withNiche = leads.filter(l => l.niche).length;
      const withCountry = leads.filter(l => l.country).length;
      const withScores = leads.filter(l => l.replyScore > 0 && l.conversionScore > 0).length;

      const emailCompleteness = totalLeads > 0 ? Math.round((withEmail / totalLeads) * 100) : 0;
      const phoneCompleteness = totalLeads > 0 ? Math.round((withPhone / totalLeads) * 100) : 0;
      const nicheCompleteness = totalLeads > 0 ? Math.round((withNiche / totalLeads) * 100) : 0;
      const countryCompleteness = totalLeads > 0 ? Math.round((withCountry / totalLeads) * 100) : 0;
      const scoreCompleteness = totalLeads > 0 ? Math.round((withScores / totalLeads) * 100) : 0;
      const overallScore = totalLeads > 0 ? Math.round((emailCompleteness + phoneCompleteness + nicheCompleteness + countryCompleteness + scoreCompleteness) / 5) : 0;

      const duplicateEmails = leads.filter(l => l.email).reduce((acc, l) => { acc[l.email!] = (acc[l.email!] || 0) + 1; return acc; }, {} as Record<string, number>);
      const duplicateCount = Object.values(duplicateEmails).filter(c => c > 1).length;

      const missingFields = [
        { field: 'Email', count: totalLeads - withEmail },
        { field: 'Phone', count: totalLeads - withPhone },
        { field: 'Niche', count: totalLeads - withNiche },
        { field: 'Country', count: totalLeads - withCountry },
        { field: 'Scores', count: totalLeads - withScores },
      ].filter(f => f.count > 0);

      return NextResponse.json({
        data: {
          overallScore,
          totalRecords: totalLeads,
          completeness: {
            email: emailCompleteness,
            phone: phoneCompleteness,
            niche: nicheCompleteness,
            country: countryCompleteness,
            scores: scoreCompleteness,
          },
          issues: {
            duplicates: duplicateCount,
            missingFields,
            staleRecords: 0,
          },
          fieldBreakdown: [
            { field: 'Email', filled: withEmail, total: totalLeads, percentage: emailCompleteness },
            { field: 'Phone', filled: withPhone, total: totalLeads, percentage: phoneCompleteness },
            { field: 'Niche', filled: withNiche, total: totalLeads, percentage: nicheCompleteness },
            { field: 'Country', filled: withCountry, total: totalLeads, percentage: countryCompleteness },
            { field: 'Scores', filled: withScores, total: totalLeads, percentage: scoreCompleteness },
          ],
        },
      });
    } catch (error) {
      console.error('[API] Data quality error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch data quality' }, { status: 500 });
    }
  });
}
