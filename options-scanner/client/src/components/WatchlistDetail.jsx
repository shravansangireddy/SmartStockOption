import { useState, useEffect, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

// ─── Mini bar for a parameter ───────────────────────────────
function ParamBar({ label, value, max, color, suffix = '', format = 'decimal' }) {
  if (value == null) return null
  const pct = max > 0 ? Math.min(Math.abs(value) / max, 1) * 100 : 0
  const displayVal = format === 'percent' ? `${(value * 100).toFixed(1)}%`
    : format === 'integer' ? Math.round(value).toLocaleString()
    : format === 'delta' ? value.toFixed(3)
    : value.toFixed(2)
  return (
    <div className="flex items-center gap-2 text-xs" style={{ minHeight: 22 }}>
      <span className="w-10 shrink-0 text-right" style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>{label}</span>
      <div className="flex-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-card)', height: 6 }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color || 'var(--accent-cyan)' }} />
      </div>
      <span className="w-16 text-right tabular font-semibold" style={{ color: 'var(--text-primary)', fontSize: '0.72rem' }}>{displayVal}{suffix}</span>
    </div>
  )
}

// ─── Trend arrow ────────────────────────────────────────────
function TrendArrow({ current, previous }) {
  if (current == null || previous == null) return <span style={{ color: 'var(--text-secondary)' }}>—</span>
  const diff = current - previous
  if (Math.abs(diff) < 0.0001) return <span style={{ color: 'var(--text-secondary)' }}>→</span>
  const isUp = diff > 0
  const pctChange = previous !== 0 ? Math.abs(diff / previous * 100) : 0
  return (
    <span className="font-bold" style={{ color: isUp ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: '0.75rem' }}>
      {isUp ? '▲' : '▼'} {pctChange < 0.1 ? '' : `${pctChange.toFixed(1)}%`}
    </span>
  )
}

// ─── Sparkline (mini chart) ─────────────────────────────────
function Sparkline({ data, width = 120, height = 28, color = 'var(--accent-cyan)' }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Score gauge ────────────────────────────────────────────
function ScoreGauge({ score, max = 100 }) {
  if (score == null) return null
  const pct = Math.min(score / max, 1)
  const color = score >= 70 ? 'var(--accent-green)' : score >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)'
  const circumference = 2 * Math.PI * 18
  const offset = circumference * (1 - pct)
  return (
    <div className="relative" style={{ width: 48, height: 48 }}>
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18" fill="none" stroke="var(--bg-card)" strokeWidth="4" />
        <circle cx="24" cy="24" r="18" fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 24 24)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-bold text-sm" style={{ color }}>
        {score}
      </div>
    </div>
  )
}

// ─── Change indicator ────────────────────────────────────────
function ChangeArrow({ current, previous, decimals = 2, prefix = '', suffix = '', showPct = false }) {
  if (current == null || previous == null || previous === 0) return null
  const diff = current - previous
  const pct = previous !== 0 ? (diff / Math.abs(previous)) * 100 : 0
  if (Math.abs(diff) < 0.0001) return <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>→</span>
  const isUp = diff > 0
  return (
    <span className="text-xs font-semibold" style={{ color: isUp ? 'var(--accent-green)' : 'var(--accent-red)' }}>
      {isUp ? '▲' : '▼'} {prefix}{Math.abs(diff).toFixed(decimals)}{suffix}
      {showPct && <span style={{ fontSize: '0.85em' }}> ({isUp ? '+' : ''}{pct.toFixed(1)}%)</span>}
    </span>
  )
}

