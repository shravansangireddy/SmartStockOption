#!/usr/bin/env python3
"""Fetch options chain data for top screener candidates."""
import yfinance as yf
import json
from datetime import datetime, timedelta

TICKERS = ["CORZ", "HPE", "ON", "BWA", "MTSI", "EXTR", "RKLB", "ENPH", "LUNR", "STAA", "VOYG", "FFIV", "AIP"]

def get_options(ticker_str):
    results = {}
    for t in TICKERS:
        try:
            stk = yf.Ticker(t)
            exps = stk.options
            if not exps:
                continue
            
            # Find next expiration 30-45 days out
            target_min = datetime.now() + timedelta(days=25)
            target_max = datetime.now() + timedelta(days=50)
            
            best_exp = None
            for e in exps:
                exp_date = datetime.strptime(e, "%Y-%m-%d")
                if target_min <= exp_date <= target_max:
                    best_exp = e
                    break
            
            # Fallback: closest to 37 days
            if not best_exp:
                target = datetime.now() + timedelta(days=37)
                best_exp = min(exps, key=lambda x: abs((datetime.strptime(x, "%Y-%m-%d") - target).days))
            
            chain = stk.option_chain(best_exp)
            calls = chain.calls
            puts = chain.puts
            
            current_price = stk.fast_info['last_price'] if hasattr(stk, 'fast_info') else stk.info.get('regularMarketPrice', 0)
            
            # For bullish: find ATM/slightly ITM calls (delta 0.50-0.80)
            # For bearish: find ATM/slightly ITM puts (delta 0.50-0.80)
            # Use impliedVolatility and openInterest as proxies
            
            result = {
                'expiration': best_exp,
                'current_price': round(current_price, 2),
                'calls_sample': [],
                'puts_sample': [],
            }
            
            # Sample top calls by OI near ATM
            near_strikes_c = calls[(calls['strike'] >= current_price * 0.90) & (calls['strike'] <= current_price * 1.15)]
            near_strikes_c = near_strikes_c.sort_values('openInterest', ascending=False).head(5)
            for _, row in near_strikes_c.iterrows():
                result['calls_sample'].append({
                    'strike': row['strike'],
                    'lastPrice': round(row.get('lastPrice', 0), 2),
                    'bid': round(row.get('bid', 0), 2),
                    'ask': round(row.get('ask', 0), 2),
                    'volume': int(row.get('volume', 0) or 0),
                    'openInterest': int(row.get('openInterest', 0) or 0),
                    'impliedVolatility': round(row.get('impliedVolatility', 0) * 100, 1),
                    'contractSymbol': str(row.get('contractSymbol', '')),
                })
            
            # Sample top puts by OI near ATM
            near_strikes_p = puts[(puts['strike'] >= current_price * 0.85) & (puts['strike'] <= current_price * 1.10)]
            near_strikes_p = near_strikes_p.sort_values('openInterest', ascending=False).head(5)
            for _, row in near_strikes_p.iterrows():
                result['puts_sample'].append({
                    'strike': row['strike'],
                    'lastPrice': round(row.get('lastPrice', 0), 2),
                    'bid': round(row.get('bid', 0), 2),
                    'ask': round(row.get('ask', 0), 2),
                    'volume': int(row.get('volume', 0) or 0),
                    'openInterest': int(row.get('openInterest', 0) or 0),
                    'impliedVolatility': round(row.get('impliedVolatility', 0) * 100, 1),
                    'contractSymbol': str(row.get('contractSymbol', '')),
                })
            
            results[t] = result
            print(f"  OK {t}: exp={best_exp} calls={len(result['calls_sample'])} puts={len(result['puts_sample'])}", flush=True)
        except Exception as e:
            print(f"  ERR {t}: {e}", flush=True)
    
    return results

if __name__ == "__main__":
    print("Fetching options chains...", flush=True)
    data = get_options(TICKERS)
    print(json.dumps(data, indent=2))