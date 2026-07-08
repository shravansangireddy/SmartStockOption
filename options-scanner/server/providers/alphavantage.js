/**
 * Alpha Vantage Provider
 *
 * Endpoints used:
 *   - GLOBAL_QUOTE       → quote
 *   - TIME_SERIES_DAILY   → chart (daily)
 *   - TIME_SERIES_INTRADAY → chart (intraday)
 *   - REALTIME_OPTIONS    → options chain (premium)
 *   - NEWS_SENTIMENT      → news
 *   - SYMBOL_SEARCH       → symbol search
 *   - Technical indicators: SMA, EMA, RSI, MACD, BBANDS, STOCH, ADX, ATR, etc.
 *
 * Free tier: 25 requests/day, 5 req/min
 * Premium: higher limits, intraday, options
 */

const AV_BASE = 'https://www.alphavantage.co/query'
const AV_KEY = process.env.ALPHAVANTAGE_API_KEY || '';

async function avFetch(params, timeoutMs = 15000) {
  const url = new URL(AV_BASE)
  url.searchParams.set('apikey', AV_KEY)
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'OptScan/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`[AV] ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  if (data['Error Message']) throw new Error(`[AV] ${data['Error Message']}`)
  // Rate limit handling
  if (data['Note'] && data['Note'].includes('call frequency')) {
    throw new Error(`[AV] Rate limited: ${data['Note']}`)
  }
  if (data['Information'] && data['Information'].includes('call frequency')) {
    throw new Error(`[AV] Rate limited: ${data['Information'].substring(0, 100)}`)
  }
  // Premium endpoint access
  if (data['Information'] && data['Information'].includes('premium')) {
    throw new Error(`[AV] Premium only: ${data['Information'].substring(0, 100)}`)
  }
  return data
}

// ─── Quote ─────────────────────────────────────────────────────
async function quote(symbol) {
  const data = await avFetch({ function: 'GLOBAL_QUOTE', symbol: symbol.replace(/^%5E/, '^') })
  const gq = data['Global Quote']
  if (!gq || !gq['01. symbol']) throw new Error(`[AV] No quote data for ${symbol}`)

  const price = parseFloat(gq['05. price'])
  const prevClose = parseFloat(gq['08. previous close price'])
  const change = parseFloat(gq['09. change'])
  const changePercent = parseFloat(gq['10. change percent']?.replace('%', ''))

  return {
    symbol: gq['01. symbol'],
    price,
    open: parseFloat(gq['02. open']),
    high: parseFloat(gq['03. high']),
    low: parseFloat(gq['04. low']),
    volume: parseInt(gq['06. volume']),
    latestTradingDay: gq['07. latest trading day'],
    previousClose: prevClose,
    change,
    changePercent: changePercent / 100,
    _provider: 'alphavantage',
  }
}

// ─── Chart ──────────────────────────────────────────────────────
async function chart(symbol, opts = {}) {
  const { period1, period2, interval = '1d' } = opts

  // Map interval to Alpha Vantage function
  let func, seriesKey, avInterval
  if (interval === '1d' || interval === 'daily') {
    func = 'TIME_SERIES_DAILY'
    seriesKey = 'Time Series (Daily)'
  } else if (['1m', '5m', '15m', '30m', '60m', '1h'].includes(interval)) {
    func = 'TIME_SERIES_INTRADAY'
    avInterval = interval === '1h' ? '60min' : interval.replace('m', 'min')
    if (avInterval === '1min') avInterval = '1min'
    seriesKey = `Time Series (${avInterval})`
  } else if (interval === '1w' || interval === 'weekly') {
    func = 'TIME_SERIES_WEEKLY'
    seriesKey = 'Weekly Time Series'
  } else if (interval === '1M' || interval === 'monthly') {
    func = 'TIME_SERIES_MONTHLY'
    seriesKey = 'Monthly Time Series'
  } else {
    func = 'TIME_SERIES_DAILY'
    seriesKey = 'Time Series (Daily)'
  }

  const params = { function: func, symbol: symbol.replace(/^%5E/, '^'), outputsize: 'full' }
  if (avInterval) params.interval = avInterval

  const data = await avFetch(params)
  const series = data[seriesKey]
  if (!series) throw new Error(`[AV] No chart data for ${symbol}`)

  const startDate = period1 ? new Date(period1) : new Date(Date.now() - 365 * 86400000)
  const endDate = period2 ? new Date(period2) : new Date()

  const quotes = []
  for (const [dateStr, values] of Object.entries(series)) {
    const d = new Date(dateStr)
    if (d < startDate || d > endDate) continue
    quotes.push({
      date: dateStr.split(' ')[0],
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
      volume: parseInt(values['5. volume']),
    })
  }
  // Sort chronologically
  quotes.sort((a, b) => new Date(a.date) - new Date(b.date))

  return { quotes, _provider: 'alphavantage' }
}

