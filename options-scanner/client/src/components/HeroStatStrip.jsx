export default function HeroStatStrip({ snapshot, setups, loading, dataProvider = 'public' }) {
  const indices = snapshot ? Object.values(snapshot).filter(v => v && typeof v.symbol === 'string') : []
  const bestBull = setups?.filter(s => s.direction === 'bullish')[0]
  const bestBear = setups?.filter(s => s.direction === 'bearish')[0]
  const totalContracts = setups?.length || 0

  // IV hot list
  const ivHot = setups?.filter(s => s.iv > 0.5).slice(0, 3) || []

  return (
    <div className="flex items-center gap-4 px-4 py-2 overflow-x-auto" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
      {/* Market status */}
      {indices.map(idx => (
        <div key={idx.symbol} className="flex items-center gap-2 px-3 py-1 rounded" style={{ background: 'var(--bg-card)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--accent-cyan)' }}>{idx.symbol.replace('^','')}</span>
          <span className="text-xs tabular">{idx.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</span>
          <span className="text-xs tabular" style={{ color: (idx.change ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {(idx.change ?? 0) >= 0 ? '+' : ''}{idx.changePercent?.toFixed(2) ?? '—'}%
          </span>
        </div>
      ))}

      <div className="w-px h-6" style={{ background: 'var(--border)' }} />

      {/* Contracts */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded" style={{ background: 'var(--bg-card)' }}>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Contracts</span>
        <span className="text-xs font-bold tabular" style={{ color: 'var(--accent-cyan)' }}>{totalContracts}</span>
      </div>

      {/* Best setups */}
      {bestBull && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded" style={{ background: 'var(--bg-card)' }}>
          <span className="text-xs" style={{ color: 'var(--accent-green)' }}>▲ {bestBull.ticker}</span>
          <span className="text-xs tabular">{bestBull.strategy}</span>
          <span className="text-xs tabular font-bold" style={{ color: 'var(--accent-green)' }}>{bestBull.score}</span>
        </div>
      )}
      {bestBear && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded" style={{ background: 'var(--bg-card)' }}>
          <span className="text-xs" style={{ color: 'var(--accent-red)' }}>▼ {bestBear.ticker}</span>
          <span className="text-xs tabular">{bestBear.strategy}</span>
          <span className="text-xs tabular font-bold" style={{ color: 'var(--accent-red)' }}>{bestBear.score}</span>
        </div>
      )}

      {/* IV Hot */}
      {ivHot.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1 rounded" style={{ background: 'var(--bg-card)' }}>
          <span className="text-xs" style={{ color: 'var(--accent-orange)' }}>🔥 IV</span>
          {ivHot.map(s => (
            <span key={s.ticker + s.type} className="text-xs tabular" style={{ color: 'var(--accent-orange)' }}>{s.ticker} {(s.iv * 100).toFixed(0)}%</span>
          ))}
        </div>
      )}

      {loading && <span className="text-xs pulse-subtle" style={{ color: 'var(--text-secondary)' }}>⟳</span>}

      <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs" style={{ background: dataProvider === 'public' ? 'rgba(0,212,170,0.15)' : dataProvider === 'finnhub' ? 'rgba(255,152,0,0.15)' : 'rgba(0,188,212,0.1)', color: dataProvider === 'public' ? 'var(--accent-green)' : dataProvider === 'finnhub' ? 'var(--accent-orange)' : 'var(--accent-cyan)' }}>
        {dataProvider === 'public' ? '🔑 Public.com' : dataProvider === 'finnhub' ? '⚡ Finnhub' : '☁ Yahoo'}
      </div>
    </div>
  )
}