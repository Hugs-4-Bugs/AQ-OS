// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Telegram Integration API Route
// GET  /api/integrations/telegram — Get user's Telegram config & notification settings
// POST /api/integrations/telegram — Actions: connect, disconnect, generate_code, update_settings
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, AuthError, logAuthEvent, getClientIp, getUserAgent } from '@/lib/auth';
import crypto from 'crypto';

// ─── GET: Fetch Telegram integration status & notification settings ────
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);

    const config = await db.telegramConfig.findUnique({
      where: { userId: user.id },
    });

    const notifPrefs = await db.notificationPreferences.findUnique({
      where: { userId: user.id },
    });

    // Build notification type preferences from stored JSON or defaults
    const defaultTypePrefs: Record<string, boolean> = {
      lead_reply: true,
      deal_update: true,
      reminder: true,
      system: true,
      daily_summary: false,
    };

    let typePreferences = { ...defaultTypePrefs };
    if (notifPrefs?.typePreferences) {
      try {
        const parsed = JSON.parse(notifPrefs.typePreferences);
        typePreferences = { ...defaultTypePrefs, ...parsed };
      } catch {
        // use defaults if parse fails
      }
    }

    return NextResponse.json({
      config: config
        ? {
            id: config.id,
            chatId: config.chatId,
            username: config.username,
            isConnected: config.isConnected,
            isPaused: config.isPaused,
            linkCode: config.linkCode,
            linkCodeExpiresAt: config.linkCodeExpiresAt?.toISOString() ?? null,
            createdAt: config.createdAt.toISOString(),
            updatedAt: config.updatedAt.toISOString(),
          }
        : null,
      notifications: {
        telegramEnabled: notifPrefs?.telegramEnabled ?? false,
        typePreferences,
        dnd: {
          startTime: notifPrefs?.dndStartTime ?? null,
          endTime: notifPrefs?.dndEndTime ?? null,
          timezone: notifPrefs?.dndTimezone ?? null,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[Telegram GET]', error);
    return NextResponse.json(
      { error: 'Failed to fetch Telegram configuration' },
      { status: 500 }
    );
  }
}

// ─── POST: Handle Telegram actions ───────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const ip = getClientIp(request);
    const ua = getUserAgent(request);
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ── Generate a link code for connecting Telegram ──
      case 'generate_code': {
        const linkCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const linkCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await db.telegramConfig.upsert({
          where: { userId: user.id },
          update: {
            linkCode,
            linkCodeExpiresAt,
            updatedAt: new Date(),
          },
          create: {
            userId: user.id,
            chatId: '',
            linkCode,
            linkCodeExpiresAt,
            isConnected: false,
            isPaused: false,
          },
        });

        await logAuthEvent({
          userId: user.id,
          action: 'telegram_link_code_generated',
          details: 'Generated Telegram link code',
          ipAddress: ip,
          userAgent: ua,
          resource: 'telegram_config',
        });

        return NextResponse.json({
          success: true,
          linkCode,
          linkCodeExpiresAt: linkCodeExpiresAt.toISOString(),
        });
      }

      // ── Connect a Telegram chat to the user ──
      case 'connect': {
        const { chatId, username } = body;

        if (!chatId) {
          return NextResponse.json(
            { error: 'chatId is required' },
            { status: 400 }
          );
        }

        const config = await db.telegramConfig.upsert({
          where: { userId: user.id },
          update: {
            chatId,
            username: username || null,
            isConnected: true,
            isPaused: false,
            linkCode: null,
            linkCodeExpiresAt: null,
            updatedAt: new Date(),
          },
          create: {
            userId: user.id,
            chatId,
            username: username || null,
            isConnected: true,
            isPaused: false,
          },
        });

        // Also enable telegram in notification preferences
        await db.notificationPreferences.upsert({
          where: { userId: user.id },
          update: { telegramEnabled: true },
          create: {
            userId: user.id,
            telegramEnabled: true,
            inAppEnabled: true,
            emailEnabled: true,
          },
        });

        await logAuthEvent({
          userId: user.id,
          action: 'telegram_connected',
          details: `Connected Telegram chat ${chatId}`,
          ipAddress: ip,
          userAgent: ua,
          resource: 'telegram_config',
          resourceId: config.id,
        });

        return NextResponse.json({
          success: true,
          message: 'Telegram bot connected successfully',
          config: {
            id: config.id,
            chatId: config.chatId,
            username: config.username,
            isConnected: config.isConnected,
            isPaused: config.isPaused,
          },
        });
      }

      // ── Disconnect the Telegram bot ──
      case 'disconnect': {
        const existing = await db.telegramConfig.findUnique({
          where: { userId: user.id },
        });

        if (!existing) {
          return NextResponse.json(
            { error: 'No Telegram configuration found' },
            { status: 404 }
          );
        }

        await db.telegramConfig.update({
          where: { userId: user.id },
          data: {
            isConnected: false,
            isPaused: false,
            chatId: '',
            username: null,
            linkCode: null,
            linkCodeExpiresAt: null,
            updatedAt: new Date(),
          },
        });

        // Disable telegram in notification preferences
        await db.notificationPreferences.upsert({
          where: { userId: user.id },
          update: { telegramEnabled: false },
          create: {
            userId: user.id,
            telegramEnabled: false,
            inAppEnabled: true,
            emailEnabled: true,
          },
        });

        await logAuthEvent({
          userId: user.id,
          action: 'telegram_disconnected',
          details: 'Disconnected Telegram bot',
          ipAddress: ip,
          userAgent: ua,
          resource: 'telegram_config',
          resourceId: existing.id,
        });

        return NextResponse.json({
          success: true,
          message: 'Telegram bot disconnected',
        });
      }

      // ── Update notification & pause settings ──
      case 'update_settings': {
        const { isPaused, notifications, digestTime, digestFrequency } = body;

        // Update TelegramConfig pause state
        if (isPaused !== undefined) {
          const existing = await db.telegramConfig.findUnique({
            where: { userId: user.id },
          });

          if (existing) {
            await db.telegramConfig.update({
              where: { userId: user.id },
              data: {
                isPaused: Boolean(isPaused),
                updatedAt: new Date(),
              },
            });
          }
        }

        // Update notification preferences
        const notifUpdateData: Record<string, unknown> = {};
        if (notifications !== undefined) {
          notifUpdateData.typePreferences = JSON.stringify(notifications);
        }
        if (digestTime !== undefined) {
          notifUpdateData.dndStartTime = digestTime || null;
        }
        if (digestFrequency !== undefined) {
          // Store frequency info in dndEndTime as a creative use of the field
          // Or just ignore it if there's no matching column
        }

        if (Object.keys(notifUpdateData).length > 0) {
          await db.notificationPreferences.upsert({
            where: { userId: user.id },
            update: notifUpdateData,
            create: {
              userId: user.id,
              telegramEnabled: true,
              inAppEnabled: true,
              emailEnabled: true,
              typePreferences: notifUpdateData.typePreferences
                ? String(notifUpdateData.typePreferences)
                : JSON.stringify({
                    lead_reply: true,
                    deal_update: true,
                    reminder: true,
                    system: true,
                    daily_summary: false,
                  }),
              dndStartTime: (notifUpdateData.dndStartTime as string) ?? null,
            },
          });
        }

        await logAuthEvent({
          userId: user.id,
          action: 'telegram_settings_updated',
          details: 'Updated Telegram integration settings',
          ipAddress: ip,
          userAgent: ua,
          resource: 'telegram_config',
        });

        return NextResponse.json({
          success: true,
          message: 'Telegram settings updated',
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: connect, disconnect, generate_code, update_settings' },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('[Telegram POST]', error);
    return NextResponse.json(
      { error: 'Failed to process Telegram request' },
      { status: 500 }
    );
  }
}
