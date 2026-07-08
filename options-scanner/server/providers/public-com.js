/**
 * Public.com Provider
 *
 * API docs: https://public.com/api/docs
 * Postman: https://github.com/PublicDotCom/postman-collection
 * Key endpoints:
 *   POST /userapiauthservice/personal/access-tokens           — auth
 *   GET  /userapigateway/trading/account                       — list accounts
 *   GET  /userapigateway/trading/{accountId}/portfolio/v2     — portfolio positions
 *   GET  /userapigateway/trading/{accountId}/history           — account history
 *   GET  /userapigateway/trading/instruments                   — all instruments
 *   GET  /userapigateway/trading/instruments/{symbol}/{type}   — instrument detail
 *   POST /userapigateway/marketdata/{accountId}/quotes         — quotes
 *   POST /userapigateway/marketdata/{accountId}/option-expirations — expirations
 *   POST /userapigateway/marketdata/{accountId}/option-chain    — option chain
 *   GET  /userapigateway/historicdata/{type}/{symbol}/{period}[/agg] — bars v2
 *   GET  /userapigateway/option-details/{accountId}/greeks      — option greeks
 *   POST /userapigateway/option-details/{accountId}/strategy-quote — strategy quote
 */

const PUBLIC_BASE = 'https://api.public.com';
const PUBLIC_SECRET = process.env.PUBLIC_COM_API_KEY || process.env.PUBLIC_API_KEY || '';

// ─── Token & Account Cache ─────────────────────────────────────
let _accessToken = null;
let _tokenExpiry = 0;
let _accountId = null;

