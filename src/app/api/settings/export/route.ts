import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/settings/export - Export ALL user data as JSON
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = authUser.id;

    // Fetch all user data in parallel
    const [
      user,
      userSettings,
      leads,
      deals,
      communications,
      workflows,
      creditsLedger,
      paymentOrders,
      invoices,
      apiKeys,
      conversationMessages,
      outreachSequences,
      competitorAnalyses,
    ] = await Promise.all([
      // Profile (exclude sensitive fields)
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          country: true,
          bio: true,
          plan: true,
          credits: true,
          role: true,
          emailVerified: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Timezone lives on UserSettings, not User
      db.userSettings.findUnique({
        where: { userId },
        select: { timezone: true },
      }),
      // Leads
      db.lead.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Deals (via leads)
      db.deal.findMany({
        where: { lead: { userId } },
        orderBy: { createdAt: 'desc' },
      }),
      // Communications (via leads)
      db.communication.findMany({
        where: { lead: { userId } },
        orderBy: { createdAt: 'desc' },
      }),
      // Workflows
      db.workflowDefinition.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Billing - Credits ledger
      db.creditsLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Billing - Payment orders
      db.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Billing - Invoices
      db.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // API keys (exclude hash)
      db.apiKey.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          isActive: true,
          lastUsedAt: true,
          expiresAt: true,
          rateLimitPerHour: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Messages (ConversationMessage)
      db.conversationMessage.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Outreach sequences
      db.outreachSequence.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      // Competitor analyses
      db.competitorAnalysis.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const exportData = {
      exportDate: new Date().toISOString(),
      exportType: 'full_json',
      profile: user ? { ...user, timezone: userSettings?.timezone ?? null } : null,
      leads,
      deals,
      communications,
      workflows,
      analytics: {
        competitorAnalyses,
      },
      billing: {
        creditsLedger,
        paymentOrders,
        invoices,
      },
      messages: conversationMessages,
      outreachSequences,
      apiKeys,
    };

    // Create DataExport record
    const dataExport = await db.dataExport.create({
      data: {
        userId,
        exportType: 'full_json',
        status: 'completed',
        recordCount:
          (leads?.length ?? 0) +
          (deals?.length ?? 0) +
          (communications?.length ?? 0) +
          (workflows?.length ?? 0) +
          (creditsLedger?.length ?? 0) +
          (paymentOrders?.length ?? 0) +
          (invoices?.length ?? 0) +
          (apiKeys?.length ?? 0) +
          (conversationMessages?.length ?? 0) +
          (outreachSequences?.length ?? 0) +
          (competitorAnalyses?.length ?? 0) +
          1, // +1 for profile
        completedAt: new Date(),
      },
    });

    // Update the data export record with file size estimate
    const jsonStr = JSON.stringify(exportData);
    await db.dataExport.update({
      where: { id: dataExport.id },
      data: {
        fileSize: Buffer.byteLength(jsonStr, 'utf-8'),
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        userId,
        action: 'data_export',
        details: JSON.stringify({
          exportId: dataExport.id,
          exportType: 'full_json',
          recordCount: dataExport.recordCount ?? 0,
        }),
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
        resource: 'data_export',
        resourceId: dataExport.id,
      },
    });

    // Return the data directly as JSON with appropriate headers
    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="acquisitionos-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Export data error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
