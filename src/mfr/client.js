/**
 * mfr® API client.
 *
 * Stateless: every call takes a `credentials` object with the customer's
 * mfr® username and password. Nothing is cached. The credentials are
 * extracted from the bearer token on each MCP request and passed in here.
 */

const DEFAULT_BASE_URL = 'https://portal.mobilefieldreport.com';

export function getBaseUrl() {
  return process.env.MFR_BASE_URL || DEFAULT_BASE_URL;
}

function basicAuthHeader(credentials) {
  if (!credentials || !credentials.username || !credentials.password) {
    throw new Error('mfr® credentials missing — request not authenticated');
  }
  return 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
}

/**
 * Make an authenticated request to the mfr® API.
 *
 * @param {string} path        — path starting with /, e.g. '/odata/Companies'
 * @param {object} credentials — { username, password }
 * @param {object} [options]   — standard fetch options
 */
export async function mfrFetch(path, credentials, options = {}) {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': basicAuthHeader(credentials),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (res.status === 204) {
      return { success: true };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const detail = typeof data === 'object' ? JSON.stringify(data) : data;
      const err = new Error(`mfr® API error ${res.status}: ${detail}`);
      err.status = res.status;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validate credentials by making a cheap call to mfr®.
 * Used during the OAuth login flow.
 *
 * @returns {Promise<{valid: boolean, status: number|string}>}
 *   valid:  true if mfr® accepted the credentials
 *   status: HTTP status code from mfr® (or descriptive string if not HTTP)
 */
export async function validateCredentials(credentials) {
  try {
    await mfrFetch('/odata/Users?$top=1', credentials);
    return { valid: true, status: 200 };
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      return { valid: false, status: err.status };
    }
    throw err;
  }
}

/**
 * Build an OData URL with query parameters.
 */
export function buildODataUrl(endpoint, { filter, expand, select, top, orderby, search } = {}) {
  const params = new URLSearchParams();
  if (filter)            params.set('$filter', filter);
  if (expand)            params.set('$expand', expand);
  if (select)            params.set('$select', select);
  if (top !== undefined) params.set('$top', String(top));
  if (orderby)           params.set('$orderby', orderby);
  if (search)            params.set('$search', search);
  const qs = params.toString();
  return `/odata/${endpoint}${qs ? '?' + qs : ''}`;
}
