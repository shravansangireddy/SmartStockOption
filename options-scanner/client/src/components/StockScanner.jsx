import { useState, useEffect, useCallback } from 'react'

const API = '/api'

const PRESETS = {
  valueMomentum: {
    name: 'Value Momentum',
    description: 'Low D/E, low P/B & P/E, high ROE, above all SMAs, high relative volume',
    filters: 'fa_debteq_u1,fa_pb_u3,fa_pe_u25,fa_roe_o10,geo_usa,sh_avgvol_o500,sh_price_o10,sh_relvol_o1.5,ta_sma20_pa,ta_sma200_pa,ta_sma50_pa',
    view: 111,
    sort: '-relativevolume',
    ft: 2,
  },
  smallCapBreakout: {
    name: 'Small Cap Breakout',
    description: 'Small caps with new 50d highs, above SMA50, high relative volume',
    filters: 'cap_small,sh_avgvol_o300,sh_price_o5,sh_relvol_o1,ta_averagetruerange_o1,ta_highlow50d_nh,ta_sma50_pa',
    view: 111,
    sort: '-change',
    ft: 2,
  },
  midCapInstAccum: {
    name: 'Mid Cap Institutional Accumulation',
    description: 'Mid caps with high institutional ownership, positive transactions, new 50d highs',
    filters: 'cap_mid,sh_avgvol_o300,sh_price_o5,sh_relvol_o1,ta_averagetruerange_o1,ta_highlow50d_nh,ta_sma50_pa,sh_instown_o50,sh_insttrans_positive',
    view: 131,
    sort: '-insttrans',
    ft: 2,
  },
  instMomentum: {
    name: 'Institutional Momentum',
    description: 'High institutional ownership, positive transactions, above SMA50',
    filters: 'sh_avgvol_o300,sh_instown_o50,sh_price_o5,sh_relvol_o1,ta_averagetruerange_o1,ta_highlow50d_nh,ta_sma50_pa',
    view: 131,
    sort: '-relativevolume,-insttrans',
    ft: 2,
  },
}

function finvizUrl(preset) {
  return `https://finviz.com/screener.ashx?v=${preset.view}&f=${preset.filters}&ft=${preset.ft || 2}&o=${preset.sort}`
}

