import { useState, useEffect } from 'react'

const API = '/api'

const ALGO_META = {
  svm: { name: 'SVM', icon: '📊', color: '#00d4aa', desc: 'Direction classifier — UP/DOWN' },
  lstm: { name: 'LSTM', icon: '🧠', color: '#6c5ce7', desc: 'Price forecaster — next-day price' },
  rf: { name: 'Random Forest', icon: '🌲', color: '#fd79a8', desc: 'Ensemble trees — direction + price' },
  ensemble: { name: 'Ensemble', icon: '🎯', color: '#fdcb6e', desc: 'Weighted vote of all 3 models' },
}

export default function AlgorithmConfig({ symbol, onPredict, dataProvider = 'yahoo' }) {
  const [selectedAlgo, setSelectedAlgo] = useState('svm')
  const [configs, setConfigs] = useState({})
  const [paramValues, setParamValues] = useState({})
  const [training, setTraining] = useState(false)
  const [predicting, setPredicting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showParams, setShowParams] = useState(false)
  const [modelStatus, setModelStatus] = useState(null)
  const [configError, setConfigError] = useState(null)

  // Saved configs state
  const [savedConfigs, setSavedConfigs] = useState([])
  const [saveName, setSaveName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showSavedList, setShowSavedList] = useState(false)
  const [loadingConfigs, setLoadingConfigs] = useState(false)

  // Fetch algorithm configs on mount
  useEffect(() => {
    fetch(`${API}/algorithms`)
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load algorithms: ${r.status}`)
        return r.json()
      })
      .then(data => {
        setConfigs(data)
        const defaults = {}
        for (const [algoId, algo] of Object.entries(data)) {
          defaults[algoId] = {}
          for (const [paramId, param] of Object.entries(algo.params)) {
            defaults[algoId][paramId] = param.default
          }
        }
        setParamValues(defaults)
        setConfigError(null)
      })
      .catch(e => {
        console.error('Failed to fetch algorithm configs:', e)
        setConfigError(e.message)
      })
  }, [])

  // Check model status when symbol or algorithm changes
  useEffect(() => {
    if (!symbol) return
    fetch(`${API}/algorithms/models/${symbol}/${selectedAlgo}?provider=${dataProvider}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setModelStatus(data))
      .catch(() => setModelStatus(null))
  }, [symbol, selectedAlgo, dataProvider])

  // Fetch saved configs
  const fetchSavedConfigs = async () => {
    setLoadingConfigs(true)
    try {
      const res = await fetch(`${API}/algo-configs`)
      if (res.ok) {
        const data = await res.json()
        setSavedConfigs(data)
      }
    } catch (e) { console.error('Failed to fetch saved configs:', e) }
    setLoadingConfigs(false)
  }

  useEffect(() => { fetchSavedConfigs() }, [])

  // Load defaults on mount (check for default configs)
  useEffect(() => {
    if (savedConfigs.length > 0 && Object.keys(configs).length > 0) {
      // Find default for current algorithm
      const defaultConfig = savedConfigs.find(c => c.algorithm === selectedAlgo && c.isDefault)
      if (defaultConfig && defaultConfig.params) {
        setParamValues(prev => ({
          ...prev,
          [selectedAlgo]: { ...prev[selectedAlgo], ...defaultConfig.params }
        }))
      }
    }
  }, [selectedAlgo, savedConfigs.length])

  const currentConfig = configs[selectedAlgo] || {}
  const currentParams = currentConfig.params || {}
  const currentMeta = ALGO_META[selectedAlgo] || {}

  const handleParamChange = (paramId, value) => {
    setParamValues(prev => ({
      ...prev,
      [selectedAlgo]: {
        ...prev[selectedAlgo],
        [paramId]: value,
      },
    }))
  }

  const handleSaveConfig = async () => {
    if (!saveName.trim()) return
    try {
      const res = await fetch(`${API}/algo-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          algorithm: selectedAlgo,
          params: paramValues[selectedAlgo] || {},
          symbol: symbol || null,
        }),
      })
      if (res.ok) {
        setSaveName('')
        setShowSaveDialog(false)
        fetchSavedConfigs()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to save config')
      }
    } catch (e) { setError(e.message) }
  }

  const handleLoadConfig = (config) => {
    setParamValues(prev => ({
      ...prev,
      [config.algorithm]: { ...prev[config.algorithm], ...config.params }
    }))
    setSelectedAlgo(config.algorithm)
    setShowSavedList(false)
  }

  const handleDeleteConfig = async (id) => {
    if (!window.confirm('Delete this saved configuration?')) return
    try {
      await fetch(`${API}/algo-configs/${id}`, { method: 'DELETE' })
      fetchSavedConfigs()
    } catch (e) { console.error('Delete failed:', e) }
  }

  const handleSetDefault = async (id) => {
    try {
      await fetch(`${API}/algo-configs/${id}/default`, { method: 'POST' })
      fetchSavedConfigs()
    } catch (e) { console.error('Set default failed:', e) }
  }

  const handleTrain = async () => {
    setTraining(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`${API}/algorithms/train/${symbol}?provider=${dataProvider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          algorithm: selectedAlgo,
          params: paramValues[selectedAlgo] || {},
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult({ type: 'train', ...data })
      // Refresh model status
      fetch(`${API}/algorithms/models/${symbol}/${selectedAlgo}?provider=${dataProvider}`)
        .then(r => r.ok ? r.json() : null)
        .then(m => setModelStatus(m))
        .catch(() => {})
    } catch (e) {
      setError(e.message)
    }
    setTraining(false)
  }

  const handlePredict = async () => {
    setPredicting(true)
    setError(null)
    setResult(null)
    try {
      const params = new URLSearchParams({ algorithm: selectedAlgo, provider: dataProvider })
      if (selectedAlgo === 'ensemble') {
        params.set('svmWeight', paramValues.ensemble?.svmWeight || 0.3)
        params.set('lstmWeight', paramValues.ensemble?.lstmWeight || 0.4)
        params.set('rfWeight', paramValues.ensemble?.rfWeight || 0.3)
      }
      const res = await fetch(`${API}/algorithms/predict/${symbol}?${params}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult({ type: 'predict', ...data })
      if (onPredict) onPredict(data)
    } catch (e) {
      setError(e.message)
    }
    setPredicting(false)
  }

  const renderParam = (paramId, param) => {
    const value = paramValues[selectedAlgo]?.[paramId] ?? param.default

    if (param.type === 'select') {
      return (
        <div key={paramId} className="mb-2">
          <label className="block text-xs font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>
            {param.label}
          </label>
          <select
            value={value}
            onChange={e => handleParamChange(paramId, e.target.value)}
            className="w-full px-2 py-1 rounded text-xs"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            {param.options.map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{param.description}</div>
        </div>
      )
    }

    if (param.type === 'number') {
      return (
        <div key={paramId} className="mb-2">
          <label className="block text-xs font-medium mb-0.5" style={{ color: 'var(--text-secondary)' }}>
            {param.label}: <span style={{ color: currentMeta.color }}>{value}</span>
          </label>
          <input
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={value}
            onChange={e => handleParamChange(paramId, parseFloat(e.target.value))}
            className="w-full"
            style={{ accentColor: currentMeta.color }}
          />
          <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            <span>{param.min}</span>
            <span>{param.description}</span>
            <span>{param.max}</span>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--accent-cyan)' }}>
            🧠 ML Algorithm Configuration
          </h3>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Select and configure the prediction algorithm for {symbol}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Save/Load buttons */}
          <button
            onClick={() => setShowSaveDialog(!showSaveDialog)}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: 'var(--bg-secondary)', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }}
          >
            💾 Save
          </button>
          <button
            onClick={() => { setShowSavedList(!showSavedList); fetchSavedConfigs() }}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
          >
            📂 Load ({savedConfigs.length})
          </button>
          <button
            onClick={handleTrain}
            disabled={training || !symbol}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{
              background: training ? 'var(--bg-secondary)' : 'var(--accent-cyan)',
              color: training ? 'var(--text-muted)' : '#000',
              opacity: training ? 0.6 : 1,
            }}
          >
            {training ? '⏳ Training...' : '🎓 Train'}
          </button>
          <button
            onClick={handlePredict}
            disabled={predicting || !symbol}
            className="px-3 py-1.5 rounded text-xs font-semibold"
            style={{
              background: predicting ? 'var(--bg-secondary)' : currentMeta.color,
              color: predicting ? 'var(--text-muted)' : (selectedAlgo === 'ensemble' ? '#000' : '#fff'),
              opacity: predicting ? 0.6 : 1,
            }}
          >
            {predicting ? '⏳ Predicting...' : '📈 Predict'}
          </button>
        </div>
      </div>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="mb-3 p-3 rounded" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent-cyan)' }}>
          <div className="text-xs font-medium mb-2" style={{ color: 'var(--accent-cyan)' }}>
            💾 Save Configuration — {currentMeta.icon} {currentMeta.name}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder="Config name (e.g., 'Conservative SVM', 'Deep LSTM')"
              className="flex-1 px-3 py-1.5 rounded text-xs"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && handleSaveConfig()}
            />
            <button onClick={handleSaveConfig} className="px-3 py-1.5 rounded text-xs font-semibold"
              style={{ background: 'var(--accent-cyan)', color: '#000' }}>
              Save
            </button>
            <button onClick={() => setShowSaveDialog(false)} className="px-3 py-1.5 rounded text-xs"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Params: {Object.entries(paramValues[selectedAlgo] || {}).map(([k, v]) => `${k}=${v}`).join(', ')}
          </div>
        </div>
      )}

      {/* Saved Configs List */}
      {showSavedList && (
        <div className="mb-3 p-3 rounded" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium" style={{ color: 'var(--accent-cyan)' }}>
              📂 Saved Configurations ({savedConfigs.length})
            </div>
            <button onClick={() => setShowSavedList(false)} className="text-xs" style={{ color: 'var(--text-secondary)' }}>✕</button>
          </div>
          {loadingConfigs ? (
            <div className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>Loading...</div>
          ) : savedConfigs.length === 0 ? (
            <div className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
              No saved configs yet. Click 💾 Save to store your first configuration.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {savedConfigs.map(config => {
                const meta = ALGO_META[config.algorithm] || {}
                return (
                  <div key={config.id} className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--bg-card)', border: config.isDefault ? `1px solid ${meta.color}` : '1px solid var(--border)' }}>
                    <span className="text-xs">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {config.name} {config.isDefault ? '⭐' : ''}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                        {meta.name} · {Object.entries(config.params).map(([k, v]) => `${k}=${v}`).join(', ')}
                      </div>
                    </div>
                    <button onClick={() => handleLoadConfig(config)} className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{ background: meta.color, color: selectedAlgo === 'ensemble' ? '#000' : '#fff' }}>
                      Load
                    </button>
                    {!config.isDefault && (
                      <button onClick={() => handleSetDefault(config.id)} className="px-2 py-0.5 rounded text-xs"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--accent-orange)', border: '1px solid var(--accent-orange)' }}>
                        ⭐
                      </button>
                    )}
                    <button onClick={() => handleDeleteConfig(config.id)} className="px-2 py-0.5 rounded text-xs"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}>
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Config load error */}
      {configError && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', color: 'var(--accent-red)' }}>
          ⚠ Failed to load algorithm configs: {configError}
          <button onClick={() => window.location.reload()} className="ml-2 underline" style={{ color: 'var(--accent-cyan)' }}>Retry</button>
        </div>
      )}

      {/* Model Status */}
      {modelStatus && (
        <div className="mb-2 px-3 py-1.5 rounded text-xs" style={{ background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', color: 'var(--text-secondary)' }}>
          🎓 Model trained: {new Date(modelStatus.trainedAt).toLocaleString()}
          {modelStatus.trainAccuracy != null && ` · Train acc: ${(modelStatus.trainAccuracy * 100).toFixed(1)}%`}
          {modelStatus.testAccuracy != null && ` · Test acc: ${(modelStatus.testAccuracy * 100).toFixed(1)}%`}
        </div>
      )}

      {/* Algorithm Selector */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(ALGO_META).map(([id, meta]) => (
          <button
            key={id}
            onClick={() => { setSelectedAlgo(id); setResult(null); setError(null) }}
            className="px-3 py-2 rounded text-xs font-semibold transition-all"
            style={{
              background: selectedAlgo === id ? meta.color : 'var(--bg-secondary)',
              color: selectedAlgo === id ? (id === 'ensemble' ? '#000' : '#fff') : 'var(--text-secondary)',
              border: selectedAlgo === id ? `2px solid ${meta.color}` : '2px solid var(--border)',
            }}
          >
            <span className="mr-1">{meta.icon}</span>
            {meta.name}
          </button>
        ))}
      </div>

      {/* Algorithm Description */}
      {currentConfig.description && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'var(--bg-secondary)', borderLeft: `3px solid ${currentMeta.color}` }}>
          <span className="font-medium">{currentMeta.icon} {currentConfig.name}:</span> {currentConfig.description}
          <div className="mt-1" style={{ color: 'var(--text-muted)' }}>
            Output: {currentConfig.outputs?.join(', ')}
          </div>
        </div>
      )}

      {/* Parameter Configuration */}
      <div className="mb-3">
        <button
          onClick={() => setShowParams(!showParams)}
          className="flex items-center gap-1 text-xs font-medium mb-2"
          style={{ color: 'var(--accent-cyan)' }}
        >
          {showParams ? '▼' : '▶'} Hyperparameters ({Object.keys(currentParams).length} params)
        </button>

        {showParams && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 rounded" style={{ background: 'var(--bg-secondary)' }}>
            {Object.entries(currentParams).map(([paramId, param]) => renderParam(paramId, param))}
          </div>
        )}
      </div>

      {/* Results */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', color: 'var(--accent-red)' }}>
          ⚠️ {error}
        </div>
      )}

      {result && result.type === 'train' && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{ background: 'rgba(0,212,170,0.1)', border: '1px solid rgba(0,212,170,0.3)', color: 'var(--accent-green)' }}>
          <div className="font-medium mb-1">✅ Model Trained — {ALGO_META[result.algorithm]?.icon || ''} {result.algorithm?.toUpperCase()}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
            <div>Train Accuracy: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(result.trainAccuracy * 100).toFixed(1)}%</span></div>
            <div>Test Accuracy: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.testAccuracy ? (result.testAccuracy * 100).toFixed(1) + '%' : 'N/A'}</span></div>
            <div>Train Size: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.trainSize}</span></div>
            <div>Test Size: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.testSize}</span></div>
            {result.supportVectors != null && <div>Support Vectors: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.supportVectors}</span></div>}
            {result.loss != null && <div>Loss: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.loss.toFixed(6)}</span></div>}
            {result.valLoss != null && <div>Val Loss: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.valLoss.toFixed(6)}</span></div>}
          </div>
        </div>
      )}

      {result && result.type === 'predict' && (
        <div className="mb-3 px-3 py-2 rounded text-xs" style={{
          background: result.direction === 'UP' ? 'rgba(0,212,170,0.1)' : 'rgba(255,77,106,0.1)',
          border: `1px solid ${result.direction === 'UP' ? 'rgba(0,212,170,0.3)' : 'rgba(255,77,106,0.3)'}`,
          color: result.direction === 'UP' ? 'var(--accent-green)' : 'var(--accent-red)',
        }}>
          <div className="font-medium mb-1">
            {result.direction === 'UP' ? '📈' : '📉'} Prediction — {ALGO_META[result.algorithm]?.icon || ''} {result.algorithm?.toUpperCase()}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1" style={{ color: 'var(--text-secondary)' }}>
            <div>Direction: <span className="font-bold" style={{ color: result.direction === 'UP' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{result.direction}</span></div>
            <div>Confidence: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{result.confidence}%</span></div>
            {result.predictedPrice != null && <div>Predicted Price: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>${result.predictedPrice}</span></div>}
            {result.change != null && <div>Change: <span className="font-medium" style={{ color: result.change > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{result.change > 0 ? '+' : ''}{result.change}%</span></div>}
            {result.lastPrice != null && <div>Last Price: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>${result.lastPrice}</span></div>}
            {result.trainAccuracy != null && <div>Train Acc: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(result.trainAccuracy * 100).toFixed(1)}%</span></div>}
            {result.testAccuracy != null && <div>Test Acc: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{(result.testAccuracy * 100).toFixed(1)}%</span></div>}
            {result.consensus && <div>Consensus: <span className="font-bold" style={{ color: result.consensus === 'BULLISH' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{result.consensus}</span></div>}
            {result.upScore != null && <div>UP: <span style={{ color: 'var(--accent-green)' }}>{result.upScore}%</span> / DOWN: <span style={{ color: 'var(--accent-red)' }}>{result.downScore}%</span></div>}
          </div>

          {/* Individual model predictions (ensemble only) */}
          {result.individualPredictions && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Individual Models:</div>
              {Object.entries(result.individualPredictions).map(([algo, pred]) => (
                <div key={algo} className="flex justify-between items-center py-0.5">
                  <span>{ALGO_META[algo]?.icon} {ALGO_META[algo]?.name}</span>
                  <span className="font-bold" style={{ color: pred.direction === 'UP' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {pred.direction} {pred.confidence}%
                    {pred.predictedPrice ? ` ($${pred.predictedPrice})` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}