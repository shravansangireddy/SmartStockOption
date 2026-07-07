/**
 * Full Stock Analysis — Single Ticker Deep Dive
 *
 * Outputs sections A–D:
 *   A: Market Conditions Summary
 *   B: Technical Analysis & Price Prediction + ASCII Chart
 *   C: High Conviction Trade Setups (the table)
 *   D: News & Catalysts
 *
 * Endpoint: GET /api/analysis/full/:symbol
 */

import { getProviderByName } from './providers/index.js';
import { analyzeStock } from './stocker.js';
import { predictNextDay, forecast, getModelInfo } from './predict.js';
import { generatePriceChartSVG } from './chart-svg.js';
import { computeVolumeSpikes, computeBreakouts, computeBollingerBreakouts, computeOMSignals, computeTrendScore, computeKNNProbability, computeMTFTrend } from './enhanced-analysis.js';

// ─── ASCII Chart Generation ────────────────────────────────────

function generateASCIIChart(quotes, width = 60, height = 20) {
  if (!quotes || quotes.length === 0) return 'No chart data available';
  
  const closes = quotes.map(q => q.close).filter(c => c != null);
  const dates = quotes.map(q => q.date ? String(q.date) : '').filter(d => d != null && d !== '');
  if (closes.length < 2) return 'Insufficient data for chart';
  
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const chartLines = [];
  
  // Build chart grid
  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  
  // Plot price line
  for (let i = 0; i < closes.length && i < width; i++) {
    const y = Math.round((1 - (closes[i] - min) / range) * (height - 1));
    const yClamped = Math.max(0, Math.min(height - 1, y));
    grid[yClamped][i] = '█';
  }
  
  // Add SMA line if we have enough data
  const smaPeriod = 20;
  const smaValues = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < smaPeriod - 1) { smaValues.push(null); continue; }
    const slice = closes.slice(i - smaPeriod + 1, i + 1);
    smaValues.push(slice.reduce((a, b) => a + b, 0) / smaPeriod);
  }
  
  for (let i = 0; i < smaValues.length && i < width; i++) {
    if (smaValues[i] == null) continue;
    const y = Math.round((1 - (smaValues[i] - min) / range) * (height - 1));
    const yClamped = Math.max(0, Math.min(height - 1, y));
    if (grid[yClamped][i] === ' ') grid[yClamped][i] = '░';
  }
  
  // Format chart
  const priceLabels = [];
  for (let row = 0; row < height; row++) {
    const price = max - (row / (height - 1)) * range;
    const label = price.toFixed(0).padStart(6);
    priceLabels.push(label);
    chartLines.push(`${label} │${grid[row].join('')}│`);
  }
  
  // X-axis
  chartLines.push('       └' + '─'.repeat(width) + '┘');
  const startDate = dates[0] || '';
  const endDate = dates[dates.length - 1] || '';
  const dateLabel = `${startDate} → ${endDate}`.padStart(width + 10);
  chartLines.push(dateLabel);
  
  // Legend
  chartLines.push('');
  chartLines.push('  █ = Price   ░ = SMA20');
  chartLines.push(`  Range: $${min.toFixed(2)} → $${max.toFixed(2)} (${((max - min) / min * 100).toFixed(1)}%)`);
  
  return chartLines.join('\n');
}

function generateVolumeChart(quotes, width = 60, height = 8) {
  if (!quotes || quotes.length === 0) return 'No volume data';
  
  const volumes = quotes.map(q => q.volume || 0);
  const maxVol = Math.max(...volumes) || 1;
  
  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  
  for (let i = 0; i < volumes.length && i < width; i++) {
    const barHeight = Math.round((volumes[i] / maxVol) * height);
    for (let row = height - 1; row >= height - barHeight; row--) {
      grid[row][i] = '▓';
    }
  }
  
  const lines = [];
  lines.push(`  Vol  │${grid[0].join('')}│`);
  for (let row = 1; row < height; row++) {
    lines.push(`      │${grid[row].join('')}│`);
  }
  lines.push(`       └${'─'.repeat(width)}┘`);
  lines.push(`  Max: ${(maxVol / 1e6).toFixed(1)}M`);
  
  return lines.join('\n');
}

