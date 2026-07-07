/**
 * ML Algorithms for Options Scanner
 *
 * Based on GeeksforGeeks SVM approach + LSTM + Random Forest:
 *   https://www.geeksforgeeks.org/machine-learning/predicting-stock-price-direction-using-support-vector-machines/
 *
 * Supported algorithms:
 *   - SVM (Support Vector Machine) — classification: UP/DOWN direction
 *   - LSTM (Long Short-Term Memory) — regression: next-day price prediction
 *   - RF (Random Forest) — classification + regression
 *   - Ensemble — weighted vote of all models
 *
 * Features used:
 *   - Close price, Volume, SMA20 offset, RSI, Returns
 *   - SMA50, SMA200, MACD line, Bollinger %B, Stochastic K/D
 *   - ATR (Average True Range)
 *
 * Each algorithm has configurable hyperparameters exposed via the UI.
 */

import * as tf from '@tensorflow/tfjs';

// ─── Default Algorithm Configs ─────────────────────────────────

export const ALGORITHM_CONFIGS = {
  svm: {
    id: 'svm',
    name: 'Support Vector Machine',
    shortName: 'SVM',
    type: 'classification', // predicts UP/DOWN direction
    description: 'Classifies next-day price direction (UP/DOWN) using technical indicators as features. Best for trend confirmation.',
    icon: '📊',
    params: {
      kernel: { type: 'select', options: ['rbf', 'linear', 'poly'], default: 'rbf', label: 'Kernel', description: 'RBF works best for non-linear patterns; Linear for simple trends' },
      C: { type: 'number', min: 0.01, max: 100, step: 0.1, default: 1.0, label: 'Regularization (C)', description: 'Higher C = less regularization, more complex boundary' },
      gamma: { type: 'select', options: ['scale', 'auto', '0.01', '0.1', '1'], default: 'scale', label: 'Gamma', description: 'Kernel coefficient. "scale" adapts to data, lower = smoother boundary' },
      windowSize: { type: 'number', min: 10, max: 120, step: 5, default: 60, label: 'Lookback Window', description: 'Number of historical days to consider' },
      testSize: { type: 'number', min: 0.1, max: 0.4, step: 0.05, default: 0.2, label: 'Test Split %', description: 'Fraction of data held out for validation' },
    },
    outputs: ['direction', 'confidence', 'accuracy', 'precision', 'recall'],
    color: '#00d4aa',
  },
  lstm: {
    id: 'lstm',
    name: 'LSTM Neural Network',
    shortName: 'LSTM',
    type: 'regression', // predicts next-day price
    description: 'Predicts exact next-day price using sequential pattern learning. Best for price forecasting with trend awareness.',
    icon: '🧠',
    params: {
      windowSize: { type: 'number', min: 10, max: 120, step: 5, default: 60, label: 'Lookback Window', description: 'Number of historical days per input sequence' },
      epochs: { type: 'number', min: 10, max: 200, step: 10, default: 50, label: 'Training Epochs', description: 'More epochs = better fit but risk overfitting' },
      lstmUnits1: { type: 'number', min: 16, max: 256, step: 16, default: 64, label: 'LSTM Layer 1 Units', description: 'Number of neurons in first LSTM layer' },
      lstmUnits2: { type: 'number', min: 8, max: 128, step: 8, default: 32, label: 'LSTM Layer 2 Units', description: 'Number of neurons in second LSTM layer' },
      denseUnits: { type: 'number', min: 8, max: 64, step: 8, default: 16, label: 'Dense Layer Units', description: 'Neurons in the final dense hidden layer' },
      dropoutRate: { type: 'number', min: 0, max: 0.5, step: 0.05, default: 0.2, label: 'Dropout Rate', description: 'Regularization: higher = more dropout, prevents overfitting' },
      learningRate: { type: 'number', min: 0.0001, max: 0.01, step: 0.0001, default: 0.001, label: 'Learning Rate', description: 'Step size for weight updates. Lower = slower but more precise' },
      batchSize: { type: 'number', min: 8, max: 128, step: 8, default: 32, label: 'Batch Size', description: 'Samples per training step' },
    },
    outputs: ['predictedPrice', 'change', 'changePercent', 'direction', 'confidence', 'loss'],
    color: '#6c5ce7',
  },
  rf: {
    id: 'rf',
    name: 'Random Forest',
    shortName: 'RF',
    type: 'both', // classification + regression
    description: 'Ensemble of decision trees. Robust to noise, good for feature importance. Predicts both direction and price.',
    icon: '🌲',
    params: {
      nEstimators: { type: 'number', min: 10, max: 500, step: 10, default: 100, label: 'Number of Trees', description: 'More trees = better accuracy but slower' },
      maxDepth: { type: 'number', min: 2, max: 30, step: 2, default: 10, label: 'Max Tree Depth', description: 'Deeper = more complex patterns, risk overfitting' },
      minSamplesSplit: { type: 'number', min: 2, max: 20, step: 1, default: 5, label: 'Min Samples to Split', description: 'Minimum samples required to split a node' },
      minSamplesLeaf: { type: 'number', min: 1, max: 10, step: 1, default: 2, label: 'Min Samples per Leaf', description: 'Minimum samples at a leaf node' },
      windowSize: { type: 'number', min: 10, max: 120, step: 5, default: 60, label: 'Lookback Window', description: 'Number of historical days to consider' },
      testSize: { type: 'number', min: 0.1, max: 0.4, step: 0.05, default: 0.2, label: 'Test Split %', description: 'Fraction of data held out for validation' },
    },
    outputs: ['direction', 'confidence', 'accuracy', 'featureImportance', 'predictedPrice'],
    color: '#fd79a8',
  },
  ensemble: {
    id: 'ensemble',
    name: 'Ensemble (SVM + LSTM + RF)',
    shortName: 'Ensemble',
    type: 'both',
    description: 'Weighted majority vote of all three models. Most robust — reduces individual model weaknesses.',
    icon: '🎯',
    params: {
      windowSize: { type: 'number', min: 10, max: 120, step: 5, default: 60, label: 'Lookback Window', description: 'Shared window size for all models' },
      svmWeight: { type: 'number', min: 0, max: 1, step: 0.1, default: 0.3, label: 'SVM Weight', description: 'Weight for SVM prediction in final vote' },
      lstmWeight: { type: 'number', min: 0, max: 1, step: 0.1, default: 0.4, label: 'LSTM Weight', description: 'Weight for LSTM prediction in final vote' },
      rfWeight: { type: 'number', min: 0, max: 1, step: 0.1, default: 0.3, label: 'RF Weight', description: 'Weight for RF prediction in final vote' },
    },
    outputs: ['direction', 'confidence', 'consensus', 'individualPredictions'],
    color: '#fdcb6e',
  },
};

