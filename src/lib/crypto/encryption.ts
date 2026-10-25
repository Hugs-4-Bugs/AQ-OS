// ═══════════════════════════════════════════════════════════════════
// AcquisitionOS — Encryption Service (Phase 26 v3)
//
// AES-256-GCM encryption for user-level AI provider credentials.
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const VERSION = 'v1';

function getMasterKey(): Buffer {
  const envKey = process.env.USER_AI_PROVIDER_ENCRYPTION_KEY;
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[Encryption] USER_AI_PROVIDER_ENCRYPTION_KEY not set or invalid (must be 64-char hex). Using runtime fallback.');
  }
  const fallback = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'fallback-key-not-secure';
  return crypto.createHash('sha256').update(fallback).digest();
}

export function encryptCredential(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('encryptCredential: plaintext must be a non-empty string');
  }
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredential(encryptedPayload: string): string {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new Error('decryptCredential: payload must be a non-empty string');
  }
  const parts = encryptedPayload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error(`decryptCredential: unsupported payload format (expected ${VERSION}:iv:tag:ciphertext)`);
  }
  const [, ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('decryptCredential: malformed iv or auth tag');
  }
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskCredential(plaintext: string): string {
  if (!plaintext) return '(empty)';
  if (plaintext.length <= 8) return '*'.repeat(plaintext.length);
  return `${plaintext.slice(0, 4)}***${plaintext.slice(-4)}`;
}

export function canDecrypt(encryptedPayload: string): boolean {
  try {
    decryptCredential(encryptedPayload);
    return true;
  } catch {
    return false;
  }
}

export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
