/**
 * Finnhub Provider
 *
 * Uses the Finnhub REST API for quotes, options, chart, and news.
 * Falls back to Yahoo for features Finnhub free tier doesn't support.
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1'
const getFinnhubToken = () => process.env.FINNHUB_TOKEN || ''

async function finnhubFetch(endpoint, params = {}) {
  const url = new URL(`${FINNHUB_BASE}${endpoint}`)
  url.searchParams.set('token', getFinnhubToken())
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'OptScan/1.0' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // Finnhub free tier returns 403 for options/candles — suppress noisy logs
    if (res.status === 403) {
      throw new Error(`[FINNHUB] 403: Free tier — no access to ${endpoint}`)
    }
    throw new Error(`[FINNHUB] ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

function finnhubSymbol(sym) {
  if (sym === '^DJI') return '.DJI'
  if (sym === '^IXIC') return '.IXIC'
  if (sym === '^VIX') return 'VIX'
  return sym
}

function estimateDelta(strike, underlying, isCall, dte) {
  if (!underlying || !dte || dte <= 0) return isCall ? 0.5 : -0.5
  const m = underlying * Math.sqrt(dte / 365) * 0.15
  const d = (underlying - strike) / m
  const norm = (x) => 0.5 * (1 + (x < 0 ? -1 : 1) * Math.sqrt(1 - Math.exp(-2 * x * x / Math.PI)))
  return isCall ? Math.max(0.01, Math.min(0.99, norm(d))) : Math.max(-0.99, Math.min(-0.01, -norm(d)))
}

function estimateIV(mid, strike, underlying, dte, isCall) {
  if (!underlying || !dte || dte <= 0 || !mid || mid <= 0) return null
  const intrinsic = Math.max(0, isCall ? underlying - strike : strike - underlying)
  const timeVal = mid - intrinsic
  if (timeVal <= 0) return null
  return Math.sqrt(2 * Math.PI / (dte / 365)) * (timeVal / underlying)
}

function computeScore(greeks, iv, volume, oi, estimatedDelta, estimatedIV) {
  let score = 0
  const delta = greeks?.delta ?? estimatedDelta
  if (delta != null) score += Math.min(20, Math.abs(delta) * 20)
  if (iv != null && iv > 0) {
    if (iv < 0.25) score += 5; else if (iv < 0.5) score += 10; else if (iv < 0.8) score += 15; else score += 20
  }
  if (volume > 0 && oi > 0) {
    const ratio = volume / oi
    if (ratio > 2) score += 20; else if (ratio > 1) score += 15; else if (ratio > 0.5) score += 10; else score += 5
  }
  if (volume > 100) score += 10; else if (volume > 10) score += 5
  if (oi > 1000) score += 10; else if (oi > 100) score += 5
  return Math.min(100, Math.round(score))
}

// ─── Quote ────────────────────────────────────────────────────
export async function quote(symbol) {
  const sym = finnhubSymbol(symbol)
  const data = await finnhubFetch('/quote', { symbol: sym })
  return {
    symbol,
    price: data.c ?? null,
    change: data.d ?? null,
    changePercent: data.dp != null ? data.dp / 100 : null,
    volume: null,
    dayHigh: data.h ?? null,
    dayLow: data.l ?? null,
    fiftyDayAvg: null,
    twoHundredDayAvg: null,
    _provider: 'finnhub',
  }
}

// ─── Market Snapshot ─────────────────────────────────────────
export async function marketSnapshot() {
  const indices = [
    { symbol: 'DIA', key: '^DJI' },
    { symbol: 'QQQ', key: '^IXIC' },
    { symbol: 'VIX', key: '^VIX' },
  ]
  const results = {}
  await Promise.all(indices.map(async ({ symbol, key }) => {
    try {
      const data = await finnhubFetch('/quote', { symbol })
      results[key] = {
        symbol: key,
        price: data.c ?? null,
        change: data.d ?? null,
        changePercent: data.dp != null ? data.dp / 100 : null,
      }
    } catch (e) {
      results[key] = { symbol: key, price: null, change: null, changePercent: null }
    }
  }))
  return { ...results, _provider: 'finnhub' }
}

// ─── Options Chain ────────────────────────────────────────────
export async function optionsChain(symbol, expiryDate = null) {
  const sym = finnhubSymbol(symbol)
  const expData = await finnhubFetch('/stock/option-chain', { symbol: sym })
  if (!expData.data || !expData.data.length) throw new Error(`[FINNHUB] No options data for ${sym}`)

  const expirationDates = expData.data.map(d => d.expirationDate).filter(Boolean).sort()
  let selectedExpiry = expiryDate || expirationDates[0]
  if (expiryDate && !expirationDates.includes(expiryDate)) {
    const dates = expirationDates.map(d => new Date(d).getTime())
    const target = new Date(expiryDate).getTime()
    const closest = dates.reduce((prev, curr) => Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev)
    selectedExpiry = expirationDates[dates.indexOf(closest)]
  }

  const chainData = await finnhubFetch('/stock/option-chain', { symbol: sym, expirationDate: selectedExpiry })
  if (!chainData.data || !chainData.data.length) throw new Error(`[FINNHUB] No chain for ${sym} @ ${selectedExpiry}`)

  const optionSet = chainData.data.find(d => d.expirationDate === selectedExpiry) || chainData.data[0]
  let underlyingPrice = optionSet.underlyingPrice ?? optionSet.underlying ?? null
  if (underlyingPrice == null) {
    try { const q = await finnhubFetch('/quote', { symbol: sym }); underlyingPrice = q.c ?? null } catch { /* null */ }
  }

  const dte = Math.max(0, Math.ceil((new Date(selectedExpiry + 'T00:00:00Z').getTime() - Date.now()) / 86400000))

  const calls = (optionSet.options?.call || []).map(c => {
    const isCall = true
    const rawDelta = c.greeks?.delta ?? null
    const estimatedDelta = rawDelta != null ? null : estimateDelta(c.strike, underlyingPrice || c.strike, isCall, dte || 30)
    const rawIV = c.impliedVolatility ?? null
    const estIV = (!rawIV || rawIV < 0.001) && c.mid > 0 ? estimateIV(c.mid, c.strike, underlyingPrice || c.strike, dte || 30, isCall) : null
    return {
      strike: c.strike, type: 'call',
      bid: c.bid ?? 0, ask: c.ask ?? 0, mid: c.mid ?? (c.bid && c.ask ? +((c.bid + c.ask) / 2).toFixed(2) : null),
      lastPrice: c.lastPrice ?? null, volume: c.volume ?? 0, openInterest: c.openInterest ?? 0,
      iv: (rawIV && rawIV > 0.001) ? rawIV : estIV,
      delta: rawDelta ?? estimatedDelta,
      gamma: c.greeks?.gamma ?? (estimatedDelta ? 0.01 : null),
      theta: c.greeks?.theta ?? null, vega: c.greeks?.vega ?? null, rho: c.greeks?.rho ?? null,
      inTheMoney: c.inTheMoney ?? null, contractSymbol: c.contractName ?? c.symbol ?? null,
      expirationDate: selectedExpiry, dte, estimated: !c.greeks?.delta,
      score: computeScore(null, rawIV, c.volume || 0, c.openInterest || 0, estimatedDelta, estIV),
    }
  })

  const puts = (optionSet.options?.put || []).map(p => {
    const isCall = false
    const rawDelta = p.greeks?.delta ?? null
    const estimatedDelta = rawDelta != null ? null : estimateDelta(p.strike, underlyingPrice || p.strike, isCall, dte || 30)
    const rawIV = p.impliedVolatility ?? null
    const estIV = (!rawIV || rawIV < 0.001) && p.mid > 0 ? estimateIV(p.mid, p.strike, underlyingPrice || p.strike, dte || 30, isCall) : null
    return {
      strike: p.strike, type: 'put',
      bid: p.bid ?? 0, ask: p.ask ?? 0, mid: p.mid ?? (p.bid && p.ask ? +((p.bid + p.ask) / 2).toFixed(2) : null),
      lastPrice: p.lastPrice ?? null, volume: p.volume ?? 0, openInterest: p.openInterest ?? 0,
      iv: (rawIV && rawIV > 0.001) ? rawIV : estIV,
      delta: rawDelta ?? estimatedDelta,
      gamma: p.greeks?.gamma ?? (estimatedDelta ? 0.01 : null),
      theta: p.greeks?.theta ?? null, vega: p.greeks?.vega ?? null, rho: p.greeks?.rho ?? null,
      inTheMoney: p.inTheMoney ?? null, contractSymbol: p.contractName ?? p.symbol ?? null,
      expirationDate: selectedExpiry, dte, estimated: !p.greeks?.delta,
      score: computeScore(null, rawIV, p.volume || 0, p.openInterest || 0, estimatedDelta, estIV),
    }
  })

  return {
    underlying: symbol, underlyingPrice,
    expirationDates, selectedExpiry, dte,
    strikes: [...new Set([...calls, ...puts].map(c => c.strike))].sort((a, b) => a - b),
    chain: [...calls, ...puts],
    _provider: 'finnhub',
  }
}

