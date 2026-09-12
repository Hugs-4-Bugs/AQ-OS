// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Input Validation & Sanitization
// Phase 14.3: Security Hardening
//
// SQL injection detection, XSS sanitization, path traversal detection,
// command injection detection, file upload validation, and Zod-based
// schema validation middleware.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodSchema } from 'zod';

// ===== SQL INJECTION DETECTION =====

const SQL_INJECTION_PATTERNS: RegExp[] = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|WHERE|SET|DATABASE)\b)/is,
  /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
  /('.*;\s*(DROP|DELETE|ALTER|CREATE))/i,
  /(\bUNION\b\s+\bSELECT\b)/is,
  /(\bEXEC\b\s*\()/i,
  /(--\s*$)/m,
  /(;\\s*(DROP|DELETE|ALTER|CREATE|INSERT|UPDATE))/i,
  /(\bCHAR\s*\(\s*\d+\s*\))/i,
  /(\bCONCAT\s*\()/i,
  /(\bSLEEP\s*\(\s*\d+\s*\))/i,
  /(\bBENCHMARK\s*\()/i,
  /(\bLOAD_FILE\s*\()/i,
  /(\bINTO\s+OUTFILE\b)/i,
];

/**
 * Detect potential SQL injection in a string.
 * Returns true if suspicious patterns are found.
 */
export function detectSqlInjection(input: string): boolean {
  if (typeof input !== 'string') return false;
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

// ===== XSS SANITIZATION =====

const XSS_PATTERNS: RegExp[] = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b/gi,
  /<object\b/gi,
  /<embed\b/gi,
  /<link\b/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /on\w+\s*=/gi, // onclick=, onload=, etc.
  /<svg\b[^>]*\bon\w+/gi,
  /<img\b[^>]*\bon\w+/gi,
  /<input\b[^>]*\bon\w+/gi,
  /<body\b[^>]*\bon\w+/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*javascript:/gi,
  /data\s*:\s*text\/html/gi,
];

/**
 * Detect potential XSS in a string.
 * Returns true if suspicious patterns are found.
 */
export function detectXss(input: string): boolean {
  if (typeof input !== 'string') return false;
  return XSS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Sanitize a string by removing/escaping dangerous HTML patterns.
 * Returns the sanitized string.
 */
export function sanitizeXss(input: string): string {
  if (typeof input !== 'string') return input;

  let sanitized = input;
  // Remove script tags and content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove dangerous tags
  sanitized = sanitized.replace(/<\/?(iframe|object|embed|link|form)\b[^>]*>/gi, '');
  // Remove event handlers
  sanitized = sanitized.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');
  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript\s*:/gi, '');
  // Remove vbscript: URLs
  sanitized = sanitized.replace(/vbscript\s*:/gi, '');
  // Remove data:text/html
  sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');

  return sanitized;
}

// ===== PATH TRAVERSAL DETECTION =====

const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /\.\.\//,
  /\.\.\\/,
  /\.\./,
  /%2e%2e%2f/i,
  /%2e%2e\//i,
  /\.\.%2f/i,
  /%2e%2e%5c/i,
  /%2e%2e\\/i,
  /\.\.%5c/i,
];

/**
 * Detect potential path traversal in a string.
 * Returns true if suspicious patterns are found.
 */
export function detectPathTraversal(input: string): boolean {
  if (typeof input !== 'string') return false;
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(input));
}

// ===== COMMAND INJECTION DETECTION =====

const COMMAND_INJECTION_PATTERNS: RegExp[] = [
  /[;&|`$(){}[\]]/,
  /\b(rm|cat|ls|wget|curl|bash|sh|python|perl|ruby|node|nc|ncat|netcat)\b/i,
  /\b(eval|exec|system|passthru|shell_exec|popen|proc_open)\s*\(/i,
  /\b(sudo|su|chmod|chown|chroot)\b/i,
  /\b(crontab|at|batch)\b/i,
  />>|>/,
  /\b(\/etc\/passwd|\/etc\/shadow|\/proc\/|\/sys\/)\b/,
];

/**
 * Detect potential command injection in a string.
 * Returns true if suspicious patterns are found.
 */
export function detectCommandInjection(input: string): boolean {
  if (typeof input !== 'string') return false;
  return COMMAND_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

// ===== FILE UPLOAD VALIDATION =====

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
  ],
  data: ['application/json', 'text/csv'],
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Known magic bytes (file signatures) for allowed file types.
 */
const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
  'application/zip': [0x50, 0x4b, 0x03, 0x04], // Also xlsx, docx
};

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedFilename?: string;
}

/**
 * Validate a file upload.
 * Checks: MIME type, file size, filename, and optionally magic bytes.
 */
export function validateFileUpload(params: {
  filename: string;
  mimeType: string;
  size: number;
  allowedCategories?: string[];
  maxSizeBytes?: number;
  buffer?: Buffer;
}): FileValidationResult {
  const errors: string[] = [];
  const {
    filename,
    mimeType,
    size,
    allowedCategories = ['image', 'document', 'data'],
    maxSizeBytes = MAX_FILE_SIZE_BYTES,
    buffer,
  } = params;

  // Check file size
  if (size > maxSizeBytes) {
    errors.push(`File size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds limit (${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB)`);
  }

  if (size === 0) {
    errors.push('File is empty');
  }

  // Check MIME type against allowed categories
  const allowedMimeTypes = allowedCategories
    .flatMap(cat => ALLOWED_MIME_TYPES[cat] || []);
  if (!allowedMimeTypes.includes(mimeType)) {
    errors.push(`MIME type "${mimeType}" is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
  }

  // Validate filename
  const sanitizedFilename = sanitizeFilename(filename);
  if (sanitizedFilename !== filename) {
    errors.push('Filename contains invalid characters');
  }

  // Check for double extensions
  if (/\.[^.]+\.[^.]+$/.test(filename)) {
    errors.push('Double file extensions are not allowed');
  }

  // Validate magic bytes if buffer provided
  if (buffer && buffer.length >= 4) {
    const expectedBytes = MAGIC_BYTES[mimeType];
    if (expectedBytes) {
      const matches = expectedBytes.every((byte, idx) => buffer[idx] === byte);
      if (!matches) {
        errors.push('File content does not match the declared MIME type');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedFilename,
  };
}

/**
 * Sanitize a filename by removing dangerous characters.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid chars
    .replace(/\.\./g, '') // Remove path traversal
    .replace(/^\./, '_') // Don't start with a dot
    .replace(/\s+/g, '_') // Replace spaces
    .substring(0, 255); // Limit length
}

// ===== COMPREHENSIVE INPUT VALIDATION =====

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  threats: string[];
}

/**
 * Validate a string input for common attack vectors.
 */
export function validateInput(input: string, fieldName?: string): ValidationResult {
  const errors: string[] = [];
  const threats: string[] = [];
  const label = fieldName ? `Field "${fieldName}"` : 'Input';

  if (detectSqlInjection(input)) {
    errors.push(`${label} contains potentially malicious SQL patterns`);
    threats.push('sql_injection');
  }

  if (detectXss(input)) {
    errors.push(`${label} contains potentially malicious HTML/JavaScript patterns`);
    threats.push('xss');
  }

  if (detectPathTraversal(input)) {
    errors.push(`${label} contains path traversal patterns`);
    threats.push('path_traversal');
  }

  if (detectCommandInjection(input)) {
    errors.push(`${label} contains potentially dangerous command patterns`);
    threats.push('command_injection');
  }

  return {
    valid: errors.length === 0,
    errors,
    threats,
  };
}

/**
 * Sanitize input by removing or escaping dangerous patterns.
 */
export function sanitizeInput(input: string): string {
  let sanitized = input;
  sanitized = sanitizeXss(sanitized);
  return sanitized;
}

// ===== ZOD-BASED VALIDATION MIDDLEWARE =====

/**
 * Validate request body against a Zod schema.
 * Returns parsed data or error response.
 *
 * Usage:
 *   const schema = z.object({ name: z.string(), email: z.string().email() });
 *   export async function POST(request: NextRequest) {
 *     const result = await withValidation(request, schema);
 *     if (result.error) return result.error;
 *     const data = result.data; // Typed!
 *   }
 */
export async function withValidation<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<
  | { data: T; error: null }
  | { data: null; error: NextResponse }
> {
  try {
    const body = await request.json();

    // First, validate against attack patterns
    const bodyString = JSON.stringify(body);
    const threatCheck = validateInput(bodyString);
    if (!threatCheck.valid) {
      return {
        data: null,
        error: NextResponse.json(
          { error: 'Input validation failed', details: threatCheck.errors },
          { status: 400 }
        ),
      };
    }

    // Then, validate against Zod schema
    const result = schema.safeParse(body);
    if (!result.success) {
      const formattedErrors = result.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      return {
        data: null,
        error: NextResponse.json(
          { error: 'Validation failed', details: formattedErrors },
          { status: 400 }
        ),
      };
    }

    return { data: result.data, error: null };
  } catch (error) {
    return {
      data: null,
      error: NextResponse.json(
        { error: 'Invalid request body', message: error instanceof Error ? error.message : 'Could not parse JSON' },
        { status: 400 }
      ),
    };
  }
}
