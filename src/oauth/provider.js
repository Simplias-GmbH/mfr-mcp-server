/**
 * mfr® OAuth 2.1 server provider — STATELESS.
 *
 * Implements the SDK's OAuthServerProvider interface. No database. All state
 * (client registrations, authorization codes, access tokens, refresh tokens)
 * lives inside sealed tokens that this server's master key alone can decrypt.
 *
 * Lifecycle:
 *   1. Client registers   → returns client_id which is itself a sealed token
 *                            containing the client's metadata.
 *   2. /authorize (GET)   → server renders a login form (HTML).
 *   3. /authorize (POST)  → user submits mfr® username+password. Server
 *                            validates against mfr® API, seals an authorization
 *                            code containing {credentials, codeChallenge,
 *                            redirectUri, exp}, redirects browser to redirect_uri
 *                            with ?code=<sealed>.
 *   4. /token             → client exchanges code (+ codeVerifier for PKCE).
 *                            Server unseals code, checks PKCE, issues access
 *                            token (sealed {credentials, type:'access', exp})
 *                            and refresh token (sealed {credentials,
 *                            type:'refresh', exp}).
 *   5. Each MCP call      → bearer access token is unsealed; credentials
 *                            handed to the tool dispatcher; never stored.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seal, unseal, isExpired } from '../crypto/token-seal.js';
import { validateCredentials } from '../mfr/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CODE_TTL_SECONDS         = 10 * 60;          // 10 minutes
const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60;     // 24 hours
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

const TYPE_CODE = 'code';
const TYPE_ACCESS = 'access';
const TYPE_REFRESH = 'refresh';

function now() {
  return Math.floor(Date.now() / 1000);
}

function sha256base64url(s) {
  return createHash('sha256').update(s).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ────────────────────────────────────────────────────────────────────────────
// Stateless client store: client_id IS the sealed client info.
// ────────────────────────────────────────────────────────────────────────────

export const clientsStore = {
  async getClient(clientId) {
    try {
      const data = unseal(clientId);
      if (data.type !== 'client') return undefined;
      // We deliberately don't put client_id inside the sealed payload (it
      // would be circular). Restore it from the actual token here so the
      // returned client object has a usable client_id field.
      return { ...data.client, client_id: clientId };
    } catch {
      return undefined;
    }
  },

  async registerClient(client) {
    // Force public-client (PKCE-only) mode regardless of what the registration
    // request asks for. mcp-remote and most typical MCP clients don't send a
    // client_secret to /token — they rely on PKCE for security. If we leave
    // the SDK-generated client_secret in place, those clients fail with
    // "invalid_client" at /token. PKCE is sufficient for our use case.
    const clientInfo = {
      ...client,
      client_id_issued_at: now(),
      token_endpoint_auth_method: 'none',
    };
    delete clientInfo.client_id;
    delete clientInfo.client_secret;
    delete clientInfo.client_secret_expires_at;
    const clientId = seal({ type: 'client', client: clientInfo });
    return { ...clientInfo, client_id: clientId };
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Login form rendering
// ────────────────────────────────────────────────────────────────────────────

let LOGIN_TEMPLATE = null;
function getLoginTemplate() {
  if (!LOGIN_TEMPLATE) {
    LOGIN_TEMPLATE = readFileSync(join(__dirname, '..', 'views', 'login.html'), 'utf8');
  }
  return LOGIN_TEMPLATE;
}

function renderLoginForm({ params, client, error, prefilledUsername }) {
  const html = getLoginTemplate();
  return html
    .replace(/{{error}}/g, error
      ? `<div class="error">${escapeHtml(error)}</div>`
      : '')
    .replace(/{{client_id}}/g, escapeHtml(client.client_id))
    .replace(/{{client_name}}/g, escapeHtml(client.client_name || 'Claude'))
    .replace(/{{redirect_uri}}/g, escapeHtml(params.redirectUri))
    .replace(/{{state}}/g, escapeHtml(params.state || ''))
    .replace(/{{code_challenge}}/g, escapeHtml(params.codeChallenge))
    .replace(/{{code_challenge_method}}/g, 'S256')
    .replace(/{{response_type}}/g, 'code')
    .replace(/{{scope}}/g, escapeHtml((params.scopes || []).join(' ')))
    .replace(/{{resource}}/g, escapeHtml(params.resource?.href || ''))
    .replace(/{{username}}/g, escapeHtml(prefilledUsername || ''));
}

// ────────────────────────────────────────────────────────────────────────────
// The provider itself
// ────────────────────────────────────────────────────────────────────────────

export const provider = {
  clientsStore,

  /**
   * Called by the SDK's authorize router on both GET and POST.
   * GET  → render login form (browser displays it).
   * POST → validate mfr® credentials, seal code, redirect to client.
   */
  async authorize(client, params, res) {
    const req = res.req;

    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderLoginForm({ params, client }));
      return;
    }

    // POST: process the submitted login form
    const username = (req.body?.username || '').trim();
    const password = req.body?.password || '';

    if (!username || !password) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(400).send(renderLoginForm({
        params, client,
        error: 'Please enter both username and password.',
        prefilledUsername: username,
      }));
      return;
    }

    let valid = false;
    try {
      valid = await validateCredentials({ username, password });
    } catch (err) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(502).send(renderLoginForm({
        params, client,
        error: `Could not reach mfr® to validate credentials: ${err.message}`,
        prefilledUsername: username,
      }));
      return;
    }

    if (!valid) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(401).send(renderLoginForm({
        params, client,
        error: 'Incorrect mfr® username or password. Please try again.',
        prefilledUsername: username,
      }));
      return;
    }

    const code = seal({
      type: TYPE_CODE,
      credentials: { username, password },
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      clientId: client.client_id,
      resource: params.resource?.href,
      exp: now() + CODE_TTL_SECONDS,
    });

    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state) redirect.searchParams.set('state', params.state);
    res.redirect(302, redirect.href);
  },

  /**
   * The SDK calls this BEFORE exchangeAuthorizationCode, to verify PKCE.
   * It hashes the codeVerifier the client provides and compares it to the
   * codeChallenge stored alongside the code.
   */
  async challengeForAuthorizationCode(client, authorizationCode) {
    const payload = unseal(authorizationCode);
    if (payload.type !== TYPE_CODE) throw new Error('Not an authorization code');
    if (isExpired(payload)) throw new Error('Authorization code expired');
    if (payload.clientId !== client.client_id) throw new Error('Code/client mismatch');
    return payload.codeChallenge;
  },

  async exchangeAuthorizationCode(client, authorizationCode, codeVerifier, redirectUri, resource) {
    const payload = unseal(authorizationCode);
    if (payload.type !== TYPE_CODE) throw new Error('Not an authorization code');
    if (isExpired(payload)) throw new Error('Authorization code expired');
    if (payload.clientId !== client.client_id) throw new Error('Code/client mismatch');
    if (redirectUri && payload.redirectUri !== redirectUri) {
      throw new Error('redirect_uri mismatch');
    }
    if (resource && payload.resource && payload.resource !== resource.href) {
      throw new Error('resource mismatch');
    }

    // PKCE has already been validated by the SDK using
    // `challengeForAuthorizationCode` above.

    const expiresIn = ACCESS_TOKEN_TTL_SECONDS;
    const accessToken = seal({
      type: TYPE_ACCESS,
      credentials: payload.credentials,
      clientId: client.client_id,
      exp: now() + expiresIn,
    });
    const refreshToken = seal({
      type: TYPE_REFRESH,
      credentials: payload.credentials,
      clientId: client.client_id,
      exp: now() + REFRESH_TOKEN_TTL_SECONDS,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: '',
    };
  },

  async exchangeRefreshToken(client, refreshToken /* , scopes, resource */) {
    const payload = unseal(refreshToken);
    if (payload.type !== TYPE_REFRESH) throw new Error('Not a refresh token');
    if (isExpired(payload)) throw new Error('Refresh token expired');
    if (payload.clientId !== client.client_id) throw new Error('Token/client mismatch');

    const expiresIn = ACCESS_TOKEN_TTL_SECONDS;
    const newAccessToken = seal({
      type: TYPE_ACCESS,
      credentials: payload.credentials,
      clientId: client.client_id,
      exp: now() + expiresIn,
    });
    const newRefreshToken = seal({
      type: TYPE_REFRESH,
      credentials: payload.credentials,
      clientId: client.client_id,
      exp: now() + REFRESH_TOKEN_TTL_SECONDS,
    });

    return {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: newRefreshToken,
      scope: '',
    };
  },

  /**
   * Called by the bearer-auth middleware on every MCP request.
   * Returns AuthInfo with the customer's credentials stashed in `extra`,
   * so the tool dispatcher can pick them up.
   */
  async verifyAccessToken(token) {
    const payload = unseal(token);
    if (payload.type !== TYPE_ACCESS) throw new Error('Not an access token');
    if (isExpired(payload)) throw new Error('Access token expired');
    return {
      token,
      clientId: payload.clientId,
      scopes: [],
      expiresAt: payload.exp,
      extra: { credentials: payload.credentials },
    };
  },
};

// Exported for sanity-checking inputs in tests / scripts.
export { sha256base64url };
