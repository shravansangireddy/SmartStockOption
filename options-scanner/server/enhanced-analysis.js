/**
 * Enhanced Analysis — Pine Script Components
 *
 * Implements the key indicators from the "Volume Spike + Breakout Trend Score Pro + 
 * Probability KNN MTF v3 + OM MA" Pine Script as server-side analysis.
 *
 * Components:
 *   - Volume Spike Detection (1.5x and 2.5x SMA)
 *   - Breakout Detection (N-bar high/low breaks)
 *   - Bollinger Breakout Detection
 *   - Enhanced Trend Score (13+ factor model)
 *   - OM MA Crossover Signals
 *   - KNN Pattern Probability
 *   - MTF Trend Alignment
 *   - Calibration / ECE Tracking
 */

// ─── Volume Spike Detection ─────────────────────────────────
export function computeVolumeSpikes(quotes, volLen = 20, spikeMult = 1.5, extremeMult = 2.5) {
  if (!quotes || quotes.length < volLen) return { current: null, history: [] };
  
  const results = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < volLen - 1) {
      results.push({ volSma: null, volRatio: null, volSpike: false, volSpikeExtreme: false });
      continue;
    }
    const slice = quotes.slice(i - volLen + 1, i + 1);
    const volSma = slice.reduce((s, q) => s + (q.volume || 0), 0) / volLen;
    const vol = quotes[i].volume || 0;
    const volRatio = volSma > 0 ? vol / volSma : 0;
    results.push({
      volSma: +volSma.toFixed(0),
      volRatio: +volRatio.toFixed(2),
      volSpike: volRatio >= spikeMult,
      volSpikeExtreme: volRatio >= extremeMult,
    });
  }
  
  return { current: results[results.length - 1], history: results };
}

// ─── Breakout Detection ─────────────────────────────────────
export function computeBreakouts(quotes, lookback = 20, confirmClose = true) {
  if (!quotes || quotes.length < lookback + 1) return { current: null, history: [] };
  
  const results = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < lookback) {
      results.push({ breakoutUp: false, breakoutDown: false, highestPrev: null, lowestPrev: null });
      continue;
    }
    
    // Look back from previous bar
    const prevBars = quotes.slice(i - lookback, i);
    const highestPrev = Math.max(...prevBars.map(q => q.high || q.close));
    const lowestPrev = Math.min(...prevBars.map(q => q.low || q.close));
    const close = quotes[i].close;
    const high = quotes[i].high || close;
    const low = quotes[i].low || close;
    
    const breakoutUp = confirmClose ? close > highestPrev : high > highestPrev;
    const breakoutDown = confirmClose ? close < lowestPrev : low < lowestPrev;
    
    results.push({ breakoutUp, breakoutDown, highestPrev: +highestPrev.toFixed(2), lowestPrev: +lowestPrev.toFixed(2) });
  }
  
  return { current: results[results.length - 1], history: results };
}

// ─── Bollinger Breakout ──────────────────────────────────────
export function computeBollingerBreakouts(quotes, bbLen = 20, bbMult = 2.0) {
  if (!quotes || quotes.length < bbLen) return { current: null, history: [] };
  
  const results = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < bbLen - 1) {
      results.push({ bbUpper: null, bbLower: null, bbBasis: null, bbBreakoutUp: false, bbBreakoutDown: false, bbPercentB: null });
      continue;
    }
    const slice = quotes.slice(i - bbLen + 1, i + 1);
    const closes = slice.map(q => q.close);
    const bbBasis = closes.reduce((a, b) => a + b, 0) / bbLen;
    const variance = closes.reduce((s, c) => s + Math.pow(c - bbBasis, 2), 0) / bbLen;
    const stdDev = Math.sqrt(variance) * bbMult;
    const bbUpper = bbBasis + stdDev;
    const bbLower = bbBasis - stdDev;
    const close = quotes[i].close;
    const percentB = stdDev > 0 ? +((close - bbLower) / (bbUpper - bbLower) * 100).toFixed(1) : null;
    
    results.push({
      bbUpper: +bbUpper.toFixed(2),
      bbLower: +bbLower.toFixed(2),
      bbBasis: +bbBasis.toFixed(2),
      bbBreakoutUp: close > bbUpper,
      bbBreakoutDown: close < bbLower,
      bbPercentB: percentB,
    });
  }
  
  return { current: results[results.length - 1], history: results };
}

