import winston from 'winston';
import fs from 'fs';
import { LOG_DIR } from './constants.js';

fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
      ),
    }),
    new winston.transports.File({ filename: `${LOG_DIR}/app.log`, maxsize: 5242880, maxFiles: 3 }),
    new winston.transports.File({ filename: `${LOG_DIR}/error.log`, level: 'error', maxsize: 5242880, maxFiles: 3 }),
  ],
});

export default logger;
