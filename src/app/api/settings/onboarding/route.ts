// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Settings: Onboarding Progress API Route
// GET /api/settings/onboarding — Get onboarding progress
// PUT /api/settings/onboarding — Update onboarding progress
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';

// GET /api/settings/onboarding - Get onboarding progress
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    let progress = await db.onboardingProgress.findUnique({
      where: { userId: user.id },
    });

    // Create default progress if it doesn't exist
    if (!progress) {
      progress = await db.onboardingProgress.create({
        data: { userId: user.id },
      });
    }

    // Also get user settings for onboarding-related data
    const settings = await db.userSettings.findUnique({
      where: { userId: user.id },
    });

    // Parse the data JSON field
    let parsedData = {};
    try {
      parsedData = progress.data ? JSON.parse(progress.data) : {};
    } catch {
      parsedData = {};
    }

    return NextResponse.json({
      progress: {
        currentStep: progress.currentStep,
        completed: progress.completed,
        profileCompleted: progress.profileCompleted,
        nichesSelected: progress.nichesSelected,
        countriesSelected: progress.countriesSelected,
        channelsSelected: progress.channelsSelected,
        toolsConnected: progress.toolsConnected,
        firstLeadAdded: progress.firstLeadAdded,
        firstAnalysisRun: progress.firstAnalysisRun,
        bonusCreditsAwarded: progress.bonusCreditsAwarded,
        data: parsedData,
      },
      settings: settings
        ? {
            onboardingCompleted: settings.onboardingCompleted,
            onboardingStep: settings.onboardingStep,
            targetNiches: JSON.parse(settings.targetNiches || '[]'),
            targetCountries: JSON.parse(settings.targetCountries || '[]'),
            targetChannels: JSON.parse(settings.targetChannels || '[]'),
          }
        : null,
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error fetching onboarding progress:', error);
    return NextResponse.json({ error: 'Failed to fetch onboarding progress' }, { status: 500 });
  }
}

// PUT /api/settings/onboarding - Update onboarding progress
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);

    const body = await request.json();
    const {
      currentStep,
      profileCompleted,
      nichesSelected,
      countriesSelected,
      channelsSelected,
      toolsConnected,
      firstLeadAdded,
      firstAnalysisRun,
      completed,
      // Settings-level onboarding data
      targetNiches,
      targetCountries,
      targetChannels,
      companyName,
      businessDescription,
      timezone,
      preferredCurrency,
      data,
    } = body;

    // Update onboarding progress
    const progressData: Record<string, unknown> = {};
    if (currentStep !== undefined) progressData.currentStep = Math.max(0, Math.min(currentStep, 100));
    if (profileCompleted !== undefined) progressData.profileCompleted = Boolean(profileCompleted);
    if (nichesSelected !== undefined) progressData.nichesSelected = Boolean(nichesSelected);
    if (countriesSelected !== undefined) progressData.countriesSelected = Boolean(countriesSelected);
    if (channelsSelected !== undefined) progressData.channelsSelected = Boolean(channelsSelected);
    if (toolsConnected !== undefined) progressData.toolsConnected = Boolean(toolsConnected);
    if (firstLeadAdded !== undefined) progressData.firstLeadAdded = Boolean(firstLeadAdded);
    if (firstAnalysisRun !== undefined) progressData.firstAnalysisRun = Boolean(firstAnalysisRun);
    if (data !== undefined) progressData.data = JSON.stringify(data);

    // Check if onboarding is now complete
    const currentProgress = await db.onboardingProgress.findUnique({ where: { userId: user.id } });
    if (currentProgress) {
      const allStepsComplete =
        (profileCompleted ?? currentProgress.profileCompleted) &&
        (nichesSelected ?? currentProgress.nichesSelected) &&
        (countriesSelected ?? currentProgress.countriesSelected) &&
        (channelsSelected ?? currentProgress.channelsSelected);

      if (allStepsComplete || completed) {
        progressData.completed = true;
      }
    }

    if (Object.keys(progressData).length > 0 || !currentProgress) {
      await db.onboardingProgress.upsert({
        where: { userId: user.id },
        update: progressData,
        create: {
          userId: user.id,
          ...progressData,
        },
      });
    }

    // Update user settings onboarding data
    const settingsData: Record<string, unknown> = {};
    if (targetNiches !== undefined) settingsData.targetNiches = JSON.stringify(targetNiches);
    if (targetCountries !== undefined) settingsData.targetCountries = JSON.stringify(targetCountries);
    if (targetChannels !== undefined) settingsData.targetChannels = JSON.stringify(targetChannels);
    if (companyName !== undefined) settingsData.companyName = companyName;
    if (businessDescription !== undefined) settingsData.businessDescription = businessDescription;
    if (timezone !== undefined) settingsData.timezone = timezone;
    if (preferredCurrency !== undefined) settingsData.preferredCurrency = preferredCurrency;
    if (progressData.completed) {
      settingsData.onboardingCompleted = true;
      settingsData.onboardingStep = 100;
    } else if (currentStep !== undefined) {
      settingsData.onboardingStep = currentStep;
    }

    if (Object.keys(settingsData).length > 0) {
      await db.userSettings.upsert({
        where: { userId: user.id },
        update: settingsData,
        create: {
          userId: user.id,
          ...settingsData,
        },
      });
    }

    // Award bonus credits on completion
    let bonusAwarded = false;
    if (progressData.completed && currentProgress && !currentProgress.bonusCreditsAwarded) {
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
    if (progressData.completed) {
      await logAuthEvent({
        userId: user.id,
        action: 'onboarding_completed',
        details: JSON.stringify({ bonusAwarded }),
        ipAddress: ip,
        userAgent: ua,
        resource: 'onboarding',
        resourceId: user.id,
      });
    } else if (currentStep !== undefined) {
      await logAuthEvent({
        userId: user.id,
        action: 'onboarding_step_completed',
        details: JSON.stringify({ step: currentStep }),
        ipAddress: ip,
        userAgent: ua,
        resource: 'onboarding',
        resourceId: user.id,
      });
    }

    const updatedProgress = await db.onboardingProgress.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      progress: updatedProgress,
      bonusAwarded,
    });
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { statusCode: number }).statusCode });
    }
    console.error('Error updating onboarding progress:', error);
    return NextResponse.json({ error: 'Failed to save onboarding progress' }, { status: 500 });
  }
}
