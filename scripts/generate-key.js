#!/usr/bin/env node
/**
 * Generate a fresh AES-256 master key for MFR_TOKEN_KEY.
 *
 * Usage:   node scripts/generate-key.js
 *
 * Output is a 64-character hex string (256 bits). Set it as the
 * MFR_TOKEN_KEY environment variable in production. Treat it like a
 * password: leaking it lets anyone who also intercepted a customer token
 * decrypt it.
 *
 * Rotating this key invalidates all existing customer tokens — customers
 * will have to click "Connect" again in their AI client.
 */

import { generateKey } from '../src/crypto/token-seal.js';

const key = generateKey();
console.log(key);
console.error('');
console.error('Set this as MFR_TOKEN_KEY in your environment.');
console.error('In Azure: store it in Key Vault, then reference it from your Container App.');
console.error('Locally:  add MFR_TOKEN_KEY=' + key.slice(0, 8) + '... to your .env');
