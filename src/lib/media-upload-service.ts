// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Media Upload Service
// Phase 10: Messaging Remediation — Media handling, validation, thumbnails
// ═══════════════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { writeFile, mkdir, unlink, access, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { createHash } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────

export interface MediaUploadInput {
  userId: string;
  fileName: string;
  fileData: string | Buffer; // base64 string or Buffer
  mimeType: string;
  fileType?: 'image' | 'document' | 'audio' | 'video';
  metadata?: Record<string, unknown>;
}

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  fileType?: 'image' | 'document' | 'audio' | 'video';
  sizeBytes?: number;
}

export interface MediaMetadataResult {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  thumbnailPath: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// ─── Constants ────────────────────────────────────────────────────

const UPLOAD_BASE_DIR = join(process.cwd(), 'uploads');
const THUMBNAIL_DIR = join(UPLOAD_BASE_DIR, 'thumbnails');

const ALLOWED_MIME_TYPES: Record<string, 'image' | 'document' | 'audio' | 'video'> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
  // Audio
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  // Video
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
};

const MAX_FILE_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024,    // 10 MB
  document: 25 * 1024 * 1024,  // 25 MB
  audio: 20 * 1024 * 1024,     // 20 MB
  video: 100 * 1024 * 1024,    // 100 MB
};

const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 200;

// ─── Helper Functions ─────────────────────────────────────────────

function getFileTypeFromMime(mimeType: string): 'image' | 'document' | 'audio' | 'video' | null {
  return ALLOWED_MIME_TYPES[mimeType] ?? null;
}

function getSubdirForType(fileType: string): string {
  switch (fileType) {
    case 'image': return 'images';
    case 'document': return 'documents';
    case 'audio': return 'audio';
    case 'video': return 'video';
    default: return 'misc';
  }
}

function generateUniqueFileName(originalName: string): string {
  const ext = extname(originalName).toLowerCase();
  const hash = createHash('sha256')
    .update(`${originalName}-${Date.now()}-${Math.random()}`)
    .digest('hex')
    .substring(0, 16);
  const timestamp = Date.now();
  return `${timestamp}_${hash}${ext}`;
}

async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await access(dirPath);
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

function decodeBase64(base64Data: string): Buffer {
  const base64Clean = base64Data.replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(base64Clean, 'base64');
}

// ─── Core Service Functions ───────────────────────────────────────

/**
 * Validate a media file before upload
 */
