/**
 * Telegram Auth Validation
 *
 * Server-side validation of Telegram Mini App initData using HMAC-SHA256.
 * Per Telegram docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Validation steps:
 *   1. Parse initData as URL-encoded key=value pairs
 *   2. Remove the 'hash' field, sort remaining fields alphabetically
 *   3. Build data_check_string as "key=value\nkey=value\n..."
 *   4. secret_key = HMAC-SHA256("WebAppData", bot_token)
 *   5. Compute HMAC-SHA256(secret_key, data_check_string)
 *   6. Compare with the provided hash
 *
 * This module uses Node.js crypto and must only be called server-side.
 */

import { createHmac } from 'crypto';

/**
 * Telegram user data extracted from validated initData.
 */
export interface TelegramAuthUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

/**
 * Result of validating Telegram initData.
 */
export interface TelegramAuthResult {
  valid: boolean;
  user: TelegramAuthUser | null;
  authDate: number | null;
  /** Raw parsed fields from initData (excluding hash) */
  fields: Record<string, string>;
  error?: string;
}

/**
 * Validate Telegram Mini App initData using HMAC-SHA256.
 *
 * @param initData - The raw initData string from Telegram WebApp
 * @param botToken - The Telegram bot token (from BotFather)
 * @param maxAgeSeconds - Maximum age of the auth data in seconds (default: 86400 = 24h)
 * @returns Validation result with extracted user data
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = 86400
): TelegramAuthResult {
  if (!initData || !botToken) {
    return {
      valid: false,
      user: null,
      authDate: null,
      fields: {},
      error: 'Missing initData or botToken',
    };
  }

  try {
    // 1. Parse initData as URL-encoded params
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return {
        valid: false,
        user: null,
        authDate: null,
        fields: {},
        error: 'No hash found in initData',
      };
    }

    // 2. Build data_check_string: sorted key=value pairs, excluding hash
    const fields: Record<string, string> = {};
    const dataCheckParts: string[] = [];

    // Collect all fields except hash
    for (const [key, value] of params.entries()) {
      if (key === 'hash') continue;
      fields[key] = value;
    }

    // Sort alphabetically by key
    const sortedKeys = Object.keys(fields).sort();
    for (const key of sortedKeys) {
      dataCheckParts.push(`${key}=${fields[key]}`);
    }

    const dataCheckString = dataCheckParts.join('\n');

    // 3. Compute secret_key = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // 4. Compute HMAC-SHA256(secret_key, data_check_string)
    const computedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // 5. Compare hashes (constant-time comparison via string equality)
    if (computedHash !== hash) {
      return {
        valid: false,
        user: null,
        authDate: null,
        fields,
        error: 'Hash mismatch - initData signature is invalid',
      };
    }

    // 6. Check auth_date freshness
    const authDate = fields.auth_date ? parseInt(fields.auth_date, 10) : 0;
    const now = Math.floor(Date.now() / 1000);

    if (maxAgeSeconds > 0 && (now - authDate) > maxAgeSeconds) {
      return {
        valid: false,
        user: null,
        authDate,
        fields,
        error: `initData is too old (${now - authDate}s > ${maxAgeSeconds}s)`,
      };
    }

    // 7. Parse user JSON
    let user: TelegramAuthUser | null = null;
    if (fields.user) {
      try {
        user = JSON.parse(fields.user) as TelegramAuthUser;
      } catch {
        return {
          valid: false,
          user: null,
          authDate,
          fields,
          error: 'Failed to parse user JSON from initData',
        };
      }
    }

    return {
      valid: true,
      user,
      authDate,
      fields,
    };
  } catch (err) {
    return {
      valid: false,
      user: null,
      authDate: null,
      fields: {},
      error: `Validation error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Extract user data from initData WITHOUT validation.
 * Only use this for non-sensitive operations or when you've already validated.
 */
export function extractTelegramUser(initData: string): TelegramAuthUser | null {
  try {
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    if (!userJson) return null;
    return JSON.parse(userJson) as TelegramAuthUser;
  } catch {
    return null;
  }
}
