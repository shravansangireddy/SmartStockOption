import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import HeroStatStrip from './components/HeroStatStrip'
import SetupCards from './components/SetupCards'
import ChainTable from './components/ChainTable'
import ActivityFeed from './components/ActivityFeed'
import NewsPanel from './components/NewsPanel'
import TradeModal from './components/TradeModal'
import TickerView from './components/TickerView'
import ScannerPage from './components/ScannerPage'
import TickerTape from './components/TickerTape'
import ProbabilityPanel from './components/ProbabilityPanel'
import AnalysisPage from './components/AnalysisPage'
import StockScanner from './components/StockScanner'
import AlgorithmConfig from './components/AlgorithmConfig'
import WatchlistDetail from './components/WatchlistDetail'
import PriceChart from './components/PriceChart'

const API = '/api'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [activeTicker, setActiveTicker] = useState('SPY')
  const [dataProvider, setDataProvider] = useState('public') // 'public' | 'yahoo' | 'finnhub'

  // Listen for navigation events from scanner
  useEffect(() => {
    const handler = (e) => {
      setPage('analysis')
      setAnalysisTicker(e.detail.symbol || 'AAPL')
    }
    window.addEventListener('navigate-analysis', handler)
    return () => window.removeEventListener('navigate-analysis', handler)
  }, [])
  const [analysisTicker, setAnalysisTicker] = useState(null)
  const [setups, setSetups] = useState([])
  const [chain, setChain] = useState(null)
  const [snapshot, setSnapshot] = useState(null)
  const [quote, setQuote] = useState(null)
  const [watchlist, setWatchlist] = useState([])
  const [selectedContract, setSelectedContract] = useState(null)
  const [filterStrategy, setFilterStrategy] = useState('all')
  const [filterDirection, setFilterDirection] = useState('all')
  const [loading, setLoading] = useState({ setups: false, chain: false, snapshot: false })
  const [error, setError] = useState(null)

  const clearError = () => setError(null)

  // Refresh all data from APIs
  const refreshAll = useCallback(async () => {
    setLoading(l => ({ ...l, snapshot: true, setups: true, chain: true }))
    setToast('🔄 Refreshing all data…')
    try {
      const results = await Promise.allSettled([
        fetch(`${API}/market-snapshot?provider=${dataProvider}`).then(r => r.json()),
        fetch(`${API}/setups?provider=${dataProvider}`).then(r => r.json()),
        activeTicker ? fetch(`${API}/options/${activeTicker}?provider=${dataProvider}`).then(r => r.json()) : Promise.resolve(null),
        activeTicker ? fetch(`${API}/quote/${activeTicker}?provider=${dataProvider}`).then(r => r.json()) : Promise.resolve(null),
        fetch(`${API}/watchlist`).then(r => r.json()),
      ])

      // Snapshot
      if (results[0].status === 'fulfilled' && !results[0].value?.error) {
        setSnapshot(results[0].value)
      }
      // Setups
      if (results[1].status === 'fulfilled' && !results[1].value?.error) {
        setSetups(Array.isArray(results[1].value) ? results[1].value : [])
      }
      // Chain
      if (results[2].status === 'fulfilled' && results[2].value && !results[2].value?.error) {
        setChain(results[2].value)
      }
      // Quote
      if (results[3].status === 'fulfilled' && results[3].value && !results[3].value?.error) {
        setQuote(results[3].value)
      }
      // Watchlist
      if (results[4].status === 'fulfilled' && Array.isArray(results[4].value)) {
        setWatchlist(results[4].value)
      }

      setError(null)
      setToast('✓ Data refreshed')
    } catch (e) {
      setError(`Refresh failed: ${e.message}`)
      setToast('✗ Refresh failed')
    }
    setLoading(l => ({ ...l, snapshot: false, setups: false, chain: false }))
    setTimeout(() => setToast(null), 3000)
  }, [dataProvider, activeTicker])

  // Market snapshot
  const fetchSnapshot = useCallback(async () => {
    setLoading(l => ({ ...l, snapshot: true }))
    try {
      const res = await fetch(`${API}/market-snapshot?provider=${dataProvider}`)
      if (!res.ok) throw new Error(`Snapshot API: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSnapshot(data)
      setError(null)
    } catch (e) {
      console.error('snapshot:', e)
      setError(prev => prev || `Market data: ${e.message}`)
    }
    setLoading(l => ({ ...l, snapshot: false }))
  }, [dataProvider])

  // Setups
  const fetchSetups = useCallback(async () => {
    setLoading(l => ({ ...l, setups: true }))
    try {
      const res = await fetch(`${API}/setups?provider=${dataProvider}`)
      if (!res.ok) throw new Error(`Setups API: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSetups(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      console.error('setups:', e)
      setError(prev => prev || `Setups: ${e.message}. Click the ticker in sidebar to load its chain.`)
      setSetups([])
    }
    setLoading(l => ({ ...l, setups: false }))
  }, [dataProvider])

  // Options chain
  const fetchChain = useCallback(async (ticker, expiry) => {
    setLoading(l => ({ ...l, chain: true }))
    try {
      const params = expiry ? `?expiry=${expiry}&provider=${dataProvider}` : `?provider=${dataProvider}`
      const res = await fetch(`${API}/options/${ticker}${params}`)
      if (!res.ok) throw new Error(`Chain API: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setChain(data)
      setError(null)
    } catch (e) {
      console.error('chain:', e)
      setError(prev => prev || `Options chain for ${ticker}: ${e.message}`)
      setChain(null)
    }
    setLoading(l => ({ ...l, chain: false }))
  }, [dataProvider])

  // Quote
  const fetchQuote = useCallback(async (ticker) => {
    try {
      const res = await fetch(`${API}/quote/${ticker}?provider=${dataProvider}`)
      if (!res.ok) throw new Error(`Quote API: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setQuote(data)
    } catch (e) {
      console.error('quote:', e)
      setQuote(null)
    }
  }, [dataProvider])

  // Watchlist
  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API}/watchlist`)
      setWatchlist(await res.json())
    } catch (e) { console.error('watchlist:', e) }
  }, [])

  const [toast, setToast] = useState(null)

  const addWatchlist = async (raw) => {
    // Normalize field names from different sources:
    // - ScannerPage uses: symbol, mid, scores.overall, type='CALL'/'PUT'
    // - SetupCards uses: ticker, premium, score, type='call'/'put'
    // - TradeModal/Options chain uses: contractSymbol, underlying, mid, type='call'/'put'
    const ticker = raw.ticker || raw.symbol || raw.underlying || (raw.contractSymbol ? raw.contractSymbol.match(/^[A-Z]+/)?.[0] : null)
    const item = {
      ...raw,
      ticker,
      premium: raw.premium ?? raw.mid ?? null,
      score: raw.score ?? raw.scores?.overall ?? null,
      type: (raw.type || '').toLowerCase(),
    }
    if (!item.ticker) {
      setToast('\u2717 Cannot add: missing ticker/symbol')
      setTimeout(() => setToast(null), 3000)
      return
    }
    try {
      const res = await fetch(`${API}/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Watchlist API: ${res.status}`)
      }
      fetchWatchlist()
      setToast(`✓ ${item.ticker} ${item.type?.toUpperCase()} $${item.strike} added to watchlist`)
      setTimeout(() => setToast(null), 3000)
    } catch (e) {
      console.error('watchlist add:', e)
      setToast(`✗ Failed to add: ${e.message}`)
      setTimeout(() => setToast(null), 3000)
    }
  }

  const removeWatchlist = async (id) => {
    await fetch(`${API}/watchlist/${id}`, { method: 'DELETE' })
    fetchWatchlist()
  }

  const refreshWatchlist = useCallback(async () => {
    try {
      const res = await fetch(`${API}/watchlist/refresh-all`, { method: 'PUT' })
      if (res.ok) {
        const data = await res.json()
        setWatchlist(data)
        setToast('✓ Watchlist refreshed with live data')
        setTimeout(() => setToast(null), 3000)
      }
    } catch (e) {
      console.error('watchlist refresh:', e)
      setToast('✗ Refresh failed')
      setTimeout(() => setToast(null), 3000)
    }
  }, [])

  // Load on mount
  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])
  useEffect(() => { fetchSetups() }, [fetchSetups])
  useEffect(() => {
    if (activeTicker) {
      fetchChain(activeTicker)
      fetchQuote(activeTicker)
    }
  }, [activeTicker, fetchChain, fetchQuote])
  useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

  // Auto-refresh
  useEffect(() => {
    const iv = setInterval(() => {
      fetchSnapshot()
      if (activeTicker) fetchChain(activeTicker)
    }, 30000)
    return () => clearInterval(iv)
  }, [activeTicker, fetchSnapshot, fetchChain])

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '◉' },
    { id: 'scanner', label: 'Options Scan', icon: '⬡' },
    { id: 'stockScanner', label: 'Stock Scan', icon: '🔍' },
    { id: 'algorithms', label: 'ML Algorithms', icon: '🤖' },
    { id: 'analysis', label: 'Analysis', icon: '📊' },
    { id: 'watchlist', label: 'Watchlist', icon: '★' },
  ]

  const tickerGroups = {
    Indices: ['SPY', 'QQQ', 'IWM', 'DIA'],
    Tech: ['AAPL', 'MSFT', 'NVDA', 'GOOG', 'META', 'AMZN', 'AMD', 'TSLA'],
    Finance: ['JPM', 'GS', 'BAC', 'MS'],
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-semibold slide-up" style={{ background: 'var(--accent-green)', color: '#000' }}>
          {toast}
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <Sidebar
        navItems={navItems}
        activePage={page}
        onNav={setPage}
        tickerGroups={tickerGroups}
        activeTicker={activeTicker}
        onTicker={setActiveTicker}
        filterStrategy={filterStrategy}
        filterDirection={filterDirection}
        onFilterStrategy={setFilterStrategy}
        onFilterDirection={setFilterDirection}
        dataProvider={dataProvider}
        onProviderChange={setDataProvider}
      />

      {/* CENTER PANEL */}
      <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        {/* Error banner */}
        {error && (
          <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ background: 'var(--accent-red)', color: '#fff' }}>
            <span>⚠ {error}</span>
            <button onClick={clearError} className="ml-2 px-2 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.3)' }}>Dismiss</button>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-1.5" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <TickerTape />
          <button
            onClick={refreshAll}
            disabled={loading.snapshot && loading.setups && loading.chain}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all"
            style={{
              background: loading.snapshot ? 'var(--bg-card)' : 'var(--accent-cyan)',
              color: loading.snapshot ? 'var(--text-secondary)' : '#000',
              opacity: loading.snapshot ? 0.6 : 1,
              cursor: loading.snapshot ? 'not-allowed' : 'pointer',
            }}
          >
            <span className={loading.snapshot ? 'animate-spin' : ''} style={{ display: 'inline-block' }}>↻</span>
            {loading.snapshot ? 'Refreshing…' : 'Refresh All'}
          </button>
        </div>
        <HeroStatStrip snapshot={snapshot} setups={setups} loading={loading.snapshot} dataProvider={dataProvider} />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Connection notice */}
          {!snapshot && !loading.snapshot && (
            <div className="text-center py-8" style={{ color: 'var(--accent-orange)' }}>
              ⚠ Could not connect to API server. Make sure the backend is running on port 4000.
              <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                Run: <code style={{ background: 'var(--bg-card)', padding: '2px 6px', borderRadius: 3 }}>cd options-scanner/server && node index.js</code>
              </div>
            </div>
          )}

          {page === 'dashboard' && (
            <>
              <SetupCards setups={setups} loading={loading.setups} onSelect={c => setSelectedContract(c)} onAddWatchlist={addWatchlist} />
              {chain && (
                <ChainTable
                  chain={chain}
                  loading={loading.chain}
                  onSelect={c => setSelectedContract(c)}
                  filterDirection={filterDirection}
                />
              )}
              {!chain && !loading.chain && snapshot && (
                <div className="text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                  Click a ticker in the sidebar to load its options chain.
                </div>
              )}
            </>
          )}

          {page === 'scanner' && (
            <ScannerPage onAddWatchlist={addWatchlist} dataProvider={dataProvider} />
          )}

          {page === 'analysis' && (
            <AnalysisPage initialTicker={analysisTicker || activeTicker} onTickerChange={setAnalysisTicker} dataProvider={dataProvider} onNavigateAlgorithms={(sym) => { setPage('algorithms'); setActiveTicker(sym); }} />
          )}

          {page === 'stockScanner' && (
            <StockScanner dataProvider={dataProvider} onNavigateAnalysis={(sym) => { setPage('analysis'); setActiveTicker(sym); }} />
          )}

          {page === 'algorithms' && (
            <AlgorithmConfig symbol={activeTicker} dataProvider={dataProvider} onPredict={(result) => {
              console.log('[ML] Prediction result:', result);
            }} />
          )}

          {page === 'ticker' && (
            <>
            <PriceChart symbol={activeTicker} dataProvider={dataProvider} />
            <TickerView ticker={activeTicker} quote={quote} chain={chain} loading={loading.chain} onSelectContract={c => setSelectedContract(c)} onExpiryChange={expiry => fetchChain(activeTicker, expiry)} />
            </>
          )}

          {page === 'watchlist' && (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--accent-cyan)' }}>★ Watchlist</h2>
              {watchlist.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'var(--text-secondary)' }}>
                  <div className="text-4xl mb-3">★</div>
                  <p>No saved contracts yet.</p>
                  <p className="text-xs mt-1">Click <strong style={{ color: 'var(--accent-cyan)' }}>+ Watch</strong> on a setup card to add items.</p>
                </div>
              ) : (
                <WatchlistDetail watchlist={watchlist} onRemove={removeWatchlist} onSelect={c => setSelectedContract(c)} dataProvider={dataProvider} onRefresh={refreshWatchlist} />
              )}
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR */}
      <aside className="w-72 flex-shrink-0 overflow-y-auto p-3 space-y-3" style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)' }}>
        <ActivityFeed setups={setups} chain={chain} />
        <NewsPanel />
      </aside>

      {/* TRADE MODAL */}
      {selectedContract && (
        <TradeModal contract={selectedContract} quote={quote} onClose={() => setSelectedContract(null)} onAddWatchlist={addWatchlist} />
      )}
    </div>
  )
}