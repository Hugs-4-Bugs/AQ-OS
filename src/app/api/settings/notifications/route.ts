import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let prefs = await db.notificationPreferences.findUnique({
      where: { userId: authUser.id },
    });

    // Create default preferences if none exist
    if (!prefs) {
      prefs = await db.notificationPreferences.create({
        data: { userId: authUser.id },
      });
    }

    return NextResponse.json({
      preferences: {
        inAppEnabled: prefs.inAppEnabled,
        emailEnabled: prefs.emailEnabled,
        telegramEnabled: prefs.telegramEnabled,
        whatsappEnabled: prefs.whatsappEnabled,
        dndStartTime: prefs.dndStartTime,
        dndEndTime: prefs.dndEndTime,
        dndTimezone: prefs.dndTimezone,
        typePreferences: prefs.typePreferences
          ? JSON.parse(prefs.typePreferences)
          : null,
      },
    });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      inAppEnabled,
      emailEnabled,
      telegramEnabled,
      whatsappEnabled,
      dndStartTime,
      dndEndTime,
      dndTimezone,
      typePreferences,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (inAppEnabled !== undefined) updateData.inAppEnabled = inAppEnabled;
    if (emailEnabled !== undefined) updateData.emailEnabled = emailEnabled;
    if (telegramEnabled !== undefined)
      updateData.telegramEnabled = telegramEnabled;
    if (whatsappEnabled !== undefined)
      updateData.whatsappEnabled = whatsappEnabled;
    if (dndStartTime !== undefined) updateData.dndStartTime = dndStartTime;
    if (dndEndTime !== undefined) updateData.dndEndTime = dndEndTime;
    if (dndTimezone !== undefined) updateData.dndTimezone = dndTimezone;
    if (typePreferences !== undefined) {
      updateData.typePreferences =
        typeof typePreferences === 'string'
          ? typePreferences
          : JSON.stringify(typePreferences);
    }

    const prefs = await db.notificationPreferences.upsert({
      where: { userId: authUser.id },
      update: updateData,
      create: {
        userId: authUser.id,
        ...updateData,
      },
    });

    return NextResponse.json({
      preferences: {
        inAppEnabled: prefs.inAppEnabled,
        emailEnabled: prefs.emailEnabled,
        telegramEnabled: prefs.telegramEnabled,
        whatsappEnabled: prefs.whatsappEnabled,
        dndStartTime: prefs.dndStartTime,
        dndEndTime: prefs.dndEndTime,
        dndTimezone: prefs.dndTimezone,
        typePreferences: prefs.typePreferences
          ? JSON.parse(prefs.typePreferences)
          : null,
      },
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    );
  }
}
