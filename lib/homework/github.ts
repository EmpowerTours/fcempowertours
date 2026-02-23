import crypto from 'crypto';

const GITHUB_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_APP_CLIENT_SECRET || '';
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';
const GITHUB_STATE_SECRET = process.env.GITHUB_STATE_SECRET || '';

// Generate HMAC-signed state for OAuth
export function generateOAuthState(wallet: string): string {
  const hmac = crypto.createHmac('sha256', GITHUB_STATE_SECRET);
  hmac.update(wallet);
  const signature = hmac.digest('hex');
  return `${wallet}:${signature}`;
}

// Verify HMAC-signed OAuth state
export function verifyOAuthState(state: string): string | null {
  const parts = state.split(':');
  if (parts.length !== 2) return null;
  const [wallet, signature] = parts;
  const hmac = crypto.createHmac('sha256', GITHUB_STATE_SECRET);
  hmac.update(wallet);
  const expected = hmac.digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return wallet;
}

// Exchange OAuth code for access token
export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

// Fetch GitHub user profile
export async function fetchGitHubUser(token: string): Promise<{
  username: string;
  avatarUrl: string;
  id: number;
}> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const user = await response.json();
  return {
    username: user.login,
    avatarUrl: user.avatar_url,
    id: user.id,
  };
}

// Verify webhook signature (HMAC-SHA256)
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!signature || !GITHUB_WEBHOOK_SECRET) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Check if a file exists in a repo
export async function checkFileExists(
  token: string,
  owner: string,
  repo: string,
  path: string
): Promise<boolean> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
  return response.ok;
}

// Get OAuth authorization URL
export function getOAuthUrl(wallet: string): string {
  const state = generateOAuthState(wallet);
  return `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&state=${encodeURIComponent(state)}&scope=read:user`;
}

// Extract week number from file path (e.g., "week-05/pr-review.md" -> 5)
export function extractWeekFromPath(filePath: string): number | null {
  const match = filePath.match(/week-(\d{2})\//);
  if (!match) return null;
  return parseInt(match[1], 10);
}
