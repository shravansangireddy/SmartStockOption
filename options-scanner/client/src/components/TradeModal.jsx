export default function TradeModal({ contract, quote, onClose, onAddWatchlist }) {
  if (!contract) return null

  const isBull = contract.direction === 'bullish' || contract.type === 'call'
  const accentColor = isBull ? 'var(--accent-green)' : 'var(--accent-red)'

  // Risk/reward estimation (simple for MVP)
  const premium = contract.premium || contract.mid || contract.lastPrice || 0
  const underlyingPrice = contract.underlyingPrice || quote?.price || 0
  const strike = contract.strike || 0

  // Probability estimate from delta
  const probability = contract.delta ? Math.abs(contract.delta) * 100 : null

  // Simple risk/reward
  const maxRisk = premium
  const maxReward = contract.type === 'call'
    ? Math.max(0, underlyingPrice - strike - premium)
    : Math.max(0, strike - underlyingPrice - premium)
  const rrRatio = maxRisk > 0 ? (maxReward / maxRisk).toFixed(2) : '—'

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={handleBackdrop}>
      <div className="w-full max-w-2xl rounded-xl overflow-hidden slide-up" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex justify-between items-center p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold" style={{ color: accentColor }}>{contract.ticker || contract.underlying || '?'}</span>
            <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: isBull ? 'rgba(0,212,170,0.15)' : 'rgba(255,77,106,0.15)', color: accentColor }}>
              {contract.type?.toUpperCase() || contract.direction?.toUpperCase()} $${strike}
            </span>
            {contract.dte != null && (
              <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: contract.dte <= 7 ? 'rgba(255,77,106,0.15)' : contract.dte <= 14 ? 'rgba(255,152,0,0.15)' : 'rgba(0,212,170,0.1)', color: contract.dte <= 7 ? 'var(--accent-red)' : contract.dte <= 14 ? 'var(--accent-orange)' : 'var(--text-secondary)' }}>
                ⏳ {contract.dte}d
              </span>
            )}
            {contract.expiration && (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{contract.expiration}</span>
            )}
            {contract.strategy && <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{contract.strategy}</span>}
          </div>
          <button onClick={onClose} className="text-lg px-2" style={{ color: 'var(--text-secondary)' }}>✕</button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Underlying price */}
          {underlyingPrice > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Underlying</span>
              <span className="text-xl font-bold tabular">${underlyingPrice.toFixed(2)}</span>
              {quote?.change !== undefined && (
                <span className="text-sm tabular" style={{ color: quote.change >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {quote.change >= 0 ? '+' : ''}{quote.change?.toFixed(2)} ({quote.changePercent?.toFixed(2)}%)
                </span>
              )}
            </div>
          )}

          {/* Contract details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Detail label="Premium" value={`$${premium?.toFixed(2)}`} />
            <Detail label="Bid" value={contract.bid ? `$${contract.bid.toFixed(2)}` : '—'} color="var(--accent-green)" />
            <Detail label="Ask" value={contract.ask ? `$${contract.ask.toFixed(2)}` : '—'} color="var(--accent-red)" />
            <Detail label="Mid" value={contract.mid ? `$${contract.mid.toFixed(2)}` : '—'} />
            <Detail label="Volume" value={contract.volume?.toLocaleString()} />
            <Detail label="Open Interest" value={contract.openInterest?.toLocaleString()} />
            <Detail label="DTE" value={contract.dte != null ? contract.dte : '—'} color={contract.dte != null && contract.dte <= 7 ? 'var(--accent-red)' : contract.dte <= 14 ? 'var(--accent-orange)' : undefined} />
            <Detail label="ITM" value={contract.inTheMoney ? 'Yes' : 'No'} color={contract.inTheMoney ? 'var(--accent-green)' : 'var(--text-secondary)'} />
          </div>

          {/* Greeks */}
          <div>
            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--accent-cyan)' }}>GREEKS</h4>
            <div className="grid grid-cols-5 gap-2">
              <GreekBox label="Delta" value={contract.delta?.toFixed(4)} color={accentColor} />
              <GreekBox label="Gamma" value={contract.gamma?.toFixed(4)} />
              <GreekBox label="Theta" value={contract.theta?.toFixed(4)} color="var(--accent-orange)" />
              <GreekBox label="Vega" value={contract.vega?.toFixed(4)} />
              <GreekBox label="Rho" value={contract.rho?.toFixed(4)} />
            </div>
          </div>

          {/* IV */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-secondary)' }}>Implied Volatility</span>
              <span className="tabular font-bold" style={{ color: 'var(--accent-orange)' }}>{contract.iv ? `${(contract.iv * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min((contract.iv || 0) * 100, 100)}%`, background: 'var(--accent-orange)' }} />
            </div>
          </div>

          {/* Probability / Score */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Probability (Δ-based)</div>
              <div className="text-2xl font-bold tabular" style={{ color: accentColor }}>
                {probability !== null ? `${probability.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Setup Score</div>
              <div className="text-2xl font-bold tabular" style={{ color: contract.score >= 60 ? 'var(--accent-green)' : contract.score >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)' }}>
                {contract.score}/100
              </div>
            </div>
          </div>

          {/* Risk/Reward */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.2)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--accent-red)' }}>Max Risk</div>
              <div className="text-lg font-bold tabular">${maxRisk.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--accent-green)' }}>Max Reward</div>
              <div className="text-lg font-bold tabular">${maxReward.toFixed(2)}</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ background: 'var(--bg-card)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>R/R Ratio</div>
              <div className="text-lg font-bold tabular" style={{ color: 'var(--accent-cyan)' }}>{rrRatio}</div>
            </div>
          </div>

          {/* Notes */}
          <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: 'var(--accent-cyan)' }}>Notes</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {contract.type === 'call' ? (
                <>
                  Long call at $${strike} strike. Break-even at $${(strike + premium).toFixed(2)}.
                  {contract.delta && Math.abs(contract.delta) < 0.3 && ' Low delta — speculative OTM play.'}
                  {contract.delta && Math.abs(contract.delta) > 0.5 && ' High delta — ITM, moves with underlying.'}
                  {contract.theta && Math.abs(contract.theta) > 0.05 && ' Significant time decay — watch DTE.'}
                </>
              ) : (
                <>
                  Long put at $${strike} strike. Break-even at $${(strike - premium).toFixed(2)}.
                  {contract.delta && Math.abs(contract.delta) < 0.3 && ' Low delta — speculative OTM play.'}
                  {contract.delta && Math.abs(contract.delta) > 0.5 && ' High delta — ITM, moves with underlying.'}
                  {contract.theta && Math.abs(contract.theta) > 0.05 && ' Significant time decay — watch DTE.'}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => { onAddWatchlist({ ...contract, id: `${contract.ticker || contract.underlying}-${contract.type}-${contract.strike}-${Date.now()}` }) }}
            className="px-4 py-2 rounded text-sm font-semibold transition-colors"
            style={{ background: 'var(--accent-cyan)', color: '#000' }}
          >
            + Add to Watchlist
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm"
            style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, color }) {
  return (
    <div className="p-2 rounded" style={{ background: 'var(--bg-card)' }}>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-sm font-semibold tabular" style={color ? { color } : undefined}>{value || '—'}</div>
    </div>
  )
}

function GreekBox({ label, value, color }) {
  return (
    <div className="p-2 rounded text-center" style={{ background: 'var(--bg-card)' }}>
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-sm font-semibold tabular" style={color ? { color } : undefined}>{value || '—'}</div>
    </div>
  )
}