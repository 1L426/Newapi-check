import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import logger from '../utils/logger.js';

puppeteer.use(StealthPlugin());

let browser = null;

export async function launchBrowser(options = {}) {
  if (browser && browser.connected) return browser;
  const headless = options.headless ?? 'new';
  logger.info('Launching browser (stealth mode)...');
  browser = await puppeteer.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--window-size=1280,800',
    ],
  });
  browser.on('disconnected', () => {
    browser = null;
    logger.info('Browser disconnected');
  });
  return browser;
}

export async function closeBrowser() {
  if (browser && browser.connected) {
    await browser.close();
    browser = null;
    logger.info('Browser closed');
  }
}

export async function createPage(b, options = {}) {
  const page = await b.newPage();
  const timeout = Number(options.timeoutMs || 60000);
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  return page;
}
