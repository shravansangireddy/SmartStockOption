import { useState, useEffect, useRef, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || ''

// ─── Color constants ─────────────────────────────────────────
const COLORS = {
  green: '#00d4aa',
  red: '#ff4d6a',
  cyan: '#00e5ff',
  orange: '#ff9100',
  grid: 'rgba(255,255,255,0.06)',
  gridText: 'rgba(255,255,255,0.35)',
  volumeGreen: 'rgba(0,212,170,0.4)',
  volumeRed: 'rgba(255,77,106,0.4)',
  sma20: '#ffd740',
  sma50: '#7c4dff',
  sma200: '#ff6e40',
  vwap: '#00e5ff',
  bb: 'rgba(0,229,255,0.15)',
  bbLine: 'rgba(0,229,255,0.4)',
}

// ─── SMA helper ──────────────────────────────────────────────
function sma(data, period) {
  if (data.length < period) return null
  return data.slice(-period).reduce((a, b) => a + b, 0) / period
}

// ─── Main Chart Component ────────────────────────────────────
export default function PriceChart({ symbol, dataProvider = 'yahoo', height = 340 }) {
  const [chartData, setChartData] = useState(null)
  const [period, setPeriod] = useState('1M')
  const [showSMA, setShowSMA] = useState({ sma20: true, sma50: true, sma200: false })
  const [showVolume, setShowVolume] = useState(true)
  const [hoverIdx, setHoverIdx] = useState(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)

  const periods = [
    { label: '1W', days: 7, interval: '5m' },
    { label: '1M', days: 30, interval: '1d' },
    { label: '3M', days: 90, interval: '1d' },
    { label: '6M', days: 180, interval: '1d' },
    { label: '1Y', days: 365, interval: '1d' },
    { label: '2Y', days: 730, interval: '1wk' },
  ]

  useEffect(() => { fetchChart() }, [symbol, period, dataProvider])

  const fetchChart = useCallback(async () => {
    if (!symbol) return
    try {
      const p = periods.find(p => p.label === period) || periods[1]
      const period1 = new Date(Date.now() - p.days * 86400000).toISOString().split('T')[0]
      const period2 = new Date().toISOString().split('T')[0]
      const res = await fetch(`${API}/api/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${p.interval}&provider=${dataProvider}`)
      if (!res.ok) throw new Error(`Chart API: ${res.status}`)
      const data = await res.json()
      setChartData(data)
    } catch (e) {
      console.error('[Chart]', e.message)
      setChartData(null)
    }
  }, [symbol, period, dataProvider])

  // Draw chart whenever data or settings change
  useEffect(() => { drawChart() }, [chartData, showSMA, showVolume, hoverIdx])

  const drawChart = () => {
    const canvas = canvasRef.current
    if (!canvas || !chartData?.quotes?.length) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const W = rect.width
    const H = height
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'
    ctx.scale(dpr, dpr)

    const quotes = chartData.quotes.filter(q => q.close != null && q.open != null)
    if (quotes.length < 2) return

    // Layout: price area + volume area
    const volumeH = showVolume ? 60 : 0
    const priceTop = 24
    const priceBottom = H - volumeH - 8
    const priceH = priceBottom - priceTop

    // Compute SMA values
    const closes = quotes.map(q => q.close)
    const sma20Data = [], sma50Data = [], sma200Data = []
    for (let i = 0; i < closes.length; i++) {
      sma20Data.push(i >= 19 ? sma(closes.slice(0, i + 1), 20) : null)
      sma50Data.push(i >= 49 ? sma(closes.slice(0, i + 1), 50) : null)
      sma200Data.push(i >= 199 ? sma(closes.slice(0, i + 1), 200) : null)
    }

    // Price range
    let priceMin = Infinity, priceMax = -Infinity
    for (const q of quotes) {
      if (q.high != null) priceMin = Math.min(priceMin, q.low), priceMax = Math.max(priceMax, q.high)
      else priceMin = Math.min(priceMin, q.close), priceMax = Math.max(priceMax, q.close)
    }
    // Include visible SMAs in range
    if (showSMA.sma20) { for (const v of sma20Data) if (v != null) { priceMin = Math.min(priceMin, v); priceMax = Math.max(priceMax, v) } }
    if (showSMA.sma50) { for (const v of sma50Data) if (v != null) { priceMin = Math.min(priceMin, v); priceMax = Math.max(priceMax, v) } }
    if (showSMA.sma200) { for (const v of sma200Data) if (v != null) { priceMin = Math.min(priceMin, v); priceMax = Math.max(priceMax, v) } }
    const pricePad = (priceMax - priceMin) * 0.05 || 1
    priceMin -= pricePad; priceMax += pricePad
    const priceScale = priceH / (priceMax - priceMin)

    // Volume range
    const volumes = quotes.map(q => q.volume || 0)
    const maxVol = Math.max(...volumes, 1)
    const volScale = volumeH / maxVol

    // Bar dimensions
    const rightPad = 56
    const chartW = W - rightPad - 8
    const barW = chartW / quotes.length
    const candleW = Math.max(1, barW * 0.7)
    const wickW = Math.max(1, barW * 0.15)

    // Helpers
    const priceY = (p) => priceBottom - (p - priceMin) * priceScale
    const volY = (v) => H - 4 - (v * volScale)
    const barX = (i) => 8 + i * barW + barW / 2

    // ── Clear ──
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(10,14,20,0.4)'
    ctx.fillRect(0, 0, W, H)

    // ── Grid lines ──
    const gridSteps = 5
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 0.5
    ctx.font = '10px monospace'
    ctx.fillStyle = COLORS.gridText
    ctx.textAlign = 'right'
    for (let i = 0; i <= gridSteps; i++) {
      const p = priceMin + (priceMax - priceMin) * i / gridSteps
      const y = priceY(p)
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(W - rightPad, y); ctx.stroke()
      ctx.fillText(p.toFixed(2), W - 4, y + 3)
    }

    // ── Volume bars ──
    if (showVolume) {
      for (let i = 0; i < quotes.length; i++) {
        const q = quotes[i]
        if (!q.volume) continue
        const isUp = q.close >= q.open
        ctx.fillStyle = isUp ? COLORS.volumeGreen : COLORS.volumeRed
        const vH = q.volume * volScale
        ctx.fillRect(barX(i) - candleW / 2, H - 4 - vH, candleW, vH)
      }
    }

    // ── SMA lines ──
    const drawSMA = (data, color) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.2
      ctx.beginPath()
      let started = false
      for (let i = 0; i < data.length; i++) {
        if (data[i] == null) continue
        const x = barX(i), y = priceY(data[i])
        if (!started) { ctx.moveTo(x, y); started = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    if (showSMA.sma20) drawSMA(sma20Data, COLORS.sma20)
    if (showSMA.sma50) drawSMA(sma50Data, COLORS.sma50)
    if (showSMA.sma200) drawSMA(sma200Data, COLORS.sma200)

    // ── Candlesticks ──
    for (let i = 0; i < quotes.length; i++) {
      const q = quotes[i]
      const isUp = q.close >= q.open
      const color = isUp ? COLORS.green : COLORS.red
      const x = barX(i)
      const oY = priceY(q.open), cY = priceY(q.close)
      const hY = priceY(q.high || q.close), lY = priceY(q.low || q.close)

      // Wick
      ctx.strokeStyle = color
      ctx.lineWidth = wickW
      ctx.beginPath()
      ctx.moveTo(x, hY); ctx.lineTo(x, lY)
      ctx.stroke()

      // Body
      const bodyTop = Math.min(oY, cY)
      const bodyH = Math.max(Math.abs(cY - oY), 1)
      if (isUp) {
        ctx.fillStyle = 'transparent'
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH)
      } else {
        ctx.fillStyle = color
        ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
      }
    }

    // ── Hover crosshair ──
    if (hoverIdx != null && hoverIdx >= 0 && hoverIdx < quotes.length) {
      const q = quotes[hoverIdx]
      const x = barX(hoverIdx)
      // Vertical line
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'
      ctx.lineWidth = 0.5
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(x, priceTop); ctx.lineTo(x, priceBottom); ctx.stroke()
      ctx.setLineDash([])
      // Horizontal line at close
      ctx.strokeStyle = 'rgba(0,229,255,0.3)'
      ctx.beginPath(); ctx.moveTo(8, priceY(q.close)); ctx.lineTo(W - rightPad, priceY(q.close)); ctx.stroke()
      // Highlight candle
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(x - candleW / 2 - 1, priceY(Math.max(q.open, q.close)) - 1, candleW + 2, Math.abs(priceY(q.open) - priceY(q.close)) + 2 || 4)
    }

    // ── Current price line ──
    const lastClose = quotes[quotes.length - 1].close
    const prevClose = quotes.length > 1 ? quotes[quotes.length - 2].close : lastClose
    const isUp = lastClose >= prevClose
    ctx.strokeStyle = isUp ? COLORS.green : COLORS.red
    ctx.lineWidth = 0.8
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(8, priceY(lastClose)); ctx.lineTo(W - rightPad, priceY(lastClose)); ctx.stroke()
    ctx.setLineDash([])

    // Price label
    ctx.fillStyle = isUp ? COLORS.green : COLORS.red
    ctx.fillRect(W - rightPad, priceY(lastClose) - 8, rightPad - 2, 16)
    ctx.fillStyle = '#000'
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(lastClose.toFixed(2), W - rightPad / 2, priceY(lastClose) + 3)
  }

  // Mouse handlers
  const handleMouseMove = (e) => {
    if (!chartData?.quotes?.length || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const rightPad = 56
    const chartW = rect.width - rightPad - 8
    const barW = chartW / chartData.quotes.filter(q => q.close != null).length
    const idx = Math.floor((x - 8) / barW)
    setHoverIdx(idx >= 0 ? idx : null)
  }

  const quotes = chartData?.quotes?.filter(q => q.close != null) || []
  const hovered = hoverIdx != null && hoverIdx >= 0 && hoverIdx < quotes.length ? quotes[hoverIdx] : null

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>{symbol}</span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Price Chart</span>
        </div>
        <div className="flex items-center gap-1">
          {periods.map(p => (
            <button key={p.label} onClick={() => setPeriod(p.label)}
              className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
              style={{ background: period === p.label ? 'var(--accent-cyan)' : 'var(--bg-secondary)', color: period === p.label ? '#000' : 'var(--text-secondary)' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* SMA toggles */}
      <div className="flex items-center gap-3 px-3 py-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setShowSMA(s => ({ ...s, sma20: !s.sma20 }))}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ background: showSMA.sma20 ? COLORS.sma20 : 'transparent', color: showSMA.sma20 ? '#000' : COLORS.sma20, border: `1px solid ${COLORS.sma20}` }}>
          SMA20
        </button>
        <button onClick={() => setShowSMA(s => ({ ...s, sma50: !s.sma50 }))}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ background: showSMA.sma50 ? COLORS.sma50 : 'transparent', color: showSMA.sma50 ? '#fff' : COLORS.sma50, border: `1px solid ${COLORS.sma50}` }}>
          SMA50
        </button>
        <button onClick={() => setShowSMA(s => ({ ...s, sma200: !s.sma200 }))}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ background: showSMA.sma200 ? COLORS.sma200 : 'transparent', color: showSMA.sma200 ? '#fff' : COLORS.sma200, border: `1px solid ${COLORS.sma200}` }}>
          SMA200
        </button>
        <button onClick={() => setShowVolume(v => !v)}
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ background: showVolume ? 'var(--accent-cyan)' : 'transparent', color: showVolume ? '#000' : 'var(--text-secondary)', border: '1px solid var(--accent-cyan)' }}>
          Vol
        </button>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="flex items-center gap-3 px-3 py-1 text-xs tabular" style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>{new Date(hovered.date || hovered.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          <span>O <span style={{ color: 'var(--text-primary)' }}>${hovered.open?.toFixed(2)}</span></span>
          <span>H <span style={{ color: COLORS.green }}>${hovered.high?.toFixed(2)}</span></span>
          <span>L <span style={{ color: COLORS.red }}>${hovered.low?.toFixed(2)}</span></span>
          <span>C <span style={{ color: hovered.close >= hovered.open ? COLORS.green : COLORS.red }}>${hovered.close?.toFixed(2)}</span></span>
          {hovered.volume != null && <span>Vol <span style={{ color: 'var(--accent-cyan)' }}>{(hovered.volume / 1e6).toFixed(1)}M</span></span>}
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: 'crosshair' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
      </div>

      {/* Loading / empty state */}
      {!chartData && (
        <div className="text-center py-8 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {symbol ? 'Loading chart...' : 'Select a ticker'}
        </div>
      )}
    </div>
  )
}