// ─── OM MA Crossover Signals ─────────────────────────────────
export function computeOMSignals(quotes, shortLen = 8, longLen = 21, maType = 'EMA') {
  if (!quotes || quotes.length < longLen + 5) return { current: null };
  
  const shortMA = computeMA(quotes.map(q => q.close), shortLen, maType);
  const longMA = computeMA(quotes.map(q => q.close), longLen, maType);
  
  const signals = [];
  for (let i = 0; i < quotes.length; i++) {
    if (i < longLen) { signals.push({ shortMA: null, longMA: null, trendBull: null, trendBear: null, bullCross: false, bearCross: false }); continue; }
    const s = shortMA[i];
    const l = longMA[i];
    const prevS = shortMA[i - 1];
    const prevL = longMA[i - 1];
    
    signals.push({
      shortMA: s != null ? +s.toFixed(2) : null,
      longMA: l != null ? +l.toFixed(2) : null,
      trendBull: s != null && l != null ? s > l : null,
      trendBear: s != null && l != null ? s < l : null,
      bullCross: prevS != null && prevL != null && s != null && l != null ? (prevS <= prevL && s > l) : false,
      bearCross: prevS != null && prevL != null && s != null && l != null ? (prevS >= prevL && s < l) : false,
    });
  }
  
  return { current: signals[signals.length - 1], recentCrossBars: findRecentCross(signals, 3) };
}

function findRecentCross(signals, lookback) {
  for (let i = signals.length - 1; i >= Math.max(0, signals.length - lookback); i--) {
    if (signals[i].bullCross) return { type: 'bull', barsAgo: signals.length - 1 - i };
    if (signals[i].bearCross) return { type: 'bear', barsAgo: signals.length - 1 - i };
  }
  return null;
}

function computeMA(values, length, type) {
  const result = new Array(values.length).fill(null);
  
  if (type === 'SMA') {
    for (let i = length - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += values[j];
      result[i] = sum / length;
    }
  } else if (type === 'EMA') {
    const k = 2 / (length + 1);
    let ema = null;
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) continue;
      if (ema === null) {
        // Start EMA from first valid value
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - length + 1); j <= i; j++) {
          if (values[j] != null) { sum += values[j]; count++; }
        }
        if (count >= length) ema = sum / count;
      } else {
        ema = values[i] * k + ema * (1 - k);
      }
      result[i] = ema;
    }
  } else if (type === 'WMA') {
    for (let i = length - 1; i < values.length; i++) {
      let wSum = 0, wDen = 0;
      for (let j = 0; j < length; j++) {
        const w = length - j;
        wSum += (values[i - j] || 0) * w;
        wDen += w;
      }
      result[i] = wDen > 0 ? wSum / wDen : null;
    }
  } else {
    // Default to SMA
    for (let i = length - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = i - length + 1; j <= i; j++) sum += values[j];
      result[i] = sum / length;
    }
  }
  
  return result;
}