// ─── Quick Prediction (no LSTM, from technicals) ─────────────────

function quickPredict(analysis) {
  // Simple trend-based prediction using technical indicators
  const price = analysis.price;
  const trend = analysis.trend || 'Neutral';
  const rsi = analysis.rsi;
  const sma20 = analysis.sma20;
  const sma50 = analysis.sma50;
  const macd = analysis.macd;
  const atr = analysis.atr;
  const bollinger = analysis.bollinger;
  const changePct = typeof analysis.changePercent === 'string' ? parseFloat(analysis.changePercent) : (analysis.changePercent || 0);

  if (!price) return null;

  // Score directional bias
  let bias = 0; // positive = bullish, negative = bearish
  let confidence = 50;

  // Trend
  if (trend.includes('Strong Up') || trend.includes('Bullish')) bias += 2;
  else if (trend.includes('Up')) bias += 1;
  else if (trend.includes('Strong Down') || trend.includes('Bearish')) bias -= 2;
  else if (trend.includes('Down')) bias -= 1;

  // SMA alignment
  if (sma20 && price > sma20) bias += 0.5;
  else if (sma20) bias -= 0.5;
  if (sma50 && price > sma50) bias += 0.5;
  else if (sma50) bias -= 0.5;

  // RSI
  if (rsi != null) {
    if (rsi < 30) { bias += 1; confidence += 10; } // oversold bounce
    else if (rsi > 70) { bias -= 1; confidence += 10; } // overbought reversal
    else if (rsi > 50 && rsi < 65) { bias += 0.3; } // bullish momentum
    else if (rsi > 35 && rsi < 50) { bias -= 0.3; } // bearish momentum
  }

  // MACD
  if (macd != null && macd > 0) bias += 0.3;
  else if (macd != null) bias -= 0.3;

  // Bollinger
  if (bollinger?.percentB != null) {
    if (bollinger.percentB < 20) { bias += 0.5; } // near lower band
    else if (bollinger.percentB > 80) { bias -= 0.5; } // near upper band
  }

  // Recent momentum
  if (changePct > 2) bias += 0.3;
  else if (changePct < -2) bias -= 0.3;

  // Direction
  let direction = 'Neutral';
  if (bias > 0.5) direction = 'UP';
  else if (bias < -0.5) direction = 'DOWN';

  // Predicted price change
  const atrPct = atr ? atr / price : 0.01; // default 1% daily range
  let predictedChange = bias * atrPct * 0.5; // scale by bias
  const predictedPrice = +(price * (1 + predictedChange)).toFixed(2);
  const changePercent = +(predictedChange * 100).toFixed(2);

  confidence = Math.min(90, Math.max(30, confidence + Math.abs(bias) * 10));

  return {
    predictedPrice,
    direction,
    changePercent,
    confidence: +confidence.toFixed(0),
    method: 'technical',
  };
}

function quickForecast(analysis, prediction) {
  if (!prediction) return null;
  const price = analysis.price;
  const atr = analysis.atr || price * 0.02;
  const direction = prediction.direction;
  const days = [1, 2, 3, 4, 5];

  return days.map(day => {
    // Simple random walk with drift
    const drift = direction === 'UP' ? 0.002 : direction === 'DOWN' ? -0.002 : 0;
    const noise = (Math.random() - 0.5) * (atr / price) * 0.5;
    const cumChange = drift * day + noise * Math.sqrt(day);
    const predictedPrice = +(price * (1 + cumChange * day)).toFixed(2);
    const changePercent = +((predictedPrice / price - 1) * 100).toFixed(2);
    return {
      day,
      predictedPrice,
      changePercent,
      confidence: Math.max(50, prediction.confidence - day * 3),
    };
  });
}

