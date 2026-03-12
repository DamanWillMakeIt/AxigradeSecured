/**
 * Encryption utility for sensitive data at rest (API keys, secrets, etc.)
 * Uses AES-256-GCM with per-record random IVs.
 * 
 * CRITICAL: Set ENCRYPTION_KEY environment variable to a 64-character hex string.
 * Generate with: `openssl rand -hex 32`
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const ENCODING = "hex";

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
      "Generate one with: openssl rand -hex 32"
    );
  }
  if (key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
      `Current length: ${key.length}. Generate with: openssl rand -hex 32`
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt plaintext and return base64-encoded ciphertext with embedded IV and auth tag.
 * Format: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(plaintext, "utf8", ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  // Combine IV + authTag + encrypted data into single hex string
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, ENCODING),
  ]);

  return combined.toString("base64");
}

/**
 * Decrypt base64-encoded ciphertext (with embedded IV and auth tag).
 */
export function decrypt(ciphertext: string): string {
  const combined = Buffer.from(ciphertext, "base64");

  // Extract IV, authTag, and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.toString(ENCODING), ENCODING, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Safe decrypt — returns plaintext as-is if decryption fails.
 * Handles keys that were stored before encryption was introduced (migration safety).
 */
export function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    // Value was stored as plaintext (pre-encryption migration) — return as-is
    return value;
  }
}
