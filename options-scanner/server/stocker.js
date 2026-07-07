/**
 * Stocker — Self-Contained Stock Screener
 *
 * Uses Finviz screener for stock filtering + Yahoo for real-time data,
 * computes technical indicators (SMA, RSI, MACD, ATR, Bollinger),
 * and ranks stocks using a multi-factor scoring model.
 */

import { scrapeFinvizScreener } from './finviz-screener.js';

// ─── Yahoo Finance Screener Lists ────────────────────────────────
// Curated lists per preset for Yahoo-based screening when Finviz fails
const YAHOO_SCREENER_LISTS = {
  valueMomentum: [
    'AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'META', 'AVGO', 'COST', 'ADBE', 'CRM',
    'NFLX', 'AMD', 'INTC', 'QCOM', 'TXN', 'PYPL', 'SBUX', 'LULU', 'DLTR', 'ROST',
    'BKNG', 'ISRG', 'IDXX', 'WDAY', 'ZS', 'CRWD', 'PANW', 'MNST', 'CHTR', 'CMCSA',
    'LLY', 'UNH', 'JNJ', 'ABBV', 'MRK', 'TMO', 'ABT', 'MDLZ', 'CL', 'PEP',
    'V', 'MA', 'JPM', 'BAC', 'GS', 'BLK', 'AXP', 'COF', 'SCHW', 'CB'
  ],
  smallCapBreakout: [
    'RIVN', 'SOFI', 'LCID', 'PLTR', 'AFRM', 'RBLX', 'BURL', 'ONDS', 'CRSP', 'PATH',
    'U', 'ZI', 'DNA', 'OPEN', 'UPST', 'MQ', 'BILL', 'HUBS', 'ZS', 'CRWD',
    'PANW', 'DDOG', 'NET', 'MDB', 'TTD', 'PINS', 'SNAP', 'RDK', 'SHOP', 'SE',
    'SQ', 'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'HUT', 'BTBT', 'CAN', 'HIVE'
  ],
  midCapInstAccum: [
    'LULU', 'DLTR', 'ROST', 'BKNG', 'ISRG', 'IDXX', 'WDAY', 'ZS', 'CRWD', 'PANW',
    'MNST', 'CHTR', 'CMCSA', 'LLY', 'UNH', 'ABBV', 'TMO', 'ABT', 'MDLZ', 'CL',
    'V', 'MA', 'BLK', 'AXP', 'COF', 'SCHW', 'CB', 'ADP', 'GILD', 'REGN',
    'VRTX', 'MRNA', 'BIIB', 'ILMN', 'Illumina', 'ALGN', 'VEEV', 'TTD', 'MDB', 'ZI'
  ],
  instMomentum: [
    'AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'META', 'AVGO', 'TSLA', 'NFLX', 'AMD',
    'CRM', 'ADBE', 'NOW', 'SNOW', 'DDOG', 'NET', 'ZS', 'CRWD', 'PANW', 'MDB',
    'V', 'MA', 'JPM', 'GS', 'BLK', 'UNH', 'LLY', 'TMO', 'ABBV', 'MRK',
    'COST', 'BKNG', 'ISRG', 'IDXX', 'RIVN', 'COIN', 'SHOP', 'SQ', 'MSTR', 'PLTR'
  ]
};

async function getYahooScreenerList(presetName, provider, maxStocks) {
  const tickers = YAHOO_SCREENER_LISTS[presetName] || YAHOO_SCREENER_LISTS.valueMomentum;
  // Shuffle to avoid always same order, then limit
  const shuffled = tickers.sort(() => Math.random() - 0.5);
  // Take up to maxStocks, but try to get real data first
  const candidates = shuffled.slice(0, Math.min(maxStocks * 2, tickers.length));
  
  // Fetch quotes for all candidates to filter by price and volume
  const results = [];
  const batchSize = 5;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, Math.min(i + batchSize, candidates.length));
    const quotes = await Promise.allSettled(
      batch.map(t => provider.quote(t).then(q => ({ ticker: t, ...q })).catch(e => ({ ticker: t, error: e.message })))
    );
    for (const q of quotes) {
      if (q.status === 'fulfilled' && q.value && !q.value.error && q.value.price > 5 && (q.value.volume || 0) > 100000) {
        results.push(q.value);
      }
    }
  }
  
  // Sort by volume (proxy for liquidity) and return top maxStocks
  results.sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return results.slice(0, maxStocks).map(r => r.ticker);
}