// ─── Market Conditions Summary ────────────────────────────────
async function getMarketConditions(yahoo) {
  const snapshot = await yahoo.marketSnapshot();
  const spy = snapshot.SPY || {};
  const qqq = snapshot.QQQ || {};
  const iwm = snapshot.IWM || {};
  const dia = snapshot.DIA || {};
  const vix = snapshot['^VIX'] || snapshot.VIX || {};

  const spyChange = spy.changePercent ? (spy.changePercent * 100).toFixed(2) : 'N/A';
  const qqqChange = qqq.changePercent ? (qqq.changePercent * 100).toFixed(2) : 'N/A';
  const iwmChange = iwm.changePercent ? (iwm.changePercent * 100).toFixed(2) : 'N/A';
  const vixLevel = vix.price || 'N/A';

  let regime = 'Neutral';
  const spyPct = spy.changePercent || 0;
  if (vix.price && vix.price > 25) regime = 'High Volatility / Fear';
  else if (vix.price && vix.price < 14) regime = 'Low Volatility / Complacency';
  else if (spyPct > 0.01) regime = 'Bullish Trend';
  else if (spyPct < -0.01) regime = 'Bearish Pressure';
  else regime = 'Range-Bound / Neutral';

  let riskSentiment = 'Normal';
  if (vix.price) {
    if (vix.price > 30) riskSentiment = 'Extreme Fear — Options expensive, favor selling premium';
    else if (vix.price > 20) riskSentiment = 'Elevated Fear — Consider wider stops, favor debit spreads';
    else if (vix.price < 12) riskSentiment = 'Complacency — Cheap options, favor long premium';
    else riskSentiment = 'Normal — Balanced risk/reward for spreads and directional trades';
  }

  return {
    indices: {
      SPY: { price: spy.price, change: spy.change, changePercent: spyPct ? +(spyPct * 100 / 100).toFixed(4) : null },
      QQQ: { price: qqq.price, change: qqq.change, changePercent: qqq.changePercent },
      IWM: { price: iwm.price, change: iwm.change, changePercent: iwm.changePercent },
      DIA: { price: dia.price, change: dia.change, changePercent: dia.changePercent },
      VIX: { price: vix.price },
    },
    regime,
    riskSentiment,
    vixLevel: vix.price || vixLevel,
    spyTrend: spyPct > 0.005 ? 'bullish' : spyPct < -0.005 ? 'bearish' : 'neutral',
    summary: `Market is in a ${regime} regime. VIX at ${vix.price || 'N/A'}. ${riskSentiment}.`,
  };
}

