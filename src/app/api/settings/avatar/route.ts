import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import sharp from 'sharp';

// POST /api/settings/avatar — Upload avatar image
// Accepts multipart/form-data with a "file" field
// Resizes to 256x256, stores as base64 data URL in User.avatar
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Content-Type must be multipart/form-data' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB' },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Resize to 256x256 and convert to JPEG for consistency
    const resizedBuffer = await sharp(buffer)
      .resize(256, 256, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Convert to base64 data URL
    const base64 = resizedBuffer.toString('base64');
    const avatarUrl = `data:image/jpeg;base64,${base64}`;

    // Update user avatar in DB
    await db.user.update({
      where: { id: authUser.id },
      data: { avatar: avatarUrl },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: authUser.id,
        action: 'avatar_update',
        details: JSON.stringify({ fileType: file.type, fileSize: file.size }),
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({
      avatar: avatarUrl,
      message: 'Avatar updated successfully',
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload avatar' },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/avatar — Remove avatar
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request);
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await db.user.update({
      where: { id: authUser.id },
      data: { avatar: null },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: authUser.id,
        action: 'avatar_remove',
        details: 'Avatar removed by user',
        ipAddress: request.headers.get('x-forwarded-for') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({
      message: 'Avatar removed successfully',
    });
  } catch (error) {
    console.error('Avatar removal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove avatar' },
      { status: 500 }
    );
  }
}
