import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;
      const { searchParams } = new URL(request.url);
      const period = searchParams.get('period') || '7d';

      // Get leads with scoring data
      const leads = await db.lead.findMany({
        where: { userId, isActive: true, deletedAt: null },
        select: {
          id: true,
          businessName: true,
          replyScore: true,
          conversionScore: true,
          urgencyScore: true,
          revenuePotentialScore: true,
          lastContactedAt: true,
          createdAt: true,
          emailStatus: true,
          stage: true,
        },
        orderBy: { replyScore: 'desc' },
      });

      // Get outreach messages for activity data
      const messages = await db.outreachMessage.findMany({
        where: { userId, lead: { userId } },
        select: { status: true, channel: true, createdAt: true },
      });

      // Calculate overall engagement score
      const avgReply = leads.length > 0 ? leads.reduce((s, l) => s + (l.replyScore || 0), 0) / leads.length : 0;
      const avgConversion = leads.length > 0 ? leads.reduce((s, l) => s + (l.conversionScore || 0), 0) / leads.length : 0;
      const avgUrgency = leads.length > 0 ? leads.reduce((s, l) => s + (l.urgencyScore || 0), 0) / leads.length : 0;
      const overallScore = Math.round((avgReply + avgConversion + avgUrgency) / 3);

      // Top leads by engagement
      const topLeads = leads.slice(0, 5).map(lead => ({
        id: lead.id,
        name: lead.businessName,
        score: Math.round((lead.replyScore + lead.conversionScore + lead.urgencyScore) / 3),
        lastActivity: lead.lastContactedAt ? getRelativeTime(lead.lastContactedAt) : 'Never',
        interactions: messages.filter(m => m.status === 'sent' || m.status === 'delivered').length,
      }));

      // Engagement categories
      const emailOpens = messages.filter(m => m.status === 'opened').length;
      const linkClicks = messages.filter(m => m.status === 'delivered').length;
      const replies = messages.filter(m => m.status === 'replied').length;
      const totalInteractions = emailOpens + linkClicks + replies || 1;

      const emailOpensPct = Math.round((emailOpens / totalInteractions) * 100);
      const linkClicksPct = Math.round((linkClicks / totalInteractions) * 100);
      const repliesPct = Math.round((replies / totalInteractions) * 100);

      const categories = [
        { label: 'Email Opens', value: emailOpensPct, color: '#3b82f6' },
        { label: 'Link Clicks', value: linkClicksPct, color: '#8b5cf6' },
        { label: 'Replies', value: repliesPct, color: '#10b981' },
      ];

      // Recommendations based on lead data
      const recommendations: Array<{ id: string; lead: string; suggestion: string; priority: 'high' | 'medium' | 'low'; reason: string }> = [];
      const lowEngagementLeads = leads.filter(l => (l.replyScore || 0) < 30 && l.stage !== 'won');
      if (lowEngagementLeads.length > 0) {
        recommendations.push({
          id: 'r1',
          lead: lowEngagementLeads[0].businessName,
          suggestion: 'Send a personalized follow-up to re-engage this lead',
          priority: 'high' as const,
          reason: 'Low engagement score with declining activity',
        });
      }

      const mediumLeads = leads.filter(l => (l.replyScore || 0) >= 30 && (l.replyScore || 0) < 60);
      if (mediumLeads.length > 0) {
        recommendations.push({
          id: 'r2',
          lead: mediumLeads[0].businessName,
          suggestion: 'Schedule a discovery call — showing moderate interest signals',
          priority: 'medium' as const,
          reason: 'Moderate engagement with potential for conversion',
        });
      }

      const highLeads = leads.filter(l => (l.replyScore || 0) >= 60 && l.stage !== 'won');
      if (highLeads.length > 0) {
        recommendations.push({
          id: 'r3',
          lead: highLeads[0].businessName,
          suggestion: 'Move to proposal stage — strong engagement signals detected',
          priority: 'low' as const,
          reason: 'High engagement score across multiple channels',
        });
      }

      if (recommendations.length === 0) {
        recommendations.push({
          id: 'r1',
          lead: 'No leads yet',
          suggestion: 'Start by discovering leads to generate engagement data',
          priority: 'low' as const,
          reason: 'Insufficient data for recommendations',
        });
      }

      // Generate heatmap
      const heatmap = generateHeatmap(messages);

      const data = {
        overallScore,
        leads: topLeads,
        categories,
        recommendations,
        heatmap,
      };

      return NextResponse.json({ data });
    } catch (error) {
      console.error('[API] Engagement scores error:', error);
      return NextResponse.json({ data: null, error: 'Failed to fetch engagement scores' }, { status: 500 });
    }
  });
}

function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function generateHeatmap(messages: { createdAt: Date }[]): number[][] {
  // Default 7x4 heatmap (days x time slots)
  const heatmap: number[][] = Array.from({ length: 7 }, () => [0, 0, 0, 0]);

  messages.forEach(msg => {
    const date = new Date(msg.createdAt);
    const day = date.getDay();
    const hour = date.getHours();
    const dayIndex = day === 0 ? 6 : day - 1; // Mon=0, Sun=6
    let timeSlot = 0;
    if (hour >= 6 && hour < 12) timeSlot = 0; // Morning
    else if (hour >= 12 && hour < 17) timeSlot = 1; // Afternoon
    else if (hour >= 17 && hour < 21) timeSlot = 2; // Evening
    else timeSlot = 3; // Night
    heatmap[dayIndex][timeSlot]++;
  });

  // No messages = empty heatmap

  return heatmap;
}
