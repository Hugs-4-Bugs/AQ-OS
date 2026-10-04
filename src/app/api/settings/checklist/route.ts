// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Onboarding Checklist API Route
// GET /api/settings/checklist — Get onboarding checklist status
// PUT /api/settings/checklist — Update onboarding checklist items
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// GET /api/settings/checklist - Get onboarding checklist status
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    // Get onboarding progress
    let progress = await db.onboardingProgress.findUnique({
      where: { userId: user.id },
    });

    if (!progress) {
      progress = await db.onboardingProgress.create({
        data: { userId: user.id },
      });
    }

    // Get user info for profile completeness check
    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      include: { settings: true },
    });

    // Get additional context
    const [
      leadCount,
      analysisCount,
      emailAccountCount,
      telegramConfig,
      whatsappConfig,
    ] = await Promise.all([
      db.lead.count({ where: { userId: user.id, isActive: true } }),
      db.leadAnalysis.count({
        where: { lead: { userId: user.id } },
      }),
      db.emailAccount.count({ where: { userId: user.id, status: 'active' } }),
      db.telegramConfig.findFirst({ where: { userId: user.id, isConnected: true } }),
      db.whatsappConfig.findFirst({ where: { userId: user.id, isConnected: true } }),
    ]);

    // Build checklist items
    const profileComplete = !!(fullUser?.name && fullUser?.phone && fullUser?.country);
    const businessInfoComplete = !!(fullUser?.settings?.companyName && fullUser?.settings?.businessDescription);
    const nichesComplete = progress.nichesSelected;
    const countriesComplete = progress.countriesSelected;
    const channelsComplete = progress.channelsSelected;
    const toolsConnectedCheck = progress.toolsConnected ||
      emailAccountCount > 0 ||
      !!telegramConfig ||
      !!whatsappConfig;
    const firstLeadAddedCheck = progress.firstLeadAdded || leadCount > 0;
    const firstAnalysisCheck = progress.firstAnalysisRun || analysisCount > 0;

    const checklist = [
      {
        id: 'profile',
        label: 'Complete your profile',
        description: 'Add your name, phone, and country',
        completed: profileComplete,
        step: 1,
      },
      {
        id: 'business_info',
        label: 'Add business information',
        description: 'Add your company name and business description',
        completed: businessInfoComplete,
        step: 2,
      },
      {
        id: 'select_niches',
        label: 'Select target niches',
        description: 'Choose the business categories you want to target',
        completed: nichesComplete,
        step: 3,
      },
      {
        id: 'select_countries',
        label: 'Select target countries',
        description: 'Choose the countries you want to target',
        completed: countriesComplete,
        step: 4,
      },
      {
        id: 'select_channels',
        label: 'Select outreach channels',
        description: 'Choose your preferred outreach channels',
        completed: channelsComplete,
        step: 5,
      },
      {
        id: 'connect_tools',
        label: 'Connect a tool',
        description: 'Connect Gmail, Telegram, or WhatsApp',
        completed: toolsConnectedCheck,
        step: 6,
      },
      {
        id: 'first_lead',
        label: 'Add your first lead',
        description: 'Discover or manually add your first lead',
        completed: firstLeadAddedCheck,
        step: 7,
      },
      {
        id: 'first_analysis',
        label: 'Run your first analysis',
        description: 'Analyze a lead to see AI insights',
        completed: firstAnalysisCheck,
        step: 8,
      },
    ];

    const completedCount = checklist.filter((item) => item.completed).length;
    const totalCount = checklist.length;
    const completionPercentage = Math.round((completedCount / totalCount) * 100);

    return NextResponse.json({
      checklist,
      summary: {
        completedCount,
        totalCount,
        completionPercentage,
        onboardingCompleted: progress.completed,
        bonusCreditsAwarded: progress.bonusCreditsAwarded,
        currentStep: progress.currentStep,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error fetching checklist:', error);
    return NextResponse.json({ error: 'Failed to fetch checklist' }, { status: 500 });
  }
}

// PUT /api/settings/checklist - Update onboarding checklist items
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const body = await request.json();
    const { items } = body;

    if (!items || typeof items !== 'object') {
      return NextResponse.json({ error: 'Items object is required' }, { status: 400 });
    }

    // Map checklist item IDs to OnboardingProgress fields
    const fieldMap: Record<string, string> = {
      profile: 'profileCompleted',
      business_info: 'profileCompleted', // Both profile steps set profileCompleted
      select_niches: 'nichesSelected',
      select_countries: 'countriesSelected',
      select_channels: 'channelsSelected',
      connect_tools: 'toolsConnected',
      first_lead: 'firstLeadAdded',
      first_analysis: 'firstAnalysisRun',
    };

    const progressData: Record<string, unknown> = {};
    for (const [itemId, completed] of Object.entries(items)) {
      const field = fieldMap[itemId];
      if (field) {
        progressData[field] = Boolean(completed);
      }
    }

    if (Object.keys(progressData).length === 0) {
      return NextResponse.json({ error: 'No valid checklist items to update' }, { status: 400 });
    }

    // Check for completion
    const current = await db.onboardingProgress.findUnique({ where: { userId: user.id } });
    if (current) {
      const allDone =
        (progressData.profileCompleted ?? current.profileCompleted) &&
        (progressData.nichesSelected ?? current.nichesSelected) &&
        (progressData.countriesSelected ?? current.countriesSelected) &&
        (progressData.channelsSelected ?? current.channelsSelected) &&
        (progressData.toolsConnected ?? current.toolsConnected) &&
        (progressData.firstLeadAdded ?? current.firstLeadAdded) &&
        (progressData.firstAnalysisRun ?? current.firstAnalysisRun);

      if (allDone) {
        progressData.completed = true;
      }
    }

    await db.onboardingProgress.upsert({
      where: { userId: user.id },
      update: progressData,
      create: {
        userId: user.id,
        ...progressData,
      },
    });

    // Update settings onboarding status
    if (progressData.completed) {
      await db.userSettings.upsert({
        where: { userId: user.id },
        update: { onboardingCompleted: true, onboardingStep: 100 },
        create: { userId: user.id, onboardingCompleted: true, onboardingStep: 100 },
      });
    }

    // Award bonus credits if just completed
    let bonusAwarded = false;
    if (progressData.completed && current && !current.bonusCreditsAwarded) {
      await db.$transaction(async (tx) => {
        const fullUser = await tx.user.findUnique({ where: { id: user.id } });
        if (fullUser) {
          await tx.user.update({
            where: { id: user.id },
            data: { credits: fullUser.credits + 25 },
          });
          await tx.onboardingProgress.update({
            where: { userId: user.id },
            data: { bonusCreditsAwarded: true },
          });
          await tx.creditsLedger.create({
            data: {
              userId: user.id,
              action: 'onboarding_bonus',
              credits: 25,
              balance: fullUser.credits + 25,
              description: 'Onboarding completion bonus credits',
            },
          });
        }
      });
      bonusAwarded = true;
    }

    // Audit log
    const completedItems = Object.entries(items)
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    if (progressData.completed) {
      await logAuthEvent({
        userId: user.id,
        action: 'onboarding_completed',
        details: JSON.stringify({ completedItems, bonusAwarded }),
        ipAddress: ip,
        userAgent: ua,
        resource: 'onboarding',
        resourceId: user.id,
      });
    } else if (completedItems.length > 0) {
      await logAuthEvent({
        userId: user.id,
        action: 'onboarding_step_completed',
        details: JSON.stringify({ completedItems }),
        ipAddress: ip,
        userAgent: ua,
        resource: 'onboarding',
        resourceId: user.id,
      });
    }

    return NextResponse.json({ success: true, bonusAwarded });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error updating checklist:', error);
    return NextResponse.json({ error: 'Failed to update checklist' }, { status: 500 });
  }
}
