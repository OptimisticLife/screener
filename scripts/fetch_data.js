/**
 * fetch_data.js — Main data fetcher and indicator calculator
 *
 * Usage:
 *   node scripts/fetch_data.js            # Full fetch for all Nifty 500 stocks
 *   node scripts/fetch_data.js --dry-run  # Test with first 10 stocks only
 *   node scripts/fetch_data.js --resume   # Skip stocks already in output file
 *
 * Fetches weekly (2yr) and monthly (5yr) OHLC candles from Upstox,
 * computes ADX(14), RSI(14), SMA(20w), SMA(10m), and weak-trend scoring.
 * Saves results to data/screener_data.json.
 */

import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'token.json');
const NIFTY500_PATH = path.join(DATA_DIR, 'nifty500.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'screener_data.json');

const isDryRun = process.argv.includes('--dry-run');
const isResume = process.argv.includes('--resume');

// ── Configurable weak-trend thresholds (these are exposed in the UI too) ─────
const DEFAULTS = {
  weeklyAdxThreshold: 25,       // ADX below this = weak trend (weekly)
  monthlyAdxThreshold: 25,      // ADX below this = weak trend (monthly)
  rsiMin: 40,                   // RSI above this = not oversold (weekly)
  rsiMax: 60,                   // RSI below this = not overbought (weekly)
  smaDeviationPct: 5,           // Price within ±5% of 20w SMA = consolidating
  weakScoreThreshold: 2,        // Stocks with score >= this are "weak trend"
};

// ── HTTP delay to respect rate limits ─────────────────────────────────────────
const DELAY_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Load and validate token ───────────────────────────────────────────────────
function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('\n❌  No token found. Run: node scripts/auth.js\n');
    process.exit(1);
  }
  const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const expiresAt = new Date(tokenData.expires_at);

  if (expiresAt < new Date()) {
    console.error(`\n❌  Token expired at ${expiresAt.toLocaleString()}`);
    console.error('   Run: node scripts/auth.js\n');
    process.exit(1);
  }

  console.log(`   ✅ Token valid until: ${expiresAt.toLocaleString()}`);
  return tokenData.access_token;
}