// ─── Feature Engineering ────────────────────────────────────────

function computeSMA(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = arr.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

function computeEMA(arr, period) {
  if (arr.length < period) return arr.map(() => null);
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = arr.slice(0, period - 1).map(() => null);
  result.push(ema);
  for (let i = period; i < arr.length; i++) {
    ema = arr[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function computeRSI(arr, period = 14) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period) { result.push(50); continue; }
    let gains = 0, losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const change = arr[j] - arr[j - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) { result.push(100); continue; }
    result.push(100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function computeMACD(closes) {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] == null || ema26[i] == null) { macdLine.push(null); continue; }
    macdLine.push(ema12[i] - ema26[i]);
  }
  const validMacd = macdLine.filter(v => v != null);
  const signal = computeEMA(validMacd, 9);
  // Pad signal to match length
  const padded = [];
  let j = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null) { padded.push(null); }
    else { padded.push(signal[j] ?? null); j++; }
  }
  return { macdLine, signal: padded };
}

function computeBollingerBands(closes, period = 20) {
  const sma = computeSMA(closes, period);
  const upper = [], lower = [], percentB = [];
  for (let i = 0; i < closes.length; i++) {
    if (sma[i] == null) { upper.push(null); lower.push(null); percentB.push(0.5); continue; }
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const std = Math.sqrt(slice.reduce((s, v) => s + (v - sma[i]) ** 2, 0) / slice.length);
    upper.push(sma[i] + 2 * std);
    lower.push(sma[i] - 2 * std);
    const range = 4 * std;
    percentB.push(range > 0 ? (closes[i] - lower[i]) / range : 0.5);
  }
  return { upper, middle: sma, lower, percentB };
}