// ─── Options Chain ─────────────────────────────────────────────
// Alpha Vantage options require premium subscription
async function optionsChain(symbol, expiry) {
  try {
    const params = { function: 'REALTIME_OPTIONS', symbol: symbol.replace(/^%5E/, '^') }
    if (expiry) params.expiration_date = expiry

    const data = await avFetch(params)

    if (data.data && Array.isArray(data.data)) {
      // Premium options data format
      const chain = data.data
        .filter(c => expiry ? c.expiration_date === expiry : true)
        .map(c => ({
          contractSymbol: c.contract_symbol || c.ticker,
          type: (c.put_call || c.option_type || 'call').toLowerCase(),
          strike: parseFloat(c.strike),
          lastPrice: parseFloat(c.last_price || c.price || 0),
          bid: parseFloat(c.bid || 0),
          ask: parseFloat(c.ask || 0),
          mid: parseFloat(c.bid && c.ask ? (parseFloat(c.bid) + parseFloat(c.ask)) / 2 : c.last_price || 0),
          volume: parseInt(c.volume || 0),
          openInterest: parseInt(c.open_interest || 0),
          impliedVolatility: parseFloat(c.implied_volatility || 0),
          delta: parseFloat(c.delta || 0),
          gamma: parseFloat(c.gamma || 0),
          theta: parseFloat(c.theta || 0),
          vega: parseFloat(c.vega || 0),
          rho: parseFloat(c.rho || 0),
          expirationDate: c.expiration_date || expiry,
          dte: c.days_to_expiration || null,
        }))

      const calls = chain.filter(c => c.type === 'call')
      const puts = chain.filter(c => c.type === 'put')
      const strikes = [...new Set(chain.map(c => c.strike))].sort((a, b) => a - b)

      return {
        underlyingPrice: data.underlying_price || data.metadata?.underlying_price || null,
        selectedExpiry: expiry || (chain[0]?.expirationDate),
        dte: chain[0]?.dte || null,
        strikes,
        chain,
        calls,
        puts,
        expirationDates: [...new Set(chain.map(c => c.expirationDate))].sort(),
        _provider: 'alphavantage',
      }
    }

    // Fallback: if no premium access, throw to let caller fall back
    throw new Error(`[AV] Options data not available (requires premium subscription)`)
  } catch (e) {
    throw new Error(`[AV] Options error: ${e.message}`)
  }
}

// ─── News & Sentiment ──────────────────────────────────────────
async function news(symbol, limit = 10) {
  const params = {
    function: 'NEWS_SENTIMENT',
    limit: String(limit),
  }
  if (symbol) params.tickers = symbol.replace(/^%5E/, '^')

  const data = await avFetch(params)
  const feed = data.feed || []

  return feed.slice(0, limit).map(item => ({
    title: item.title || '',
    source: item.source || '',
    date: item.time_published || item.published_at || '',
    url: item.url || '',
    summary: (item.summary || '').substring(0, 300),
    sentiment: item.overall_sentiment_label || null,
    sentimentScore: item.overall_sentiment_score != null ? parseFloat(item.overall_sentiment_score) : null,
    tickers: item.ticker_sentiment?.map(t => t.ticker) || [],
    _provider: 'alphavantage',
  }))
}

// ─── Technical Indicators ───────────────────────────────────────
async function technicalIndicator(symbol, indicator, opts = {}) {
  const params = {
    function: indicator.toUpperCase(),
    symbol: symbol.replace(/^%5E/, '^'),
    interval: opts.interval || 'daily',
    ...opts,
  }
  delete params.symbol // already set
  params.symbol = symbol.replace(/^%5E/, '^')

  // Map common indicator names
  const indicatorMap = {
    'sma': 'SMA', 'ema': 'EMA', 'wma': 'WMA', 'dema': 'DEMA', 'tema': 'TEMA',
    'rsi': 'RSI', 'macd': 'MACD', 'macdext': 'MACDEXT', 'stoch': 'STOCH',
    'stochf': 'STOCHF', 'stochrsi': 'STOCHRSI', 'willr': 'WILLR',
    'adx': 'ADX', 'adxr': 'ADXR', 'apo': 'APO', 'ppo': 'PPO',
    'mom': 'MOM', 'bop': 'BOP', 'cci': 'CCI', 'cmo': 'CMO',
    'roc': 'ROC', 'rocr': 'ROCR', 'aroon': 'AROON', 'aroonosc': 'AROONOSC',
    'mfi': 'MFI', 'trix': 'TRIX', 'ultosc': 'ULTOSC', 'dx': 'DX',
    'minus_di': 'MINUS_DI', 'plus_di': 'PLUS_DI', 'minus_dm': 'MINUS_DM', 'plus_dm': 'PLUS_DM',
    'bbands': 'BBANDS', 'midpoint': 'MIDPOINT', 'midprice': 'MIDPRICE',
    'sar': 'SAR', 'trange': 'TRANGE', 'atr': 'ATR', 'natr': 'NATR',
    'ad': 'AD', 'adosc': 'ADOSC', 'obv': 'OBV',
    'ht_trendline': 'HT_TRENDLINE', 'ht_sine': 'HT_SINE', 'ht_trendmode': 'HT_TRENDMODE',
    'ht_dcperiod': 'HT_DCPERIOD', 'ht_dcphase': 'HT_DCPHASE', 'ht_phasor': 'HT_PHASOR',
    'vwap': 'VWAP', 'kama': 'KAMA', 'mama': 'MAMA', 't3': 'T3',
  }

  const funcName = indicatorMap[indicator.toLowerCase()] || indicator.toUpperCase()
  params.function = funcName

  // Add series_type if needed
  if (!params.series_type) params.series_type = 'close'
  // Add time_period default
  if (!params.time_period && ['SMA', 'EMA', 'WMA', 'DEMA', 'TEMA', 'RSI', 'ADX', 'ADXR', 'CCI', 'CMO', 'AROON', 'MFI', 'TRIX', 'ULTOSC', 'ATR', 'NATR'].includes(funcName)) {
    params.time_period = '14'
  }

  const data = await avFetch(params)
  return { ...data, _provider: 'alphavantage', indicator: funcName }
}