export default function StockScanner({ dataProvider = 'yahoo', onNavigateAnalysis = null } = {}) {
  const [preset, setPreset] = useState('valueMomentum')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sortBy, setSortBy] = useState('totalScore')
  const [sortDir, setSortDir] = useState('desc')
  const [maxStocks, setMaxStocks] = useState(20)
  const [customTickers, setCustomTickers] = useState('')

  const fetchScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ preset, maxStocks: String(maxStocks), provider: dataProvider })
      if (customTickers.trim()) params.set('tickers', customTickers.trim().toUpperCase())
      const res = await fetch(`${API}/stocker/scan?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResults(data)
    } catch (e) {
      setError(e.message)
      setResults(null)
    }
    setLoading(false)
  }, [preset, maxStocks, dataProvider, customTickers])

  useEffect(() => { fetchScan() }, [fetchScan])

  const stocks = results?.stocks || []
  const sortedStocks = [...stocks].sort((a, b) => {
    const getVal = (s, key) => {
      if (key === 'totalScore') return s.scores?.total || 0
      if (key === 'trend') return s.scores?.trend || 0
      if (key === 'volume') return s.scores?.volume || 0
      if (key === 'volatility') return s.scores?.volatility || 0
      if (key === 'price') return s.price || 0
      if (key === 'changePercent') {
        const raw = s.changePercent
        return typeof raw === 'string' ? parseFloat(raw) : (raw || 0)
      }
      if (key === 'rsi') return s.rsi || 0
      if (key === 'relativeVolume') return s.relativeVolume || 0
      return 0
    }
    const aVal = getVal(a, sortBy)
    const bVal = getVal(b, sortBy)
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal
  })

  const scoreColor = (s) => s >= 75 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 45 ? '#94a3b8' : '#ef4444'

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    else { setSortBy(key); setSortDir('desc') }
  }

  const SortIcon = ({ col }) => (
    <span className="ml-1 text-xs" style={{ color: sortBy === col ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
      {sortBy === col ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
    </span>
  )

  return (
    <div>
      {/* Header & Presets */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--accent-cyan)' }}>⬡ Stock Scanner</h2>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {results?.source === 'finviz' ? 'Finviz' : results?.source === 'yahoo' ? 'Yahoo Finance' : results?.source === 'public' ? 'Public.com' : 'Yahoo'}-screened stocks analyzed with our scoring engine
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={customTickers}
              onChange={e => setCustomTickers(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchScan()}
              placeholder="Custom tickers (AAPL,MSFT,NVDA)"
              className="px-3 py-1.5 rounded text-xs w-52"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
            />
            {customTickers && (
              <button
                onClick={() => { setCustomTickers(''); fetchScan() }}
                className="text-xs px-1.5 py-1 rounded"
                style={{ color: 'var(--text-secondary)' }}
                title="Clear custom tickers"
              >✕</button>
            )}
          </div>
          <select
            value={maxStocks}
            onChange={e => setMaxStocks(parseInt(e.target.value))}
            className="px-2 py-1.5 rounded text-xs"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            {[10, 20, 30, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
          </select>
          <button
            onClick={fetchScan}
            disabled={loading}
            className="px-4 py-1.5 rounded text-sm font-semibold"
            style={{ background: loading ? 'var(--bg-card)' : 'var(--accent-cyan)', color: loading ? 'var(--text-secondary)' : '#000' }}
          >
            {loading ? 'Scanning…' : '↻ Re-scan'}
          </button>
        </div>
      </div>

      {/* Preset Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {Object.entries(PRESETS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
            style={{
              background: preset === key ? 'var(--accent-cyan)' : 'var(--bg-card)',
              color: preset === key ? '#000' : 'var(--text-secondary)',
              border: `1px solid ${preset === key ? 'var(--accent-cyan)' : 'var(--border)'}`,
            }}
          >
            {val.name}
          </button>
        ))}
      </div>

      {/* Preset description & Finviz link */}
      {PRESETS[preset] && (
        <div className="p-3 rounded-lg mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-semibold">{PRESETS[preset].name}</div>
            {results?.source && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Source: {results.source === 'finviz' ? 'Finviz' : results.source === 'yahoo' ? 'Yahoo Finance' : results.source === 'public' ? 'Public.com' : results.source}
              </span>
            )}
          </div>
          <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{PRESETS[preset].description}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Finviz:</span>
            <a
              href={finvizUrl(PRESETS[preset])}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-secondary)', color: 'var(--accent-cyan)', border: '1px solid var(--border)' }}
            >
              View on Finviz ↗
            </a>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Filters: {PRESETS[preset].filters.split(',').length} criteria
            </span>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent-cyan)' }}></div>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Analyzing stocks with our scoring engine…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444' }}>
          <p>Error: {error}</p>
          <button onClick={fetchScan} className="mt-2 px-3 py-1 rounded text-sm" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Retry</button>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {results.analyzedCount || sortedStocks.length} stocks analyzed
            </div>
          </div>

          {sortedStocks.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
              <div className="text-3xl mb-2">🔍</div>
              <p>No stocks found matching criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th className="px-2 py-2 text-left font-semibold cursor-pointer" style={{ color: 'var(--text-secondary)' }} onClick={() => toggleSort('totalScore')}>
                      Score <SortIcon col="totalScore" />
                    </th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Symbol</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Trend</th>
                    <th className="px-2 py-2 text-right font-semibold cursor-pointer tabular" style={{ color: 'var(--text-secondary)' }} onClick={() => toggleSort('price')}>
                      Price <SortIcon col="price" />
                    </th>
                    <th className="px-2 py-2 text-right font-semibold cursor-pointer tabular" style={{ color: 'var(--text-secondary)' }} onClick={() => toggleSort('changePercent')}>
                      Change <SortIcon col="changePercent" />
                    </th>
                    <th className="px-2 py-2 text-right font-semibold cursor-pointer tabular" style={{ color: 'var(--text-secondary)' }} onClick={() => toggleSort('rsi')}>
                      RSI <SortIcon col="rsi" />
                    </th>
                    <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>ATR</th>
                    <th className="px-2 py-2 text-right font-semibold cursor-pointer tabular" style={{ color: 'var(--text-secondary)' }} onClick={() => toggleSort('relativeVolume')}>
                      Rel Vol <SortIcon col="relativeVolume" />
                    </th>
                    <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>SMA20</th>
                    <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>SMA50</th>
                    <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>SMA200</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>Signal</th>
                    <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Reason</th>
                    <th className="px-2 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>
                      <span title="Full Analysis">📊</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStocks.map((s, i) => {
                    const pctVal = typeof s.changePercent === 'string' ? parseFloat(s.changePercent) : (s.changePercent || 0)
                    const trendColor = s.trend?.includes('Up') || s.trend?.includes('Bull') ? '#22c55e'
                      : s.trend?.includes('Down') || s.trend?.includes('Bear') ? '#ef4444' : '#94a3b8'
                    const signal = s.signal || '—'
                    const signalBg = signal.includes('Buy') ? 'rgba(34,197,94,0.15)'
                      : signal.includes('Avoid') || signal.includes('Weak') ? 'rgba(239,68,68,0.15)'
                      : 'rgba(234,179,8,0.15)'
                    const signalColor = signal.includes('Buy') ? '#22c55e'
                      : signal.includes('Avoid') || signal.includes('Weak') ? '#ef4444'
                      : '#eab308'

                    return (
                      <tr key={i} className="transition-colors" style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td className="px-2 py-1.5">
                          <span className="font-bold text-sm" style={{ color: scoreColor(s.scores?.total || 0) }}>
                            {s.scores?.total || 0}
                          </span>
                          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            T{s.scores?.trend || 0} L{s.scores?.volume || 0} V{s.scores?.volatility || 0}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 font-bold" style={{ color: 'var(--accent-cyan)' }}>
                          {s.symbol || s.ticker}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="font-semibold" style={{ color: trendColor }}>{s.trend || '—'}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular font-semibold">${s.price?.toFixed(2) || '—'}</td>
                        <td className={`px-2 py-1.5 text-right tabular font-semibold ${pctVal >= 0 ? 'up' : 'down'}`} style={{ color: pctVal >= 0 ? '#22c55e' : '#ef4444' }}>
                          {pctVal >= 0 ? '+' : ''}{pctVal.toFixed(2)}%
                        </td>
                        <td className="px-2 py-1.5 text-right tabular" style={{
                          color: s.rsi > 70 ? '#ef4444' : s.rsi < 30 ? '#22c55e' : 'var(--text-secondary)'
                        }}>
                          {s.rsi?.toFixed(1) || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular">${s.atr?.toFixed(2) || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular font-semibold" style={{
                          color: s.relativeVolume > 2 ? '#22c55e' : s.relativeVolume > 1.5 ? '#eab308' : 'var(--text-secondary)'
                        }}>
                          {s.relativeVolume?.toFixed(1) || '—'}x
                        </td>
                        <td className="px-2 py-1.5 text-right tabular" style={{ color: s.price > s.sma20 ? '#22c55e' : '#ef4444' }}>
                          ${s.sma20?.toFixed(2) || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular" style={{ color: s.price > s.sma50 ? '#22c55e' : '#ef4444' }}>
                          ${s.sma50?.toFixed(2) || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular" style={{ color: s.price > s.sma200 ? '#22c55e' : '#ef4444' }}>
                          ${s.sma200?.toFixed(2) || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: signalBg, color: signalColor }}>
                            {signal}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.signalReason || s.technicalReason || ''}>
                          {s.signalReason || s.technicalReason || '—'}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <a
                            href={`/analysis.html#${s.symbol || s.ticker}`}
                            onClick={(e) => {
                              e.preventDefault()
                              if (onNavigateAnalysis) {
                                onNavigateAnalysis(s.symbol || s.ticker)
                              } else {
                                window.dispatchEvent(new CustomEvent('navigate-analysis', { detail: { symbol: s.symbol || s.ticker } }))
                              }
                            }}
                            className="px-2 py-0.5 rounded text-xs font-semibold transition-all"
                            style={{ background: 'var(--accent-cyan)', color: '#000' }}
                            title={`Analyze ${s.symbol || s.ticker}`}
                          >
                            📊
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Score Legend */}
          <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><span style={{ color: '#22c55e' }}>■ 75+</span> Strong Buy</div>
              <div><span style={{ color: '#eab308' }}>■ 60-74</span> Cautious Buy</div>
              <div><span style={{ color: '#94a3b8' }}>■ 45-59</span> Neutral</div>
              <div><span style={{ color: '#ef4444' }}>■ &lt;45</span> Weak / Avoid</div>
            </div>
            <div className="mt-2">
              Score = Trend(×0.4) + Liquidity(×0.3) + Volatility(×0.3) — SMA alignment: <span style={{ color: '#22c55e' }}>green</span> = price above, <span style={{ color: '#ef4444' }}>red</span> = below
            </div>
          </div>
        </>
      )}
    </div>
  )
}