// ─── Finviz URL Generator ─────────────────────────────────────
export const SCREENER_PRESETS = {
  valueMomentum: {
    name: 'Value Momentum',
    description: 'Low debt/equity, low P/B & P/E, high ROE, above all SMAs, high relative volume',
    filters: 'fa_debteq_u1,fa_pb_u3,fa_pe_u25,fa_roe_o10,geo_usa,sh_avgvol_o500,sh_price_o10,sh_relvol_o1.5,ta_sma20_pa,ta_sma200_pa,ta_sma50_pa',
    view: 111,
    sort: '-relativevolume',
    ft: 2,
  },
  smallCapBreakout: {
    name: 'Small Cap Breakout',
    description: 'Small caps with new 50-day highs, above SMA50, high relative volume, ATR > $1',
    filters: 'cap_small,sh_avgvol_o300,sh_price_o5,sh_relvol_o1,ta_averagetruerange_o1,ta_highlow50d_nh,ta_sma50_pa',
    view: 111,
    sort: '-change',
    ft: 2,
  },
  midCapInstAccum: {
    name: 'Mid Cap Institutional Accumulation',
    description: 'Mid caps with high institutional ownership, positive institutional transactions, new 50d highs',
    filters: 'cap_mid,sh_avgvol_o300,sh_price_o5,sh_relvol_o1,ta_averagetruerange_o1,ta_highlow50d_nh,ta_sma50_pa,sh_instown_o50,sh_insttrans_positive',
    view: 131,
    sort: '-insttrans',
    ft: 2,
  },
  instMomentum: {
    name: 'Institutional Momentum',
    description: 'High institutional ownership, positive transactions, new 50d highs, above SMA50',
    filters: 'sh_avgvol_o300,sh_instown_o50,sh_price_o5,sh_relvol_o1,ta_averagetruerange_o1,ta_highlow50d_nh,ta_sma50_pa',
    view: 131,
    sort: '-relativevolume,-insttrans',
    ft: 2,
  },
};

export function finvizUrl(preset) {
  const ft = preset.ft ? `&ft=${preset.ft}` : '';
  return `https://finviz.com/screener.ashx?v=${preset.view}&f=${preset.filters}${ft}&o=${preset.sort}`;
}

// ─── Technical Indicators ──────────────────────────────────────

function calcSMA(arr, period) {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(arr, period) {
  if (arr.length < period) return null;
  const k = 2 / (period + 1);
  let val = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < arr.length; i++) val = arr[i] * k + val * (1 - k);
  return val;
}

function calcRSI(arr, period = 14) {
  if (arr.length < period + 1) return null;
  const changes = arr.slice(1).map((c, i) => c - arr[i]);
  const recent = changes.slice(-period);
  const avgGain = recent.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  const avgLoss = recent.filter(c => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (avgLoss === 0) return 100;
  return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
}

function calcATR(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const avg = trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  return +avg.toFixed(2);
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 == null || ema26 == null) return { line: null, signal: null, histogram: null };
  const line = +(ema12 - ema26).toFixed(4);
  // Signal is 9-period EMA of MACD line (simplified — full impl needs MACD series)
  const signal = null; // Would need full MACD series
  return { line, signal, histogram: null };
}

function calcBollingerBands(arr, period = 20, mult = 2) {
  if (arr.length < period) return { upper: null, middle: null, lower: null, bandwidth: null, percentB: null };
  const slice = arr.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period);
  const upper = middle + mult * std;
  const lower = middle - mult * std;
  const price = arr[arr.length - 1];
  const bandwidth = std > 0 ? ((upper - lower) / middle) * 100 : null;
  const percentB = (upper !== lower) ? ((price - lower) / (upper - lower)) * 100 : null;
  return { upper: +upper.toFixed(2), middle: +middle.toFixed(2), lower: +lower.toFixed(2), bandwidth: bandwidth ? +bandwidth.toFixed(1) : null, percentB: percentB ? +percentB.toFixed(1) : null };
}