// ─── Main component ─────────────────────────────────────────
export default function WatchlistDetail({ watchlist, onRemove, onSelect, dataProvider, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null)
  const [optionData, setOptionData] = useState({})
  const [historyCache, setHistoryCache] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [prevValues, setPrevValues] = useState({})

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return
    // Snapshot current values before refresh
    const snap = {}
    watchlist.forEach(w => { snap[w.id] = { premium: w.premium, delta: w.delta, gamma: w.gamma, theta: w.theta, iv: w.iv, dte: w.dte, currentPrice: w.currentPrice } })
    setPrevValues(snap)
    setRefreshing(true)
    try { await onRefresh() } catch (e) { console.error(e) }
    setRefreshing(false)
  }

  // Fetch fresh option data for expanded items
  const fetchOptionData = useCallback(async (ticker) => {
    if (optionData[ticker]) return
    try {
      const res = await fetch(`${API}/api/quote/${ticker}?provider=${dataProvider}`)
      if (res.ok) {
        const q = await res.json()
        setOptionData(prev => ({ ...prev, [ticker]: q }))
      }
    } catch { /* skip */ }
  }, [dataProvider, optionData])

  // Fetch mini price history for sparklines
  const fetchHistory = useCallback(async (ticker) => {
    if (historyCache[ticker]) return
    try {
      const period2 = new Date().toISOString().split('T')[0]
      const period1 = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]
      const res = await fetch(`${API}/api/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&provider=${dataProvider}`)
      if (res.ok) {
        const data = await res.json()
        const closes = (data.quotes || []).map(q => q.close).filter(c => c != null)
        if (closes.length >= 2) {
          setHistoryCache(prev => ({ ...prev, [ticker]: closes }))
        }
      }
    } catch { /* skip */ }
  }, [dataProvider, historyCache])

  const toggleExpand = (w) => {
    const id = w.id
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      fetchOptionData(w.ticker)
      fetchHistory(w.ticker)
    }
  }

  return (
    <div className="space-y-2">
      {/* Refresh button */}
      {onRefresh && watchlist.length > 0 && (
        <div className="flex justify-end mb-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded font-medium transition-all"
            style={{ background: refreshing ? 'var(--bg-secondary)' : 'var(--accent-cyan)', color: refreshing ? 'var(--text-secondary)' : '#000', opacity: refreshing ? 0.6 : 1 }}
          >
            {refreshing ? '⏳ Refreshing...' : '🔄 Refresh Prices & Greeks'}
          </button>
        </div>
      )}
    {watchlist.map((w, i) => {
        const isExpanded = expandedId === w.id
        const q = optionData[w.ticker]
        const history = historyCache[w.ticker]
        const pnlDollar = (w.currentPrice != null && w.addedPrice != null) ? (w.currentPrice - w.addedPrice) : (w.currentPrice != null && w.underlyingPrice != null) ? (w.currentPrice - w.underlyingPrice) : null
        const pnlPct = (w.currentPrice != null && w.addedPrice != null) ? ((w.currentPrice - w.addedPrice) / w.addedPrice * 100) : (w.currentPrice != null && w.underlyingPrice != null) ? ((w.currentPrice - w.underlyingPrice) / w.underlyingPrice * 100) : null
        const pnlColor = pnlDollar != null ? (pnlDollar >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-secondary)'
        const directionColor = w.direction === 'bullish' ? 'var(--accent-green)' : 'var(--accent-red)'
        const livePrice = q?.price || w.currentPrice || w.underlyingPrice
        const priceChange = q?.change
        const priceChangePct = q?.changePercent
        const priceColor = priceChange != null ? (priceChange >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-secondary)'

        return (
          <div key={w.id || i} className="rounded-lg overflow-hidden transition-all duration-200"
            style={{ background: 'var(--bg-card)', border: `1px solid ${isExpanded ? 'var(--accent-cyan)' : 'var(--border)'}` }}>
            {/* ── Header row ── */}
            <div className="flex items-center gap-2 p-3 cursor-pointer" onClick={() => toggleExpand(w)}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {/* Score gauge */}
              <ScoreGauge score={w.score} />

              {/* Core info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base" style={{ color: directionColor }}>{w.ticker}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{
                    background: w.type?.toUpperCase() === 'CALL' ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.15)',
                    color: w.type?.toUpperCase() === 'CALL' ? 'var(--accent-green)' : 'var(--accent-red)'
                  }}>
                    {w.type?.toUpperCase()}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>${w.strike}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>DTE {w.dte}</span>
                </div>
                {/* Price row */}
                <div className="flex items-center gap-2 mt-0.5">
                  {livePrice != null && (
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>${livePrice.toFixed(2)}</span>
                  )}
                  {priceChange != null && (
                    <span className="text-xs font-semibold" style={{ color: priceColor }}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({(priceChangePct * 100).toFixed(2)}%)
                    </span>
                  )}
                  {pnlDollar != null && (
                    <span className="text-xs ml-auto font-semibold" style={{ color: pnlColor }}>
                      {pnlDollar >= 0 ? '+' : ''}{pnlDollar.toFixed(2)}
                      {pnlPct != null && <span style={{ fontSize: '0.85em' }}> ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>}
                    </span>
                  )}
                </div>
              </div>

              {/* Sparkline */}
              <div className="shrink-0">
                <Sparkline data={history} color={pnlDollar != null ? (pnlDollar >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--accent-cyan)'} />
              </div>

              {/* Expand toggle */}
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* ── Expanded details ── */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
                {/* Strategy & Premium */}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--accent-orange)' }}>{w.strategy}</span>
                  <div className="flex items-center gap-2">
                    {w.dte != null && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: w.dte <= 7 ? 'rgba(255,77,106,0.15)' : w.dte <= 14 ? 'rgba(255,152,0,0.15)' : 'rgba(0,212,170,0.1)', color: w.dte <= 7 ? 'var(--accent-red)' : w.dte <= 14 ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
                        ⏳ {w.dte}d
                      </span>
                    )}
                    {w.premium != null && (
                      <span className="text-xs tabular" style={{ color: 'var(--text-primary)' }}>
                        Prem <span className="font-semibold">${w.premium.toFixed(2)}</span>
                        <ChangeArrow current={w.premium} previous={prevValues[w.id]?.premium} prefix="$" decimals={2} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Greeks bars */}
                <div className="space-y-1 mb-2">
                  <div className="flex items-center gap-1">
                    <div className="flex-1"><ParamBar label="Δ Delta" value={w.delta} max={1} color={w.delta >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'} format="delta" /></div>
                    <ChangeArrow current={w.delta} previous={prevValues[w.id]?.delta} decimals={3} />
                  </div>
                  <ParamBar label="Γ Gamma" value={w.gamma} max={0.15} color="#b388ff" format="delta" />
                  <ParamBar label="Θ Theta" value={w.theta != null ? Math.abs(w.theta) : null} max={1} color="var(--accent-orange)" suffix={w.theta != null ? (w.theta < 0 ? '🔴' : '🟢') : ''} />
                  <div className="flex items-center gap-1">
                    <div className="flex-1"><ParamBar label="IV" value={w.iv} max={1} color="var(--accent-cyan)" format="percent" /></div>
                    <ChangeArrow current={w.iv} previous={prevValues[w.id]?.iv} decimals={2} suffix="%" showPct />
                  </div>
                </div>

                {/* Volume & OI */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="rounded p-2" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Volume</div>
                    <div className="font-bold text-sm tabular" style={{ color: 'var(--accent-cyan)' }}>
                      {w.volume != null ? w.volume.toLocaleString() : '—'}
                    </div>
                    <div className="h-1 rounded-full mt-1" style={{ background: 'var(--bg-card)' }}>
                      <div className="h-full rounded-full" style={{
                        width: w.volume ? `${Math.min(w.volume / 50000 * 100, 100)}%` : '0%',
                        background: 'var(--accent-cyan)'
                      }} />
                    </div>
                  </div>
                  <div className="rounded p-2" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Open Interest</div>
                    <div className="font-bold text-sm tabular" style={{ color: 'var(--accent-orange)' }}>
                      {w.openInterest != null ? w.openInterest.toLocaleString() : '—'}
                    </div>
                    <div className="h-1 rounded-full mt-1" style={{ background: 'var(--bg-card)' }}>
                      <div className="h-full rounded-full" style={{
                        width: w.openInterest ? `${Math.min(w.openInterest / 100000 * 100, 100)}%` : '0%',
                        background: 'var(--accent-orange)'
                      }} />
                    </div>
                  </div>
                </div>

                {/* Vol/OI ratio */}
                {w.volume != null && w.openInterest > 0 && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Vol/OI</span>
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--bg-card)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min((w.volume / w.openInterest) * 100, 100)}%`,
                        background: w.volume / w.openInterest > 2 ? 'var(--accent-green)' : w.volume / w.openInterest > 1 ? 'var(--accent-orange)' : 'var(--text-secondary)'
                      }} />
                    </div>
                    <span className="text-xs font-semibold tabular" style={{ color: 'var(--text-primary)' }}>
                      {(w.volume / w.openInterest).toFixed(2)}x
                    </span>
                    {w.volume / w.openInterest > 2 && <span style={{ color: 'var(--accent-green)', fontSize: '0.65rem' }}>🔥 HOT</span>}
                  </div>
                )}

                {/* Trend indicators */}
                <div className="grid grid-cols-3 gap-1 text-center mb-2">
                  <div className="rounded p-1.5" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>Added</div>
                    <div className="text-xs font-semibold tabular">${w.addedPrice?.toFixed(2) || w.underlyingPrice?.toFixed(2) || '—'}</div>
                  </div>
                  <div className="rounded p-1.5" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>Current</div>
                    <div className="text-xs font-semibold tabular" style={{ color: priceColor }}>
                      ${livePrice?.toFixed(2) || '—'}
                      <ChangeArrow current={livePrice} previous={prevValues[w.id]?.currentPrice} decimals={2} />
                    </div>
                  </div>
                  <div className="rounded p-1.5" style={{ background: 'var(--bg-secondary)' }}>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>P/L</div>
                    <div className="text-xs font-semibold tabular" style={{ color: pnlColor }}>
                      {pnlDollar != null ? `${pnlDollar >= 0 ? '+' : ''}$${pnlDollar.toFixed(2)}` : '—'}
                      {pnlPct != null && <span style={{ fontSize: '0.85em' }}> ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)</span>}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); onSelect(w) }}
                    className="flex-1 text-xs py-1.5 rounded font-medium transition-colors"
                    style={{ background: 'var(--accent-cyan)', color: '#000' }}>
                    📊 Trade
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onRemove(w.id) }}
                    className="text-xs px-3 py-1.5 rounded transition-colors"
                    style={{ background: 'var(--accent-red)', color: '#fff' }}>
                    ✕ Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}