#!/usr/bin/env python3
"""Fetch options chains using premarket prices for near-ATM filtering."""
import yfinance as yf
import json
import sys
from datetime import datetime, timedelta

# Key premarket movers with significant setups
TICKERS = ["MU", "NVDA", "INTC", "TSLA", "AMD", "AMAT", "LITE", "SNDK", "MSFT", "AAPL"]

def get_options(tickers):
    results = {}
    for t in tickers:
        try:
            stk = yf.Ticker(t)
            exps = stk.options
            if not exps:
                continue
            
            # Find expiration 30-45 DTE
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
            # Use last close price for ATM filter (premarket may not be available)
            current_price = stk.info.get('regularMarketPrice', stk.info.get('previousClose', 0))
            if current_price == 0:
                hist = stk.history(period="1d")
                current_price = hist['Close'].iloc[-1] if not hist.empty else 100
            
            calls = chain.calls
            puts = chain.puts
            
            result = {'expiration': best_exp, 'current_price': round(current_price, 2), 'calls': [], 'puts': []}
            
            # Calls: wider range for ATM (90%-115% of current)
            near_c = calls[(calls['strike'] >= current_price * 0.85) & (calls['strike'] <= current_price * 1.15)]
            near_c = near_c.sort_values('openInterest', ascending=False).head(6)
            for _, r in near_c.iterrows():
                bid = r.get('bid', 0) or 0
                ask = r.get('ask', 0) or 0
                last = r.get('lastPrice', 0) or 0
                mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
                spread_pct = abs(ask - bid) / mid * 100 if mid > 0 else 999
                result['calls'].append({
                    'strike': r['strike'],
                    'last': round(last, 2),
                    'bid': round(bid, 2),
                    'ask': round(ask, 2),
                    'mid': round(mid, 2),
                    'spread_pct': round(spread_pct, 1),
                    'volume': int(r.get('volume', 0) or 0),
                    'OI': int(r.get('openInterest', 0) or 0),
                    'IV': round(r.get('impliedVolatility', 0) * 100, 1),
                })
            
            # Puts: ATM range (85%-108%)
            near_p = puts[(puts['strike'] >= current_price * 0.85) & (puts['strike'] <= current_price * 1.08)]
            near_p = near_p.sort_values('openInterest', ascending=False).head(6)
            for _, r in near_p.iterrows():
                bid = r.get('bid', 0) or 0
                ask = r.get('ask', 0) or 0
                last = r.get('lastPrice', 0) or 0
                mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
                spread_pct = abs(ask - bid) / mid * 100 if mid > 0 else 999
                result['puts'].append({
                    'strike': r['strike'],
                    'last': round(last, 2),
                    'bid': round(bid, 2),
                    'ask': round(ask, 2),
                    'mid': round(mid, 2),
                    'spread_pct': round(spread_pct, 1),
                    'volume': int(r.get('volume', 0) or 0),
                    'OI': int(r.get('openInterest', 0) or 0),
                    'IV': round(r.get('impliedVolatility', 0) * 100, 1),
                })
            
            results[t] = result
            print(f"  {t}: exp={best_exp} price={current_price:.2f} calls={len(result['calls'])} puts={len(result['puts'])}", file=sys.stderr)
        except Exception as e:
            print(f"  ERR {t}: {e}", file=sys.stderr)
    return results

if __name__ == "__main__":
    data = get_options(TICKERS)
    print(json.dumps(data, indent=2))