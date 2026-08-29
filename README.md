# 📊 Nifty 500 Weak Trend Screener

A lightweight, zero-database stock screener that identifies **weak-trending, consolidating stocks** from the Nifty 500 universe — ideal for weekly/monthly swing trading.

Data is fetched from the **Upstox API v2**, cached to a local JSON file, and viewed in a premium dark-mode browser UI. No live/real-time data — designed for deliberate, periodic refreshes.

---

## Features

- **Weak trend scoring** — 4 configurable indicators (ADX, RSI, SMA deviation, monthly ADX)
- **All thresholds adjustable in the UI** — no code changes needed
- **Instant re-scoring** — change thresholds and scores update without re-fetching
- **Sortable, searchable table** — click any column header to sort
- **Inline stock detail expansion** — click any row for full indicator breakdown
- **CSV export** — export filtered results to spreadsheet
- **Data freshness indicator** — shows how old the cached data is
- **Resume mode** — continue an interrupted fetch without starting over

---

## Quick Start

### 1. Prerequisites

- **Node.js 18+** installed
- **Upstox developer account** — [register here](https://developer.upstox.com/)
  - Create an app and note your **API Key** and **API Secret**
  - Set the redirect URI to: `http://localhost:3000/callback`

### 2. Install dependencies

```bash
cd screener
npm install
```

### 3. Configure credentials

```bash
cp .env.example .env
# Edit .env and fill in your UPSTOX_API_KEY and UPSTOX_API_SECRET
```

### 4. Build the Nifty 500 instrument keys

This downloads the Upstox instruments master and maps Nifty 500 symbols to their API keys. **Run once**, or when the index composition changes.

```bash
npm run setup
```

### 5. Authenticate with Upstox

The Upstox token expires daily at ~3:30 AM. Run this each time you want to fetch fresh data.

```bash
npm run auth
```

Your browser will open → log in to Upstox → token is saved to `data/token.json`.

### 6. Fetch stock data

```bash
npm run fetch
```

This fetches **weekly (2yr)** and **monthly (5yr)** OHLC candles for all ~500 stocks, computes indicators, and saves to `data/screener_data.json`.

> **Duration**: ~10–15 minutes for all 500 stocks (1000 API calls with rate limit delay).

**Options:**
```bash
npm run fetch:dry     # Test with 10 stocks only
npm run fetch:resume  # Resume an interrupted fetch
```

### 7. Open the UI

Open `index.html` directly in your browser:

```bash
open index.html          # macOS
# or double-click index.html in Finder
```

> ⚠️ If your browser blocks `fetch()` for local files, serve with:
> ```bash
> npx serve .
> ```

---

## Weak Trend Indicators

| Indicator | Default Condition | What it means |
|-----------|-------------------|---------------|
| **Weekly ADX (14)** | `< 25` | Trend strength is low — market is not trending |
| **Weekly RSI (14)** | `40 – 60` | Neutral momentum — no strong bulls or bears |
| **Price vs 20W SMA** | `within ±5%` | Price is consolidating near the mean |
| **Monthly ADX (14)** | `< 25` | Confirms no strong monthly trend either |

A stock gets **1 point** for each condition met. Stocks with score ≥ 2 (configurable) are flagged as **Weak Trend** (⚑).

All thresholds are adjustable in the **Filter & Threshold Controls** panel without re-fetching data.

---

## File Structure

```
screener/
├── data/
│   ├── nifty500.json         # Nifty 500 stocks + Upstox instrument keys (generated)
│   ├── screener_data.json    # Cached indicators output (generated)
│   └── token.json            # Upstox OAuth token [git-ignored]
├── scripts/
│   ├── build_instruments.js  # One-time: map Nifty 500 symbols to instrument keys
│   ├── auth.js               # OAuth 2.0 authentication flow
│   └── fetch_data.js         # Fetch OHLC + compute indicators
├── index.html                # Main UI
├── style.css                 # Dark mode design
├── app.js                    # UI logic
├── .env.example              # Credentials template
└── package.json
```

---

## Refresh Workflow

Since data is stale by design, here's the recommended weekly workflow:

1. **Monday morning** (or after market close Friday):
   ```bash
   npm run auth      # Re-authenticate (token is fresh for the day)
   npm run fetch     # Refresh all 500 stocks (~10 min)
   ```
2. Open `index.html` to review the latest results

---

## Tips

- **Interrupted fetch?** Use `npm run fetch:resume` — it skips already-fetched stocks
- **Token expired mid-fetch?** Run `npm run auth` then `npm run fetch:resume`
- **Custom symbol not in Nifty 500?** Add it manually to `data/nifty500.json`
- **Adjust without re-fetching** — all threshold sliders in the UI instantly re-score without hitting the API

---

## Indicator Notes

- **ADX < 25** = weak/no trend (< 20 = very weak, 25–50 = moderate, > 50 = strong)
- **RSI 40–60** = neutral zone; near 30 = oversold, near 70 = overbought
- **SMA deviation** = `(Close - SMA20) / SMA20 × 100%` — measures distance from the mean
- **BB Width** = `(2 × StdDev) / SMA20 × 100%` — measures volatility; low = squeeze/consolidation
