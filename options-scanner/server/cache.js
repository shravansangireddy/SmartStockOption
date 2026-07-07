/**
 * Database Cache Layer for Options Scanner
 * 
 * Provides TTL-based caching for:
 * - S&P 500 tickers (stored permanently)
 * - Price history (daily OHLCV)
 * - Options chain snapshots
 * - Technical indicator results
 * - Scan results (stocker + swing scanner)
 * - Finviz screener results
 * - Market snapshots
 * 
 * Cache Strategy:
 * - Price history: Refresh daily (stale after market close)
 * - Options chains: Refresh every 5 minutes (intraday moves)
 * - Technical indicators: Refresh every 15 minutes
 * - Scan results: Refresh every 10 minutes
 * - Finviz results: Refresh every 30 minutes
 * - Market snapshot: Refresh every 60 seconds
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'scanner.db');

let _db = null;

export function getDb() {
  if (!_db) {
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');
    _db.pragma('cache_size = -64000'); // 64MB cache
    _db.pragma('temp_store = MEMORY');
    initTables(_db);
  }
  return _db;
}

function initTables(db) {
  db.exec(`
    -- S&P 500 tickers (persistent reference data)
    CREATE TABLE IF NOT EXISTS sp500_tickers (
      ticker TEXT PRIMARY KEY,
      name TEXT,
      sector TEXT,
      industry TEXT,
      marketCap REAL,
      weight REAL,
      hasOptions INTEGER DEFAULT 1,
      updated TEXT DEFAULT (datetime('now'))
    );

    -- Daily price history cache
    CREATE TABLE IF NOT EXISTS price_history (
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER,
      PRIMARY KEY (symbol, date)
    );
    CREATE INDEX IF NOT EXISTS idx_price_symbol ON price_history(symbol);
    CREATE INDEX IF NOT EXISTS idx_price_date ON price_history(date);

    -- Options chain snapshots (cached with TTL)
    CREATE TABLE IF NOT EXISTS option_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      fetchedAt TEXT DEFAULT (datetime('now')),
      chainJson TEXT NOT NULL,
      underlyingPrice REAL,
      dte INTEGER,
      UNIQUE(symbol, expiry, fetchedAt)
    );
    CREATE INDEX IF NOT EXISTS idx_option_chains_symbol ON option_chains(symbol);
    CREATE INDEX IF NOT EXISTS idx_option_chains_fetched ON option_chains(fetchedAt);

    -- Technical indicators cache
    CREATE TABLE IF NOT EXISTS technical_indicators (
      symbol TEXT PRIMARY KEY,
      date TEXT DEFAULT (datetime('now')),
      sma20 REAL, sma50 REAL, sma200 REAL,
      rsi REAL, atr REAL, macdLine REAL,
      bollingerUpper REAL, bollingerMiddle REAL, bollingerLower REAL,
      bollingerBandwidth REAL, bollingerPercentB REAL,
      stochasticK REAL, stochasticD REAL,
      trend TEXT,
      avgVolume REAL, relativeVolume REAL,
      high52w REAL, low52w REAL,
      pctFrom52wHigh REAL, pctFrom52wLow REAL,
      totalScore INTEGER,
      signal TEXT
    );

    -- Scan results cache (stocker multi-factor)
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scanDate TEXT DEFAULT (datetime('now')),
      preset TEXT,
      resultsJson TEXT NOT NULL,
      stockCount INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_scan_date ON scan_results(scanDate);

    -- Finviz screener cache
    CREATE TABLE IF NOT EXISTS finviz_cache (
      preset TEXT PRIMARY KEY,
      fetchedAt TEXT DEFAULT (datetime('now')),
      resultsJson TEXT NOT NULL
    );

    -- Market snapshot cache
    CREATE TABLE IF NOT EXISTS market_snapshot_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fetchedAt TEXT DEFAULT (datetime('now')),
      snapshotJson TEXT NOT NULL
    );

    -- Quote cache (per symbol)
    CREATE TABLE IF NOT EXISTS quote_cache (
      symbol TEXT PRIMARY KEY,
      fetchedAt TEXT DEFAULT (datetime('now')),
      quoteJson TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quote_fetched ON quote_cache(fetchedAt);

    -- IV analysis cache
    CREATE TABLE IF NOT EXISTS iv_analysis_cache (
      symbol TEXT PRIMARY KEY,
      fetchedAt TEXT DEFAULT (datetime('now')),
      analysisJson TEXT NOT NULL
    );
  `);

  // Migrate: add columns if they don't exist
  try {
    const cols = db.prepare("PRAGMA table_info(sp500_tickers)").all().map(c => c.name);
    if (!cols.includes('hasOptions')) {
      db.exec('ALTER TABLE sp500_tickers ADD COLUMN hasOptions INTEGER DEFAULT 1');
    }
  } catch (e) { /* column may already exist */ }
}

