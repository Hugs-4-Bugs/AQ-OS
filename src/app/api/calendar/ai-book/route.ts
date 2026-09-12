// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — AI Booking Flow
// POST /api/calendar/ai-book
// Uses AI to pick optimal meeting times and auto-books on Google Calendar
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { withApiLogging } from '@/lib/observability/api-logger';
import { db } from '@/lib/db';
import { getValidCalendarAccessToken } from '@/lib/google-oauth';
import ZAI from 'z-ai-web-dev-sdk';

interface AiBookRequest {
  leadId: string;
  meetingType: string; // video, phone, in-person
  durationMinutes: number;
  preferredTimeRange?: { start: string; end: string }; // e.g. "09:00" - "17:00"
  customInstructions?: string;
}

export const POST = withApiLogging(async (request: NextRequest) => {
  return withAuth(request, async (user) => {
    try {
      const body: AiBookRequest = await request.json();
      const { leadId, meetingType, durationMinutes, preferredTimeRange, customInstructions } = body;

      if (!leadId || !meetingType || !durationMinutes) {
        return NextResponse.json(
          { error: 'Missing required fields: leadId, meetingType, durationMinutes' },
          { status: 400 }
        );
      }

      // Fetch lead details
      const lead = await db.lead.findFirst({
        where: { id: leadId, userId: user.id, isActive: true },
        include: {
          leadAnalysis: true,
        },
      });

      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found or not accessible' },
          { status: 404 }
        );
      }

      // Get calendar availability for next 5 business days
      const now = new Date();
      const fiveDaysLater = new Date(now);
      fiveDaysLater.setDate(fiveDaysLater.getDate() + 7); // 7 calendar days to ensure 5 business days

      const { accessToken, calendarToken } = await getValidCalendarAccessToken(user.id);

      // Fetch freebusy data
      const freebusyResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/freeBusy',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin: now.toISOString(),
            timeMax: fiveDaysLater.toISOString(),
            timeZone: 'UTC',
            items: [{ id: 'primary' }],
          }),
        }
      );

      if (!freebusyResponse.ok) {
        const errorText = await freebusyResponse.text();
        console.error('[AI Book] Freebusy API failed:', errorText);
        return NextResponse.json(
          { error: 'Failed to fetch calendar availability' },
          { status: 502 }
        );
      }

      const freebusyData = await freebusyResponse.json();
      const busyPeriods = freebusyData.calendars?.primary?.busy || [];

      // Also fetch existing events for context
      const eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=25&orderBy=startTime&singleEvents=true&timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(fiveDaysLater.toISOString())}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      let existingEvents: Array<{ summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }> = [];
      if (eventsResponse.ok) {
        const eventsData = await eventsResponse.json();
        existingEvents = eventsData.items || [];
      }

      // Build context for AI
      const leadContext = `
Lead Information:
- Business: ${lead.businessName}
- Owner: ${lead.ownerName || 'Unknown'}
- Niche/Industry: ${lead.niche || 'Unknown'}
- City: ${lead.city || 'Unknown'}, Country: ${lead.country || 'Unknown'}
- Email: ${lead.email || 'N/A'}
- Phone: ${lead.phone || 'N/A'}
- Stage: ${lead.stage}
- Best Contact Time: ${lead.bestTiming || 'Not specified'}
- Outreach Style: ${lead.outreachStyle || 'Not specified'}
${lead.leadAnalysis && lead.leadAnalysis[0] ? `- Best Contact Time (AI): ${lead.leadAnalysis[0].bestContactTime || 'Not specified'}` : ''}`;

      const busyContext = busyPeriods.length > 0
        ? `Busy periods:\n${busyPeriods.map((bp: { start: string; end: string }) => `  - ${new Date(bp.start).toLocaleString()} to ${new Date(bp.end).toLocaleString()}`).join('\n')}`
        : 'No busy periods found.';

      const eventsContext = existingEvents.length > 0
        ? `Existing upcoming events:\n${existingEvents.map(e => `  - "${e.summary || 'No title'}" at ${e.start?.dateTime || 'unknown time'}`).join('\n')}`
        : 'No upcoming events.';

      const preferredRangeStr = preferredTimeRange
        ? `The user prefers meetings between ${preferredTimeRange.start} and ${preferredTimeRange.end} local time.`
        : '';

      const customInstructionsStr = customInstructions
        ? `Additional instructions: ${customInstructions}`
        : '';

      // Use AI to pick the best time
      const zai = await ZAI.create();

      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are an intelligent scheduling assistant for AcquisitionOS. Your job is to pick the optimal meeting time for a sales meeting with a lead.