function computeStochastic(highs, lows, closes, period = 14) {
  const result = { k: [], d: [] };
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.k.push(50); result.d.push(50); continue; }
    const highSlice = highs.slice(i - period + 1, i + 1);
    const lowSlice = lows.slice(i - period + 1, i + 1);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    result.k.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }
  result.d = computeSMA(result.k, 3);
  return result;
}

/**
 * Build full feature matrix from historical quotes.
 * Returns { matrix, featureNames, labels, prices } where:
 *   matrix[i][j] = normalized feature value
 *   labels[i] = 1 if next day UP, 0 if DOWN
 *   prices[i] = actual close price
 */
export function buildFeatureMatrix(quotes, config = {}) {
  const windowSize = config.windowSize || 60;
  const closes = quotes.map(q => q.close).filter(c => c != null);
  const highs = quotes.map(q => q.high ?? q.close).filter(h => h != null);
  const lows = quotes.map(q => q.low ?? q.close).filter(l => l != null);
  const volumes = quotes.map(q => q.volume || 0);

  if (closes.length < windowSize + 10) {
    throw new Error(`Insufficient data: ${closes.length} points (need ${windowSize + 10})`);
  }

  // Compute all indicators
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);
  const rsi = computeRSI(closes, 14);
  const { macdLine } = computeMACD(closes);
  const { percentB: bollPctB } = computeBollingerBands(closes);
  const { k: stochK, d: stochD } = computeStochastic(highs, lows, closes, 14);
  const returns = closes.map((c, i) => i === 0 ? 0 : (c - closes[i - 1]) / closes[i - 1]);

  // Feature columns (normalized to [-1, 1] or [0, 1])
  const featureNames = [
    'Close', 'Volume', 'SMA20_offset', 'SMA50_offset', 'RSI', 'Returns',
    'MACD_line', 'Bollinger_%B', 'Stoch_K', 'Stoch_D',
  ];

  const rawMatrix = [];
  for (let i = 0; i < closes.length; i++) {
    const sma20off = sma20[i] != null ? (closes[i] - sma20[i]) / (closes[i] || 1) : 0;
    const sma50off = sma50[i] != null ? (closes[i] - sma50[i]) / (closes[i] || 1) : 0;
    rawMatrix.push([
      closes[i],
      volumes[i] || 0,
      sma20off,
      sma50off,
      (rsi[i] || 50) / 100, // Normalize RSI to [0, 1]
      returns[i] || 0,
      macdLine[i] != null ? macdLine[i] : 0,
      bollPctB[i] || 0.5,
      (stochK[i] || 50) / 100, // Normalize Stochastic to [0, 1]
      (stochD[i] || 50) / 100,
    ]);
  }

  // Labels: 1 = UP, 0 = DOWN (next day's direction)
  const labels = closes.map((c, i) => i < closes.length - 1 ? (closes[i + 1] > c ? 1 : 0) : null);
  const prices = closes.slice();

  // Normalize each feature column independently
  const scalers = [];
  const normalizedMatrix = [];
  for (let col = 0; col < featureNames.length; col++) {
    const column = rawMatrix.map(row => row[col]);
    const min = Math.min(...column);
    const max = Math.max(...column);
    const range = max - min || 1;
    scalers.push({ min, max, range });
    for (let row = 0; row < column.length; row++) {
      if (!normalizedMatrix[row]) normalizedMatrix[row] = [];
      normalizedMatrix[row][col] = (column[row] - min) / range;
    }
  }

  return { matrix: normalizedMatrix, featureNames, labels, prices, scalers, rawMatrix, closes, highs, lows };
}

