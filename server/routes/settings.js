import { Router } from 'express';
import cron from 'node-cron';
import db from '../db/init.js';
import { restartScheduler } from '../services/scheduler.js';

const router = Router();

const validators = {
  auto_checkin_enabled: (v) => ['0', '1'].includes(String(v)),
  auto_checkin_cron: (v) => cron.validate(String(v)),
  max_retries: (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 10,
  retry_delay_minutes: (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 120,
  random_delay_max_seconds: (v) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 3600,
  browser_headless: (v) => ['0', '1'].includes(String(v)),
  browser_timeout_seconds: (v) => Number.isInteger(Number(v)) && Number(v) >= 10 && Number(v) <= 300,
  checkin_path: (v) => typeof v === 'string' && v.trim().startsWith('/'),
  encrypt_key: (v) => typeof v === 'string' && /^[a-fA-F0-9]{64}$/.test(v),
};

function validateSettings(updates = {}) {
  const errors = [];
  for (const [key, value] of Object.entries(updates)) {
    const validator = validators[key];
    if (!validator) {
      errors.push(`Unsupported setting key: ${key}`);
      continue;
    }
    if (!validator(value)) {
      errors.push(`Invalid value for ${key}`);
    }
  }
  return errors;
}

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

router.put('/', (req, res) => {
  const updates = req.body || {};
  const errors = validateSettings(updates);
  if (errors.length > 0) return res.status(400).json({ error: 'Settings validation failed', details: errors });

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
  `);
  const updateAll = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      stmt.run(key, String(value));
    }
  });
  updateAll();
  restartScheduler();
  res.json({ message: 'Settings updated' });
});

router.get('/export', (req, res) => {
  const settings = db.prepare(`SELECT key, value FROM settings`).all();
  const accounts = db.prepare(`
    SELECT id, name, base_url, login_type, username, password_encrypted, session_token,
           enabled, last_checkin_at, last_checkin_result, last_error_message, last_error_at,
           new_api_user, quota_unit,
           created_at, updated_at
    FROM accounts
    ORDER BY id ASC
  `).all();
  const logs = db.prepare(`
    SELECT id, account_id, status, message, quota_before, quota_after, created_at
    FROM checkin_logs
    ORDER BY id ASC
  `).all();

  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    settings,
    accounts,
    checkin_logs: logs,
  });
});

router.post('/import', (req, res) => {
  const overwrite = req.body?.overwrite !== undefined ? Boolean(req.body.overwrite) : true;
  const data = req.body?.data || req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid import payload' });
  }

  const settingsRows = Array.isArray(data.settings) ? data.settings : [];
  const accountsRows = Array.isArray(data.accounts) ? data.accounts : [];
  const logRows = Array.isArray(data.checkin_logs) ? data.checkin_logs : [];

  const settingMap = Object.fromEntries(
    settingsRows
      .filter(row => row && typeof row.key === 'string')
      .map(row => [row.key, String(row.value ?? '')])
  );
  const settingErrors = validateSettings(settingMap);
  if (settingErrors.length > 0) {
    return res.status(400).json({ error: 'Import settings validation failed', details: settingErrors });
  }

  const tx = db.transaction(() => {
    if (overwrite) {
      db.prepare(`DELETE FROM checkin_logs`).run();
      db.prepare(`DELETE FROM accounts`).run();
    }

    if (settingsRows.length > 0) {
      const upsertSetting = db.prepare(`
        INSERT OR REPLACE INTO settings (key, value, updated_at)
        VALUES (?, ?, datetime('now','localtime'))
      `);
      for (const row of settingsRows) {
        if (!row?.key) continue;
        upsertSetting.run(row.key, String(row.value ?? ''));
      }
    }

    const insertAccountWithId = db.prepare(`
      INSERT OR REPLACE INTO accounts
      (id, name, base_url, login_type, username, password_encrypted, session_token, enabled, last_checkin_at, last_checkin_result, last_error_message, last_error_at, new_api_user, quota_unit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), COALESCE(?, datetime('now','localtime')))
    `);
    const insertAccount = db.prepare(`
      INSERT INTO accounts
      (name, base_url, login_type, username, password_encrypted, session_token, enabled, last_checkin_at, last_checkin_result, last_error_message, last_error_at, new_api_user, quota_unit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')), COALESCE(?, datetime('now','localtime')))
    `);

    for (const row of accountsRows) {
      if (!row?.name || !row?.base_url) continue;
      const loginType = ['password', 'session'].includes(row.login_type) ? row.login_type : 'password';
      const enabled = row.enabled ? 1 : 0;
      const username = loginType === 'password' ? (row.username ?? null) : null;
      const passwordEncrypted = loginType === 'password' ? (row.password_encrypted ?? null) : null;
      const sessionToken = loginType === 'session' ? (row.session_token ?? null) : null;

      if (overwrite && row.id) {
        insertAccountWithId.run(
          row.id,
          row.name,
          String(row.base_url).replace(/\/$/, ''),
          loginType,
          username,
          passwordEncrypted,
          sessionToken,
          enabled,
          row.last_checkin_at ?? null,
          row.last_checkin_result ?? null,
          row.last_error_message ?? null,
          row.last_error_at ?? null,
          row.new_api_user ?? null,
          row.quota_unit ?? null,
          row.created_at ?? null,
          row.updated_at ?? null
        );
      } else {
        insertAccount.run(
          row.name,
          String(row.base_url).replace(/\/$/, ''),
          loginType,
          username,
          passwordEncrypted,
          sessionToken,
          enabled,
          row.last_checkin_at ?? null,
          row.last_checkin_result ?? null,
          row.last_error_message ?? null,
          row.last_error_at ?? null,
          row.new_api_user ?? null,
          row.quota_unit ?? null,
          row.created_at ?? null,
          row.updated_at ?? null
        );
      }
    }

    if (overwrite && logRows.length > 0) {
      const insertLog = db.prepare(`
        INSERT OR REPLACE INTO checkin_logs
        (id, account_id, status, message, quota_before, quota_after, created_at)
        VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))
      `);
      for (const row of logRows) {
        if (!row?.id || !row?.account_id || !row?.status) continue;
        insertLog.run(
          row.id,
          row.account_id,
          row.status,
          row.message ?? null,
          row.quota_before ?? null,
          row.quota_after ?? null,
          row.created_at ?? null
        );
      }
    }
  });

  tx();
  restartScheduler();
  res.json({
    message: 'Import completed',
    overwrite,
    imported: {
      settings: settingsRows.length,
      accounts: accountsRows.length,
      checkin_logs: overwrite ? logRows.length : 0,
    },
  });
});

export default router;
