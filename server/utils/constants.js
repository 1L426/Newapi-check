import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(__dirname, '../..');
export const DB_PATH = path.join(PROJECT_ROOT, 'data', 'checkin.db');
export const LOG_DIR = path.join(PROJECT_ROOT, 'data', 'logs');

export const DEFAULT_SETTINGS = {
  auto_checkin_enabled: '0',
  auto_checkin_cron: '0 8 * * *',
  max_retries: '3',
  retry_delay_minutes: '5',
  random_delay_max_seconds: '300',
  browser_headless: '1',
  browser_timeout_seconds: '60',
  checkin_path: '/api/user/self/checkin',
};
