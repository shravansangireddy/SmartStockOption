/**
 * SVG Chart Generator for Stock Analysis
 * 
 * Generates professional SVG price charts with:
 * - Candlestick-style area chart with gradient fill
 * - SMA 20/50/200 overlay lines
 * - Volume bars (color-coded green/red)
 * - Trade reason annotations (why price is up/down)
 * - Current price highlight with dashed line
 * - Bollinger Band shading
 */

export function generatePriceChartSVG(quotes, options = {}) {
  const {
    width = 900,
    height = 480,
    symbol = '',
    analysis = null,  // { trend, rsi, sma20, sma50, sma200, bollinger, atr, changePercent, prediction }
  } = options;

  if (!quotes || quotes.length < 2) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 480"><rect width="900" height="480" fill="#0a0e17"/><text x="450" y="240" fill="#94a3b8" text-anchor="middle" font-size="16">No chart data available</text></svg>';

  const closes = quotes.map(q => q.close).filter(c => c != null);
  const volumes = quotes.map(q => q.volume || 0);
  const dates = quotes.map(q => {
    const d = q.date;
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (d instanceof Date) return d.toISOString();
    return String(d);
  });
  const opens = quotes.map(q => q.open ?? q.close);
  const highs = quotes.map(q => q.high ?? q.close);
  const lows = quotes.map(q => q.low ?? q.close);

  if (closes.length < 2) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 480"><rect width="900" height="480" fill="#0a0e17"/><text x="450" y="240" fill="#94a3b8" text-anchor="middle" font-size="16">Insufficient data</text></svg>';

  const pad = { top: 50, right: 70, bottom: 70, left: 75 };
  const volHeight = 50;
  const chartW = width - pad.left - pad.right;
  const priceH = height - pad.top - pad.bottom - volHeight - 20;

  // Compute ranges
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);

  let minPrice = Infinity, maxPrice = -Infinity;
  for (let i = 0; i < closes.length; i++) {
    const lo = Math.min(lows[i], sma20[i] ?? Infinity, sma50[i] ?? Infinity, sma200[i] ?? Infinity);
    const hi = Math.max(highs[i], sma20[i] ?? -Infinity, sma50[i] ?? -Infinity, sma200[i] ?? -Infinity);
    if (lo < minPrice) minPrice = lo;
    if (hi > maxPrice) maxPrice = hi;
  }
  const priceRange = maxPrice - minPrice || 1;
  minPrice -= priceRange * 0.03;
  maxPrice += priceRange * 0.03;
  const fullRange = maxPrice - minPrice;

  const maxVol = Math.max(...volumes) || 1;

  const xScale = (i) => pad.left + (i / (closes.length - 1)) * chartW;
  const yScale = (p) => pad.top + priceH - ((p - minPrice) / fullRange) * priceH;

  // ─── Build SVG ──────────────────────────────────────────────────
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="background:#0a0e17;font-family:Inter,-apple-system,system-ui,sans-serif">`;

  // Defs: gradients
  const lastClose = closes[closes.length - 1];
  const firstClose = closes[0];
  const isUp = lastClose >= firstClose;
  const priceColor = isUp ? '#22c55e' : '#ef4444';
  const priceColorFaded = isUp ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';

  svg += `<defs>
    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${priceColor}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="${priceColor}" stop-opacity="0.01"/>
    </linearGradient>
    <linearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.08"/>
      <stop offset="50%" stop-color="#3b82f6" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.08"/>
    </linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;

  // ─── Header ──────────────────────────────────────────────────────
  const changeAmt = lastClose - firstClose;
  const changePct = ((changeAmt / firstClose) * 100);
  const changeStr = changePct >= 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`;
  const changeIcon = changePct >= 0 ? '▲' : '▼';

  svg += `<text x="${pad.left}" y="24" fill="#e2e8f0" font-size="18" font-weight="700">${symbol}</text>`;
  svg += `<text x="${pad.left + symbol.length * 11 + 15}" y="24" fill="${priceColor}" font-size="16" font-weight="600">$${lastClose.toFixed(2)}</text>`;
  svg += `<text x="${pad.left + symbol.length * 11 + 15 + 90}" y="24" fill="${priceColor}" font-size="13">${changeIcon} ${changeStr}</text>`;

  // Date range
  const startDate = dates[0] ? String(dates[0]).substring(0, 10) : '';
  const endDate = dates[dates.length - 1] ? String(dates[dates.length - 1]).substring(0, 10) : '';
  svg += `<text x="${width - pad.right}" y="24" fill="#64748b" font-size="11" text-anchor="end">${startDate} → ${endDate}</text>`;

  // ─── Grid lines ─────────────────────────────────────────────────
  const gridLines = 6;
  for (let i = 0; i <= gridLines; i++) {
    const price = minPrice + (fullRange * i / gridLines);
    const y = yScale(price);
    svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1e293b" stroke-width="0.5"/>`;
    svg += `<text x="${width - pad.right + 5}" y="${y + 4}" fill="#64748b" font-size="10" font-weight="500">$${price.toFixed(0)}</text>`;
  }

  // ─── Bollinger Band shading ─────────────────────────────────────
  if (analysis?.bollinger && analysis.bollinger.upper && analysis.bollinger.lower) {
    // Simple approximation using recent data points
    const bbUpper = analysis.bollinger.upper;
    const bbLower = analysis.bollinger.lower;
    const bbY1 = yScale(bbUpper);
    const bbY2 = yScale(bbLower);
    svg += `<rect x="${pad.left}" y="${bbY1}" width="${chartW}" height="${bbY2 - bbY1}" fill="url(#bbGrad)" rx="4"/>`;
    svg += `<line x1="${pad.left}" y1="${bbY1}" x2="${pad.left + chartW}" y2="${bbY1}" stroke="#3b82f6" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.4"/>`;
    svg += `<line x1="${pad.left}" y1="${bbY2}" x2="${pad.left + chartW}" y2="${bbY2}" stroke="#3b82f6" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.4"/>`;
    svg += `<text x="${width - pad.right + 5}" y="${bbY1 + 4}" fill="#3b82f6" font-size="9" opacity="0.6">BB↑</text>`;
    svg += `<text x="${width - pad.right + 5}" y="${bbY2 + 4}" fill="#3b82f6" font-size="9" opacity="0.6">BB↓</text>`;
  }

  // ─── Volume bars ────────────────────────────────────────────────
  const volTop = pad.top + priceH + 15;
  const volBottom = volTop + volHeight;
  const barW = Math.max(1, chartW / closes.length - 0.5);
  for (let i = 0; i < volumes.length; i++) {
    const barH = (volumes[i] / maxVol) * volHeight;
    const isUpDay = i > 0 ? closes[i] >= closes[i - 1] : true;
    const color = isUpDay ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
    svg += `<rect x="${xScale(i) - barW / 2}" y="${volBottom - barH}" width="${barW}" height="${barH}" fill="${color}"/>`;
  }
  // Volume label
  svg += `<text x="${pad.left}" y="${volTop - 3}" fill="#475569" font-size="9">VOL</text>`;
  svg += `<text x="${width - pad.right}" y="${volTop - 3}" fill="#475569" font-size="9" text-anchor="end">${(maxVol / 1e6).toFixed(0)}M</text>`;

  // ─── SMA lines ─────────────────────────────────────────────────
  // SMA 200
  let sma200Path = '';
  for (let i = 0; i < sma200.length; i++) {
    if (sma200[i] == null) continue;
    sma200Path += (sma200Path === '' ? 'M' : 'L') + `${xScale(i).toFixed(1)},${yScale(sma200[i]).toFixed(1)}`;
  }
  if (sma200Path) svg += `<path d="${sma200Path}" fill="none" stroke="#a855f7" stroke-width="1.5" opacity="0.7"/>`;

  // SMA 50
  let sma50Path = '';
  for (let i = 0; i < sma50.length; i++) {
    if (sma50[i] == null) continue;
    sma50Path += (sma50Path === '' ? 'M' : 'L') + `${xScale(i).toFixed(1)},${yScale(sma50[i]).toFixed(1)}`;
  }
  if (sma50Path) svg += `<path d="${sma50Path}" fill="none" stroke="#f59e0b" stroke-width="1.5" opacity="0.7"/>`;

  // SMA 20
  let sma20Path = '';
  for (let i = 0; i < sma20.length; i++) {
    if (sma20[i] == null) continue;
    sma20Path += (sma20Path === '' ? 'M' : 'L') + `${xScale(i).toFixed(1)},${yScale(sma20[i]).toFixed(1)}`;
  }
  if (sma20Path) svg += `<path d="${sma20Path}" fill="none" stroke="#06b6d4" stroke-width="1.5" opacity="0.8"/>`;

  // ─── Area fill under price ───────────────────────────────────────
  let areaPath = '';
  let pricePath = '';
  for (let i = 0; i < closes.length; i++) {
    const cmd = i === 0 ? 'M' : 'L';
    pricePath += `${cmd}${xScale(i).toFixed(1)},${yScale(closes[i]).toFixed(1)}`;
  }
  areaPath = pricePath + `L${xScale(closes.length - 1).toFixed(1)},${yScale(minPrice).toFixed(1)}L${xScale(0).toFixed(1)},${yScale(minPrice).toFixed(1)}Z`;
  svg += `<path d="${areaPath}" fill="url(#areaGrad)"/>`;

  // ─── Price line ──────────────────────────────────────────────────
  svg += `<path d="${pricePath}" fill="none" stroke="${priceColor}" stroke-width="2.5" filter="url(#glow)"/>`;

  // ─── Current price horizontal line ───────────────────────────────
  const currentY = yScale(lastClose);
  svg += `<line x1="${pad.left}" y1="${currentY}" x2="${width - pad.right}" y2="${currentY}" stroke="${priceColor}" stroke-width="1" stroke-dasharray="6,3" opacity="0.5"/>`;
  // Price tag
  svg += `<rect x="${width - pad.right + 2}" y="${currentY - 11}" width="55" height="22" rx="4" fill="${priceColor}"/>`;
  svg += `<text x="${width - pad.right + 29}" y="${currentY + 4}" fill="#000" font-size="11" font-weight="700" text-anchor="middle">$${lastClose.toFixed(2)}</text>`;

  // ─── Key support/resistance annotations ──────────────────────────
  if (analysis) {
    const annotations = [];
    if (analysis.sma20) annotations.push({ price: analysis.sma20, label: 'SMA20', color: '#06b6d4' });
    if (analysis.sma50) annotations.push({ price: analysis.sma50, label: 'SMA50', color: '#f59e0b' });
    if (analysis.sma200) annotations.push({ price: analysis.sma200, label: 'SMA200', color: '#a855f7' });
    if (analysis.high52w) annotations.push({ price: analysis.high52w, label: '52W High', color: '#ef4444' });
    if (analysis.low52w) annotations.push({ price: analysis.low52w, label: '52W Low', color: '#22c55e' });

    for (const ann of annotations) {
      const y = yScale(ann.price);
      if (y > pad.top && y < pad.top + priceH) {
        svg += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + 60}" y2="${y}" stroke="${ann.color}" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>`;
        svg += `<text x="${pad.left + 3}" y="${y - 4}" fill="${ann.color}" font-size="9" font-weight="600">${ann.label} $${ann.price.toFixed(0)}</text>`;
      }
    }
  }

  // ─── Date labels ────────────────────────────────────────────────
  const dateInterval = Math.max(1, Math.floor(closes.length / 7));
  for (let i = 0; i < closes.length; i += dateInterval) {
    const x = xScale(i);
    const dateStr = dates[i] ? String(dates[i]).substring(5, 10) : ''; // MM-DD
    svg += `<text x="${x}" y="${volBottom + 14}" fill="#64748b" font-size="9" text-anchor="middle">${dateStr}</text>`;
  }

  // ─── Trade Reason Annotation Box ────────────────────────────────
  if (analysis) {
    const reasons = [];
    const pctRaw = analysis.changePercent;
    const pct = typeof pctRaw === 'string' ? parseFloat(pctRaw) : pctRaw;
    const rsi = analysis.rsi;
    const trend = analysis.trend || '';
    const predDir = analysis.prediction?.direction;

    // Why is price moving?
    if (pct != null && !isNaN(pct)) {
      if (pct > 2) reasons.push(`Strong buying pressure (+${pct.toFixed(1)}%)`);
      else if (pct > 0.5) reasons.push(`Moderate buying (+${pct.toFixed(1)}%)`);
      else if (pct < -2) reasons.push(`Selling pressure (${pct.toFixed(1)}%)`);
      else if (pct < -0.5) reasons.push(`Mild selling (${pct.toFixed(1)}%)`);
      else reasons.push(`Consolidation (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`);
    }

    if (trend.includes('Uptrend') || trend.includes('Bullish')) {
      reasons.push('Above key SMAs → bullish structure');
      if (analysis.sma50 > analysis.sma200) reasons.push('Golden cross (SMA50 > SMA200)');
    } else if (trend.includes('Downtrend') || trend.includes('Bearish')) {
      reasons.push('Below key SMAs → bearish structure');
      if (analysis.sma50 < analysis.sma200) reasons.push('Death cross (SMA50 < SMA200)');
    }

    if (rsi > 70) reasons.push('RSI overbought → potential reversal');
    else if (rsi < 30) reasons.push('RSI oversold → potential bounce');
    else if (rsi > 55) reasons.push('RSI bullish momentum');
    else if (rsi < 45) reasons.push('RSI bearish momentum');

    if (predDir === 'UP') reasons.push(`LSTM predicts UP ${analysis.prediction.changePercent > 0 ? '+' : ''}${typeof analysis.prediction.changePercent === 'number' ? analysis.prediction.changePercent.toFixed(2) : analysis.prediction.changePercent}%`);
    else if (predDir === 'DOWN') reasons.push(`LSTM predicts DOWN ${typeof analysis.prediction.changePercent === 'number' ? analysis.prediction.changePercent.toFixed(2) : analysis.prediction.changePercent}%`);

    if (analysis.bollinger?.percentB != null) {
      if (analysis.bollinger.percentB > 80) reasons.push('Near upper BB → overextended');
      else if (analysis.bollinger.percentB < 20) reasons.push('Near lower BB → oversold');
    }

    if (analysis.relativeVolume > 2) reasons.push(`High rel. volume (${analysis.relativeVolume.toFixed(1)}x)`);

    // Draw annotation box
    const boxX = pad.left + 5;
    const boxY = pad.top + 8;
    const lineHeight = 14;
    const boxWidth = Math.min(reasons.length > 0 ? 320 : 0, 350);
    const boxHeight = Math.min(reasons.length, 4) * lineHeight + 16;

    if (reasons.length > 0) {
      svg += `<rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="rgba(15,23,42,0.85)" stroke="#1e293b" stroke-width="1"/>`;
      svg += `<text x="${boxX + 8}" y="${boxY + 14}" fill="#e2e8f0" font-size="10" font-weight="700">📈 Price Action:</text>`;
      for (let i = 0; i < Math.min(reasons.length, 4); i++) {
        svg += `<text x="${boxX + 12}" y="${boxY + 28 + i * lineHeight}" fill="#94a3b8" font-size="9.5">• ${reasons[i]}</text>`;
      }
    }
  }

  // ─── Legend ──────────────────────────────────────────────────────
  const legendY = height - 18;
  const legendItems = [
    { label: 'Price', color: priceColor, dash: '' },
    { label: 'SMA20', color: '#06b6d4', dash: '' },
    { label: 'SMA50', color: '#f59e0b', dash: '' },
    { label: 'SMA200', color: '#a855f7', dash: '' },
  ];
  let legendX = pad.left;
  for (const item of legendItems) {
    svg += `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 18}" y2="${legendY}" stroke="${item.color}" stroke-width="2"/>`;
    svg += `<text x="${legendX + 22}" y="${legendY + 4}" fill="#94a3b8" font-size="9.5">${item.label}</text>`;
    legendX += item.label.length * 6 + 35;
  }

  svg += `</svg>`;
  return svg;
}

function computeSMA(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    const slice = arr.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

export default { generatePriceChartSVG };