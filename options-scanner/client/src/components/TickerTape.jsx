import { useState, useEffect, useCallback } from 'react'

const API = '/api'

const TICKERS = [
  { symbol: 'SPY', label: 'SPY', color: 'var(--accent-cyan)' },
  { symbol: 'QQQ', label: 'QQQ', color: 'var(--accent-purple)' },
  { symbol: '^DJI', label: 'DJI', color: 'var(--accent-orange)' },
]

export default function TickerTape() {
  const [quotes, setQuotes] = useState({})
  const [error, setError] = useState(null)

  const fetchQuotes = useCallback(async () => {
    try {
      const results = {}
      // Fetch in parallel
      await Promise.all(TICKERS.map(async (t) => {
        try {
          const res = await fetch(`${API}/quote/${t.symbol}`)
          if (!res.ok) throw new Error(`${t.symbol}: ${res.status}`)
          const data = await res.json()
          results[t.symbol] = data
        } catch (e) {
          // Keep previous data if fetch fails for one ticker
          console.warn(`TickerTape: failed to fetch ${t.symbol}`, e.message)
        }
      }))
      if (Object.keys(results).length > 0) {
        setQuotes(prev => ({ ...prev, ...results }))
        setError(null)
      }
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    fetchQuotes()
    const iv = setInterval(fetchQuotes, 15000) // refresh every 15s
    return () => clearInterval(iv)
  }, [fetchQuotes])

  // Build ticker data array (no React elements yet)
  const tickerData = TICKERS.map(t => {
    const q = quotes[t.symbol]
    if (!q) return null
    const change = q.change ?? 0
    const changePercent = q.changePercent ?? 0
    const isUp = change >= 0
    return { key: t.symbol, label: t.label, color: t.color, price: q.price, change, changePercent, isUp }
  }).filter(Boolean)

  // Duplicate 3x for seamless scroll with unique keys
  const allItems = [0, 1, 2].flatMap(copy =>
    tickerData.map(t => (
      <div key={`${t.key}-${copy}`} className="ticker-tape-item">
        <span className="ticker-symbol" style={{ color: t.color }}>{t.label}</span>
        <span className="ticker-price tabular">${t.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <span className="ticker-change tabular" style={{ color: t.isUp ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {t.isUp ? '▲' : '▼'} {t.isUp ? '+' : ''}{t.change?.toFixed(2)} ({t.isUp ? '+' : ''}{t.changePercent?.toFixed(2)}%)
        </span>
      </div>
    ))
  )

  if (tickerData.length === 0) return null

  return (
    <div className="ticker-tape-container">
      <div className="ticker-tape-track">
        {allItems}
      </div>
    </div>
  )
}