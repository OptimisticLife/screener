/**
 * Upstox OAuth 2.0 Authentication Script
 *
 * Usage: node scripts/auth.js
 *
 * This script:
 * 1. Spins up a local HTTP server to capture the OAuth redirect
 * 2. Opens the Upstox login page in your browser
 * 3. Captures the authorization code from the redirect
 * 4. Exchanges it for an access token
 * 5. Saves the token to data/token.json
 */

import 'dotenv/config';
import http from 'http';
import { URL } from 'url';
import axios from 'axios';
import open from 'open';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, '..', 'data', 'token.json');

const {
  UPSTOX_API_KEY: clientId,
  UPSTOX_API_SECRET: clientSecret,
  REDIRECT_URI: redirectUri = 'http://localhost:3000/callback',
} = process.env;

if (!clientId || !clientSecret) {
  console.error('\n❌  Missing credentials!');
  console.error('   Copy .env.example to .env and fill in UPSTOX_API_KEY and UPSTOX_API_SECRET\n');
  process.exit(1);
}

const PORT = new URL(redirectUri).port || 3000;

// ── Build the Upstox authorization URL ───────────────────────────────────────
const authUrl = new URL('https://api.upstox.com/v2/login/authorization/dialog');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('state', 'screener_auth');

// ── Exchange code for token ───────────────────────────────────────────────────
async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const response = await axios.post(
    'https://api.upstox.com/v2/login/authorization/token',
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } }
  );

  return response.data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\n🔐  Upstox OAuth Authentication\n');
console.log(`   Opening browser → ${authUrl.toString()}\n`);
console.log(`   Waiting for redirect on ${redirectUri} ...\n`);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname !== '/callback') {
    res.end('Not found');
    return;
  }

  const code = reqUrl.searchParams.get('code');
  const error = reqUrl.searchParams.get('error');

  if (error) {
    res.writeHead(400);
    res.end(`<h2>❌ Auth failed: ${error}</h2><p>Check your app settings and try again.</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('<h2>❌ No authorization code received</h2>');
    server.close();
    process.exit(1);
  }

  try {
    console.log('   ✅ Authorization code received. Exchanging for access token...');
    const tokenData = await exchangeCodeForToken(code);

    // Ensure data directory exists
    const dataDir = path.dirname(TOKEN_PATH);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    // Save token with metadata
    const saved = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_at: new Date(Date.now() + (tokenData.expires_in || 86400) * 1000).toISOString(),
      saved_at: new Date().toISOString(),
    };

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(saved, null, 2));

    console.log(`\n   ✅ Token saved to: data/token.json`);
    console.log(`   ⏰  Expires at: ${saved.expires_at}`);
    console.log('\n   You can now run: node scripts/fetch_data.js\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><style>
          body { font-family: sans-serif; background: #0d1117; color: #e6edf3; display:flex;
                 align-items:center; justify-content:center; height:100vh; margin:0; flex-direction:column; }
          h2 { color: #7c3aed; font-size: 2rem; }
          p { color: #8b949e; }
        </style></head>
        <body>
          <h2>✅ Authenticated!</h2>
          <p>Token saved. You can close this tab and run:<br><br>
          <code style="background:#161b22;padding:8px 16px;border-radius:6px;font-size:1.1rem;">node scripts/fetch_data.js</code></p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('\n   ❌ Token exchange failed:', err.response?.data || err.message);
    res.writeHead(500);
    res.end(`<h2>❌ Token exchange failed</h2><pre>${JSON.stringify(err.response?.data, null, 2)}</pre>`);
  }

  server.close();
});

server.listen(PORT, () => {
  open(authUrl.toString()).catch(() => {
    console.log(`   ⚠️  Could not open browser automatically.`);
    console.log(`   Please visit this URL manually:\n\n   ${authUrl}\n`);
  });
});
