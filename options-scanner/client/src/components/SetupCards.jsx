import { useState } from 'react'

function MiniSparkline({ data, color }) {
  // Simple SVG sparkline without external dependency
  if (!data || data.length < 2) return null
  const w = 60, h = 20, pad = 2
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad)
    const y = h - pad - ((v - min) / range) * (h - 2 * pad)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  )
}

// Deterministic pseudo-random based on seed
function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

export default function SetupCards({ setups, loading, onSelect, onAddWatchlist }) {
  const [addedIds, setAddedIds] = useState(new Set())

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-lg p-4 pulse-subtle" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', height: 160 }}>
            <div className="h-3 w-1/2 rounded mb-3" style={{ background: 'var(--border)' }} />
            <div className="h-2 w-3/4 rounded mb-2" style={{ background: 'var(--border)' }} />
            <div className="h-2 w-2/3 rounded" style={{ background: 'var(--border)' }} />
          </div>
        ))}
      </div>
    )
  }

  if (!setups || setups.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
        No setups found. Market may be closed or data unavailable.
      </div>
    )
  }

  const handleAdd = (e, s) => {
    e.stopPropagation()
    const id = `${s.ticker}-${s.type}-${s.strike}-${Date.now()}`
    onAddWatchlist({ ...s, id, addedPrice: s.underlyingPrice })
    setAddedIds(prev => new Set([...prev, `${s.ticker}-${s.type}-${s.strike}`]))
    // Remove the "added" state after 2s
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev)
        next.delete(`${s.ticker}-${s.type}-${s.strike}`)
        return next
      })
    }, 2000)
  }

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--accent-cyan)' }}>◈ Featured Setups</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {setups.map((s, i) => {
          const isBull = s.direction === 'bullish'
          const accentColor = isBull ? 'var(--accent-green)' : 'var(--accent-red)'
          const cardId = `${s.ticker}-${s.type}-${s.strike}`
          const isAdded = addedIds.has(cardId)

          const sparkSeed = s.ticker.charCodeAt(0) * 100 + s.strike + s.score
          const rng = seededRandom(sparkSeed)
          const sparkData = Array.from({ length: 12 }, () => {
            const base = s.premium || 5
            return base + (rng() - 0.5) * base * 0.3
          })

          return (
            <div
              key={`${s.ticker}-${s.type}-${s.strike}-${i}`}
              className="rounded-lg p-3 cursor-pointer slide-up transition-colors"
              style={{
                background: 'var(--bg-card)',
                border: `1px solid var(--border)`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
              onClick={() => onSelect(s)}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm" style={{ color: accentColor }}>{s.ticker}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: isBull ? 'rgba(0,212,170,0.15)' : 'rgba(255,77,106,0.15)', color: accentColor }}>
                      {isBull ? '▲' : '▼'} {s.direction.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{s.strategy}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular" style={{ color: accentColor }}>{s.score}<span className="text-xs">/100</span></div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 mb-2">
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Premium</div>
                  <div className="text-xs font-semibold tabular">${s.premium?.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Strike</div>
                  <div className="text-xs font-semibold tabular">${s.strike}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>DTE</div>
                  <div className="text-xs font-semibold tabular">{s.dte}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Delta</div>
                  <div className="text-xs tabular">{s.delta?.toFixed(3)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Gamma</div>
                  <div className="text-xs tabular">{s.gamma?.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Theta</div>
                  <div className="text-xs tabular">{s.theta?.toFixed(4)}</div>
                </div>
              </div>

              {/* IV bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs mb-0.5">
                  <span style={{ color: 'var(--text-secondary)' }}>IV</span>
                  <span className="tabular" style={{ color: 'var(--accent-orange)' }}>{(s.iv * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1 rounded-full" style={{ background: 'var(--border)' }}>
                  <div className="h-1 rounded-full" style={{ width: `${Math.min(s.iv * 100, 100)}%`, background: 'var(--accent-orange)' }} />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-between items-center">
                <span className="text-xs tabular" style={{ color: 'var(--text-secondary)' }}>Vol {s.volume?.toLocaleString()}</span>
                <button
                  onClick={(e) => handleAdd(e, s)}
                  className="text-xs px-2 py-0.5 rounded transition-all"
                  style={{
                    background: isAdded ? 'var(--accent-green)' : 'var(--accent-cyan)',
                    color: '#000',
                    opacity: isAdded ? 0.8 : 1,
                  }}
                >
                  {isAdded ? '✓ Added' : '+ Watch'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}