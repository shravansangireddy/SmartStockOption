#!/usr/bin/env python3
"""Fetch all market data for daily options trading summary."""
import yfinance as yf
import json
from datetime import datetime, timedelta

# === TICKERS ===
core_tickers = ['NVDA','AMD','AVGO','MU','TSLA']
finviz_tickers = ['CNC','THR','SEI','AXGN','UNH','NUE','EQR']
index_tickers = ['SPY','QQQ','IWM','^VIX']
all_tickers = core_tickers + finviz_tickers + index_tickers

results = {
    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'indices': {},
    'core_holdings': {},
    'finviz_stocks': {},
    'leaps_options': {},
    'swing_options': {},
}

# === 1. Index / Market Context ===
for t in index_tickers:
    try:
        stk = yf.Ticker(t)
        info = stk.info
        hist = stk.history(period='5d')
        results['indices'][t] = {
            'price': round(info.get('regularMarketPrice', info.get('previousClose', 0)), 2),
            'prev_close': round(info.get('previousClose', 0), 2),
            'change_pct': round((info.get('regularMarketPrice', info.get('previousClose', 1)) / info.get('previousClose', 1) - 1) * 100, 2) if info.get('previousClose') else 0,
            '5d_close': [round(x, 2) for x in hist['Close'].tolist()] if not hist.empty else [],
        }
    except Exception as e:
        results['indices'][t] = {'error': str(e)}

# === 2. Core Holdings Data ===
for t in core_tickers:
    try:
        stk = yf.Ticker(t)
        info = stk.info
        results['core_holdings'][t] = {
            'price': round(info.get('regularMarketPrice', info.get('previousClose', 0)), 2),
            'prev_close': round(info.get('previousClose', 0), 2),
            'market_cap': info.get('marketCap', 0),
            'pe': info.get('trailingPE', None),
            'forward_pe': info.get('forwardPE', None),
            'eps': info.get('trailingEps', None),
            '52wk_high': round(info.get('fiftyTwoWeekHigh', 0), 2),
            '52wk_low': round(info.get('fiftyTwoWeekLow', 0), 2),
            'beta': info.get('beta', None),
            'short_ratio': info.get('shortRatio', None),
            'avg_volume': info.get('averageVolume', 0),
        }
    except Exception as e:
        results['core_holdings'][t] = {'error': str(e)}

# === 3. Finviz Screener Stocks ===
for t in finviz_tickers:
    try:
        stk = yf.Ticker(t)
        info = stk.info
        results['finviz_stocks'][t] = {
            'price': round(info.get('regularMarketPrice', info.get('previousClose', 0)), 2),
            'prev_close': round(info.get('previousClose', 0), 2),
            'market_cap': info.get('marketCap', 0),
            'pe': info.get('trailingPE', None),
            'forward_pe': info.get('forwardPE', None),
            '52wk_high': round(info.get('fiftyTwoWeekHigh', 0), 2),
            '52wk_low': round(info.get('fiftyTwoWeekLow', 0), 2),
            'avg_volume': info.get('averageVolume', 0),
            'beta': info.get('beta', None),
            'short_ratio': info.get('shortRatio', None),
        }
    except Exception as e:
        results['finviz_stocks'][t] = {'error': str(e)}

# === 4. LEAPS Options (Jan 2027+) for Core Tickers ===
for t in core_tickers:
    try:
        stk = yf.Ticker(t)
        exps = stk.options
        if not exps:
            continue
        leaps_exp = None
        for e in exps:
            if e >= '2027-01-01':
                leaps_exp = e
                break
        if not leaps_exp:
            leaps_exp = max(exps)
        
        current_price = stk.info.get('regularMarketPrice', stk.info.get('previousClose', 100))
        chain = stk.option_chain(leaps_exp)
        calls = chain.calls
        
        atm_calls = calls[(calls['strike'] >= current_price * 0.95) & (calls['strike'] <= current_price * 1.10)]
        atm_calls = atm_calls.sort_values('openInterest', ascending=False).head(5)
        
        result = {
            'price': current_price,
            'leaps_exp': leaps_exp,
            'atm_calls': []
        }
        for _, r in atm_calls.iterrows():
            result['atm_calls'].append({
                'strike': r['strike'],
                'lastPrice': round(r.get('lastPrice', 0), 2),
                'bid': round(r.get('bid', 0), 2),
                'ask': round(r.get('ask', 0), 2),
                'volume': int(r.get('volume', 0) or 0),
                'openInterest': int(r.get('openInterest', 0) or 0),
                'impliedVolatility': round(r.get('impliedVolatility', 0), 4),
            })
        results['leaps_options'][t] = result
    except Exception as e:
        results['leaps_options'][t] = {'error': str(e)}

# === 5. Swing Options (30-45 DTE) for Finviz Tickers ===
for t in finviz_tickers:
    try:
        stk = yf.Ticker(t)
        exps = stk.options
        if not exps:
            results['swing_options'][t] = {'error': 'no options'}
            continue
        
        current_price = stk.info.get('regularMarketPrice', stk.info.get('previousClose', 0))
        
        target_min = datetime.now() + timedelta(days=25)
        target_max = datetime.now() + timedelta(days=50)
        best_exp = None
        for e in exps:
            exp_date = datetime.strptime(e, '%Y-%m-%d')
            if target_min <= exp_date <= target_max:
                best_exp = e
                break
        if not best_exp:
            target = datetime.now() + timedelta(days=37)
            best_exp = min(exps, key=lambda x: abs((datetime.strptime(x, '%Y-%m-%d') - target).days))
        
        chain = stk.option_chain(best_exp)
        calls = chain.calls
        puts = chain.puts
        
        near_c = calls[(calls['strike'] >= current_price * 0.90) & (calls['strike'] <= current_price * 1.15)]
        near_c = near_c.sort_values('openInterest', ascending=False).head(4)
        
        near_p = puts[(puts['strike'] >= current_price * 0.85) & (puts['strike'] <= current_price * 1.05)]
        near_p = near_p.sort_values('openInterest', ascending=False).head(4)
        
        results['swing_options'][t] = {
            'price': round(current_price, 2),
            'expiration': best_exp,
            'calls': [],
            'puts': [],
        }
        for _, r in near_c.iterrows():
            results['swing_options'][t]['calls'].append({
                'strike': r['strike'],
                'lastPrice': round(r.get('lastPrice', 0), 2),
                'bid': round(r.get('bid', 0), 2),
                'ask': round(r.get('ask', 0), 2),
                'volume': int(r.get('volume', 0) or 0),
                'openInterest': int(r.get('openInterest', 0) or 0),
                'impliedVolatility': round(r.get('impliedVolatility', 0), 4),
            })
        for _, r in near_p.iterrows():
            results['swing_options'][t]['puts'].append({
                'strike': r['strike'],
                'lastPrice': round(r.get('lastPrice', 0), 2),
                'bid': round(r.get('bid', 0), 2),
                'ask': round(r.get('ask', 0), 2),
                'volume': int(r.get('volume', 0) or 0),
                'openInterest': int(r.get('openInterest', 0) or 0),
                'impliedVolatility': round(r.get('impliedVolatility', 0), 4),
            })
    except Exception as e:
        results['swing_options'][t] = {'error': str(e)}

print(json.dumps(results, indent=2))