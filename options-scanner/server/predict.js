/**
 * LSTM Stock Price Prediction
 *
 * Based on the GeeksforGeeks approach:
 *   https://www.geeksforgeeks.org/nlp/stock-price-prediction-project-using-tensorflow/
 *
 * Uses a sliding window of N days' closing prices to predict the next day.
 * Integrated with our provider factory (Yahoo, Public.com, Finnhub).
 *
 * Model architecture:
 *   - Input: (batch, windowSize, features) — sequence of past N days
 *   - LSTM layer 1: 64 units, return sequences
 *   - LSTM layer 2: 32 units
 *   - Dropout: 0.2
 *   - Dense: 16 units, ReLU
 *   - Dense: 1 (predicted price)
 *
 * Features per timestep:
 *   - Close (normalized)
 *   - Volume (normalized)
 *   - SMA20 offset (normalized)
 *   - RSI (normalized)
 *   - Returns (normalized)
 *
 * Endpoints:
 *   POST /api/predict/train/:symbol    — train model on historical data
 *   GET  /api/predict/:symbol           — predict next day's price
 *   GET  /api/predict/:symbol/forecast   — 5-day forecast
 */

import * as tf from '@tensorflow/tfjs';

// ─── Config ─────────────────────────────────────────────────────
const CONFIG = {
  windowSize: 60,       // Days of history to use
  features: 5,          // close, volume, sma20Offset, rsi, returns
  epochs: 50,           // Training epochs
  batchSize: 32,
  validationSplit: 0.1,
  learningRate: 0.001,
  lstmUnits1: 64,
  lstmUnits2: 32,
  denseUnits: 16,
  dropoutRate: 0.2,
  forecastDays: 5,
};

// ─── In-memory model cache ──────────────────────────────────────
const modelCache = new Map(); // symbol → { model, scaler, trainedAt, loss }

// ─── Data Preparation ───────────────────────────────────────────