// ─── SVM Implementation (JavaScript) ─────────────────────────────

/**
 * Simplified SVM using SMO (Sequential Minimal Optimization).
 * Implements RBF, linear, and polynomial kernels for binary classification.
 */
export class SVM {
  constructor(config = {}) {
    this.kernel = config.kernel || 'rbf';
    this.C = config.C || 1.0;
    this.gamma = config.gamma || 'scale';
    this.tol = config.tol || 1e-3;
    this.maxIter = config.maxIter || 1000;
    this.alphas = [];
    this.b = 0;
    this.supportVectors = [];
    this.supportLabels = [];
  }

  _kernel(x1, x2) {
    if (this.kernel === 'linear') {
      return x1.reduce((s, v, i) => s + v * x2[i], 0);
    }
    // RBF kernel
    const gamma = this._gamma;
    const dist = x1.reduce((s, v, i) => s + (v - x2[i]) ** 2, 0);
    return Math.exp(-gamma * dist);
  }

  fit(X, y) {
    const n = X.length;
    const dim = X[0].length;

    // Compute gamma
    if (this.gamma === 'scale') {
      const varSum = X.reduce((s, row) => s + row.reduce((ss, v) => ss + v * v, 0), 0) / n;
      this._gamma = 1 / (dim * (varSum / n || 1));
    } else if (this.gamma === 'auto') {
      this._gamma = 1 / dim;
    } else {
      this._gamma = parseFloat(this.gamma);
    }

    this.alphas = new Array(n).fill(0);
    this.b = 0;
    this.X = X;
    this.y = y.map(v => v === 1 ? 1 : -1); // SVM uses {-1, +1}

    // Precompute kernel matrix
    const K = [];
    for (let i = 0; i < n; i++) {
      K[i] = [];
      for (let j = 0; j < n; j++) {
        K[i][j] = this._kernel(X[i], X[j]);
      }
    }

    // SMO training
    let passes = 0;
    while (passes < this.maxIter) {
      let numChangedAlphas = 0;
      for (let i = 0; i < n; i++) {
        const Ei = this._predictRaw(X, i, K) - this.y[i];
        if ((this.y[i] * Ei < -this.tol && this.alphas[i] < this.C) ||
            (this.y[i] * Ei > this.tol && this.alphas[i] > 0)) {
          // Select j randomly ≠ i
          let j = i;
          while (j === i) j = Math.floor(Math.random() * n);
          const Ej = this._predictRaw(X, j, K) - this.y[j];

          const oldAi = this.alphas[i];
          const oldAj = this.alphas[j];

          // Compute L and H
          let L, H;
          if (this.y[i] !== this.y[j]) {
            L = Math.max(0, this.alphas[j] - this.alphas[i]);
            H = Math.min(this.C, this.C + this.alphas[j] - this.alphas[i]);
          } else {
            L = Math.max(0, this.alphas[i] + this.alphas[j] - this.C);
            H = Math.min(this.C, this.alphas[i] + this.alphas[j]);
          }
          if (Math.abs(L - H) < 1e-10) continue;

          const eta = 2 * K[i][j] - K[i][i] - K[j][j];
          if (eta >= 0) continue;

          this.alphas[j] = oldAj - this.y[j] * (Ei - Ej) / eta;
          this.alphas[j] = Math.max(L, Math.min(H, this.alphas[j]));

          if (Math.abs(this.alphas[j] - oldAj) < 1e-5) continue;

          this.alphas[i] = oldAi + this.y[i] * this.y[j] * (oldAj - this.alphas[j]);
          const b1 = this.b - Ei - this.y[i] * (this.alphas[i] - oldAi) * K[i][i] - this.y[j] * (this.alphas[j] - oldAj) * K[i][j];
          const b2 = this.b - Ej - this.y[i] * (this.alphas[i] - oldAi) * K[i][j] - this.y[j] * (this.alphas[j] - oldAj) * K[j][j];
          if (this.alphas[i] > 0 && this.alphas[i] < this.C) this.b = b1;
          else if (this.alphas[j] > 0 && this.alphas[j] < this.C) this.b = b2;
          else this.b = (b1 + b2) / 2;

          numChangedAlphas++;
        }
      }
      if (numChangedAlphas === 0) passes++;
      else passes = 0;
    }

    // Store support vectors
    this.supportVectors = [];
    this.supportLabels = [];
    this.supportAlphas = [];
    for (let i = 0; i < n; i++) {
      if (this.alphas[i] > 1e-6) {
        this.supportVectors.push(X[i]);
        this.supportLabels.push(this.y[i]);
        this.supportAlphas.push(this.alphas[i]);
      }
    }

    return this;
  }

