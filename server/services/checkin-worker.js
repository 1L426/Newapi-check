import { launchBrowser, createPage, closeBrowser } from './puppeteer.js';
import { decrypt } from './crypto.js';
import {
  testConnection as directTestConnection,
  performDirectCheckin,
  fetchAccountQuota,
} from './api-client.js';
import db from '../db/init.js';
import logger from '../utils/logger.js';

function getSetting(key, fallback = null) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row?.value ?? fallback;
}

function getNumberSetting(key, fallback) {
  const value = parseInt(getSetting(key, String(fallback)), 10);
  return Number.isFinite(value) ? value : fallback;
}

function normalizePath(pathValue, fallbackPath) {
  const value = (pathValue || fallbackPath || '').trim();
  if (!value) return fallbackPath;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeBaseUrlForApi(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname || '/';
    const lower = pathname.toLowerCase();
    const shouldStrip = lower !== '/' && (
      lower.includes('/console')
      || lower.includes('/panel')
      || lower.includes('/dashboard')
      || lower.includes('/login')
    );
    if (shouldStrip) return parsed.origin;
    const trimmedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
    return `${parsed.origin}${trimmedPath === '/' ? '' : trimmedPath}`;
  } catch {
    return String(rawUrl || '').replace(/\/$/, '');
  }
}

function normalizeBearerToken(token) {
  if (!token || typeof token !== 'string') return null;
  let trimmed = token.trim();
  if (!trimmed) return null;
  // Extract from cookie-like strings: "session=xxx; Path=/; ..."
  const cookieMatch = trimmed.match(/(?:^|;\s*)(session|token)=([^;]+)/i);
  if (cookieMatch && cookieMatch[2]) {
    trimmed = cookieMatch[2].trim();
  }
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    trimmed = trimmed.slice(7).trim();
  }
  if (trimmed.toLowerCase().startsWith('session=')) {
    trimmed = trimmed.slice(8).trim();
  }
  if (trimmed.toLowerCase().startsWith('token=')) {
    trimmed = trimmed.slice(6).trim();
  }
  return trimmed || null;
}

function extractCookieToken(rawToken) {
  const raw = String(rawToken || '').trim();
  if (!raw) return { token: null, cookieName: null };
  let cookieName = null;
  let cookieValue = null;
  const preferred = raw.match(/(?:^|;\s*)(session|token)=([^;]+)/i);
  if (preferred && preferred[2]) {
    cookieName = preferred[1];
    cookieValue = preferred[2].trim();
  } else {
    const anyCookie = raw.match(/(?:^|;\s*)([^=;]+)=([^;]+)/);
    if (anyCookie && anyCookie[2]) {
      cookieName = anyCookie[1];
      cookieValue = anyCookie[2].trim();
    }
  }
  const token = normalizeBearerToken(raw) || cookieValue || null;
  return { token, cookieName };
}

function getCheckinPath() {
  return normalizePath(getSetting('checkin_path', '/api/user/self/checkin'), '/api/user/self/checkin');
}

function getCheckinPathCandidates() {
  const configured = getCheckinPath();
  const candidates = [configured];
  if (!configured.startsWith('http://') && !configured.startsWith('https://')) {
    const fallbacks = ['/api/user/self/checkin', '/api/user/checkin'];
    for (const path of fallbacks) {
      if (!candidates.includes(path)) candidates.push(path);
    }
  }
  return candidates;
}

function updateSetting(key, value) {
  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))`
  ).run(key, String(value));
}

function maybeAutoUpdateCheckinPath(configuredPath, nextPath) {
  if (!nextPath || !nextPath.startsWith('/')) return;
  if (configuredPath === nextPath) return;
  // Only auto-adjust when the configured path is the default and fails.
  if (configuredPath === '/api/user/self/checkin') {
    updateSetting('checkin_path', nextPath);
    logger.info(`Auto-updated checkin_path to ${nextPath}`);
  }
}

function logCheckin(accountId, status, message, quotaBefore = null, quotaAfter = null) {
  const safeMessage = message ? String(message).slice(0, 300) : null;
  db.prepare(
    `INSERT INTO checkin_logs (account_id, status, message, quota_before, quota_after) VALUES (?, ?, ?, ?, ?)`
  ).run(accountId, status, message, quotaBefore, quotaAfter);
  db.prepare(
    `UPDATE accounts
     SET last_checkin_at = datetime('now','localtime'),
         last_checkin_result = ?,
         last_error_message = ?,
         last_error_at = ?,
         updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(
    status,
    status === 'failed' ? safeMessage : null,
    status === 'failed' ? new Date().toISOString() : null,
    accountId
  );
}

