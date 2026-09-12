// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Upload Security
// Phase 14.3: Security Hardening
//
// File type whitelist, size limits, magic bytes validation,
// filename sanitization, safe storage paths, and middleware.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import crypto from 'crypto';

// ===== TYPES =====

export interface UploadConfig {
  /** Maximum file size in bytes (default: 10MB) */
  maxFileSizeBytes?: number;
  /** Allowed MIME type categories */
  allowedCategories?: ('image' | 'document' | 'data')[];
  /** Allowed specific MIME types (overrides categories) */
  allowedMimeTypes?: string[];
  /** Allowed file extensions (without dot) */
  allowedExtensions?: string[];
  /** Maximum filename length */
  maxFilenameLength?: number;
  /** Whether to validate magic bytes */
  validateMagicBytes?: boolean;
  /** Safe storage base path */
  storageBasePath?: string;
}

export interface UploadValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedFilename: string;
  safeStoragePath: string | null;
  detectedMimeType: string | null;
}

// ===== CONSTANTS =====

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILENAME_LENGTH = 255;

const MIME_TYPE_CATEGORIES: Record<string, string[]> = {
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
  ],
  data: [
    'application/json',
    'text/csv',
  ],
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  json: 'application/json',
};

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'application/zip': [0x50, 0x4b, 0x03, 0x04], // Also xlsx, docx
};

// ===== FILENAME SANITIZATION =====

/**
 * Sanitize a filename by removing dangerous characters and patterns.
 */
export function sanitizeUploadFilename(filename: string): string {
  // Remove path components
  const basename = filename.split(/[/\\]/).pop() || 'file';

  let sanitized = basename
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove path traversal
    .replace(/\.\./g, '')
    // Remove leading dots (hidden files)
    .replace(/^\.+/, '_')
    // Remove dangerous characters
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    // Replace spaces with underscores
    .replace(/\s+/g, '_')
    // Remove consecutive underscores
    .replace(/_+/g, '_')
    // Remove trailing dots and spaces
    .replace(/[.\s]+$/, '');

  // Ensure we have a valid filename
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'upload_' + Date.now();
  }

  // Limit length
  sanitized = sanitized.substring(0, DEFAULT_MAX_FILENAME_LENGTH);

  return sanitized;
}

// ===== MIME TYPE DETECTION =====

/**
 * Detect MIME type from magic bytes in a file buffer.
 */
