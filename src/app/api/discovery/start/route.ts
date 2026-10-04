// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — POST /api/discovery/start
// Runs the full lead discovery pipeline ASYNCHRONOUSLY:
//   Discover → Score → Research → Outreach
// Returns immediately with a jobId, then processes in background.
// Uses withAuth middleware — no custom auth logic.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { checkCreditSufficiency } from '@/lib/credit-service';
import { db } from '@/lib/db';
import { runDiscovery, type DiscoveryConfig } from '@/lib/lead-discovery/discovery-engine';
import { analyzeWebsite, type WebsiteScore } from '@/lib/lead-discovery/website-scorer';
import { researchCompany, type LeadInput, type UserProfile } from '@/lib/lead-discovery/company-researcher';
import { generateAndSendOutreach } from '@/lib/lead-discovery/outreach-sender';

// Credit cost per lead (research=5 + outreach=2 = 7 AI credits per lead)
const CREDITS_PER_LEAD = 7;

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const body = await request.json() as {
        niche?: string;
        location?: string;
        maxLeads?: number;
        targetGap?: string;
        country?: string;
        city?: string;
      };

      // ── 1. Validate all fields present ────────────────────────────
      const niche = body.niche?.trim();
      const location = (body.location || body.country || '').trim();
      const maxLeads = Math.min(Math.max(Number(body.maxLeads) || 10, 1), 100);
      const targetGap = body.targetGap?.trim() || 'improving their online presence';
      const country = body.country?.trim() || location;
      const city = body.city?.trim() || null;

      if (!niche) {
        return NextResponse.json({ error: 'Missing required field: niche' }, { status: 400 });
      }
      if (!location) {
        return NextResponse.json({ error: 'Missing required field: location (or country)' }, { status: 400 });
      }

      // ── 2. Check user has sufficient AI credits ───────────────────
      const requiredCredits = maxLeads * CREDITS_PER_LEAD;
      const sufficiency = await checkCreditSufficiency(user.id, requiredCredits);

      if (!sufficiency.sufficient) {
        return NextResponse.json({
          error: `Insufficient credits. Need ~${requiredCredits} credits for ${maxLeads} leads (have ${sufficiency.balance}). Reduce maxLeads or add credits.`,
          requiredCredits,
          balance: sufficiency.balance,
          shortfall: sufficiency.shortfall,
        }, { status: 402 });
      }

      // ── 3. Create DiscoveryJob record ─────────────────────────────
      const job = await db.discoveryJob.create({
        data: {
          userId: user.id,
          status: 'pending',
          source: 'full_pipeline',
          niche,
          country,
          city,
          total: maxLeads,
          progress: 0,
        },
      });

      console.log(`[DiscoveryStart] Created job ${job.id}: niche=${niche}, location=${location}, maxLeads=${maxLeads}, userId=${user.id}`);

      // ── 4. Return immediately with jobId ──────────────────────────
      const response = NextResponse.json({
        jobId: job.id,
        status: 'started',
        message: 'Discovery running in background',
      });

      // ── 5. Run pipeline in background using setImmediate ──────────
      setImmediate(async () => {
        try {
          await runFullPipeline(job.id, user.id, { niche, location, maxLeads, targetGap, country, city });
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : 'Unknown pipeline error';
          console.error(`[DiscoveryStart] Pipeline job ${job.id} failed:`, errorMessage);
          try {
            await db.discoveryJob.update({
              where: { id: job.id },
              data: { status: 'failed', errorMessage, completedAt: new Date() },
            });
          } catch (dbErr) {
            console.error(`[DiscoveryStart] Failed to update job ${job.id} as failed:`, dbErr);
          }
        }
      });

      return response;
    } catch (error) {
      console.error('[DiscoveryStart] Error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

// ===== BACKGROUND PIPELINE RUNNER =====

interface PipelineConfig {
  niche: string;
  location: string;
  maxLeads: number;
  targetGap: string;
  country: string;
  city: string | null;
}

async function runFullPipeline(
  jobId: string,
  userId: string,
  config: PipelineConfig
): Promise<void> {
  // Mark as running
  await db.discoveryJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    const { niche, location, maxLeads, targetGap, country, city } = config;

    // ── STEP 1: Run Discovery ────────────────────────────────────
    const discoveryConfig: DiscoveryConfig = { niche, location, maxLeads, targetGap };
    const discoveryResult = await runDiscovery(userId, discoveryConfig);

    console.log(`[Pipeline:${jobId}] Discovery: ${discoveryResult.discovered} found, ${discoveryResult.saved} saved, ${discoveryResult.skipped} skipped`);

    // Update job total to actual discovered count
    await db.discoveryJob.update({
      where: { id: jobId },
      data: { totalFound: discoveryResult.discovered, total: discoveryResult.leads.length },
    });

    // Build user profile for research step
    const userRecord = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, company: true },
    });

    const userProfile: UserProfile = {
      name: userRecord?.name || userRecord?.email || 'User',
      businessType: niche,
      services: targetGap,
      location,
    };

    // ── STEP 2: Process each lead SEQUENTIALLY ───────────────────
    const processedLeads: Array<{
      id: string;
      businessName: string;
      email: string | null;
      outreachSent: boolean;
    }> = [];

    let totalContacted = 0;
    let totalSkipped = 0;

    for (let i = 0; i < discoveryResult.leads.length; i++) {
      const lead = discoveryResult.leads[i];

      try {
        // ── 2a. Score website ───────────────────────────────────
        let fullWebsiteScore: WebsiteScore | undefined = undefined;
        if (lead.website && lead.websiteReachable) {
          try {
            fullWebsiteScore = await analyzeWebsite(lead.website, lead.businessName, niche);
          } catch {
            // Use minimal fallback
          }
        }

        // ── 2b. Research company ────────────────────────────────
        if (fullWebsiteScore) {
          try {
            const leadInput: LeadInput = {
              id: lead.id,
              userId,
              businessName: lead.businessName,
              website: lead.website,
              niche,
              country,
              city,
              email: lead.email,
              phone: lead.phone,
              stage: lead.stage,
              techStack: JSON.stringify(lead.techStack),
            };
            await researchCompany(leadInput, fullWebsiteScore, userProfile);
          } catch (researchErr) {
            console.warn(`[Pipeline:${jobId}] Research failed for ${lead.businessName}:`, researchErr);
          }
        }

        // ── 2c. Generate & send outreach (if email exists) ──────
        let outreachSent = false;
        if (lead.email) {
          try {
            const outreachResult = await generateAndSendOutreach(lead.id, userId);
            outreachSent = outreachResult.success;
            if (outreachSent) totalContacted++;
          } catch (outreachErr) {
            console.warn(`[Pipeline:${jobId}] Outreach failed for ${lead.businessName}:`, outreachErr);
          }
        } else {
          totalSkipped++;
        }

        processedLeads.push({
          id: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          outreachSent,
        });
      } catch (leadErr) {
        console.error(`[Pipeline:${jobId}] Error processing lead ${lead.businessName}:`, leadErr);
        totalSkipped++;
      }

      // ── Update progress after each lead ────────────────────────
      await db.discoveryJob.update({
        where: { id: jobId },
        data: {
          progress: i + 1,
          imported: totalContacted,
          duplicates: totalSkipped,
        },
      });

      // Breathing room between leads
      await new Promise(r => setTimeout(r, 500));
    }

    // ── STEP 3: Mark job as completed ─────────────────────────────
    await db.discoveryJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        totalFound: discoveryResult.discovered,
        imported: totalContacted,
        duplicates: totalSkipped,
        failed: 0,
        resultData: JSON.stringify(processedLeads.slice(0, 100)),
        completedAt: new Date(),
      },
    });

    console.log(`[Pipeline:${jobId}] Complete: contacted=${totalContacted}, skipped=${totalSkipped}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown pipeline error';
    console.error(`[Pipeline:${jobId}] Failed:`, errorMessage);

    await db.discoveryJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage, completedAt: new Date() },
    });
  }
}
