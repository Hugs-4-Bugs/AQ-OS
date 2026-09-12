// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Gmail Inbox
// GET /api/gmail/inbox
// Fetches the user's Gmail inbox messages with headers
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { getValidGmailAccessToken } from '@/lib/google-oauth';

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePayload {
  headers: GmailMessageHeader[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailMessagePayload;
  labelIds?: string[];
}

interface InboxMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      // Get valid Gmail access token (refreshes if expired)
      const { accessToken, emailAccount } = await getValidGmailAccessToken(user.id);

      // Fetch message list from Gmail API
      const listResponse = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('[Gmail Inbox] Failed to fetch messages:', errorText);

        if (listResponse.status === 401) {
          await db.emailAccount.update({
            where: { id: emailAccount.id },
            data: { status: 'expired' },
          });
          return NextResponse.json(
            { error: 'Gmail token expired. Please reconnect your Gmail account.' },
            { status: 401 }
          );
        }

        return NextResponse.json(
          { error: 'Failed to fetch inbox from Gmail' },
          { status: 502 }
        );
      }

      const listData = await listResponse.json();
      const messages: { id: string; threadId: string }[] = listData.messages || [];

      if (messages.length === 0) {
        return NextResponse.json({
          messages: [],
          totalUnread: 0,
        });
      }

      // Fetch details for each message (headers + snippet)
      const detailPromises = messages.map(async (msg): Promise<InboxMessage | null> => {
        try {
          const detailResponse = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          if (!detailResponse.ok) {
            console.warn('[Gmail Inbox] Failed to fetch message:', msg.id);
            return null;
          }

          const detail: GmailMessage = await detailResponse.json();
          const headers = detail.payload?.headers || [];

          const getHeader = (name: string): string => {
            const header = headers.find(
              (h) => h.name.toLowerCase() === name.toLowerCase()
            );
            return header?.value || '';
          };

          const isUnread = detail.labelIds?.includes('UNREAD') ?? false;

          return {
            id: detail.id,
            threadId: detail.threadId,
            from: getHeader('From'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            snippet: detail.snippet || '',
            isUnread,
          };
        } catch {
          return null;
        }
      });

      const detailResults = await Promise.all(detailPromises);
      const inboxMessages: InboxMessage[] = detailResults.filter(
        (m): m is InboxMessage => m !== null
      );

      // Count total unread (from the current batch)
      const totalUnread = inboxMessages.filter((m) => m.isUnread).length;

      // Update lastPollAt on the email account
      await db.emailAccount.update({
        where: { id: emailAccount.id },
        data: { lastPollAt: new Date() },
      });

      return NextResponse.json({
        messages: inboxMessages,
        totalUnread,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('No active Gmail account')) {
        return NextResponse.json(
          { error: 'No active Gmail account found. Please connect your Gmail account first.' },
          { status: 404 }
        );
      }

      if (errorMessage.includes('Token refresh failed')) {
        return NextResponse.json(
          { error: 'Gmail token expired and refresh failed. Please reconnect your Gmail account.' },
          { status: 401 }
        );
      }

      console.error('[Gmail Inbox] Error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch inbox' },
        { status: 500 }
      );
    }
  });
}