// ── Upstox historical candles API ─────────────────────────────────────────────
async function fetchCandles(instrumentKey, interval, fromDate, toDate, token) {
  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`;
  const response = await axios.get(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    timeout: 15000,
  });

  // Each candle: [timestamp, open, high, low, close, volume, oi]
  return response.data?.data?.candles || [];
}

// ── Indicator calculations ─────────────────────────────────────────────────────

/** Simple Moving Average */
function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** RSI (14-period) */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const recent = changes.slice(-period);
  const gains = recent.map((c) => (c > 0 ? c : 0));
  const losses = recent.map((c) => (c < 0 ? -c : 0));
  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/** ADX (14-period) — requires high, low, close arrays */
function adx(highs, lows, closes, period = 14) {
  const minLen = period * 2 + 1;
  if (highs.length < minLen) return null;

  const trueRange = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < highs.length; i++) {
    const highDiff = highs[i] - highs[i - 1];
    const lowDiff = lows[i - 1] - lows[i];
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRange.push(tr);
    plusDM.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    minusDM.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
  }

  // Wilder's smoothing
  function wilderSmooth(arr, n) {
    let sum = arr.slice(0, n).reduce((a, b) => a + b, 0);
    const result = [sum];
    for (let i = n; i < arr.length; i++) {
      sum = sum - sum / n + arr[i];
      result.push(sum);
    }
    return result;
  }

  const smoothTR = wilderSmooth(trueRange, period);
  const smoothPlusDM = wilderSmooth(plusDM, period);
  const smoothMinusDM = wilderSmooth(minusDM, period);

  const diPlus = smoothPlusDM.map((v, i) => (smoothTR[i] === 0 ? 0 : (v / smoothTR[i]) * 100));
  const diMinus = smoothMinusDM.map((v, i) => (smoothTR[i] === 0 ? 0 : (v / smoothTR[i]) * 100));

  const dx = diPlus.map((p, i) => {
    const sum = p + diMinus[i];
    return sum === 0 ? 0 : (Math.abs(p - diMinus[i]) / sum) * 100;
  });

  // ADX = Wilder smooth of DX
  const smoothDX = wilderSmooth(dx, period);
  const lastADX = smoothDX[smoothDX.length - 1];
  const lastDIPlus = diPlus[diPlus.length - 1];
  const lastDIMinus = diMinus[diMinus.length - 1];

  return {
    adx: parseFloat(lastADX.toFixed(2)),
    diPlus: parseFloat(lastDIPlus.toFixed(2)),
    diMinus: parseFloat(lastDIMinus.toFixed(2)),
  };
}

/** Bollinger Band width (normalized) */
function bollingerWidth(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return mean > 0 ? parseFloat(((std * 2) / mean * 100).toFixed(2)) : null;
}

// ── Parse candle arrays ───────────────────────────────────────────────────────
function parseCandles(rawCandles) {
  // Upstox returns newest first — reverse to get chronological
  const sorted = [...rawCandles].reverse();
  return {
    timestamps: sorted.map((c) => c[0]),
    opens: sorted.map((c) => c[1]),
    highs: sorted.map((c) => c[2]),
    lows: sorted.map((c) => c[3]),
    closes: sorted.map((c) => c[4]),
    volumes: sorted.map((c) => c[5]),
  };
}

// ── Compute all indicators for one stock ─────────────────────────────────────
function computeIndicators(weeklyCandles, monthlyCandles, thresholds = DEFAULTS) {
  const weekly = parseCandles(weeklyCandles);
  const monthly = parseCandles(monthlyCandles);

  const weeklyClose = weekly.closes;
  const monthlyClose = monthly.closes;

  // Weekly indicators
  const weeklyRSI = rsi(weeklyClose, 14);
  const weeklyADXResult = adx(weekly.highs, weekly.lows, weekly.closes, 14);
  const weeklyADX = weeklyADXResult?.adx ?? null;
  const weeklyDIPlus = weeklyADXResult?.diPlus ?? null;
  const weeklyDIMinus = weeklyADXResult?.diMinus ?? null;
  const weeklySMA20 = sma(weeklyClose, 20);
  const latestClose = weeklyClose[weeklyClose.length - 1] || null;
  const smaDeviation = weeklySMA20 && latestClose
    ? parseFloat((((latestClose - weeklySMA20) / weeklySMA20) * 100).toFixed(2))
    : null;
  const bbWidth = bollingerWidth(weeklyClose, 20);

  // Monthly indicators
  const monthlyADXResult = adx(monthly.highs, monthly.lows, monthly.closes, 14);
  const monthlyADX = monthlyADXResult?.adx ?? null;
  const monthlySMA10 = sma(monthlyClose, 10);
  const monthlyRSI = rsi(monthlyClose, 14);

  // ── Downtrend scoring (solid backend conditions) ──────────────────────────
  // All 4 must be true for a confirmed downtrend.
  const conditions = {};

  // 1. Bearish DI crossover — selling pressure dominant
  conditions.diCross  = weeklyDIMinus !== null && weeklyDIPlus !== null && weeklyDIMinus > weeklyDIPlus;

  // 2. Price trading below 20W SMA — below the mean
  conditions.belowSMA = smaDeviation !== null && smaDeviation < 0;

  // 3. Weekly RSI below 50 — momentum is bearish
  conditions.rsiWeak  = weeklyRSI !== null && weeklyRSI < 50;

  // 4. Weekly ADX > 20 — the trend has actual strength (not sideways)
  conditions.adxValid = weeklyADX !== null && weeklyADX > 20;

  const weakScore   = Object.values(conditions).filter(Boolean).length;
  const isWeakTrend = weakScore === 4;  // all 4 = confirmed downtrend

  // Trend direction (based on DI crossover)
  let trendBias = 'neutral';
  if (weeklyDIPlus !== null && weeklyDIMinus !== null) {
    if (weeklyDIPlus > weeklyDIMinus + 5) trendBias = 'bullish';
    else if (weeklyDIMinus > weeklyDIPlus + 5) trendBias = 'bearish';
  }

  return {
    // Price
    latestClose,
    weeklySMA20: weeklySMA20 ? parseFloat(weeklySMA20.toFixed(2)) : null,
    monthlySMA10: monthlySMA10 ? parseFloat(monthlySMA10.toFixed(2)) : null,
    smaDeviation,

    // Weekly
    weeklyADX,
    weeklyDIPlus,
    weeklyDIMinus,
    weeklyRSI,
    bbWidth,

    // Monthly
    monthlyADX,
    monthlyRSI,

    // Volume (latest week avg vs 4w avg)
    latestVolume: weekly.volumes[weekly.volumes.length - 1] || null,
    avgVolume4w: weekly.volumes.length >= 4
      ? parseFloat((weekly.volumes.slice(-4).reduce((a, b) => a + b, 0) / 4).toFixed(0))
      : null,

    // Weak trend
    weakScore,
    isWeakTrend,
    trendBias,
    conditions,

    // Data quality
    weeklyBars: weeklyCandles.length,
    monthlyBars: monthlyCandles.length,
  };
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function printProgress(current, total, symbol, status) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  const msg = `   [${bar}] ${pct}% (${current}/${total}) ${symbol} ${status}`;
  process.stdout.write('\r' + msg.padEnd(120));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📊  Nifty 500 Weak Trend Screener — Data Fetcher\n');

  if (isDryRun) console.log('   🧪  DRY RUN MODE — processing first 10 stocks only\n');
  if (isResume) console.log('   ⏩  RESUME MODE — skipping already-fetched stocks\n');

  // Load token
  const token = loadToken();
  console.log('');

  // Load stock list
  if (!fs.existsSync(NIFTY500_PATH)) {
    console.error(`❌  ${NIFTY500_PATH} not found.`);
    console.error('   Run: node scripts/build_instruments.js\n');
    process.exit(1);
  }

  let stocks = JSON.parse(fs.readFileSync(NIFTY500_PATH, 'utf8'));
  if (isDryRun) stocks = stocks.slice(0, 10);

  console.log(`   📋  Loaded ${stocks.length} stocks\n`);

  // Load existing output for resume mode
  let existingData = {};
  if (isResume && fs.existsSync(OUTPUT_PATH)) {
    const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
    for (const s of existing.stocks || []) {
      existingData[s.symbol] = s;
    }
    console.log(`   ⏩  Found ${Object.keys(existingData).length} existing entries\n`);
  }

  // Date ranges
  const today = new Date();
  const toDate = today.toISOString().split('T')[0];
  const from2yr = new Date(today);
  from2yr.setFullYear(from2yr.getFullYear() - 2);
  const fromWeekly = from2yr.toISOString().split('T')[0];

  const from5yr = new Date(today);
  from5yr.setFullYear(from5yr.getFullYear() - 5);
  const fromMonthly = from5yr.toISOString().split('T')[0];

  // Fetch and process concurrently
  const concurrency = 5;
  const results = new Array(stocks.length);
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  console.log(`   ⏱️   Fetching data with concurrency of ${concurrency}...\n`);

  const queue = stocks.map((stock, index) => ({ stock, index }));

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) continue;
      const { stock, index } = task;

      // Resume: skip if already have data
      if (isResume && existingData[stock.symbol]) {
        results[index] = existingData[stock.symbol];
        skippedCount++;
        continue;
      }

      printProgress(index + 1, stocks.length, stock.symbol, 'fetching...');

      try {
        // Fetch weekly candles
        const weeklyCandles = await fetchCandles(stock.instrument_key, 'week', fromWeekly, toDate, token);
        await sleep(100);

        // Fetch monthly candles
        const monthlyCandles = await fetchCandles(stock.instrument_key, 'month', fromMonthly, toDate, token);
        await sleep(100);

        if (weeklyCandles.length === 0 && monthlyCandles.length === 0) {
          printProgress(index + 1, stocks.length, stock.symbol, '⚠ no data');
          results[index] = { ...stock, error: 'no_data', indicators: null };
          errorCount++;
          continue;
        }

        const indicators = computeIndicators(weeklyCandles, monthlyCandles);

        results[index] = {
          symbol: stock.symbol,
          name: stock.name,
          instrument_key: stock.instrument_key,
          isin: stock.isin || '',
          indicators,
          weeklyCandles,   // Store original raw weekly candles
          monthlyCandles,  // Store original raw monthly candles
        };

        successCount++;
        printProgress(index + 1, stocks.length, stock.symbol, `✓ ADX=${indicators.weeklyADX} RSI=${indicators.weeklyRSI}`);

      } catch (err) {
        const status = err.response?.status;
        const msg = status === 401 ? 'token expired' : status === 429 ? 'rate limited' : err.message;

        if (status === 401) {
          process.stdout.write('\n');
          console.error('\n❌  Token expired mid-run. Saving progress...');
          const currentResults = results.filter((r) => r !== undefined);
          saveOutput(currentResults, successCount, errorCount, stocks.length, skippedCount);
          process.exit(1);
        }

        if (status === 429) {
          queue.unshift(task); // Re-queue task to retry
          process.stdout.write('\n');
          console.warn(`   ⚠️  Rate limited — waiting 3 seconds before retry...`);
          await sleep(3000);
          continue;
        }

        printProgress(index + 1, stocks.length, stock.symbol, `✗ ${msg}`);
        results[index] = { ...stock, error: msg, indicators: null };
        errorCount++;
      }
    }
  }

  // Start workers
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  process.stdout.write('\n\n');
  saveOutput(results, successCount, errorCount, stocks.length, skippedCount);
}

function saveOutput(results, successCount, errorCount, total, skippedCount = 0) {
  const output = {
    fetchedAt: new Date().toISOString(),
    totalStocks: total,
    successCount,
    errorCount,
    skippedCount,
    thresholds: DEFAULTS,
    stocks: results,
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  const weakCount = results.filter((s) => s.indicators?.isWeakTrend).length;

  console.log(`   ✅  Done! Processed ${results.length} stocks`);
  console.log(`   📈  Success: ${successCount}  |  ❌ Errors: ${errorCount}  |  ⏩ Skipped: ${skippedCount}`);
  console.log(`   🎯  Weak trend stocks found: ${weakCount}`);
  console.log(`\n   Output saved to: data/screener_data.json`);
  console.log('   Open index.html in your browser to view results\n');
}

main().catch((err) => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
