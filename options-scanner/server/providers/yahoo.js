/**
 * Yahoo Finance Provider
 *
 * Uses yahoo-finance2 (yf) instance passed in or created internally.
 * Wraps all Yahoo Finance calls to return standardized shapes.
 */

import YahooFinance from 'yahoo-finance2'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] })

// ─── Robust date normalization ─────────────────────────────────
function normalizeToDateStr(val) {
  if (!val) return null
  if (typeof val === 'number') {
    const ms = val > 1e12 ? val : val * 1000
    return new Date(ms).toISOString().split('T')[0]
  }
  if (val instanceof Date || (typeof val === 'object' && typeof val.getTime === 'function' && !isNaN(val.getTime()))) {
    return val.toISOString().split('T')[0]
  }
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
    if (val.includes('T')) return val.split('T')[0]
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }
  try { const d = new Date(val); if (!isNaN(d.getTime())) return d.toISOString().split('T')[0] } catch {}
  return null
}

function toEpochMs(val) {
  if (!val) return null
  if (typeof val === 'number') return val > 1e12 ? val : val * 1000
  if (typeof val === 'object' && typeof val.getTime === 'function' && !isNaN(val.getTime())) return val.getTime()
  if (typeof val === 'string') { const d = new Date(val); if (!isNaN(d.getTime())) return d.getTime() }
  return null
}

// ─── Delta/IV estimation (fallback when Greeks not available) ──
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
  const spread = greeks?.mid ? Math.abs(greeks.ask - greeks.bid) / greeks.mid : null
  if (spread != null && spread < 0.05) score += 10; else if (spread != null && spread < 0.1) score += 5
  return Math.min(100, Math.round(score))
}

// ─── Quote ────────────────────────────────────────────────────
export async function quote(symbol) {
  const q = await yf.quote(symbol)
  return {
    symbol: q.symbol,
    price: q.regularMarketPrice,
    change: q.regularMarketChange,
    changePercent: q.regularMarketChangePercent,
    volume: q.regularMarketVolume,
    dayHigh: q.regularMarketDayHigh,
    dayLow: q.regularMarketDayLow,
    fiftyDayAvg: q.fiftyDayAverage,
    twoHundredDayAvg: q.twoHundredDayAverage,
    bid: q.bid ?? null,
    ask: q.ask ?? null,
    mid: (q.bid && q.ask) ? +((q.bid + q.ask) / 2).toFixed(2) : null,
    _provider: 'yahoo',
  }
}

// ─── Market Snapshot ──────────────────────────────────────────
export async function marketSnapshot() {
  const indices = ['SPY', 'QQQ', 'IWM', 'DIA', '^DJI', '^IXIC', '^VIX']
  const results = {}
  for (const sym of indices) {
    try {
      const q = await yf.quote(sym)
      results[sym] = {
        symbol: sym,
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
      }
    } catch (e) {
      results[sym] = { symbol: sym, price: null, change: null, changePercent: null, error: e.message }
    }
  }
  return { ...results, _provider: 'yahoo' }
}

