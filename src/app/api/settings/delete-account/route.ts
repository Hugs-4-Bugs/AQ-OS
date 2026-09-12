import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, verifyPassword } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/settings/delete-account - GDPR-compliant account deletion (soft delete)
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { password, confirmation } = body;

    // Validate required fields
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    if (confirmation !== 'DELETE') {
      return NextResponse.json(
        { error: 'Confirmation must be "DELETE"' },
        { status: 400 }
      );
    }

    // Get user with password hash for verification
    const user = await db.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        authProvider: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Verify password
    if (user.passwordHash) {
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Incorrect password' },
          { status: 401 }
        );
      }
    } else if (user.authProvider === 'google') {
      return NextResponse.json(
        { error: 'This account uses Google authentication. Please contact support to delete your account.' },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: 'No password set for this account. Please contact support.' },
        { status: 400 }
      );
    }

    // Perform soft delete in a transaction
    await db.$transaction(async (tx) => {
      // 1. Soft delete the user
      await tx.user.update({
        where: { id: authUser.id },
        data: {
          isActive: false,
          deletedAt: new Date(),
        },
      });

      // 2. Revoke all sessions
      await tx.userSession.updateMany({
        where: {
          userId: authUser.id,
          isRevoked: false,
        },
        data: { isRevoked: true },
      });

      // 3. Create GDPR request record
      await tx.gdprRequest.create({
        data: {
          userId: authUser.id,
          requestType: 'deletion',
          status: 'processing',
          notes: 'User-initiated account deletion via settings. Soft delete applied.',
        },
      });

      // 4. Create audit log
      await tx.auditLog.create({
        data: {
          userId: authUser.id,
          action: 'account_deletion',
          details: JSON.stringify({
            email: user.email,
            name: user.name,
            deletionType: 'soft_delete',
            confirmedWithPassword: true,
          }),
          ipAddress: request.headers.get('x-forwarded-for') || null,
          userAgent: request.headers.get('user-agent') || null,
          resource: 'user',
          resourceId: authUser.id,
        },
      });
    });

    // Clear auth cookies on the response
    const response = NextResponse.json({
      message: 'Account deletion initiated. Your account has been deactivated and will be permanently deleted within 30 days.',
      deletionStatus: 'processing',
    });

    response.cookies.set('access_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });

    response.cookies.set('refresh_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