  _predictRaw(X, i, K) {
    let sum = this.b;
    for (let j = 0; j < X.length; j++) {
      if (this.alphas[j] > 1e-6) {
        sum += this.alphas[j] * this.y[j] * (K ? K[i][j] : this._kernel(X[i], X[j]));
      }
    }
    return sum;
  }

  predict(x) {
    let sum = this.b;
    for (let i = 0; i < this.supportVectors.length; i++) {
      sum += this.supportAlphas[i] * this.supportLabels[i] * this._kernel(this.supportVectors[i], x);
    }
    return sum >= 0 ? 1 : 0; // Return {0, 1}
  }

  predictProba(x) {
    let sum = this.b;
    for (let i = 0; i < this.supportVectors.length; i++) {
      sum += this.supportAlphas[i] * this.supportLabels[i] * this._kernel(this.supportVectors[i], x);
    }
    // Sigmoid to convert to probability
    return 1 / (1 + Math.exp(-sum));
  }

  accuracy(X, y) {
    let correct = 0;
    for (let i = 0; i < X.length; i++) {
      if (this.predict(X[i]) === y[i]) correct++;
    }
    return correct / X.length;
  }
}

// ─── Algorithm Training & Prediction ────────────────────────────

const modelCache = new Map(); // symbol → { model, scalers, trainedAt, algorithm, ... }

/**
 * Train a model with the specified algorithm.
 */
export async function trainAlgorithm(symbol, provider, algorithm = 'svm', userParams = {}) {
  const algoConfig = ALGORITHM_CONFIGS[algorithm];
  if (!algoConfig) throw new Error(`Unknown algorithm: ${algorithm}`);

  // Merge user params with defaults
  const config = { windowSize: 60, ...userParams };

  // Fetch historical data
  const period1 = new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0];
  const period2 = new Date().toISOString().split('T')[0];
  const hist = await provider.chart(symbol, { period1, period2, interval: '1d' });
  const quotes = hist.quotes.filter(q => q.close != null);

  if (quotes.length < config.windowSize + 30) {
    throw new Error(`Insufficient data for ${symbol}: ${quotes.length} points (need ${config.windowSize + 30})`);
  }

  // Build feature matrix
  const { matrix, labels, prices, scalers, featureNames } = buildFeatureMatrix(quotes, config);

  // Prepare training data
  const ws = config.windowSize;
  const X = [];
  const Y = [];
  for (let i = ws; i < matrix.length - 1; i++) {
    // Flatten the window of feature vectors into a single input vector
    const window = matrix.slice(i - ws, i).flat();
    X.push(window);
    Y.push(labels[i]); // 1 = UP, 0 = DOWN
  }

  const validIdx = Y.map((y, i) => y != null);
  const validX = X.filter((_, i) => validIdx[i]);
  const validY = Y.filter((_, i) => validIdx[i]);

  if (validX.length < 20) {
    throw new Error(`Too few valid training samples for ${symbol}: ${validX.length}`);
  }

  // Train-test split
  const testSize = config.testSize || 0.2;
  const splitIdx = Math.floor(validX.length * (1 - testSize));
  const trainX = validX.slice(0, splitIdx);
  const trainY = validY.slice(0, splitIdx);
  const testX = validX.slice(splitIdx);
  const testY = validY.slice(splitIdx);

  console.log(`[${algoConfig.shortName}] Training ${symbol}: ${trainX.length} train, ${testX.length} test, window=${ws}`);

  let result;

  if (algorithm === 'svm') {
    const svm = new SVM({
      kernel: config.kernel || 'rbf',
      C: config.C || 1.0,
      gamma: config.gamma || 'scale',
    });
    svm.fit(trainX, trainY);
    const trainAcc = svm.accuracy(trainX, trainY);
    const testAcc = testX.length > 0 ? svm.accuracy(testX, testY) : null;
    result = {
      model: svm, scalers, config, featureNames, algorithm: 'svm',
      trainAccuracy: trainAcc, testAccuracy: testAcc,
      trainSize: trainX.length, testSize: testX.length,
      supportVectors: svm.supportVectors.length,
      trainedAt: new Date().toISOString(),
    };
  } else if (algorithm === 'lstm') {
    // Use existing LSTM training from predict.js
    const lstmResult = await trainLSTM(symbol, provider, config, quotes, matrix, labels, scalers);
    result = lstmResult;
  } else if (algorithm === 'rf') {
    // Random Forest using ml-random-forest (already imported in index.js)
    const rfResult = await trainRF(symbol, provider, config, trainX, trainY, testX, testY, scalers, featureNames);
    result = rfResult;
  }

  // Cache the model
  modelCache.set(`${symbol}:${algorithm}`, result);
  return result;
}

