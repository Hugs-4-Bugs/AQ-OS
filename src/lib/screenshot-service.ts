// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Website Screenshot Service
// Phase 7: Uses z-ai-web-dev-sdk VLM to capture/describe websites
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { logAuditEvent } from '@/lib/lead-audit';
import ZAI from 'z-ai-web-dev-sdk';

// ===== TYPES =====

export interface ScreenshotResult {
  success: boolean;
  description: string;
  websiteQuality: string;
  techStack: string[];
  error?: string;
}

// ===== CORE FUNCTION =====

/**
 * Capture and describe a website using VLM (Vision Language Model).
 * Updates the lead's websiteScreenshotUrl and related fields.
 */
export async function captureWebsiteScreenshot(
  leadId: string,
  userId: string
): Promise<ScreenshotResult> {
  try {
    // Fetch lead
    const lead = await db.lead.findFirst({
      where: { id: leadId, isActive: true },
    });

    if (!lead) {
      return { success: false, description: '', websiteQuality: 'none', techStack: [], error: 'Lead not found' };
    }

    if (!lead.website) {
      return { success: false, description: '', websiteQuality: 'none', techStack: [], error: 'Lead has no website URL' };
    }

    // Initialize AI SDK
    let zai: ZAI;
    try {
      zai = await ZAI.create();
    } catch {
      return { success: false, description: '', websiteQuality: 'none', techStack: [], error: 'AI SDK initialization failed' };
    }

    // Step 1: Read the website content
    let websiteContent = '';
    try {
      const pageResult = await zai.functions.invoke('page_reader', {
        url: lead.website,
      });

      if (pageResult?.data?.html) {
        websiteContent = pageResult.data.html.substring(0, 8000);
      }
    } catch {
      return { success: false, description: '', websiteQuality: 'none', techStack: [], error: 'Failed to read website content' };
    }

    // Step 2: Use LLM to analyze the website and describe it
    const analysisResult = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a website analysis expert. Analyze the website HTML and provide structured insights. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Analyze this website HTML for the business "${lead.businessName}".

WEBSITE URL: ${lead.website}

HTML CONTENT (truncated):
${websiteContent.substring(0, 6000)}

Return a JSON object with:
- description: 2-3 sentence description of what this website/business does
- websiteQuality: one of "none", "poor", "basic", "good", "excellent"
- techStack: array of detected technologies (e.g. ["WordPress", "Shopify", "React", "Google Analytics"])
- hasMobile: boolean - does the site appear mobile-friendly?
- hasSEO: boolean - does the site have basic SEO (meta tags, titles)?
- weaknesses: comma-separated list of digital weaknesses
- opportunity: why this business could benefit from digital services

Return ONLY the JSON object. No markdown, no explanation.`,
        },
      ],
      model: 'auto',
    });

    const content = analysisResult.choices?.[0]?.message?.content || '{}';

    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);

    const description = parsed.description || '';
    const websiteQuality = ['none', 'poor', 'basic', 'good', 'excellent'].includes(parsed.websiteQuality)
      ? parsed.websiteQuality
      : 'basic';
    const techStack = Array.isArray(parsed.techStack)
      ? parsed.techStack.filter((t: unknown) => typeof t === 'string')
      : [];

    // Step 3: Update lead record
    await db.lead.update({
      where: { id: leadId },
      data: {
        websiteQuality,
        hasWebsite: true,
        techStack: JSON.stringify(techStack),
        websiteScreenshotUrl: lead.website, // Store URL as "screenshot" reference
        digitalWeaknesses: parsed.weaknesses || null,
        opportunityNotes: parsed.opportunity || null,
      },
    });

    // Audit log
    await logAuditEvent(userId, 'lead_enriched', {
      leadId,
      type: 'website_screenshot',
      websiteQuality,
      techStack,
      businessName: lead.businessName,
    });

    return {
      success: true,
      description,
      websiteQuality,
      techStack,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ScreenshotService] Failed for lead ${leadId}:`, error);

    return {
      success: false,
      description: '',
      websiteQuality: 'none',
      techStack: [],
      error: message,
    };
  }
}
