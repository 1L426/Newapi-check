import { Router } from 'express';
import db from '../db/init.js';
import { encrypt } from '../services/crypto.js';
import { testAccountConnection, refreshAccountBalance } from '../services/checkin-worker.js';

const router = Router();

function validateBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return 'base_url is required';
  try {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return 'base_url must start with http or https';
    return null;
  } catch {
    return 'base_url is invalid';
  }
}

function normalizeBaseUrlValue(baseUrl) {
  const parsed = new URL(baseUrl);
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
}

function trimMessage(value, max = 300) {
  if (!value) return null;
  return String(value).slice(0, max);
}

function validateCreatePayload(payload) {
  const { name, base_url, login_type = 'password', username, password, session_token } = payload;
  if (!name || !String(name).trim()) return 'name is required';
  const baseErr = validateBaseUrl(base_url);
  if (baseErr) return baseErr;
  if (!['password', 'session'].includes(login_type)) return 'login_type must be password or session';

  if (login_type === 'password') {
    if (!username || !String(username).trim()) return 'username is required when login_type=password';
    if (!password || !String(password).trim()) return 'password is required when login_type=password';
  } else if (!session_token || !String(session_token).trim()) {
    return 'session_token is required when login_type=session';
  }

  return null;
}

function validateUpdatePayload(payload, existing) {
  const nextLoginType = payload.login_type || existing.login_type;
  if (!['password', 'session'].includes(nextLoginType)) return 'login_type must be password or session';

  if (payload.base_url !== undefined) {
    const baseErr = validateBaseUrl(payload.base_url);
    if (baseErr) return baseErr;
  }

  if (payload.name !== undefined && !String(payload.name).trim()) {
    return 'name cannot be empty';
  }

  const nextUsername = payload.username !== undefined ? payload.username : existing.username;
  const hasPassword = Boolean(payload.password) || Boolean(existing.password_encrypted);
  const hasSession = Boolean(payload.session_token) || Boolean(existing.session_token);

  if (nextLoginType === 'password') {
    if (!nextUsername || !String(nextUsername).trim()) return 'username is required when login_type=password';
    if (!hasPassword) return 'password is required when login_type=password';
  }

  if (nextLoginType === 'session' && !hasSession) {
    return 'session_token is required when login_type=session';
  }

  return null;
}

router.get('/', (req, res) => {
  const accounts = db.prepare(`
    SELECT id, name, base_url, login_type, username, enabled,
           last_checkin_at, last_checkin_result,
           last_error_message, last_error_at,
           new_api_user,
           quota_unit,
           quota, used_quota, balance_updated_at,
           created_at
    FROM accounts
    ORDER BY id DESC
  `).all();
  res.json(accounts);
});

router.get('/:id', (req, res) => {
  const account = db.prepare(`
    SELECT id, name, base_url, login_type, username, enabled,
           last_checkin_at, last_checkin_result,
           last_error_message, last_error_at,
           new_api_user,
           quota_unit,
           quota, used_quota, balance_updated_at,
           created_at
    FROM accounts
    WHERE id = ?
  `).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json(account);
});