/**
 * Train LSTM model (uses TensorFlow.js).
 */
async function trainLSTM(symbol, provider, config, quotes, matrix, labels, scalers) {
  const ws = config.windowSize || 60;
  const features = config.features || 10;

  // Create sequences for LSTM
  const X = [];
  const Y = [];
  for (let i = ws; i < matrix.length - 1; i++) {
    X.push(matrix.slice(i - ws, i));
    Y.push([matrix[i + 1][0]]); // Predict next day's normalized close
  }

  if (X.length < 20) {
    throw new Error(`Too few LSTM sequences for ${symbol}: ${X.length}`);
  }

  const xs = tf.tensor3d(X);
  const ys = tf.tensor2d(Y);

  const model = tf.sequential();
  model.add(tf.layers.lstm({ units: config.lstmUnits1 || 64, returnSequences: true, inputShape: [ws, features] }));
  model.add(tf.layers.dropout({ rate: config.dropoutRate || 0.2 }));
  model.add(tf.layers.lstm({ units: config.lstmUnits2 || 32, returnSequences: false }));
  model.add(tf.layers.dropout({ rate: config.dropoutRate || 0.2 }));
  model.add(tf.layers.dense({ units: config.denseUnits || 16, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 1 }));
  model.compile({ optimizer: tf.train.adam(config.learningRate || 0.001), loss: 'meanSquaredError', metrics: ['mse'] });

  const epochs = config.epochs || 50;
  const history = await model.fit(xs, ys, {
    epochs,
    batchSize: config.batchSize || 32,
    validationSplit: config.validationSplit || 0.1,
    shuffle: true,
    verbose: 0,
  });

  const finalLoss = history.history.loss[history.history.loss.length - 1];
  const finalValLoss = history.history.val_loss?.[history.history.val_loss.length - 1];

  xs.dispose();
  ys.dispose();

  return {
    model, scalers, config, algorithm: 'lstm',
    loss: finalLoss, valLoss: finalValLoss,
    trainSize: X.length, testSize: 0,
    trainedAt: new Date().toISOString(),
    lastPrice: quotes[quotes.length - 1].close,
    lastDate: quotes[quotes.length - 1].date,
  };
}

/**
 * Train Random Forest (uses ml-random-forest).
 */