function calcStochastic(highs, lows, closes, period = 14) {
  if (closes.length < period) return { k: null, d: null };
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const hh = Math.max(...recentHighs);
  const ll = Math.min(...recentLows);
  const current = closes[closes.length - 1];
  if (hh === ll) return { k: 50, d: 50 };
  const k = +((current - ll) / (hh - ll) * 100).toFixed(1);
  // Simplified %D (3-period SMA of %K)
  return { k, d: null };
}

// ─── Multi-Factor Scoring ──────────────────────────────────────
// Score 0-100 across 6 categories, each 0-16 or 0-17 points

export function scoreTrend(price, sma20, sma50, sma200) {
  let s = 0;
  if (!price) return 0;
  // Price above SMAs
  if (sma20 && price > sma20) s += 4;
  if (sma50 && price > sma50) s += 5;
  if (sma200 && price > sma200) s += 4;
  // SMA alignment (Golden Cross etc.)
  if (sma50 && sma200 && sma50 > sma200) s += 3;
  return Math.min(16, s);
}

export function scoreMomentum(rsi, macd, stochK) {
  let s = 0;
  // RSI sweet spot 40-60 (pullback in uptrend)
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 60) s += 7;      // Ideal zone
    else if (rsi >= 30 && rsi <= 70) s += 5;
    else if (rsi < 30) s += 3;                  // Oversold bounce potential
    else s += 1;                                // Overbought, risky
  }
  // MACD positive
  if (macd?.line != null && macd.line > 0) s += 5;
  else if (macd?.line != null) s += 1;
  // Stochastic
  if (stochK != null) {
    if (stochK >= 30 && stochK <= 70) s += 4;
    else if (stochK >= 20 && stochK <= 80) s += 2;
    else s += 1;
  }
  return Math.min(16, s);
}

export function scoreVolume(avgVolume, relativeVolume) {
  let s = 0;
  // Absolute volume — need institutional-worthy liquidity
  if (avgVolume != null) {
    if (avgVolume >= 2000000) s += 6;
    else if (avgVolume >= 500000) s += 5;
    else if (avgVolume >= 100000) s += 3;
    else s += 1;
  }
  // Relative volume — above-average activity signals conviction
  if (relativeVolume != null) {
    if (relativeVolume >= 3) s += 10;
    else if (relativeVolume >= 2) s += 8;
    else if (relativeVolume >= 1.5) s += 6;
    else if (relativeVolume >= 1) s += 3;
    else s += 1;
  }
  return Math.min(16, s);
}

export function scoreVolatility(atr, price, bollinger) {
  let s = 0;
  // ATR as % of price — want enough movement for options but not chaos
  if (atr && price && price > 0) {
    const atrPct = (atr / price) * 100;
    if (atrPct >= 1.5 && atrPct <= 4) s += 8;    // Sweet spot for options
    else if (atrPct >= 1 && atrPct <= 6) s += 5;
    else if (atrPct < 1) s += 2;                   // Too flat
    else s += 2;                                    // Too wild
  }
  // Bollinger Band width — want some expansion (breakout)
  if (bollinger?.bandwidth) {
    if (bollinger.bandwidth >= 5 && bollinger.bandwidth <= 15) s += 5;
    else if (bollinger.bandwidth >= 3) s += 3;
    else s += 1; // Squeeze — breakout coming but direction unknown
  }
  // Bollinger %B — price position relative to bands
  if (bollinger?.percentB != null) {
    if (bollinger.percentB >= 60 && bollinger.percentB <= 85) s += 3;  // Strong but not overbought
    else if (bollinger.percentB >= 40) s += 2;
    else s += 1;
  }
  return Math.min(16, s);
}

export function scoreOptions(ivPct, avgDelta, bidAskSpread, volume, openInterest) {
  let s = 0;
  // IV — want moderate IV for selling premium
  if (ivPct != null) {
    if (ivPct >= 20 && ivPct <= 40) s += 5;    // Sweet spot
    else if (ivPct >= 15 && ivPct <= 60) s += 3;
    else if (ivPct < 15) s += 1;                 // Too low
    else s += 2;                                  // High IV — could sell premium
  }
  // Bid/ask spread — want tight for entry/exit
  if (bidAskSpread != null) {
    if (bidAskSpread <= 0.05) s += 4;
    else if (bidAskSpread <= 0.10) s += 3;
    else if (bidAskSpread <= 0.25) s += 2;
    else s += 1;
  }
  // Volume — need liquidity
  if (volume != null && volume > 100) s += 4;
  else if (volume != null && volume > 10) s += 2;
  // Open interest — institutional interest
  if (openInterest != null && openInterest > 1000) s += 3;
  else if (openInterest != null && openInterest > 100) s += 1;
  return Math.min(16, s);
}