function computeSMA(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = arr.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function computeRSI(arr, period = 14) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period) { result.push(50); continue; }
    const changes = arr.slice(i - period + 1, i + 1).map((c, j) => j === 0 ? 0 : c - arr[i - period + j]);
    // Actually compute properly
    let gains = 0, losses = 0;
    for (let k = 1; k <= i; k++) {
      const change = arr[k] - arr[k - 1];
      if (change > 0) gains += change; else losses += Math.abs(change);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) { result.push(100); continue; }
    result.push(100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function computeReturns(arr) {
  return arr.map((c, i) => i === 0 ? 0 : (c - arr[i - 1]) / arr[i - 1]);
}

/**
 * Normalize array to [0, 1] range. Returns { normalized, min, max }.
 */
function normalize(arr) {
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  return { normalized: arr.map(v => (v - min) / range), min, max, range };
}

/**
 * Denormalize a value from [0, 1] back to original range.
 */
function denormalize(value, min, range) {
  return value * range + min;
}

/**
 * Build feature matrix from historical quotes.
 * Each row = [close, volume, sma20Offset, rsi, returns]
 */
function buildFeatureMatrix(quotes) {
  const closes = quotes.map(q => q.close).filter(c => c != null);
  const volumes = quotes.map(q => q.volume || 0);
  const sma20 = computeSMA(closes, 20);
  const rsi = computeRSI(closes);
  const returns = computeReturns(closes);

  // sma20Offset = (close - sma20) / close — how far price is from SMA20
  const sma20Offset = closes.map((c, i) => sma20[i] != null ? (c - sma20[i]) / (c || 1) : 0);

  const matrix = [];
  for (let i = 0; i < closes.length; i++) {
    matrix.push([
      closes[i],
      volumes[i] || 0,
      sma20Offset[i] || 0,
      (rsi[i] || 50) / 100,  // Normalize RSI to [0, 1]
      returns[i] || 0,
    ]);
  }
  return matrix;
}

/**
 * Create sliding window sequences for LSTM input.
 * X: (samples, windowSize, features)
 * Y: (samples, 1) — next day's close price
 */
function createSequences(matrix, windowSize) {
  const X = [];
  const Y = [];
  for (let i = windowSize; i < matrix.length; i++) {
    X.push(matrix.slice(i - windowSize, i));
    Y.push([matrix[i][0]]); // Predict close price
  }
  return { X, Y };
}

// ─── Model Building ─────────────────────────────────────────────

function buildModel(config = CONFIG) {
  const model = tf.sequential();

  model.add(tf.layers.lstm({
    units: config.lstmUnits1,
    returnSequences: true,
    inputShape: [config.windowSize, config.features],
  }));

  model.add(tf.layers.dropout({ rate: config.dropoutRate }));

  model.add(tf.layers.lstm({
    units: config.lstmUnits2,
    returnSequences: false,
  }));

  model.add(tf.layers.dropout({ rate: config.dropoutRate }));

  model.add(tf.layers.dense({
    units: config.denseUnits,
    activation: 'relu',
  }));

  model.add(tf.layers.dense({
    units: 1,
  }));

  model.compile({
    optimizer: tf.train.adam(config.learningRate),
    loss: 'meanSquaredError',
    metrics: ['mse'],
  });

  return model;
}

// ─── Training ────────────────────────────────────────────────────

export async function trainModel(symbol, provider, config = {}) {
  const cfg = { ...CONFIG, ...config };

  // Fetch historical data (1 year minimum, 2 years preferred)
  const period1 = new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0];
  const period2 = new Date().toISOString().split('T')[0];

  console.log(`[LSTM] Fetching data for ${symbol}...`);
  const hist = await provider.chart(symbol, { period1, period2, interval: '1d' });
  const quotes = hist.quotes.filter(q => q.close != null);

  if (quotes.length < cfg.windowSize + 30) {
    throw new Error(`Insufficient data for ${symbol}: ${quotes.length} points (need ${cfg.windowSize + 30})`);
  }

  console.log(`[LSTM] ${symbol}: ${quotes.length} data points from ${quotes[0].date} to ${quotes[quotes.length - 1].date}`);

  // Build feature matrix
  const rawMatrix = buildFeatureMatrix(quotes);

  // Normalize each feature independently
  const scalers = [];
  const normalizedMatrix = [];
  for (let col = 0; col < cfg.features; col++) {
    const column = rawMatrix.map(row => row[col]);
    const { normalized, min, max, range } = normalize(column);
    scalers.push({ min, max, range });
    for (let row = 0; row < normalized.length; row++) {
      if (!normalizedMatrix[row]) normalizedMatrix[row] = [];
      normalizedMatrix[row][col] = normalized[row];
    }
  }

  // Create sequences
  const { X, Y } = createSequences(normalizedMatrix, cfg.windowSize);

  if (X.length < 20) {
    throw new Error(`Too few sequences for ${symbol}: ${X.length}`);
  }

  // Convert to tensors
  const xs = tf.tensor3d(X);
  const ys = tf.tensor2d(Y);

  // Build model
  const model = buildModel(cfg);

  console.log(`[LSTM] Training ${symbol}: ${X.length} samples, ${cfg.epochs} epochs...`);

  // Train
  const history = await model.fit(xs, ys, {
    epochs: cfg.epochs,
    batchSize: cfg.batchSize,
    validationSplit: cfg.validationSplit,
    shuffle: true,
    verbose: 0,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (epoch % 10 === 0 || epoch === cfg.epochs - 1) {
          console.log(`[LSTM] ${symbol} epoch ${epoch + 1}/${cfg.epochs} — loss: ${logs.loss.toFixed(6)}, val_loss: ${(logs.val_loss || 0).toFixed(6)}`);
        }
      },
    },
  });

  const finalLoss = history.history.loss[history.history.loss.length - 1];
  const finalValLoss = history.history.val_loss?.[history.history.val_loss.length - 1];

  // Cache the trained model
  modelCache.set(symbol, {
    model,
    scalers,
    trainedAt: new Date().toISOString(),
    dataPoints: quotes.length,
    sequences: X.length,
    loss: finalLoss,
    valLoss: finalValLoss,
    lastDate: quotes[quotes.length - 1].date,
    lastPrice: quotes[quotes.length - 1].close,
    config: cfg,
  });

  // Cleanup tensors
  xs.dispose();
  ys.dispose();

  return {
    symbol,
    trainedAt: new Date().toISOString(),
    dataPoints: quotes.length,
    sequences: X.length,
    loss: finalLoss,
    valLoss: finalValLoss,
    lastDate: quotes[quotes.length - 1].date,
    lastPrice: quotes[quotes.length - 1].close,
    epochs: cfg.epochs,
    windowSize: cfg.windowSize,
  };
}