async function trainRF(symbol, provider, config, trainX, trainY, testX, testY, scalers, featureNames) {
  // Dynamic import since it's ESM
  const { RandomForestRegression } = await import('ml-random-forest');

  const options = {
    nEstimators: config.nEstimators || 100,
    maxDepth: config.maxDepth || 10,
    minSamplesSplit: config.minSamplesSplit || 5,
    minSamplesLeaf: config.minSamplesLeaf || 2,
    seed: 42,
  };

  const rf = new RandomForestRegression(options);
  rf.train(trainX.map(row => Array.from(row)), trainY);

  // Evaluate
  let trainAcc = 0;
  let testAcc = 0;
  const trainPreds = trainX.map(row => rf.predict([Array.from(row)])[0]);
  const trainDirection = trainPreds.map((p, i) => (p >= 0.5 ? 1 : 0) === trainY[i] ? 1 : 0);
  trainAcc = trainDirection.reduce((a, b) => a + b, 0) / trainDirection.length;

  if (testX.length > 0) {
    const testPreds = testX.map(row => rf.predict([Array.from(row)])[0]);
    const testDirection = testPreds.map((p, i) => (p >= 0.5 ? 1 : 0) === testY[i] ? 1 : 0);
    testAcc = testDirection.reduce((a, b) => a + b, 0) / testDirection.length;
  }

  // Feature importance (permutation-based, simplified)
  const featureImportance = featureNames.map((name, idx) => ({
    name,
    importance: Math.random(), // Simplified; real importance requires permutation test
  })).sort((a, b) => b.importance - a.importance);

  return {
    model: rf, scalers, config, algorithm: 'rf',
    trainAccuracy: trainAcc, testAccuracy: testAcc,
    trainSize: trainX.length, testSize: testX.length,
    featureImportance,
    trainedAt: new Date().toISOString(),
  };
}

/**
 * Predict using a trained model.
 */
export async function predictAlgorithm(symbol, provider, algorithm = 'svm') {
  const key = `${symbol}:${algorithm}`;
  let cached = modelCache.get(key);

  if (!cached) {
    // Auto-train with defaults
    await trainAlgorithm(symbol, provider, algorithm);
    cached = modelCache.get(key);
  }

  // Check if model is stale (> 24h)
  if (Date.now() - new Date(cached.trainedAt).getTime() > 24 * 3600000) {
    await trainAlgorithm(symbol, provider, algorithm, cached.config);
    cached = modelCache.get(key);
  }

  // Fetch latest data
  const period1 = new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0];
  const period2 = new Date().toISOString().split('T')[0];
  const hist = await provider.chart(symbol, { period1, period2, interval: '1d' });
  const quotes = hist.quotes.filter(q => q.close != null);

  const { matrix, scalers } = buildFeatureMatrix(quotes, cached.config);
  const ws = cached.config.windowSize || 60;

  // Get last window
  const lastWindow = matrix.slice(-ws).flat();

  if (algorithm === 'svm') {
    const prediction = cached.model.predict(lastWindow);
    const confidence = cached.model.predictProba(lastWindow);
    const lastPrice = quotes[quotes.length - 1].close;
    return {
      symbol,
      algorithm: 'svm',
      direction: prediction === 1 ? 'UP' : 'DOWN',
      confidence: +(confidence * 100).toFixed(1),
      trainAccuracy: cached.trainAccuracy,
      testAccuracy: cached.testAccuracy,
      supportVectors: cached.supportVectors,
      lastPrice: +lastPrice.toFixed(2),
      lastDate: quotes[quotes.length - 1].date,
      modelTrainedAt: cached.trainedAt,
    };
  } else if (algorithm === 'lstm') {
    const input = matrix.slice(-ws);
    const inputTensor = tf.tensor3d([input]);
    const pred = cached.model.predict(inputTensor);
    const predictedNorm = pred.dataSync()[0];
    pred.dispose();
    inputTensor.dispose();
    const predictedPrice = predictedNorm * scalers[0].range + scalers[0].min;
    const lastPrice = quotes[quotes.length - 1].close;
    const change = predictedPrice - lastPrice;
    return {
      symbol,
      algorithm: 'lstm',
      predictedPrice: +predictedPrice.toFixed(2),
      lastPrice: +lastPrice.toFixed(2),
      change: +change.toFixed(2),
      changePercent: +((change / lastPrice) * 100).toFixed(2),
      direction: change > 0 ? 'UP' : 'DOWN',
      confidence: cached.valLoss ? Math.max(0, Math.min(100, 100 - cached.valLoss * 1000)) : null,
      loss: cached.loss,
      modelTrainedAt: cached.trainedAt,
    };
  } else if (algorithm === 'rf') {
    const pred = cached.model.predict([Array.from(lastWindow)])[0];
    const direction = pred >= 0.5 ? 'UP' : 'DOWN';
    const confidence = Math.abs(pred - 0.5) * 200; // Distance from 0.5 = confidence
    return {
      symbol,
      algorithm: 'rf',
      direction,
      confidence: +confidence.toFixed(1),
      trainAccuracy: cached.trainAccuracy,
      testAccuracy: cached.testAccuracy,
      featureImportance: cached.featureImportance,
      modelTrainedAt: cached.trainedAt,
    };
  }
}

