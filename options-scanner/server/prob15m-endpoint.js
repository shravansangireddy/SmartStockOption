// ─── 15-Minute Probability (Random Forest) ────────────────────────────────
app.get('/api/prob15m/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const [quote, chart] = await Promise.all([
      yf.quote(symbol),
      yf.chart(symbol, { period1: new Date(Date.now() - 10 * 86400000), interval: '5m' }).catch(() => null),
    ]);
    if (!quote) return res.json({ symbol, bullProb: 50, bearProb: 20, trendState: 'No data', price: null });

    const price = quote.regularMarketPrice;
    const quotes = chart?.quotes || [];
    const closes = quotes.map(q => q.close).filter(c => c != null && c > 0);
    if (closes.length < 100) {
      return res.json({ symbol, bullProb: 50, bearProb: 20, trendState: 'Insufficient data', price: +price.toFixed(2), changePct: +(quote.regularMarketChangePercent || 0).toFixed(2), rsi: null, macdCrossover: null, ema9: null, ema20: null, ema50: null, atr15m: +(price * 0.002).toFixed(2), movePct: 0, bullTarget: +price.toFixed(2), bearTarget: +price.toFixed(2), probTarget: +price.toFixed(2), model: 'fallback' });
    }

    // Only use last 300 candles for training to keep it fast
    const maxCandles = 300;
    const startIdx = Math.max(0, closes.length - maxCandles);
    const trainCloses = closes.slice(startIdx);
    const trainQuotes = quotes.slice(startIdx + (quotes.length - closes.length));

    // ── Feature Engineering ──────────────────────────────────────
    const ema = (arr, p) => {
      if (arr.length < p) return null;
      const k = 2 / (p + 1);
      let e = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
      for (let i = p; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
      return e;
    };
    const sma = (arr, p) => arr.length >= p ? arr.slice(-p).reduce((a, b) => a + b, 0) / p : null;
    const rsiCalc = (arr, p = 14) => {
      if (arr.length < p + 1) return null;
      let gains = 0, losses = 0;
      for (let i = arr.length - p; i < arr.length; i++) {
        const diff = arr[i] - arr[i - 1];
        if (diff > 0) gains += diff; else losses += Math.abs(diff);
      }
      if (losses === 0) return 100;
      const rs = (gains / p) / (losses / p);
      return 100 - 100 / (1 + rs);
    };

    const LOOKBACK = 50;
    const FORWARD = 3; // 15 min = 3 × 5min candles
    const features = [];
    const labels = [];

    for (let i = LOOKBACK; i < trainCloses.length - FORWARD; i++) {
      const window = trainCloses.slice(i - LOOKBACK, i);
      const cur = trainCloses[i];
      const prev = trainCloses[i - 1];
      const rsi = rsiCalc(window);
      const ema9 = ema(window, 9);
      const ema21 = ema(window, 21);
      const ema50 = ema(window, Math.min(50, window.length));
      const sma20 = sma(window, Math.min(20, window.length));
      const pctChange1 = prev ? (cur - prev) / prev : 0;
      const pctChange5 = i >= 5 ? (cur - trainCloses[i - 5]) / trainCloses[i - 5] : 0;
      const pctChange15 = i >= 15 ? (cur - trainCloses[i - 15]) / trainCloses[i - 15] : 0;
      const emaAlign = (ema9 && ema21 && ema50) ? (ema9 > ema21 && ema21 > ema50 ? 1 : ema9 < ema21 && ema21 < ema50 ? -1 : 0) : 0;
      const priceVsEma9 = ema9 ? cur / ema9 - 1 : 0;
      const priceVsEma21 = ema21 ? cur / ema21 - 1 : 0;
      const priceVsSma20 = sma20 ? cur / sma20 - 1 : 0;
      // ATR-like volatility
      let atr5 = 0;
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const h = trainQuotes[j]?.high || trainCloses[j];
        const l = trainQuotes[j]?.low || trainCloses[j];
        atr5 += (h - l);
      }
      atr5 /= Math.min(5, i);
      const volRatio = cur > 0 ? atr5 / cur : 0;
      // Candle features
      const candleHigh = trainQuotes[i]?.high || cur;
      const candleLow = trainQuotes[i]?.low || cur;
      const bodyRatio = (candleHigh - candleLow) > 0 ? Math.abs(cur - prev) / (candleHigh - candleLow) : 0.5;
      const upperShadow = (candleHigh - candleLow) > 0 ? (candleHigh - Math.max(cur, prev)) / (candleHigh - candleLow) : 0;
      const lowerShadow = (candleHigh - candleLow) > 0 ? (Math.min(cur, prev) - candleLow) / (candleHigh - candleLow) : 0;
      // Volume
      const vols = trainQuotes.slice(Math.max(0, i - 20), i).map(q => q.volume || 0);
      const volAvg = vols.length > 0 ? vols.reduce((a, b) => a + b, 0) / vols.length : 1;
      const volCur = trainQuotes[i]?.volume || 1;
      const volChange = volAvg > 0 ? volCur / volAvg : 1;

      features.push([
        rsi !== null ? rsi / 100 : 0.5,
        pctChange1,
        pctChange5,
        pctChange15,
        emaAlign,
        priceVsEma9,
        priceVsEma21,
        priceVsSma20,
        volRatio,
        bodyRatio,
        volChange,
        upperShadow,
        lowerShadow,
      ]);
      labels.push((trainCloses[i + FORWARD] - cur) / cur);
    }

    if (features.length < 100) {
      return res.json({ symbol, bullProb: 50, bearProb: 20, trendState: 'Not enough training data', price: +price.toFixed(2), changePct: +(quote.regularMarketChangePercent || 0).toFixed(2), rsi: null, macdCrossover: null, ema9: null, ema20: null, ema50: null, atr15m: +(price * 0.002).toFixed(2), movePct: 0, bullTarget: +price.toFixed(2), bearTarget: +price.toFixed(2), probTarget: +price.toFixed(2), model: 'fallback' });
    }

    // ── Train Random Forest ──────────────────────────────────────
    const rf = new RandomForestRegression({
      nEstimators: 50,
      maxDepth: 6,
      minSamplesLeaf: 5,
      replacement: true,
      seed: 42,
    });
    rf.train(features, labels);

    // ── Predict ──────────────────────────────────────────────────
    const lastFeatures = features[features.length - 1];
    const prediction = rf.predict([lastFeatures])[0];

    // ── Bull/Bear probability from tree votes ─────────────────────
    const treePredictions = rf.estimators.map(tree => {
      try { return tree.predict([lastFeatures])[0] || 0; } catch { return 0; }
    });
    const bullTrees = treePredictions.filter(p => p > 0).length;
    const bearTrees = treePredictions.filter(p => p < 0).length;
    const bullProb = Math.round(Math.min(85, Math.max(10, (bullTrees / treePredictions.length) * 100)));
    const bearProb = Math.round(Math.min(85, Math.max(10, (bearTrees / treePredictions.length) * 100)));

    // ── ATR for price targets ────────────────────────────────────
    let atr15m = price * 0.002;
    if (quotes.length >= 14) {
      const trs = [];
      for (let i = Math.max(1, quotes.length - 14); i < quotes.length; i++) {
        const h = quotes[i].high, l = quotes[i].low, pc = quotes[i - 1].close;
        if (h && l && pc) trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      }
      if (trs.length >= 3) {
        atr15m = (trs.reduce((a, b) => a + b, 0) / trs.length) * Math.sqrt(3);
      }
    }

    // ── Current indicators for display ───────────────────────────
    const curRsi = rsiCalc(closes);
    const curEma9 = ema(closes, 9);
    const curEma20 = ema(closes, 20);
    const curEma50 = ema(closes, 50);
    const macdCrossover = curEma9 && curEma20 ? (curEma9 > curEma20 ? 'Bullish' : 'Bearish') : null;
    let trendState = 'Neutral';
    if (curEma9 > curEma20 && curEma20 > curEma50) trendState = 'Strong Uptrend';
    else if (curEma9 > curEma20) trendState = 'Uptrend';
    else if (curEma9 < curEma20 && curEma20 < curEma50) trendState = 'Strong Downtrend';
    else if (curEma9 < curEma20) trendState = 'Downtrend';
    else if (curEma50 && price > curEma50) trendState = 'Weak Uptrend';
    else trendState = 'Weak Downtrend';

    // ── Price targets ────────────────────────────────────────────
    const predictedMove = prediction * price;
    const probTarget = +(price + predictedMove).toFixed(2);
    const movePct = +(prediction * 100).toFixed(2);
    const bullTarget = +(price + atr15m * 0.6).toFixed(2);
    const bearTarget = +(price - atr15m * 0.6).toFixed(2);

    // ── Training R² ─────────────────────────────────────────────
    const trainPreds = rf.predict(features);
    const meanY = labels.reduce((a, b) => a + b, 0) / labels.length;
    const ssRes = labels.reduce((sum, y, i) => sum + (y - trainPreds[i]) ** 2, 0);
    const ssTot = labels.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    res.json({
      symbol,
      price: +price.toFixed(2),
      changePct: +(quote.regularMarketChangePercent || 0).toFixed(2),
      rsi: curRsi ? +curRsi.toFixed(1) : null,
      macdCrossover,
      ema9: curEma9 ? +curEma9.toFixed(2) : null,
      ema20: curEma20 ? +curEma20.toFixed(2) : null,
      ema50: curEma50 ? +curEma50.toFixed(2) : null,
      bullProb,
      bearProb,
      trendState,
      atr15m: +atr15m.toFixed(2),
      movePct,
      bullTarget,
      bearTarget,
      probTarget,
      model: 'random_forest',
      r2: +r2.toFixed(3),
      nSamples: features.length,
      nTrees: rf.estimators?.length || 100,
    });
  } catch (e) {
    console.error(`[PROB15M-RF] ${req.params.symbol}:`, e.message);
    res.json({ symbol: req.params.symbol.toUpperCase(), bullProb: 50, bearProb: 20, trendState: 'Error', price: null, model: 'fallback' });
  }
});