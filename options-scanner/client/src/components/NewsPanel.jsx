import { useState, useEffect, useCallback } from 'react'

const API = '/api'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function categoryIcon(cat) {
  switch (cat) {
    case 'economy': return '🏦'
    case 'earnings': return '💰'
    case 'fed': return '🏛️'
    case 'crypto': return '₿'
    case 'options': return '📊'
    case 'geopolitics': return '🌍'
    default: return '📰'
  }
}

function impactColor(impact) {
  switch (impact) {
    case 'bullish': return 'var(--accent-green)'
    case 'bearish': return 'var(--accent-red)'
    case 'volatile': return 'var(--accent-orange)'
    default: return 'var(--text-secondary)'
  }
}

export default function NewsPanel({ watchlistTickers }) {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchNews = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/news`)
      if (!res.ok) throw new Error(`News API: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setNews(Array.isArray(data) ? data : data.items || [])
    } catch (e) {
      console.error('news:', e)
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchNews() }, [fetchNews])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const iv = setInterval(fetchNews, 300000)
    return () => clearInterval(iv)
  }, [fetchNews])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold" style={{ color: 'var(--accent-cyan)' }}>📰 Market News</h3>
        <button onClick={fetchNews} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }} title="Refresh news">↻</button>
      </div>

      {loading && news.length === 0 && (
        <div className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>Loading news…</div>
      )}

      {error && (
        <div className="text-xs py-2" style={{ color: 'var(--accent-orange)' }}>⚠ {error}</div>
      )}

      <div className="space-y-2">
        {news.slice(0, 12).map((item) => (
          <a
            key={item.url || item.title}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded p-2 transition-colors slide-up"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-card)'}
          >
            <div className="flex items-start gap-1.5">
              <span className="text-xs mt-0.5 flex-shrink-0">{categoryIcon(item.category)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {item.title}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {item.source}
                  </span>
                  {item.impact && (
                    <span className="text-xs font-semibold" style={{ color: impactColor(item.impact) }}>
                      {item.impact === 'bullish' ? '▲' : item.impact === 'bearish' ? '▼' : item.impact === 'volatile' ? '⚡' : '●'} {item.impact}
                    </span>
                  )}
                  <span className="text-xs ml-auto tabular" style={{ color: 'var(--text-secondary)' }}>
                    {timeAgo(item.published)}
                  </span>
                </div>
                {item.tickers && item.tickers.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {item.tickers.slice(0, 4).map((t, j) => (
                      <span key={j} className="text-xs px-1 rounded" style={{ background: 'var(--bg-secondary)', color: 'var(--accent-cyan)' }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>

      {news.length === 0 && !loading && !error && (
        <div className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>No news available</div>
      )}
    </div>
  )
}