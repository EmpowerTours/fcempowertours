// Server-side encryption utilities (DO NOT USE IN CLIENT CODE)

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// In production, store this securely in environment variables
// This should be a 32-byte (256-bit) key
const getEncryptionKey = (): Buffer => {
  const key = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('DOCUMENT_ENCRYPTION_KEY not configured');
  }
  return Buffer.from(key, 'hex');
};

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypt a file buffer using AES-256-GCM
 * @param data File buffer to encrypt
 * @returns Encrypted data, IV, and auth tag
 */
export const encryptDocument = (data: Buffer): EncryptedData => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
};

/**
 * Decrypt a document using AES-256-GCM
 * @param encryptedData Encrypted data in base64
 * @param iv Initialization vector in hex
 * @param authTag Authentication tag in hex
 * @returns Decrypted buffer
 */
export const decryptDocument = (
  encryptedData: string,
  iv: string,
  authTag: string
): Buffer => {
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData, 'base64')),
    decipher.final(),
  ]);

  return decrypted;
};

/**
 * Generate SHA-256 hash of data for on-chain storage
 * @param data Data to hash
 * @returns Hex string hash
 */
export const hashDocument = (data: Buffer): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Generate a random encryption key (run once during setup)
 * @returns Hex string of 256-bit key
 */
export const generateEncryptionKey = (): string => {
  return crypto.randomBytes(32).toString('hex');
};