// ─── Enhanced Trend Score (13+ factor model from Pine Script) ──
export function computeTrendScore(analysis, quotes, volData, breakoutData, bbData, omData, knnData) {
  const a = analysis;
  const currentQuote = quotes ? quotes[quotes.length - 1] : null;
  const prevQuote = quotes && quotes.length >= 2 ? quotes[quotes.length - 2] : null;
  
  // Trend direction checks
  const trendBull = a.trend?.includes('Up') || a.trend?.includes('Bullish') || a.trend?.includes('Strong Up');
  const trendBear = a.trend?.includes('Down') || a.trend?.includes('Bearish') || a.trend?.includes('Strong Down');
  
  // Price vs key MAs
  const price = a.price || (currentQuote ? currentQuote.close : null);
  const aboveEmaFast = price != null && a.sma20 != null ? price > a.sma20 : false;
  const aboveEmaSlow = price != null && a.sma50 != null ? price > a.sma50 : false;
  const emaSpreadPct = a.sma20 != null && a.sma50 != null ? ((a.sma20 - a.sma50) / a.sma50) * 100 : 0;
  
  // RSI zones
  const rsiBull = a.rsi != null && a.rsi > 55;
  const rsiBear = a.rsi != null && a.rsi < 45;
  
  // MACD
  const macdBull = a.macd != null && a.macd > 0;
  const macdBear = a.macd != null && a.macd < 0;
  
  // VWAP
  const vwapValue = currentQuote ? (currentQuote.high + currentQuote.low + currentQuote.close) / 3 : null;
  const vwapBull = vwapValue != null && price != null ? price > vwapValue : false;
  const vwapBear = vwapValue != null && price != null ? price < vwapValue : false;
  
  // Volume spike
  const volSpike = volData?.current?.volSpike || false;
  const volSpikeExtreme = volData?.current?.volSpikeExtreme || false;
  
  // Breakouts
  const breakoutUp = breakoutData?.current?.breakoutUp || false;
  const breakoutDown = breakoutData?.current?.breakoutDown || false;
  
  // BB breakout
  const bbBreakoutUp = bbData?.current?.bbBreakoutUp || false;
  const bbBreakoutDown = bbData?.current?.bbBreakoutDown || false;
  
  // OM MA trend
  const omTrendBull = omData?.current?.trendBull === true;
  const omTrendBear = omData?.current?.trendBear === true;
  const omBullCross = omData?.current?.bullCross || false;
  const omBearCross = omData?.current?.bearCross || false;
  const omRecentBull = omData?.recentCrossBars?.type === 'bull';
  const omRecentBear = omData?.recentCrossBars?.type === 'bear';
  
  // ADX (from analysis if available)
  const adxTrend = a.adx != null && a.adx > 18;
  const diBull = a.diPlus != null && a.diMinus != null ? a.diPlus > a.diMinus : false;
  const diBear = a.diPlus != null && a.diMinus != null ? a.diMinus > a.diPlus : false;
  
  // KNN probability
  const probBullOk = knnData?.bullProb != null && knnData.bullProb >= 0.55 && knnData.bullMatches >= 25;
  const probBearOk = knnData?.bearProb != null && knnData.bearProb >= 0.55 && knnData.bearMatches >= 25;
  
  // ─── Bull Score (from Pine Script: 13+ factors) ─────
  let bullScore = 0;
  bullScore += trendBull && aboveEmaFast && aboveEmaSlow ? 1 : 0;  // trend alignment
  bullScore += vwapBull ? 1 : 0;           // VWAP
  bullScore += rsiBull ? 1 : 0;            // RSI > 55
  bullScore += macdBull ? 1 : 0;           // MACD bullish
  bullScore += adxTrend && diBull ? 1 : 0; // ADX + DI
  bullScore += volSpike ? 1 : 0;            // Volume spike
  bullScore += volSpikeExtreme ? 1 : 0;    // Extreme volume
  bullScore += breakoutUp ? 2 : 0;          // Breakout confirmation
  bullScore += bbBreakoutUp ? 1.5 : 0;     // BB breakout
  bullScore += probBullOk ? 1 : 0;         // KNN probability
  bullScore += omTrendBull ? 1 : 0;         // OM trend
  bullScore += omBullCross ? 1.5 : 0;      // OM crossover
  bullScore += omRecentBull ? 0.5 : 0;     // Recent OM cross
  
  // ─── Bear Score (mirror) ─────────────────────────────
  let bearScore = 0;
  bearScore += (!trendBull && !trendBear ? 0 : trendBear || (!aboveEmaFast && !aboveEmaSlow)) ? 1 : 0;
  bearScore += vwapBear ? 1 : 0;
  bearScore += rsiBear ? 1 : 0;
  bearScore += macdBear ? 1 : 0;
  bearScore += adxTrend && diBear ? 1 : 0;
  bearScore += volSpike ? 1 : 0;
  bearScore += volSpikeExtreme ? 1 : 0;
  bearScore += breakoutDown ? 2 : 0;
  bearScore += bbBreakoutDown ? 1.5 : 0;
  bearScore += probBearOk ? 1 : 0;
  bearScore += omTrendBear ? 1 : 0;
  bearScore += omBearCross ? 1.5 : 0;
  bearScore += omRecentBear ? 0.5 : 0;
  
  const netScore = +(bullScore - bearScore).toFixed(1);
  
  let trendStrength;
  if (netScore >= 7) trendStrength = 'STRONG BULL';
  else if (netScore >= 2) trendStrength = 'BULL BIAS';
  else if (netScore <= -7) trendStrength = 'STRONG BEAR';
  else if (netScore <= -2) trendStrength = 'BEAR BIAS';
  else trendStrength = 'NEUTRAL';
  
  return {
    bullScore,
    bearScore,
    netScore,
    trendStrength,
    components: {
      trendBull,
      trendBear,
      aboveEmaFast,
      aboveEmaSlow,
      emaSpreadPct: +emaSpreadPct.toFixed(3),
      vwapBull,
      vwapBear,
      rsiBull,
      rsiBear,
      macdBull,
      macdBear,
      adxTrend,
      diBull,
      diBear,
      volSpike,
      volSpikeExtreme,
      breakoutUp,
      breakoutDown,
      bbBreakoutUp,
      bbBreakoutDown,
      omTrendBull,
      omTrendBear,
      omBullCross,
      omBearCross,
      probBullOk,
      probBearOk,
    },
    bullProb: knnData?.bullProb || null,
    bearProb: knnData?.bearProb || null,
    bullMatches: knnData?.bullMatches || 0,
    bearMatches: knnData?.bearMatches || 0,
  };
}

