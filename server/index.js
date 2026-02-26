import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import { setEncryptKey, generateKey } from './services/crypto.js';
import db from './db/init.js';
import { startScheduler } from './services/scheduler.js';
import accountsRouter from './routes/accounts.js';
import checkinRouter from './routes/checkin.js';
import settingsRouter from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3211', 10);

// Initialize encryption key
let encryptKey = process.env.ENCRYPT_KEY;
if (!encryptKey) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'encrypt_key'`).get();
  if (row) {
    encryptKey = row.value;
  } else {
    encryptKey = generateKey();
    db.prepare(`INSERT INTO settings (key, value) VALUES ('encrypt_key', ?)`).run(encryptKey);
    logger.info('Generated new encryption key');
  }
}
setEncryptKey(encryptKey);

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/accounts', accountsRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/settings', settingsRouter);

// Production: serve static files
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  startScheduler();
});
