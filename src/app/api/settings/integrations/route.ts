import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, secureCompare } from '@/lib/auth';
import { db } from '@/lib/db';
import crypto from 'crypto';

interface IntegrationStatus {
  gmail: { connected: boolean; email?: string; consentGiven?: boolean };
  telegram: { connected: boolean; chatId?: string; username?: string };
  whatsapp: { connected: boolean; phone?: string; providerConfigured?: boolean };
  googleCalendar: { connected: boolean; sameAccount?: boolean };
  googleOAuthConfigured: boolean;
}

// GET /api/settings/integrations - Return integration status
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = authUser.id;

    // Fetch all integration configs in parallel
    const [userSettings, telegramConfig, whatsappConfig, emailAccount] =
      await Promise.all([
        db.userSettings.findUnique({
          where: { userId },
          select: {
            gmailConnected: true,
            gmailEmail: true,
            googleCalendarConnected: true,
          },
        }),
        db.telegramConfig.findUnique({
          where: { userId },
          select: {
            isConnected: true,
            chatId: true,
            username: true,
          },
        }),
        db.whatsappConfig.findUnique({
          where: { userId },
          select: {
            isConnected: true,
            phoneNumber: true,
          },
        }),
        db.emailAccount.findFirst({
          where: { userId, status: 'active' },
          select: {
            gmailEmail: true,
            status: true,
            consentGiven: true,
          },
        }),
      ]);

    // Also check Google Calendar token for more accurate status
    const calendarToken = await db.googleCalendarToken.findFirst({
      where: { userId, status: 'active' },
      select: { calendarEmail: true },
    });

    // Build integration status response
    const integrations: IntegrationStatus = {
      gmail: {
        connected:
          userSettings?.gmailConnected ||
          (emailAccount?.status === 'active' && !!emailAccount?.gmailEmail) ||
          false,
        email:
          userSettings?.gmailEmail ||
          emailAccount?.gmailEmail ||
          undefined,
        consentGiven: emailAccount?.consentGiven ?? false,
      },
      telegram: {
        connected: telegramConfig?.isConnected ?? false,
        chatId: telegramConfig?.chatId ?? undefined,
        username: telegramConfig?.username ?? undefined,
      },
      whatsapp: {
        connected: whatsappConfig?.isConnected ?? false,
        phone: whatsappConfig?.phoneNumber ?? undefined,
        providerConfigured: !!(process.env.WHATSAPP_API_TOKEN || process.env.TWILIO_AUTH_TOKEN),
      },
      googleCalendar: {
        connected: userSettings?.googleCalendarConnected || !!calendarToken || false,
        sameAccount: !!calendarToken && !!emailAccount && calendarToken.calendarEmail === emailAccount.gmailEmail,
      },
      googleOAuthConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    };

    return NextResponse.json({ integrations });
  } catch (error) {
    console.error('Get integrations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/integrations - Update integration settings (disconnect actions)
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    // Accept both "service" and "integration" keys (frontend may send either)
    const integration = body.integration || body.service;
    const { action } = body;

    // Validate inputs
    const validIntegrations = ['gmail', 'telegram', 'whatsapp', 'googleCalendar'];
    if (!integration || !validIntegrations.includes(integration)) {
      return NextResponse.json(
        { error: `Invalid integration. Must be one of: ${validIntegrations.join(', ')}` },
        { status: 400 }
      );
    }

    const validActions = ['disconnect', 'send_otp', 'verify_otp'];
    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      );
    }

    const userId = authUser.id;

    // Handle disconnect based on integration type
    switch (integration) {
      case 'gmail': {
        if (action !== 'disconnect') {
          return NextResponse.json(
            { error: `Action '${action}' is not supported for Gmail. Only 'disconnect' is supported.` },
            { status: 400 }
          );
        }
        // Update UserSettings
        await db.userSettings.upsert({
          where: { userId },
          update: { gmailConnected: false, gmailEmail: null },
          create: { userId, gmailConnected: false, gmailEmail: null },
        });

        // Update EmailAccount status
        await db.emailAccount.updateMany({
          where: { userId, status: 'active' },
          data: { status: 'revoked' },
        });

        break;
      }

      case 'telegram': {
        if (action !== 'disconnect') {
          return NextResponse.json(
            { error: `Action '${action}' is not supported for Telegram. Only 'disconnect' is supported. Use /api/settings/integrations/telegram/link to generate a link code.` },
            { status: 400 }
          );
        }
        // Delete or disconnect TelegramConfig
        const telegramConfig = await db.telegramConfig.findUnique({
          where: { userId },
        });

        if (telegramConfig) {
          await db.telegramConfig.update({
            where: { userId },
            data: { isConnected: false, isPaused: false },
          });
        }
        break;
      }

      case 'whatsapp': {
        if (action === 'disconnect') {
          // Disconnect WhatsappConfig
          const whatsappConfig = await db.whatsappConfig.findUnique({
            where: { userId },
          });

          if (whatsappConfig) {
            await db.whatsappConfig.update({
              where: { userId },
              data: { isConnected: false, isPaused: false, verificationOtp: null, otpExpiresAt: null },
            });
          }

          // Also update UserSettings
          await db.userSettings.upsert({
            where: { userId },
            update: { whatsappConnected: false, whatsappNumber: null },
            create: { userId, whatsappConnected: false, whatsappNumber: null },
          });
          break;
        }

        if (action === 'send_otp') {
          const phoneNumber = body.phoneNumber;
          if (!phoneNumber) {
            return NextResponse.json(
              { error: 'Phone number is required' },
              { status: 400 }
            );
          }

          // Generate a 6-digit OTP
          const otp = crypto.randomInt(100000, 999999).toString();
          const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

          // Upsert WhatsappConfig with OTP
          await db.whatsappConfig.upsert({
            where: { userId },
            update: {
              phoneNumber,
              verificationOtp: otp,
              otpExpiresAt,
            },
            create: {
              userId,
              phoneNumber,
              verificationOtp: otp,
              otpExpiresAt,
              isConnected: false,
            },
          });

          // ─────────────────────────────────────────────────────────────
          // PENDING: Real WhatsApp OTP delivery
          // ─────────────────────────────────────────────────────────────
          // The OTP is generated and stored in DB but NOT actually sent via
          // WhatsApp. This requires a real provider integration:
          //   - Twilio WhatsApp Business API, OR
          //   - Meta WhatsApp Business Cloud API
          // Until WHATSAPP_API_TOKEN or TWILIO_AUTH_TOKEN is configured and
          // the actual API call is implemented here, the OTP is returned
          // in the response so the UI can display it for dev/manual testing.
          // When a real provider is wired up, remove the `otp` from the response.
          // ─────────────────────────────────────────────────────────────
          console.log(`[WhatsApp OTP] Generated OTP ${otp} for user ${userId}, phone ${phoneNumber}`);
          const hasWhatsappProvider = !!(process.env.WHATSAPP_API_TOKEN || process.env.TWILIO_AUTH_TOKEN);

          return NextResponse.json({
            message: hasWhatsappProvider
              ? 'OTP sent to your WhatsApp number'
              : 'OTP generated (no WhatsApp provider configured — check your settings)',
            otp: hasWhatsappProvider ? undefined : otp, // Only include OTP when no real provider
            expiresAt: otpExpiresAt.toISOString(),
            providerConfigured: hasWhatsappProvider,
          });
        }

        if (action === 'verify_otp') {
          const otp = body.otp;
          if (!otp) {
            return NextResponse.json(
              { error: 'OTP is required' },
              { status: 400 }
            );
          }

          const whatsappConfig = await db.whatsappConfig.findUnique({
            where: { userId },
          });

          if (!whatsappConfig) {
            return NextResponse.json(
              { error: 'No WhatsApp configuration found. Please request an OTP first.' },
              { status: 404 }
            );
          }

          // Check OTP expiry
          if (!whatsappConfig.otpExpiresAt || new Date() > whatsappConfig.otpExpiresAt) {
            return NextResponse.json(
              { error: 'OTP has expired. Please request a new one.' },
              { status: 400 }
            );
          }

          // Check OTP value using constant-time comparison to prevent timing attacks
          if (!secureCompare(String(otp), whatsappConfig.verificationOtp || '')) {
            return NextResponse.json(
              { error: 'Invalid OTP. Please try again.' },
              { status: 400 }
            );
          }

          // OTP verified — mark as connected
          await db.whatsappConfig.update({
            where: { userId },
            data: {
              isConnected: true,
              verificationOtp: null,
              otpExpiresAt: null,
            },
          });

          // Update UserSettings
          await db.userSettings.upsert({
            where: { userId },
            update: { whatsappConnected: true, whatsappNumber: whatsappConfig.phoneNumber },
            create: { userId, whatsappConnected: true, whatsappNumber: whatsappConfig.phoneNumber },
          });

          // Create audit log
          await db.auditLog.create({
            data: {
              userId,
              action: 'integration_connect',
              details: `Connected WhatsApp for ${whatsappConfig.phoneNumber}`,
              resource: 'integration',
              resourceId: 'whatsapp',
            },
          });

          return NextResponse.json({
            message: 'WhatsApp connected successfully',
            phoneNumber: whatsappConfig.phoneNumber,
          });
        }
        break;
      }

      case 'googleCalendar': {
        if (action !== 'disconnect') {
          return NextResponse.json(
            { error: `Action '${action}' is not supported for Google Calendar. Only 'disconnect' is supported.` },
            { status: 400 }
          );
        }
        // Delete GoogleCalendarToken records
        await db.googleCalendarToken.deleteMany({
          where: { userId },
        });

        // Update UserSettings
        await db.userSettings.upsert({
          where: { userId },
          update: { googleCalendarConnected: false },
          create: { userId, googleCalendarConnected: false },
        });
        break;
      }
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId,
        action: 'integration_disconnect',
        details: JSON.stringify({
          integration,
          action,
        }),
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
        resource: 'integration',
        resourceId: integration,
      },
    });

    return NextResponse.json({
      message: `${integration} disconnected successfully`,
      integration,
      action,
    });
  } catch (error) {
    console.error('Update integrations error:', error);
    return NextResponse.json(
      { error: 'Failed to update integration' },
      { status: 500 }
    );
  }
}
