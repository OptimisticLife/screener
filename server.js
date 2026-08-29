import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5173;

app.use(express.json());
app.use(express.static(__dirname));

let currentRefresh = {
  running: false,
  startTime: null,
  completedTime: null,
  progress: 0,
  currentStock: '',
  totalStocks: 0,
  completedCount: 0,
  errorCount: 0,
  logs: [],
  error: null,
  mode: 'full'
};

let refreshProcess = null;

// Core function to trigger refresh
function startRefreshProcess(mode = 'full') {
  if (currentRefresh.running) {
    return false;
  }

  const scriptPath = path.join(__dirname, 'scripts', 'fetch_yahoo.js');
  const args = [scriptPath];
  if (mode === 'dry-run') args.push('--dry-run');
  if (mode === 'resume') args.push('--resume');

  currentRefresh = {
    running: true,
    startTime: new Date().toISOString(),
    completedTime: null,
    progress: 0,
    currentStock: 'Starting...',
    totalStocks: 0,
    completedCount: 0,
    errorCount: 0,
    logs: ['[SERVER] Starting fetch script...'],
    error: null,
    mode
  };

  refreshProcess = spawn('node', args, {
    cwd: __dirname,
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  refreshProcess.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      currentRefresh.logs.push(trimmed);
      if (currentRefresh.logs.length > 100) {
        currentRefresh.logs.shift();
      }

      const match = trimmed.match(/Progress:\s*\[\s*(\d+)\/(\d+)\]\s*\(([\d.]+)%\)\s*\|\s*([A-Z0-9.\-]+)\s*\|\s*(OK|ERR)/i);
      if (match) {
        const completed = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        const pct = parseFloat(match[3]);
        const symbol = match[4];
        const status = match[5];

        currentRefresh.completedCount = completed;
        currentRefresh.totalStocks = total;
        currentRefresh.progress = pct;
        currentRefresh.currentStock = symbol;

        if (status === 'ERR') {
          currentRefresh.errorCount++;
        }
      }
    });
  });

  refreshProcess.stderr.on('data', (chunk) => {
    const msg = chunk.toString().trim();
    if (msg) {
      currentRefresh.logs.push(`[ERR] ${msg}`);
    }
  });

  refreshProcess.on('close', (code) => {
    currentRefresh.running = false;
    currentRefresh.completedTime = new Date().toISOString();
    if (code === 0) {
      currentRefresh.progress = 100;
      currentRefresh.currentStock = 'Finished';
      currentRefresh.logs.push('[SERVER] Data refresh completed successfully.');
    } else {
      currentRefresh.error = `Process exited with code ${code}`;
      currentRefresh.logs.push(`[SERVER] Data refresh failed with code ${code}`);
    }
    refreshProcess = null;
  });

  return true;
}

// Endpoint: Trigger Refresh
app.post('/api/refresh', (req, res) => {
  if (currentRefresh.running) {
    return res.status(409).json({
      error: 'Refresh already in progress',
      status: currentRefresh
    });
  }

  const mode = req.body?.mode || 'full';
  startRefreshProcess(mode);

  return res.json({
    message: 'Data refresh initiated',
    status: currentRefresh
  });
});

// Endpoint: Cancel Refresh
app.post('/api/refresh/cancel', (req, res) => {
  if (!currentRefresh.running || !refreshProcess) {
    return res.status(400).json({ error: 'No refresh task running' });
  }

  refreshProcess.kill('SIGTERM');
  currentRefresh.running = false;
  currentRefresh.error = 'Cancelled by user';
  currentRefresh.logs.push('[SERVER] Refresh process cancelled by user');

  res.json({ message: 'Refresh process cancelled' });
});

// Endpoint: Status of Refresh
app.get('/api/refresh/status', (req, res) => {
  res.json(currentRefresh);
});

// Endpoint: Screener Data
app.get('/api/data', (req, res) => {
  const dataPath = path.join(__dirname, 'data', 'screener_data.json');
  if (!fs.existsSync(dataPath)) {
    return res.status(404).json({ error: 'screener_data.json not found. Run fetch script first.' });
  }
  res.sendFile(dataPath);
});

// ── Daily 9:00 AM IST Auto-Refresh Scheduler ──────────────────────────────────
function scheduleDailyRefreshIST() {
  const checkIntervalMs = 60 * 1000; // Check every minute
  let lastTriggeredDateStr = '';

  setInterval(() => {
    const now = new Date();
    // Convert current server time to IST string
    const options = { timeZone: 'Asia/Kolkata', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    const istParts = new Intl.DateTimeFormat('en-GB', options).formatToParts(now);
    const getPart = (type) => istParts.find((p) => p.type === type)?.value;
    
    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');

    const currentDateStr = `${year}-${month}-${day}`;
    // Target time: 09:00 AM IST
    if (hour === '09' && minute === '00' && lastTriggeredDateStr !== currentDateStr) {
      lastTriggeredDateStr = currentDateStr;
      console.log(`⏰ [CRON 9:00 AM IST] Triggering automatic daily stock refresh for ${currentDateStr}...`);
      startRefreshProcess('full');
    }
  }, checkIntervalMs);
}

app.listen(PORT, () => {
  console.log(`🚀 Screener server running at http://localhost:${PORT}`);
  scheduleDailyRefreshIST();
  console.log(`⏰ Scheduled automatic daily refresh at 9:00 AM IST.`);
});