async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiry - 60000) return _accessToken;

  const res = await fetch(`${PUBLIC_BASE}/userapiauthservice/personal/access-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ validityInMinutes: 120, secret: PUBLIC_SECRET }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[PUBLIC] Auth ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.accessToken) throw new Error('[PUBLIC] No accessToken in response');
  _accessToken = data.accessToken;
  _tokenExpiry = Date.now() + (data.expiresIn || 120) * 60 * 1000;
  _accountId = null;
  return _accessToken;
}

async function getAccountId() {
  if (_accountId) return _accountId;
  const token = await getAccessToken();
  const res = await fetch(`${PUBLIC_BASE}/userapigateway/trading/account`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[PUBLIC] Account ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const accounts = Array.isArray(data.accounts) ? data.accounts : [data];
  // Prefer brokerage account with options
  const brokerage = accounts.find(a => a.accountType === 'BROKERAGE' && a.optionsLevel && a.optionsLevel !== 'NONE')
    || accounts.find(a => a.accountType === 'BROKERAGE')
    || accounts[0];
  if (!brokerage?.accountId) throw new Error('[PUBLIC] No brokerage account found');
  _accountId = brokerage.accountId;
  return _accountId;
}

async function publicPost(path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${PUBLIC_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[PUBLIC] POST ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function publicGet(path, params = null) {
  const token = await getAccessToken();
  let url = `${PUBLIC_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v != null) {
        if (Array.isArray(v)) v.forEach(item => qs.append(k, String(item)));
        else qs.set(k, String(v));
      }
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[PUBLIC] GET ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function publicSymbol(sym) {
  return sym.replace('^', '')
}

function parseOptionContract(c, expiryDate, defaultType) {
  const greeks = c.optionDetails?.greeks || {}
  const osi = c.instrument?.symbol || ''
  let strike = parseFloat(c.strikePrice || c.strike || '0')
  if (!strike && osi.length >= 18) {
    strike = parseInt(osi.slice(-8)) / 1000
  }

  let type = defaultType
  if (c.optionDetails?.type) {
    type = c.optionDetails.type.toLowerCase().includes('put') ? 'put' : 'call'
  } else if (osi.length >= 15) {
    const prefix = osi.slice(0, -8)
    const cpChar = prefix.slice(-1)
    if (cpChar === 'P') type = 'put'
    else if (cpChar === 'C') type = 'call'
  }

  const bid = parseFloat(c.bid) || 0
  const ask = parseFloat(c.ask) || 0
  const mid = (bid > 0 && ask > 0) ? +((bid + ask) / 2).toFixed(2) : null

  return {
    strike,
    type,
    bid,
    ask,
    mid: mid || parseFloat(c.last) || null,
    lastPrice: parseFloat(c.last) || null,
    volume: parseInt(c.volume) || 0,
    openInterest: parseInt(c.openInterest) || 0,
    iv: parseFloat(c.optionDetails?.impliedVolatility || c.impliedVolatility || '0') || null,
    delta: parseFloat(greeks.delta) || null,
    gamma: parseFloat(greeks.gamma) || null,
    theta: parseFloat(greeks.theta) || null,
    vega: parseFloat(greeks.vega) || null,
    rho: parseFloat(greeks.rho) || null,
    inTheMoney: c.optionDetails?.inTheMoney ?? null,
    contractSymbol: osi,
    expirationDate: expiryDate,
    estimated: !greeks.delta,
  }
}

// ─── Quote ────────────────────────────────────────────────────
export async function quote(symbol) {
  const sym = publicSymbol(symbol)
  const accountId = await getAccountId()
  const data = await publicPost(`/userapigateway/marketdata/${accountId}/quotes`, {
    instruments: [{ symbol: sym, type: 'EQUITY' }],
  })
  const quotes = data.quotes || (Array.isArray(data) ? data : [])
  const q = quotes[0] || {}

  let change = null, changePercent = null
  if (q.oneDayChange) {
    change = parseFloat(q.oneDayChange.change) || null
    changePercent = parseFloat(q.oneDayChange.percentChange) || null
    if (changePercent != null) changePercent = changePercent / 100
  }

  return {
    symbol,
    price: parseFloat(q.last) || null,
    change,
    changePercent,
    volume: parseInt(q.volume) || null,
    dayHigh: null,
    dayLow: null,
    fiftyDayAvg: null,
    twoHundredDayAvg: null,
    bid: parseFloat(q.bid) || null,
    ask: parseFloat(q.ask) || null,
    mid: q.bid && q.ask ? ((parseFloat(q.bid) + parseFloat(q.ask)) / 2) : null,
    _provider: 'public',
  }
}

// ─── Market Snapshot ─────────────────────────────────────────
export async function marketSnapshot() {
  const indices = [
    { symbol: 'SPY', key: 'SPY', type: 'EQUITY' },
    { symbol: 'QQQ', key: 'QQQ', type: 'EQUITY' },
    { symbol: 'IWM', key: 'IWM', type: 'EQUITY' },
    { symbol: 'DIA', key: 'DIA', type: 'EQUITY' },
  ]
  const results = {}
  try {
    const accountId = await getAccountId()
    const data = await publicPost(`/userapigateway/marketdata/${accountId}/quotes`, {
      instruments: indices.map(i => ({ symbol: i.symbol, type: i.type })),
    })
    const quotes = data.quotes || (Array.isArray(data) ? data : [])
    for (let i = 0; i < indices.length; i++) {
      const q = quotes[i] || {}
      let change = null, changePercent = null
      if (q.oneDayChange) {
        change = parseFloat(q.oneDayChange.change) || null
        changePercent = parseFloat(q.oneDayChange.percentChange) || null
        if (changePercent != null) changePercent = changePercent / 100
      }
      results[indices[i].key] = {
        symbol: indices[i].key,
        price: parseFloat(q.last) || null,
        change,
        changePercent,
      }
    }
  } catch (e) {
    console.error('[PUBLIC] Market snapshot failed:', e.message)
    for (const idx of indices) {
      if (!results[idx.key]) results[idx.key] = { symbol: idx.key, price: null, change: null, changePercent: null }
    }
  }
  return { ...results, _provider: 'public' }
}

// ─── Options Chain ────────────────────────────────────────────
export async function optionsChain(symbol, expiryDate = null) {
  const sym = publicSymbol(symbol)
  const accountId = await getAccountId()

  const expData = await publicPost(`/userapigateway/marketdata/${accountId}/option-expirations`, {
    instrument: { symbol: sym, type: 'EQUITY' },
  })
  const expirationDates = (expData.expirations || []).filter(Boolean).sort()
  if (!expirationDates.length) throw new Error(`[PUBLIC] No options data for ${sym}`)

  // Select expiry
  let selectedExpiry = expiryDate
  if (!selectedExpiry) {
    const now = Date.now()
    for (const d of expirationDates) {
      const dte = Math.ceil((new Date(d + 'T00:00:00Z').getTime() - now) / 86400000)
      if (dte >= 15) { selectedExpiry = d; break }
    }
    if (!selectedExpiry) selectedExpiry = expirationDates[0]
  }

  const chainData = await publicPost(`/userapigateway/marketdata/${accountId}/option-chain`, {
    instrument: { symbol: sym, type: 'EQUITY' },
    expirationDate: selectedExpiry,
  })

  const calls = (chainData.calls || []).map(c => parseOptionContract(c, selectedExpiry, 'call'))
  const puts = (chainData.puts || []).map(c => parseOptionContract(c, selectedExpiry, 'put'))

  let underlyingPrice = null
  try { const q = await quote(symbol); underlyingPrice = q.price } catch { /* null */ }

  const dte = Math.max(0, Math.ceil((new Date(selectedExpiry + 'T00:00:00Z').getTime() - Date.now()) / 86400000))
  const chain = [...calls, ...puts].map(c => ({ ...c, dte }))

  return {
    underlying: symbol,
    underlyingPrice,
    expirationDates,
    selectedExpiry,
    dte,
    strikes: [...new Set(chain.map(c => c.strike).filter(s => s != null))].sort((a, b) => a - b),
    chain,
    _provider: 'public',
  }
}

// ─── Chart (historic bars) ─────────────────────────────────────
export async function chart(symbol, { interval = '1d' } = {}) {
  const sym = publicSymbol(symbol)
  const periodMap = { '1d': 'DAY', '5d': 'WEEK', '1w': 'WEEK', '1M': 'MONTH', '3M': 'MONTH', '6M': 'MONTH', '1y': 'YEAR', '2y': 'YEAR' }
  const period = periodMap[interval] || 'YEAR'

  try {
    const data = await publicGet(`/userapigateway/historicdata/EQUITY/${sym}/${period}`)
    const bars = Array.isArray(data) ? data : (data.bars || data.candles || data.regularMarket?.bars || [])
    const quotes = bars.map(b => ({
      date: (b.startTime || b.timestamp || b.date) ? new Date(b.startTime || b.timestamp || b.date).toISOString().split('T')[0] : null,
      open: parseFloat(b.open || b.o) || null,
      high: parseFloat(b.high || b.h) || null,
      low: parseFloat(b.low || b.l) || null,
      close: parseFloat(b.close || b.c) || null,
      volume: parseInt(b.volume || b.v) || null,
    })).filter(q => q.date && q.close != null)
    return { quotes, _provider: 'public' }
  } catch (e) {
    console.error(`[PUBLIC] Chart failed for ${sym}:`, e.message)
    return { quotes: [], _provider: 'public' }
  }
}

// ─── Bars v2 (with aggregation & instrument type) ────────────
// Period: DAY, WEEK, MONTH, QUARTER, HALF_YEAR, YEAR, FIVE_YEARS, YTD, SINCE_PURCHASE
// Aggregation: ONE_MINUTE, FIVE_MINUTES, TEN_MINUTES, FIFTEEN_MINUTES, THIRTY_MINUTES, ONE_HOUR, ONE_DAY, ONE_WEEK, ONE_MONTH, THREE_MONTHS, SIX_MONTHS, ONE_YEAR
// InstrumentType: EQUITY, CRYPTO, OPTION, INDEX
export async function bars(symbol, period = 'YEAR', { instrumentType = 'EQUITY', aggregation = null, purchaseDate = null } = {}) {
  const sym = publicSymbol(symbol)
  const validPeriods = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR', 'FIVE_YEARS', 'YTD', 'SINCE_PURCHASE']
  const validTypes = ['EQUITY', 'CRYPTO', 'OPTION', 'INDEX']
  const p = validPeriods.includes(period) ? period : 'YEAR'
  const t = validTypes.includes(instrumentType) ? instrumentType : 'EQUITY'

  let path = `/userapigateway/historicdata/${t}/${sym}/${p}`
  if (aggregation) path += `/${aggregation}`

  const params = purchaseDate ? { purchaseDate } : null

  try {
    const data = await publicGet(path, params)
    const rawBars = data.regularMarket?.bars || data.bars || data.candles || (Array.isArray(data) ? data : [])
    const lastClose = data.lastRegularTradingSessionClose || null

    const bars = rawBars.map(b => ({
      timestamp: b.startTime || b.timestamp || b.date || null,
      open: parseFloat(b.open ?? b.o) || null,
      high: parseFloat(b.high ?? b.h) || null,
      low: parseFloat(b.low ?? b.l) || null,
      close: parseFloat(b.close ?? b.c) || null,
      volume: parseInt(b.volume ?? b.v) || null,
    }))

    return {
      symbol: sym,
      instrumentType: t,
      period: p,
      aggregation: aggregation || null,
      totalExpectedBars: data.totalExpectedBars || bars.length,
      lastRegularTradingSessionClose: lastClose ? {
        close: parseFloat(lastClose.close) || null,
        closeDate: lastClose.closeDate || null,
        percentChange: parseFloat(lastClose.percentChange) || null,
      } : null,
      preMarket: data.preMarket?.bars || [],
      regularMarket: bars,
      afterHours: data.afterHours?.bars || [],
      _provider: 'public',
    }
  } catch (e) {
    console.error(`[PUBLIC] Bars failed for ${sym}:`, e.message)
    return { symbol: sym, period: p, bars: [], regularMarket: [], _provider: 'public', error: e.message }
  }
}

// ─── Get All Instruments ──────────────────────────────────────
// GET /userapigateway/trading/instruments
// Optional query params: typeFilter[], tradingFilter[]
// typeFilter: EQUITY, OPTION, CRYPTO, INDEX, CORPORATE_BOND, TREASURY, UNDERLYING_SECURITY_FOR_INDEX_OPTION
// tradingFilter: BUY_AND_SELL, BUY_ONLY, SELL_ONLY, NOT_TRADABLE
export async function getAllInstruments({ typeFilter = null, tradingFilter = null, fractionalTradingFilter = null, optionTradingFilter = null, optionSpreadTradingFilter = null } = {}) {
  const params = {}
  if (typeFilter) {
    if (Array.isArray(typeFilter)) params.typeFilter = typeFilter
    else params.typeFilter = [typeFilter]
  }
  if (tradingFilter) {
    if (Array.isArray(tradingFilter)) params.tradingFilter = tradingFilter
    else params.tradingFilter = [tradingFilter]
  }
  if (fractionalTradingFilter) {
    if (Array.isArray(fractionalTradingFilter)) params.fractionalTradingFilter = fractionalTradingFilter
    else params.fractionalTradingFilter = [fractionalTradingFilter]
  }
  if (optionTradingFilter) {
    if (Array.isArray(optionTradingFilter)) params.optionTradingFilter = optionTradingFilter
    else params.optionTradingFilter = [optionTradingFilter]
  }
  if (optionSpreadTradingFilter) {
    if (Array.isArray(optionSpreadTradingFilter)) params.optionSpreadTradingFilter = optionSpreadTradingFilter
    else params.optionSpreadTradingFilter = [optionSpreadTradingFilter]
  }

  try {
    const data = await publicGet('/userapigateway/trading/instruments', Object.keys(params).length > 0 ? params : null)
    // Response has { instruments: [...] }
    const instruments = data.instruments || (Array.isArray(data) ? data : [])
    return {
      instruments: instruments.map(i => ({
        symbol: i.instrument?.symbol || i.symbol || '',
        type: i.instrument?.type || i.type || '',
        name: i.name || i.instrument?.symbol || '',
        trading: i.trading || null,
        fractionalTrading: i.fractionalTrading || null,
        optionTrading: i.optionTrading || null,
        optionSpreadTrading: i.optionSpreadTrading || null,
        shortingAvailability: i.shortingAvailability || null,
        ...i,
      })),
      _provider: 'public',
    }
  } catch (e) {
    console.error('[PUBLIC] getAllInstruments failed:', e.message)
    return { instruments: [], _provider: 'public', error: e.message }
  }
}

// ─── Get Instrument ────────────────────────────────────────────
// GET /userapigateway/trading/instruments/{symbol}/{type}
export async function getInstrument(symbol, instrumentType = 'EQUITY') {
  const sym = publicSymbol(symbol)
  const validTypes = ['EQUITY', 'OPTION', 'CRYPTO', 'INDEX', 'CORPORATE_BOND', 'TREASURY', 'UNDERLYING_SECURITY_FOR_INDEX_OPTION']
  const t = validTypes.includes(instrumentType) ? instrumentType : 'EQUITY'

  try {
    const data = await publicGet(`/userapigateway/trading/instruments/${sym}/${t}`)
    return {
      symbol: data.instrument?.symbol || sym,
      type: data.instrument?.type || t,
      name: data.name || '',
      trading: data.trading || null,
      fractionalTrading: data.fractionalTrading || null,
      optionTrading: data.optionTrading || null,
      optionSpreadTrading: data.optionSpreadTrading || null,
      shortingAvailability: data.shortingAvailability || null,
      optionContractPriceIncrements: data.optionContractPriceIncrements || null,
      instrumentDetails: data.instrumentDetails || null,
      _provider: 'public',
      ...data,
    }
  } catch (e) {
    console.error(`[PUBLIC] getInstrument failed for ${sym}:`, e.message)
    return { symbol: sym, type: t, error: e.message, _provider: 'public' }
  }
}

// ─── Get Option Greeks ────────────────────────────────────────
// GET /userapigateway/option-details/{accountId}/greeks?osiSymbols=...
// osiSymbols: array of OSI-normalized option symbols (e.g., "AAPL251219C00150000")
export async function getOptionGreeks(osiSymbols) {
  if (!osiSymbols || (Array.isArray(osiSymbols) && osiSymbols.length === 0)) {
    return { greeks: [], _provider: 'public' }
  }
  const accountId = await getAccountId()
  const symbols = Array.isArray(osiSymbols) ? osiSymbols : [osiSymbols]

  try {
    const data = await publicGet(`/userapigateway/option-details/${accountId}/greeks`, { osiSymbols: symbols })
    // Response: { greeks: [{ osiSymbol, delta, gamma, theta, vega, rho, impliedVolatility, ... }] }
    const rawGreeks = data.greeks || (Array.isArray(data) ? data : [])
    return {
      greeks: rawGreeks.map(g => {
        const inner = g.greeks || {}
        return {
          osiSymbol: g.osiSymbol || g.symbol || '',
          delta: parseFloat(g.delta ?? inner.delta) || null,
          gamma: parseFloat(g.gamma ?? inner.gamma) || null,
          theta: parseFloat(g.theta ?? inner.theta) || null,
          vega: parseFloat(g.vega ?? inner.vega) || null,
          rho: parseFloat(g.rho ?? inner.rho) || null,
          impliedVolatility: parseFloat(g.impliedVolatility ?? g.iv ?? inner.impliedVolatility ?? inner.iv) || null,
          ...g,
        }
      }),
      _provider: 'public',
    }
  } catch (e) {
    console.error('[PUBLIC] getOptionGreeks failed:', e.message)
    return { greeks: [], _provider: 'public', error: e.message }
  }
}

// ─── Get Strategy Quote ────────────────────────────────────────
// POST /userapigateway/option-details/{accountId}/strategy-quote
// Body: { legs: [{ instrument: { symbol, type }, side, ratioQuantity, openCloseIndicator? }] }
export async function getStrategyQuote(legs) {
  if (!legs || !Array.isArray(legs) || legs.length < 2) {
    throw new Error('[PUBLIC] getStrategyQuote requires at least 2 legs')
  }
  const accountId = await getAccountId()

  const body = {
    legs: legs.map(leg => ({
      instrument: {
        symbol: leg.symbol,
        type: leg.type || 'OPTION',
      },
      side: leg.side || 'BUY',
      ...(leg.ratioQuantity != null ? { ratioQuantity: leg.ratioQuantity } : {}),
      ...(leg.openCloseIndicator ? { openCloseIndicator: leg.openCloseIndicator } : {}),
    })),
  }

  try {
    const data = await publicPost(`/userapigateway/option-details/${accountId}/strategy-quote`, body)
    return {
      strategyQuote: data,
      _provider: 'public',
    }
  } catch (e) {
    console.error('[PUBLIC] getStrategyQuote failed:', e.message)
    return { strategyQuote: null, _provider: 'public', error: e.message }
  }
}

// ─── Portfolio ───────────────────────────────────────────────────
// GET /userapigateway/trading/{accountId}/portfolio/v2
export async function getPortfolio() {
  const accountId = await getAccountId()
  try {
    const data = await publicGet(`/userapigateway/trading/${accountId}/portfolio/v2`)
    return {
      accountId,
      portfolio: data,
      _provider: 'public',
    }
  } catch (e) {
    console.error('[PUBLIC] getPortfolio failed:', e.message)
    return { accountId, portfolio: null, _provider: 'public', error: e.message }
  }
}

// ─── Account History ──────────────────────────────────────────────
// GET /userapigateway/trading/{accountId}/history
// Optional params: start, end, pageSize, nextToken
export async function getHistory({ start = null, end = null, pageSize = null, nextToken = null } = {}) {
  const accountId = await getAccountId()
  const params = {}
  if (start) params.start = start
  if (end) params.end = end
  if (pageSize) params.pageSize = pageSize
  if (nextToken) params.nextToken = nextToken

  try {
    const data = await publicGet(`/userapigateway/trading/${accountId}/history`, Object.keys(params).length > 0 ? params : null)
    return {
      accountId,
      history: data.history || data.transactions || (Array.isArray(data) ? data : []),
      nextToken: data.nextToken || null,
      _provider: 'public',
    }
  } catch (e) {
    console.error('[PUBLIC] getHistory failed:', e.message)
    return { accountId, history: [], _provider: 'public', error: e.message }
  }
}

// ─── News ──────────────────────────────────────────────────────
export async function news() { return [] }

// ─── Health Check ──────────────────────────────────────────────
export async function healthCheck() {
  try {
    await getAccessToken()
    const accountId = await getAccountId()
    return { ok: true, provider: 'public', accountId }
  } catch (e) {
    return { ok: false, provider: 'public', error: e.message }
  }
}

export default {
  quote,
  marketSnapshot,
  optionsChain,
  chart,
  bars,
  getAllInstruments,
  getInstrument,
  getOptionGreeks,
  getStrategyQuote,
  getPortfolio,
  getHistory,
  news,
  healthCheck,
  getAccountId,
}