export function detectMimeTypeFromBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  for (const [mimeType, magicBytes] of Object.entries(MAGIC_BYTES)) {
    let match = true;
    for (let i = 0; i < magicBytes.length; i++) {
      if (buffer[i] !== magicBytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return mimeType;
  }

  return null;
}

/**
 * Get MIME type from file extension.
 */
export function getMimeTypeFromExtension(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXTENSION_MIME_MAP[ext] || null;
}

// ===== SAFE STORAGE PATH =====

/**
 * Generate a safe storage path for an uploaded file.
 * Uses UUID-based directories to prevent predictable paths.
 */
export function generateSafeStoragePath(
  filename: string,
  basePath?: string
): string {
  const base = basePath || process.env.UPLOAD_STORAGE_PATH || './uploads';
  const datePrefix = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const randomDir = crypto.randomBytes(8).toString('hex');
  const safeFilename = sanitizeUploadFilename(filename);

  // Build path: base/YYYY-MM-DD/randomDir/filename
  return path.join(base, datePrefix, randomDir, safeFilename);
}

/**
 * Validate that a resolved path is within the allowed base directory.
 * Prevents path traversal in storage operations.
 */
export function isPathSafe(resolvedPath: string, basePath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(resolvedPath);
  return normalizedTarget.startsWith(normalizedBase + path.sep) ||
         normalizedTarget === normalizedBase;
}

// ===== UPLOAD VALIDATION =====

/**
 * Validate an uploaded file comprehensively.
 */
export function validateUpload(
  filename: string,
  mimeType: string,
  size: number,
  buffer: Buffer | null,
  config: UploadConfig = {}
): UploadValidationResult {
  const errors: string[] = [];
  const maxFileSize = config.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE;
  const maxFilenameLength = config.maxFilenameLength || DEFAULT_MAX_FILENAME_LENGTH;

  // 1. Check file size
  if (size <= 0) {
    errors.push('File is empty');
  } else if (size > maxFileSize) {
    errors.push(`File size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds limit (${(maxFileSize / 1024 / 1024).toFixed(1)}MB)`);
  }

  // 2. Sanitize filename
  const sanitizedFilename = sanitizeUploadFilename(filename);

  // 3. Check filename length
  if (sanitizedFilename.length > maxFilenameLength) {
    errors.push(`Filename exceeds maximum length of ${maxFilenameLength} characters`);
  }

  // 4. Check for double extensions (e.g., file.php.jpg)
  const extensionParts = sanitizedFilename.split('.');
  if (extensionParts.length > 2) {
    // Check if any intermediate extension is dangerous
    const dangerousExtensions = ['php', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'sh', 'bat', 'exe', 'dll', 'so'];
    for (let i = 1; i < extensionParts.length - 1; i++) {
      if (dangerousExtensions.includes(extensionParts[i].toLowerCase())) {
        errors.push('Double file extensions with executable types are not allowed');
        break;
      }
    }
  }

  // 5. Validate MIME type
  const allowedMimeTypes = config.allowedMimeTypes ||
    (config.allowedCategories || ['image', 'document', 'data'])
      .flatMap(cat => MIME_TYPE_CATEGORIES[cat] || []);

  if (!allowedMimeTypes.includes(mimeType)) {
    errors.push(`MIME type "${mimeType}" is not allowed`);
  }

  // 6. Validate file extension
  if (config.allowedExtensions) {
    const ext = sanitizedFilename.split('.').pop()?.toLowerCase();
    if (!ext || !config.allowedExtensions.includes(ext)) {
      errors.push(`File extension is not allowed. Allowed: ${config.allowedExtensions.join(', ')}`);
    }
  }

  // 7. Validate magic bytes if buffer provided
  let detectedMimeType: string | null = null;
  if (buffer && buffer.length > 0 && config.validateMagicBytes !== false) {
    detectedMimeType = detectMimeTypeFromBytes(buffer);
    if (detectedMimeType && detectedMimeType !== mimeType) {
      // Allow application/zip to match xlsx/docx
      const zipBased = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      if (!(detectedMimeType === 'application/zip' && zipBased.includes(mimeType))) {
        errors.push(`File content (${detectedMimeType}) does not match declared type (${mimeType})`);
      }
    }
  }

  // 8. Generate safe storage path
  const safeStoragePath = errors.length === 0
    ? generateSafeStoragePath(sanitizedFilename, config.storageBasePath)
    : null;

  return {
    valid: errors.length === 0,
    errors,
    sanitizedFilename,
    safeStoragePath,
    detectedMimeType,
  };
}

// ===== UPLOAD MIDDLEWARE =====

/**
 * Upload security middleware for API routes.
 *
 * Usage:
 *   export async function POST(request: NextRequest) {
 *     const uploadCheck = await withUploadSecurity(request, {
 *       allowedCategories: ['image'],
 *       maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
 *     });
 *     if (uploadCheck.error) return uploadCheck.error;
 *     // ... process the upload
 *   }
 */
export async function withUploadSecurity(
  request: NextRequest,
  config: UploadConfig = {}
): Promise<{
  error: NextResponse | null;
  result: UploadValidationResult | null;
}> {
  const contentType = request.headers.get('content-type') || '';

  // Check if it's a multipart form upload
  if (!contentType.includes('multipart/form-data') && !contentType.includes('application/octet-stream')) {
    return {
      error: NextResponse.json(
        { error: 'Invalid content type for file upload' },
        { status: 400 }
      ),
      result: null,
    };
  }

  // Check content length header (if available)
  const contentLength = request.headers.get('content-length');
  const maxSize = config.maxFileSizeBytes || DEFAULT_MAX_FILE_SIZE;
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (length > maxSize) {
      return {
        error: NextResponse.json(
          {
            error: 'File too large',
            message: `Upload size (${(length / 1024 / 1024).toFixed(1)}MB) exceeds limit (${(maxSize / 1024 / 1024).toFixed(1)}MB)`,
          },
          { status: 413 }
        ),
        result: null,
      };
    }
  }

  // Note: Full file validation (MIME type, magic bytes, etc.) happens after
  // the file is read from the request body. The middleware here does
  // content-type and size pre-checks.
  return { error: null, result: null };
}

/**
 * Get the list of allowed MIME types for a given configuration.
 */
export function getAllowedMimeTypes(config: UploadConfig = {}): string[] {
  if (config.allowedMimeTypes) return config.allowedMimeTypes;
  return (config.allowedCategories || ['image', 'document', 'data'])
    .flatMap(cat => MIME_TYPE_CATEGORIES[cat] || []);
}
