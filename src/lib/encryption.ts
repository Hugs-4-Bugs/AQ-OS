// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Encryption Utility
// AES-256-GCM encryption for sensitive data (OAuth tokens, etc.)
//
// Uses ENCRYPTION_KEY env var (32-byte hex string).
// Fallback key is for dev only — NEVER use in production.
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';

const LOG_PREFIX = '[Encryption]';

// AES-256-GCM requires a 32-byte (256-bit) key
// ENCRYPTION_KEY should be a 64-character hex string (32 bytes)
const FALLBACK_KEY = 'acquisitionos-dev-encryption-key-32b!'; // 32 chars for dev

function getEncryptionKey(): Buffer {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (keyEnv) {
    // If it's a hex string, decode it
    if (/^[0-9a-fA-F]{64}$/.test(keyEnv)) {
      return Buffer.from(keyEnv, 'hex');
    }
    // If it's a 32-char string, use it directly
    if (keyEnv.length === 32) {
      return Buffer.from(keyEnv, 'utf-8');
    }
    // Hash any other format to get 32 bytes
    return crypto.createHash('sha256').update(keyEnv).digest();
  }

  // Dev fallback
  console.warn(`${LOG_PREFIX} WARNING: Using fallback encryption key. Set ENCRYPTION_KEY env var for production.`);
  return Buffer.from(FALLBACK_KEY, 'utf-8');
}

// Lazy-initialize the key so it's only computed once
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) {
    _key = getEncryptionKey();
  }
  return _key;
}

// IV length for AES-GCM: 12 bytes (recommended)
const IV_LENGTH = 12;
// Auth tag length: 16 bytes (default for GCM)
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Output format: `iv:authTag:ciphertext` (all hex-encoded)
 * This format is safe for database storage.
 *
 * @param text - The plaintext string to encrypt
 * @returns The encrypted string in `iv:authTag:ciphertext` format
 */
export function encrypt(text: string): string {
  if (!text) return '';

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error(`${LOG_PREFIX} Encryption failed:`, error);
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt an encrypted string that was encrypted with the `encrypt` function.
 *
 * Input format: `iv:authTag:ciphertext` (all hex-encoded)
 *
 * @param encryptedText - The encrypted string in `iv:authTag:ciphertext` format
 * @returns The decrypted plaintext string
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  // If the text doesn't look encrypted (no colons), return as-is
  // This handles migration from unencrypted tokens
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    // Not encrypted — return plaintext (migration path)
    return encryptedText;
  }

  try {
    const key = getKey();
    const [ivHex, authTagHex, ciphertext] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // If decryption fails, log a warning and return empty string
    // Returning the encrypted blob as plaintext would be a security issue
    console.warn(`${LOG_PREFIX} Decryption failed, returning empty string:`, error instanceof Error ? error.message : 'Unknown error');
    return '';
  }
}

/**
 * Check if a string appears to be encrypted (has iv:authTag:ciphertext format).
 *
 * @param text - The string to check
 * @returns True if the string appears to be encrypted
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(':');
  if (parts.length !== 3) return false;
  // Check if all parts are valid hex
  return parts.every((part) => /^[0-9a-fA-F]+$/.test(part));
}
