import yfinance as yf
import json

tickers = ['NVDA','AMD','AVGO','MU','TSLA','CNC','THR','SEI','^GSPC','^IXIC','^DJI','CL=F','GC=F','BTC-USD','^VIX','ES=F','NQ=F']
results = {}

for t in tickers:
    try:
        tk = yf.Ticker(t)
        hist = tk.history(period='5d')
        if len(hist) >= 2:
            prev = hist['Close'].iloc[-2]
            last = hist['Close'].iloc[-1]
            chg = last - prev
            pct = (chg/prev)*100
            results[t] = {'price': round(last,2), 'change_pct': round(pct,2)}
        else:
            info = tk.fast_info
            results[t] = {'price': round(info.last_price,2), 'change_pct': 0}
    except Exception as e:
        results[t] = {'error': str(e)}

for t, d in results.items():
    if 'error' in d:
        print(f"{t}: ERROR - {d['error']}")
    else:
        print(f"{t}: {d['price']} ({d['change_pct']:+.2f}%)")

# Also check for options expiring soon
import datetime
exp_tickers = ['NVDA','AMD','AVGO','MU','TSLA','CNC','SEI']
today = datetime.date(2026, 5, 15)
cutoff = today + datetime.timedelta(days=5)

print("\n--- OPTIONS EXPIRATIONS ---")
for t in exp_tickers:
    try:
        tk = yf.Ticker(t)
        exps = tk.options
        if exps:
            for exp in exps:
                exp_date = datetime.datetime.strptime(exp, '%Y-%m-%d').date()
                if today <= exp_date <= cutoff:
                    print(f"{t}: EXPIRATION {exp} (within 5 days!)")
            # Show nearest expiration
            nearest = None
            for exp in exps:
                exp_date = datetime.datetime.strptime(exp, '%Y-%m-%d').date()
                if exp_date >= today:
                    nearest = exp
                    break
            if nearest:
                nd = datetime.datetime.strptime(nearest, '%Y-%m-%d').date()
                days_to = (nd - today).days
                print(f"{t}: nearest expiry {nearest} ({days_to} days away)")
    except Exception as e:
        print(f"{t}: options error - {e}")