function updateAccountQuota(accountId, quota, usedQuota) {
  db.prepare(
    `UPDATE accounts SET quota = ?, used_quota = ?, balance_updated_at = datetime('now','localtime'), updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(quota, usedQuota, accountId);
}

function saveCachedToken(accountId, token) {
  db.prepare(
    `UPDATE accounts SET cached_token = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(token, accountId);
}

function isAccessTokenInvalidMessage(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('access token')
    || text.includes('token invalid')
    || text.includes('invalid token')
    || text.includes('unauthorized')
    || text.includes('forbidden')
    || text.includes('无权')
    || text.includes('权限')
    || text.includes('无效');
}

function isNotFoundLikeMessage(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('invalid url')
    || text.includes('not found')
    || text.includes('cannot get')
    || text.includes('cannot post')
    || text.includes('404')
    || text.includes('405');
}

function getDecryptedToken(account) {
  if (account.login_type === 'session' && account.session_token) {
    return normalizeBearerToken(decrypt(account.session_token));
  }
  if (account.cached_token) {
    return normalizeBearerToken(account.cached_token);
  }
  return null;
}

function buildExtraHeaders(account) {
  if (!account?.new_api_user) return null;
  const value = String(account.new_api_user).trim();
  if (!value) return null;
  return { 'New-Api-User': value };
}

function getQuotaUnit(account) {
  const raw = account?.quota_unit;
  const num = raw === undefined || raw === null || raw === '' ? 1 : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return 1;
  return num;
}

function updateAccountQuotaUnit(accountId, unit, source = 'auto') {
  if (!accountId || !Number.isFinite(unit) || unit <= 0) return;
  db.prepare(
    `UPDATE accounts SET quota_unit = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(unit, accountId);
  logger.info(`Auto-detected quota_unit=${unit} (source=${source}) for account ${accountId}`);
}

function guessQuotaUnit(info) {
  const quota = Number(info?.quota);
  const used = Number(info?.used_quota);
  if ((!Number.isFinite(quota) || quota <= 0) && (!Number.isFinite(used) || used <= 0)) return null;
  // Heuristic: New-API family often uses 1 USD = 500000 units.
  const unit = 500000;
  const looksLikeMoney = (value) => {
    if (!Number.isFinite(value) || value <= 0) return false;
    if (value < unit) return false;
    const scaled = value / unit;
    const rounded = Math.round(scaled * 100) / 100;
    if (rounded < 0.01 || rounded > 1000000) return false;
    // Allow small rounding drift from integer math or server-side precision.
    return Math.abs(rounded - scaled) <= 0.05;
  };
  if (!looksLikeMoney(quota) && !looksLikeMoney(used)) return null;
  return unit;
}

function normalizeQuotaInfo(info, account) {
  if (!info) return info;
  let unit = getQuotaUnit(account);
  if (unit === 1) {
    const infoUnit = Number(info.quota_unit);
    if (Number.isFinite(infoUnit) && infoUnit > 0) {
      unit = infoUnit;
      if (!account?.quota_unit && account?.id) {
        updateAccountQuotaUnit(account.id, unit, 'response');
      }
    } else {
      const guessed = guessQuotaUnit(info);
      if (guessed) {
        unit = guessed;
        if (account?.id) {
          updateAccountQuotaUnit(account.id, unit, 'heuristic-500000');
        }
      }
    }
  }
  if (unit === 1) return info;
  const toNumber = (val) => {
    if (val === null || val === undefined) return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  };
  const quota = toNumber(info.quota);
  const used = toNumber(info.used_quota);
  return {
    ...info,
    quota: quota === null ? null : quota / unit,
    used_quota: used === null ? null : used / unit,
  };
}

// ---------------------------------------------------------------------------
// Score-based Cloudflare detection (ported from all-api-hub reference)
// ---------------------------------------------------------------------------

async function detectCloudflareChallenge(page) {
  return await page.evaluate(() => {
    let score = 0;
    const strong = [];
    const support = [];

    // Strong markers (+3 each)
    if (typeof window._cf_chl_opt !== 'undefined') {
      score += 3; strong.push('_cf_chl_opt');
    }
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    if (scripts.some(s => s.src.includes('challenge-platform'))) {
      score += 3; strong.push('challenge-platform');
    }
    if (scripts.some(s => s.src.includes('trace-jsch'))) {
      score += 3; strong.push('trace-jsch');
    }
    if (document.querySelector('form#challenge-form, form[action*="challenge"]')) {
      score += 3; strong.push('challenge-form');
    }

    // Medium markers (+2 each)
    if (document.querySelector('#cf-content')) {
      score += 2; support.push('cf-content');
    }
    if (document.querySelector('#cf-wrapper')) {
      score += 2; support.push('cf-wrapper');
    }
    const bodyText = document.body?.innerText || '';
    if (bodyText.includes('Error 1020') || bodyText.includes('Access denied')) {
      score += 2; support.push('cf-error-1020');
    }
    if (window.location.href.includes('/cdn-cgi/')) {
      score += 2; support.push('cdn-cgi-url');
    }

    // Weak markers (+1 each)
    const title = document.title.toLowerCase();
    if (title.includes('just a moment') || title.includes('please wait') || title.includes('attention required')) {
      score += 1; support.push('cf-title');
    }
    const turnstile = document.querySelector('iframe[src*="turnstile"], .cf-turnstile, [data-sitekey]');
    if (turnstile) {
      score += 1; support.push('turnstile');
    }

    // Challenge = any strong marker OR (score >= 3 AND at least one support marker)
    const isChallenge = strong.length > 0 || (score >= 3 && support.length > 0);

    return { isChallenge, score, strong, support };
  });
}

async function waitForCloudflareBypass(page, timeoutMs = 30000) {
  const start = Date.now();
  const interval = 500;

  // Initial check
  const initial = await detectCloudflareChallenge(page);
  if (!initial.isChallenge) {
    logger.info('No Cloudflare challenge detected');
    return true;
  }

  logger.info(`Cloudflare challenge detected (score=${initial.score}, strong=[${initial.strong}], support=[${initial.support}]). Waiting for bypass...`);

  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, interval));
    try {
      const check = await detectCloudflareChallenge(page);
      if (!check.isChallenge) {
        logger.info(`Cloudflare challenge resolved after ${Date.now() - start}ms`);
        return true;
      }
    } catch {
      // Page might be navigating, continue waiting
    }
  }

  logger.warn(`Cloudflare challenge not resolved within ${timeoutMs}ms`);
  return false;
}

// ---------------------------------------------------------------------------
// Browser-based login flows
// ---------------------------------------------------------------------------

async function loginWithPassword(page, account, timeoutMs) {
  if (!account.username || !account.password_encrypted) {
    throw new Error('账号缺少用户名或密码，无法登录');
  }

  const url = normalizeBaseUrlForApi(account.base_url);
  await page.goto(`${url}/login`, { waitUntil: 'networkidle2', timeout: timeoutMs });

  // Check for Cloudflare before interacting
  await waitForCloudflareBypass(page, Math.min(timeoutMs, 30000));

  await page.waitForSelector('input', { timeout: Math.min(timeoutMs, 15000) });

  const usernameSelector = 'input[name="username"], input[id="username"], input[autocomplete="username"]';
  const passwordSelector = 'input[name="password"], input[id="password"], input[type="password"]';
  const password = decrypt(account.password_encrypted);

  const usernameInput = await page.$(usernameSelector);
  const passwordInput = await page.$(passwordSelector);

  if (usernameInput && passwordInput) {
    await usernameInput.click({ clickCount: 3 });
    await usernameInput.type(account.username, { delay: 30 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(password, { delay: 30 });
  } else {
    const inputs = await page.$$('input');
    if (inputs.length < 2) {
      throw new Error('未找到登录输入框');
    }
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type(account.username, { delay: 30 });
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(password, { delay: 30 });
  }

  // Wait for any Turnstile to resolve before submitting
  await waitForCloudflareBypass(page, Math.min(timeoutMs, 30000));

  const submitBtn = await page.$('button[type="submit"], button.btn-primary, button:not([type="button"])');
  if (!submitBtn) {
    throw new Error('未找到登录按钮');
  }

  await Promise.all([
    submitBtn.click(),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: timeoutMs }).catch(() => null),
  ]);

  await new Promise(r => setTimeout(r, 1200));
}

async function loginWithSession(page, account, timeoutMs, tokenOverride) {
  const rawToken = tokenOverride || account.session_token;
  if (!rawToken) {
    throw new Error('账号缺少 Session Token，无法登录');
  }

  const url = normalizeBaseUrlForApi(account.base_url);
  const rawValue = tokenOverride ? tokenOverride : decrypt(account.session_token);
  const parsedToken = extractCookieToken(rawValue);
  const token = parsedToken.token;
  if (!token) {
    throw new Error('Session Token 为空，无法登录');
  }
  const parsed = new URL(url);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });

  // Check for Cloudflare before setting session
  await waitForCloudflareBypass(page, Math.min(timeoutMs, 30000));

  const cookieNames = new Set(['session', 'token']);
  if (parsedToken.cookieName) cookieNames.add(parsedToken.cookieName);
  const cookies = Array.from(cookieNames).map((name) => ({
    name,
    value: token,
    domain: parsed.hostname,
    path: '/',
    secure: parsed.protocol === 'https:',
    sameSite: 'Lax',
  }));
  await page.setCookie(...cookies);
  await page.evaluate((t) => {
    localStorage.setItem('session', t);
    localStorage.setItem('token', t);
    try {
      localStorage.setItem('user', JSON.stringify({ token: t }));
    } catch {
      // ignore storage errors
    }
  }, token);

  await page.reload({ waitUntil: 'networkidle2', timeout: timeoutMs });
  await new Promise(r => setTimeout(r, 1000));
}

// ---------------------------------------------------------------------------
// Extract session token after password login (for future direct API use)
// ---------------------------------------------------------------------------

async function extractSessionAfterLogin(page, baseUrl) {
  try {
    const token = await page.evaluate(() => {
      // Try common storage locations
      const fromLocal = localStorage.getItem('token') || localStorage.getItem('session');
      if (fromLocal) return fromLocal;
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.token) return user.token;
      } catch { /* ignore */ }
      return null;
    });

    if (token) {
      logger.info('Extracted session token from page after login');
      return normalizeBearerToken(token);
    }

    // Try from cookies
    const cookies = await page.cookies();
    const sessionCookie = cookies.find(c => c.name === 'session' || c.name === 'token');
    if (sessionCookie?.value) {
      logger.info('Extracted session token from cookies after login');
      return normalizeBearerToken(sessionCookie.value);
    }

    return null;
  } catch (err) {
    logger.debug(`Failed to extract session after login: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Browser-based API calls (fallback when direct API is blocked)
// ---------------------------------------------------------------------------

function getCheckinApiUrl(baseUrl, checkinPathOverride) {
  const checkinPath = checkinPathOverride || getCheckinPath();
  if (checkinPath.startsWith('http://') || checkinPath.startsWith('https://')) return checkinPath;
  return `${baseUrl}${checkinPath}`;
}

async function probeSession(page, baseUrl, authToken = null, extraHeaders = null) {
  const month = new Date().toISOString().slice(0, 7);
  const checkinPaths = getCheckinPathCandidates();
  const probeUrls = [
    `${baseUrl}/api/user/self`,
    ...checkinPaths.map((path) => (
      path.startsWith('http://') || path.startsWith('https://')
        ? `${path}${path.includes('?') ? '&' : '?'}month=${month}`
        : `${baseUrl}${path}?month=${month}`
    )),
  ];

  let lastMessage = '无法验证登录状态';
  let hasMeaningfulMessage = false;
  for (const apiUrl of probeUrls) {
    const response = await page.evaluate(async (url, token, headersExtra) => {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        if (headersExtra) {
          Object.assign(headers, headersExtra);
        }
        const res = await fetch(url, { method: 'GET', credentials: 'include', headers });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { data = null; }
        return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
      } catch (e) {
        return { ok: false, status: 0, data: null, text: e.message || 'request failed' };
      }
    }, apiUrl, authToken, extraHeaders);

    if (response.ok && response.data?.success !== false) {
      return { success: true, message: '连接测试成功' };
    }

    let message = response.data?.message || response.text || `HTTP ${response.status}`;

    // If token auth fails, retry with cookie-only to support session-based auth
    if (authToken && isAccessTokenInvalidMessage(message)) {
      const retry = await page.evaluate(async (url, headersExtra) => {
        try {
          const headers = headersExtra || undefined;
          const res = await fetch(url, { method: 'GET', credentials: 'include', headers });
          const text = await res.text();
          let data = null;
          try { data = JSON.parse(text); } catch { data = null; }
          return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
        } catch (e) {
          return { ok: false, status: 0, data: null, text: e.message || 'request failed' };
        }
      }, apiUrl, extraHeaders);

      if (retry.ok && retry.data?.success !== false) {
        return { success: true, message: '连接测试成功' };
      }
      message = retry.data?.message || retry.text || `HTTP ${retry.status}`;
    }

    const notFoundLike = response.status === 404 || response.status === 405 || isNotFoundLikeMessage(message);
    if (!notFoundLike || !hasMeaningfulMessage) {
      lastMessage = message;
      if (!notFoundLike) hasMeaningfulMessage = true;
    }
  }

  return { success: false, message: lastMessage };
}

async function extractCheckinResult(page, baseUrl, authToken = null, checkinPathOverride, extraHeaders = null) {
  const apiUrl = getCheckinApiUrl(baseUrl, checkinPathOverride);

  let response = await page.evaluate(async (url, token, headersExtra) => {
    try {
      const headers = token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
      if (headersExtra) {
        Object.assign(headers, headersExtra);
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch { data = null; }
      return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
    } catch (e) {
      return { ok: false, status: 0, data: null, text: e.message || 'request failed' };
    }
  }, apiUrl, authToken, extraHeaders);

  if (response.ok && response.data) {
    return response.data;
  }

  let message = response.data?.message || response.text || `签到请求失败（HTTP ${response.status}）`;

  if (authToken && isAccessTokenInvalidMessage(message)) {
    response = await page.evaluate(async (url, headersExtra) => {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (headersExtra) {
          Object.assign(headers, headersExtra);
        }
        const res = await fetch(url, {
          method: 'POST',
          headers,
          credentials: 'include',
        });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { data = null; }
        return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
      } catch (e) {
        return { ok: false, status: 0, data: null, text: e.message || 'request failed' };
      }
    }, apiUrl, extraHeaders);

    if (response.ok && response.data) {
      return response.data;
    }

    message = response.data?.message || response.text || `签到请求失败（HTTP ${response.status}）`;
  }

  return {
    success: false,
    message,
    status: response.status,
  };
}

// ---------------------------------------------------------------------------
// Quota helper: query quota via direct API, returns number or null
// ---------------------------------------------------------------------------

async function queryQuota(baseUrl, token, extraHeaders = null, account = null) {
  if (!token) return null;
  try {
    const info = await fetchAccountQuota(baseUrl, token, extraHeaders);
    return normalizeQuotaInfo(info, account);
  } catch (err) {
    logger.debug(`Quota query failed for ${baseUrl}: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API: test, checkin, checkinAll
// ---------------------------------------------------------------------------

export async function testAccountConnection(account) {
  logger.info(`Testing account connection: ${account.name} (${account.base_url})`);
  const baseUrl = normalizeBaseUrlForApi(account.base_url);
  const token = getDecryptedToken(account);
  const extraHeaders = buildExtraHeaders(account);

  // Strategy: try direct API first for session-token accounts
  if (token) {
    logger.info(`Trying direct API test for ${account.name}...`);
    const directResult = await directTestConnection(baseUrl, token, extraHeaders);
    if (directResult.success) {
      // Also refresh quota while we're at it
      const quota = await queryQuota(baseUrl, token, extraHeaders, account);
      if (quota) {
        updateAccountQuota(account.id, quota.quota, quota.used_quota);
      }
      return directResult;
    }
    if (!directResult.isCloudflare) {
      if (account.login_type !== 'session') {
        // Non-CF failure (bad token etc), no point trying browser
        return directResult;
      }
      logger.info(`Direct API test failed for session login (${account.name}); trying browser session flow...`);
    }
    logger.info(`Direct API blocked by Cloudflare for ${account.name}, falling back to browser...`);
  }

  // Fallback: browser-based test
  const timeoutMs = getNumberSetting('browser_timeout_seconds', 60) * 1000;
  const headless = getSetting('browser_headless', '1') === '1' ? 'new' : false;
  const sessionToken = account.login_type === 'session' && account.session_token
    ? normalizeBearerToken(decrypt(account.session_token))
    : null;

  try {
    const browser = await launchBrowser({ headless });
    const page = await createPage(browser, { timeoutMs });

    if (account.login_type === 'session') {
      await loginWithSession(page, account, timeoutMs, sessionToken);
    } else {
      await loginWithPassword(page, account, timeoutMs);

      // Extract and cache token for future direct API use
      const extracted = await extractSessionAfterLogin(page, baseUrl);
      if (extracted) {
        saveCachedToken(account.id, extracted);
        logger.info(`Cached extracted token for ${account.name}`);
      }
    }

    const result = await probeSession(page, baseUrl, sessionToken, extraHeaders);
    await page.close();
    return result;
  } catch (err) {
    logger.error(`Test connection error for ${account.name}: ${err.message}`);
    return { success: false, message: err.message };
  } finally {
    await closeBrowser();
  }
}

export async function checkinAccount(account) {
  logger.info(`Starting checkin for account: ${account.name} (${account.base_url})`);
  const baseUrl = normalizeBaseUrlForApi(account.base_url);
  const configuredCheckinPath = getCheckinPath();
  const token = getDecryptedToken(account);
  const extraHeaders = buildExtraHeaders(account);

  // Strategy: try direct API first for accounts with a token
  if (token) {
    logger.info(`Trying direct API checkin for ${account.name}...`);

    // Query quota before checkin
    const quotaBefore = await queryQuota(baseUrl, token, extraHeaders, account);
    const quotaBeforeStr = quotaBefore?.quota != null ? String(quotaBefore.quota) : null;

    try {
      const checkinPaths = getCheckinPathCandidates();
      let lastResult = null;
      for (const path of checkinPaths) {
        const directResult = await performDirectCheckin(baseUrl, token, path, extraHeaders);
        lastResult = directResult;
        const success = directResult.success !== false && !directResult.error;
        const message = directResult.message || JSON.stringify(directResult);

        if (success) {
          // Query quota after checkin
          const quotaAfter = await queryQuota(baseUrl, token, extraHeaders, account);
          const quotaAfterStr = quotaAfter?.quota != null ? String(quotaAfter.quota) : null;

          if (quotaAfter) {
            updateAccountQuota(account.id, quotaAfter.quota, quotaAfter.used_quota);
          }

          if (path !== configuredCheckinPath) {
            maybeAutoUpdateCheckinPath(configuredCheckinPath, path);
          }

          logCheckin(account.id, 'success', message, quotaBeforeStr, quotaAfterStr);
          logger.info(`Direct API checkin success for ${account.name}: ${message}`);
          return { success: true, message };
        }

        if (directResult.isNotFound) {
          continue;
        }

        if (directResult.isCloudflare) {
          logger.info(`Direct API checkin blocked by Cloudflare for ${account.name}, falling back to browser...`);
          lastResult = directResult;
          break;
        }

        if (account.login_type === 'session') {
          logger.info(`Direct API checkin failed for ${account.name}, trying browser session flow...`);
          lastResult = directResult;
          break;
        }

        logCheckin(account.id, 'failed', message, quotaBeforeStr, null);
        logger.info(`Direct API checkin failed for ${account.name}: ${message}`);
        return { success: false, message };
      }

      if (lastResult && lastResult.isNotFound) {
        const message = lastResult.message || '未找到可用的签到接口';
        logCheckin(account.id, 'failed', message, quotaBeforeStr, null);
        logger.info(`Direct API checkin failed for ${account.name}: ${message}`);
        return { success: false, message };
      }

      // If we reach here, fall through to browser-based checkin.
    } catch (err) {
      logCheckin(account.id, 'failed', err.message, quotaBeforeStr, null);
      logger.error(`Direct API checkin error for ${account.name}: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  // Fallback: browser-based checkin
  const timeoutMs = getNumberSetting('browser_timeout_seconds', 60) * 1000;
  const headless = getSetting('browser_headless', '1') === '1' ? 'new' : false;
  const sessionToken = account.login_type === 'session' && account.session_token
    ? normalizeBearerToken(decrypt(account.session_token))
    : null;

  try {
    const browser = await launchBrowser({ headless });
    const page = await createPage(browser, { timeoutMs });

    if (account.login_type === 'session' && account.session_token) {
      await loginWithSession(page, account, timeoutMs, sessionToken);
    } else {
      await loginWithPassword(page, account, timeoutMs);

      // Extract and cache token for future direct API use
      const extracted = await extractSessionAfterLogin(page, baseUrl);
      if (extracted) {
        saveCachedToken(account.id, extracted);
        logger.info(`Cached extracted token for ${account.name}`);
      }
    }

    const checkinPaths = getCheckinPathCandidates();
    let result = null;
    for (const path of checkinPaths) {
      result = await extractCheckinResult(page, baseUrl, sessionToken, path, extraHeaders);
      if (result && result.success !== false && !result.error) {
        if (path !== configuredCheckinPath) {
          maybeAutoUpdateCheckinPath(configuredCheckinPath, path);
        }
        break;
      }
      const message = result?.message || '';
      if (result?.status === 404 || /invalid url|not found|cannot post/i.test(message)) {
        continue;
      }
      // Non-404 failure: stop and report.
      break;
    }
    await page.close();

    const success = result?.success !== false && !result?.error;
    const message = result?.message || JSON.stringify(result);

    logCheckin(account.id, success ? 'success' : 'failed', message);
    logger.info(`Browser checkin ${success ? 'success' : 'failed'} for ${account.name}: ${message}`);
    return { success, message };
  } catch (err) {
    logCheckin(account.id, 'failed', err.message);
    logger.error(`Checkin error for ${account.name}: ${err.message}`);
    return { success: false, message: err.message };
  } finally {
    await closeBrowser();
  }
}

export async function checkinAll() {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE enabled = 1`).all();
  logger.info(`Running checkin for ${accounts.length} enabled accounts`);
  const results = [];
  for (const account of accounts) {
    const result = await checkinAccount(account);
    results.push({ accountId: account.id, name: account.name, ...result });
    const delay = Math.random() * 3000 + 1000;
    await new Promise(r => setTimeout(r, delay));
  }
  return results;
}

/**
 * Refresh balance/quota for a single account via direct API.
 * Returns { quota, used_quota, username } or throws.
 */
export async function refreshAccountBalance(account) {
  const baseUrl = normalizeBaseUrlForApi(account.base_url);
  const token = getDecryptedToken(account);
  const extraHeaders = buildExtraHeaders(account);

  if (!token) {
    throw new Error('无可用 Token，请先测试连接以提取 Token');
  }

  try {
    const info = normalizeQuotaInfo(await fetchAccountQuota(baseUrl, token, extraHeaders), account);
    updateAccountQuota(account.id, info.quota, info.used_quota);
    return info;
  } catch (err) {
    if (account.login_type !== 'session') {
      throw err;
    }
  }

  // Fallback for session-based accounts: use browser cookie session
  const timeoutMs = getNumberSetting('browser_timeout_seconds', 60) * 1000;
  const headless = getSetting('browser_headless', '1') === '1' ? 'new' : false;
  const sessionToken = account.session_token
    ? normalizeBearerToken(decrypt(account.session_token))
    : null;

  if (!sessionToken) {
    throw new Error('无可用 Session Token，无法查询余额');
  }

  try {
    const browser = await launchBrowser({ headless });
    const page = await createPage(browser, { timeoutMs });
    await loginWithSession(page, account, timeoutMs, sessionToken);

    const response = await page.evaluate(async (url, headersExtra) => {
      try {
        const headers = headersExtra || undefined;
        const res = await fetch(`${url}/api/user/self`, { method: 'GET', credentials: 'include', headers });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { data = null; }
        return { ok: res.ok, status: res.status, data, text: text.slice(0, 200) };
      } catch (e) {
        return { ok: false, status: 0, data: null, text: e.message || 'request failed' };
      }
    }, baseUrl, extraHeaders);

    if (!response.ok || !response.data) {
      const message = response.data?.message || response.text || `HTTP ${response.status}`;
      throw new Error(message);
    }

    const user = response.data.data || response.data;
    const info = normalizeQuotaInfo({
      quota: user.quota ?? null,
      used_quota: user.used_quota ?? null,
      username: user.username ?? null,
      display_name: user.display_name || user.username || null,
      quota_unit: user.quota_unit ?? null,
    }, account);
    updateAccountQuota(account.id, info.quota, info.used_quota);
    await page.close();
    return info;
  } finally {
    await closeBrowser();
  }
}
