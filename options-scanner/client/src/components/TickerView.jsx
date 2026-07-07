import { useState, useEffect } from 'react'

export default function TickerView({ ticker, quote, chain, loading, onSelectContract, onExpiryChange }) {
  const [selectedExpiry, setSelectedExpiry] = useState(null)

  // Auto-select first non-0-DTE expiry when chain loads
  useEffect(() => {
    if (chain?.expirationDates?.length && selectedExpiry === null) {
      // Skip 0-DTE (today) — find first expiry with DTE >= 1
      const now = Date.now()
      const valid = chain.expirationDates.find(ts => {
        const d = new Date(typeof ts === 'number' ? ts * 1000 : ts).getTime()
        return Math.ceil((d - now) / 86400000) >= 1
      })
      const first = valid || chain.expirationDates[0]
      setSelectedExpiry(first)
      if (onExpiryChange) onExpiryChange(first)
    }
  }, [chain?.expirationDates])

  if (!quote && !chain) {
    return (
      <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
        Select a ticker from the sidebar to view details.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quote header */}
      {quote && (
        <div className="p-4 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-end gap-4 mb-3">
            <div>
              <div className="text-2xl font-bold" style={{ color: 'var(--accent-cyan)' }}>{ticker}</div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Options Chain View</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-3xl font-bold tabular">${quote.price?.toFixed(2)}</div>
              <div className="text-sm tabular" style={{ color: quote.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {quote.change >= 0 ? '+' : ''}{quote.change?.toFixed(2)} ({quote.changePercent?.toFixed(2)}%)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Day High</div>
              <div className="text-sm tabular font-semibold">${quote.dayHigh?.toFixed(2)}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Day Low</div>
              <div className="text-sm tabular font-semibold">${quote.dayLow?.toFixed(2)}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>50D Avg</div>
              <div className="text-sm tabular font-semibold">${quote.fiftyDayAvg?.toFixed(2)}</div>
            </div>
            <div className="p-2 rounded" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Volume</div>
              <div className="text-sm tabular font-semibold">{quote.volume?.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {/* Expiry selector */}
      {chain?.expirationDates && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Expiry:</span>
          {chain.expirationDates.map(ts => {
            const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const dte = Math.ceil((d.getTime() - Date.now()) / 86400000)
            return (
              <button
                key={ts}
                onClick={() => { setSelectedExpiry(ts); if (onExpiryChange) onExpiryChange(ts); }}
                className="px-2 py-1 rounded text-xs whitespace-nowrap"
                style={{
                  background: selectedExpiry === ts ? 'var(--accent-cyan)' : 'var(--bg-card)',
                  color: selectedExpiry === ts ? '#000' : 'var(--text-primary)',
                  border: '1px solid var(--border)',
                }}
              >
                {label} ({dte}d)
              </button>
            )
          })}
        </div>
      )}

      {/* Chain info */}
      {chain && (
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {chain.chain?.length} contracts loaded · Strikes {Math.min(...(chain.strikes || [0])).toFixed(0)}–{Math.max(...(chain.strikes || [0])).toFixed(0)}
        </div>
      )}

      {/* Embedded chain table */}
      {chain && (
        <ChainTableInline chain={chain} loading={loading} onSelect={onSelectContract} />
      )}
    </div>
  )
}

function ChainTableInline({ chain, loading, onSelect }) {
  const [sortBy, setSortBy] = useState('score')
  const [sortDir, setSortDir] = useState('desc')
  const [filterType, setFilterType] = useState('all')

  if (loading) return <div className="text-center py-4 pulse-subtle" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
  if (!chain?.chain) return null

  let data = [...chain.chain]
  if (filterType !== 'all') data = data.filter(d => d.type === filterType)
  data.sort((a, b) => sortDir === 'desc' ? (b[sortBy] || 0) - (a[sortBy] || 0) : (a[sortBy] || 0) - (b[sortBy] || 0))

  const columns = [
    { key: 'strike', label: 'Strike' },
    { key: 'type', label: 'Type' },
    { key: 'bid', label: 'Bid' },
    { key: 'ask', label: 'Ask' },
    { key: 'mid', label: 'Mid' },
    { key: 'lastPrice', label: 'Last' },
    { key: 'volume', label: 'Vol' },
    { key: 'openInterest', label: 'OI' },
    { key: 'iv', label: 'IV%' },
    { key: 'delta', label: 'Δ' },
    { key: 'gamma', label: 'Γ' },
    { key: 'theta', label: 'Θ' },
    { key: 'score', label: 'Score' },
  ]

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {['all', 'call', 'put'].map(t => (
          <button key={t} onClick={() => setFilterType(t)} className="px-2 py-1 rounded text-xs" style={{ background: filterType === t ? 'var(--accent-cyan)' : 'var(--bg-card)', color: filterType === t ? '#000' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {t === 'all' ? 'All' : t.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {columns.map(col => (
                <th key={col.key} onClick={() => { if (sortBy === col.key) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortBy(col.key); setSortDir('desc') } }} className="px-2 py-1.5 text-left cursor-pointer font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 80).map((row) => {
              const isBull = row.type === 'call'
              const accentColor = isBull ? 'var(--accent-green)' : 'var(--accent-red)'
              const scoreColor = row.score >= 60 ? 'var(--accent-green)' : row.score >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)'
              const rowKey = `${row.type}-${row.strike}-${row.expirationDate || row.contractSymbol || ''}`
              return (
                <tr key={rowKey} className="cursor-pointer transition-colors" style={{ borderBottom: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => onSelect(row)}>
                  <td className="px-2 py-1 tabular font-semibold">${row.strike}</td>
                  <td className="px-2 py-1"><span className="px-1 py-0.5 rounded font-semibold" style={{ background: isBull ? 'rgba(0,212,170,0.15)' : 'rgba(255,77,106,0.15)', color: accentColor }}>{row.type.toUpperCase()}</span></td>
                  <td className="px-2 py-1 tabular" style={{ color: 'var(--accent-green)' }}>{row.bid?.toFixed(2)}</td>
                  <td className="px-2 py-1 tabular" style={{ color: 'var(--accent-red)' }}>{row.ask?.toFixed(2)}</td>
                  <td className="px-2 py-1 tabular">{row.mid?.toFixed(2)}</td>
                  <td className="px-2 py-1 tabular" style={{ color: 'var(--accent-cyan)' }}>{row.lastPrice?.toFixed(2)}</td>
                  <td className="px-2 py-1 tabular">{row.volume?.toLocaleString()}</td>
                  <td className="px-2 py-1 tabular">{row.openInterest?.toLocaleString()}</td>
                  <td className="px-2 py-1 tabular" style={{ color: 'var(--accent-orange)' }}>{row.iv ? (row.iv * 100).toFixed(1) : '—'}</td>
                  <td className="px-2 py-1 tabular">{row.delta?.toFixed(3)}</td>
                  <td className="px-2 py-1 tabular">{row.gamma?.toFixed(4)}</td>
                  <td className="px-2 py-1 tabular">{row.theta?.toFixed(4)}</td>
                  <td className="px-2 py-1 tabular font-bold" style={{ color: scoreColor }}>{row.score}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}