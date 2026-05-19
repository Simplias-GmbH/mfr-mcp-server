/**
 * AES-256-GCM token seal/unseal.
 *
 * Used to wrap arbitrary JSON payloads (credentials, OAuth state, etc.)
 * into a self-contained URL-safe opaque token. The server holds only the
 * master key — there is no database lookup needed to validate a token.
 *
 * Token format:  v1.<base64url(IV)>.<base64url(ciphertext)>.<base64url(authTag)>
 *
 * Version prefix lets us rotate the format later without breaking old tokens.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;       // 96 bits — recommended for GCM
const KEY_LEN = 32;      // 256 bits
const VERSION = 'v1';

function getKey() {
  const hex = process.env.MFR_TOKEN_KEY;
  if (!hex) {
    throw new Error('MFR_TOKEN_KEY environment variable is not set. Run `npm run generate-key`.');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_LEN) {
    throw new Error(`MFR_TOKEN_KEY must be ${KEY_LEN * 2} hex characters (got ${hex.length})`);
  }
  return key;
}

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

/**
 * Encrypt an arbitrary JSON-serializable payload into a token string.
 */
export function seal(payload) {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
}

/**
 * Decrypt a token back to its payload. Throws if invalid or tampered.
 */
export function unseal(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('Invalid token: not a string');
  }
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid token format');
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const key = getKey();
  const iv = fromB64url(ivB64);
  const ciphertext = fromB64url(ctB64);
  const tag = fromB64url(tagB64);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * Convenience: check if a sealed payload is still valid (not expired).
 * The payload is expected to have an `exp` field (seconds since epoch).
 */
export function isExpired(payload) {
  return typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000);
}

/**
 * Generate a fresh 256-bit key, returned as hex.
 * Used by scripts/generate-key.js.
 */
export function generateKey() {
  return randomBytes(KEY_LEN).toString('hex');
}
