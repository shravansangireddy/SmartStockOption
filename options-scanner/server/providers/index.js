/**
 * Provider Factory — Unified data provider interface
 *
 * Each provider implements:
 *   quote(symbol)           → { symbol, price, change, changePercent, volume, dayHigh, dayLow, fiftyDayAvg, twoHundredDayAvg, bid, ask, mid, _provider }
 *   marketSnapshot()        → { SPY: { symbol, price, change, changePercent }, ... }
 *   optionsChain(symbol, expiryDate?) → { underlying, underlyingPrice, expirationDates, selectedExpiry, dte, strikes, chain[], _provider }
 *   chart(symbol, opts?)    → { quotes[], _provider }
 *   news(symbol?, limit?)   → [{ title, url, source, category, published, tickers, _provider }]
 *   healthCheck()           → { ok, provider, error? }
 *
 * Usage:
 *   import { getProvider } from './providers/index.js'
 *   const provider = getProvider('public')
 *   const q = await provider.quote('SPY')
 */

import yahooProvider from './yahoo.js'
import publicProvider from './public-com.js'
import finnhubProvider from './finnhub.js'
import alphavantageProvider from './alphavantage.js'

const providers = {
  yahoo: yahooProvider,
  public: publicProvider,
  finnhub: finnhubProvider,
  alphavantage: alphavantageProvider,
}

/**
 * Get a provider by name. Returns yahoo as fallback if name is unknown.
 * @param {string} name - 'public' | 'finnhub' | 'yahoo' | 'alphavantage'
 * @returns {object} provider object
 */
export function getProviderByName(name) {
  return providers[name] || providers.yahoo
}

/**
 * Resolve provider from an Express request. Checks ?provider= and X-Data-Provider header.
 * @param {object} req - Express request
 * @returns {object} provider object
 */
export function getProviderFromRequest(req) {
  const p = (req.query.provider || req.headers['x-data-provider'] || '').toLowerCase()
  if (p === 'public' || p === 'public.com') return providers.public
  if (p === 'finnhub') return providers.finnhub
  if (p === 'alphavantage' || p === 'av') return providers.alphavantage
  return providers.yahoo
}

/**
 * Get all provider names
 */
export function getProviderNames() {
  return Object.keys(providers)
}

export { yahooProvider, publicProvider, finnhubProvider, alphavantageProvider }
export default providers