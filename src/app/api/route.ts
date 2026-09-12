import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "AcquisitionOS API",
    version: "1.0.0",
    description: "AI-powered sales acquisition and CRM platform",
    endpoints: {
      auth: {
        config: "/api/auth/config",
        google: "/api/auth/google",
        magicLink: "/api/auth/magic-link",
      },
      dashboard: {
        pipelineForecast: "/api/dashboard/pipeline-forecast",
        executiveSummary: "/api/dashboard/executive-summary",
        dealsPerformance: "/api/dashboard/deals-performance",
        pipelineHealth: "/api/dashboard/pipeline-health",
        engagementScores: "/api/dashboard/engagement-scores",
        churnRisk: "/api/dashboard/churn-risk",
        teamLeaderboard: "/api/dashboard/team-leaderboard",
        weeklyDigest: "/api/dashboard/weekly-digest",
        clientOnboarding: "/api/dashboard/client-onboarding",
        customAlerts: "/api/dashboard/custom-alerts",
        revenueWaterfall: "/api/dashboard/revenue-waterfall",
        accountGrowth: "/api/dashboard/account-growth",
        territoryMap: "/api/dashboard/territory-map",
        salesPlaybook: "/api/dashboard/sales-playbook",
        marketAnalysis: "/api/dashboard/market-analysis",
        performanceBenchmark: "/api/dashboard/performance-benchmark",
        budget: "/api/dashboard/budget",
        funnelVelocity: "/api/dashboard/funnel-velocity",
        aiCopilot: "/api/dashboard/ai-copilot",
      },
      crm: {
        leads: "/api/crm/leads",
        deals: "/api/crm/deals",
        activities: "/api/crm/activities",
      },
      outreach: {
        sequences: "/api/outreach/sequences",
        messages: "/api/outreach/messages",
      },
      integrations: {
        whatsapp: "/api/integrations/whatsapp",
      },
    },
  });
}
