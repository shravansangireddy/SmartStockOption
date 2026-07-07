#!/usr/bin/env python3
"""Fetch premarket mover data + options chains for tradeable names."""
import yfinance as yf
import json
import sys
from datetime import datetime, timedelta

# From premarket movers - filtering for tradeable names (>$5, real volume)
# Gainers: HCWB, AUUD, SLE, GEMI, PIII - mostly micro-caps, skip
# Active big names: MU, NVDA, INTC, TSLA, AMD, MSFT, AAPL, LITE, SNDK
# From CNBC: AMAT, INTC, MICC (Magnum Ice Cream)
# From Finviz screener overlap: RKLB, ENPH, HPE, ON, BWA, CORZ

TICKERS = ["MU", "NVDA", "INTC", "TSLA", "AMD", "AMAT", "LITE", "SNDK", "GEMI", "MSFT", "AAPL"]

def get_quotes(tickers):
    results = {}
    for t in tickers:
        try:
            stk = yf.Ticker(t)
            info = stk.info
            hist = stk.history(period="6mo")
            if hist.empty or len(hist) < 20:
                continue
            close = hist['Close']
            current = close.iloc[-1]
            sma_20 = close.rolling(20).mean().iloc[-1]
            sma_50 = close.rolling(50).mean().iloc[-1] if len(close) >= 50 else None
            
            # ATR
            high = hist['High']
            low = hist['Low']
            prev_close = close.shift(1)
            import pandas as pd
            tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
            atr_14 = tr.rolling(14).mean().iloc[-1]
            
            # RSI
            delta = close.diff()
            gain = delta.where(delta > 0, 0).rolling(14).mean().iloc[-1]
            loss = (-delta.where(delta < 0, 0)).rolling(14).mean().iloc[-1]
            rs = gain / loss if loss != 0 else 100
            rsi = 100 - (100 / (1 + rs))
            
            # MACD
            ema12 = close.ewm(span=12).mean()
            ema26 = close.ewm(span=26).mean()
            macd_line = (ema12 - ema26).iloc[-1]
            macd_signal = (ema12 - ema26).ewm(span=9).mean().iloc[-1]
            
            avg_vol = info.get('averageVolume', hist['Volume'].rolling(20).mean().iloc[-1])
            current_vol = info.get('volume', hist['Volume'].iloc[-1])
            
            results[t] = {
                'price': round(current, 2),
                'sma_20': round(sma_20, 2),
                'sma_50': round(sma_50, 2) if sma_50 else None,
                'atr_14': round(atr_14, 2),
                'rsi_14': round(rsi, 1),
                'macd_line': round(macd_line, 4),
                'macd_signal': round(macd_signal, 4),
                'avg_vol': int(avg_vol) if avg_vol else None,
                'current_vol': int(current_vol) if current_vol else None,
                'market_cap': info.get('marketCap'),
                'float_shares': info.get('floatShares'),
                'short_ratio': info.get('shortRatio'),
                'short_pct': info.get('shortPercentOfFloat'),
                'sector': info.get('sector', 'N/A'),
                'industry': info.get('industry', 'N/A'),
                'premarket_change_pct': info.get('preMarketChangePercent', info.get('regularMarketChangePercent', None)),
                'premarket_price': info.get('preMarketPrice', info.get('regularMarketPrice', None)),
            }
            print(f"  OK {t}: ${results[t]['price']} RSI={results[t]['rsi_14']}", file=sys.stderr)
        except Exception as e:
            print(f"  ERR {t}: {e}", file=sys.stderr)
    return results

def get_options(tickers):
    results = {}
    for t in tickers:
        try:
            stk = yf.Ticker(t)
            exps = stk.options
            if not exps:
                continue
            
            # Find expiration ~30-45 DTE
            target_min = datetime.now() + timedelta(days=25)
            target_max = datetime.now() + timedelta(days=50)
            best_exp = None
            for e in exps:
                exp_date = datetime.strptime(e, "%Y-%m-%d")
                if target_min <= exp_date <= target_max:
                    best_exp = e
                    break
            if not best_exp:
                target = datetime.now() + timedelta(days=37)
                best_exp = min(exps, key=lambda x: abs((datetime.strptime(x, "%Y-%m-%d") - target).days))
            
            chain = stk.option_chain(best_exp)
            current_price = stk.fast_info.get('last_price', 0) if hasattr(stk, 'fast_info') else stk.info.get('regularMarketPrice', 0)
            
            calls = chain.calls
            puts = chain.puts
            
            result = {'expiration': best_exp, 'current_price': round(current_price, 2), 'calls': [], 'puts': []}
            
            # Calls near ATM (within 5-10%)
            near_c = calls[(calls['strike'] >= current_price * 0.92) & (calls['strike'] <= current_price * 1.12)]
            near_c = near_c.sort_values('openInterest', ascending=False).head(5)
            for _, r in near_c.iterrows():
                mid = (r.get('bid', 0) + r.get('ask', 0)) / 2 if r.get('bid', 0) > 0 and r.get('ask', 0) > 0 else r.get('lastPrice', 0)
                spread_pct = abs(r.get('ask', 0) - r.get('bid', 0)) / mid * 100 if mid > 0 else 999
                result['calls'].append({
                    'strike': r['strike'],
                    'last': round(r.get('lastPrice', 0), 2),
                    'bid': round(r.get('bid', 0), 2),
                    'ask': round(r.get('ask', 0), 2),
                    'mid': round(mid, 2),
                    'spread_pct': round(spread_pct, 1),
                    'volume': int(r.get('volume', 0) or 0),
                    'OI': int(r.get('openInterest', 0) or 0),
                    'IV': round(r.get('impliedVolatility', 0) * 100, 1),
                })
            
            # Puts near ATM (within 5-10% below)
            near_p = puts[(puts['strike'] >= current_price * 0.88) & (puts['strike'] <= current_price * 1.08)]
            near_p = near_p.sort_values('openInterest', ascending=False).head(5)
            for _, r in near_p.iterrows():
                mid = (r.get('bid', 0) + r.get('ask', 0)) / 2 if r.get('bid', 0) > 0 and r.get('ask', 0) > 0 else r.get('lastPrice', 0)
                spread_pct = abs(r.get('ask', 0) - r.get('bid', 0)) / mid * 100 if mid > 0 else 999
                result['puts'].append({
                    'strike': r['strike'],
                    'last': round(r.get('lastPrice', 0), 2),
                    'bid': round(r.get('bid', 0), 2),
                    'ask': round(r.get('ask', 0), 2),
                    'mid': round(mid, 2),
                    'spread_pct': round(spread_pct, 1),
                    'volume': int(r.get('volume', 0) or 0),
                    'OI': int(r.get('openInterest', 0) or 0),
                    'IV': round(r.get('impliedVolatility', 0) * 100, 1),
                })
            
            results[t] = result
            print(f"  OPT {t}: exp={best_exp} calls={len(result['calls'])} puts={len(result['puts'])}", file=sys.stderr)
        except Exception as e:
            print(f"  OPT ERR {t}: {e}", file=sys.stderr)
    return results

if __name__ == "__main__":
    print("=== QUOTES ===", file=sys.stderr)
    quotes = get_quotes(TICKERS)
    print("=== OPTIONS ===", file=sys.stderr)
    options = get_options(TICKERS)
    print(json.dumps({'quotes': quotes, 'options': options}, indent=2))