export function validateMediaFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number
): MediaValidationResult {
  // Check MIME type
  const fileType = getFileTypeFromMime(mimeType);
  if (!fileType) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Allowed types: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}`,
    };
  }

  // Check file extension matches MIME type
  const ext = extname(fileName).toLowerCase();
  const validExtensions: Record<string, string[]> = {
    image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'],
    audio: ['.mp3', '.ogg', '.wav', '.aac', '.m4a'],
    video: ['.mp4', '.webm', '.mov', '.avi'],
  };

  const allowedExts = validExtensions[fileType] || [];
  if (ext && !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `File extension "${ext}" does not match file type "${fileType}"`,
    };
  }

  // Check file size
  const maxSize = MAX_FILE_SIZES[fileType];
  if (sizeBytes > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    const actualMB = Math.round(sizeBytes / (1024 * 1024));
    return {
      valid: false,
      error: `File size ${actualMB}MB exceeds maximum ${maxMB}MB for ${fileType} files`,
    };
  }

  return {
    valid: true,
    fileType,
    sizeBytes,
  };
}

/**
 * Generate a thumbnail for an image file
 * For non-image files or when sharp is not available, returns null
 */
export async function generateThumbnail(
  filePath: string,
  fileType: string,
  fileName: string
): Promise<string | null> {
  if (fileType !== 'image') {
    return null;
  }

  try {
    await ensureDirectoryExists(THUMBNAIL_DIR);

    const thumbFileName = `thumb_${fileName}`;
    const thumbPath = join(THUMBNAIL_DIR, thumbFileName);

    // Simple thumbnail generation using basic approach
    // In production, you'd use sharp or ImageMagick
    // For now, we create a reference to the original (placeholder)
    const originalData = await readFile(filePath);

    // Create a simple thumbnail marker file
    // In production, this would resize the image
    const thumbMeta = {
      originalPath: filePath,
      generatedAt: new Date().toISOString(),
      maxWidth: THUMBNAIL_MAX_WIDTH,
      maxHeight: THUMBNAIL_MAX_HEIGHT,
    };

    // For the thumbnail, we copy the original as-is (production would resize)
    await writeFile(thumbPath, originalData);
    await writeFile(
      `${thumbPath}.meta.json`,
      JSON.stringify(thumbMeta, null, 2)
    );

    return thumbPath;
  } catch (error) {
    console.error('Thumbnail generation failed:', error);
    return null;
  }
}

/**
 * Upload a media file — stores to disk and tracks in database
 */
export async function uploadMedia(input: MediaUploadInput): Promise<{
  success: boolean;
  mediaId?: string;
  error?: string;
}> {
  try {
    // Decode file data
    const fileBuffer = typeof input.fileData === 'string'
      ? decodeBase64(input.fileData)
      : input.fileData;

    const fileSize = fileBuffer.length;

    // Determine file type
    const fileType = input.fileType || getFileTypeFromMime(input.mimeType);
    if (!fileType) {
      return { success: false, error: `Unsupported MIME type: ${input.mimeType}` };
    }

    // Validate
    const validation = validateMediaFile(input.fileName, input.mimeType, fileSize);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Generate unique filename and paths
    const uniqueFileName = generateUniqueFileName(input.fileName);
    const subDir = getSubdirForType(fileType);
    const fullDir = join(UPLOAD_BASE_DIR, subDir, input.userId);

    await ensureDirectoryExists(fullDir);

    const filePath = join(fullDir, uniqueFileName);

    // Write file to disk
    await writeFile(filePath, fileBuffer);

    // Generate thumbnail for images
    let thumbnailPath: string | null = null;
    try {
      thumbnailPath = await generateThumbnail(filePath, fileType, uniqueFileName);
    } catch (e) {
      console.warn('Thumbnail generation skipped:', e);
    }

    // Build metadata
    const fileMetadata: Record<string, unknown> = {
      originalName: input.fileName,
      uploadTimestamp: new Date().toISOString(),
      ...input.metadata,
    };

    // Add image dimensions if available (placeholder for production)
    if (fileType === 'image') {
      fileMetadata.width = null;
      fileMetadata.height = null;
    }

    // Save to database
    const mediaFile = await db.mediaFile.create({
      data: {
        userId: input.userId,
        fileName: uniqueFileName,
        fileType,
        fileSize,
        mimeType: input.mimeType,
        filePath,
        thumbnailPath,
        metadata: JSON.stringify(fileMetadata),
      },
    });

    return { success: true, mediaId: mediaFile.id };
  } catch (error) {
    console.error('Media upload failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown upload error',
    };
  }
}

/**
 * Get the URL for a media file
 */
export function getMediaUrl(mediaId: string): string {
  return `/api/messaging/media/${mediaId}`;
}

/**
 * Get media file metadata from database
 */
export async function getMediaMetadata(mediaId: string): Promise<MediaMetadataResult | null> {
  try {
    const mediaFile = await db.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!mediaFile) return null;

    return {
      id: mediaFile.id,
      fileName: mediaFile.fileName,
      fileType: mediaFile.fileType,
      fileSize: mediaFile.fileSize,
      mimeType: mediaFile.mimeType,
      filePath: mediaFile.filePath,
      thumbnailPath: mediaFile.thumbnailPath,
      metadata: mediaFile.metadata ? JSON.parse(mediaFile.metadata) : null,
      createdAt: mediaFile.createdAt,
    };
  } catch (error) {
    console.error('Get media metadata failed:', error);
    return null;
  }
}

/**
 * Delete a media file from disk and database
 */
export async function deleteMedia(mediaId: string, userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Verify ownership
    const mediaFile = await db.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!mediaFile) {
      return { success: false, error: 'Media file not found' };
    }

    if (mediaFile.userId !== userId) {
      return { success: false, error: 'Not authorized to delete this file' };
    }

    // Delete file from disk
    try {
      await unlink(mediaFile.filePath);
    } catch (e) {
      console.warn('File deletion from disk failed (may already be deleted):', e);
    }

    // Delete thumbnail from disk
    if (mediaFile.thumbnailPath) {
      try {
        await unlink(mediaFile.thumbnailPath);
        await unlink(`${mediaFile.thumbnailPath}.meta.json`).catch(() => {});
      } catch (e) {
        console.warn('Thumbnail deletion from disk failed:', e);
      }
    }

    // Delete from database
    await db.mediaFile.delete({
      where: { id: mediaId },
    });

    return { success: true };
  } catch (error) {
    console.error('Media deletion failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown deletion error',
    };
  }
}

/**
 * Get file stats from disk
 */
export async function getMediaFileStats(filePath: string): Promise<{
  size: number;
  modified: Date;
} | null> {
  try {
    const stats = await stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime,
    };
  } catch {
    return null;
  }
}

/**
 * Read media file from disk for serving
 */
export async function readMediaFile(mediaId: string, userId: string): Promise<{
  data: Buffer | null;
  mimeType: string | null;
  fileName: string | null;
  error?: string;
}> {
  try {
    const mediaFile = await db.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!mediaFile) {
      return { data: null, mimeType: null, fileName: null, error: 'File not found' };
    }

    if (mediaFile.userId !== userId) {
      return { data: null, mimeType: null, fileName: null, error: 'Not authorized' };
    }

    const fileBuffer = await readFile(mediaFile.filePath);
    return {
      data: fileBuffer,
      mimeType: mediaFile.mimeType,
      fileName: mediaFile.fileName,
    };
  } catch (error) {
    return {
      data: null,
      mimeType: null,
      fileName: null,
      error: error instanceof Error ? error.message : 'File read error',
    };
  }
}