// ─── KNN Pattern Probability ─────────────────────────────────
export function computeKNNProbability(quotes, lookback = 120, k = 7, forwardBars = 3, minSamples = 25) {
  if (!quotes || quotes.length < lookback + forwardBars + 10) {
    return { bullProb: null, bearProb: null, bullMatches: 0, bearMatches: 0, warming: true };
  }
  
  // Compute features for each bar
  const closes = quotes.map(q => q.close);
  const highs = quotes.map(q => q.high || q.close);
  const lows = quotes.map(q => q.low || q.close);
  const volumes = quotes.map(q => q.volume || 0);
  const len = closes.length;
  
  // Compute RSI, EMA, MACD features for current bar
  const currentRSI = computeRSI(closes, 14);
  const currentEmaFast = computeEMA(closes, 21);
  const currentEmaSlow = computeEMA(closes, 50);
  const currentMACD = computeMACDLine(closes, 12, 26);
  const currentMACDSignal = computeEMA(currentMACD.filter(v => v != null), 9);
  
  // Current features
  const curIdx = len - 1;
  const curRSI = currentRSI[curIdx];
  const curEmaSpread = currentEmaFast[curIdx] && currentEmaSlow[curIdx] 
    ? ((currentEmaFast[curIdx] - currentEmaSlow[curIdx]) / currentEmaSlow[curIdx]) * 100 
    : 0;
  const curMACDHist = currentMACD[curIdx] != null && currentMACDSignal[curIdx - (len - currentMACDSignal.length)] != null
    ? (currentMACD[curIdx] - currentMACDSignal[currentMACDSignal.length - 1]) / closes[curIdx] * 100
    : 0;
  
  // Volume ratio for current bar
  const volSmaLen = 20;
  const volSlice = volumes.slice(Math.max(0, curIdx - volSmaLen), curIdx + 1);
  const curVolRatio = volSlice.length >= volSmaLen 
    ? volumes[curIdx] / (volSlice.reduce((a, b) => a + b, 0) / volSlice.length) 
    : 1;
  
  // ─── Pattern matching: find K nearest historical patterns ───
  const patterns = [];
  
  for (let i = volSmaLen + 50; i < len - forwardBars; i++) {
    const rsi = currentRSI[i];
    const emaFast = currentEmaFast[i];
    const emaSlow = currentEmaSlow[i];
    const macdLine = currentMACD[i];
    if (rsi == null || emaFast == null || emaSlow == null || macdLine == null) continue;
    
    const emaSpread = ((emaFast - emaSlow) / emaSlow) * 100;
    const macdHist = (currentMACD[i] - (currentMACDSignal[i - (len - currentMACDSignal.length)] || 0)) / closes[i] * 100;
    const volSma = volumes.slice(Math.max(0, i - volSmaLen), i + 1).reduce((a, b) => a + b, 0) / (volSmaLen + 1);
    const vRatio = volSma > 0 ? volumes[i] / volSma : 1;
    
    // Forward return
    const fwdClose = i + forwardBars < len ? closes[i + forwardBars] : null;
    if (fwdClose == null) continue;
    const fwdRet = (fwdClose - closes[i]) / closes[i] * 100;
    
    patterns.push({ rsi, emaSpread, macdHist, volRatio: vRatio, fwdRet, idx: i });
  }
  
  if (patterns.length < minSamples) {
    return { bullProb: null, bearProb: null, bullMatches: 0, bearMatches: 0, warming: true, samples: patterns.length };
  }
  
  // ─── KNN for bullish direction ──────────────────────────────
  const bullDistances = patterns
    .filter(p => p.fwdRet > 0) // bullish outcomes only for bull KNN
    .map(p => ({
      dist: Math.abs(curRSI - p.rsi) * 0.35 + Math.abs(curEmaSpread - p.emaSpread) * 1.2 + Math.abs(curMACDHist - p.macdHist) * 2.0 + Math.abs(curVolRatio - p.volRatio) * 1.5,
      fwdRet: p.fwdRet,
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k);
  
  const bullWins = bullDistances.filter(d => d.fwdRet > 0).length;
  const bullProb = bullDistances.length > 0 ? bullWins / bullDistances.length : null;
  
  // ─── KNN for bearish direction ──────────────────────────────
  const bearDistances = patterns
    .map(p => ({
      dist: Math.abs(curRSI - p.rsi) * 0.35 + Math.abs(curEmaSpread - p.emaSpread) * 1.2 + Math.abs(curMACDHist - p.macdHist) * 2.0 + Math.abs(curVolRatio - p.volRatio) * 1.5,
      fwdRet: p.fwdRet,
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, k);
  
  const bearWins = bearDistances.filter(d => d.fwdRet < 0).length;
  const bearProb = bearDistances.length > 0 ? bearWins / bearDistances.length : null;
  
  return {
    bullProb: bullProb != null ? +bullProb.toFixed(3) : null,
    bearProb: bearProb != null ? +bearProb.toFixed(3) : null,
    bullMatches: bullDistances.length,
    bearMatches: bearDistances.length,
    bullAvgReturn: bullDistances.length > 0 ? +(bullDistances.reduce((s, d) => s + d.fwdRet, 0) / bullDistances.length).toFixed(3) : null,
    bearAvgReturn: bearDistances.length > 0 ? +(bearDistances.reduce((s, d) => s + d.fwdRet, 0) / bearDistances.length).toFixed(3) : null,
    samples: patterns.length,
    warming: false,
    currentFeatures: {
      rsi: curRSI ? +curRSI.toFixed(1) : null,
      emaSpread: +curEmaSpread.toFixed(3),
      macdHist: +curMACDHist.toFixed(4),
      volRatio: +curVolRatio.toFixed(2),
    },
  };
}

// ─── Helper: RSI ──────────────────────────────────────────────
function computeRSI(values, length = 14) {
  const result = new Array(values.length).fill(null);
  if (values.length < length + 1) return result;
  
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) avgGain += change; else avgLoss += Math.abs(change);
  }
  avgGain /= length;
  avgLoss /= length;
  
  for (let i = length; i < values.length; i++) {
    if (i > length) {
      const change = values[i] - values[i - 1];
      avgGain = (avgGain * (length - 1) + (change > 0 ? change : 0)) / length;
      avgLoss = (avgLoss * (length - 1) + (change < 0 ? Math.abs(change) : 0)) / length;
    }
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ─── Helper: EMA ──────────────────────────────────────────────
function computeEMA(values, length) {
  const result = new Array(values.length).fill(null);
  const k = 2 / (length + 1);
  let ema = null;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (count < length) {
      ema = ema === null ? values[i] : ema + values[i];
      count++;
      if (count === length) { ema = ema / length; result[i] = ema; }
    } else {
      ema = values[i] * k + ema * (1 - k);
      result[i] = ema;
    }
  }
  return result;
}

// ─── Helper: MACD Line ────────────────────────────────────────
function computeMACDLine(values, fast = 12, slow = 26) {
  const emaFast = computeEMA(values, fast);
  const emaSlow = computeEMA(values, slow);
  const result = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      result[i] = emaFast[i] - emaSlow[i];
    }
  }
  return result;
}

// ─── MTF Trend Alignment ─────────────────────────────────────
export async function computeMTFTrend(symbol, yahoo, emaFast = 21, emaSlow = 50) {
  const timeframes = ['5m', '15m', '1h', '1d'];
  const results = {};
  
  for (const tf of timeframes) {
    try {
      const period1 = new Date(Date.now() - (tf === '1d' ? 365 : tf === '1h' ? 30 : 7) * 86400000).toISOString().split('T')[0];
      const period2 = new Date().toISOString().split('T')[0];
      const hist = await yahoo.chart(symbol, { period1, period2, interval: tf });
      const quotes = (hist.quotes || []).filter(q => q.close != null);
      
      if (quotes.length < emaSlow) {
        results[tf] = { trend: 'INSUFFICIENT DATA', emaFast: null, emaSlow: null, price: null };
        continue;
      }
      
      const closes = quotes.map(q => q.close);
      const ef = computeEMA(closes, emaFast);
      const es = computeEMA(closes, emaSlow);
      const lastIdx = closes.length - 1;
      
      const price = closes[lastIdx];
      const fastVal = ef[lastIdx];
      const slowVal = es[lastIdx];
      const rsiValues = computeRSI(closes, 14);
      const rsi = rsiValues[lastIdx];
      
      const bull = price > fastVal && fastVal > slowVal && rsi > 50;
      const bear = price < fastVal && fastVal < slowVal && rsi < 50;
      
      results[tf] = {
        trend: bull ? 'BULL' : bear ? 'BEAR' : 'NEUTRAL',
        price: price ? +price.toFixed(2) : null,
        emaFast: fastVal ? +fastVal.toFixed(2) : null,
        emaSlow: slowVal ? +slowVal.toFixed(2) : null,
        rsi: rsi ? +rsi.toFixed(1) : null,
      };
    } catch (e) {
      results[tf] = { trend: 'ERROR', error: e.message };
    }
  }
  
  return results;
}

export default {
  computeVolumeSpikes,
  computeBreakouts,
  computeBollingerBreakouts,
  computeOMSignals,
  computeTrendScore,
  computeKNNProbability,
  computeMTFTrend,
};