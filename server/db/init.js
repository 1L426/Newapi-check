import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DB_PATH, DEFAULT_SETTINGS } from '../utils/constants.js';
import logger from '../utils/logger.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    login_type TEXT NOT NULL DEFAULT 'password',
    username TEXT,
    password_encrypted TEXT,
    session_token TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_checkin_at TEXT,
    last_checkin_result TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS checkin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    quota_before TEXT,
    quota_after TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// Migrate: add new columns if they don't exist
const existingCols = db.prepare(`PRAGMA table_info(accounts)`).all().map(c => c.name);

const migrations = [
  { col: 'quota', sql: `ALTER TABLE accounts ADD COLUMN quota REAL` },
  { col: 'used_quota', sql: `ALTER TABLE accounts ADD COLUMN used_quota REAL` },
  { col: 'balance_updated_at', sql: `ALTER TABLE accounts ADD COLUMN balance_updated_at TEXT` },
  { col: 'cached_token', sql: `ALTER TABLE accounts ADD COLUMN cached_token TEXT` },
  { col: 'last_error_message', sql: `ALTER TABLE accounts ADD COLUMN last_error_message TEXT` },
  { col: 'last_error_at', sql: `ALTER TABLE accounts ADD COLUMN last_error_at TEXT` },
  { col: 'new_api_user', sql: `ALTER TABLE accounts ADD COLUMN new_api_user TEXT` },
  { col: 'quota_unit', sql: `ALTER TABLE accounts ADD COLUMN quota_unit REAL` },
];

for (const m of migrations) {
  if (!existingCols.includes(m.col)) {
    db.exec(m.sql);
    logger.info(`Migration: added column '${m.col}' to accounts table`);
  }
}

// Seed default settings
const upsert = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
const seedSettings = db.transaction(() => {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    upsert.run(key, value);
  }
});
seedSettings();

logger.info('Database initialized');

export default db;
