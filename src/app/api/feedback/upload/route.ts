import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// POST /api/feedback/upload — upload screenshots / screen recordings
// Accepts multipart/form-data with a "files" field (one or more files).
// Stores files in /public/feedback-uploads and returns public URLs.
//
// FIX (2026-09-09): This route was missing entirely — the FeedbackModal
// called /api/feedback/upload but no handler existed, so every upload
// attempt 404'd and screenshots/videos were never attached to feedback.

const MAX_FILES = 5;
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB per file (raised from 5MB to cover typical short screen recordings)
const ALLOWED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED = [...ALLOWED_IMAGE, ...ALLOWED_VIDEO];

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'feedback-uploads');
const PUBLIC_BASE = '/feedback-uploads';

function safeExt(name: string): string {
  const ext = path.extname(name).toLowerCase();
  // Only allow safe extensions
  if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
  return '';
}

export async function POST(request: NextRequest) {
  // Auth check
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'Content-Type must be multipart/form-data' },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const all = formData.getAll('files');
  if (!all || all.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  if (all.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files. Maximum ${MAX_FILES} files per upload.` },
      { status: 400 },
    );
  }

  // Ensure upload dir exists
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch {
    // ignore — likely already exists
  }

  const urls: string[] = [];
  const errors: string[] = [];

  for (const entry of all) {
    if (!(entry instanceof File || entry instanceof Blob)) {
      errors.push('Skipped non-file entry');
      continue;
    }
    const file = entry as File;
    const name = file.name || 'upload';
    const type = file.type || '';

    if (!ALLOWED.includes(type)) {
      errors.push(`${name}: unsupported file type (${type || 'unknown'})`);
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${name}: exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      continue;
    }

    if (file.size === 0) {
      errors.push(`${name}: empty file`);
      continue;
    }

    // Build a unique, safe filename: <userId>-<timestamp>-<rand><ext>
    const ext = safeExt(name) || (type.startsWith('image/') ? '.png' : '.mp4');
    const rand = crypto.randomBytes(6).toString('hex');
    const filename = `${authUser.id}-${Date.now()}-${rand}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await writeFile(filePath, buffer);
      urls.push(`${PUBLIC_BASE}/${filename}`);
    } catch (err) {
      console.error('[feedback/upload] write failed:', err);
      errors.push(`${name}: failed to save`);
    }
  }

  if (urls.length === 0) {
    return NextResponse.json(
      { error: errors[0] || 'No files uploaded', details: errors },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    urls,
    errors: errors.length > 0 ? errors : undefined,
  });
}