export function scorePriceAction(pctFrom52wHigh, pctFrom52wLow, changePct) {
  let s = 0;
  // Near 52-week highs — momentum stocks
  if (pctFrom52wHigh != null) {
    if (pctFrom52wHigh >= -5) s += 5;       // Within 5% of high
    else if (pctFrom52wHigh >= -10) s += 4;
    else if (pctFrom52wHigh >= -20) s += 3;
    else s += 1;
  }
  // Today's momentum
  if (changePct != null) {
    const absChange = Math.abs(changePct * 100);
    if (absChange >= 1 && absChange <= 4) s += 4;    // Meaningful move, not chaos
    else if (absChange >= 0.5) s += 3;
    else if (absChange >= 0.2) s += 2;
    else s += 1;
  }
  // Distance from 52-week low — don't want stocks in freefall
  if (pctFrom52wLow != null) {
    if (pctFrom52wLow >= 30) s += 4;       // Well off the lows
    else if (pctFrom52wLow >= 15) s += 3;
    else s += 1;
  }
  return Math.min(14, s);
}

// ─── Stock Analysis Pipeline ────────────────────────────────────

export async function analyzeStock(ticker, provider, pubProvider) {
  const errors = [];

  // 1. Fetch all data in parallel
  const [quote, hist, optionsData] = await Promise.all([
    provider.quote(ticker).catch(e => { errors.push(`quote: ${e.message}`); return null; }),
    provider.chart(ticker, {
      period1: new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0],
      period2: new Date().toISOString().split('T')[0],
      interval: '1d',
    }).catch(e => { errors.push(`chart: ${e.message}`); return null; }),
    provider.optionsChain(ticker).catch(e => { errors.push(`options: ${e.message}`); return null; }),
  ]);

  if (!quote && !hist) {
    return { ticker, error: 'No data available', details: errors };
  }

  const closes = (hist?.quotes || []).map(q => q.close).filter(c => c != null);
  const highs = (hist?.quotes || []).map(q => q.high).filter(h => h != null);
  const lows = (hist?.quotes || []).map(q => q.low).filter(l => l != null);
  const volumes = (hist?.quotes || []).map(q => q.volume).filter(v => v != null);
  const price = quote?.price || closes[closes.length - 1] || null;

  // 2. Compute technical indicators
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);
  const rsi = calcRSI(closes);
  const atr = calcATR(highs, lows, closes);
  const macd = calcMACD(closes);
  const bollinger = calcBollingerBands(closes);
  const stoch = calcStochastic(highs, lows, closes);

  // 3. Extract options data
  const chain = optionsData?.chain || [];
  const dte = optionsData?.dte || null;
  const underlyingPrice = optionsData?.underlyingPrice || price;

  // ATM options (within 5% of current price)
  const atmCalls = chain
    .filter(c => c.type === 'call' && c.bid > 0 && c.ask > 0 && underlyingPrice && Math.abs(c.strike - underlyingPrice) / underlyingPrice < 0.05)
    .sort((a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice));

  const avgATMIV = atmCalls.length > 0
    ? atmCalls.filter(c => c.iv != null && c.iv > 0)
    : [];

  const ivPct = avgATMIV.length > 0
    ? +(avgATMIV.reduce((s, c) => s + c.iv, 0) / avgATMIV.length * 100).toFixed(1)
    : null;

  const avgDelta = atmCalls.length > 0 && atmCalls.some(c => c.delta != null)
    ? +(atmCalls.filter(c => c.delta != null).reduce((s, c) => s + Math.abs(c.delta), 0) / atmCalls.filter(c => c.delta != null).length).toFixed(3)
    : null;

  const avgSpread = atmCalls.length > 0
    ? +((atmCalls.reduce((s, c) => s + (c.ask - c.bid), 0) / atmCalls.length)).toFixed(2)
    : null;

  const totalCallVolume = chain.filter(c => c.type === 'call').reduce((s, c) => s + (c.volume || 0), 0);
  const totalCallOI = chain.filter(c => c.type === 'call').reduce((s, c) => s + (c.openInterest || 0), 0);

  // 4. Volume analysis
  const avgVolume = volumes.length > 20
    ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    : (quote?.volume || null);
  const currentVolume = quote?.volume || volumes[volumes.length - 1] || null;
  const relativeVolume = avgVolume > 0 && currentVolume ? currentVolume / avgVolume : null;

  // 5. 52-week metrics
  const high52w = closes.length > 0 ? Math.max(...closes) : null;
  const low52w = closes.length > 0 ? Math.min(...closes) : null;
  const pctFrom52wHigh = high52w && price ? +((price - high52w) / high52w * 100).toFixed(1) : null;
  const pctFrom52wLow = low52w && price ? +((price - low52w) / low52w * 100).toFixed(1) : null;

  // 6. Trend classification
  let trend = 'Neutral';
  if (price && sma50 && sma200) {
    if (price > sma50 && price > sma200) trend = sma50 > sma200 ? 'Strong Uptrend' : 'Uptrend';
    else if (price < sma50 && price < sma200) trend = sma50 < sma200 ? 'Strong Downtrend' : 'Downtrend';
    else if (price > sma50) trend = 'Neutral-Bullish';
    else trend = 'Neutral-Bearish';
  }

  // 7. Multi-factor scoring
  const trendScore = scoreTrend(price, sma20, sma50, sma200);
  const momentumScore = scoreMomentum(rsi, macd, stoch.k);
  const volumeScore = scoreVolume(avgVolume, relativeVolume);
  const volatilityScore = scoreVolatility(atr, price, bollinger);
  const optionsScore = scoreOptions(ivPct, avgDelta, avgSpread, totalCallVolume, totalCallOI);
  const priceActionScore = scorePriceAction(pctFrom52wHigh, pctFrom52wLow, quote?.changePercent);

  const totalScore = Math.min(100, trendScore + momentumScore + volumeScore + volatilityScore + optionsScore + priceActionScore);

  // 8. Signal determination
  let signal = 'Neutral';
  if (totalScore >= 75) signal = 'Strong Buy';
  else if (totalScore >= 60) signal = 'Buy';
  else if (totalScore >= 45) signal = 'Watch';
  else if (totalScore >= 30) signal = 'Weak';
  else signal = 'Avoid';

  // Signal reason
  const reasons = [];
  if (trend.includes('Up') || trend.includes('Bull')) reasons.push('Above SMAs');
  else if (trend.includes('Down') || trend.includes('Bear')) reasons.push('Below SMAs');
  if (rsi > 70) reasons.push('RSI overbought');
  else if (rsi < 30) reasons.push('RSI oversold');
  else if (rsi > 55) reasons.push('RSI bullish');
  if (relativeVolume > 1.5) reasons.push('High rel vol');
  const signalReason = reasons.join('; ') || 'Mixed signals';

  return {
    ticker,
    price,
    change: quote?.change || null,
    changePercent: quote?.changePercent != null ? +quote.changePercent.toFixed(2) + '%' : null,
    volume: currentVolume,
    avgVolume,
    relativeVolume: relativeVolume ? +relativeVolume.toFixed(2) : null,

    // Technical indicators
    sma20: sma20 ? +sma20.toFixed(2) : null,
    sma50: sma50 ? +sma50.toFixed(2) : null,
    sma200: sma200 ? +sma200.toFixed(2) : null,
    rsi,
    atr,
    macd: macd.line,
    bollinger,
    stochastic: stoch,
    trend,

    // 52-week
    high52w: high52w ? +high52w.toFixed(2) : null,
    low52w: low52w ? +low52w.toFixed(2) : null,
    pctFrom52wHigh,
    pctFrom52wLow,

    // Options summary
    options: optionsData ? {
      selectedExpiry: optionsData.selectedExpiry,
      dte,
      strikes: optionsData.strikes?.length || 0,
      chainSize: chain.length,
      ivPct,
      avgATMDelta: avgDelta,
      avgATMSpread: avgSpread,
      totalCallVolume,
      totalCallOI,
    } : null,

    // Scoring
    scores: {
      trend: trendScore,
      momentum: momentumScore,
      volume: volumeScore,
      volatility: volatilityScore,
      options: optionsScore,
      priceAction: priceActionScore,
      total: totalScore,
    },
    signal,
    signalReason,

    dataPoints: closes.length,
    _provider: quote?._provider || 'unknown',
    _errors: errors.length > 0 ? errors : undefined,
  };
}

