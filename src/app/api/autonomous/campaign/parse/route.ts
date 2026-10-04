// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Campaign Instruction Parse API
// POST: Parse natural language instruction into campaign config
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  return withAuth(request, async () => {
    try {
      const body = await request.json();
      const { instruction } = body;

      if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
        return NextResponse.json(
          { error: 'Instruction is required' },
          { status: 400 }
        );
      }

      let zai: Awaited<ReturnType<typeof ZAI.create>>;
      try {
        zai = await ZAI.create();
      } catch {
        return NextResponse.json(
          { error: 'AI SDK initialization failed' },
          { status: 500 }
        );
      }

      const parsePrompt = `You are a campaign configuration parser. Parse the following natural language instruction into a structured campaign configuration.

INSTRUCTION: "${instruction.trim()}"

Extract the following fields:
- niche: The business industry/type (e.g., "dentists", "real estate agents", "restaurants")
- country: The country name (e.g., "India", "United States", "United Kingdom")
- city: The city name if mentioned (e.g., "Mumbai", "California", "London")
- maxLeads: Number of leads requested, default 20 if not specified
- tone: Communication tone, one of "professional", "casual", "friendly", "urgent", "formal"
- channel: Preferred outreach channel, one of "email", "whatsapp", "linkedin"

Return ONLY a JSON object with these fields. No markdown, no explanation.
Example: {"niche": "dentists", "country": "India", "city": "Mumbai", "maxLeads": 20, "tone": "professional", "channel": "email"}`;

      const response = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a precise data extraction assistant. Return only valid JSON. No markdown formatting.' },
          { role: 'user', content: parsePrompt },
        ],
        model: 'auto',
      });

      const content = response.choices?.[0]?.message?.content || '{}';

      let cleaned = content.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleaned);

      const config = {
        niche: String(parsed.niche || '').trim(),
        country: String(parsed.country || '').trim(),
        city: String(parsed.city || '').trim(),
        maxLeads: Math.min(Math.max(parseInt(String(parsed.maxLeads), 10) || 20, 1), 200),
        tone: ['professional', 'casual', 'friendly', 'urgent', 'formal'].includes(parsed.tone)
          ? parsed.tone : 'professional',
        channel: ['email', 'whatsapp', 'linkedin'].includes(parsed.channel)
          ? parsed.channel : 'email',
      };

      return NextResponse.json(config);
    } catch (error) {
      console.error('[CampaignParseAPI] POST error:', error);
      return NextResponse.json(
        { error: 'Failed to parse instruction' },
        { status: 500 }
      );
    }
  });
}