// ─── Section B: Technical Analysis + Prediction ───────────────
async function getTechnicalAnalysis(symbol, yahoo, pub) {
  // Stock analysis from stocker
  const analysis = await analyzeStock(symbol, yahoo, pub);

  // Get chart data for ASCII charts
  const period1 = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
  const period2 = new Date().toISOString().split('T')[0];
  const hist = await yahoo.chart(symbol, { period1, period2, interval: '1d' });
  const quotes = (hist.quotes || []).filter(q => q.close != null);

  // Generate charts
  const priceChart = generateASCIIChart(quotes, 60, 20);
  const volumeChart = generateVolumeChart(quotes, 60, 8);

  // ─── Enhanced Analysis (Pine Script components) ─────────────
  const volData = computeVolumeSpikes(quotes, 20, 1.5, 2.5);
  const breakoutData = computeBreakouts(quotes, 20, true);
  const bbData = computeBollingerBreakouts(quotes, 20, 2.0);
  const omData = computeOMSignals(quotes, 8, 21, 'EMA');
  const knnData = computeKNNProbability(quotes, 120, 7, 3, 25);
  const trendScore = computeTrendScore(analysis, quotes, volData, breakoutData, bbData, omData, knnData);

  // Try LSTM prediction (train if needed)
  let prediction = null;
  let forecastData = null;
  try {
    const cached = getModelInfo(symbol);
    if (cached) {
      // Use cached LSTM model for prediction
      prediction = await predictNextDay(symbol, yahoo);
      forecastData = await forecast(symbol, yahoo, 5);
      if (prediction) prediction.method = 'lstm';
    } else {
      // No LSTM model yet — use instant technical prediction
      console.log(`[FULL] No cached LSTM model for ${symbol}, using technical prediction`);
      prediction = quickPredict(analysis);
      forecastData = quickForecast(analysis, prediction);
    }
  } catch (e) {
    console.warn(`[FULL] Prediction failed for ${symbol}: ${e.message}`);
    if (!prediction) prediction = quickPredict(analysis);
    if (!forecastData) forecastData = quickForecast(analysis, prediction);
  }

  return {
    ...analysis,
    priceChart,
    volumeChart,
    svgChart: generatePriceChartSVG(quotes, {
      symbol,
      width: 900,
      height: 480,
      analysis: {
        trend: analysis.trend,
        rsi: analysis.rsi,
        sma20: analysis.sma20,
        sma50: analysis.sma50,
        sma200: analysis.sma200,
        bollinger: analysis.bollinger,
        atr: analysis.atr,
        changePercent: analysis.changePercent,
        high52w: analysis.high52w,
        low52w: analysis.low52w,
        relativeVolume: analysis.relativeVolume,
        prediction: prediction ? {
          direction: prediction.direction,
          changePercent: prediction.changePercent,
        } : null,
      },
    }),
    chartData: {
      dates: quotes.slice(-30).map(q => q.date ? String(q.date) : ''),
      closes: quotes.slice(-30).map(q => q.close),
      volumes: quotes.slice(-30).map(q => q.volume),
    },
    prediction: prediction ? {
      predictedPrice: prediction.predictedPrice,
      direction: prediction.direction,
      changePercent: prediction.changePercent,
      confidence: prediction.confidence,
      method: prediction.method || 'lstm',
    } : null,
    forecast: Array.isArray(forecastData) ? forecastData : forecastData?.forecast || null,
    // ─── Pine Script Components ────────────────────────────────
    volumeSpike: volData.current,
    breakout: breakoutData.current,
    bollinger: bbData.current,
    omSignal: omData.current,
    omRecentCross: omData.recentCrossBars,
    knnProbability: knnData,
    trendScore: trendScore,
  };
}

