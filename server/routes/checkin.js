import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/init.js';
import { checkinAccount, checkinAll } from '../services/checkin-worker.js';

const router = Router();

// Task management for async checkin
const checkinTasks = new Map();

function generateTaskId() {
  return randomUUID();
}

function cleanupOldTasks() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  for (const [taskId, task] of checkinTasks) {
    if (now - task.startedAt > maxAge) {
      checkinTasks.delete(taskId);
    }
  }
}

function toInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildLogFilters(query = {}) {
  const { account_id, status, date, start_date, end_date } = query;
  let whereSql = ' WHERE 1=1 ';
  const params = [];

  if (account_id) {
    whereSql += ' AND l.account_id = ? ';
    params.push(account_id);
  }
  if (status) {
    whereSql += ' AND l.status = ? ';
    params.push(status);
  }
  if (date) {
    whereSql += ' AND date(l.created_at) = ? ';
    params.push(date);
  }
  if (start_date) {
    whereSql += ' AND date(l.created_at) >= ? ';
    params.push(start_date);
  }
  if (end_date) {
    whereSql += ' AND date(l.created_at) <= ? ';
    params.push(end_date);
  }

  return { whereSql, params };
}

async function runSingle(id, res) {
  const account = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  try {
    const result = await checkinAccount(account);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function runAll(res) {
  try {
    const results = await checkinAll();
    return res.json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

router.post('/run/:id', async (req, res) => runSingle(req.params.id, res));
router.post('/run-all', async (req, res) => runAll(res));

// Async checkin with progress tracking
router.post('/run-all-async', async (req, res) => {
  cleanupOldTasks();

  const { accountIds } = req.body;
  const taskId = generateTaskId();

  // Get accounts to checkin
  let accounts;
  if (accountIds && Array.isArray(accountIds) && accountIds.length > 0) {
    const placeholders = accountIds.map(() => '?').join(',');
    accounts = db.prepare(`SELECT * FROM accounts WHERE id IN (${placeholders}) AND enabled = 1`).all(...accountIds);
  } else {
    accounts = db.prepare(`SELECT * FROM accounts WHERE enabled = 1`).all();
  }

  // Initialize task
  const task = {
    status: 'running',
    total: accounts.length,
    completed: 0,
    current: null,
    results: [],
    startedAt: Date.now(),
    cancelled: false,
    sseClients: new Set(),
  };
  checkinTasks.set(taskId, task);

  // Return taskId immediately
  res.json({ taskId, message: 'Checkin started', total: accounts.length });

  // Run checkin in background
  runCheckinTask(taskId, accounts);
});

async function runCheckinTask(taskId, accounts) {
  const task = checkinTasks.get(taskId);
  if (!task) return;

  const broadcastProgress = () => {
    const data = JSON.stringify({
      status: task.status,
      total: task.total,
      completed: task.completed,
      current: task.current,
      results: task.results,
    });
    for (const client of task.sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  };

  try {
    for (const account of accounts) {
      if (task.cancelled) {
        task.status = 'cancelled';
        broadcastProgress();
        break;
      }

      task.current = account.name;
      broadcastProgress();

      const result = await checkinAccount(account);
      task.results.push({ accountId: account.id, name: account.name, ...result });
      task.completed++;
      broadcastProgress();

      // Random delay between accounts
      if (task.completed < accounts.length && !task.cancelled) {
        const delay = Math.random() * 3000 + 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    if (!task.cancelled) {
      task.status = 'completed';
      task.current = null;
      broadcastProgress();
    }
  } catch (err) {
    task.status = 'failed';
    task.current = null;
    broadcastProgress();
  }

  // Close all SSE connections after a short delay
  setTimeout(() => {
    for (const client of task.sseClients) {
      client.end();
    }
    task.sseClients.clear();
  }, 1000);
}

// SSE endpoint for progress updates
router.get('/progress/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = checkinTasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Add client to task's SSE clients
  task.sseClients.add(res);

  // Send initial progress
  const data = JSON.stringify({
    status: task.status,
    total: task.total,
    completed: task.completed,
    current: task.current,
    results: task.results,
  });
  res.write(`data: ${data}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    task.sseClients.delete(res);
  });
});

// Get task status
router.get('/task/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = checkinTasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({
    status: task.status,
    total: task.total,
    completed: task.completed,
    current: task.current,
    results: task.results,
  });
});

// Cancel task
router.post('/cancel/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = checkinTasks.get(taskId);

  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  task.cancelled = true;
  res.json({ message: 'Cancellation requested' });
});

router.get('/status', (req, res) => {
  const accounts = db.prepare(`
    SELECT
      a.id,
      a.name,
      a.enabled,
      a.last_checkin_at,
      a.last_checkin_result,
      (
        SELECT l.status
        FROM checkin_logs l
        WHERE l.account_id = a.id
          AND date(l.created_at) = date('now','localtime')
        ORDER BY l.created_at DESC
        LIMIT 1
      ) AS today_status,
      (
        SELECT l.message
        FROM checkin_logs l
        WHERE l.account_id = a.id
          AND date(l.created_at) = date('now','localtime')
        ORDER BY l.created_at DESC
        LIMIT 1
      ) AS today_message
    FROM accounts a
    ORDER BY a.id DESC
  `).all();

  const summary = {
    total: accounts.length,
    enabled: accounts.filter(a => a.enabled === 1).length,
    success: accounts.filter(a => a.today_status === 'success').length,
    failed: accounts.filter(a => a.today_status === 'failed').length,
    pending: accounts.filter(a => !a.today_status).length,
  };

  res.json({ summary, accounts });
});

router.get('/logs', (req, res) => {
  const limit = Math.max(1, Math.min(200, toInt(req.query.limit, 50)));
  const offset = Math.max(0, toInt(req.query.offset, 0));
  const { whereSql, params } = buildLogFilters(req.query);

  const logs = db.prepare(`
    SELECT l.*, a.name as account_name
    FROM checkin_logs l
    JOIN accounts a ON l.account_id = a.id
    ${whereSql}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM checkin_logs l
    ${whereSql}
  `).get(...params).count;

  res.json({ logs, total, limit, offset });
});

router.get('/logs/:id', (req, res) => {
  const accountId = req.params.id;
  const limit = Math.max(1, Math.min(200, toInt(req.query.limit, 50)));
  const offset = Math.max(0, toInt(req.query.offset, 0));

  const account = db.prepare(`SELECT id, name FROM accounts WHERE id = ?`).get(accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const logs = db.prepare(`
    SELECT id, account_id, status, message, quota_before, quota_after, created_at
    FROM checkin_logs
    WHERE account_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(accountId, limit, offset);

  const total = db.prepare(`SELECT COUNT(*) as count FROM checkin_logs WHERE account_id = ?`).get(accountId).count;
  res.json({ account, logs, total, limit, offset });
});

router.get('/dashboard', (req, res) => {
  const totalAccounts = db.prepare(`SELECT COUNT(*) as count FROM accounts`).get().count;
  const enabledAccounts = db.prepare(`SELECT COUNT(*) as count FROM accounts WHERE enabled = 1`).get().count;
  const todaySuccess = db.prepare(`
    SELECT COUNT(*) as count
    FROM checkin_logs
    WHERE status = 'success' AND date(created_at) = date('now','localtime')
  `).get().count;
  const todayFailed = db.prepare(`
    SELECT COUNT(*) as count
    FROM checkin_logs
    WHERE status = 'failed' AND date(created_at) = date('now','localtime')
  `).get().count;
  const recentLogs = db.prepare(`
    SELECT l.*, a.name as account_name
    FROM checkin_logs l
    JOIN accounts a ON l.account_id = a.id
    ORDER BY l.created_at DESC
    LIMIT 10
  `).all();

  const last7days = db.prepare(`
    SELECT date(created_at) as date, status, COUNT(*) as count
    FROM checkin_logs
    WHERE created_at >= datetime('now', '-7 days', 'localtime')
    GROUP BY date(created_at), status
    ORDER BY date
  `).all();

  // Aggregate balance data across all enabled accounts
  const balanceRow = db.prepare(`
    SELECT COALESCE(SUM(quota), 0) as total_quota,
           COALESCE(SUM(used_quota), 0) as total_used_quota
    FROM accounts
    WHERE enabled = 1 AND quota IS NOT NULL
  `).get();

  res.json({
    totalAccounts,
    enabledAccounts,
    todaySuccess,
    todayFailed,
    totalQuota: balanceRow.total_quota,
    totalUsedQuota: balanceRow.total_used_quota,
    recentLogs,
    last7days,
  });
});

// Compatibility endpoints aligned with the initial API design.
router.post('/all', async (req, res) => runAll(res));
router.post('/:id', async (req, res) => runSingle(req.params.id, res));

export default router;
