#!/usr/bin/env python3
"""
Finviz Institutional Transactions screener analysis.
Fetches current data for top candidates and computes scores.
"""
import yfinance as yf
import json
import sys
from datetime import datetime, timedelta

# Top candidates from the Finviz screener sorted by Inst Trans magnitude
# Mix of bullish (positive inst trans) and bearish (negative inst trans)
TICKERS_BULLISH = ["AGL", "UTI", "STAA", "CORZ", "VOYG", "LUNR", "SNDA"]
TICKERS_BEARISH = ["FN", "HPE", "WCC", "AIP", "AVT", "FFIV", "RKLB", "ON", "EXTR", "MTSI", "BWA", "ENPH"]

ALL_TICKERS = TICKERS_BULLISH + TICKERS_BEARISH

def get_data(ticker_str):
    """Fetch current data for all tickers."""
    results = {}
    for t in ticker_str:
        try:
            stk = yf.Ticker(t)
            info = stk.info
            hist = stk.history(period="6mo")
            
            if hist.empty or len(hist) < 20:
                continue
            
            close = hist['Close']
            current = close.iloc[-1]
            
            # Moving averages
            sma_20 = close.rolling(20).mean().iloc[-1]
            sma_50 = close.rolling(50).mean().iloc[-1] if len(close) >= 50 else None
            sma_200 = close.rolling(200).mean().iloc[-1] if len(close) >= 200 else None
            
            # ATR(14)
            high = hist['High']
            low = hist['Low']
            prev_close = close.shift(1)
            tr = pd.concat([
                high - low,
                (high - prev_close).abs(),
                (low - prev_close).abs()
            ], axis=1).max(axis=1)
            atr_14 = tr.rolling(14).mean().iloc[-1]
            
            # RSI(14)
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean().iloc[-1]
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean().iloc[-1]
            rs = gain / loss if loss != 0 else 100
            rsi = 100 - (100 / (1 + rs))
            
            # Volume
            avg_vol = info.get('averageVolume', hist['Volume'].rolling(20).mean().iloc[-1])
            current_vol = info.get('volume', hist['Volume'].iloc[-1])
            
            # MACD
            ema12 = close.ewm(span=12).mean()
            ema26 = close.ewm(span=26).mean()
            macd_line = (ema12 - ema26).iloc[-1]
            macd_signal = (ema12 - ema26).ewm(span=9).mean().iloc[-1]
            
            # Trend quality scoring
            trend_score = 0
            if sma_50 and current > sma_50: trend_score += 2
            if current > sma_20: trend_score += 2
            if sma_50 and sma_20 > sma_50: trend_score += 2
            if sma_200 and current > sma_200: trend_score += 2
            if sma_50 and sma_200 and sma_50 > sma_200: trend_score += 2
            
            # Liquidity scoring
            liq_score = 0
            if avg_vol and avg_vol > 500000: liq_score += 3
            if avg_vol and avg_vol > 1000000: liq_score += 2
            if avg_vol and avg_vol > 3000000: liq_score += 2
            if current_vol and avg_vol and current_vol / avg_vol > 1.2: liq_score += 3
            
            # Market cap scoring
            mcap = info.get('marketCap', 0)
            if mcap > 1e9: liq_score += 1  # $1B+
            if mcap > 10e9: liq_score += 1  # $10B+
            
            results[t] = {
                'price': round(current, 2),
                'change_pct': round(info.get('regularMarketChangePercent', ((close.iloc[-1] - close.iloc[-2]) / close.iloc[-2]) * 100), 2),
                'sma_20': round(sma_20, 2),
                'sma_50': round(sma_50, 2) if sma_50 else None,
                'sma_200': round(sma_200, 2) if sma_200 else None,
                'atr_14': round(atr_14, 2),
                'rsi_14': round(rsi, 1),
                'macd_line': round(macd_line, 4),
                'macd_signal': round(macd_signal, 4),
                'avg_vol': int(avg_vol) if avg_vol else None,
                'current_vol': int(current_vol) if current_vol else None,
                'rel_vol': round(current_vol / avg_vol, 2) if avg_vol and current_vol else None,
                'market_cap': info.get('marketCap'),
                'float_shares': info.get('floatShares'),
                'short_ratio': info.get('shortRatio'),
                'short_pct': info.get('shortPercentOfFloat'),
                'trend_score': trend_score,
                'liq_score': min(liq_score, 10),
                'sector': info.get('sector', 'N/A'),
                'industry': info.get('industry', 'N/A'),
            }
            print(f"  ✓ {t}: ${results[t]['price']} RSI={results[t]['rsi_14']} Trend={trend_score}/10 Liq={results[t]['liq_score']}/10", file=sys.stderr)
        except Exception as e:
            print(f"  ✗ {t}: {e}", file=sys.stderr)
    
    return results

import pandas as pd

if __name__ == "__main__":
    print("Fetching data for screener candidates...", file=sys.stderr)
    data = get_data(ALL_TICKERS)
    print(json.dumps(data, indent=2))