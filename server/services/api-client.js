import logger from '../utils/logger.js';

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function buildHeaders(token, extraHeaders = {}) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': DEFAULT_UA,
    'Accept': 'application/json',
  };
  for (const [key, value] of Object.entries(extraHeaders || {})) {
    if (value === undefined || value === null || value === '') continue;
    headers[key] = String(value);
  }
  return headers;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/$/, '');
}

function isCloudflareBody(text = '') {
  const lower = text.toLowerCase();
  return lower.includes('cloudflare')
    || lower.includes('challenge-platform')
    || lower.includes('cf-ray')
    || lower.includes('cf-chl')
    || lower.includes('turnstile');
}

function isNotFoundResponse(status, text = '') {
  if (status === 404 || status === 405) return true;
  const lower = text.toLowerCase();
  return lower.includes('not found')
    || lower.includes('invalid url')
    || lower.includes('cannot post')
    || lower.includes('cannot get');
}

/**
 * Fetch user info from /api/user/self
 * Returns the full user data object or throws on failure.
 */
export async function fetchUserInfo(baseUrl, token, extraHeaders) {
  const url = `${normalizeBaseUrl(baseUrl)}/api/user/self`;
  const res = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token, extraHeaders),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.success === false) {
    throw new Error(data.message || 'API returned failure');
  }
  return data;
}

/**
 * Extract quota/balance info from user self endpoint.
 * Returns { quota, used_quota, username, display_name }.
 */
export async function fetchAccountQuota(baseUrl, token, extraHeaders) {
  const data = await fetchUserInfo(baseUrl, token, extraHeaders);
  const user = data.data || data;
  return {
    quota: user.quota ?? null,
    used_quota: user.used_quota ?? null,
    username: user.username ?? null,
    display_name: user.display_name || user.username || null,
    quota_unit: user.quota_unit ?? null,
  };
}

/**
 * Perform check-in via direct POST to the check-in API endpoint.
 */
export async function performDirectCheckin(baseUrl, token, checkinPath = '/api/user/self/checkin', extraHeaders) {
  const normalized = normalizeBaseUrl(baseUrl);
  const apiUrl = checkinPath.startsWith('http')
    ? checkinPath
    : `${normalized}${checkinPath.startsWith('/') ? checkinPath : `/${checkinPath}`}`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: buildHeaders(token, extraHeaders),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  const message = data?.message || text.slice(0, 200) || `HTTP ${res.status}`;
  const isCloudflare = (res.status === 403 || res.status === 503) && isCloudflareBody(text);
  const isNotFound = isNotFoundResponse(res.status, message);

  if (res.ok && data) {
    return { ...data, status: res.status };
  }

  return {
    success: false,
    message,
    status: res.status,
    isCloudflare,
    isNotFound,
  };
}

/**
 * Check today's check-in status via GET.
 */
export async function fetchCheckinStatus(baseUrl, token, checkinPath = '/api/user/self/checkin', extraHeaders) {
  const normalized = normalizeBaseUrl(baseUrl);
  const month = new Date().toISOString().slice(0, 7);
  const apiUrl = checkinPath.startsWith('http')
    ? `${checkinPath}${checkinPath.includes('?') ? '&' : '?'}month=${month}`
    : `${normalized}${checkinPath.startsWith('/') ? checkinPath : `/${checkinPath}`}?month=${month}`;

  const res = await fetch(apiUrl, {
    method: 'GET',
    headers: buildHeaders(token, extraHeaders),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return await res.json();
}

/**
 * Test if a token is valid by hitting /api/user/self.
 * Returns { success, message, isCloudflare }.
 */
export async function testConnection(baseUrl, token, extraHeaders) {
  try {
    const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/user/self`, {
      method: 'GET',
      headers: buildHeaders(token, extraHeaders),
      redirect: 'manual',
    });

    const text = await res.text().catch(() => '');
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    // Cloudflare challenge responses
    if (res.status === 403 || res.status === 503) {
      const isCf = isCloudflareBody(text);
      if (isCf) {
        return { success: false, message: 'Cloudflare challenge detected', isCloudflare: true };
      }
      return { success: false, message: `HTTP ${res.status}: access denied`, isCloudflare: false };
    }

    if (!res.ok) {
      const msg = data?.message || text.slice(0, 200) || `HTTP ${res.status}`;
      return { success: false, message: `HTTP ${res.status}: ${msg}`, isCloudflare: false };
    }

    if (!data) {
      return { success: false, message: 'Invalid JSON response from /api/user/self', isCloudflare: false };
    }

    if (data.success === false) {
      return { success: false, message: data.message || 'Token invalid', isCloudflare: false };
    }

    return { success: true, message: '直接API连接测试成功', isCloudflare: false };
  } catch (err) {
    logger.debug(`Direct API test failed for ${baseUrl}: ${err.message}`);
    return { success: false, message: err.message, isCloudflare: false };
  }
}
