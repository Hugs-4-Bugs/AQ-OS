import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    try {
      const userId = user.id;

      // Fetch login history
      const loginHistory = await db.loginHistory.findMany({
        where: { userId },
        select: {
          id: true,
          ip: true,
          userAgent: true,
          country: true,
          city: true,
          success: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const formattedLoginHistory = loginHistory.map(entry => ({
        date: new Date(entry.createdAt).toLocaleString('en', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        }),
        ip: entry.ip || 'Unknown',
        country: entry.country || 'Unknown',
        device: entry.userAgent || 'Unknown',
      }));

      // Fetch active sessions
      const sessions = await db.userSession.findMany({
        where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
        select: {
          id: true,
          deviceInfo: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      const formattedSessions = sessions.map((session, i) => ({
        id: session.id,
        device: session.deviceInfo || session.userAgent || 'Unknown Device',
        location: session.ipAddress || 'Unknown',
        lastActive: i === 0 ? 'Active now' : getRelativeTime(session.updatedAt),
        current: i === 0,
      }));

      // Fetch team members (org members)
      const orgMembers = await db.orgMember.findMany({
        where: { user: { id: userId } },
        include: {
          organization: {
            include: {
              members: {
                include: {
                  user: {
                    select: { id: true, name: true, email: true, avatar: true },
                  },
                },
              },
            },
          },
        },
        take: 1,
      });

      let teamMembers: Array<{ avatar: string; name: string; email: string; role: string }> = [];
      if (orgMembers.length > 0 && orgMembers[0].organization) {
        teamMembers = orgMembers[0].organization.members.map(m => ({
          avatar: m.user.name ? m.user.name.split(' ').map((n: string) => n[0]).join('') : '?',
          name: m.user.name || 'Unknown',
          email: m.user.email,
          role: m.role,
        }));
      }

      // Fetch pending invites
      const pendingInvites = await db.orgInvitation.findMany({
        where: { invitedBy: userId, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const formattedPendingInvites = pendingInvites.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        sentAt: getRelativeTime(inv.createdAt),
      }));

      return NextResponse.json({
        data: {
          loginHistory: formattedLoginHistory,
          sessions: formattedSessions,
          teamMembers,
          pendingInvites: formattedPendingInvites,
        },
      });
    } catch (error) {
      console.error('[API] Settings error:', error);
      return NextResponse.json({
        data: {
          loginHistory: [],
          sessions: [],
          teamMembers: [],
          pendingInvites: [],
        },
        error: 'Failed to fetch settings data',
      }, { status: 500 });
    }
  });
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