// ─── Section C: High Conviction Trade Setups ──────────────────
async function getTradeSetups(symbol, analysis, yahoo, pub) {
  const chain = await yahoo.optionsChain(symbol);
  const price = chain.underlyingPrice || analysis.price;
  const dte = chain.dte || 30;
  const strikes = chain.strikes || [];
  const calls = (chain.chain || []).filter(c => c.type === 'call');
  const puts = (chain.chain || []).filter(c => c.type === 'put');

  const trend = analysis.trend || 'Neutral';
  const rsi = analysis.rsi;
  const atr = analysis.atr;
  const sma20 = analysis.sma20;
  const sma50 = analysis.sma50;
  const sma200 = analysis.sma200;
  const bollinger = analysis.bollinger;
  const prediction = analysis.prediction;

  // Determine direction bias
  let directionBias = 'Neutral';
  if (trend.includes('Uptrend') || trend.includes('Bullish')) directionBias = 'Bullish';
  else if (trend.includes('Downtrend') || trend.includes('Bearish')) directionBias = 'Bearish';

  // ATR-based stop and target
  const stopDistance = atr ? +(atr * 1.5).toFixed(2) : null;
  const targetDistance = atr ? +(atr * 3).toFixed(2) : null;

  // Generate setups
  const setups = [];

  // ─── SWING TRADES (DTE 15-45) ─────────────────────────────────
  if (dte >= 15 && dte <= 60 && price > 0) {
    // Bull Call Spread (bullish bias)
    if (directionBias === 'Bullish' || directionBias === 'Neutral') {
      const atmStrike = findNearestStrike(strikes, price);
      const otmStrike = findNearestStrike(strikes, price * 1.03); // ~3% OTM
      const longCall = findContract(calls, atmStrike);
      const shortCall = findContract(calls, otmStrike);

      if (longCall && shortCall && longCall.mid > 0) {
        const debit = +(longCall.mid - (shortCall.mid || 0)).toFixed(2);
        const maxProfit = +((otmStrike - atmStrike) - Math.abs(debit)).toFixed(2);
        const rr = maxProfit > 0 && debit > 0 ? +(maxProfit / Math.abs(debit)).toFixed(1) : null;
        const stopLevel = sma20 ? +(sma20 - atr * 0.5).toFixed(2) : null;

        setups.push({
          symbol,
          direction: 'Bullish',
          strategy: 'Bull Call Spread',
          timeframe: 'Swing',
          expiration: chain.selectedExpiry,
          dte: dte,
          strike: `${atmStrike}/${otmStrike}`,
          estDelta: longCall.delta ? `${+longCall.delta.toFixed(2)}/${+(shortCall.delta || 0).toFixed(2)}` : 'N/A',
          entry: debit,
          oi: `${longCall.openInterest || 0}/${shortCall.openInterest || 0}`,
          spreadQuality: debit > 0 ? 'Good' : 'Poor',
          technicalReason: buildReason('bullish', { price, sma20, sma50, sma200, rsi, atr, prediction, bollinger }),
          stopLoss: stopLevel ? `$${stopLevel} (below SMA20${atr ? ' - 0.5×ATR' : ''})` : 'N/A',
          riskPerContract: Math.abs(debit) * 100,
          rrTarget: rr ? `${rr}:1` : 'N/A',
          score: analysis.scores?.total || 'N/A',
          scoreBreakdown: analysis.scores ? `Trend=${analysis.scores.trend}/Liq=${analysis.scores.volume}/RR=${analysis.scores.volatility}` : 'N/A',
          maxProfit: maxProfit * 100,
          breakeven: +(atmStrike + Math.abs(debit)).toFixed(2),
        });
      }
    }

    // Bear Put Spread (bearish bias)
    if (directionBias === 'Bearish' || directionBias === 'Neutral') {
      const atmStrike = findNearestStrike(strikes, price);
      const otmStrike = findNearestStrike(strikes, price * 0.97); // ~3% OTM
      const longPut = findContract(puts, atmStrike);
      const shortPut = findContract(puts, otmStrike);

      if (longPut && shortPut && longPut.mid > 0) {
        const debit = +(longPut.mid - (shortPut.mid || 0)).toFixed(2);
        const maxProfit = +((atmStrike - otmStrike) - Math.abs(debit)).toFixed(2);
        const rr = maxProfit > 0 && debit > 0 ? +(maxProfit / Math.abs(debit)).toFixed(1) : null;
        const stopLevel = sma20 ? +(sma20 + atr * 0.5).toFixed(2) : null;

        setups.push({
          symbol,
          direction: 'Bearish',
          strategy: 'Bear Put Spread',
          timeframe: 'Swing',
          expiration: chain.selectedExpiry,
          dte: dte,
          strike: `${atmStrike}/${otmStrike}`,
          estDelta: longPut.delta ? `${+longPut.delta.toFixed(2)}/${+(shortPut.delta || 0).toFixed(2)}` : 'N/A',
          entry: debit,
          oi: `${longPut.openInterest || 0}/${shortPut.openInterest || 0}`,
          spreadQuality: debit > 0 ? 'Good' : 'Poor',
          technicalReason: buildReason('bearish', { price, sma20, sma50, sma200, rsi, atr, prediction, bollinger }),
          stopLoss: stopLevel ? `$${stopLevel} (above SMA20${atr ? ' + 0.5×ATR' : ''})` : 'N/A',
          riskPerContract: Math.abs(debit) * 100,
          rrTarget: rr ? `${rr}:1` : 'N/A',
          score: analysis.scores?.total || 'N/A',
          scoreBreakdown: analysis.scores ? `Trend=${analysis.scores.trend}/Liq=${analysis.scores.volume}/RR=${analysis.scores.volatility}` : 'N/A',
          maxProfit: maxProfit * 100,
          breakeven: +(atmStrike - Math.abs(debit)).toFixed(2),
        });
      }
    }

    // Long Call (strong bullish)
    if (directionBias === 'Bullish' && rsi && rsi < 70) {
      const otmStrike = findNearestStrike(strikes, price * 1.02);
      const call = findContract(calls, otmStrike);
      if (call && call.mid > 0) {
        const stopLevel = sma50 ? +(sma50 - atr * 0.5).toFixed(2) : null;
        setups.push({
          symbol,
          direction: 'Bullish',
          strategy: 'Long Call',
          timeframe: 'Swing',
          expiration: chain.selectedExpiry,
          dte: dte,
          strike: otmStrike,
          estDelta: call.delta ? +call.delta.toFixed(2) : 'N/A',
          entry: call.mid,
          oi: call.openInterest || 0,
          spreadQuality: call.ask && call.bid ? ((call.ask - call.bid) / call.mid * 100).toFixed(1) + '%' : 'N/A',
          technicalReason: buildReason('bullish-long', { price, sma20, sma50, sma200, rsi, atr, prediction, bollinger }),
          stopLoss: stopLevel ? `$${stopLevel} (below SMA50${atr ? ' - 0.5×ATR' : ''})` : 'N/A',
          riskPerContract: +(call.mid * 100).toFixed(0),
          rrTarget: atr && call.mid ? `${(atr * 3 / call.mid).toFixed(1)}:1` : 'N/A',
          score: analysis.scores?.total || 'N/A',
          scoreBreakdown: analysis.scores ? `Trend=${analysis.scores.trend}/Liq=${analysis.scores.volume}/RR=${analysis.scores.volatility}` : 'N/A',
          maxProfit: 'Unlimited',
          breakeven: +(otmStrike + call.mid).toFixed(2),
        });
      }
    }

    // Long Put (strong bearish)
    if (directionBias === 'Bearish' && rsi && rsi > 30) {
      const otmStrike = findNearestStrike(strikes, price * 0.98);
      const put = findContract(puts, otmStrike);
      if (put && put.mid > 0) {
        const stopLevel = sma50 ? +(sma50 + atr * 0.5).toFixed(2) : null;
        setups.push({
          symbol,
          direction: 'Bearish',
          strategy: 'Long Put',
          timeframe: 'Swing',
          expiration: chain.selectedExpiry,
          dte: dte,
          strike: otmStrike,
          estDelta: put.delta ? +put.delta.toFixed(2) : 'N/A',
          entry: put.mid,
          oi: put.openInterest || 0,
          spreadQuality: put.ask && put.bid ? ((put.ask - put.bid) / put.mid * 100).toFixed(1) + '%' : 'N/A',
          technicalReason: buildReason('bearish-long', { price, sma20, sma50, sma200, rsi, atr, prediction, bollinger }),
          stopLoss: stopLevel ? `$${stopLevel} (above SMA50${atr ? ' + 0.5×ATR' : ''})` : 'N/A',
          riskPerContract: +(put.mid * 100).toFixed(0),
          rrTarget: atr && put.mid ? `${(atr * 3 / put.mid).toFixed(1)}:1` : 'N/A',
          score: analysis.scores?.total || 'N/A',
          scoreBreakdown: analysis.scores ? `Trend=${analysis.scores.trend}/Liq=${analysis.scores.volume}/RR=${analysis.scores.volatility}` : 'N/A',
          maxProfit: +((otmStrike - put.mid) * 100).toFixed(0),
          breakeven: +(otmStrike - put.mid).toFixed(2),
        });
      }
    }
  }

  // ─── LEAPS (Long-term, if available) ──────────────────────────
  // Try to find longer-dated expiration
  const longerExpiries = (chain.expirationDates || []).filter(d => {
    const dte2 = Math.ceil((new Date(d + 'T00:00:00Z').getTime() - Date.now()) / 86400000);
    return dte2 >= 180;
  }).slice(0, 2);

  for (const expiry of longerExpiries) {
    try {
      const longChain = await yahoo.optionsChain(symbol, expiry);
      const longDte = Math.ceil((new Date(expiry + 'T00:00:00Z').getTime() - Date.now()) / 86400000);
      const longCalls = (longChain.chain || []).filter(c => c.type === 'call');
      const longPuts = (longChain.chain || []).filter(c => c.type === 'put');

      // LEAPS Call (bullish, delta ~0.7)
      if (directionBias === 'Bullish' || directionBias === 'Neutral') {
        const itmStrike = findNearestStrike(longChain.strikes || strikes, price * 0.95); // 5% ITM
        const leapCall = findContract(longCalls, itmStrike);
        if (leapCall && leapCall.mid > 0 && (leapCall.delta || 0) >= 0.6) {
          setups.push({
            symbol,
            direction: 'Bullish',
            strategy: 'LEAPS Call',
            timeframe: 'LEAPS',
            expiration: expiry,
            dte: Math.ceil((new Date(expiry + 'T00:00:00Z').getTime() - Date.now()) / 86400000),
            strike: itmStrike,
            estDelta: leapCall.delta ? +leapCall.delta.toFixed(2) : 'N/A',
            entry: leapCall.mid,
            oi: leapCall.openInterest || 0,
            spreadQuality: leapCall.ask && leapCall.bid ? ((leapCall.ask - leapCall.bid) / leapCall.mid * 100).toFixed(1) + '%' : 'N/A',
            technicalReason: buildReason('leaps-bull', { price, sma200, rsi, prediction }),
            stopLoss: sma200 ? `$${(+sma200).toFixed(2)} (200-day SMA)` : 'N/A',
            riskPerContract: +(leapCall.mid * 100).toFixed(0),
            rrTarget: '3:1+',
            score: analysis.scores?.total || 'N/A',
            scoreBreakdown: analysis.scores ? `Trend=${analysis.scores.trend}/Liq=${analysis.scores.volume}/RR=${analysis.scores.volatility}` : 'N/A',
            maxProfit: 'Unlimited',
            breakeven: +(itmStrike + leapCall.mid).toFixed(2),
          });
        }
      }

      // Only add one LEAPS per expiry to keep the table manageable
      break;
    } catch (e) {
      console.warn(`[FULL] LEAPS chain failed for ${expiry}: ${e.message}`);
    }
  }

  // Sort by score descending
  setups.sort((a, b) => {
    const scoreA = typeof a.score === 'number' ? a.score : 0;
    const scoreB = typeof b.score === 'number' ? b.score : 0;
    return scoreB - scoreA;
  });

  return {
    underlyingPrice: price,
    selectedExpiry: chain.selectedExpiry,
    dte,
    availableExpiries: chain.expirationDates,
    setups,
    chainSummary: {
      totalCalls: calls.length,
      totalPuts: puts.length,
      totalStrikes: strikes.length,
      avgATMIV: analysis.options?.ivPct || 'N/A',
      avgATMDelta: analysis.options?.avgATMDelta || 'N/A',
    },
  };
}

