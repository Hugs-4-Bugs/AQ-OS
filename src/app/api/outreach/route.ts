import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/auth-middleware';
import type { AuthUser } from '@/lib/auth';

// GET /api/outreach - List all outreach sequences (campaigns) for the authenticated user
export async function GET(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');

      // Build where clause
      const where: Record<string, unknown> = { userId: user.id };
      if (status) {
        where.status = status;
      }

      // Fetch sequences with their steps and enrollment counts
      const sequences = await db.outreachSequence.findMany({
        where,
        include: {
          sequenceSteps: {
            orderBy: { order: 'asc' },
          },
          enrollments: {
            select: {
              id: true,
              status: true,
              currentStep: true,
            },
          },
          _count: {
            select: { enrollments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Compute campaign stats from enrollment and message data
      const campaignsWithStats = await Promise.all(
        sequences.map(async (seq) => {
          // Count total leads enrolled
          const leadsCount = seq._count.enrollments;

          // Count sent messages (outreach messages linked to this sequence's steps)
          const sentCount = await db.outreachMessage.count({
            where: {
              sequenceStepId: { in: seq.sequenceSteps.map((s) => s.id) },
              status: { in: ['sent', 'delivered', 'opened', 'replied'] },
            },
          });

          // Count replies (messages with replied status)
          const replyCount = await db.outreachMessage.count({
            where: {
              sequenceStepId: { in: seq.sequenceSteps.map((s) => s.id) },
              status: 'replied',
            },
          });

          const replyRate = sentCount > 0 ? Math.round((replyCount / sentCount) * 100) : 0;

          // Extract metadata from the steps JSON if available
          // The sequence has a `steps` JSON field that may contain niche/country/templateId
          let niche = '';
          let country = '';
          let templateId = '';
          try {
            const stepsData = JSON.parse(seq.steps || '[]');
            if (Array.isArray(stepsData) && stepsData.length > 0) {
              const firstStep = stepsData[0] as Record<string, unknown>;
              niche = (firstStep.niche as string) || '';
              country = (firstStep.country as string) || '';
              templateId = (firstStep.templateId as string) || '';
            }
          } catch {
            // steps JSON parse failed, use defaults
          }

          // Map DB status to frontend status
          // DB: draft, active, paused, completed → Frontend: active, paused, completed
          let mappedStatus: 'active' | 'paused' | 'completed';
          switch (seq.status) {
            case 'active':
              mappedStatus = 'active';
              break;
            case 'paused':
              mappedStatus = 'paused';
              break;
            case 'completed':
              mappedStatus = 'completed';
              break;
            default:
              // draft maps to active (new campaigns show as active once they have enrollments)
              mappedStatus = leadsCount > 0 ? 'active' : 'active';
              break;
          }

          return {
            id: seq.id,
            name: seq.name,
            description: seq.description,
            status: mappedStatus,
            niche,
            country,
            templateId,
            channel: seq.channel,
            leadsCount,
            sentCount,
            replyCount,
            replyRate,
            steps: seq.sequenceSteps.map((step) => ({
              id: step.id,
              order: step.order,
              channel: step.channel,
              subject: step.subject,
              template: step.template,
              delayDays: step.delayDays,
              delayHours: step.delayHours,
            })),
            enrollmentCount: leadsCount,
            createdAt: seq.createdAt.toISOString(),
            updatedAt: seq.updatedAt.toISOString(),
          };
        })
      );

      // Compute aggregate stats
      const totalLeads = campaignsWithStats.reduce((sum, c) => sum + c.leadsCount, 0);
      const totalSent = campaignsWithStats.reduce((sum, c) => sum + c.sentCount, 0);
      const totalReplies = campaignsWithStats.reduce((sum, c) => sum + c.replyCount, 0);
      const avgReplyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;
      const activeCampaigns = campaignsWithStats.filter((c) => c.status === 'active').length;

      return NextResponse.json({
        campaigns: campaignsWithStats,
        stats: {
          totalLeads,
          totalSent,
          totalReplies,
          avgReplyRate,
          activeCampaigns,
          totalCampaigns: campaignsWithStats.length,
        },
      });
    } catch (error) {
      console.error('Error fetching outreach sequences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch outreach sequences' },
        { status: 500 }
      );
    }
  });
}

// POST /api/outreach - Create a new outreach sequence (campaign)
export async function POST(request: NextRequest) {
  return withAuth(request, async (user: AuthUser) => {
    try {
      const body = await request.json();

      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json(
          { error: 'Campaign name is required' },
          { status: 400 }
        );
      }

      const sequence = await db.outreachSequence.create({
        data: {
          userId: user.id,
          name: body.name.trim(),
          description: body.description?.trim() || null,
          status: 'draft',
          channel: body.channel || 'email',
          steps: JSON.stringify(body.steps || []),
        },
      });

      // Create sequence steps if provided
      if (Array.isArray(body.steps) && body.steps.length > 0) {
        await db.sequenceStep.createMany({
          data: body.steps.map(
            (step: { channel: string; subject?: string; template: string; delayDays?: number; delayHours?: number }, index: number) => ({
              sequenceId: sequence.id,
              order: index,
              channel: step.channel || 'email',
              subject: step.subject || null,
              template: step.template || '',
              delayDays: step.delayDays ?? 1,
              delayHours: step.delayHours ?? 0,
            })
          ),
        });
      }

      // Fetch the created sequence with steps
      const created = await db.outreachSequence.findUnique({
        where: { id: sequence.id },
        include: {
          sequenceSteps: { orderBy: { order: 'asc' } },
          enrollments: { select: { id: true, status: true, currentStep: true } },
          _count: { select: { enrollments: true } },
        },
      });

      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      console.error('Error creating outreach sequence:', error);
      return NextResponse.json(
        { error: 'Failed to create outreach sequence' },
        { status: 500 }
      );
    }
  });
}
