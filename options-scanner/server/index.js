import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { RandomForestRegression } from 'ml-random-forest';
import dotenv from 'dotenv';
import { getProviderByName, getProviderFromRequest, getProviderNames } from './providers/index.js';

import { normalizeToDateStr, toEpochMs, computeScore, estimateDelta, estimateIV } from './providers/yahoo.js';
import { SCREENER_PRESETS, finvizUrl, runScreener, analyzeStock } from './stocker.js';
import { scrapeFinvizScreener } from './finviz-screener.js';
import { trainModel, predictNextDay, forecast, getModelInfo, listModels, PREDICT_CONFIG } from './predict.js';
import { ALGORITHM_CONFIGS, trainAlgorithm, predictAlgorithm, predictEnsemble, getAlgorithmModelInfo, listAllModels } from './algorithms.js';
import { fullAnalysis } from './full-analysis.js';
import { generatePriceChartSVG } from './chart-svg.js';
import { SP500_UNIQUE, SCANNER_WATCHLIST, SP500_SECTORS, TOP_10_ETFS } from './sp500.js';
import * as Cache from './cache.js';


dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Provider Factory ──────────────────────────────────────
// Resolves provider from request: ?provider=public|finnhub|yahoo
// Falls back gracefully: if primary fails, tries next in chain.
// Usage: const provider = getProviderFromRequest(req);
//        const data = await provider.quote('SPY');

function getProvider(req) {
  return getProviderFromRequest(req);
}

// Direct access to Yahoo provider for endpoints that need raw yf access (scanner, prob15m, etc.)
// These endpoints will be migrated to provider factory in a follow-up.
// For now, yf is imported from the yahoo provider module.

// ─── Database Setup ────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'scanner.db'));

// Initialize cache tables (creates them if not exist)
Cache.getDb();