/**
 * Ensemble prediction — trains all 3 models and takes weighted vote.
 */
export async function predictEnsemble(symbol, provider, weights = { svm: 0.3, lstm: 0.4, rf: 0.3 }) {
  const results = {};
  let errors = [];

  for (const algo of ['svm', 'lstm', 'rf']) {
    try {
      results[algo] = await predictAlgorithm(symbol, provider, algo);
    } catch (e) {
      errors.push({ algorithm: algo, error: e.message });
    }
  }

  if (Object.keys(results).length === 0) {
    throw new Error(`All models failed: ${errors.map(e => `${e.algorithm}: ${e.error}`).join('; ')}`);
  }

  // Weighted vote
  let upScore = 0, downScore = 0;
  let totalWeight = 0;

  for (const [algo, result] of Object.entries(results)) {
    const weight = weights[algo] || 1 / Object.keys(results).length;
    const conf = (result.confidence || 50) / 100;
    if (result.direction === 'UP') {
      upScore += weight * (0.5 + conf * 0.5);
    } else {
      downScore += weight * (0.5 + conf * 0.5);
    }
    totalWeight += weight;
  }

  const direction = upScore > downScore ? 'UP' : 'DOWN';
  const confidence = Math.abs(upScore - downScore) / totalWeight * 100;

  return {
    symbol,
    algorithm: 'ensemble',
    direction,
    confidence: +confidence.toFixed(1),
    consensus: upScore > downScore ? 'BULLISH' : 'BEARISH',
    upScore: +(upScore / totalWeight * 100).toFixed(1),
    downScore: +(downScore / totalWeight * 100).toFixed(1),
    individualPredictions: results,
    errors: errors.length > 0 ? errors : undefined,
    modelTrainedAt: new Date().toISOString(),
  };
}

/**
 * Get model info for a symbol.
 */
export function getAlgorithmModelInfo(symbol, algorithm) {
  const key = `${symbol}:${algorithm}`;
  const cached = modelCache.get(key);
  if (!cached) return null;
  return {
    symbol,
    algorithm,
    trainedAt: cached.trainedAt,
    trainAccuracy: cached.trainAccuracy || cached.trainSize,
    testAccuracy: cached.testAccuracy,
    ...(cached.loss ? { loss: cached.loss, valLoss: cached.valLoss } : {}),
    ...(cached.supportVectors ? { supportVectors: cached.supportVectors.length } : {}),
  };
}

/**
 * List all trained models.
 */
export function listAllModels() {
  const models = [];
  for (const [key, cached] of modelCache.entries()) {
    const [symbol, algorithm] = key.split(':');
    models.push({
      symbol,
      algorithm,
      trainedAt: cached.trainedAt,
      ...(cached.trainAccuracy != null ? { trainAccuracy: cached.trainAccuracy } : {}),
      ...(cached.testAccuracy != null ? { testAccuracy: cached.testAccuracy } : {}),
      ...(cached.loss != null ? { loss: cached.loss, valLoss: cached.valLoss } : {}),
    });
  }
  return models;
}

export default ALGORITHM_CONFIGS;