// ─── Chart ─────────────────────────────────────────────────────
export async function chart(symbol, { period1, period2, interval = '1d' } = {}) {
  const sym = finnhubSymbol(symbol)
  const resolutionMap = { '1d': 'D', '1h': '60', '5m': '5', '15m': '15', '1w': 'W', '1M': 'M' }
  const resolution = resolutionMap[interval] || 'D'
  const to = Math.floor((period2 ? new Date(period2) : new Date()).getTime() / 1000)
  const from = Math.floor((period1 ? new Date(period1) : new Date(Date.now() - 400 * 86400000)).getTime() / 1000)
  const data = await finnhubFetch('/stock/candle', { symbol: sym, resolution, from: String(from), to: String(to) })

  if (data.s !== 'ok' || !data.t || !data.t.length) return { quotes: [], _provider: 'finnhub' }
  return {
    quotes: data.t.map((timestamp, i) => ({
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      open: data.o[i], high: data.h[i], low: data.l[i], close: data.c[i], volume: data.v[i],
    })),
    _provider: 'finnhub',
  }
}

// ─── News ──────────────────────────────────────────────────────
export async function news(symbol = null, limit = 20) {
  const from = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const to = new Date().toISOString().split('T')[0]
  const params = { from, to }
  if (symbol) params.symbol = finnhubSymbol(symbol)
  const data = await finnhubFetch('/company-news', params)
  return (Array.isArray(data) ? data : []).slice(0, limit).map(item => ({
    title: item.headline || item.title,
    url: item.url,
    source: item.source,
    category: 'general',
    published: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
    tickers: item.related ? item.related.split(',').map(t => t.trim()) : [],
    _provider: 'finnhub',
  }))
}

// ─── Health Check ──────────────────────────────────────────────
export async function healthCheck() {
  try {
    const data = await finnhubFetch('/quote', { symbol: 'AAPL' })
    return { ok: data.c != null, provider: 'finnhub', price: data.c }
  } catch (e) {
    return { ok: false, provider: 'finnhub', error: e.message }
  }
}

export default {
  quote, marketSnapshot, optionsChain, chart, news, healthCheck,
}