// Seed S&P 500 tickers on startup (including top 10 ETFs)
const existingCount = Cache.getSP500Count();
if (existingCount < 100) {
  console.log(`[DB] Seeding S&P 500 tickers (${SP500_UNIQUE.length} stocks + ${TOP_10_ETFS.length} ETFs)...`);
  const sectorMap = {};
  for (const [sector, tickers] of Object.entries(SP500_SECTORS)) {
    for (const t of tickers) sectorMap[t] = sector;
  }
  Cache.upsertSP500(SP500_UNIQUE, sectorMap);
  console.log(`[DB] Seeded ${Cache.getSP500Count()} S&P 500 tickers`);
} else {
  console.log(`[DB] S&P 500 tickers already loaded (${existingCount})`);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS watchlist (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL,
    direction TEXT,
    strategy TEXT,
    strike REAL,
    type TEXT,
    premium REAL,
    delta REAL,
    gamma REAL,
    theta REAL,
    iv REAL,
    volume INTEGER,
    openInterest INTEGER,
    dte INTEGER,
    score INTEGER,
    underlyingPrice REAL,
    addedPrice REAL,
    notes TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scanDate TEXT DEFAULT (datetime('now')),
    symbol TEXT NOT NULL,
    direction TEXT,
    trend TEXT,
    setup TEXT,
    contract TEXT,
    type TEXT,
    strike REAL,
    dte INTEGER,
    mid REAL,
    delta REAL,
    iv REAL,
    openInterest INTEGER,
    spreadPct REAL,
    spreadLabel TEXT,
    stopPrice REAL,
    optionStop REAL,
    riskPerContract REAL,
    rr REAL,
    oiIvEdge INTEGER,
    scores_trend INTEGER,
    scores_liquidity INTEGER,
    scores_riskReward INTEGER,
    scores_overall REAL,
    underlyingPrice REAL,
    sma20 REAL,
    sma50 REAL,
    sma200 REAL,
    rsi REAL,
    macdCrossover TEXT,
    adx REAL,
    stochasticK REAL,
    strategyLabel TEXT,
    timeframe TEXT,
    targetPrice REAL,
    targetOption REAL,
    technicalReason TEXT,
    stopLevel TEXT,
    atm TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlistId TEXT,
    ticker TEXT NOT NULL,
    direction TEXT,
    type TEXT,
    strike REAL,
    expiry TEXT,
    dte INTEGER,
    entryPrice REAL,
    currentPrice REAL,
    stopPrice REAL,
    optionStop REAL,
    targetPrice REAL,
    targetOption REAL,
    riskPerContract REAL,
    rr REAL,
    pnl REAL,
    status TEXT DEFAULT 'open',
    notes TEXT,
    openedAt TEXT DEFAULT (datetime('now')),
    closedAt TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_watchlist_ticker ON watchlist(ticker);
  CREATE INDEX IF NOT EXISTS idx_scan_history_date ON scan_history(scanDate);
 CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
`);

// Migrate: add addedPrice column if it doesn't exist
try {
  const cols = db.prepare("PRAGMA table_info(watchlist)").all().map(c => c.name);
  if (!cols.includes('addedPrice')) {
    db.exec('ALTER TABLE watchlist ADD COLUMN addedPrice REAL');
    console.log('[DB] Added addedPrice column to watchlist');
  }
} catch (e) { console.error('[DB] Migration:', e.message); }

const app = express();
app.use(cors());
app.use(express.json());

// ─── Algorithm Config Persistence ──────────────────────────────────
db.exec(`CREATE TABLE IF NOT EXISTS algo_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  symbol TEXT DEFAULT NULL,
  isDefault INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
)`);

// ─── Market Snapshot ────────────────────────────────────────────
app.get('/api/market-snapshot', async (req, res) => {
  const provider = getProvider(req);
  try {
    const data = await provider.marketSnapshot();
    // Enrich with Yahoo if primary provider returns null change data
    const yahooProvider = getProviderByName('yahoo');
    if (provider !== yahooProvider) {
      const nullChangeSymbols = Object.keys(data).filter(k => data[k]?.change == null || data[k]?.changePercent == null);
      if (nullChangeSymbols.length > 0 && nullChangeSymbols.length <= 15) {
        try {
          const yahooSnapshot = await yahooProvider.marketSnapshot();
          for (const sym of nullChangeSymbols) {
            if (yahooSnapshot[sym] && yahooSnapshot[sym].change != null) {
              data[sym].change = yahooSnapshot[sym].change;
              data[sym].changePercent = yahooSnapshot[sym].changePercent ?? data[sym].changePercent;
            }
          }
        } catch (e) { console.warn('[SNAPSHOT] Yahoo enrichment failed:', e.message); }
      }
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Quote ──────────────────────────────────────────────────────
app.get('/api/quote/:symbol', async (req, res) => {
  const provider = getProvider(req);
  try {
    const q = await provider.quote(req.params.symbol);
    // Enrich with Yahoo if primary provider returns null change data
    if (q.change == null || q.changePercent == null) {
      const yahooProvider = getProviderByName('yahoo');
      if (provider !== yahooProvider) {
        try {
          const yq = await yahooProvider.quote(req.params.symbol);
          if (yq.change != null) q.change = yq.change;
          if (yq.changePercent != null) q.changePercent = yq.changePercent;
          if (yq.dayHigh != null && q.dayHigh == null) q.dayHigh = yq.dayHigh;
          if (yq.dayLow != null && q.dayLow == null) q.dayLow = yq.dayLow;
          if (yq.fiftyDayAvg != null && q.fiftyDayAvg == null) q.fiftyDayAvg = yq.fiftyDayAvg;
          if (yq.twoHundredDayAvg != null && q.twoHundredDayAvg == null) q.twoHundredDayAvg = yq.twoHundredDayAvg;
          if (yq.volume != null && (q.volume == null || q.volume === 0)) q.volume = yq.volume;
        } catch (e) { console.warn(`[QUOTE] Yahoo enrichment failed for ${req.params.symbol}:`, e.message); }
      }
    }
    res.json(q);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Alpha Vantage Specific Endpoints ─────────────────────────────
app.get('/api/av/overview/:symbol', async (req, res) => {
  const provider = getProvider(req);
  if (provider.name !== 'alphavantage') {
    return res.status(400).json({ error: 'Alpha Vantage provider required. Use ?provider=alphavantage' });
  }
  try {
    const overview = await provider.companyOverview(req.params.symbol);
    res.json(overview);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/av/technicals/:symbol/:indicator', async (req, res) => {
  const provider = getProvider(req);
  if (provider.name !== 'alphavantage') {
    return res.status(400).json({ error: 'Alpha Vantage provider required. Use ?provider=alphavantage' });
  }
  try {
    const { indicator } = req.params;
    const { interval, time_period, series_type, ...rest } = req.query;
    const data = await provider.technicalIndicator(req.params.symbol, indicator, {
      interval: interval || 'daily',
      time_period: time_period || '14',
      series_type: series_type || 'close',
      ...rest,
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/av/gainers-losers', async (req, res) => {
  const provider = getProvider(req);
  if (provider.name !== 'alphavantage') {
    return res.status(400).json({ error: 'Alpha Vantage provider required. Use ?provider=alphavantage' });
  }
  try {
    const data = await provider.topGainersLosers();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Options Chain ─────────────────────────────────────────────
app.get('/api/options/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiry } = req.query;
    const provider = getProvider(req);

    // Try cache first (5 min TTL)
    const cachedChain = Cache.getCachedOptionChain(symbol, expiry);
    if (cachedChain) return res.json(cachedChain);

    // Clean expiry date from query param
    let cleanedDate = null;
    if (expiry) {
      let dateStr = expiry;
      if (!isNaN(expiry)) {
        const ms = Number(expiry) > 1e12 ? Number(expiry) : Number(expiry) * 1000;
        dateStr = new Date(ms).toISOString().split('T')[0];
      } else if (expiry.includes('T')) {
        dateStr = expiry.split('T')[0];
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        cleanedDate = dateStr;
      }
    }

    let data;
    try {
      data = await provider.optionsChain(symbol, cleanedDate);
    } catch (providerErr) {
      // Bidirectional fallback: Yahoo ↔ Public.com
      const isYahoo = provider === getProviderByName('yahoo');
      const isPublic = provider === getProviderByName('public');
      if (isYahoo) {
        try {
          console.warn(`[OPTIONS] Yahoo failed for ${symbol}, trying Public.com: ${providerErr.message}`);
          data = await getProviderByName('public').optionsChain(symbol, cleanedDate);
        } catch (e2) { throw providerErr; }
      } else if (isPublic) {
        try {
          console.warn(`[OPTIONS] Public.com failed for ${symbol}, trying Yahoo: ${providerErr.message}`);
          data = await getProviderByName('yahoo').optionsChain(symbol, cleanedDate);
        } catch (e2) { throw providerErr; }
      } else {
        try {
          console.warn(`[OPTIONS] Provider failed for ${symbol}, trying Yahoo: ${providerErr.message}`);
          data = await getProviderByName('yahoo').optionsChain(symbol, cleanedDate);
        } catch (e2) { throw providerErr; }
      }
    }

    // Cache the result
    Cache.cacheOptionChain(symbol, cleanedDate || data.selectedExpiry, data);

    // Apply scoring to all contracts (post-processing)
    const chain = data.chain.map(c => {
      const isCall = c.type === 'call';
      const iv = (c.iv && c.iv > 0.001) ? c.iv : (c.mid && c.mid > 0 ? estimateIV(c.mid, c.strike, data.underlyingPrice || c.strike, data.dte || 30, isCall) : null);
      const delta = c.delta ?? estimateDelta(c.strike, data.underlyingPrice || c.strike, isCall, data.dte || 30);
      return {
        ...c,
        iv,
        delta,
        gamma: c.gamma ?? (c.delta == null ? 0.01 : null),
        score: computeScore(null, c.iv, c.volume, c.openInterest, null, null),
      };
    });
    res.json({ ...data, chain });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Setups ────────────────────────────────────────────────────
app.get('/api/setups', async (req, res) => {
  try {
    const provider = getProvider(req);
    // Use S&P 500 scanner watchlist as default (includes most liquid names + indices)
    const defaultTickers = SCANNER_WATCHLIST;
    const tickers = req.query.tickers ? req.query.tickers.split(',') : defaultTickers;

    const fetchOne = async (sym) => {
      try {
        const [q, data] = await Promise.all([provider.quote(sym), provider.optionsChain(sym)]);
        const underlyingPrice = q.price;
        const dte = data.dte;

        const calls = data.chain.filter(c => c.type === 'call');
        const puts = data.chain.filter(c => c.type === 'put');

        const scoredCalls = calls
          .filter(c => c.volume > 10 && c.bid && c.ask && (c.iv == null || c.iv > 0.001))
          .map(c => ({ ticker: sym, direction: 'bullish', strategy: c.inTheMoney ? 'Long Call (ITM)' : 'Long Call (OTM)', strike: c.strike, type: 'call', premium: c.mid || +((c.bid + c.ask) / 2).toFixed(2), delta: c.delta, gamma: c.gamma, theta: c.theta, iv: c.iv, volume: c.volume, openInterest: c.openInterest, dte, score: c.score || computeScore(null, c.iv, c.volume, c.openInterest, null, null), underlyingPrice }))
          .sort((a, b) => b.score - a.score);

        const scoredPuts = puts
          .filter(p => p.volume > 10 && p.bid && p.ask && (p.iv == null || p.iv > 0.001))
          .map(p => ({ ticker: sym, direction: 'bearish', strategy: p.inTheMoney ? 'Long Put (ITM)' : 'Long Put (OTM)', strike: p.strike, type: 'put', premium: p.mid || +((p.bid + p.ask) / 2).toFixed(2), delta: p.delta, gamma: p.gamma, theta: p.theta, iv: p.iv, volume: p.volume, openInterest: p.openInterest, dte, score: p.score || computeScore(null, p.iv, p.volume, p.openInterest, null, null), underlyingPrice }))
          .sort((a, b) => b.score - a.score);

        const results = [];
        if (scoredCalls[0]) results.push(scoredCalls[0]);
        if (scoredPuts[0]) results.push(scoredPuts[0]);
        return results;
      } catch { return []; }
    };

    const allResults = await Promise.all(tickers.map(sym => Promise.race([fetchOne(sym), new Promise(r => setTimeout(() => r([]), 15000))])));
    const setups = allResults.flat().sort((a, b) => b.score - a.score);
    res.json(setups.slice(0, 20));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Watchlist (SQLite) ────────────────────────────────────────
app.get('/api/watchlist', async (req, res) => {
  try {
    // Auto-remove expired options (DTE ≤ 0 or createdAt date + dte days is in the past)
    const now = Date.now();
    const expired = db.prepare('SELECT id, dte, createdAt FROM watchlist').all();
    for (const row of expired) {
      if (row.dte != null && row.dte <= 0) {
        db.prepare('DELETE FROM watchlist WHERE id = ?').run(row.id);
        console.log(`[WATCHLIST] Removed expired: ${row.id} (dte=${row.dte})`);
      } else if (row.createdAt && row.dte != null) {
        const createdMs = new Date(row.createdAt + 'Z').getTime(); // Add Z for UTC
        const expiryMs = createdMs + row.dte * 86400000;
        if (expiryMs < now) {
          db.prepare('DELETE FROM watchlist WHERE id = ?').run(row.id);
          console.log(`[WATCHLIST] Removed expired: ${row.id} (expiry passed)`);
        }
      }
    }

    const rows = db.prepare('SELECT * FROM watchlist ORDER BY createdAt DESC').all();

    // Enrich with current prices via provider factory
    const tickers = [...new Set(rows.map(r => r.ticker))];
    const priceMap = {};
    const defaultProvider = getProviderByName('yahoo');
    for (const t of tickers) {
      try {
        const q = await defaultProvider.quote(t);
        priceMap[t] = q.price;
      } catch { priceMap[t] = null; }
    }

    const enriched = rows.map(r => ({
      ...r,
      currentPrice: priceMap[r.ticker] ?? null,
      pnl: (priceMap[r.ticker] != null && r.addedPrice != null)
        ? +((priceMap[r.ticker] - r.addedPrice) / r.addedPrice * 100).toFixed(2)
        : null,
    }));
    res.json(enriched);
  } catch (e) {
    console.error('[WATCHLIST] Error:', e);
    // Fallback: return raw data without enrichment
    const rows = db.prepare('SELECT * FROM watchlist ORDER BY createdAt DESC').all();
    res.json(rows);
  }
});

app.post('/api/watchlist', async (req, res) => {
  try {
    const { id, ticker: tickerField, symbol, direction, strategy, strike, type, premium, delta, gamma, theta, iv, volume, openInterest, dte, score, underlyingPrice, addedPrice, notes } = req.body;
    const ticker = tickerField || symbol;
    if (!ticker) return res.status(400).json({ error: 'ticker or symbol is required' });
    
    // Resolve addedPrice: use provided value, then underlyingPrice, then fetch live price
    let resolvedAddedPrice = addedPrice || underlyingPrice || null;
    if (resolvedAddedPrice == null) {
      try {
        const provider = getProvider(req);
        const quote = await provider.quote(ticker);
        if (quote?.price) resolvedAddedPrice = quote.price;
      } catch (e) {
        console.warn(`[WATCHLIST] Could not fetch price for ${ticker}: ${e.message}`);
      }
    }
    
    const stmt = db.prepare(`INSERT OR REPLACE INTO watchlist (id, ticker, direction, strategy, strike, type, premium, delta, gamma, theta, iv, volume, openInterest, dte, score, underlyingPrice, addedPrice, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(id || `${ticker}-${type}-${strike}-${Date.now()}`, ticker, direction, strategy, strike, type, premium, delta, gamma, theta, iv, volume, openInterest, dte, score, resolvedAddedPrice || underlyingPrice, resolvedAddedPrice, notes || null);
    const rows = db.prepare('SELECT * FROM watchlist ORDER BY createdAt DESC').all();
    // Enrich with current prices
    const priceMap = {};
    await Promise.all(rows.map(async (r) => {
      if (!priceMap[r.ticker]) {
        try { const q = await getProvider(req).quote(r.ticker); priceMap[r.ticker] = q?.price; } catch {}
      }
    }));
    const enriched = rows.map(r => ({
      ...r,
      currentPrice: priceMap[r.ticker] ?? null,
      pnl: (priceMap[r.ticker] != null && r.addedPrice != null) ? +((priceMap[r.ticker] - r.addedPrice) / r.addedPrice * 100).toFixed(2) : null,
    }));
    res.json(enriched);
  } catch (e) {
    console.error('[WATCHLIST] Add error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/watchlist/:id', (req, res) => {
  db.prepare('DELETE FROM watchlist WHERE id = ?').run(req.params.id);
  const rows = db.prepare('SELECT * FROM watchlist ORDER BY createdAt DESC').all();
  res.json(rows);
});

// Refresh watchlist item with live option data
app.put('/api/watchlist/:id/refresh', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM watchlist WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Watchlist item not found' });
    
    const provider = getProvider(req);
    
    // Fetch fresh quote for underlying price
    let currentPrice = row.underlyingPrice;
    try {
      const quote = await provider.quote(row.ticker);
      if (quote?.price) currentPrice = quote.price;
    } catch (e) { console.error(`[WATCHLIST] Quote refresh failed for ${row.ticker}:`, e.message); }
    
    // Fetch fresh option chain to update greeks
    let updatedFields = {};
    try {
      const chain = await provider.optionsChain(row.ticker);
      const contracts = chain?.options || [];
      // Find matching contract by strike and type
      const match = contracts.find(c => {
        const cStrike = typeof c.strike === 'number' ? c.strike : parseFloat(c.strike);
        const cType = (c.type || c.optionType || '').toLowerCase();
        return cStrike === row.strike && cType === row.type.toLowerCase();
      });
      if (match) {
        updatedFields.premium = match.mid ?? match.lastPrice ?? match.premium ?? row.premium;
        updatedFields.delta = match.delta ?? row.delta;
        updatedFields.gamma = match.gamma ?? row.gamma;
        updatedFields.theta = match.theta ?? row.theta;
        updatedFields.iv = match.iv ?? match.impliedVolatility ?? row.iv;
        updatedFields.volume = match.volume ?? row.volume;
        updatedFields.openInterest = match.openInterest ?? row.openInterest;
        updatedFields.underlyingPrice = currentPrice;
        // Calculate remaining DTE from expiry date if available
        if (match.expiry || match.expirationDate) {
          const expiryStr = match.expiry || match.expirationDate;
          const expiryDate = new Date(expiryStr);
          const now = new Date();
          const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
          if (diffDays > 0) updatedFields.dte = diffDays;
        }
      }
    } catch (e) { console.error(`[WATCHLIST] Option chain refresh failed for ${row.ticker}:`, e.message); }
    
    // Update DB with fresh data (only columns that exist)
    const allowedCols = ['premium','delta','gamma','theta','iv','volume','openInterest','dte','underlyingPrice'];
    const setClauses = [];
    const values = [];
    for (const [key, val] of Object.entries(updatedFields)) {
      if (val != null && allowedCols.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(val);
      }
    }
    if (setClauses.length > 0) {
      values.push(req.params.id);
      db.prepare(`UPDATE watchlist SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
    }
    
    const fresh = db.prepare('SELECT * FROM watchlist WHERE id = ?').get(req.params.id);
    // Enrich with current price (computed, not stored)
    const enriched = {
      ...fresh,
      currentPrice,
      pnl: (currentPrice != null && fresh.addedPrice != null)
        ? +((currentPrice - fresh.addedPrice) / fresh.addedPrice * 100).toFixed(2)
        : null,
    };
    res.json(enriched);
  } catch (e) {
    console.error('[WATCHLIST] Refresh error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Refresh all watchlist items
app.put('/api/watchlist/refresh-all', async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM watchlist ORDER BY createdAt DESC').all();
    const provider = getProvider(req);
    const results = [];
    
    for (const row of rows) {
      let currentPrice = row.underlyingPrice;
      try {
        const quote = await provider.quote(row.ticker);
        if (quote?.price) currentPrice = quote.price;
      } catch {}
      
      let updatedFields = {};
      try {
        const chain = await provider.optionsChain(row.ticker);
        const contracts = chain?.options || [];
        const match = contracts.find(c => {
          const cStrike = typeof c.strike === 'number' ? c.strike : parseFloat(c.strike);
          const cType = (c.type || c.optionType || '').toLowerCase();
          return cStrike === row.strike && cType === row.type.toLowerCase();
        });
        if (match) {
          updatedFields.premium = match.mid ?? match.lastPrice ?? match.premium ?? row.premium;
          updatedFields.delta = match.delta ?? row.delta;
          updatedFields.gamma = match.gamma ?? row.gamma;
          updatedFields.theta = match.theta ?? row.theta;
          updatedFields.iv = match.iv ?? match.impliedVolatility ?? row.iv;
          updatedFields.volume = match.volume ?? row.volume;
          updatedFields.openInterest = match.openInterest ?? row.openInterest;
          updatedFields.underlyingPrice = currentPrice;
          if (match.expiry || match.expirationDate) {
            const expiryStr = match.expiry || match.expirationDate;
            const expiryDate = new Date(expiryStr);
            const now = new Date();
            const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) updatedFields.dte = diffDays;
          }
        }
      } catch {}
      
      const allowedCols = ['premium','delta','gamma','theta','iv','volume','openInterest','dte','underlyingPrice'];
      const setClauses = [];
      const values = [];
      for (const [key, val] of Object.entries(updatedFields)) {
        if (val != null && allowedCols.includes(key)) {
          setClauses.push(`${key} = ?`);
          values.push(val);
        }
      }
      if (setClauses.length > 0) {
        values.push(row.id);
        db.prepare(`UPDATE watchlist SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      }
      
      const fresh = db.prepare('SELECT * FROM watchlist WHERE id = ?').get(row.id);
      results.push({
        ...fresh,
        currentPrice,
        pnl: (currentPrice != null && fresh.addedPrice != null)
          ? +((currentPrice - fresh.addedPrice) / fresh.addedPrice * 100).toFixed(2)
          : null,
      });
    }
    res.json(results);
  } catch (e) {
    console.error('[WATCHLIST] Refresh-all error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Trades (SQLite) ──────────────────────────────────────────
app.get('/api/trades', (req, res) => {
  const { status } = req.query;
  const rows = status
    ? db.prepare('SELECT * FROM trades WHERE status = ? ORDER BY openedAt DESC').all(status)
    : db.prepare('SELECT * FROM trades ORDER BY openedAt DESC').all();
  res.json(rows);
});

app.post('/api/trades', (req, res) => {
  const { watchlistId, ticker, direction, type, strike, expiry, dte, entryPrice, stopPrice, optionStop, targetPrice, targetOption, riskPerContract, rr, notes } = req.body;
  const stmt = db.prepare(`INSERT INTO trades (watchlistId, ticker, direction, type, strike, expiry, dte, entryPrice, currentPrice, stopPrice, optionStop, targetPrice, targetOption, riskPerContract, rr, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(watchlistId, ticker, direction, type, strike, expiry, dte, entryPrice, entryPrice, stopPrice, optionStop, targetPrice, targetOption, riskPerContract, rr, notes);
  const trade = db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT 1').get();
  res.json(trade);
});

app.patch('/api/trades/:id', (req, res) => {
  const { currentPrice, pnl, status, notes, closedAt } = req.body;
  const fields = [];
  const values = [];
  if (currentPrice !== undefined) { fields.push('currentPrice = ?'); values.push(currentPrice); }
  if (pnl !== undefined) { fields.push('pnl = ?'); values.push(pnl); }
  if (status) { fields.push('status = ?'); values.push(status); }
  if (notes) { fields.push('notes = ?'); values.push(notes); }
  if (status === 'closed') { fields.push('closedAt = ?'); values.push(new Date().toISOString()); }
  values.push(req.params.id);
  db.prepare(`UPDATE trades SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const trade = db.prepare('SELECT * FROM trades WHERE id = ?').get(req.params.id);
  res.json(trade);
});

app.delete('/api/trades/:id', (req, res) => {
  db.prepare('DELETE FROM trades WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// ─── Debug: test single symbol ──────────────────────────────

// --- News --------------------------------------------------------
app.get('/api/news', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const symbol = req.query.symbol || null;
    const yahooProvider = getProviderByName('yahoo');
    const allItems = [];

    // ── Source 1: Yahoo Finance news (stock/market focused) ──
    if (yahooProvider && yahooProvider.news) {
      try {
        const yahooNews = await yahooProvider.news(symbol, limit);
        for (const item of yahooNews) {
          allItems.push({
            title: item.title, url: item.url,
            source: item.source || 'Yahoo Finance',
            category: item.category || 'general',
            published: item.published || new Date().toISOString(),
            tickers: item.tickers || (symbol ? [symbol] : []),
            impact: item.impact || null, _provider: 'yahoo',
          });
        }
        console.log(`[NEWS] Yahoo: ${yahooNews.length} items`);
      } catch (e) { console.warn('[NEWS] Yahoo failed:', e.message); }
    }

    // ── Source 2: Public.com news (if available) ──
    const pubProvider = getProviderByName('public');
    if (pubProvider && pubProvider.news) {
      try {
        const pubNews = await pubProvider.news(symbol, limit);
        for (const item of pubNews) {
          allItems.push({
            title: item.title, url: item.url,
            source: item.source || 'Public.com',
            category: item.category || 'general',
            published: item.published || new Date().toISOString(),
            tickers: item.tickers || (symbol ? [symbol] : []),
            impact: item.impact || null, _provider: 'public',
          });
        }
      } catch (e) { console.warn('[NEWS] Public.com failed:', e.message); }
    }

    // ── Source 3: CoinDesk RSS (crypto-focused) ──
    try {
      const resp = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const text = await resp.text();
        const items = text.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
        for (const item of items.slice(0, 15)) {
          const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)?.[1] || item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
          const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
          const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
          if (title) {
            allItems.push({
              title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
              url: link, source: 'CoinDesk', category: 'crypto',
              published: pubDate || new Date().toISOString(),
              tickers: [], impact: null, _provider: 'coindesk',
            });
          }
        }
      }
    } catch (e) { /* skip */ }

    // ── Source 4: Google News RSS (market headlines) ──
    try {
      const gNewsUrl = 'https://news.google.com/rss/search?q=stock+market+options+trading&hl=en-US&gl=US&ceid=US:en';
      const resp = await fetch(gNewsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const text = await resp.text();
        const items = text.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
        for (const item of items.slice(0, 15)) {
          const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/)?.[1] || item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
          const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '';
          const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
          const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || 'Google News';
          if (title && title.length > 10) {
            allItems.push({
              title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'),
              url: link, source,
              category: 'general', published: pubDate || new Date().toISOString(),
              tickers: [], impact: null, _provider: 'google',
            });
          }
        }
      }
    } catch (e) { /* skip */ }

    // ── Fallback: static news only if no live sources worked ──
    if (allItems.length === 0) {
      allItems.push(
        { title: 'Markets Rally on Strong Earnings Season Outlook', source: 'Barchart', category: 'economy', impact: 'bullish', tickers: ['SPY', 'QQQ'], published: new Date().toISOString(), url: '#', _provider: 'fallback' },
        { title: 'Fed Holds Rates Steady, Signals Possible September Cut', source: 'Reuters', category: 'fed', impact: 'bullish', tickers: ['SPY', 'IWM'], published: new Date(Date.now() - 3600000).toISOString(), url: '#', _provider: 'fallback' },
        { title: 'Tech Sector Momentum Continues as AI Spending Accelerates', source: 'Yahoo Finance', category: 'technology', impact: 'bullish', tickers: ['NVDA', 'AMD', 'QQQ'], published: new Date(Date.now() - 7200000).toISOString(), url: '#', _provider: 'fallback' },
      );
    }

    // ── Deduplicate & sort ──
    const seen = new Set();
    const merged = [];
    for (const item of allItems) {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 60);
      if (!seen.has(key)) { seen.add(key); merged.push(item); }
    }
    merged.sort((a, b) => new Date(b.published) - new Date(a.published));
    console.log(`[NEWS] Returning ${Math.min(limit, merged.length)} items (yahoo=${allItems.filter(i => i._provider === 'yahoo').length} coindesk=${allItems.filter(i => i._provider === 'coindesk').length} google=${allItems.filter(i => i._provider === 'google').length} public=${allItems.filter(i => i._provider === 'public').length})`);
    res.json(merged.slice(0, limit));
  } catch (e) {
    console.error('[NEWS] Error:', e);
    res.json([]);
  }
});

// ─── Public.com-specific Endpoints ────────────────────────────────

app.get('/api/public/instruments', async (req, res) => {
  try {
    const { typeFilter, tradingFilter, fractionalTradingFilter, optionTradingFilter, optionSpreadTradingFilter } = req.query;
    const pub = getProviderByName('public');
    if (!pub.getAllInstruments) return res.status(400).json({ error: 'Public provider not available or missing getAllInstruments' });
    const params = {};
    if (typeFilter) params.typeFilter = typeFilter.split(',');
    if (tradingFilter) params.tradingFilter = tradingFilter.split(',');
    if (fractionalTradingFilter) params.fractionalTradingFilter = fractionalTradingFilter.split(',');
    if (optionTradingFilter) params.optionTradingFilter = optionTradingFilter.split(',');
    if (optionSpreadTradingFilter) params.optionSpreadTradingFilter = optionSpreadTradingFilter.split(',');
    const data = await pub.getAllInstruments(params);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/public/instruments/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const type = req.query.type || 'EQUITY';
    const pub = getProviderByName('public');
    if (!pub.getInstrument) return res.status(400).json({ error: 'Public provider not available or missing getInstrument' });
    const data = await pub.getInstrument(symbol, type);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/public/bars/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const period = req.query.period || 'YEAR';
    const aggregation = req.query.aggregation || null;
    const instrumentType = req.query.instrumentType || 'EQUITY';
    const purchaseDate = req.query.purchaseDate || null;
    const pub = getProviderByName('public');
    if (!pub.bars) return res.status(400).json({ error: 'Public provider not available or missing bars' });
    const data = await pub.bars(symbol, period, { instrumentType, aggregation, purchaseDate });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/public/greeks', async (req, res) => {
  try {
    const osiSymbols = req.query.symbols;
    if (!osiSymbols) return res.status(400).json({ error: 'Missing required query param: symbols (comma-separated OSI symbols)' });
    const symbols = osiSymbols.split(',').map(s => s.trim()).filter(Boolean);
    const pub = getProviderByName('public');
    if (!pub.getOptionGreeks) return res.status(400).json({ error: 'Public provider not available or missing getOptionGreeks' });
    const data = await pub.getOptionGreeks(symbols);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/public/strategy-quote', async (req, res) => {
  try {
    const { legs } = req.body;
    if (!legs || !Array.isArray(legs) || legs.length < 2) {
      return res.status(400).json({ error: 'Request body must include legs array with at least 2 entries' });
    }
    const pub = getProviderByName('public');
    if (!pub.getStrategyQuote) return res.status(400).json({ error: 'Public provider not available or missing getStrategyQuote' });
    const data = await pub.getStrategyQuote(legs);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Public Portfolio & History ─────────────────────────────────

app.get('/api/public/portfolio', async (req, res) => {
  try {
    const pub = getProviderByName('public');
    if (!pub.getPortfolio) return res.status(400).json({ error: 'Public provider not available or missing getPortfolio' });
    const data = await pub.getPortfolio();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/public/history', async (req, res) => {
  try {
    const { start, end, pageSize, nextToken } = req.query;
    const pub = getProviderByName('public');
    if (!pub.getHistory) return res.status(400).json({ error: 'Public provider not available or missing getHistory' });
    const data = await pub.getHistory({ start, end, pageSize: pageSize ? parseInt(pageSize) : null, nextToken });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Correlation Matrix ──────────────────────────────────────────
app.get('/api/analysis/correlation', async (req, res) => {
  try {
    const tickers = (req.query.tickers || 'SPY,QQQ,IWM,AAPL,MSFT,NVDA,TSLA,AMZN,META,GOOG').split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const period = req.query.period || '1y';
    const provider = getProvider(req);

    const periodMap = { '1m': 30, '3m': 90, '6m': 180, '1y': 365, '2y': 730 };
    const days = periodMap[period] || 365;
    const period1 = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const period2 = new Date().toISOString().split('T')[0];

    const results = {};
    await Promise.all(tickers.map(async (sym) => {
      try {
        const hist = await provider.chart(sym, { period1, period2, interval: '1d' });
        const closes = (hist.quotes || []).map(q => q.close).filter(c => c != null);
        results[sym] = closes;
      } catch (e) {
        console.warn(`[CORRELATION] Failed for ${sym}: ${e.message}`);
        results[sym] = [];
      }
    }));

    // Align series to same dates (trim to shortest common length from the end)
    const validTickers = tickers.filter(t => results[t] && results[t].length > 20);
    if (validTickers.length < 2) {
      return res.json({ error: 'Need at least 2 tickers with > 20 data points', correlation: {} });
    }

    const minLen = Math.min(...validTickers.map(t => results[t].length));
    const aligned = Object.fromEntries(validTickers.map(t => [t, results[t].slice(-minLen)]));

    // Compute returns
    const returns = Object.fromEntries(validTickers.map(t => {
      const prices = aligned[t];
      const rets = [];
      for (let i = 1; i < prices.length; i++) {
        rets.push(prices[i] / prices[i - 1] - 1);
      }
      return [t, rets];
    }));

    // Pearson correlation
    function pearson(x, y) {
      const n = Math.min(x.length, y.length);
      if (n < 10) return null;
      const meanX = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
      const meanY = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
      let num = 0, denX = 0, denY = 0;
      for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX, dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
      }
      return denX > 0 && denY > 0 ? +(num / Math.sqrt(denX * denY)).toFixed(3) : null;
    }

    const matrix = {};
    for (const t1 of validTickers) {
      matrix[t1] = {};
      for (const t2 of validTickers) {
        if (t1 === t2) { matrix[t1][t2] = 1; continue; }
        if (matrix[t2]?.[t1] != null) { matrix[t1][t2] = matrix[t2][t1]; continue; }
        matrix[t1][t2] = pearson(returns[t1], returns[t2]);
      }
    }

    // Compute per-ticker stats
    const stats = Object.fromEntries(validTickers.map(t => {
      const rets = returns[t];
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const std = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length);
      const annualizedVol = +(std * Math.sqrt(252) * 100).toFixed(1);
      const totalReturn = +(aligned[t][aligned[t].length - 1] / aligned[t][0] - 1).toFixed(4);
      const annualizedReturn = +(Math.pow(1 + totalReturn, 252 / minLen) - 1).toFixed(4);
      return [t, { annualizedVol, annualizedReturn, totalReturn, dataPoints: minLen, sharpe: std > 0 ? +((annualizedReturn / (std * Math.sqrt(252))) ).toFixed(2) : null }];
    }));

    res.json({
      tickers: validTickers,
      period,
      dataPoints: minLen,
      correlation: matrix,
      stats,
      _provider: provider === getProviderByName('public') ? 'public' : (provider === getProviderByName('finnhub') ? 'finnhub' : 'yahoo'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── IV Analysis ──────────────────────────────────────────────────
app.get('/api/analysis/iv/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const period2 = new Date().toISOString().split('T')[0];
    const period1 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

    const [hist, currentChain] = await Promise.all([
      provider.chart(symbol, { period1, period2, interval: '1d' }),
      provider.optionsChain(symbol),
    ]);

    const closes = (hist.quotes || []).map(q => q.close).filter(c => c != null);
    if (closes.length < 20) {
      return res.json({ symbol, error: 'Insufficient historical data', iv: null, ivRank: null, ivPercentile: null });
    }

    // Compute historical volatility (annualized)
    const dailyReturns = [];
    for (let i = 1; i < closes.length; i++) {
      dailyReturns.push(closes[i] / closes[i - 1] - 1);
    }
    const hvMean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
    const hvVariance = dailyReturns.reduce((s, r) => s + (r - hvMean) ** 2, 0) / dailyReturns.length;
    const hvDaily = Math.sqrt(hvVariance);
    const hvAnnual = +(hvDaily * Math.sqrt(252) * 100).toFixed(1); // in %

    // Get current ATM IV from the options chain
    const underlyingPrice = currentChain.underlyingPrice;
    const dte = currentChain.dte || 30;
    const chain = currentChain.chain || [];

    // Find ATM options (strike closest to current price)
    const atmCalls = chain
      .filter(c => c.type === 'call' && c.iv != null && c.iv > 0)
      .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice));
    const atmPuts = chain
      .filter(c => c.type === 'put' && c.iv != null && c.iv > 0)
      .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice));

    const atmCallIV = atmCalls.slice(0, 3).length > 0
      ? atmCalls.slice(0, 3).reduce((s, c) => s + c.iv, 0) / Math.min(3, atmCalls.slice(0, 3).length)
      : null;
    const atmPutIV = atmPuts.slice(0, 3).length > 0
      ? atmPuts.slice(0, 3).reduce((s, c) => s + c.iv, 0) / Math.min(3, atmPuts.slice(0, 3).length)
      : null;
    const currentIV = atmCallIV != null && atmPutIV != null
      ? +((atmCallIV + atmPutIV) / 2 * 100).toFixed(1)
      : atmCallIV != null
        ? +(atmCallIV * 100).toFixed(1)
        : hvAnnual;

    // IV Skew: compare OTM put IV vs OTM call IV
    const otmPutIVs = chain
      .filter(c => c.type === 'put' && c.strike < underlyingPrice * 0.95 && c.iv > 0)
      .map(c => c.iv);
    const otmCallIVs = chain
      .filter(c => c.type === 'call' && c.strike > underlyingPrice * 1.05 && c.iv > 0)
      .map(c => c.iv);
    const avgOtmPutIV = otmPutIVs.length > 0 ? +(otmPutIVs.reduce((a, b) => a + b, 0) / otmPutIVs.length * 100).toFixed(1) : null;
    const avgOtmCallIV = otmCallIVs.length > 0 ? +(otmCallIVs.reduce((a, b) => a + b, 0) / otmCallIVs.length * 100).toFixed(1) : null;
    const skew = (avgOtmPutIV != null && avgOtmCallIV != null) ? +(avgOtmPutIV - avgOtmCallIV).toFixed(1) : null;

    // Per-expiry IV term structure
    const expiryIVs = [];
    for (const exp of (currentChain.expirationDates || []).slice(0, 8)) {
      try {
        const expChain = exp === currentChain.selectedExpiry ? currentChain : await provider.optionsChain(symbol, exp);
        const expATM = (expChain.chain || [])
          .filter(c => c.type === 'call' && c.iv > 0)
          .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice))
          .slice(0, 3);
        const avgIV = expATM.length > 0 ? expATM.reduce((s, c) => s + c.iv, 0) / expATM.length : null;
        const expDte = Math.max(0, Math.ceil((new Date(exp + 'T00:00:00Z').getTime() - Date.now()) / 86400000));
        if (avgIV != null) expiryIVs.push({ expiry: exp, dte: expDte, iv: +(avgIV * 100).toFixed(1) });
      } catch { /* skip */ }
    }

    res.json({
      symbol,
      underlyingPrice,
      currentIV,
      historicalVolatility: hvAnnual,
      ivToHvRatio: hvAnnual > 0 ? +(currentIV / hvAnnual).toFixed(2) : null,
      ivSkew: skew,
      otmPutIV: avgOtmPutIV,
      otmCallIV: avgOtmCallIV,
      atmCallIV: atmCallIV != null ? +(atmCallIV * 100).toFixed(1) : null,
      atmPutIV: atmPutIV != null ? +(atmPutIV * 100).toFixed(1) : null,
      expiryIVs,
      selectedExpiry: currentChain.selectedExpiry,
      selectedDTE: dte,
      totalStrikes: currentChain.strikes?.length || 0,
      dataPoints: closes.length,
      _provider: provider === getProviderByName('public') ? 'public' : (provider === getProviderByName('finnhub') ? 'finnhub' : 'yahoo'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Greeks Enrichment ─────────────────────────────────────────────
app.get('/api/analysis/greeks/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);

    // Get the options chain first
    const chain = await provider.optionsChain(symbol);
    const underlyingPrice = chain.underlyingPrice;
    const dte = chain.dte || 30;

    // If Public.com is available, use real Greeks
    const pub = getProviderByName('public');
    const usePublicGreeks = provider !== pub && pub.getOptionGreeks;
    let enrichedChain = chain.chain;

    if (usePublicGreeks && chain.chain.length > 0) {
      // Collect OSI symbols for contracts that have them
      const contracts = chain.chain.filter(c => c.contractSymbol);
      // Batch in groups of 50 (API may have limits)
      for (let i = 0; i < contracts.length; i += 50) {
        const batch = contracts.slice(i, i + 50);
        const osiSymbols = batch.map(c => c.contractSymbol);
        try {
          const greeksData = await pub.getOptionGreeks(osiSymbols);
          if (greeksData.greeks && greeksData.greeks.length > 0) {
            const greekMap = new Map(greeksData.greeks.map(g => [g.osiSymbol, g]));
            for (const c of batch) {
              const g = greekMap.get(c.contractSymbol);
              if (g) {
                if (g.delta != null) c.delta = g.delta;
                if (g.gamma != null) c.gamma = g.gamma;
                if (g.theta != null) c.theta = g.theta;
                if (g.vega != null) c.vega = g.vega;
                if (g.rho != null) c.rho = g.rho;
                if (g.impliedVolatility != null) c.iv = g.impliedVolatility;
                c.estimated = false;
              }
            }
          }
        } catch (e) {
          console.warn(`[GREEKS] Batch ${i}-${i + 50} failed: ${e.message}`);
        }
      }
      enrichedChain = chain.chain;
    }

    // Recompute scores with enriched Greeks
    enrichedChain = enrichedChain.map(c => {
      const isCall = c.type === 'call';
      const delta = Math.abs(c.delta ?? estimateDelta(c.strike, underlyingPrice || c.strike, isCall, dte));
      const iv = (c.iv && c.iv > 0.001) ? c.iv : (c.mid && c.mid > 0 ? estimateIV(c.mid, c.strike, underlyingPrice || c.strike, dte, isCall) : null);
      return {
        ...c,
        delta: c.delta ?? delta,
        gamma: c.gamma ?? (delta ? 0.01 : null),
        iv: c.iv ?? iv,
        score: computeScore(null, iv, c.volume, c.openInterest, delta, iv),
        enriched: c.estimated === false,
      };
    });

    res.json({
      symbol,
      underlyingPrice,
      selectedExpiry: chain.selectedExpiry,
      dte,
      strikes: chain.strikes,
      chain: enrichedChain,
      enrichedCount: enrichedChain.filter(c => c.enriched).length,
      totalCount: enrichedChain.length,
      _provider: provider === getProviderByName('public') ? 'public' : (provider === getProviderByName('finnhub') ? 'finnhub' : 'yahoo'),
      _enrichedBy: usePublicGreeks ? 'public' : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── 15-Minute Probability (Random Forest) ────────────────────────────────
app.get('/api/prob15m/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const [q, chartResult] = await Promise.all([
      provider.quote(symbol),
      provider.chart(symbol, { period1: new Date(Date.now() - 10 * 86400000), interval: '5m' }).catch(() => null),
    ]);
    if (!q || !q.price) return res.json({ symbol, bullProb: 50, bearProb: 20, trendState: 'No data', price: null });

    const price = q.price;
    const chartQuotes = chartResult?.quotes || [];
    const closes = chartQuotes.map(q => q.close).filter(c => c != null && c > 0);
    if (closes.length < 100) {
      return res.json({ symbol, bullProb: 50, bearProb: 20, trendState: 'Insufficient data', price: +price.toFixed(2), changePct: +(q.changePercent || 0).toFixed(2), rsi: null, macdCrossover: null, ema9: null, ema20: null, ema50: null, atr15m: +(price * 0.002).toFixed(2), movePct: 0, bullTarget: +price.toFixed(2), bearTarget: +price.toFixed(2), probTarget: +price.toFixed(2), model: 'fallback' });
    }

    // Only use last 300 candles for training to keep it fast
    const maxCandles = 300;
    const startIdx = Math.max(0, closes.length - maxCandles);
    const trainCloses = closes.slice(startIdx);
    const trainQuotes = chartQuotes.slice(startIdx + (chartQuotes.length - closes.length));

    // ── Feature Engineering ──────────────────────────────────────
    const ema = (arr, p) => {
      if (arr.length < p) return null;
      const k = 2 / (p + 1);
      let e = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
      for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
      return e;
    };
    const sma = (arr, p) => arr.length >= p ? arr.slice(-p).reduce((a, b) => a + b, 0) / p : null;
    const rsiCalc = (arr, p = 14) => {
      if (arr.length < p + 1) return null;
      let gains = 0, losses = 0;
      for (let i = arr.length - p; i < arr.length; i++) {
        const diff = arr[i] - arr[i - 1];
        if (diff > 0) gains += diff; else losses += Math.abs(diff);
      }
      if (losses === 0) return 100;
      const rs = (gains / p) / (losses / p);
      return 100 - 100 / (1 + rs);
    };

    const LOOKBACK = 50;
    const FORWARD = 3; // 15 min = 3 × 5min candles
    const features = [];
    const labels = [];

    for (let i = LOOKBACK; i < trainCloses.length - FORWARD; i++) {
      const window = trainCloses.slice(i - LOOKBACK, i);
      const cur = trainCloses[i];
      const prev = trainCloses[i - 1];
      const rsi = rsiCalc(window);
      const ema9 = ema(window, 9);
      const ema21 = ema(window, 21);
      const ema50 = ema(window, Math.min(50, window.length));
      const sma20 = sma(window, Math.min(20, window.length));
      const pctChange1 = prev ? (cur - prev) / prev : 0;
      const pctChange5 = i >= 5 ? (cur - trainCloses[i - 5]) / trainCloses[i - 5] : 0;
      const pctChange15 = i >= 15 ? (cur - trainCloses[i - 15]) / trainCloses[i - 15] : 0;
      const emaAlign = (ema9 && ema21 && ema50) ? (ema9 > ema21 && ema21 > ema50 ? 1 : ema9 < ema21 && ema21 < ema50 ? -1 : 0) : 0;
      const priceVsEma9 = ema9 ? cur / ema9 - 1 : 0;
      const priceVsEma21 = ema21 ? cur / ema21 - 1 : 0;
      const priceVsSma20 = sma20 ? cur / sma20 - 1 : 0;
      // ATR-like volatility
      let atr5 = 0;
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const h = trainQuotes[j]?.high || trainCloses[j];
        const l = trainQuotes[j]?.low || trainCloses[j];
        atr5 += (h - l);
      }
      atr5 /= Math.min(5, i);
      const volRatio = cur > 0 ? atr5 / cur : 0;
      // Candle features
      const candleHigh = trainQuotes[i]?.high || cur;
      const candleLow = trainQuotes[i]?.low || cur;
      const bodyRatio = (candleHigh - candleLow) > 0 ? Math.abs(cur - prev) / (candleHigh - candleLow) : 0.5;
      const upperShadow = (candleHigh - candleLow) > 0 ? (candleHigh - Math.max(cur, prev)) / (candleHigh - candleLow) : 0;
      const lowerShadow = (candleHigh - candleLow) > 0 ? (Math.min(cur, prev) - candleLow) / (candleHigh - candleLow) : 0;
      // Volume
      const vols = trainQuotes.slice(Math.max(0, i - 20), i).map(q => q.volume || 0);
      const volAvg = vols.length > 0 ? vols.reduce((a, b) => a + b, 0) / vols.length : 1;
      const volCur = trainQuotes[i]?.volume || 1;
      const volChange = volAvg > 0 ? volCur / volAvg : 1;

      features.push([
        rsi !== null ? rsi / 100 : 0.5,
        pctChange1,
        pctChange5,
        pctChange15,
        emaAlign,
        priceVsEma9,
        priceVsEma21,
        priceVsSma20,
        volRatio,
        bodyRatio,
        volChange,
        upperShadow,
        lowerShadow,
      ]);
      labels.push((trainCloses[i + FORWARD] - cur) / cur);
    }

    if (features.length < 100) {
      return res.json({ symbol, bullProb: 50, bearProb: 20, trendState: 'Not enough training data', price: +price.toFixed(2), changePct: +(q.changePercent || 0).toFixed(2), rsi: null, macdCrossover: null, ema9: null, ema20: null, ema50: null, atr15m: +(price * 0.002).toFixed(2), movePct: 0, bullTarget: +price.toFixed(2), bearTarget: +price.toFixed(2), probTarget: +price.toFixed(2), model: 'fallback' });
    }

    // ── Train Random Forest ──────────────────────────────────────
    const rf = new RandomForestRegression({
      nEstimators: 50,
      maxDepth: 6,
      minSamplesLeaf: 5,
      replacement: true,
      seed: 42,
    });
    rf.train(features, labels);

    // ── Predict ──────────────────────────────────────────────────
    const lastFeatures = features[features.length - 1];
    const prediction = rf.predict([lastFeatures])[0];

    // ── Bull/Bear probability from tree votes ─────────────────────
    const treePredictions = rf.estimators.map(tree => {
      try { return tree.predict([lastFeatures])[0] || 0; } catch { return 0; }
    });
    const bullTrees = treePredictions.filter(p => p > 0).length;
    const bearTrees = treePredictions.filter(p => p < 0).length;
    const bullProb = Math.round(Math.min(85, Math.max(10, (bullTrees / treePredictions.length) * 100)));
    const bearProb = Math.round(Math.min(85, Math.max(10, (bearTrees / treePredictions.length) * 100)));

    // ── ATR for price targets ────────────────────────────────────
    let atr15m = price * 0.002;
    if (chartQuotes.length >= 14) {
      const trs = [];
      for (let i = Math.max(1, chartQuotes.length - 14); i < chartQuotes.length; i++) {
        const h = chartQuotes[i].high, l = chartQuotes[i].low, pc = chartQuotes[i - 1].close;
        if (h && l && pc) trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      }
      if (trs.length >= 3) {
        atr15m = (trs.reduce((a, b) => a + b, 0) / trs.length) * Math.sqrt(3);
      }
    }

    // ── Current indicators for display ───────────────────────────
    const curRsi = rsiCalc(closes);
    const curEma9 = ema(closes, 9);
    const curEma20 = ema(closes, 20);
    const curEma50 = ema(closes, 50);
    const macdCrossover = curEma9 && curEma20 ? (curEma9 > curEma20 ? 'Bullish' : 'Bearish') : null;
    let trendState = 'Neutral';
    if (curEma9 > curEma20 && curEma20 > curEma50) trendState = 'Strong Uptrend';
    else if (curEma9 > curEma20) trendState = 'Uptrend';
    else if (curEma9 < curEma20 && curEma20 < curEma50) trendState = 'Strong Downtrend';
    else if (curEma9 < curEma20) trendState = 'Downtrend';
    else if (curEma50 && price > curEma50) trendState = 'Weak Uptrend';
    else trendState = 'Weak Downtrend';

    // ── Price targets ────────────────────────────────────────────
    const predictedMove = prediction * price;
    const probTarget = +(price + predictedMove).toFixed(2);
    const movePct = +(prediction * 100).toFixed(2);
    const bullTarget = +(price + atr15m * 0.6).toFixed(2);
    const bearTarget = +(price - atr15m * 0.6).toFixed(2);

    // ── Training R² ─────────────────────────────────────────────
    const trainPreds = rf.predict(features);
    const meanY = labels.reduce((a, b) => a + b, 0) / labels.length;
    const ssRes = labels.reduce((sum, y, i) => sum + (y - trainPreds[i]) ** 2, 0);
    const ssTot = labels.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    res.json({
      symbol,
      price: +price.toFixed(2),
      changePct: +(q.changePercent || 0).toFixed(2),
      rsi: curRsi ? +curRsi.toFixed(1) : null,
      macdCrossover,
      ema9: curEma9 ? +curEma9.toFixed(2) : null,
      ema20: curEma20 ? +curEma20.toFixed(2) : null,
      ema50: curEma50 ? +curEma50.toFixed(2) : null,
      bullProb,
      bearProb,
      trendState,
      atr15m: +atr15m.toFixed(2),
      movePct,
      bullTarget,
      bearTarget,
      probTarget,
      model: 'random_forest',
      r2: +r2.toFixed(3),
      nSamples: features.length,
      nTrees: rf.estimators?.length || 100,
    });
  } catch (e) {
    console.error(`[PROB15M-RF] ${req.params.symbol}:`, e.message);
    res.json({ symbol: req.params.symbol.toUpperCase(), bullProb: 50, bearProb: 20, trendState: 'Error', price: null, model: 'fallback' });
  }
});

app.get('/api/scanner/debug/:symbol', async (req, res) => {
  try {
    const provider = getProvider(req);
    const sym = req.params.symbol;
    const period2 = new Date().toISOString().split('T')[0];
    const period1 = new Date(Date.now() - 400 * 86400000).toISOString().split('T')[0];
    console.log(`[DEBUG] Fetching chart for ${sym}: period1=${period1}, period2=${period2}`);
    const hist = await provider.chart(sym, { period1, period2, interval: '1d' });
    const closes = hist.quotes?.map(q => q.close).filter(c => c != null) || [];
    const data = await provider.optionsChain(sym);
    const expiries = data.expirationDates || [];
    const calls = data.chain.filter(c => c.type === 'call');
    const puts = data.chain.filter(c => c.type === 'put');
    console.log(`[DEBUG] ${sym}: closes=${closes.length}, expiries=${expiries.length}, calls=${calls.length}, puts=${puts.length}`);
    if (closes.length > 0) {
      const sma20 = sma(closes, 20), sma50 = sma(closes, 50), sma200 = sma(closes, 200);
      const trendLabel = determineTrend(closes[closes.length - 1], sma50, sma200, sma20).label;
      console.log(`[DEBUG] ${sym}: close=${closes[closes.length-1].toFixed(2)}, sma20=${sma20?.toFixed(2)}, sma50=${sma50?.toFixed(2)}, sma200=${sma200?.toFixed(2)}, trend=${trendLabel}`);
    }
    // Show first 5 DTE ranges
    const now = Date.now();
    const dteList = expiries.slice(0, 5).map(e => {
      const ms = typeof e === 'number' ? e * 1000 : new Date(e).getTime();
      return Math.ceil((ms - now) / 86400000);
    });
    console.log(`[DEBUG] ${sym}: first 5 DTEs: ${dteList.join(', ')}`);
    // Show filter pass rates
    let passAll = 0, failOI = 0, failDelta = 0, failSpread = 0;
    for (const c of calls) {
      const oi = c.openInterest || 0;
      const d = Math.abs(c.delta || 0);
      const mid = c.mid || (c.bid && c.ask ? (c.bid + c.ask) / 2 : 0);
      const bid = c.bid || 0;
      const ask = c.ask || 0;
      const sp = mid > 0 ? (ask - bid) / mid : 1;
      if (oi < 100) failOI++;
      else if (d < 0.35 || d > 0.85) failDelta++;
      else if (sp > 0.10) failSpread++;
      else passAll++;
    }
    console.log(`[DEBUG] ${sym} calls: total=${calls.length}, passAll=${passAll}, failOI=${failOI}, failDelta=${failDelta}, failSpread=${failSpread}`);
    res.json({ symbol: sym, closes: closes.length, expiries: expiries.length, firstDTEs: dteList, calls: calls.length, puts: puts.length, passAll, failOI, failDelta, failSpread, trend: closes.length > 50 ? determineTrend(closes[closes.length-1], sma(closes,50), sma(closes,200), sma(closes,20)).label : 'N/A', sma50: sma(closes, 50)?.toFixed(2), sma200: sma(closes, 200)?.toFixed(2) });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// ─── Swing Scanner ─────────────────────────────────────────────
app.get('/api/scanner', async (req, res) => {
  try {
    // S&P 500 based default watchlist for the swing scanner
    const defaultWatchlist = SCANNER_WATCHLIST;
    const watchlist = req.query.tickers ? req.query.tickers.split(',') : defaultWatchlist;
    const topN = parseInt(req.query.topN) || 10;
    const results = [];
    const traces = []; // Per-symbol pipeline trace data
    const includeTrace = req.query.trace === '1' || req.query.trace === 'true';
    const provider = getProvider(req);

    for (const sym of watchlist) {
      try {
        const period2 = new Date().toISOString().split('T')[0];
        const period1 = new Date(Date.now() - 400 * 86400000).toISOString().split('T')[0];
        const [hist, q, data] = await Promise.all([
          provider.chart(sym, { period1, period2, interval: '1d' }),
          provider.quote(sym),
          provider.optionsChain(sym),
        ]);

        const closes = hist.quotes?.map(q => q.close).filter(c => c != null) || [];
        const highs = hist.quotes?.map(q => q.high).filter(h => h != null) || [];
        const lows = hist.quotes?.map(q => q.low).filter(l => l != null) || [];
        const close = q.price;
        if (!close || closes.length < 200) continue;

        // ── Compute Indicators ──
        const sma20 = sma(closes, 20);
        const sma50 = sma(closes, 50);
        const sma200 = sma(closes, 200);
        const rsiVal = rsi(closes, 14);
        const macdData = macd(closes);
        const stochasticVal = stochastic(highs, lows, closes, 14);
        const atrVal = atr(highs, lows, closes, 14);
        const swingPts = swingPoints(highs, lows);
        const { label: trendLabel, score: trendBaseScore } = determineTrend(close, sma50, sma200, sma20);
        const smaAligned = sma20 > sma50 && sma50 > sma200;
        const { setup, quality: setupQuality } = detectSetup(closes, highs, lows, close, sma20, sma50, swingPts);
        // Compute OI/IV edge from standardized chain
        const allCalls = data.chain.filter(c => c.type === 'call');
        const allPuts = data.chain.filter(c => c.type === 'put');
        const totalCallOI = allCalls.reduce((s, c) => s + (c.openInterest || 0), 0);
        const totalPutOI = allPuts.reduce((s, p) => s + (p.openInterest || 0), 0);
        const callOIContracts = allCalls.filter(c => c.openInterest > 0);
        const putOIContracts = allPuts.filter(p => p.openInterest > 0);
        const topCallsByOI = callOIContracts.sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0)).slice(0, 5);
        const topPutsByOI = putOIContracts.sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0)).slice(0, 5);
        const avgCallIV = topCallsByOI.length > 0
          ? topCallsByOI.filter(c => c.iv > 0 && c.iv < 5).reduce((s, c) => s + c.iv, 0) / Math.max(1, topCallsByOI.filter(c => c.iv > 0 && c.iv < 5).length) || 0
          : 0;
        const avgPutIV = topPutsByOI.length > 0
          ? topPutsByOI.filter(p => p.iv > 0 && p.iv < 5).reduce((s, p) => s + p.iv, 0) / Math.max(1, topPutsByOI.filter(p => p.iv > 0 && p.iv < 5).length) || 0
          : 0;
        let bullishEdge = 0, bearishEdge = 0;
        if (totalCallOI > totalPutOI * 1.2 && avgCallIV < avgPutIV) bullishEdge = 2;
        else if (totalCallOI > totalPutOI * 1.5) bullishEdge = 1;
        if (totalPutOI > totalCallOI * 1.2 && avgPutIV < avgCallIV) bearishEdge = 2;
        else if (totalPutOI > totalCallOI * 1.5) bearishEdge = 1;
        const oiIv = { bullishEdge, bearishEdge, totalCallOI, totalPutOI, avgCallIV: +(avgCallIV * 100).toFixed(1), avgPutIV: +(avgPutIV * 100).toFixed(1) };

        // Determine direction bias
        const isBullish = trendLabel === 'Bullish' || trendLabel === 'Neutral-Bullish' || (trendLabel === 'Neutral' && setup === 'Breakout');

        // Stop loss with ATR cushion
        const stopInfo = computeStopLoss(close, sma50, sma20, swingPts, isBullish, atrVal);

        // Expiry selection from standardized data
        const expiries = data.expirationDates || [];
        let bestExpiry = data.selectedExpiry;
        let bestDte = data.dte;
        // If no good expiry from provider, try to find one
        if (!bestExpiry || !bestDte) {
          const now = Date.now();
          for (const exp of expiries) {
            const expMs = new Date(exp).getTime();
            if (isNaN(expMs)) continue;
            const dte = Math.ceil((expMs - now) / 86400000);
            if (dte >= 25 && dte <= 60) { bestExpiry = exp; bestDte = dte; break; }
          }
          if (!bestExpiry) {
            for (const exp of expiries) {
              const expMs = new Date(exp).getTime();
              if (isNaN(expMs)) continue;
              const dte = Math.ceil((expMs - now) / 86400000);
              if (dte >= 15 && dte <= 90) { bestExpiry = exp; bestDte = dte; break; }
            }
          }
          if (!bestExpiry) {
            for (const exp of expiries) {
              const expMs = new Date(exp).getTime();
              if (isNaN(expMs)) continue;
              const dte = Math.ceil((expMs - now) / 86400000);
              if (dte > 5) { bestExpiry = exp; bestDte = dte; break; }
            }
          }
        }
        if (!bestExpiry) {
          console.warn(`[SCANNER] ${sym}: No valid expiration found (skipping)`);
          continue;
        }
        console.log(`[SCANNER] ${sym}: Selected expiry DTE=${bestDte}`);

        // If selected expiry differs from provider default, re-fetch for that specific date
        let chainData = data;
        if (bestExpiry !== data.selectedExpiry && bestExpiry) {
          try {
            console.log(`[SCANNER] ${sym}: Re-fetching options for expiry ${bestExpiry}`);
            chainData = await provider.optionsChain(sym, bestExpiry);
          } catch (e) {
            console.warn(`[SCANNER] ${sym}: Failed to fetch expiry options for ${bestExpiry}, using default`);
          }
        }

        // Directional filter: calls for bullish, puts for bearish
        const contracts = isBullish
          ? chainData.chain.filter(c => c.type === 'call')
          : chainData.chain.filter(c => c.type === 'put');
        console.log(`[SCANNER] ${sym}: ${isBullish ? 'Bullish' : 'Bearish'}, ${contracts.length} ${isBullish ? 'calls' : 'puts'} available (DTE=${bestDte})`);

        const filterReasons = []; // Track why each contract was omitted
        const filtered = contracts
          .map(c => {
            const oi = c.openInterest || 0;
            const absDelta = Math.abs(c.delta ?? estimateDelta(c.strike, close, isBullish, bestDte));
            const bid = c.bid || 0;
            const ask = c.ask || 0;
            const mid = c.mid || (bid && ask && (bid + ask) / 2 > 0 ? (bid + ask) / 2 : (c.lastPrice || 0));
            const spread = mid > 0 ? (ask - bid) / mid : (mid > 0 ? 0.15 : 1);
            const spreadOk = (bid > 0 && ask > 0) ? spread <= 0.20 : true;
            const reasons = [];
            if (oi < 10) reasons.push(`OI ${oi} < 10`);
            if (absDelta < 0.20) reasons.push(`Δ ${absDelta.toFixed(3)} < 0.20`);
            if (absDelta > 0.90) reasons.push(`Δ ${absDelta.toFixed(3)} > 0.90`);
            if (!spreadOk) reasons.push(`Spread ${(spread * 100).toFixed(1)}% > 20%`);
            if (mid <= 0) reasons.push('No mid price');
            const passed = reasons.length === 0;
            if (!passed) filterReasons.push({ contract: c.contractSymbol || `${c.strike}${isBullish ? 'C' : 'P'}`, strike: c.strike, type: isBullish ? 'CALL' : 'PUT', oi, delta: +absDelta.toFixed(3), spread: +(spread * 100).toFixed(1), mid, bid, ask, reasons });
            return { c, passed, reasons, absDelta, mid, bid, ask, spread };
          })
          .filter(({ passed }) => passed)
          .map(({ c }) => c)
          .map(c => {
            const bid = c.bid || 0;
            const ask = c.ask || 0;
            const mid = c.mid || (bid && ask && (bid + ask) / 2 > 0 ? +((bid + ask) / 2).toFixed(2) : (c.lastPrice || 0));
            const delta = Math.abs(c.delta ?? estimateDelta(c.strike, close, isBullish, bestDte));
            const spread = mid > 0 ? ((ask - bid) / mid) : 0.05;
            const effectiveIV = (c.iv && c.iv > 0.001) ? c.iv : (mid > 0 ? estimateIV(mid, c.strike, close, bestDte, isBullish) : null);
            const stopPrice = stopInfo.price;
            // Option stop = mid - (underlying risk × delta)
            const optionStop = isBullish ? mid - (close - stopPrice) * delta : mid - (stopPrice - close) * delta;
            // Sanity: option stop must be positive and below mid for risk calculation
            const safeOptionStop = Math.max(0.01, optionStop);
            const riskPerContract = Math.abs(mid - safeOptionStop) * 100;
            // R:R target ≥ 2:1
            const targetPrice = isBullish ? close + (close - stopPrice) * 2 : close - (stopPrice - close) * 2;
            const targetOption = isBullish ? mid + (targetPrice - close) * delta : mid + (close - targetPrice) * delta;
            const rr = riskPerContract > 0 ? ((targetOption - mid) * 100) / riskPerContract : 0;

            // Scoring: 0.4×Trend + 0.3×Liquidity + 0.3×Risk/Reward
            const trendScore = scoreTrend(trendLabel, smaAligned, setupQuality, rsiVal, macdData?.crossover);
            const liqScore = scoreLiquidity(c.openInterest, c.volume, bid || null, ask || null);
            const rrScore = scoreRR(rr);
            const overall = +(0.4 * trendScore + 0.3 * liqScore + 0.3 * rrScore).toFixed(1);

            const isItm = isBullish ? c.strike < close : c.strike > close;
            const strategyLabel = classifyStrategy(delta, isBullish, isItm, bestDte);
            const timeframe = bestDte > 180 ? 'LEAPS' : bestDte > 90 ? 'Swing (Long)' : 'Swing';
            const technicalReason = buildTechnicalReason(
              { symbol: sym, underlyingPrice: close }, trendLabel, setup, rsiVal, macdData?.crossover, smaAligned, stochasticVal, null
            );

            return {
              symbol: sym,
              direction: isBullish ? 'Bullish' : 'Bearish',
              trend: trendLabel,
              setup,
              contract: c.contractSymbol,
              type: isBullish ? 'CALL' : 'PUT',
              strike: c.strike,
              expiry: bestExpiry,
              dte: bestDte,
              bid: c.bid,
              ask: c.ask,
              mid,
              spreadPct: +(spread * 100).toFixed(2),
              spreadLabel: bid && ask && spread <= 0.03 ? 'Tight' : bid && ask && spread <= 0.07 ? 'Moderate' : (!bid || !ask) ? 'Est*' : 'Wide',
              volume: c.volume,
              openInterest: c.openInterest,
              delta: +delta.toFixed(3),
              gamma: +(c.gamma || 0).toFixed(4),
              theta: +(c.theta || 0).toFixed(4),
              iv: effectiveIV ? +effectiveIV.toFixed(4) : null,
              underlyingPrice: +close.toFixed(2),
              sma20: +sma20.toFixed(2),
              sma50: +sma50.toFixed(2),
              sma200: +sma200.toFixed(2),
              rsi: rsiVal ? +rsiVal.toFixed(1) : null,
              macdCrossover: macdData?.crossover || null,
              stochastic: stochasticVal,
              stopPrice,
              stopLevel: stopInfo.level,
              optionStop: +safeOptionStop.toFixed(2),
              riskPerContract: +riskPerContract.toFixed(0),
              targetPrice: +targetPrice.toFixed(2),
              targetOption: +targetOption.toFixed(2),
              rr: +rr.toFixed(1),
              oiIvEdge: isBullish ? oiIv.bullishEdge : oiIv.bearishEdge,
              oiIvDetail: oiIv,
              scores: { trend: trendScore, liquidity: liqScore, riskReward: rrScore, overall },
              strategy: strategyLabel,
              timeframe,
              technicalReason,
              atm: isItm ? 'ITM' : 'OTM',
            };
          })
          .sort((a, b) => b.scores.overall - a.scores.overall);

        console.log(`[SCANNER] ${sym}: ${filtered.length} contracts passed filters`);
        // Top 2 contracts per symbol by overall score
        const candidates = filtered.slice(0, 2);
        if (candidates.length > 0) {
          console.log(`[SCANNER] ${sym}: Top candidate - ${candidates[0].symbol} ${candidates[0].type} $${candidates[0].strike} DTE=${candidates[0].dte} Score=${candidates[0].scores.overall}`);
          results.push(...candidates);
        }

        // Trace: record full pipeline data for this symbol
        traces.push({
          symbol: sym,
          trend: trendLabel,
          setup,
          direction: isBullish ? 'Bullish' : 'Bearish',
          underlyingPrice: +close.toFixed(2),
          sma20: +sma20.toFixed(2),
          sma50: +sma50.toFixed(2),
          sma200: +sma200.toFixed(2),
          rsi: rsiVal ? +rsiVal.toFixed(1) : null,
          macdCrossover: macdData?.crossover || null,
          stochastic: stochasticVal,
          bestExpiry,
          bestDte,
          totalContracts: contracts.length,
          passedFilters: filtered.length,
          omitted: filterReasons,
          topCandidates: candidates.map(c => ({
            contract: c.contractSymbol || `${c.strike}${isBullish ? 'C' : 'P'}`,
            strike: c.strike,
            type: c.type,
            mid: c.mid,
            delta: c.delta,
            score: c.scores.overall,
          })),
        });

        // Persist to scan_history
        for (const c of candidates) {
          db.prepare(`INSERT INTO scan_history (symbol, direction, trend, setup, contract, type, strike, dte, mid, delta, iv, openInterest, spreadPct, spreadLabel, stopPrice, optionStop, riskPerContract, rr, oiIvEdge, scores_trend, scores_liquidity, scores_riskReward, scores_overall, underlyingPrice, sma20, sma50, sma200, rsi, macdCrossover, strategyLabel, timeframe, targetPrice, targetOption, technicalReason, stopLevel, atm) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            c.symbol, c.direction, c.trend, c.setup, c.contract, c.type, c.strike, c.dte, c.mid, c.delta, c.iv, c.openInterest, c.spreadPct, c.spreadLabel, c.stopPrice, c.optionStop, c.riskPerContract, c.rr, c.oiIvEdge, c.scores.trend, c.scores.liquidity, c.scores.riskReward, c.scores.overall, c.underlyingPrice, c.sma20, c.sma50, c.sma200, c.rsi, c.macdCrossover, c.strategy, c.timeframe, c.targetPrice, c.targetOption, c.technicalReason, c.stopLevel, c.atm
          );
        }
      } catch (e) {
        console.error(`Scanner error for ${sym}:`, e.message);
      }
    }

    console.log(`[SCANNER] Total results: ${results.length}, returning top ${topN}`);
    results.sort((a, b) => b.scores.overall - a.scores.overall);
    const response = results.slice(0, topN);
    // Add trace data when requested
    if (includeTrace) {
      res.json({ results: response, trace: traces });
    } else {
      // Add pipeline summary to each result (how many were omitted)
      const traceMap = Object.fromEntries(traces.map(t => [t.symbol, t]));
      for (const r of response) {
        const t = traceMap[r.symbol];
        if (t) {
          r._pipeline = {
            totalContracts: t.totalContracts,
            passedFilters: t.passedFilters,
            omitted: t.omitted.length,
            omittedReasons: t.omitted.slice(0, 10).map(o => ({ strike: o.strike, type: o.type, reasons: o.reasons })),
          };
        }
      }
      res.json(response);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Full Stock Analysis (Sections A–D) ──────────────────────

app.get('/api/analysis/full/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const yahoo = getProviderByName('yahoo');
    const pub = getProviderByName('public');
    const result = await fullAnalysis(symbol, { yahoo, pub });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SVG Price Chart ──────────────────────────────────────────────
// ─── Chart Data (JSON) ──────────────────────────────────────────
app.get('/api/chart/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const period1 = req.query.period1 || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const period2 = req.query.period2 || new Date().toISOString().split('T')[0];
    const interval = req.query.interval || '1d';
    const data = await provider.chart(symbol, { period1, period2, interval });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chart/:symbol.svg', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const yahoo = getProviderByName('yahoo');
    const period1 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
    const period2 = new Date().toISOString().split('T')[0];
    const hist = await yahoo.chart(symbol, { period1, period2, interval: '1d' });
    const svg = generatePriceChartSVG(hist.quotes || [], { symbol, width: parseInt(req.query.width) || 800, height: parseInt(req.query.height) || 400 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(svg);
  } catch (e) {
    res.status(500).contentType('image/svg+xml').send('<svg><text x="10" y="30" fill="red">Chart error</text></svg>');
  }
});

// ─── Stocker (Finviz Screener + Analysis) ────────────────────────

app.get('/api/stocker/presets', (req, res) => {
  // Include Finviz reference URLs
  const presets = {};
  for (const [key, val] of Object.entries(SCREENER_PRESETS)) {
    presets[key] = { ...val, finvizUrl: `https://finviz.com/screener.ashx?v=${val.view}&f=${val.filters}&o=${val.sort}` };
  }
  res.json(presets);
});

app.get('/api/stocker/scan', async (req, res) => {
  try {
    const preset = req.query.preset || 'valueMomentum';
    const maxStocks = parseInt(req.query.maxStocks) || 20;
    const tickersQuery = req.query.tickers || null;
    const provider = getProvider(req);
    const pubProvider = getProviderByName('public');
    const result = await runScreener(preset, { provider, pubProvider, maxStocks, tickers: tickersQuery });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stocker/analyze/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const pubProvider = getProviderByName('public');
    const result = await analyzeStock(symbol, provider, pubProvider);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Algo Config Routes ──────────────────────────────────────────

app.get('/api/algo-configs', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM algo_configs ORDER BY createdAt DESC').all();
    res.json(rows.map(r => ({ ...r, params: JSON.parse(r.params) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/algo-configs/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM algo_configs WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Config not found' });
    res.json({ ...row, params: JSON.parse(row.params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/algo-configs', (req, res) => {
  try {
    const { name, algorithm, params, symbol, isDefault } = req.body;
    if (!name || !algorithm) return res.status(400).json({ error: 'name and algorithm required' });
    const stmt = db.prepare('INSERT INTO algo_configs (name, algorithm, params, symbol, isDefault) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(name, algorithm, JSON.stringify(params || {}), symbol || null, isDefault ? 1 : 0);
    const row = db.prepare('SELECT * FROM algo_configs WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ...row, params: JSON.parse(row.params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/algo-configs/:id', (req, res) => {
  try {
    const { name, algorithm, params, symbol, isDefault } = req.body;
    const fields = [];
    const values = [];
    if (name != null) { fields.push('name = ?'); values.push(name); }
    if (algorithm != null) { fields.push('algorithm = ?'); values.push(algorithm); }
    if (params != null) { fields.push('params = ?'); values.push(JSON.stringify(params)); }
    if (symbol !== undefined) { fields.push('symbol = ?'); values.push(symbol); }
    if (isDefault != null) { fields.push('isDefault = ?'); values.push(isDefault ? 1 : 0); }
    fields.push("updatedAt = datetime('now')");
    values.push(req.params.id);
    db.prepare(`UPDATE algo_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const row = db.prepare('SELECT * FROM algo_configs WHERE id = ?').get(req.params.id);
    res.json({ ...row, params: JSON.parse(row.params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/algo-configs/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM algo_configs WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Set a config as default (unsets any other default for same algorithm)
app.post('/api/algo-configs/:id/default', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM algo_configs WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Config not found' });
    db.prepare('UPDATE algo_configs SET isDefault = 0 WHERE algorithm = ?').run(row.algorithm);
    db.prepare("UPDATE algo_configs SET isDefault = 1, updatedAt = datetime('now') WHERE id = ?").run(req.params.id);
    const updated = db.prepare('SELECT * FROM algo_configs WHERE id = ?').get(req.params.id);
    res.json({ ...updated, params: JSON.parse(updated.params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Technical Indicators ──────────────────────────────────────
function sma(data, period) {
  if (data.length < period) return null;
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function ema(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let val = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    val = data[i] * k + val * (1 - k);
  }
  return val;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const recentChanges = changes.slice(-(period));
  const avgGain = recentChanges.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  const avgLoss = recentChanges.filter(c => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function macd(closes) {
  if (closes.length < 35) return null;
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  if (ema12 === null || ema26 === null) return null;
  const macdLine = ema12 - ema26;
  // Simplified signal (9-period EMA of MACD would need MACD history)
  const ema9 = ema(closes, 9);
  // Approximate signal as short-term trend direction
  const recentCloses = closes.slice(-5);
  const prevCloses = closes.slice(-10, -5);
  const recentAvg = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length;
  const prevAvg = prevCloses.reduce((a, b) => a + b, 0) / prevCloses.length;
  const crossover = recentAvg > prevAvg ? 'Bullish' : 'Bearish';
  return { macdLine: +macdLine.toFixed(4), crossover, momentum: +(recentAvg - prevAvg).toFixed(4) };
}

function stochastic(highs, lows, closes, period = 14) {
  if (closes.length < period) return null;
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const highest = Math.max(...recentHighs);
  const lowest = Math.min(...recentLows);
  const current = closes[closes.length - 1];
  if (highest === lowest) return 50;
  return +((current - lowest) / (highest - lowest) * 100).toFixed(1);
}

function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function swingPoints(highs, lows, lookback = 5) {
  const highs_idx = [], lows_idx = [];
  for (let i = lookback; i < highs.length - lookback; i++) {
    if (highs[i] === Math.max(...highs.slice(i - lookback, i + lookback + 1))) highs_idx.push(highs[i]);
    if (lows[i] === Math.min(...lows.slice(i - lookback, i + lookback + 1))) lows_idx.push(lows[i]);
  }
  return { swingHighs: highs_idx, swingLows: lows_idx };
}

function determineTrend(close, sma50, sma200, sma20) {
  if (!sma50 || !sma200) return { label: 'Neutral', score: 3 };
  if (close > sma50 && close > sma200) return { label: 'Bullish', score: 8 };
  if (close > sma50 && close < sma200) return { label: 'Neutral-Bullish', score: 5 };
  if (close < sma50 && close > sma200) return { label: 'Neutral-Bearish', score: 5 };
  if (close < sma50 && close < sma200) return { label: 'Bearish', score: 2 };
  return { label: 'Neutral', score: 3 };
}

function detectSetup(closes, highs, lows, close, sma20, sma50, swingPts) {
  const last5 = closes.slice(-5);
  const prev5 = closes.slice(-10, -5);
  const last5Range = Math.max(...last5) - Math.min(...last5);
  const prev5Range = Math.max(...prev5) - Math.min(...prev5);
  const isExpanding = prev5Range > 0 ? last5Range / prev5Range > 1.3 : false;
  const isConsolidating = close > 0 ? last5Range / close < 0.03 : false;

  const lastSwingLow = swingPts.swingLows.length > 0 ? lows[swingPts.swingLows[swingPts.swingLows.length - 1]] : null;
  const lastSwingHigh = swingPts.swingHighs.length > 0 ? highs[swingPts.swingHighs[swingPts.swingHighs.length - 1]] : null;

  // Breakout: expanding range + above 20 SMA
  if (close > sma20 && isExpanding) return { setup: 'Breakout', quality: 7 };
  // Flag / pennant: consolidating near highs
  if (close > sma20 && isConsolidating) return { setup: 'Flag', quality: 6 };
  // Retest: near last swing low (bullish) or high (bearish)
  if (lastSwingLow && Math.abs(close - lastSwingLow) / close < 0.02) return { setup: 'Retest', quality: 6 };
  if (lastSwingHigh && Math.abs(close - lastSwingHigh) / close < 0.02) return { setup: 'Retest', quality: 6 };
  // Above 50 SMA
  if (close > sma50) return { setup: 'Above 50 SMA', quality: 5 };
  // Base: tight range below 20 SMA
  if (isConsolidating) return { setup: 'Base', quality: 4 };
  return { setup: 'none', quality: 2 };
}

function computeStopLoss(close, sma50, sma20, swingPts, isBullish, atrVal) {
  const lastSwingLow = swingPts.swingLows.length > 0 ? swingPts.swingLows[swingPts.swingLows.length - 1] : null;
  const lastSwingHigh = swingPts.swingHighs.length > 0 ? swingPts.swingHighs[swingPts.swingHighs.length - 1] : null;

  if (isBullish) {
    // Below 50 SMA or prior swing low, whichever is lower; add ATR cushion
    const smaStop = sma50;
    const swingStop = lastSwingLow;
    // Use close as fallback if swing/MA values are null
    let stop = Math.min(smaStop ?? close, swingStop ?? close);
    // Sanity check: stop should not be more than 30% below current price
    if (stop < close * 0.7) stop = smaStop ?? close * 0.95;
    if (atrVal) stop = stop - atrVal * 0.5; // ATR cushion
    // Final safety: stop must be below current price for bullish
    if (stop >= close) stop = close * 0.95;
    const level = (swingStop && stop <= swingStop) ? 'Prior Swing Low' : '50 SMA';
    return { price: +stop.toFixed(2), level };
  } else {
    const smaStop = sma20;
    const swingStop = lastSwingHigh;
    let stop = Math.max(smaStop ?? close, swingStop ?? close);
    // Sanity check: stop should not be more than 30% above current price
    if (stop > close * 1.3) stop = smaStop ?? close * 1.05;
    if (atrVal) stop = stop + atrVal * 0.5;
    // Final safety: stop must be above current price for bearish
    if (stop <= close) stop = close * 1.05;
    const level = (swingStop && stop >= swingStop) ? 'Prior Swing High' : '20 SMA';
    return { price: +stop.toFixed(2), level };
  }
}

// (oiIvEdge removed — was inlined into scanner logic)

function scoreTrend(trendLabel, smaAligned, setupQuality, rsiVal, macdCrossover) {
  let s = 0;
  // Trend direction (0-4)
  if (trendLabel === 'Bullish' || trendLabel === 'Bearish') s += 4;
  else if (trendLabel === 'Neutral-Bullish' || trendLabel === 'Neutral-Bearish') s += 2;
  else s += 1;
  // SMA alignment (0-2)
  if (smaAligned) s += 2;
  // Setup quality (0-3)
  s += Math.min(3, Math.floor(setupQuality / 2.5));
  // RSI bonus (0-1): pullback zone is ideal
  if (rsiVal !== null) {
    if (rsiVal >= 40 && rsiVal <= 60) s += 1; // Neutral zone = good entry
  }
  // MACD alignment (0-1)
  if (macdCrossover === 'Bullish' && (trendLabel === 'Bullish' || trendLabel === 'Neutral-Bullish')) s += 1;
  if (macdCrossover === 'Bearish' && (trendLabel === 'Bearish')) s += 1;
  return Math.min(10, Math.max(0, s));
}

function scoreLiquidity(oi, volume, bid, ask) {
  let s = 0;
  if (oi >= 5000) s += 3; else if (oi >= 500) s += 2; else if (oi >= 10) s += 1;
  if (volume >= 1000) s += 3; else if (volume >= 100) s += 2; else if (volume >= 10) s += 1;
  if (bid && ask && bid > 0 && ask > 0) {
    const mid = (bid + ask) / 2;
    const spread = mid > 0 ? (ask - bid) / mid : 1;
    if (spread <= 0.03) s += 4; else if (spread <= 0.07) s += 2; else if (spread <= 0.15) s += 1;
  } else {
    // No bid/ask (pre-market/stale) — give partial liquidity score based on OI/volume only
    s += 1; // minimal spread score
  }
  return Math.min(10, Math.max(0, s));
}

function scoreRR(rr) {
  if (rr >= 3) return 10;
  if (rr >= 2.5) return 9;
  if (rr >= 2) return 8;
  if (rr >= 1.5) return 5;
  if (rr >= 1) return 3;
  return 0;
}

function classifyStrategy(delta, isBullish, isItm, dte) {
  if (dte > 180) return 'LEAPS';
  if (dte > 90) return 'Swing (Long DTE)';
  if (isItm) return isBullish ? 'Long Call (ITM)' : 'Long Put (ITM)';
  if (delta >= 0.50) return isBullish ? 'Long Call (ATM)' : 'Long Put (ATM)';
  return isBullish ? 'Long Call (OTM)' : 'Long Put (OTM)';
}

function buildTechnicalReason(r, trendLabel, setup, rsiVal, macdCross, smaAligned, stochasticVal, adxVal) {
  const parts = [];
  if (trendLabel === 'Bullish') parts.push('Price > 50 & 200 SMA');
  else if (trendLabel === 'Bearish') parts.push('Price < 50 & 200 SMA');
  else if (trendLabel === 'Neutral-Bullish') parts.push('Price > 50 SMA, < 200 SMA');
  else parts.push('Mixed SMA signals');

  if (smaAligned) parts.push('SMAs aligned');
  if (macdCross === 'Bullish') parts.push('MACD bullish cross');
  if (macdCross === 'Bearish') parts.push('MACD bearish cross');
  if (rsiVal !== null) {
    if (rsiVal < 30) parts.push(`RSI ${rsiVal} oversold`);
    else if (rsiVal > 70) parts.push(`RSI ${rsiVal} overbought`);
    else if (rsiVal >= 40 && rsiVal <= 60) parts.push(`RSI ${rsiVal} pullback zone`);
  }
  if (setup && setup !== 'none') parts.push(setup);
  if (stochasticVal !== null && stochasticVal < 20) parts.push('Stoch oversold');
  if (stochasticVal !== null && stochasticVal > 80) parts.push('Stoch overbought');
  if (adxVal !== null && adxVal > 25) parts.push('Strong trend (ADX)');
  return parts.join('; ') || 'No clear setup';
}

// ─── Provider Health / Status ──────────────────────────────────
app.get('/api/provider-status', async (req, res) => {
  const results = {
    yahoo: { ok: true, label: 'Yahoo Finance', capabilities: ['quotes', 'options', 'history', 'scanner'] },
    finnhub: { ok: false, label: 'Finnhub', capabilities: [] },
    alphavantage: { ok: false, label: 'Alpha Vantage', capabilities: [] },
    public: { ok: false, label: 'Public.com', capabilities: [] },
  };

  // Check each provider
  for (const name of getProviderNames()) {
    const p = getProviderByName(name);
    try {
      const h = await p.healthCheck();
      let optionsOk = false;
      // Skip options chain check for Finnhub — free tier has no access
      if (name !== 'finnhub') {
        try { await p.optionsChain('SPY'); optionsOk = true; } catch { /* no access */ }
      }
      const caps = ['quotes'];
      if (name === 'finnhub') caps.push('news', 'profile');
      if (name === 'alphavantage') caps.push('history', 'news', 'fundamentals', 'technicals');
      if (name === 'public') { caps.push('account', 'instruments', 'greeks', 'strategy-quote', 'bars-v2', 'portfolio', 'history'); }
      if (optionsOk) { caps.push('options'); if (name !== 'finnhub') caps.push('scanner'); }
      results[name] = { ok: h.ok, label: h.label || results[name]?.label, error: h.error, capabilities: caps, optionsAccess: optionsOk };
      if (h.price) results[name].price = h.price;
      if (h.accountId) results[name].accountId = h.accountId;
    } catch (e) {
      results[name] = { ...results[name], ok: false, error: e.message };
    }
  }
  res.json(results);

});

// Specific routes BEFORE parameterized :symbol routes to prevent shadowing
app.get('/api/predict/models', (req, res) => {
  res.json(listModels());
});

app.get('/api/predict/models/:symbol', (req, res) => {
  const info = getModelInfo(req.params.symbol.toUpperCase());
  if (!info) return res.status(404).json({ error: 'No trained model for this symbol' });
  res.json(info);
});

app.get('/api/predict/config', (req, res) => {
  res.json(PREDICT_CONFIG);
});

app.get('/api/predict/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const result = await predictNextDay(symbol, provider);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/predict/:symbol/forecast', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const days = parseInt(req.query.days) || 5;
    const result = await forecast(symbol, provider, days);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── LSTM Prediction Endpoints ─────────────────────────────────
app.post('/api/predict/train/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const provider = getProvider(req);
    const config = req.body || {};
    const result = await trainModel(symbol, provider, config);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── ML Algorithm Endpoints ─────────────────────────────────────────

// Get available algorithms and their configurable params
app.get('/api/algorithms', (req, res) => {
  res.json(ALGORITHM_CONFIGS);
});

// Train a specific algorithm on a symbol
app.post('/api/algorithms/train/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const algorithm = req.body.algorithm || req.query.algorithm || 'svm';
    const params = req.body.params || req.query.params || {};
    const provider = getProvider(req);
    const result = await trainAlgorithm(symbol, provider, algorithm, params);
    res.json({
      symbol,
      algorithm,
      trainedAt: result.trainedAt,
      trainAccuracy: result.trainAccuracy,
      testAccuracy: result.testAccuracy,
      trainSize: result.trainSize,
      testSize: result.testSize,
      supportVectors: result.supportVectors,
      loss: result.loss,
      valLoss: result.valLoss,
    });
  } catch (e) {
    console.error(`[ALGO] Train error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Predict using a specific algorithm
app.get('/api/algorithms/predict/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const algorithm = req.query.algorithm || 'svm';
    const provider = getProvider(req);

    if (algorithm === 'ensemble') {
      const weights = {
        svm: parseFloat(req.query.svmWeight) || 0.3,
        lstm: parseFloat(req.query.lstmWeight) || 0.4,
        rf: parseFloat(req.query.rfWeight) || 0.3,
      };
      const result = await predictEnsemble(symbol, provider, weights);
      return res.json(result);
    }

    const result = await predictAlgorithm(symbol, provider, algorithm);
    res.json(result);
  } catch (e) {
    console.error(`[ALGO] Predict error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Specific routes BEFORE parameterized routes
app.get('/api/algorithms/models', (req, res) => {
  res.json(listAllModels());
});

app.get('/api/algorithms/models/:symbol/:algorithm', (req, res) => {
  const info = getAlgorithmModelInfo(req.params.symbol.toUpperCase(), req.params.algorithm);
  if (!info) return res.status(404).json({ error: `No ${req.params.algorithm} model for ${req.params.symbol}` });
  res.json(info);
});

// ─── Scan History ───────────────────────────────────────────────
app.get('/api/scanner/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const rows = db.prepare('SELECT * FROM scan_history ORDER BY scanDate DESC LIMIT ?').all(limit);
  res.json(rows);
});

// ─── S&P 500 & Cache Endpoints ───────────────────────────────────
app.get('/api/sp500', (req, res) => {
  const { sector } = req.query;
  const tickers = Cache.getSP500Tickers({ sector });
  res.json({ count: tickers.length, tickers });
});

app.get('/api/sp500/etfs', (req, res) => {
  res.json({ etfs: TOP_10_ETFS, count: TOP_10_ETFS.length });
});

app.post('/api/sp500/refresh', async (req, res) => {
  try {
    const sectorMap = {};
    for (const [sector, tickers] of Object.entries(SP500_SECTORS)) {
      for (const t of tickers) sectorMap[t] = sector;
    }
    const count = Cache.upsertSP500(SP500_UNIQUE, sectorMap);
    res.json({ refreshed: true, count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cache/stats', (req, res) => {
  const stats = Cache.getCacheStats();
  res.json(stats);
});

app.post('/api/cache/cleanup', (req, res) => {
  const results = Cache.cleanupStaleCache();
  res.json({ cleaned: results });
});

// ─── Serve static frontend ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.use(express.static(path.join(__dirname, 'public'))); // Analysis page

// ─── SPA fallback (serve index.html for non-API routes) ───
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// ─── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Options Scanner API on port ${PORT} (SQLite DB: ${path.join(__dirname, 'scanner.db')})`));