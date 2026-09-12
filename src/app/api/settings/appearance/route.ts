import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/settings/appearance - Return user's appearance settings
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const settings = await db.userSettings.findUnique({
      where: { userId: authUser.id },
      select: {
        theme: true,
        compactMode: true,
        defaultNiche: true,
        defaultCountry: true,
      },
    });

    // Also check for theme cookie as a fallback
    const themeCookie = request.cookies.get('theme')?.value;

    return NextResponse.json({
      appearance: {
        theme: settings?.theme || themeCookie || 'system',
        compactMode: settings?.compactMode ?? false,
        defaultNiche: settings?.defaultNiche ?? null,
        defaultCountry: settings?.defaultCountry ?? null,
      },
    });
  } catch (error) {
    console.error('Get appearance settings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch appearance settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/appearance - Update appearance settings
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { theme, compactMode, defaultNiche, defaultCountry } = body;

    // Build update data with only provided fields
    const updateData: Record<string, unknown> = {};
    if (theme !== undefined) {
      if (!['light', 'dark', 'system'].includes(theme)) {
        return NextResponse.json(
          { error: 'Invalid theme value. Must be light, dark, or system' },
          { status: 400 }
        );
      }
      updateData.theme = theme;
    }
    if (compactMode !== undefined) {
      updateData.compactMode = Boolean(compactMode);
    }
    if (defaultNiche !== undefined) {
      updateData.defaultNiche = defaultNiche;
    }
    if (defaultCountry !== undefined) {
      updateData.defaultCountry = defaultCountry;
    }

    // Upsert user settings (create if doesn't exist)
    const settings = await db.userSettings.upsert({
      where: { userId: authUser.id },
      update: updateData,
      create: {
        userId: authUser.id,
        ...updateData,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: authUser.id,
        action: 'appearance_update',
        details: JSON.stringify(updateData),
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
        resource: 'user_settings',
        resourceId: settings.id,
      },
    });

    // Set theme cookie for client-side access
    const response = NextResponse.json({
      appearance: {
        theme: settings.theme,
        compactMode: settings.compactMode,
        defaultNiche: settings.defaultNiche,
        defaultCountry: settings.defaultCountry,
      },
    });

    if (theme) {
      response.cookies.set('theme', theme, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }

    return response;
  } catch (error) {
    console.error('Update appearance settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update appearance settings' },
      { status: 500 }
    );
  }
}
