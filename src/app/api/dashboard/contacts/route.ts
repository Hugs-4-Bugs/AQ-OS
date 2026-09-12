import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

function computeStrength(lastContactedAt: Date | null, score: number): 'strong' | 'medium' | 'new' | 'cold' {
  if (!lastContactedAt) return 'cold';
  const daysSince = Math.floor((Date.now() - lastContactedAt.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 3 && score > 60) return 'strong';
  if (daysSince <= 7 && score > 40) return 'medium';
  if (daysSince <= 14) return 'new';
  return 'cold';
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const leads = await db.lead.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        select: {
          id: true,
          businessName: true,
          ownerName: true,
          lastContactedAt: true,
          conversionScore: true,
          replyScore: true,
          city: true,
          country: true,
          niche: true,
          stage: true,
          deals: {
            select: {
              proposedPrice: true,
              finalPrice: true,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { conversionScore: 'desc' },
        take: 50,
      });

      const contacts = leads.map((lead, index) => {
        const score = Math.round(lead.conversionScore ?? lead.replyScore ?? 0);
        const strength = computeStrength(lead.lastContactedAt, score);
        const dealValue = lead.deals[0]?.finalPrice ?? lead.deals[0]?.proposedPrice ?? 0;

        // Calculate deterministic position for visualization
        const angle = (index * 37) % 360;
        const distanceRanges: Record<string, [number, number]> = {
          strong: [70, 95],
          medium: [105, 125],
          new: [130, 150],
          cold: [155, 170],
        };
        const range = distanceRanges[strength];
        const distance = range[0] + ((index * 23) % 100) / 100 * (range[1] - range[0]);

        // Size based on score
        const size = Math.max(18, Math.min(36, score / 3 + 10));

        // Sparkline data based on score trends
        const base = Math.max(5, score - 30);
        const sparkline = [base, base + 5, base + 10, score].map(Math.round);

        // Format last contact
        let lastContact = 'Never';
        if (lead.lastContactedAt) {
          const days = Math.floor((Date.now() - lead.lastContactedAt.getTime()) / (1000 * 60 * 60 * 24));
          if (days === 0) lastContact = 'Today';
          else if (days === 1) lastContact = 'Yesterday';
          else if (days < 7) lastContact = `${days} days ago`;
          else if (days < 30) lastContact = `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
          else lastContact = `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`;
        }

        return {
          id: lead.id,
          name: lead.ownerName ?? lead.businessName,
          role: lead.niche ?? 'Contact',
          company: lead.businessName,
          lastContact,
          score,
          strength,
          dealValue,
          sparkline,
          angle,
          distance,
          size,
        };
      });

      return NextResponse.json({ data: contacts });
    } catch (error) {
      console.error('[API] Error fetching contacts:', error);
      return NextResponse.json(
        { data: [], error: 'Failed to fetch contacts' },
        { status: 500 }
      );
    }
  });
}