// ─── Main Screener ─────────────────────────────────────────────
export async function runScreener(presetName, { provider, pubProvider, maxStocks = 20, tickers = null } = {}) {
  const preset = SCREENER_PRESETS[presetName] || SCREENER_PRESETS.valueMomentum;

  // If tickers provided, analyze them directly
  let stockList = tickers ? tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean) : [];
  let finvizData = null;
  let dataSource = 'yahoo';

  // Strategy 1: Try Finviz screener (if no custom tickers)
  if (stockList.length === 0) {
    try {
      console.log('[STOCKER] Scraping Finviz screener for preset:', presetName);
      finvizData = await scrapeFinvizScreener(preset);
      if (finvizData && finvizData.length > 0) {
        stockList = finvizData.slice(0, maxStocks).map(s => s.ticker);
        console.log(`[STOCKER] Finviz returned ${finvizData.length} stocks, using top ${stockList.length}`);
        dataSource = 'finviz';
      }
    } catch (e) {
      console.warn(`[STOCKER] Finviz scrape failed: ${e.message}, falling back`);
    }
  }

  // Strategy 2: Yahoo Finance market movers + curated lists per preset
  if (stockList.length === 0 && provider) {
    try {
      console.log('[STOCKER] Using Yahoo Finance screening for preset:', presetName);
      stockList = await getYahooScreenerList(presetName, provider, maxStocks);
      if (stockList.length > 0) {
        console.log(`[STOCKER] Yahoo screener returned ${stockList.length} stocks`);
        dataSource = 'yahoo';
      }
    } catch (e) {
      console.warn(`[STOCKER] Yahoo screener failed: ${e.message}`);
    }
  }

  // Strategy 3: Public.com instruments
  if (stockList.length === 0 && pubProvider) {
    try {
      console.log('[STOCKER] Fetching stock universe from Public.com...');
      const data = await pubProvider.getAllInstruments({ typeFilter: 'EQUITY', tradingFilter: 'BUY_AND_SELL' });
      const instruments = (data.instruments || []).filter(i =>
        i.symbol &&
        i.symbol.match(/^[A-Z]{2,5}$/) &&
        i.optionTrading !== 'DISABLED' &&
        i.trading !== 'NOT_TRADABLE'
      );
      stockList = instruments.slice(0, maxStocks).map(i => i.symbol);
      console.log(`[STOCKER] Found ${instruments.length} tradeable equities, using top ${stockList.length}`);
      dataSource = 'public';
    } catch (e) {
      console.error(`[STOCKER] Public.com instrument fetch failed: ${e.message}`);
    }
  }

  // If still no stocks, use a default watchlist
  if (stockList.length === 0) {
    stockList = ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOG', 'AMD', 'NFLX', 'CRM', 'ADBE', 'PLTR', 'COIN', 'UBER', 'SNAP', 'RIVN', 'BABA'];
    console.log('[STOCKER] Using default watchlist');
  }

  // Limit stocks to analyze
  const limit = Math.min(stockList.length, maxStocks);
  const results = [];

  // Batch analyze (3 concurrent)
  const batchSize = 3;
  for (let i = 0; i < limit; i += batchSize) {
    const batch = stockList.slice(i, Math.min(i + batchSize, limit));
    const analyses = await Promise.all(
      batch.map(ticker => analyzeStock(ticker, provider, pubProvider))
    );
    results.push(...analyses);
  }

  // Sort by total score descending
  results.sort((a, b) => (b.scores?.total || 0) - (a.scores?.total || 0));

  return {
    preset: presetName,
    name: preset.name,
    description: preset.description,
    finvizUrl: finvizUrl(preset),
    filters: preset.filters,
    finvizStocks: finvizData?.slice(0, maxStocks) || null,
    totalScraped: stockList.length,
    analyzedCount: results.filter(s => !s.error).length,
    source: dataSource,
    stocks: results,
  };
}

// ─── Analyze Single Stock ──────────────────────────────────────
export default {
  SCREENER_PRESETS,
  runScreener,
  analyzeStock,
  finvizUrl,
  // Scoring functions exported for testing
  scoreTrend,
  scoreMomentum,
  scoreVolume,
  scoreVolatility,
  scoreOptions,
  scorePriceAction,
};