import { useState, useEffect } from 'react'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() / 1000 - ts))
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export default function ActivityFeed({ setups, chain }) {
  const [activities, setActivities] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 10000)
    return () => clearInterval(iv)
  }, [])

  // Generate activity items from setups and chain data
  useEffect(() => {
    const items = []

    // Volume spikes from setups
    if (setups?.length > 0) {
      setups.slice(0, 6).forEach((s, i) => {
        const types = ['volume spike', 'IV expansion', 'OI jump', 'spread candidate']
        items.push({
          id: `setup-${i}`,
          type: types[i % types.length],
          ticker: s.ticker,
          detail: `${s.type.toUpperCase()} $${s.strike}`,
          direction: s.direction,
          iv: s.iv,
          volume: s.volume,
          score: s.score,
          time: Date.now() / 1000 - i * 120,
        })
      })
    }

    // Chain volume highlights
    if (chain?.chain) {
      const highVol = [...chain.chain]
        .filter(c => c.volume > 100)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 3)

      highVol.forEach((c, i) => {
        items.push({
          id: `chain-${i}`,
          type: 'volume spike',
          ticker: chain.underlying,
          detail: `${c.type.toUpperCase()} $${c.strike}`,
          direction: c.type === 'call' ? 'bullish' : 'bearish',
          iv: c.iv,
          volume: c.volume,
          score: c.score,
          time: Date.now() / 1000 - i * 300,
        })
      })
    }

    setActivities(items.slice(0, 10))
  }, [setups, chain])

  const typeIcons = {
    'volume spike': '📈',
    'IV expansion': '🔥',
    'OI jump': '📊',
    'spread candidate': '⚡',
  }

  return (
    <div>
      <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>◉ Activity Feed</h3>

      {activities.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No activity yet</p>
      ) : (
        <div className="space-y-2">
          {activities.map(a => {
            const isBull = a.direction === 'bullish'
            return (
              <div key={a.id} className="rounded p-2 slide-up" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-xs">{typeIcons[a.type] || '•'}</span>
                  <span className="text-xs font-bold" style={{ color: isBull ? 'var(--accent-green)' : 'var(--accent-red)' }}>{a.ticker}</span>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{a.detail}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--accent-orange)' }}>{a.type}</span>
                  <span className="text-xs tabular" style={{ color: 'var(--text-secondary)' }}>{timeAgo(a.time)}</span>
                </div>
                {a.volume && (
                  <div className="text-xs tabular mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Vol {a.volume?.toLocaleString()} · IV {(a.iv * 100).toFixed(0)}% · Score {a.score}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Quick summary */}
      <div className="mt-4 p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>Summary</h4>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>Bullish setups</span>
            <span className="tabular font-semibold" style={{ color: 'var(--accent-green)' }}>
              {setups?.filter(s => s.direction === 'bullish').length || 0}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>Bearish setups</span>
            <span className="tabular font-semibold" style={{ color: 'var(--accent-red)' }}>
              {setups?.filter(s => s.direction === 'bearish').length || 0}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>High IV (&gt;50%)</span>
            <span className="tabular font-semibold" style={{ color: 'var(--accent-orange)' }}>
              {setups?.filter(s => s.iv > 0.5).length || 0}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: 'var(--text-secondary)' }}>Avg score</span>
            <span className="tabular font-semibold">
              {setups?.length ? (setups.reduce((a, s) => a + (s.score || 0), 0) / setups.length).toFixed(1) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Watchlist quick stats */}
      <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h4 className="text-xs font-semibold mb-1" style={{ color: 'var(--accent-purple)' }}>⚡ Signals</h4>
        <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {setups?.filter(s => s.score >= 55).slice(0, 4).map((s) => (
            <div key={`${s.ticker}-${s.type}-${s.strike}`} className="flex justify-between">
              <span style={{ color: s.direction === 'bullish' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{s.ticker} {s.type.toUpperCase()} $${s.strike}</span>
              <span className="tabular">{s.score}/100</span>
            </div>
          ))}
          {(!setups || setups.filter(s => s.score >= 55).length === 0) && <span>No high-score signals</span>}
        </div>
      </div>
    </div>
  )
}