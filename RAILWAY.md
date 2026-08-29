# Railway Config & Deployment Guide
# Nifty 500 Weak Trend Screener

This app is pre-configured for seamless deployment on **Railway.app**.

## 1. Project Configuration
- **Start Command**: `npm start` (`node server.js`)
- **Port**: Automatic (`process.env.PORT`)
- **Node Engine**: `>= 18.x` (ES Modules enabled)

## 2. Deploy Steps on Railway:
1. Push your repository to **GitHub**.
2. Go to [Railway.app](https://railway.app) and click **New Project** → **Deploy from GitHub repo**.
3. Select this repository (`screener`).
4. Railway will automatically detect Node.js, run `npm install`, and start the app via `npm start`.
5. Under **Settings** → **Networking**, click **Generate Domain** (e.g. `screener-production.up.railway.app`).

## 3. Features Running on Railway:
- Real-time Screener Dashboard API (`/api/data`)
- Manual Stock Sync (`/api/refresh`)
- Automatic Daily 9:00 AM IST Data Refresh Scheduler
- Apple HIG Design System & Interactive Charts