// ─── Helper Functions ──────────────────────────────────────────

function findNearestStrike(strikes, target) {
  if (!strikes || strikes.length === 0) return target;
  return strikes.reduce((prev, curr) => Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev);
}

function findContract(contracts, strike) {
  if (!contracts || contracts.length === 0) return null;
  const sorted = [...contracts].sort((a, b) => Math.abs(a.strike - strike) - Math.abs(b.strike - strike));
  return sorted[0] || null;
}

function buildReason(type, data) {
  const { price, sma20, sma50, sma200, rsi, atr, prediction, bollinger } = data;
  const reasons = [];

  if (type.includes('bull')) {
    if (sma20 && price > sma20) reasons.push(`Price $${price?.toFixed(2)} above SMA20 $${sma20?.toFixed(2)}`);
    if (sma50 && price > sma50) reasons.push(`Above SMA50 $${sma50?.toFixed(2)}`);
    if (sma200 && sma50 > sma200) reasons.push('Golden cross (SMA50 > SMA200)');
    if (prediction?.direction === 'UP') reasons.push(`LSTM predicts UP (${prediction.changePercent}%)`);
    if (bollinger?.percentB != null && bollinger.percentB < 70) reasons.push(`Bollinger %B at ${bollinger.percentB}% (room to run)`);
  } else if (type.includes('bear')) {
    if (sma20 && price < sma20) reasons.push(`Price $${price?.toFixed(2)} below SMA20 $${sma20?.toFixed(2)}`);
    if (sma50 && price < sma50) reasons.push(`Below SMA50 $${sma50?.toFixed(2)}`);
    if (sma200 && sma50 < sma200) reasons.push('Death cross (SMA50 < SMA200)');
    if (prediction?.direction === 'DOWN') reasons.push(`LSTM predicts DOWN (${prediction.changePercent}%)`);
  }

  if (rsi) {
    if (rsi > 70) reasons.push(`RSI overbought at ${rsi}`);
    else if (rsi < 30) reasons.push(`RSI oversold at ${rsi}`);
    else if (rsi > 40 && rsi < 60) reasons.push(`RSI neutral at ${rsi} (pullback zone)`);
  }

  if (atr && price) reasons.push(`ATR $${atr?.toFixed(2)} (${(atr / price * 100).toFixed(1)}% daily range)`);
  if (type.includes('leaps') && sma200) reasons.push(`Long-term trend: SMA200 at $${sma200?.toFixed(2)}`);

  return reasons.join('; ') || 'No specific technical catalyst';
}

