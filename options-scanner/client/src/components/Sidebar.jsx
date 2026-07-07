import ProbabilityPanel from './ProbabilityPanel'

export default function Sidebar({ navItems, activePage, onNav, tickerGroups, activeTicker, onTicker, filterStrategy, filterDirection, onFilterStrategy, onFilterDirection, dataProvider = 'public', onProviderChange }) {
  const strategies = ['all', 'Long Call', 'Long Put', 'Bull Put Spread', 'Bear Call Spread', 'Iron Condor', 'Butterfly']
  const directions = ['all', 'bullish', 'bearish']

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col overflow-y-auto" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
      {/* Logo */}
      <div className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl" style={{ color: 'var(--accent-cyan)' }}>⬡</span>
          <span className="font-bold text-sm tracking-wider" style={{ color: 'var(--accent-cyan)' }}>OPTSCAN</span>
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Options Terminal</div>
      </div>

      {/* Data Provider Toggle */}
      <div className="px-3 py-2">
        <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>DATA SOURCE</div>
        <div className="flex rounded-md overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button
            onClick={() => onProviderChange('public')}
            className="flex-1 px-1.5 py-1.5 text-xs font-semibold transition-all"
            style={{
              background: dataProvider === 'public' ? 'var(--accent-green)' : 'var(--bg-card)',
              color: dataProvider === 'public' ? '#000' : 'var(--text-secondary)',
            }}
          >
            🔑 Public
          </button>
          <button
            onClick={() => onProviderChange('yahoo')}
            className="flex-1 px-1.5 py-1.5 text-xs font-semibold transition-all"
            style={{
              background: dataProvider === 'yahoo' ? 'var(--accent-cyan)' : 'var(--bg-card)',
              color: dataProvider === 'yahoo' ? '#000' : 'var(--text-secondary)',
            }}
          >
            ☁ Yahoo
          </button>
          <button
            onClick={() => onProviderChange('finnhub')}
            className="flex-1 px-1.5 py-1.5 text-xs font-semibold transition-all"
            style={{
              background: dataProvider === 'finnhub' ? 'var(--accent-orange)' : 'var(--bg-card)',
              color: dataProvider === 'finnhub' ? '#000' : 'var(--text-secondary)',
            }}
          >
            ⚡ Finnhub
          </button>
        </div>
        {dataProvider === 'public' && (
          <div className="text-xs mt-1" style={{ color: 'var(--accent-green)', opacity: 0.8 }}>
            🔑 Live data via Public.com API
          </div>
        )}
        {dataProvider === 'finnhub' && (
          <div className="text-xs mt-1" style={{ color: 'var(--accent-orange)', opacity: 0.8 }}>
            ⚡ Quotes via Finnhub · Options/history fallback to Yahoo
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="px-2 py-2 space-y-0.5">
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => onNav(n.id)}
            className="w-full text-left px-3 py-2 rounded-md text-xs flex items-center gap-2 transition-colors"
            style={{
              background: activePage === n.id ? 'var(--bg-card)' : 'transparent',
              color: activePage === n.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
              border: activePage === n.id ? '1px solid var(--border)' : '1px solid transparent',
            }}
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Ticker Groups */}
      <div className="px-3 py-2">
        <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>TICKERS</div>
        {Object.entries(tickerGroups).map(([group, tickers]) => (
          <div key={group} className="mb-3">
            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{group}</div>
            <div className="flex flex-wrap gap-1">
              {tickers.map(t => (
                <button
                  key={t}
                  onClick={() => { onTicker(t); onNav('ticker'); }}
                  className="px-1.5 py-0.5 rounded text-xs tabular"
                  style={{
                    background: activeTicker === t ? 'var(--accent-cyan)' : 'var(--bg-card)',
                    color: activeTicker === t ? '#000' : 'var(--text-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Strategy Filter */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>STRATEGY</div>
        <select
          value={filterStrategy}
          onChange={e => onFilterStrategy(e.target.value)}
          className="w-full px-2 py-1 rounded text-xs"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          {strategies.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'All Strategies' : s}</option>
          ))}
        </select>
      </div>

      {/* Direction Filter */}
      <div className="px-3 py-2">
        <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>DIRECTION</div>
        <select
          value={filterDirection}
          onChange={e => onFilterDirection(e.target.value)}
          className="w-full px-2 py-1 rounded text-xs"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          {directions.map(d => (
            <option key={d} value={d}>{d === 'all' ? 'All Directions' : d.charAt(0).toUpperCase() + d.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Probability Panel */}
      <ProbabilityPanel dataProvider={dataProvider} />
    </aside>
  )
}