// ─── Options Chain ────────────────────────────────────────────
export async function optionsChain(symbol, expiryDate = null) {
  let dateOption = {}
  let cleanedDate = null
  if (expiryDate) {
    let dateStr = expiryDate
    if (!isNaN(expiryDate)) {
      const ms = Number(expiryDate) > 1e12 ? Number(expiryDate) : Number(expiryDate) * 1000
      dateStr = new Date(ms).toISOString().split('T')[0]
    } else if (expiryDate.includes('T')) {
      dateStr = expiryDate.split('T')[0]
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      cleanedDate = dateStr
      dateOption = { date: dateStr }
    }
  }

  const options = await yf.options(symbol, dateOption)
  const underlyingPrice = options.currentPrice ?? options.quote?.regularMarketPrice ?? null
  const fallbackDate = options.expirationDates?.[0] ? normalizeToDateStr(options.expirationDates[0]) : null

  // Find best expiration for setups: 25-60 DTE primary, 15-90 fallback
  const now = Date.now()
  const expiries = options.expirationDates || []
  let bestExpiry = null, bestDte = null
  for (const exp of expiries) {
    const expMs = toEpochMs(exp)
    if (expMs === null) continue
    const dte = Math.ceil((expMs - now) / 86400000)
    if (dte >= 25 && dte <= 60) { bestExpiry = exp; bestDte = dte; break }
  }
  if (!bestExpiry) {
    for (const exp of expiries) {
      const expMs = toEpochMs(exp)
      if (expMs === null) continue
      const dte = Math.ceil((expMs - now) / 86400000)
      if (dte >= 15 && dte <= 90) { bestExpiry = exp; bestDte = dte; break }
    }
  }
  if (!bestExpiry) {
    for (const exp of expiries) {
      const expMs = toEpochMs(exp)
      if (expMs === null) continue
      const dte = Math.ceil((expMs - now) / 86400000)
      if (dte > 5) { bestExpiry = exp; bestDte = dte; break }
    }
  }
  if (!bestExpiry && expiries.length > 0) {
    bestExpiry = expiries[0]
    const expMs = toEpochMs(expiries[0])
    bestDte = expMs ? Math.ceil((expMs - now) / 86400000) : null
  }

  // Fetch options for selected expiry
  let expiryOptions = options
  const dateStr = normalizeToDateStr(bestExpiry)
  if (dateStr) {
    try {
      expiryOptions = await yf.options(symbol, { date: dateStr })
    } catch (e) {
      // Use default options
    }
  }

  const opts = expiryOptions.options?.[0] || options.options?.[0] || {}
  const calls = (opts.calls || []).map(c => {
    const isCall = true
    const rawDelta = c.delta ?? null
    const estimatedDelta = rawDelta != null ? null : estimateDelta(c.strike, underlyingPrice || c.strike, isCall, bestDte || 30)
    const delta = rawDelta != null ? rawDelta : estimatedDelta
    const rawIV = c.impliedVolatility ?? null
    const estIV = (!rawIV || rawIV < 0.001) && ((c.bid && c.ask) ? (c.bid + c.ask) / 2 : c.lastPrice) > 0
      ? estimateIV(((c.bid && c.ask) ? (c.bid + c.ask) / 2 : c.lastPrice), c.strike, underlyingPrice || c.strike, bestDte || 30, isCall) : null
    const effectiveIV = (rawIV && rawIV > 0.001) ? rawIV : estIV
    return {
      ...c,
      type: 'call',
      mid: c.mid || (c.bid && c.ask ? +((c.bid + c.ask) / 2).toFixed(2) : null),
      iv: effectiveIV,
      delta,
      gamma: c.gamma ?? (estimatedDelta ? 0.01 : null),
      theta: c.theta ?? null,
      vega: c.vega ?? null,
      rho: c.rho ?? null,
      dte: bestDte,
      expirationDate: dateStr || cleanedDate,
      score: computeScore(c, rawIV, c.volume || 0, c.openInterest || 0, estimatedDelta, estIV),
    }
  })

  const puts = (opts.puts || []).map(p => {
    const isCall = false
    const rawDelta = p.delta ?? null
    const estimatedDelta = rawDelta != null ? null : estimateDelta(p.strike, underlyingPrice || p.strike, isCall, bestDte || 30)
    const delta = rawDelta != null ? rawDelta : estimatedDelta
    const rawIV = p.impliedVolatility ?? null
    const estIV = (!rawIV || rawIV < 0.001) && ((p.bid && p.ask) ? (p.bid + p.ask) / 2 : p.lastPrice) > 0
      ? estimateIV(((p.bid && p.ask) ? (p.bid + p.ask) / 2 : p.lastPrice), p.strike, underlyingPrice || p.strike, bestDte || 30, isCall) : null
    const effectiveIV = (rawIV && rawIV > 0.001) ? rawIV : estIV
    return {
      ...p,
      type: 'put',
      mid: p.mid || (p.bid && p.ask ? +((p.bid + p.ask) / 2).toFixed(2) : null),
      iv: effectiveIV,
      delta,
      gamma: p.gamma ?? (estimatedDelta ? 0.01 : null),
      theta: p.theta ?? null,
      vega: p.vega ?? null,
      rho: p.rho ?? null,
      dte: bestDte,
      expirationDate: dateStr || cleanedDate,
      score: computeScore(p, rawIV, p.volume || 0, p.openInterest || 0, estimatedDelta, estIV),
    }
  })

  return {
    underlying: symbol,
    underlyingPrice,
    expirationDates: (options.expirationDates || []).map(d => normalizeToDateStr(d)),
    selectedExpiry: dateStr || cleanedDate,
    dte: bestDte,
    strikes: [...new Set([...calls, ...puts].map(c => c.strike))].sort((a, b) => a - b),
    chain: [...calls, ...puts],
    _provider: 'yahoo',
  }
}

// ─── Chart ─────────────────────────────────────────────────────
export async function chart(symbol, { period1, period2, interval = '1d' } = {}) {
  const result = await yf.chart(symbol, { period1, period2, interval })
  return {
    quotes: result.quotes || [],
    _provider: 'yahoo',
  }
}

// ─── News ──────────────────────────────────────────────────────
export async function news(symbol = null, limit = 20) {
  try {
    const q = symbol ? await yf.search(symbol) : null
    const items = q?.news || []
    return items.slice(0, limit).map(item => ({
      title: item.title,
      url: item.link,
      source: item.publisher,
      category: 'general',
      published: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
      tickers: item.symbols || (symbol ? [symbol] : []),
      _provider: 'yahoo',
    }))
  } catch {
    return []
  }
}

// ─── Health Check ─────────────────────────────────────────────
export async function healthCheck() {
  try {
    const q = await yf.quote('SPY')
    return { ok: q.regularMarketPrice != null, provider: 'yahoo', price: q.regularMarketPrice }
  } catch (e) {
    return { ok: false, provider: 'yahoo', error: e.message }
  }
}

// Export the raw yahoo-finance2 instance for backward-compatible direct access
export { yf }

// Export utility functions for use by other modules
export { normalizeToDateStr, toEpochMs, computeScore, estimateDelta, estimateIV }

export default {
  quote,
  marketSnapshot,
  optionsChain,
  chart,
  news,
  healthCheck,
}