// ─── Prediction ──────────────────────────────────────────────────

export async function predictNextDay(symbol, provider) {
  // Check cache — retrain if model is > 24 hours old
  let cached = modelCache.get(symbol);
  if (!cached || Date.now() - new Date(cached.trainedAt).getTime() > 24 * 3600000) {
    console.log(`[LSTM] No recent model for ${symbol}, training...`);
    await trainModel(symbol, provider);
    cached = modelCache.get(symbol);
  }

  // Fetch latest data
  const period1 = new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0];
  const period2 = new Date().toISOString().split('T')[0];
  const hist = await provider.chart(symbol, { period1, period2, interval: '1d' });
  const quotes = hist.quotes.filter(q => q.close != null);

  if (quotes.length < cached.config.windowSize) {
    throw new Error(`Insufficient data for ${symbol}: ${quotes.length} points (need ${cached.config.windowSize})`);
  }

  // Build feature matrix and normalize using cached scalers
  const rawMatrix = buildFeatureMatrix(quotes);
  const normalizedMatrix = [];
  for (let col = 0; col < cached.config.features; col++) {
    const { min, range } = cached.scalers[col];
    for (let row = 0; row < rawMatrix.length; row++) {
      if (!normalizedMatrix[row]) normalizedMatrix[row] = [];
      normalizedMatrix[row][col] = (rawMatrix[row][col] - min) / range;
    }
  }

  // Take last windowSize rows
  const input = normalizedMatrix.slice(-cached.config.windowSize);
  const inputTensor = tf.tensor3d([input]);

  // Predict
  const prediction = cached.model.predict(inputTensor);
  const predictedNorm = prediction.dataSync()[0];
  const predictedPrice = denormalize(predictedNorm, cached.scalers[0].min, cached.scalers[0].range);

  // Cleanup
  inputTensor.dispose();
  prediction.dispose();

  const lastPrice = quotes[quotes.length - 1].close;
  const change = predictedPrice - lastPrice;
  const changePercent = lastPrice > 0 ? (change / lastPrice) * 100 : 0;

  return {
    symbol,
    predictedPrice: +predictedPrice.toFixed(2),
    lastPrice: +lastPrice.toFixed(2),
    change: +change.toFixed(2),
    changePercent: +changePercent.toFixed(2),
    direction: change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'FLAT',
    confidence: cached.valLoss ? Math.max(0, Math.min(100, 100 - cached.valLoss * 1000)) : null,
    modelTrainedAt: cached.trainedAt,
    modelDataPoints: cached.dataPoints,
    lastDate: cached.lastDate,
  };
}

// ─── Multi-Day Forecast ─────────────────────────────────────────

