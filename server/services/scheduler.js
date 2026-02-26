import cron from 'node-cron';
import db from '../db/init.js';
import { checkinAll } from './checkin-worker.js';
import logger from '../utils/logger.js';

let currentTask = null;

function getSetting(key) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row?.value;
}

function getRandomDelay() {
  const maxSeconds = parseInt(getSetting('random_delay_max_seconds') || '300', 10);
  return Math.floor(Math.random() * maxSeconds * 1000);
}

async function runWithRetry() {
  const maxRetries = parseInt(getSetting('max_retries') || '3', 10);
  const retryDelay = parseInt(getSetting('retry_delay_minutes') || '5', 10) * 60 * 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info(`Scheduled checkin attempt ${attempt}/${maxRetries}`);
    const results = await checkinAll();
    const allSuccess = results.every(r => r.success);
    if (allSuccess) {
      logger.info('All accounts checked in successfully');
      return;
    }
    if (attempt < maxRetries) {
      logger.info(`Some accounts failed, retrying in ${retryDelay / 60000} minutes...`);
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
}

export function startScheduler() {
  stopScheduler();
  const enabled = getSetting('auto_checkin_enabled');
  if (enabled !== '1') {
    logger.info('Auto checkin is disabled');
    return;
  }
  const cronExpr = getSetting('auto_checkin_cron') || '0 8 * * *';
  if (!cron.validate(cronExpr)) {
    logger.error(`Invalid cron expression: ${cronExpr}`);
    return;
  }
  currentTask = cron.schedule(cronExpr, async () => {
    const delay = getRandomDelay();
    logger.info(`Scheduled checkin triggered, random delay: ${Math.round(delay / 1000)}s`);
    await new Promise(r => setTimeout(r, delay));
    await runWithRetry();
  });
  logger.info(`Scheduler started with cron: ${cronExpr}`);
}

export function stopScheduler() {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
    logger.info('Scheduler stopped');
  }
}

export function restartScheduler() {
  stopScheduler();
  startScheduler();
}