// ─── TTL Helpers ────────────────────────────────────────────────

const TTL = {
  PRICE_HISTORY: 24 * 60 * 60 * 1000,    // 24 hours (refresh daily)
  OPTIONS_CHAIN: 5 * 60 * 1000,           // 5 minutes
  TECHNICAL_INDICATORS: 15 * 60 * 1000,    // 15 minutes
  SCAN_RESULTS: 10 * 60 * 1000,            // 10 minutes
  FINVIZ_CACHE: 30 * 60 * 1000,            // 30 minutes
  MARKET_SNAPSHOT: 60 * 1000,              // 60 seconds
  QUOTE: 30 * 1000,                        // 30 seconds
  IV_ANALYSIS: 15 * 60 * 1000,            // 15 minutes
};

function isStale(fetchedAt, ttlMs) {
  if (!fetchedAt) return true;
  const fetched = new Date(fetchedAt + 'Z').getTime();
  return (Date.now() - fetched) > ttlMs;
}

// ─── S&P 500 Tickers ────────────────────────────────────────────

export function upsertSP500(tickers, sectorMap = {}) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO sp500_tickers (ticker, sector, hasOptions, updated)
    VALUES (?, ?, 1, datetime('now'))
  `);
  const batch = db.transaction((items) => {
    for (const item of items) {
      const sector = sectorMap[item] || (TOP_10_ETF_LIST.includes(item) ? 'ETFs' : null);
      insert.run(item, sector);
    }
  });
  batch(tickers);
  return tickers.length;
}

export function getSP500Tickers({ sector = null, hasOptions = true } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM sp500_tickers WHERE 1=1';
  const params = [];
  if (sector) { query += ' AND sector = ?'; params.push(sector); }
  if (hasOptions) { query += ' AND hasOptions = 1'; }
  query += ' ORDER BY ticker';
  return db.prepare(query).all(...params);
}

export function getSP500TickerList({ sector = null } = {}) {
  const rows = getSP500Tickers({ sector });
  return rows.map(r => r.ticker);
}

export function getSP500Count() {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) as count FROM sp500_tickers').get().count;
}

// ─── Price History Cache ─────────────────────────────────────────

export function cachePriceHistory(symbol, quotes) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO price_history (symbol, date, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const batch = db.transaction((items) => {
    for (const q of items) {
      if (q.date && q.close != null) {
        insert.run(symbol, q.date, q.open, q.high, q.low, q.close, q.volume);
      }
    }
  });
  batch(quotes);
}

export function getCachedPriceHistory(symbol, { minDate = null, maxDate = null } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM price_history WHERE symbol = ?';
  const params = [symbol];
  if (minDate) { query += ' AND date >= ?'; params.push(minDate); }
  if (maxDate) { query += ' AND date <= ?'; params.push(maxDate); }
  query += ' ORDER BY date ASC';
  return db.prepare(query).all(...params);
}

export function getPriceHistoryFreshness(symbol) {
  const db = getDb();
  const row = db.prepare('SELECT MAX(date) as latest FROM price_history WHERE symbol = ?').get(symbol);
  return row?.latest || null;
}

// ─── Options Chain Cache ─────────────────────────────────────────

export function cacheOptionChain(symbol, expiry, chainData) {
  const db = getDb();
  // Delete old entries for same symbol+expiry beyond TTL
  db.prepare(`DELETE FROM option_chains WHERE symbol = ? AND expiry = ? AND fetchedAt < datetime('now', '-10 minutes')`).run(symbol, expiry);
  
  db.prepare(`
    INSERT INTO option_chains (symbol, expiry, fetchedAt, chainJson, underlyingPrice, dte)
    VALUES (?, ?, datetime('now'), ?, ?, ?)
  `).run(symbol, expiry, JSON.stringify(chainData), chainData.underlyingPrice || null, chainData.dte || null);
}

export function getCachedOptionChain(symbol, expiry) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM option_chains 
    WHERE symbol = ? AND expiry = ? AND fetchedAt > datetime('now', '-5 minutes')
    ORDER BY fetchedAt DESC LIMIT 1
  `).get(symbol, expiry);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.chainJson), _cached: true, _cachedAt: row.fetchedAt };
  } catch { return null; }
}

