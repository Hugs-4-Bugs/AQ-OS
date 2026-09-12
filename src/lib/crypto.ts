// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Encryption Utilities
// AES-256-GCM encryption for sensitive data at rest (OAuth tokens, etc.)
// ═══════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derive a consistent encryption key from an environment variable.
 * Falls back to a deterministic key if no env var is set (dev mode only).
 * In production, ENCRYPTION_KEY must be set.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;

  if (!envKey) {
    // In development, use a deterministic key from app name
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    // Dev fallback: deterministic key from app identifier
    const crypto = require('crypto') as typeof import('crypto');
    return crypto.createHash('sha256').update('acquisitionos-dev-encryption-key').digest();
  }

  // Key can be hex-encoded (64 chars) or base64-encoded, or raw string
  if (/^[0-9a-f]{64}$/i.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }

  // Use as-is, padded/truncated to 32 bytes
  const keyBuffer = Buffer.from(envKey);
  if (keyBuffer.length < KEY_LENGTH) {
    // Pad with zeros (dev only, production should use proper key)
    const padded = Buffer.alloc(KEY_LENGTH);
    keyBuffer.copy(padded);
    return padded;
  }
  return keyBuffer.subarray(0, KEY_LENGTH);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Concatenate: iv + authTag + ciphertext → base64
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded string produced by encrypt().
 * Returns the original plaintext string.
 */
export function decrypt(encryptedBase64: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = combined.subarray(IV_LENGTH + 16);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Check if encryption is properly configured.
 * Returns true if ENCRYPTION_KEY is set or in dev mode.
 */
export function isEncryptionConfigured(): boolean {
  if (process.env.ENCRYPTION_KEY) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  return false;
}

/**
 * Encrypt an OAuth access token for storage.
 * Returns the encrypted token as a base64 string.
 */
export function encryptToken(token: string): string {
  return encrypt(token);
}

/**
 * Decrypt an OAuth access token from storage.
 * Returns the original token string.
 */
export function decryptToken(encryptedToken: string): string {
  return decrypt(encryptedToken);
}