// ─── Company Overview ───────────────────────────────────────────
async function companyOverview(symbol) {
  const data = await avFetch({
    function: 'OVERVIEW',
    symbol: symbol.replace(/^%5E/, '^'),
  })
  if (!data.Symbol) throw new Error(`[AV] No overview for ${symbol}`)
  return {
    symbol: data.Symbol,
    name: data.Name,
    description: data.Description,
    exchange: data.Exchange,
    currency: data.Currency,
    country: data.Country,
    sector: data.Sector,
    industry: data.Industry,
    marketCap: data.MarketCapitalization ? parseFloat(data.MarketCapitalization) : null,
    peRatio: data.PERatio ? parseFloat(data.PERatio) : null,
    pegRatio: data.PEGRatio ? parseFloat(data.PEGRatio) : null,
    bookValue: data.BookValue ? parseFloat(data.BookValue) : null,
    dividendPerShare: data.DividendPerShare ? parseFloat(data.DividendPerShare) : null,
    dividendYield: data.DividendYield ? parseFloat(data.DividendYield) : null,
    eps: data.EPS ? parseFloat(data.EPS) : null,
    revenueTTM: data.RevenueTTM ? parseFloat(data.RevenueTTM) : null,
    profitMargin: data.ProfitMargin ? parseFloat(data.ProfitMargin) : null,
    week52High: data['52WeekHigh'] ? parseFloat(data['52WeekHigh']) : null,
    week52Low: data['52WeekLow'] ? parseFloat(data['52WeekLow']) : null,
    analystTargetPrice: data.AnalystTargetPrice ? parseFloat(data.AnalystTargetPrice) : null,
    _provider: 'alphavantage',
  }
}

// ─── Top Gainers/Losers ─────────────────────────────────────────
async function topGainersLosers() {
  const data = await avFetch({ function: 'TOP_GAINERS_LOSERS' })
  return {
    gainers: (data.top_gainers || []).map(g => ({
      symbol: g.ticker,
      price: parseFloat(g.price),
      changeAmount: parseFloat(g.change_amount),
      changePercent: parseFloat(g.change_percentage?.replace('%', '')) / 100,
      volume: parseInt(g.volume),
      _provider: 'alphavantage',
    })),
    losers: (data.top_losers || []).map(l => ({
      symbol: l.ticker,
      price: parseFloat(l.price),
      changeAmount: parseFloat(l.change_amount),
      changePercent: parseFloat(l.change_percentage?.replace('%', '')) / 100,
      volume: parseInt(l.volume),
      _provider: 'alphavantage',
    })),
    _provider: 'alphavantage',
  }
}

// ─── Market Snapshot ─────────────────────────────────────────────
async function marketSnapshot() {
  const symbols = ['SPY', 'QQQ', 'IWM', 'DIA', '^VIX', 'GLD', 'TLT', 'HYG']
  const snapshot = {}
  // Sequential to respect rate limits
  for (const sym of symbols) {
    try {
      const q = await quote(sym)
      const key = sym.replace('^', '')
      snapshot[key] = {
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        _provider: 'alphavantage',
      }
    } catch (e) {
      console.warn(`[AV] Market snapshot failed for ${sym}: ${e.message}`)
    }
  }
  return snapshot
}

// ─── Health Check ────────────────────────────────────────────────
async function healthCheck() {
  try {
    const q = await quote('AAPL')
    return { ok: true, provider: 'alphavantage', price: q.price }
  } catch (e) {
    return { ok: false, provider: 'alphavantage', error: e.message }
  }
}

// ─── Provider Interface ──────────────────────────────────────────
export default {
  name: 'alphavantage',
  quote,
  chart,
  optionsChain,
  news,
  technicalIndicator,
  companyOverview,
  topGainersLosers,
  marketSnapshot,
  healthCheck,
  capabilities: ['quotes', 'history', 'news', 'fundamentals', 'technicals'],
}