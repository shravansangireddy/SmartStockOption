import { useState, useEffect, useCallback } from 'react'

const API = '/api'

const SYMBOLS = [
  { symbol: 'SPY', label: 'SPY', group: 'Indices' },
  { symbol: 'QQQ', label: 'QQQ', group: 'Indices' },
  { symbol: 'IWM', label: 'IWM', group: 'Indices' },
  { symbol: 'AAPL', label: 'AAPL', group: 'MAG7' },
  { symbol: 'MSFT', label: 'MSFT', group: 'MAG7' },
  { symbol: 'NVDA', label: 'NVDA', group: 'MAG7' },
  { symbol: 'GOOG', label: 'GOOG', group: 'MAG7' },
  { symbol: 'META', label: 'META', group: 'MAG7' },
  { symbol: 'AMZN', label: 'AMZN', group: 'MAG7' },
  { symbol: 'TSLA', label: 'TSLA', group: 'MAG7' },
]

function trendIcon(trend) {
  if (!trend) return '●'
  const t = trend.toLowerCase()
  if (t.includes('strong up')) return '🟢'
  if (t.includes('uptrend') || t.includes('up')) return '🔼'
  if (t.includes('strong down')) return '🔴'
  if (t.includes('downtrend') || t.includes('down')) return '🔽'
  if (t.includes('transit') || t.includes('rang')) return '🔄'
  return '●'
}

export default function ProbabilityPanel({ dataProvider = 'yahoo' }) {
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    const results = {}
    let errCount = 0
    const batchSize = 3
    for (let i = 0; i < SYMBOLS.length; i += batchSize) {
      const batch = SYMBOLS.slice(i, i + batchSize)
      await Promise.all(batch.map(async (s) => {
        try {
          const res = await fetch(`${API}/prob15m/${s.symbol}?provider=${dataProvider}`)
          if (res.ok) {
            const d = await res.json()
            results[s.symbol] = d
          } else {
            errCount++
          }
        } catch {
          errCount++
        }
      }))
    }
    setData(results)
    if (Object.keys(results).length === 0 && errCount > 0) {
      setErrorMsg(`Failed to load probability data (${errCount} errors)`)
    }
    setLastUpdate(Date.now())
    setLoading(false)
  }, [dataProvider])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 60s
  useEffect(() => {
    const iv = setInterval(fetchData, 60000)
    return () => clearInterval(iv)
  }, [fetchData])

  const indices = SYMBOLS.filter(s => s.group === 'Indices')
  const mag7 = SYMBOLS.filter(s => s.group === 'MAG7')

  const renderRow = (s) => {
    const d = data[s.symbol]
    if (!d) return (
      <div key={s.symbol} className="py-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.label}</span> —
      </div>
    )

    const bull = d.bullProb || 0
    const bear = d.bearProb || 0
    const neutral = Math.max(0, 100 - bull - bear)
    const isBull = bull >= bear
    const targetColor = isBull ? 'var(--accent-green)' : 'var(--accent-red)'
    const moveSign = (d.movePct || 0) >= 0 ? '+' : ''

    return (
      <div key={s.symbol} className="py-1">
        {/* Row 1: Symbol + Price + Probability bar */}
        <div className="flex items-center gap-1 text-xs">
          <span>{trendIcon(d.trendState)}</span>
          <span className="font-semibold tabular" style={{ color: 'var(--text-primary)', minWidth: '36px' }}>{s.label}</span>
          <span className="tabular font-semibold" style={{ color: 'var(--text-primary)', minWidth: '52px' }}>${d.price?.toFixed(2)}</span>
          {/* Probability bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden flex-1" style={{ background: 'var(--bg-card)', minWidth: '40px' }}>
            <div style={{ width: `${bull}%`, background: 'var(--accent-green)' }} />
            <div style={{ width: `${neutral}%`, background: 'var(--bg-card)' }} />
            <div style={{ width: `${bear}%`, background: 'var(--accent-red)' }} />
          </div>
          <span className="text-xs tabular" style={{ color: 'var(--accent-green)', fontSize: '0.65rem', minWidth: '24px' }}>{bull}%</span>
          <span className="text-xs tabular" style={{ color: 'var(--accent-red)', fontSize: '0.65rem', minWidth: '24px' }}>{bear}%</span>
        </div>
        {/* Row 2: Price target */}
        <div className="flex items-center gap-1 text-xs mt-0.5" style={{ fontSize: '0.65rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>15m:</span>
          <span className="font-semibold tabular" style={{ color: targetColor }}>
            ${d.probTarget?.toFixed(2)}
          </span>
          <span className="tabular" style={{ color: targetColor }}>({moveSign}{d.movePct}%)</span>
          <span style={{ color: 'var(--text-secondary)' }}>│</span>
          <span style={{ color: 'var(--accent-green)' }}>▲${d.bullTarget?.toFixed(2)}</span>
          <span style={{ color: 'var(--accent-red)' }}>▼${d.bearTarget?.toFixed(2)}</span>
          {d.model === 'random_forest' && d.r2 != null && (
            <span className="ml-auto" style={{ color: 'var(--text-secondary)', fontSize: '0.55rem' }}>R²{d.r2}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-2 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-semibold" style={{ color: 'var(--accent-orange)' }}>📊 15m Probability</h3>
        <button onClick={fetchData} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }} title="Refresh">↻</button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mb-1.5 text-xs" style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
        <span style={{ color: 'var(--accent-green)' }}>■ Bull%</span>
        <span style={{ color: 'var(--accent-red)' }}>■ Bear%</span>
        <span>│</span>
        <span>15m = prob target (▲bull / ▼bear)</span>
        {Object.values(data).length > 0 && Object.values(data)[0]?.model === 'random_forest' && (
          <span style={{ color: 'var(--accent-cyan)', marginLeft: '4px' }}>🌳 RF</span>
        )}
      </div>

      {loading && Object.keys(data).length === 0 ? (
        <div className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      ) : errorMsg && Object.keys(data).length === 0 ? (
        <div className="text-xs text-center py-3" style={{ color: 'var(--accent-orange)' }}>⚠ {errorMsg}</div>
      ) : (
        <>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)', fontSize: '0.6rem' }}>INDICES</div>
          {indices.map(renderRow)}

          <div className="text-xs font-semibold mt-1.5 mb-1" style={{ color: 'var(--text-secondary)', fontSize: '0.6rem' }}>MAG7</div>
          {mag7.map(renderRow)}
        </>
      )}

      {lastUpdate && (
        <div className="text-xs mt-1 tabular" style={{ color: 'var(--text-secondary)', fontSize: '0.55rem' }}>
          Updated {Math.floor((Date.now() - lastUpdate) / 1000)}s ago
        </div>
      )}
    </div>
  )
}