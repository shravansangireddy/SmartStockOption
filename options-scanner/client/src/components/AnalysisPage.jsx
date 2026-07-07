import { useState, useEffect, useRef, useCallback } from 'react'
import PriceChart from './PriceChart'

const API = '/api'

export default function AnalysisPage({ initialTicker, onTickerChange, dataProvider = 'yahoo', onNavigateAlgorithms = null } = {}) {
  const [symbol, setSymbol] = useState(() => {
    // Read initial symbol from URL hash, props, or default to AAPL
    const hash = window.location.hash.slice(1)
    return hash || initialTicker || 'AAPL'
  })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Auto-analyze when symbol changes
  const analyze = async (sym) => {
    const s = (sym || symbol).trim().toUpperCase()
    if (!s) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/analysis/full/${s}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Listen for navigate-analysis events from StockScanner
  useEffect(() => {
    const handler = (e) => {
      const sym = e.detail?.symbol || 'AAPL'
      setSymbol(sym)
      handleAnalyze(sym)
    }
    window.addEventListener('navigate-analysis', handler)
    return () => window.removeEventListener('navigate-analysis', handler)
  }, [])

  // Auto-analyze on mount
  useEffect(() => {
    handleAnalyze(symbol)
  }, [])

  // Re-analyze when initialTicker prop changes (user clicked ticker in sidebar or scanner)
  useEffect(() => {
    if (initialTicker && initialTicker !== symbol) {
      setSymbol(initialTicker)
      handleAnalyze(initialTicker)
    }
  }, [initialTicker])

  // Wrapper that also syncs state with parent
  const handleAnalyze = (sym) => {
    const s = (sym || symbol).trim().toUpperCase()
    if (s) {
      setSymbol(s)
      if (onTickerChange) onTickerChange(s)
      analyze(s)
    }
  }

  const fmt = (v, d = 2) => v == null ? 'N/A' : typeof v === 'number' ? v.toFixed(d) : v
  const pct = (v, d = 2) => v == null ? 'N/A' : (v * 100).toFixed(d) + '%'
  const dir = v => v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : ''
  const scoreClr = s => s >= 75 ? '#22c55e' : s >= 60 ? '#eab308' : s >= 45 ? '#94a3b8' : '#ef4444'
  const badge = s => {
    if (!s) return ['badge-neutral', 'N/A']
    if (s.includes('Buy') || s.includes('Bull') || s.includes('Strong')) return ['badge-buy', s]
    if (s.includes('Sell') || s.includes('Bear') || s.includes('Avoid')) return ['badge-sell', s]
    return ['badge-watch', s]
  }

  if (!data && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ minHeight: '60vh' }}>
        <div className="text-5xl mb-4">📊</div>
        <h2 className="text-xl font-bold mb-2">Single Stock Analysis</h2>
        <p style={{ color: 'var(--text-secondary)' }} className="mb-6 text-sm">Market conditions, technicals, predictions, and high-conviction trade setups</p>
        <div className="flex gap-3 w-full max-w-md">
          <input
            type="text"
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze(symbol)}
            placeholder="Enter ticker (e.g., AAPL, SPY, NVDA)"
            className="flex-1 px-4 py-3 rounded-lg text-sm"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
          />
          <button
            onClick={() => handleAnalyze(symbol)}
            className="px-6 py-3 rounded-lg font-semibold text-sm"
            style={{ background: 'var(--accent-cyan)', color: '#000' }}
          >Analyze</button>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 justify-center max-w-lg">
          {['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOG', 'AMD', 'NFLX', 'PLTR'].map(t => (
            <button
              key={t}
              onClick={() => { setSymbol(t); handleAnalyze(t) }}
              className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.target.style.background = 'var(--accent-cyan)'; e.target.style.color = '#000' }}
              onMouseLeave={e => { e.target.style.background = 'var(--bg-card)'; e.target.style.color = 'var(--text-secondary)' }}
            >{t}</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAnalyze(symbol)}
          className="px-4 py-2 rounded-lg text-sm w-32"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
        />
        <button onClick={() => handleAnalyze(symbol)} disabled={loading} className="px-5 py-2 rounded-lg font-semibold text-sm"
          style={{ background: loading ? 'var(--bg-card)' : 'var(--accent-cyan)', color: loading ? 'var(--text-secondary)' : '#000' }}>
          {loading ? 'Analyzing…' : 'Analyze'}
        </button>
        {data && <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{data.symbol}</span>}
        {onNavigateAlgorithms && (
          <button
            onClick={() => onNavigateAlgorithms(symbol)}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--accent-cyan)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-cyan)'; e.currentTarget.style.color = '#000' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--accent-cyan)' }}
          >🤖 ML Algorithms</button>
        )}
        <div className="flex gap-1.5 ml-auto">
          {['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOG', 'AMD'].map(t => (
            <button
              key={t}
              onClick={() => { setSymbol(t); handleAnalyze(t) }}
              className="px-2 py-1 rounded text-xs font-semibold transition-all"
              style={{ background: symbol === t ? 'var(--accent-cyan)' : 'var(--bg-card)', color: symbol === t ? '#000' : 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >{t}</button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block w-10 h-10 border-3 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent-cyan)' }}></div>
          <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Analyzing market data, computing indicators, generating setups…</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#ef4444' }}>
          Error: {error}
        </div>
      )}

      {data && !loading && (() => {
        const { sectionA: a, sectionB: b, sectionC: c, sectionD: d } = data
        const scores = b.scores || {}
        const [signalCls, signalText] = badge(b.signal)
        const a2 = b.analysis || {}

        return (
          <div className="space-y-5">
            {/* A: Market Conditions */}
            <section>
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--accent-cyan)' }}>A. Market Conditions</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(a.indices || {}).map(([name, idx]) => (
                  <div key={name} className="p-3 rounded-lg text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div className="font-bold">{name}</div>
                    <div className="text-sm">${fmt(idx.price)}</div>
                    <div className={dir(idx.changePercent)}>{pct(idx.changePercent)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 rounded-lg text-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <strong>Regime:</strong> {a.regime} &nbsp;|&nbsp; <strong>VIX:</strong> {a.vixLevel || 'N/A'} &nbsp;|&nbsp; <strong>SPY Trend:</strong> {a.spyTrend || 'N/A'}
                <br /><span style={{ color: 'var(--text-secondary)' }}>{a.summary}</span>
              </div>
            </section>

            {/* B: Technicals + Prediction */}
            <section>
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--accent-cyan)' }}>B. Technical Analysis & Prediction</h2>

              {/* Score + Price */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl font-bold" style={{ color: scoreClr(scores.total || 0) }}>{scores.total || 0}/100</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${signalCls}`}>{signalText}</span>
                  </div>
                  {[
                    ['Trend', scores.trend, 16],
                    ['Momentum', scores.momentum, 16],
                    ['Liquidity', scores.volume, 16],
                    ['Volatility', scores.volatility, 16],
                    ['Options', scores.options, 16],
                    ['Price Act.', scores.priceAction, 14],
                  ].map(([label, val, max]) => (
                    <div key={label} className="flex items-center gap-2 mb-1">
                      <span className="text-xs w-16" style={{ color: 'var(--text-secondary)' }}>{label}</span>
                      <div className="flex-1 h-1.5 rounded" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded" style={{ width: `${(val || 0) / max * 100}%`, background: scoreClr(scores.total || 0) }}></div>
                      </div>
                      <span className="text-xs tabular" style={{ color: 'var(--text-secondary)' }}>{val || 0}/{max}</span>
                    </div>
                  ))}
                </div>

                <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  {b.prediction ? (
                    <>
                      <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {b.prediction.method === 'lstm' ? 'LSTM' : 'Technical'} Prediction
                        {onNavigateAlgorithms && <button onClick={() => onNavigateAlgorithms(data.symbol)} className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--accent-cyan)', border: '1px solid var(--border)' }}>⚙ Config</button>}
                      </div>
                      <div className={`text-3xl font-bold ${b.prediction.direction === 'UP' ? 'up' : b.prediction.direction === 'DOWN' ? 'down' : ''}`}>
                        ${fmt(b.prediction.predictedPrice)}
                      </div>
                      <div className="text-sm">
                        {b.prediction.direction === 'UP' ? '📈' : b.prediction.direction === 'DOWN' ? '📉' : '➡️'} {b.prediction.direction}
                        <span className="ml-2" style={{ color: 'var(--text-secondary)' }}>
                          {b.prediction.changePercent > 0 ? '+' : ''}{fmt(b.prediction.changePercent)}%
                        </span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                        Current: ${fmt(a2.price)} → Predicted: ${fmt(b.prediction.predictedPrice)}
                      </div>
                      {b.forecast && b.forecast.length > 0 && (
                        <div className="grid grid-cols-5 gap-2 mt-3">
                          {b.forecast.map((day, i) => (
                            <div key={i} className="text-center p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Day {day.day}</div>
                              <div className={`text-sm font-bold ${dir(day.changePercent)}`}>${fmt(day.predictedPrice)}</div>
                              <div className={`text-xs ${dir(day.changePercent)}`}>{day.changePercent > 0 ? '+' : ''}{fmt(day.changePercent)}%</div>
                              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Conf {day.confidence}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <div className="text-2xl mb-2">🧠</div>
                      LSTM model not yet trained for this symbol.
                      <div className="mt-3 flex gap-2">
                        {onNavigateAlgorithms ? (
                          <button
                            onClick={() => onNavigateAlgorithms(data.symbol)}
                            className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                            style={{ background: 'var(--accent-cyan)', color: '#000' }}
                          >
                            🤖 Train in ML Algorithms
                          </button>
                        ) : (
                          <div className="text-xs mt-1">No LSTM model available. Train one in ML Algorithms.</div>
                        )}
                      </div>
                    </div>
                    )}
                </div>
              </div>

              {/* Technical Indicators */}
              <div className="p-4 rounded-lg mb-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <h3 className="text-sm font-semibold mb-2">Technical Indicators</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    ['Price', `$${fmt(a2.price)}`],
                    ['Trend', a2.trend || 'N/A'],
                    ['RSI (14)', fmt(a2.rsi, 1)],
                    ['SMA 20', `$${fmt(a2.sma20)}`],
                    ['SMA 50', `$${fmt(a2.sma50)}`],
                    ['SMA 200', `$${fmt(a2.sma200)}`],
                    ['ATR (14)', `$${fmt(a2.atr)}`],
                    ['MACD', fmt(a2.macd, 4)],
                    ['52W High', `$${fmt(a2.high52w)}`],
                    ['52W Low', `$${fmt(a2.low52w)}`],
                    ['Volume', a2.volume ? `${(a2.volume / 1e6).toFixed(1)}M` : 'N/A'],
                    ['Rel Volume', a2.relativeVolume ? `${fmt(a2.relativeVolume, 1)}x` : 'N/A'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                      <div className="text-sm font-semibold">{value}</div>
                    </div>
                  ))}
                  {a2.bollinger && (
                    <>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>BB Upper</div>
                        <div className="text-sm font-semibold">${fmt(a2.bollinger.upper)}</div>
                      </div>
                      <div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>BB %B</div>
                        <div className="text-sm font-semibold">{a2.bollinger.percentB}%</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Interactive Price Chart */}
              {data.symbol && (
                <PriceChart symbol={data.symbol} dataProvider={dataProvider} height={320} />
              )}
            </section>

            {/* B2: Trend Score & Signal Components (Pine Script) */}
            {b.trendScore && (
              <div className="p-4 rounded-lg mb-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>Trend Score & Signals</h3>
                  <span className="text-lg font-bold" style={{ color: b.trendScore.netScore >= 2 ? '#22c55e' : b.trendScore.netScore <= -2 ? '#ef4444' : '#94a3b8' }}>
                    {b.trendScore.netScore >= 7 ? '🔥' : b.trendScore.netScore <= -7 ? '🐻' : ''} {b.trendScore.trendStrength}
                  </span>
                </div>
                
                {/* Score bars */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="p-2 rounded text-center" style={{ background: b.trendScore.netScore >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bull Score</div>
                    <div className="text-xl font-bold" style={{ color: '#22c55e' }}>{b.trendScore.bullScore}</div>
                  </div>
                  <div className="p-2 rounded text-center" style={{ background: b.trendScore.netScore <= 0 ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bear Score</div>
                    <div className="text-xl font-bold" style={{ color: '#ef4444' }}>{b.trendScore.bearScore}</div>
                  </div>
                </div>
                
                {/* KNN Probability */}
                {b.knnProbability && !b.knnProbability.warming && (
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>KNN Bull Probability</div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold" style={{ color: b.knnProbability.bullProb >= 0.55 ? '#22c55e' : '#94a3b8' }}>
                          {b.knnProbability.bullProb != null ? `${(b.knnProbability.bullProb * 100).toFixed(1)}%` : 'N/A'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>({b.knnProbability.bullMatches} matches)</span>
                      </div>
                    </div>
                    <div className="p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>KNN Bear Probability</div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold" style={{ color: b.knnProbability.bearProb >= 0.55 ? '#ef4444' : '#94a3b8' }}>
                          {b.knnProbability.bearProb != null ? `${(b.knnProbability.bearProb * 100).toFixed(1)}%` : 'N/A'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>({b.knnProbability.bearMatches} matches)</span>
                      </div>
                    </div>
                  </div>
                )}
                {b.knnProbability?.warming && (
                  <div className="text-xs text-center py-2" style={{ color: 'var(--text-secondary)' }}>🧠 KNN warming up — needs {120}+ bars of data ({b.knnProbability.samples || 0} available)</div>
                )}
                
                {/* Signal Components Grid */}
                <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5 text-xs">
                  {[
                    ['Trend', b.trendScore.components.trendBull ? '✅ Bull' : b.trendScore.components.trendBear ? '🔴 Bear' : '⚪ Neutral'],
                    ['VWAP', b.trendScore.components.vwapBull ? '✅ Above' : b.trendScore.components.vwapBear ? '🔴 Below' : '⚪ N/A'],
                    ['RSI', b.trendScore.components.rsiBull ? '✅ >55' : b.trendScore.components.rsiBear ? '🔴 <45' : '⚪ Neutral'],
                    ['MACD', b.trendScore.components.macdBull ? '✅ Bull' : b.trendScore.components.macdBear ? '🔴 Bear' : '⚪ Flat'],
                    ['ADX', b.trendScore.components.adxTrend ? '✅ Trending' : '⚪ Weak'],
                    ['Vol Spike', b.trendScore.components.volSpike ? '⚠️ Yes' : '⚪ No'],
                    ['Extreme Vol', b.trendScore.components.volSpikeExtreme ? '🔥 Yes' : '⚪ No'],
                    ['Breakout', b.trendScore.components.breakoutUp ? '📈 Up' : b.trendScore.components.breakoutDown ? '📉 Down' : '⚪ None'],
                    ['BB Break', b.trendScore.components.bbBreakoutUp ? '📈 Above' : b.trendScore.components.bbBreakoutDown ? '📉 Below' : '⚪ Inside'],
                    ['OM Trend', b.trendScore.components.omTrendBull ? '✅ Bull' : b.trendScore.components.omTrendBear ? '🔴 Bear' : '⚪ Flat'],
                    ['OM Cross', b.trendScore.components.omBullCross ? '📈 Bull' : b.trendScore.components.omBearCross ? '📉 Bear' : '⚪ None'],
                    ['EMA Spread', `${b.trendScore.components.emaSpreadPct > 0 ? '+' : ''}${b.trendScore.components.emaSpreadPct}%`],
                    ['Vol Ratio', b.volumeSpike ? `${b.volumeSpike.volRatio}x` : '1x'],
                    ['KNN Bull', b.trendScore.components.probBullOk ? '✅ Pass' : '⚪ Skip'],
                    ['KNN Bear', b.trendScore.components.probBearOk ? '🔴 Pass' : '⚪ Skip'],
                  ].map(([label, value]) => (
                    <div key={label} className="p-1.5 rounded" style={{ background: 'var(--bg-primary)' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>{label}</div>
                      <div className="font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* B3: Volume & Breakout Signals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {b.volumeSpike && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-orange)' }}>Volume Spike</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span style={{ color: 'var(--text-secondary)' }}>Vol Ratio:</span> <span className="font-semibold">{b.volumeSpike.volRatio}x</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Spike:</span> <span className="font-semibold" style={{ color: b.volumeSpike.volSpike ? '#22c55e' : 'var(--text-secondary)' }}>{b.volumeSpike.volSpike ? '⚠️ YES' : 'No'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Extreme:</span> <span className="font-semibold" style={{ color: b.volumeSpike.volSpikeExtreme ? '#ef4444' : 'var(--text-secondary)' }}>{b.volumeSpike.volSpikeExtreme ? '🔥 YES' : 'No'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Vol SMA:</span> <span className="font-semibold">{b.volumeSpike.volSma ? (b.volumeSpike.volSma / 1e6).toFixed(1) + 'M' : 'N/A'}</span></div>
                  </div>
                </div>
              )}
              {b.breakout && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>Breakout Detection</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span style={{ color: 'var(--text-secondary)' }}>Breakout Up:</span> <span className="font-semibold" style={{ color: b.breakout.breakoutUp ? '#22c55e' : 'var(--text-secondary)' }}>{b.breakout.breakoutUp ? '📈 YES' : 'No'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Breakout Down:</span> <span className="font-semibold" style={{ color: b.breakout.breakoutDown ? '#ef4444' : 'var(--text-secondary)' }}>{b.breakout.breakoutDown ? '📉 YES' : 'No'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>20d High:</span> <span className="font-semibold tabular">${b.breakout.highestPrev || 'N/A'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>20d Low:</span> <span className="font-semibold tabular">${b.breakout.lowestPrev || 'N/A'}</span></div>
                  </div>
                </div>
              )}
              {b.omSignal && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'color.fuchsia' }}>OM MA Signal</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span style={{ color: 'var(--text-secondary)' }}>EMA(8):</span> <span className="font-semibold tabular">${b.omSignal.shortMA || 'N/A'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>EMA(21):</span> <span className="font-semibold tabular">${b.omSignal.longMA || 'N/A'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Trend:</span> <span className="font-semibold" style={{ color: b.omSignal.trendBull ? '#22c55e' : b.omSignal.trendBear ? '#ef4444' : '#94a3b8' }}>{b.omSignal.trendBull ? 'Bull' : b.omSignal.trendBear ? 'Bear' : 'Flat'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Cross:</span> <span className="font-semibold">{b.omRecentCross ? (b.omRecentCross.type === 'bull' ? '📈 Bull' : '📉 Bear') + ` (${b.omRecentCross.barsAgo} bars ago)` : 'None'}</span></div>
                  </div>
                </div>
              )}
              {b.bollinger && (
                <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-green)' }}>Bollinger Bands</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span style={{ color: 'var(--text-secondary)' }}>Upper:</span> <span className="font-semibold tabular">${b.bollinger.bbUpper || 'N/A'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Lower:</span> <span className="font-semibold tabular">${b.bollinger.bbLower || 'N/A'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>%B:</span> <span className="font-semibold">{b.bollinger.bbPercentB != null ? `${b.bollinger.bbPercentB}%` : 'N/A'}</span></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>Breakout:</span> <span className="font-semibold" style={{ color: b.bollinger.bbBreakoutUp ? '#22c55e' : b.bollinger.bbBreakoutDown ? '#ef4444' : 'var(--text-secondary)' }}>{b.bollinger.bbBreakoutUp ? '📈 Above' : b.bollinger.bbBreakoutDown ? '📉 Below' : 'Inside'}</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* C: Trade Setups */}
            <section>
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--accent-cyan)' }}>C. High Conviction Trade Setups</h2>
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                Underlying: ${fmt(c.underlyingPrice)} | Expiry: {c.selectedExpiry} | DTE: {c.dte}
                {b.analysis?.options?.ivPct && <> | ATM IV: {b.analysis.options.ivPct}%</>}
              </p>
              {c.setups && c.setups.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)' }}>
                        {['Dir','Strategy','Time','Expiry','DTE','Strike','Δ','Entry','OI','Spread','Reason','Stop','Risk','R:R','Score'].map(h => (
                          <th key={h} className="px-2 py-2 text-left uppercase" style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', letterSpacing: '0.5px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.setups.map((s, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className={`px-2 py-2 font-bold ${s.direction === 'Bullish' ? 'up' : s.direction === 'Bearish' ? 'down' : ''}`}>{s.direction}</td>
                          <td className="px-2 py-2">{s.strategy}</td>
                          <td className="px-2 py-2">{s.timeframe}</td>
                          <td className="px-2 py-2">{s.expiration || c.selectedExpiry}</td>
                          <td className="px-2 py-2">
                            <span className="font-semibold" style={{ color: s.dte != null && s.dte <= 7 ? 'var(--accent-red)' : s.dte <= 14 ? 'var(--accent-orange)' : 'var(--text-primary)' }}>
                              {s.dte != null ? s.dte : c.dte || '—'}
                            </span>
                          </td>
                          <td className="px-2 py-2">${s.strike}</td>
                          <td className="px-2 py-2 tabular">{s.estDelta}</td>
                          <td className="px-2 py-2 tabular">${s.entry}</td>
                          <td className="px-2 py-2 tabular">{s.oi}</td>
                          <td className="px-2 py-2">{s.spreadQuality}</td>
                          <td className="px-2 py-2" style={{ maxWidth: '200px', color: 'var(--text-secondary)' }}>{s.technicalReason}</td>
                          <td className="px-2 py-2">{s.stopLoss}</td>
                          <td className="px-2 py-2 tabular">${s.riskPerContract}</td>
                          <td className="px-2 py-2 tabular">{s.rrTarget}</td>
                          <td className="px-2 py-2 font-bold tabular" style={{ color: scoreClr(typeof s.score === 'number' ? s.score : 0) }}>{s.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No high-conviction setups found for current conditions.
                </div>
              )}
              <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                Calls: {c.chainSummary?.totalCalls || 0} | Puts: {c.chainSummary?.totalPuts || 0} | Strikes: {c.chainSummary?.totalStrikes || 0} | Available Expiries: {(c.availableExpiries || []).length}
              </div>
            </section>

            {/* D: News */}
            <section>
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--accent-cyan)' }}>D. News & Catalysts</h2>
              {d.news && d.news.length > 0 ? (
                <div className="space-y-2">
                  {d.news.map((n, i) => (
                    <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>{n.title}</a>
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{n.source} · {n.date || ''}</div>
                      {n.summary && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{n.summary}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  No recent news available.
                </div>
              )}
            </section>
          </div>
        )
      })()}
    </div>
  )
}