router.post('/', (req, res) => {
  const payload = req.body || {};
  const validationError = validateCreatePayload(payload);
  if (validationError) return res.status(400).json({ error: validationError });

  const { name, base_url, login_type = 'password', username, password, session_token, new_api_user, quota_unit } = payload;
  const stmt = db.prepare(`
    INSERT INTO accounts (name, base_url, login_type, username, password_encrypted, session_token, new_api_user, quota_unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    String(name).trim(),
    normalizeBaseUrlValue(String(base_url).trim()),
    login_type,
    login_type === 'password' ? String(username).trim() : null,
    login_type === 'password' ? encrypt(String(password)) : null,
    login_type === 'session' ? encrypt(String(session_token)) : null,
    new_api_user ? String(new_api_user).trim() : null,
    quota_unit !== undefined && quota_unit !== null && String(quota_unit).trim() !== ''
      ? Number(quota_unit)
      : null
  );

  res.json({ id: result.lastInsertRowid, message: 'Account created' });
});

router.post('/batch/toggle', (req, res) => {
  const { enabled } = req.body || {};
  if (enabled === undefined) return res.status(400).json({ error: 'enabled is required' });
  const normalized = enabled ? 1 : 0;
  const result = db.prepare(`
    UPDATE accounts
    SET enabled = ?, updated_at = datetime('now','localtime')
  `).run(normalized);
  res.json({ message: 'Accounts updated', affected: result.changes });
});

router.post('/:id/test', async (req, res) => {
  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const normalizedBaseUrl = normalizeBaseUrlValue(account.base_url);
  if (normalizedBaseUrl !== account.base_url) {
    db.prepare(`
      UPDATE accounts
      SET base_url = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(normalizedBaseUrl, account.id);
    account.base_url = normalizedBaseUrl;
  }
  try {
    const result = await testAccountConnection(account);
    const message = trimMessage(result?.message);
    if (result?.success) {
      db.prepare(`
        UPDATE accounts
        SET last_error_message = NULL, last_error_at = NULL, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(account.id);
    } else if (message) {
      db.prepare(`
        UPDATE accounts
        SET last_error_message = ?, last_error_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(message, account.id);
    }
    res.json(result);
  } catch (err) {
    const message = trimMessage(err.message || 'Test failed');
    db.prepare(`
      UPDATE accounts
      SET last_error_message = ?, last_error_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(message, account.id);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Balance query: single account
router.get('/:id/balance', async (req, res) => {
  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    const info = await refreshAccountBalance(account);
    res.json({
      quota: info.quota,
      used_quota: info.used_quota,
      username: info.username,
      balance_updated_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Balance query: refresh all enabled accounts
router.post('/refresh-all-balance', async (req, res) => {
  const accounts = db.prepare(`SELECT * FROM accounts WHERE enabled = 1`).all();
  const results = [];
  for (const account of accounts) {
    try {
      const info = await refreshAccountBalance(account);
      results.push({
        accountId: account.id,
        name: account.name,
        success: true,
        quota: info.quota,
        used_quota: info.used_quota,
      });
    } catch (err) {
      results.push({
        accountId: account.id,
        name: account.name,
        success: false,
        message: err.message,
      });
    }
  }
  res.json(results);
});

router.put('/:id', (req, res) => {
  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const payload = req.body || {};
  const validationError = validateUpdatePayload(payload, account);
  if (validationError) return res.status(400).json({ error: validationError });

  const nextLoginType = payload.login_type || account.login_type;
  const nextName = payload.name !== undefined ? String(payload.name).trim() : account.name;
  const nextBaseUrl = payload.base_url !== undefined
    ? normalizeBaseUrlValue(String(payload.base_url).trim())
    : account.base_url;
  const nextUsername = payload.username !== undefined
    ? String(payload.username).trim() || null
    : account.username;
  const nextPasswordEncrypted = payload.password
    ? encrypt(String(payload.password))
    : account.password_encrypted;
  const nextSessionToken = payload.session_token
    ? encrypt(String(payload.session_token))
    : account.session_token;
  const nextEnabled = payload.enabled !== undefined ? (payload.enabled ? 1 : 0) : account.enabled;
  const nextNewApiUser = payload.new_api_user !== undefined
    ? (String(payload.new_api_user).trim() || null)
    : account.new_api_user;
  const nextQuotaUnit = payload.quota_unit !== undefined
    ? (String(payload.quota_unit).trim() === '' ? null : Number(payload.quota_unit))
    : account.quota_unit;

  db.prepare(`
    UPDATE accounts
    SET name = ?, base_url = ?, login_type = ?, username = ?,
        password_encrypted = ?, session_token = ?, enabled = ?,
        new_api_user = ?, quota_unit = ?,
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    nextName,
    nextBaseUrl,
    nextLoginType,
    nextLoginType === 'password' ? nextUsername : null,
    nextLoginType === 'password' ? nextPasswordEncrypted : null,
    nextLoginType === 'session' ? nextSessionToken : null,
    nextEnabled,
    nextNewApiUser,
    nextQuotaUnit,
    req.params.id
  );

  res.json({ message: 'Account updated' });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare(`DELETE FROM accounts WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Account not found' });
  res.json({ message: 'Account deleted' });
});

export default router;
