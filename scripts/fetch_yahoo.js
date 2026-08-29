/**
 * fetch_yahoo.js — Data fetcher using public Yahoo Finance API & Node SDK
 * Downloads historical stock prices and stock fundamentals.
 *
 * Usage: node scripts/fetch_yahoo.js
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const NIFTY500_PATH = path.join(DATA_DIR, 'nifty500.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'screener_data.json');

const isDryRun = process.argv.includes('--dry-run');
const isResume = process.argv.includes('--resume');

const CONCURRENCY = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Technical Indicator Math ─────────────────────────────────────────────────

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

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

function bollingerWidth(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return mean > 0 ? parseFloat(((std * 2) / mean * 100).toFixed(2)) : null;
}

// ── Parse Yahoo finance chart JSON to candle arrays ──────────────────────────

function parseYahooChart(result) {
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) return [];

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const opens = quote.open;
  const highs = quote.high;
  const lows = quote.low;
  const closes = quote.close;
  const volumes = quote.volume;

  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (
      timestamps[i] == null ||
      opens[i] == null ||
      highs[i] == null ||
      lows[i] == null ||
      closes[i] == null
    ) {
      continue;
    }
    const dateStr = new Date(timestamps[i] * 1000).toISOString();
    candles.push([
      dateStr,
      parseFloat(opens[i].toFixed(2)),
      parseFloat(highs[i].toFixed(2)),
      parseFloat(lows[i].toFixed(2)),
      parseFloat(closes[i].toFixed(2)),
      volumes[i] || 0,
    ]);
  }
  return candles;
}

function parseCandleArrays(rawCandles) {
  return {
    timestamps: rawCandles.map((c) => c[0]),
    opens: rawCandles.map((c) => c[1]),
    highs: rawCandles.map((c) => c[2]),
    lows: rawCandles.map((c) => c[3]),
    closes: rawCandles.map((c) => c[4]),
    volumes: rawCandles.map((c) => c[5]),
  };
}

function computeIndicators(weeklyCandles, monthlyCandles, dailyCandles = [], fundamentals = {}) {
  const weekly = parseCandleArrays(weeklyCandles);
  const monthly = parseCandleArrays(monthlyCandles);

  const weeklyClose = weekly.closes;
  const monthlyClose = monthly.closes;

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

  const monthlySMA10 = sma(monthlyClose, 10);
  const monthlyRSI = rsi(monthlyClose, 14);
  const monthlyADXResult = adx(monthly.highs, monthly.lows, monthly.closes, 14);
  const monthlyADX = monthlyADXResult?.adx ?? null;

  // 1-month change (Month-to-Date change from the last day of the previous calendar month, matching TradingView's Chg % 1M)
  let chg1M = null;
  if (dailyCandles && dailyCandles.length > 0) {
    const latestCandle = dailyCandles[dailyCandles.length - 1];
    const latestDate = new Date(latestCandle[0]);
    const latestMonth = latestDate.getUTCMonth();
    
    // Find the last daily candle of the previous month
    let prevMonthCandle = null;
    for (let j = dailyCandles.length - 1; j >= 0; j--) {
      const cDate = new Date(dailyCandles[j][0]);
      if (cDate.getUTCMonth() !== latestMonth) {
        prevMonthCandle = dailyCandles[j];
        break;
      }
    }
    
    if (prevMonthCandle) {
      const prevClose = prevMonthCandle[4];
      if (prevClose && latestClose) {
        chg1M = parseFloat((((latestClose - prevClose) / prevClose) * 100).toFixed(2));
      }
    }
  }

  // Fallback to previous monthly candle close if daily candles is empty
  if (chg1M === null) {
    if (monthlyClose.length >= 2) {
      const prevMonthClose = monthlyClose[monthlyClose.length - 2];
      if (prevMonthClose) {
        chg1M = parseFloat((((latestClose - prevMonthClose) / prevMonthClose) * 100).toFixed(2));
      }
    }
  }

  // Downtrend scoring (same conditions as app.js and fetch_data.js)
  const conditions = {};
  conditions.diCross  = weeklyDIMinus !== null && weeklyDIPlus !== null && weeklyDIMinus > weeklyDIPlus;
  conditions.belowSMA = smaDeviation !== null && smaDeviation < 0;
  conditions.rsiWeak  = weeklyRSI !== null && weeklyRSI < 50;
  conditions.adxValid = weeklyADX !== null && weeklyADX > 20;

  const weakScore = Object.values(conditions).filter(Boolean).length;
  const isWeakTrend = weakScore === 4;

  let trendBias = 'neutral';
  if (weeklyDIPlus !== null && weeklyDIMinus !== null) {
    if (weeklyDIPlus > weeklyDIMinus + 5) trendBias = 'bullish';
    else if (weeklyDIMinus > weeklyDIPlus + 5) trendBias = 'bearish';
  }

  return {
    latestClose: fundamentals.price || latestClose,
    weeklySMA20: weeklySMA20 ? parseFloat(weeklySMA20.toFixed(2)) : null,
    monthlySMA10: monthlySMA10 ? parseFloat(monthlySMA10.toFixed(2)) : null,
    smaDeviation,
    weeklyADX,
    weeklyDIPlus,
    weeklyDIMinus,
    weeklyRSI,
    bbWidth,
    monthlyADX,
    monthlyRSI,
    latestVolume: fundamentals.dailyVolume || weekly.volumes[weekly.volumes.length - 1] || null,
    avgVolume4w: weekly.volumes.length >= 4
      ? parseFloat((weekly.volumes.slice(-4).reduce((a, b) => a + b, 0) / 4).toFixed(0))
      : null,
    weakScore,
    isWeakTrend,
    trendBias,
    conditions,
    weeklyBars: weeklyCandles.length,
    monthlyBars: monthlyCandles.length,

    // Additional metrics requested
    chg1M,
    dailyChangePercent: fundamentals.dailyChangePercent,
    relVol: fundamentals.relVol,
    marketCap: fundamentals.marketCap,
    pe: fundamentals.pe,
    eps: fundamentals.eps,
    epsGrowth: fundamentals.epsGrowth,
    divYield: fundamentals.divYield,
  };
}

// ── Progress Printer ─────────────────────────────────────────────────────────

function printProgress(current, total, symbol, status) {
  const pct = ((current / total) * 100).toFixed(1);
  const filled = Math.round((current / total) * 25);
  const bar = '█'.repeat(filled) + '░'.repeat(25 - filled);
  const isErr = status.startsWith('✗') ? 'ERR' : 'OK';
  const msg = `Progress: [${String(current).padStart(4, ' ')}/${total}] (${pct}%) | ${symbol} | ${isErr} | [${bar}] ${status}`;
  console.log(msg);
}

// ── Yahoo Finance Fetcher ───────────────────────────────────────────────────

async function fetchYahooData(symbol, interval, range) {
  const ticker = symbol.endsWith('.NS') ? symbol : `${symbol}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${range}`;

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
    },
  });

  const result = response.data?.chart?.result?.[0];
  return parseYahooChart(result);
}

async function main() {
  console.log('\n📊  Nifty 500 Screener — Yahoo Finance Fetcher with Fundamentals\n');

  if (isDryRun) console.log('   🧪  DRY RUN MODE — processing first 10 stocks only\n');
  if (isResume) console.log('   ⏩  RESUME MODE — skipping already-fetched stocks\n');

  if (!fs.existsSync(NIFTY500_PATH)) {
    console.error(`❌  ${NIFTY500_PATH} not found.`);
    console.error('   Run: npm run setup\n');
    process.exit(1);
  }

  let stocks = JSON.parse(fs.readFileSync(NIFTY500_PATH, 'utf8'));
  if (isDryRun) stocks = stocks.slice(0, 10);

  console.log(`   📋  Loaded ${stocks.length} stocks from nifty500.json`);

  let existingData = {};
  if (isResume && fs.existsSync(OUTPUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      for (const s of existing.stocks || []) {
        existingData[s.symbol] = s;
      }
      console.log(`   ⏩  Found ${Object.keys(existingData).length} existing entries to resume\n`);
    } catch (e) {}
  }

  const results = new Array(stocks.length);
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  const queue = stocks.map((stock, index) => ({ stock, index }));

  async function worker() {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) continue;
      const { stock, index } = task;

      if (isResume && existingData[stock.symbol]) {
        results[index] = existingData[stock.symbol];
        skippedCount++;
        continue;
      }

      printProgress(index + 1, stocks.length, stock.symbol, 'fetching...');

      try {
        const ticker = stock.symbol.endsWith('.NS') ? stock.symbol : `${stock.symbol}.NS`;

        // 1. Fetch weekly candles (2yr)
        const weeklyCandles = await fetchYahooData(stock.symbol, '1wk', '2y');
        await sleep(50);

        // 2. Fetch monthly candles (5yr)
        const monthlyCandles = await fetchYahooData(stock.symbol, '1mo', '5y');
        await sleep(50);

        // 2.5. Fetch daily candles (45d) for rolling 30-day change
        let dailyCandles = [];
        try {
          dailyCandles = await fetchYahooData(stock.symbol, '1d', '45d');
          await sleep(50);
        } catch (e) {}

        // 3. Fetch fundamentals using Yahoo SDK quoteSummary
        const fundamentals = {
          price: null,
          dailyChangePercent: null,
          dailyVolume: null,
          relVol: null,
          marketCap: null,
          pe: null,
          eps: null,
          epsGrowth: null,
          divYield: null
        };

        try {
          const summary = await yahooFinance.quoteSummary(ticker, {
            modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail', 'price']
          });

          const fd = summary.financialData || {};
          const dks = summary.defaultKeyStatistics || {};
          const sd = summary.summaryDetail || {};
          const pr = summary.price || {};

          fundamentals.price = pr.regularMarketPrice || null;
          fundamentals.dailyChangePercent = pr.regularMarketChangePercent !== undefined ? parseFloat((pr.regularMarketChangePercent * 100).toFixed(2)) : null;
          fundamentals.dailyVolume = pr.regularMarketVolume || sd.regularMarketVolume || null;

          const avgVol3M = sd.averageDailyVolume3Month || pr.averageDailyVolume3Month || null;
          if (fundamentals.dailyVolume && avgVol3M) {
            fundamentals.relVol = parseFloat((fundamentals.dailyVolume / avgVol3M).toFixed(2));
          }

          fundamentals.marketCap = pr.marketCap || sd.marketCap || null;
          fundamentals.pe = dks.trailingPE || sd.trailingPE || null;
          fundamentals.eps = dks.trailingEps || null;
          fundamentals.epsGrowth = fd.earningsGrowth !== undefined ? parseFloat((fd.earningsGrowth * 100).toFixed(2)) : null;
          fundamentals.divYield = sd.dividendYield !== undefined ? parseFloat((sd.dividendYield * 100).toFixed(2)) : null;
        } catch (e) {
          // Keep defaults
        }

        // 4. Fetch latest news articles for the stock from Yahoo Finance
        let news = [];
        try {
          const searchRes = await yahooFinance.search(stock.name || stock.symbol, { newsCount: 3 });
          if (searchRes && searchRes.news) {
            news = searchRes.news.slice(0, 3).map((item) => ({
              title: item.title,
              publisher: item.publisher,
              link: item.link,
              providerPublishTime: item.providerPublishTime,
            }));
          }
        } catch (e) {}

        if (weeklyCandles.length === 0 && monthlyCandles.length === 0) {
          results[index] = { ...stock, error: 'no_data', indicators: null };
          errorCount++;
          printProgress(index + 1, stocks.length, stock.symbol, '✗ no data');
          continue;
        }

        const indicators = computeIndicators(weeklyCandles, monthlyCandles, dailyCandles, fundamentals);

        results[index] = {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector || 'Others',
          instrument_key: stock.instrument_key,
          isin: stock.isin || '',
          indicators,
          weeklyCandles,
          monthlyCandles,
          dailyCandles,
          news,
        };

        successCount++;
        printProgress(index + 1, stocks.length, stock.symbol, `✓ MktCap=${(indicators.marketCap ? (indicators.marketCap / 1e7).toFixed(0) + ' Cr' : '—')}`);

      } catch (err) {
        const msg = err.response?.status === 429 ? 'rate limited' : err.message;
        if (err.response?.status === 429) {
          queue.unshift(task); // retry
          await sleep(5000);
          continue;
        }
        results[index] = { ...stock, error: msg, indicators: null };
        errorCount++;
        printProgress(index + 1, stocks.length, stock.symbol, `✗ ${msg}`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log('\n\n   Saving output...');
  saveOutput(results, successCount, errorCount, stocks.length, skippedCount);
}

function saveOutput(results, successCount, errorCount, total, skippedCount = 0) {
  const output = {
    fetchedAt: new Date().toISOString(),
    totalStocks: total,
    successCount,
    errorCount,
    skippedCount,
    stocks: results.filter(Boolean),
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  const downCount = results.filter((s) => s && s.indicators?.isWeakTrend).length;

  console.log(`\n   ✅  Done! Processed ${results.length} stocks`);
  console.log(`   📈  Success: ${successCount}  |  ❌ Errors: ${errorCount}  |  ⏩ Skipped: ${skippedCount}`);
  console.log(`   🎯  Confirmed downtrend stocks found: ${downCount}`);
  console.log(`\n   Output saved to: data/screener_data.json`);
}

main().catch((err) => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
