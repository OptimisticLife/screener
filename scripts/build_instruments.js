/**
 * build_instruments.js — Setup script
 * Downloads the official, current Nifty 500 stock list directly from NSE India
 * and maps them to JSON for fetching.
 *
 * Usage: node scripts/build_instruments.js
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_PATH = path.join(DATA_DIR, 'nifty500.json');

// Official NSE Nifty 500 CSV URL
const NSE_NIFTY500_URL = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv';

async function buildNifty500List() {
  console.log('\n🔧  Building Nifty 500 stock list from official NSE source...\n');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    console.log(`   Downloading Nifty 500 list from NSE...`);
    const response = await axios.get(NSE_NIFTY500_URL, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
        'Accept': 'text/csv,text/plain',
      }
    });

    const csvText = response.data;
    const lines = csvText.split(/\r?\n/);
    const result = [];

    // Parse CSV (Header row is index 0: Company Name, Industry, Symbol, Series, ISIN Code)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV split that respects double quotes
      const parts = [];
      let inQuotes = false;
      let current = '';

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      if (parts.length >= 5) {
        const companyName = parts[0].replace(/^"|"$/g, '');
        const sector = parts[1].replace(/^"|"$/g, '');
        const symbol = parts[2];
        const isin = parts[4];

        if (symbol && isin) {
          result.push({
            symbol,
            name: companyName,
            sector: sector,
            instrument_key: `NSE_EQ|${isin}`,
            isin: isin,
          });
        }
      }
    }

    // Sort alphabetically by symbol
    result.sort((a, b) => a.symbol.localeCompare(b.symbol));

    fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));

    console.log(`   ✅ Saved ${result.length} active stocks to data/nifty500.json`);
    console.log('   Now run: npm run fetch\n');

  } catch (err) {
    console.error('   ❌ Failed to download Nifty 500 list from NSE:', err.message);
    process.exit(1);
  }
}

buildNifty500List().catch(console.error);