// ─── Section D: News ────────────────────────────────────────────
async function getNews(yahoo, symbol) {
  try {
    const news = await yahoo.news(symbol, 10);
    return (news || []).slice(0, 5).map(n => ({
      title: n.title || n.Headline || '',
      source: n.publisher || n.Source || '',
      date: n.date || n.publishedAt || '',
      url: n.link || n.URL || '',
      summary: (n.summary || n.text || '').substring(0, 200),
    }));
  } catch (e) {
    return [];
  }
}

// ─── Main Full Analysis ─────────────────────────────────────────
export async function fullAnalysis(symbol, providers) {
  const { yahoo, pub } = providers;

  console.log(`[FULL] Starting full analysis for ${symbol}...`);

  // Section A: Market Conditions
  const market = await getMarketConditions(yahoo);

  // Section B: Technical Analysis + Prediction
  const technical = await getTechnicalAnalysis(symbol, yahoo, pub);

  // Section C: Trade Setups
  const setups = await getTradeSetups(symbol, technical, yahoo, pub);

  // Section D: News
  const news = await getNews(yahoo, symbol);

  return {
    symbol: symbol.toUpperCase(),
    generatedAt: new Date().toISOString(),
    sectionA: {
      title: 'Market Conditions',
      ...market,
    },
    sectionB: {
      title: 'Technical Analysis & Price Prediction',
      svgChart: technical.svgChart,
      priceChart: technical.priceChart,
      volumeChart: technical.volumeChart,
      chartData: technical.chartData,
      analysis: {
        price: technical.price,
        change: technical.change,
        changePercent: technical.changePercent,
        trend: technical.trend,
        sma20: technical.sma20,
        sma50: technical.sma50,
        sma200: technical.sma200,
        rsi: technical.rsi,
        atr: technical.atr,
        macd: technical.macd,
        bollinger: technical.bollinger,
        stochastic: technical.stochastic,
        high52w: technical.high52w,
        low52w: technical.low52w,
        pctFrom52wHigh: technical.pctFrom52wHigh,
        pctFrom52wLow: technical.pctFrom52wLow,
        volume: technical.volume,
        avgVolume: technical.avgVolume,
        relativeVolume: technical.relativeVolume,
      },
      prediction: technical.prediction,
      forecast: technical.forecast,
      scores: technical.scores,
      signal: technical.signal,
      // ─── Pine Script Enhanced ────────────────────────────────
      volumeSpike: technical.volumeSpike,
      breakout: technical.breakout,
      bollinger: technical.bollinger,
      omSignal: technical.omSignal,
      omRecentCross: technical.omRecentCross,
      knnProbability: technical.knnProbability,
      trendScore: technical.trendScore,
    },
    sectionC: {
      title: 'High Conviction Trade Setups',
      ...setups,
    },
    sectionD: {
      title: 'News & Catalysts',
      news,
    },
  };
}

export default { fullAnalysis };