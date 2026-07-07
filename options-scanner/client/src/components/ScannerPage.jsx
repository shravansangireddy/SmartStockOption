import { useState, useEffect, useCallback } from 'react'

const API = '/api'

export default function ScannerPage({ onAddWatchlist, dataProvider = 'yahoo' }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedRow, setSelectedRow] = useState(null)
  const [customTickers, setCustomTickers] = useState('')
  const [showTrace, setShowTrace] = useState(false)
  const [traceData, setTraceData] = useState(null)

  const fetchScanner = useCallback(async (tickers) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (tickers) params.set('tickers', tickers)
      params.set('topN', '10')
      if (showTrace) params.set('trace', '1')
      params.set('provider', dataProvider)
      const res = await fetch(`${API}/scanner?${params}`)
      if (!res.ok) throw new Error(`Scanner API: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (showTrace && data.trace) {
        setResults(data.results || data)
        setTraceData(data.trace)
      } else {
        setResults(data)
        setTraceData(null)
      }
    } catch (e) {
      setError(e.message)
      setResults([])
    }
    setLoading(false)
  }, [showTrace, dataProvider])

  useEffect(() => { fetchScanner() }, [fetchScanner])

  const scoreColor = (score) => {
    if (score >= 7) return 'var(--accent-green)'
    if (score >= 5) return 'var(--accent-orange)'
    return 'var(--accent-red)'
  }

  const directionBadge = (dir) => {
    const isBull = dir === 'Bullish'
    return {
      bg: isBull ? 'rgba(0,212,170,0.15)' : 'rgba(255,77,106,0.15)',
      color: isBull ? 'var(--accent-green)' : 'var(--accent-red)',
      icon: isBull ? '▲' : '▼',
    }
  }

  const rrColor = (rr) => {
    if (rr >= 2) return 'var(--accent-green)'
    if (rr >= 1.5) return 'var(--accent-orange)'
    return 'var(--accent-red)'
  }

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
        <div className="text-2xl mb-2 pulse-subtle">⬡</div>
        <div className="text-sm">Scanning S&P 500 options universe (AAPL, MSFT, NVDA, AMZN, META, GOOG, SPY, QQQ + ~500 stocks)…</div>
        <div className="text-xs mt-1">Computing 20/50/200 SMA · RSI · MACD · Stochastic · ATR · Swing points · OI/IV edge</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-xl mb-2" style={{ color: 'var(--accent-red)' }}>⚠</div>
        <div className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</div>
        <button onClick={() => fetchScanner(customTickers || undefined)} className="mt-3 px-4 py-2 rounded text-sm" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Retry</button>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
        <div className="text-2xl mb-2">⬡</div>
        <div className="text-sm">No qualifying setups found.</div>
        <div className="text-xs mt-1">Markets may lack clean swing setups with 25-60 DTE, OI ≥ 50, Δ 0.30-0.90, spread ≤ 15%.</div>
        <button onClick={() => fetchScanner(customTickers || undefined)} className="mt-3 px-4 py-2 rounded text-sm" style={{ background: 'var(--accent-cyan)', color: '#000' }}>Re-scan</button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--accent-cyan)' }}>◈ Options Scanner — Top 10</h2>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            25-60 DTE · OI ≥ 50 · Δ 0.30-0.90 · Spread ≤ 15% · R:R ≥ 2:1 · Score = 0.4×Trend + 0.3×Liq + 0.3×R:R
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customTickers}
            onChange={e => setCustomTickers(e.target.value)}
            placeholder="Custom tickers (comma-sep)"
            className="px-2 py-1 rounded text-xs"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', width: '180px' }}
            onKeyDown={e => { if (e.key === 'Enter') fetchScanner(customTickers) }}
          />
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: showTrace ? 'var(--accent-orange)' : 'var(--bg-card)', color: showTrace ? '#000' : 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            {showTrace ? '🔬 Trace ON' : '🔬 Data Flow'}
          </button>
          <button onClick={() => fetchScanner(customTickers || undefined)} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: 'var(--accent-cyan)', color: '#000' }}>
            ↻ Re-scan
          </button>
        </div>
      </div>

      {/* Trade Table */}
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>#</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Symbol</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Direction</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Strategy</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Timeframe</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Expiry</th>
              <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>Strike</th>
              <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>Δ</th>
              <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>Entry (Mid)</th>
              <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>OI</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Spread</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Technical Reason</th>
              <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Stop Loss</th>
              <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>Risk/ctr</th>
              <th className="px-2 py-2 text-right font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>R:R</th>
              <th className="px-2 py-2 text-center font-semibold tabular" style={{ color: 'var(--text-secondary)' }}>Score</th>
              <th className="px-2 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}>OI/IV</th>
              <th className="px-2 py-2 text-center font-semibold" style={{ color: 'var(--text-secondary)' }}></th>
              {showTrace && <th className="px-2 py-2 text-left font-semibold" style={{ color: 'var(--text-secondary)' }}>Pipeline</th>}
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const badge = directionBadge(r.direction)
              return (
                <tr
                  key={i}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--border)', background: selectedRow === i ? 'var(--bg-card-hover)' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedRow === i ? 'var(--bg-card-hover)' : 'transparent'}
                  onClick={() => setSelectedRow(selectedRow === i ? null : i)}
                >
                  <td className="px-2 py-1.5 font-bold tabular" style={{ color: 'var(--text-secondary)' }}>{i + 1}</td>
                  <td className="px-2 py-1.5 font-bold" style={{ color: badge.color }}>{r.symbol}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: badge.bg, color: badge.color }}>
                      {badge.icon} {r.direction}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs font-medium">{r.strategy}</td>
                  <td className="px-2 py-1.5 text-xs">{r.timeframe}</td>
                  <td className="px-2 py-1.5 text-xs tabular">{r.dte}d</td>
                  <td className="px-2 py-1.5 text-right tabular font-semibold">${r.strike}</td>
                  <td className="px-2 py-1.5 text-right tabular">{r.delta}</td>
                  <td className="px-2 py-1.5 text-right tabular font-semibold">${r.mid}</td>
                  <td className="px-2 py-1.5 text-right tabular">{r.openInterest?.toLocaleString()}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-1 py-0.5 rounded" style={{ background: r.spreadLabel === 'Tight' ? 'rgba(0,212,170,0.15)' : r.spreadLabel === 'Moderate' ? 'rgba(255,152,0,0.15)' : 'rgba(255,77,106,0.15)', color: r.spreadLabel === 'Tight' ? 'var(--accent-green)' : r.spreadLabel === 'Moderate' ? 'var(--accent-orange)' : 'var(--accent-red)' }}>
                      {r.spreadPct}% {r.spreadLabel}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.technicalReason}>{r.technicalReason}</td>
                  <td className="px-2 py-1.5 text-xs">
                    <span style={{ color: 'var(--accent-red)' }}>${r.stopPrice}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}> ({r.stopLevel})</span>
                    <br />
                    <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>opt ≈${r.optionStop}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular">${r.riskPerContract}</td>
                  <td className="px-2 py-1.5 text-right tabular font-bold" style={{ color: rrColor(r.rr) }}>{r.rr}:1</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className="font-bold text-sm" style={{ color: scoreColor(r.scores.overall) }}>{r.scores.overall}</span>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>T{r.scores.trend} L{r.scores.liquidity} R{r.scores.riskReward}</div>
                  </td>
                  <td className="px-2 py-1.5 text-center text-xs">
                    {r.oiIvEdge >= 2 ? '🔥 Strong' : r.oiIvEdge === 1 ? '✓ Mod' : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {onAddWatchlist && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddWatchlist({
                            ...r,
                            id: `${r.symbol}-${r.type}-${r.strike}-${Date.now()}`,
                            ticker: r.symbol,
                            addedPrice: r.underlyingPrice,
                          });
                        }}
                        className="text-xs px-2 py-0.5 rounded transition-all"
                        style={{ background: 'var(--accent-cyan)', color: '#000' }}
                        title="Add to watchlist"
                      >+ Watch</button>
                    )}
                  </td>
                  {showTrace && <td className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-secondary)', maxWidth: '200px' }}>
                    {r._pipeline ? (
                      <>
                        <span style={{ color: 'var(--accent-green)' }}>{r._pipeline.passedFilters}</span>/{r._pipeline.totalContracts} passed · <span style={{ color: 'var(--accent-red)' }}>{r._pipeline.omitted}</span> omitted
                        {r._pipeline.omittedReasons?.length > 0 && (
                          <div className="mt-0.5 text-xs" style={{ lineHeight: '1.3' }}>
                            {r._pipeline.omittedReasons.map((o, j) => (
                              <div key={j}>${o.strike} {o.type}: {o.reasons.join(', ')}</div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>Turn on 🔬 Data Flow</span>
                    )}
                  </td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Data Flow & Omission Trace Panel */}
      {showTrace && traceData && (
        <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-orange)' }}>🔬 Data Flow & Omission Reasons</h3>
          <div className="space-y-3">
            {traceData.map((t, i) => (
              <div key={i} className="p-3 rounded" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-bold" style={{ color: t.direction === 'Bullish' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{t.symbol}</span>
                    <span className="ml-2 text-xs" style={{ color: 'var(--text-secondary)' }}>{t.direction} · {t.setup}</span>
                  </div>
                  <div className="text-xs tabular">
                    <span style={{ color: 'var(--accent-green)' }}>{t.passedFilters}</span>
                    <span style={{ color: 'var(--text-secondary)' }}> / {t.totalContracts} passed</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                  <span>Price: <span style={{ color: 'var(--text-primary)' }}>${t.underlyingPrice}</span></span>
                  <span>SMA20: ${t.sma20}</span>
                  <span>SMA50: ${t.sma50}</span>
                  <span>SMA200: ${t.sma200}</span>
                  <span>RSI: {t.rsi}</span>
                  <span>MACD: {t.macdCrossover || '—'}</span>
                  <span>Stoch: {t.stochastic != null ? `${t.stochastic}%` : '—'}</span>
                  <span>Expiry: {t.bestExpiry} ({t.bestDte}d)</span>
                </div>
                {t.omitted.length > 0 ? (
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent-red)' }}>❌ Omitted ({t.omitted.length}):</div>
                    <div className="max-h-32 overflow-y-auto">
                      {t.omitted.slice(0, 20).map((o, j) => (
                        <div key={j} className="text-xs py-0.5" style={{ color: 'var(--text-secondary)' }}>
                          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>${o.strike} {o.type}</span>
                          <span className="ml-1"> — {o.reasons.join('; ')}</span>
                          {o.oi != null && <span className="ml-1" style={{ color: 'var(--text-secondary)' }}>(OI:{o.oi}</span>}
                          {o.delta != null && <span style={{ color: 'var(--text-secondary)' }}> Δ:{o.delta}</span>}
                          {o.spread != null && <span style={{ color: 'var(--text-secondary)' }}> Spd:{o.spread}%</span>}
                          {o.mid != null && <span style={{ color: 'var(--text-secondary)' }}> Mid:${o.mid}</span>}
                        </div>
                      ))}
                      {t.omitted.length > 20 && <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>… and {t.omitted.length - 20} more</div>}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--accent-green)' }}>✓ All contracts passed filters</div>
                )}
                {t.topCandidates.length > 0 && (
                  <div className="mt-1">
                    <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent-green)' }}>✓ Selected:</div>
                    {t.topCandidates.map((c, j) => (
                      <div key={j} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {c.contract}: ${c.strike} {c.type} @ ${c.mid} · Δ{c.delta} · Score {c.score}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail panel for selected row */}
      {selectedRow !== null && results[selectedRow] && (
        <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {(() => {
            const r = results[selectedRow]
            const badge = directionBadge(r.direction)
            return (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl font-bold" style={{ color: badge.color }}>{r.symbol}</span>
                  <span className="px-2 py-0.5 rounded text-sm font-semibold" style={{ background: badge.bg, color: badge.color }}>{badge.icon} {r.direction}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{r.strategy} · {r.timeframe}</span>
                  <span className="ml-auto text-lg font-bold" style={{ color: scoreColor(r.scores.overall) }}>Score: {r.scores.overall}/10</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {/* Underlying & SMAs */}
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Underlying</div>
                    <div className="text-lg font-bold" style={{ color: badge.color }}>{r.symbol} ${r.underlyingPrice}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      SMA20: ${r.sma20}<br />
                      SMA50: ${r.sma50}<br />
                      SMA200: ${r.sma200}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Trend: <span style={{ color: r.trend === 'Bullish' ? 'var(--accent-green)' : r.trend === 'Bearish' ? 'var(--accent-red)' : 'var(--text-secondary)' }}>{r.trend}</span>
                      {r.sma20 > r.sma50 && r.sma50 > r.sma200 ? ' · SMAs aligned ✓' : ''}
                    </div>
                  </div>
                  {/* Indicators */}
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Indicators</div>
                    <div className="text-xs">
                      RSI: <span style={{ color: r.rsi < 30 ? 'var(--accent-red)' : r.rsi > 70 ? 'var(--accent-orange)' : 'var(--accent-green)' }}>{r.rsi}</span><br />
                      MACD: <span style={{ color: r.macdCrossover === 'Bullish' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{r.macdCrossover || '—'}</span><br />
                      Stochastic: {r.stochastic !== null ? `${r.stochastic}%` : '—'}{r.stochastic < 20 ? ' (Oversold)' : r.stochastic > 80 ? ' (Overbought)' : ''}<br />
                      Setup: {r.setup}
                    </div>
                  </div>
                  {/* Contract */}
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Contract</div>
                    <div className="font-semibold">{r.type} ${r.strike} · {r.dte}DTE · {r.atm}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Mid ${r.mid} · Spread {r.spreadPct}% {r.spreadLabel}<br />
                      IV {r.iv}%<br />
                      OI {r.openInterest?.toLocaleString()} · Vol {r.volume?.toLocaleString()}
                    </div>
                  </div>
                  {/* Greeks */}
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Greeks</div>
                    <div className="text-xs">
                      Δ {r.delta} · Γ {r.gamma}<br />
                      Θ {r.theta}<br />
                      IV {r.iv}%
                    </div>
                  </div>
                  {/* Risk/Reward */}
                  <div>
                    <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Risk / Reward</div>
                    <div className="text-xs">
                      <span style={{ color: 'var(--accent-red)' }}>Stop: ${r.stopPrice} ({r.stopLevel})</span><br />
                      <span style={{ color: 'var(--accent-red)' }}>Opt Stop: ≈${r.optionStop}</span><br />
                      <span style={{ color: 'var(--accent-green)' }}>Target: ${r.targetPrice}</span><br />
                      <span style={{ color: 'var(--accent-green)' }}>Opt Target: ≈${r.targetOption}</span><br />
                      Risk/ctr: ${r.riskPerContract} · <span style={{ color: rrColor(r.rr) }}>R:R {r.rr}:1</span>
                    </div>
                  </div>
                </div>
                {/* Scoring Breakdown */}
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Scoring</div>
                      <div className="text-sm font-bold" style={{ color: scoreColor(r.scores.overall) }}>{r.scores.overall}/10</div>
                    </div>
                    <div className="text-xs">
                      Trend: <span className="font-semibold" style={{ color: scoreColor(r.scores.trend) }}>{r.scores.trend}/10</span>
                      <span style={{ color: 'var(--text-secondary)' }}> (×0.4 = {+(r.scores.trend * 0.4).toFixed(1)})</span>
                    </div>
                    <div className="text-xs">
                      Liquidity: <span className="font-semibold" style={{ color: scoreColor(r.scores.liquidity) }}>{r.scores.liquidity}/10</span>
                      <span style={{ color: 'var(--text-secondary)' }}> (×0.3 = {+(r.scores.liquidity * 0.3).toFixed(1)})</span>
                    </div>
                    <div className="text-xs">
                      R:R: <span className="font-semibold" style={{ color: scoreColor(r.scores.riskReward) }}>{r.scores.riskReward}/10</span>
                      <span style={{ color: 'var(--text-secondary)' }}> (×0.3 = {+(r.scores.riskReward * 0.3).toFixed(1)})</span>
                    </div>
                    <div className="text-xs">
                      OI/IV Edge: <span style={{ color: r.oiIvEdge >= 2 ? 'var(--accent-green)' : r.oiIvEdge === 1 ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
                        {r.oiIvEdge >= 2 ? '🔥 Strong conviction' : r.oiIvEdge === 1 ? '✓ Moderate' : '— No edge'}
                      </span>
                      {r.oiIvDetail && <span style={{ color: 'var(--text-secondary)' }}> Call OI: {r.oiIvDetail.totalCallOI?.toLocaleString()} · Put OI: {r.oiIvDetail.totalPutOI?.toLocaleString()}</span>}
                    </div>
                  </div>
                </div>
                {/* Technical Reason */}
                <div className="mt-2 text-xs p-2 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--accent-cyan)' }}>Technical Reason:</strong> {r.technicalReason}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Methodology */}
      <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <div className="font-semibold mb-1" style={{ color: 'var(--accent-cyan)' }}>Methodology</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div><strong>Trend:</strong> 20/50/200 SMA + swing structure. Bullish = price &gt; 50 &amp; 200 SMA. RSI pullback zone (40-60) = bonus. MACD crossover confirmation.</div>
          <div><strong>Setup:</strong> Breakout (expanding range + above 20 SMA), Flag, Retest of swing level, Above 50 SMA. ATR cushion on stop loss.</div>
          <div><strong>Filter:</strong> 25-60 DTE (15-90 fallback), OI ≥ 50, Δ 0.30-0.90, spread ≤ 15%. Directional: calls for bullish, puts for bearish. ATR cushion on stops.</div>
          <div><strong>Score:</strong> 0.4×Trend + 0.3×Liquidity + 0.3×R:R. Stop: 50 SMA / swing low (bullish) or 20 SMA / swing high (bearish) + ATR cushion. R:R ≥ 2:1.</div>
        </div>
      </div>
    </div>
  )
}