Given the lead's details, calendar availability, and industry context, suggest the best time slot that:
1. Falls within business hours (9 AM - 6 PM in the lead's timezone if known, otherwise UTC)
2. Does not conflict with existing busy periods
3. Considers the lead's industry/niche for optimal timing (e.g., restaurants are busy at meal times, retail on weekends)
4. Considers the lead's best contact time preference if available
5. Is within the next 5 business days from now

Current date/time: ${now.toISOString()}

${preferredRangeStr}
${customInstructionsStr}

Return your response as a JSON object with EXACTLY these fields:
{
  "suggestedStart": "ISO 8601 datetime string for meeting start",
  "suggestedEnd": "ISO 8601 datetime string for meeting end",
  "reasoning": "Brief explanation of why this time was chosen (2-3 sentences)",
  "timezone": "Suggested timezone for the meeting",
  "confidence": "high|medium|low"
}

Return ONLY valid JSON, no other text.`,
          },
          {
            role: 'user',
            content: `${leadContext}\n\n${busyContext}\n\n${eventsContext}\n\nMeeting duration: ${durationMinutes} minutes\nMeeting type: ${meetingType}\n\nPick the best time for this meeting.`,
          },
        ],
        thinking: { type: 'disabled' },
      });

      const aiResponse = completion.choices?.[0]?.message?.content || '';

      let aiSuggestion: {
        suggestedStart: string;
        suggestedEnd: string;
        reasoning: string;
        timezone: string;
        confidence: string;
      };

      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in AI response');
        aiSuggestion = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('[AI Book] Failed to parse AI response:', aiResponse, parseError);
        return NextResponse.json(
          { error: 'AI failed to suggest a meeting time. Please try again.' },
          { status: 500 }
        );
      }

      // Create the Google Calendar event
      const eventPayload: Record<string, unknown> = {
        summary: `Meeting with ${lead.businessName}`,
        description: `${meetingType.charAt(0).toUpperCase() + meetingType.slice(1)} meeting with ${lead.ownerName || 'contact'} at ${lead.businessName}\n\nLead: ${lead.businessName}\nIndustry: ${lead.niche || 'N/A'}\nStage: ${lead.stage}\n\nScheduled by AcquisitionOS AI Booking`,
        start: {
          dateTime: aiSuggestion.suggestedStart,
          timeZone: aiSuggestion.timezone || 'UTC',
        },
        end: {
          dateTime: aiSuggestion.suggestedEnd,
          timeZone: aiSuggestion.timezone || 'UTC',
        },
      };

      if (lead.email) {
        eventPayload.attendees = [{ email: lead.email }];
      }

      const createResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('[AI Book] Failed to create event:', errorText);

        if (createResponse.status === 401) {
          await db.googleCalendarToken.update({
            where: { id: calendarToken.id },
            data: { isConnected: false },
          });
        }

        return NextResponse.json(
          { error: 'Failed to create calendar event', suggestion: aiSuggestion },
          { status: 502 }
        );
      }

      const event = await createResponse.json();

      // Create audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'calendar_ai_book',
          details: `AI booked meeting with ${lead.businessName} at ${aiSuggestion.suggestedStart}`,
          resource: 'calendar',
          resourceId: event.id,
        },
      });

      // Create notification for the user
      await db.notification.create({
        data: {
          userId: user.id,
          type: 'calendar_event_created',
          title: 'Meeting Auto-Booked',
          message: `AI booked a ${durationMinutes}min ${meetingType} meeting with ${lead.businessName} at ${new Date(aiSuggestion.suggestedStart).toLocaleString()}`,
          actionUrl: event.htmlLink || undefined,
          metadata: JSON.stringify({
            eventId: event.id,
            leadId: lead.id,
            suggestedTime: aiSuggestion.suggestedStart,
            confidence: aiSuggestion.confidence,
          }),
          deliveredVia: 'in_app',
        },
      });

      console.log(`[AI Book] Event created: ${event.id} for lead: ${lead.id}`);

      return NextResponse.json({
        event,
        suggestedTime: {
          start: aiSuggestion.suggestedStart,
          end: aiSuggestion.suggestedEnd,
          timezone: aiSuggestion.timezone,
          confidence: aiSuggestion.confidence,
        },
        reasoning: aiSuggestion.reasoning,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Google Calendar')) {
        return NextResponse.json(
          { error: 'No active Google Calendar connection found. Please connect your Google Calendar first.' },
          { status: 404 }
        );
      }

      console.error('[AI Book] Error:', error);
      return NextResponse.json(
        { error: 'Failed to AI-book meeting' },
        { status: 500 }
      );
    }
  });
}, 'calendar/ai-book');
