import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { fireWorkflowTrigger } from '@/lib/workflow-triggers';

/** POST /api/workflows/trigger — Fire a workflow trigger */
export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json();
      const { triggerType, triggerData } = body;

      if (!triggerType) {
        return NextResponse.json({ error: 'triggerType is required' }, { status: 400 });
      }

      const result = await fireWorkflowTrigger(triggerType, triggerData || {}, user.id);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to fire trigger' }, { status: 500 });
    }
  });
}