// ─── Technical Indicators Cache ──────────────────────────────────

export function cacheTechnicalIndicators(symbol, data) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO technical_indicators 
    (symbol, date, sma20, sma50, sma200, rsi, atr, macdLine, 
     bollingerUpper, bollingerMiddle, bollingerLower, bollingerBandwidth, bollingerPercentB,
     stochasticK, stochasticD, trend, avgVolume, relativeVolume,
     high52w, low52w, pctFrom52wHigh, pctFrom52wLow, totalScore, signal)
    VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    symbol, data.sma20, data.sma50, data.sma200, data.rsi, data.atr, data.macdLine,
    data.bollingerUpper, data.bollingerMiddle, data.bollingerLower, data.bollingerBandwidth, data.bollingerPercentB,
    data.stochasticK, data.stochasticD, data.trend, data.avgVolume, data.relativeVolume,
    data.high52w, data.low52w, data.pctFrom52wHigh, data.pctFrom52wLow, data.totalScore, data.signal
  );
}

export function getCachedTechnicalIndicators(symbol) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM technical_indicators 
    WHERE symbol = ? AND date > datetime('now', '-15 minutes')
  `).get(symbol);
  return row || null;
}

// ─── Scan Results Cache ──────────────────────────────────────────

export function cacheScanResults(preset, results) {
  const db = getDb();
  // Delete old results for same preset
  db.prepare(`DELETE FROM scan_results WHERE preset = ? AND scanDate < datetime('now', '-30 minutes')`).run(preset);
  
  db.prepare(`
    INSERT INTO scan_results (scanDate, preset, resultsJson, stockCount)
    VALUES (datetime('now'), ?, ?, ?)
  `).run(preset, JSON.stringify(results), results.stocks?.length || 0);
}

export function getCachedScanResults(preset) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM scan_results 
    WHERE preset = ? AND scanDate > datetime('now', '-10 minutes')
    ORDER BY scanDate DESC LIMIT 1
  `).get(preset);
  if (!row) return null;
  try {
    return { ...JSON.parse(row.resultsJson), _cached: true, _cachedAt: row.scanDate };
  } catch { return null; }
}

// ─── Finviz Cache ────────────────────────────────────────────────

export function cacheFinvizResults(preset, results) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO finviz_cache (preset, fetchedAt, resultsJson)
    VALUES (?, datetime('now'), ?)
  `).run(preset, JSON.stringify(results));
}

export function getCachedFinvizResults(preset) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM finviz_cache 
    WHERE preset = ? AND fetchedAt > datetime('now', '-30 minutes')
  `).get(preset);
  if (!row) return null;
  try { return JSON.parse(row.resultsJson); } catch { return null; }
}

// ─── Market Snapshot Cache ────────────────────────────────────────

export function cacheMarketSnapshot(snapshot) {
  const db = getDb();
  db.prepare(`DELETE FROM market_snapshot_cache WHERE fetchedAt < datetime('now', '-2 minutes')`).run();
  db.prepare(`
    INSERT INTO market_snapshot_cache (fetchedAt, snapshotJson)
    VALUES (datetime('now'), ?)
  `).run(JSON.stringify(snapshot));
}

