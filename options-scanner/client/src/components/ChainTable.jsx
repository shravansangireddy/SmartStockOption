import { useState, useMemo } from 'react'

export default function ChainTable({ chain, loading, onSelect, filterDirection }) {
  const [sortBy, setSortBy] = useState('score')
  const [sortDir, setSortDir] = useState('desc')
  const [filterType, setFilterType] = useState(filterDirection === 'all' ? 'all' : filterDirection === 'bullish' ? 'call' : 'put')
  const [search, setSearch] = useState('')

  const sorted = useMemo(() => {
    if (!chain?.chain) return []
    let data = [...chain.chain]

    // Filter type
    if (filterType !== 'all') data = data.filter(d => d.type === filterType)

    // Search strike
    if (search) data = data.filter(d => String(d.strike).includes(search) || d.contractSymbol?.toLowerCase().includes(search.toLowerCase()))

    // Sort
    data.sort((a, b) => {
      const aVal = a[sortBy] ?? 0
      const bVal = b[sortBy] ?? 0
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })

    return data
  }, [chain, sortBy, sortDir, filterType, search])

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

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
    { key: 'delta', label: 'Delta' },
    { key: 'gamma', label: 'Gamma' },
    { key: 'theta', label: 'Theta' },
    { key: 'score', label: 'Score' },
  ]

  if (loading) {
    return <div className="text-center py-8 pulse-subtle" style={{ color: 'var(--text-secondary)' }}>Loading chain…</div>
  }

  if (!chain) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>
          ⚡ {chain.underlying} Options Chain
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-secondary)' }}>
            {sorted.length} contracts
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Strike or symbol…"
            className="px-2 py-1 rounded text-xs"
            style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', width: 140 }}
          />
          <div className="flex gap-1">
            {['all', 'call', 'put'].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className="px-2 py-1 rounded text-xs"
                style={{
                  background: filterType === t ? 'var(--accent-cyan)' : 'var(--bg-card)',
                  color: filterType === t ? '#000' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {t === 'all' ? 'All' : t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="px-2 py-1.5 text-left cursor-pointer hover:opacity-80 font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {col.label}
                  {sortBy === col.key && <span className="ml-0.5">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((row) => {
              const isBull = row.type === 'call'
              const accentColor = isBull ? 'var(--accent-green)' : 'var(--accent-red)'
              const scoreColor = row.score >= 60 ? 'var(--accent-green)' : row.score >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)'
              const rowKey = `${row.type}-${row.strike}-${row.expirationDate || row.contractSymbol || ''}-${row.key || ''}`

              return (
                <tr
                  key={rowKey}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  onClick={() => onSelect(row)}
                >
                  <td className="px-2 py-1.5 tabular font-semibold">${row.strike}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded font-semibold text-xs" style={{ background: isBull ? 'rgba(0,212,170,0.15)' : 'rgba(255,77,106,0.15)', color: accentColor }}>
                      {row.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 tabular" style={{ color: 'var(--accent-green)' }}>{row.bid?.toFixed(2)}</td>
                  <td className="px-2 py-1.5 tabular" style={{ color: 'var(--accent-red)' }}>{row.ask?.toFixed(2)}</td>
                  <td className="px-2 py-1.5 tabular">{row.mid?.toFixed(2)}</td>
                  <td className="px-2 py-1.5 tabular" style={{ color: 'var(--accent-cyan)' }}>{row.lastPrice?.toFixed(2)}</td>
                  <td className="px-2 py-1.5 tabular">{row.volume?.toLocaleString()}</td>
                  <td className="px-2 py-1.5 tabular">{row.openInterest?.toLocaleString()}</td>
                  <td className="px-2 py-1.5 tabular" style={{ color: 'var(--accent-orange)' }}>{row.iv ? (row.iv * 100).toFixed(1) : '—'}</td>
                  <td className="px-2 py-1.5 tabular">{row.delta?.toFixed(3)}</td>
                  <td className="px-2 py-1.5 tabular">{row.gamma?.toFixed(4)}</td>
                  <td className="px-2 py-1.5 tabular">{row.theta?.toFixed(4)}</td>
                  <td className="px-2 py-1.5 tabular font-bold" style={{ color: scoreColor }}>{row.score}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}