export async function forecast(symbol, provider, days = CONFIG.forecastDays) {
  // Ensure model exists
  let cached = modelCache.get(symbol);
  if (!cached || Date.now() - new Date(cached.trainedAt).getTime() > 24 * 3600000) {
    await trainModel(symbol, provider);
    cached = modelCache.get(symbol);
  }

  // Fetch latest data
  const period1 = new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0];
  const period2 = new Date().toISOString().split('T')[0];
  const hist = await provider.chart(symbol, { period1, period2, interval: '1d' });
  const quotes = hist.quotes.filter(q => q.close != null);

  if (quotes.length < cached.config.windowSize) {
    throw new Error(`Insufficient data for ${symbol}: ${quotes.length} points (need ${cached.config.windowSize})`);
  }

  // Build initial feature matrix
  const rawMatrix = buildFeatureMatrix(quotes);
  let normalizedMatrix = [];
  for (let col = 0; col < cached.config.features; col++) {
    const { min, range } = cached.scalers[col];
    for (let row = 0; row < rawMatrix.length; row++) {
      if (!normalizedMatrix[row]) normalizedMatrix[row] = [];
      normalizedMatrix[row][col] = (rawMatrix[row][col] - min) / range;
    }
  }

  const forecastResults = [];
  let currentWindow = normalizedMatrix.slice(-cached.config.windowSize);

  for (let d = 0; d < days; d++) {
    const inputTensor = tf.tensor3d([currentWindow]);
    const prediction = cached.model.predict(inputTensor);
    const predictedNorm = prediction.dataSync()[0];
    const predictedPrice = denormalize(predictedNorm, cached.scalers[0].min, cached.scalers[0].range);

    // Estimate confidence based on how far into the future
    const confidence = Math.max(0, Math.min(100, 95 - d * 8));

    const lastPrice = d === 0 ? quotes[quotes.length - 1].close : forecastResults[d - 1].predictedPrice;
    const change = predictedPrice - lastPrice;
    const changePercent = lastPrice > 0 ? (change / lastPrice) * 100 : 0;

    forecastResults.push({
      day: d + 1,
      date: new Date(Date.now() + (d + 1) * 86400000).toISOString().split('T')[0],
      predictedPrice: +predictedPrice.toFixed(2),
      change: +change.toFixed(2),
      changePercent: +changePercent.toFixed(2),
      confidence,
    });

    // Append predicted row and slide window
    const newRow = [...currentWindow[currentWindow.length - 1]]; // copy last row
    newRow[0] = predictedNorm; // update close with prediction
    newRow[4] = d === 0 ? (predictedPrice - quotes[quotes.length - 1].close) / quotes[quotes.length - 1].close : (predictedPrice - forecastResults[d - 1].predictedPrice) / forecastResults[d - 1].predictedPrice; // update returns
    currentWindow = [...currentWindow.slice(1), newRow];

    inputTensor.dispose();
    prediction.dispose();
  }

  return {
    symbol,
    lastPrice: +quotes[quotes.length - 1].close.toFixed(2),
    lastDate: quotes[quotes.length - 1].date,
    modelTrainedAt: cached.trainedAt,
    modelDataPoints: cached.dataPoints,
    modelLoss: cached.loss,
    modelValLoss: cached.valLoss,
    forecast: forecastResults,
  };
}

// ─── Config ─────────────────────────────────────────────────────
export const PREDICT_CONFIG = CONFIG;

// ─── Model Info ──────────────────────────────────────────────────

export function getModelInfo(symbol) {
  const cached = modelCache.get(symbol);
  if (!cached) return null;
  return {
    symbol,
    trainedAt: cached.trainedAt,
    dataPoints: cached.dataPoints,
    sequences: cached.sequences,
    loss: cached.loss,
    valLoss: cached.valLoss,
    lastDate: cached.lastDate,
    lastPrice: cached.lastPrice,
    config: {
      windowSize: cached.config.windowSize,
      features: cached.config.features,
      epochs: cached.config.epochs,
      lstmUnits1: cached.config.lstmUnits1,
      lstmUnits2: cached.config.lstmUnits2,
    },
  };
}

export function listModels() {
  const models = [];
  for (const [symbol, cached] of modelCache.entries()) {
    models.push({
      symbol,
      trainedAt: cached.trainedAt,
      dataPoints: cached.dataPoints,
      loss: cached.loss,
      valLoss: cached.valLoss,
    });
  }
  return models;
}

// Also available as named exports via the inline `export` keywords above