export function getCachedMarketSnapshot() {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM market_snapshot_cache 
    WHERE fetchedAt > datetime('now', '-60 seconds')
    ORDER BY fetchedAt DESC LIMIT 1
  `).get();
  if (!row) return null;
  try { return { ...JSON.parse(row.snapshotJson), _cached: true }; } catch { return null; }
}

// ─── Quote Cache ─────────────────────────────────────────────────

export function cacheQuote(symbol, quote) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO quote_cache (symbol, fetchedAt, quoteJson)
    VALUES (?, datetime('now'), ?)
  `).run(symbol, JSON.stringify(quote));
}

export function getCachedQuote(symbol) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM quote_cache 
    WHERE symbol = ? AND fetchedAt > datetime('now', '-30 seconds')
  `).get(symbol);
  if (!row) return null;
  try { return { ...JSON.parse(row.quoteJson), _cached: true }; } catch { return null; }
}

// ─── IV Analysis Cache ───────────────────────────────────────────

export function cacheIVAnalysis(symbol, analysis) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO iv_analysis_cache (symbol, fetchedAt, analysisJson)
    VALUES (?, datetime('now'), ?)
  `).run(symbol, JSON.stringify(analysis));
}

export function getCachedIVAnalysis(symbol) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM iv_analysis_cache 
    WHERE symbol = ? AND fetchedAt > datetime('now', '-15 minutes')
  `).get(symbol);
  if (!row) return null;
  try { return { ...JSON.parse(row.analysisJson), _cached: true }; } catch { return null; }
}

// ─── Cache Stats & Cleanup ────────────────────────────────────────

export function getCacheStats() {
  const db = getDb();
  const tables = ['sp500_tickers', 'price_history', 'option_chains', 'technical_indicators', 
                   'scan_results', 'finviz_cache', 'market_snapshot_cache', 'quote_cache', 'iv_analysis_cache'];
  const stats = {};
  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
      stats[table] = count;
    } catch { stats[table] = 0; }
  }
  return stats;
}

export function cleanupStaleCache() {
  const db = getDb();
  const cutoffs = {
    option_chains: '-1 hour',
    technical_indicators: '-1 day',
    scan_results: '-1 day',
    finviz_cache: '-1 day',
    market_snapshot_cache: '-5 minutes',
    quote_cache: '-5 minutes',
    iv_analysis_cache: '-1 day',
  };
  const results = {};
  for (const [table, cutoff] of Object.entries(cutoffs)) {
    try {
      const result = db.prepare(`DELETE FROM ${table} WHERE fetchedAt < datetime('now', ?)`).run(cutoff);
      results[table] = result.changes;
    } catch { results[table] = 0; }
  }
  // Also clean old price history (keep 2 years)
  try {
    const result = db.prepare(`DELETE FROM price_history WHERE date < date('now', '-2 years')`).run();
    results.price_history = result.changes;
  } catch { results.price_history = 0; }
  return results;
}

// ─── ETF Helpers ──────────────────────────────────────────────────

const TOP_10_ETF_LIST = ['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'XLK', 'XLF', 'XLE', 'VWO'];

export function getTop10ETFs() {
  return TOP_10_ETF_LIST;
}

export function isETF(symbol) {
  return TOP_10_ETF_LIST.includes(symbol);
}

export default {
  getDb, TTL,
  upsertSP500, getSP500Tickers, getSP500TickerList, getSP500Count,
  cachePriceHistory, getCachedPriceHistory, getPriceHistoryFreshness,
  cacheOptionChain, getCachedOptionChain,
  cacheTechnicalIndicators, getCachedTechnicalIndicators,
  cacheScanResults, getCachedScanResults,
  cacheFinvizResults, getCachedFinvizResults,
  cacheMarketSnapshot, getCachedMarketSnapshot,
  cacheQuote, getCachedQuote,
  cacheIVAnalysis, getCachedIVAnalysis,
  getCacheStats, cleanupStaleCache,
  getTop10ETFs, isETF,
};