import { withAuth } from '@/lib/auth-middleware';
import { emailSequenceEngine } from '@/lib/email-sequence-engine';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { name, description, channel, steps } = body;

      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: 'Sequence name is required' },
          { status: 400 }
        );
      }

      if (!steps || !Array.isArray(steps) || steps.length === 0) {
        return NextResponse.json(
          { success: false, error: 'At least one step is required' },
          { status: 400 }
        );
      }

      // Validate each step
      for (const step of steps) {
        if (typeof step.order !== 'number' || step.order < 0) {
          return NextResponse.json(
            { success: false, error: `Step order must be a non-negative number` },
            { status: 400 }
          );
        }
        if (!step.channel || typeof step.channel !== 'string') {
          return NextResponse.json(
            { success: false, error: `Step ${step.order}: channel is required` },
            { status: 400 }
          );
        }
        if (!step.template || typeof step.template !== 'string') {
          return NextResponse.json(
            { success: false, error: `Step ${step.order}: template is required` },
            { status: 400 }
          );
        }
        if (typeof step.delayDays !== 'number' || step.delayDays < 0) {
          return NextResponse.json(
            { success: false, error: `Step ${step.order}: delayDays must be a non-negative number` },
            { status: 400 }
          );
        }
      }

      // Sort steps by order
      const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

      const sequence = await emailSequenceEngine.createSequence(user.id, {
        name: name.trim(),
        description,
        channel: channel || 'email',
        steps: sortedSteps,
      });

      return NextResponse.json({
        success: true,
        data: sequence,
      });
    } catch (error) {
      console.error('[Sequences/Create] Error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create sequence' },
        { status: 500 }
      );
    }
  });
}
