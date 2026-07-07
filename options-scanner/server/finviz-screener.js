/**
 * Finviz Screener Scraper
 * 
 * Fetches stock lists from Finviz screener URLs, parses the results,
 * and returns tickers that match the filter criteria.
 * 
 * Uses cheerio for HTML parsing.
 */

import * as cheerio from 'cheerio';

const FINVIZ_BASE = 'https://finviz.com/screener.ashx';

// Column mapping for Finviz view 111 (default columns)
const VIEW_111_COLUMNS = [
  'number', 'ticker', 'company', 'sector', 'industry',
  'country', 'marketCap', 'peRatio', 'price', 'change',
  'volume', 'changePercent',
];

// Extended columns for view 131 (institutional)
const VIEW_131_COLUMNS = [
  'number', 'ticker', 'company', 'sector', 'industry',
  'country', 'marketCap', 'peRatio', 'price', 'change',
  'changePercent', 'volume', 'relativeVolume',
  'instOwn', 'instTrans', 'instTransPct',
];

// Full columns for view 411 (detailed)
const VIEW_411_COLUMNS = [
  'number', 'ticker', 'company', 'sector', 'industry',
  'country', 'marketCap', 'peRatio', 'forwardPE', 'pegRatio',
  'epsThisY', 'epsNextY', 'epsPast5Y', 'epsNext5Y',
  'salesPast5Y', 'price', 'change', 'changePercent',
  'volume', 'relativeVolume', 'debtEq',
];

const COLUMN_MAP = {
  111: VIEW_111_COLUMNS,
  131: VIEW_131_COLUMNS,
  411: VIEW_411_COLUMNS,
};

export async function scrapeFinvizScreener(preset) {
  const url = finvizScreenerUrl(preset);
  console.log(`[FINVIZ] Scraping: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Finviz returned ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseFinvizHTML(html, preset.view || 111);
  } catch (e) {
    console.error(`[FINVIZ] Scrape failed: ${e.message}`);
    throw e;
  }
}

function finvizScreenerUrl(preset) {
  const params = new URLSearchParams();
  params.set('v', preset.view || 111);
  params.set('f', preset.filters);
  if (preset.ft) params.set('ft', preset.ft);
  params.set('o', preset.sort);
  return `${FINVIZ_BASE}?${params.toString()}`;
}

function parseFinvizHTML(html, viewCode) {
  const $ = cheerio.load(html);
  const columns = COLUMN_MAP[viewCode] || COLUMN_MAP[111];
  const stocks = [];

  // Finviz screener table is in a table with class 'screener_table'
  // or just find the data table
  const rows = $('table.screener_table tbody tr, table.table-light tr').toArray();
  
  if (rows.length === 0) {
    // Try alternative: find all tables and pick the one with stock data
    $('table').each((i, table) => {
      const rowLen = $(table).find('tr').length;
      if (rowLen > 5) {
        $(table).find('tr').each((j, row) => {
          const cells = $(row).find('td').toArray();
          if (cells.length >= 3) {
            const ticker = $(cells[1]).text().trim();
            if (ticker && /^[A-Z]{1,5}$/.test(ticker) && ticker !== 'Ticker') {
              const stock = { ticker };
              columns.forEach((col, idx) => {
                if (idx < cells.length) {
                  stock[col] = $(cells[idx]).text().trim();
                }
              });
              // Parse numeric fields
              stock.price = parseNum(stock.price);
              stock.changePercent = parsePercent(stock.changePercent);
              stock.change = parseNum(stock.change);
              stock.volume = parseVolume(stock.volume);
              stock.marketCap = stock.marketCap || null;
              stock.peRatio = parseNum(stock.peRatio);
              if (stock.relativeVolume) stock.relativeVolume = parseNum(stock.relativeVolume);
              if (stock.debtEq) stock.debtEq = parseNum(stock.debtEq);
              if (stock.instOwn) stock.instOwn = parsePercent(stock.instOwn);
              if (stock.instTrans) stock.instTrans = stock.instTrans;
              stocks.push(stock);
            }
          }
        });
      }
    });
  } else {
    rows.forEach((row) => {
      const cells = $(row).find('td').toArray();
      if (cells.length >= 3) {
        const ticker = $(cells[1]).text().trim();
        if (ticker && /^[A-Z]{1,5}$/.test(ticker) && ticker !== 'Ticker') {
          const stock = { ticker };
          columns.forEach((col, idx) => {
            if (idx < cells.length) {
              stock[col] = $(cells[idx]).text().trim();
            }
          });
          stock.price = parseNum(stock.price);
          stock.changePercent = parsePercent(stock.changePercent);
          stock.change = parseNum(stock.change);
          stock.volume = parseVolume(stock.volume);
          stock.marketCap = stock.marketCap || null;
          stock.peRatio = parseNum(stock.peRatio);
          if (stock.relativeVolume) stock.relativeVolume = parseNum(stock.relativeVolume);
          if (stock.debtEq) stock.debtEq = parseNum(stock.debtEq);
          if (stock.instOwn) stock.instOwn = parsePercent(stock.instOwn);
          if (stock.instTrans) stock.instTrans = stock.instTrans;
          stocks.push(stock);
        }
      }
    });
  }

  // Deduplicate by ticker
  const seen = new Set();
  const unique = stocks.filter(s => {
    if (seen.has(s.ticker)) return false;
    seen.add(s.ticker);
    return true;
  });

  console.log(`[FINVIZ] Parsed ${unique.length} stocks from Finviz screener`);
  return unique;
}

function parseNum(str) {
  if (!str || str === '-') return null;
  const num = parseFloat(str.replace(/[,$%]/g, ''));
  return isNaN(num) ? null : num;
}

function parsePercent(str) {
  if (!str || str === '-') return null;
  const num = parseFloat(str.replace(/[,%]/g, ''));
  return isNaN(num) ? null : num;
}

function parseVolume(str) {
  if (!str || str === '-') return null;
  str = str.trim().toUpperCase();
  if (str.endsWith('M')) return parseFloat(str) * 1e6;
  if (str.endsWith('B')) return parseFloat(str) * 1e9;
  if (str.endsWith('K')) return parseFloat(str) * 1e3;
  const num = parseFloat(str.replace(/[,$]/g, ''));
  return isNaN(num) ? null : num;
}

export default { scrapeFinvizScreener, finvizScreenerUrl };