# Options Scanner

Real-time options scanner with multi-provider data, technical analysis, and probability modeling.

## Architecture

```
options-scanner/
├── server/                  # Express API (port 4000)
│   ├── index.js             # Main server — all API endpoints
│   ├── .env                 # API keys (Public.com, Finnhub)
│   ├── scanner.db           # SQLite — watchlist, trades, scan history
│   └── providers/
│       ├── index.js         # Provider factory (resolve by name or request)
│       ├── yahoo.js         # Yahoo Finance (primary, free)
│       ├── public-com.js    # Public.com (options, Greeks, portfolio, bars)
│       └── finnhub.js       # Finnhub (quotes, news)
├── client/                  # React + Vite + Tailwind frontend (port 5173)
│   ├── src/
│   ├── dist/                # Production build
│   └── vite.config.js
├── setup.bat                # Install all prerequisites
└── start.bat                # Launch both servers
```

## Quick Start

### 1. Install prerequisites
```batch
setup.bat
```
This installs Node.js dependencies for both server and client, builds the client, and verifies all modules.

**Requirements:** Node.js v18+ (v20+ recommended), npm v8+

### 2. Start the app
```batch
start.bat
```
- Backend API: http://localhost:4000
- Frontend UI: http://localhost:5173

### 3. Configure API keys
Edit `server/.env`:
```env
PUBLIC_API_KEY=your_public_com_secret_key
FINNHUB_TOKEN=your_finnhub_api_token
```
Defaults work out of the box with the included keys.

## Data Providers

| Provider | Quotes | Options | Greeks | Portfolio | Bars | News |
|----------|--------|---------|--------|-----------|------|------|
| Yahoo Finance | ✅ | ✅ | ❌ (estimated) | ❌ | ✅ | ❌ |
| Public.com | ✅ | ✅ | ✅ (real) | ✅ | ✅ | ❌ |
| Finnhub | ✅ | ✅ | ❌ (estimated) | ❌ | ✅ | ✅ |

Select provider via `?provider=public` query param or `X-Data-Provider: public` header.

## API Endpoints

### Core
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quote/:symbol` | Stock quote |
| GET | `/api/options/:symbol` | Options chain (optional `?expiry=YYYY-MM-DD`) |
| GET | `/api/market-snapshot` | Index prices (SPY, QQQ, IWM, DIA) |
| GET | `/api/scanner` | Swing scanner (top setups across watchlist) |
| GET | `/api/setups` | Quick setups (top 1 call + 1 put per ticker) |
| GET | `/api/news` | Market news (CoinDesk RSS + fallback) |
| GET | `/api/prob15m/:symbol` | 15-min probability (Random Forest model) |

### Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analysis/correlation` | Correlation matrix + stats (`?tickers=SPY,AAPL&period=1y`) |
| GET | `/api/analysis/iv/:symbol` | IV analysis (ATM IV, skew, term structure, HV) |
| GET | `/api/analysis/greeks/:symbol` | Greeks enrichment (uses Public.com for real Greeks) |
| GET | `/api/analysis/full/:symbol` | Full deep-dive analysis (Sections A–D: market conditions, technicals + chart, trade setups, news) |
| GET | `/api/chart/:symbol.svg` | SVG price chart with SMA overlays, volume, and trade reason annotations |

### Stock Screener
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stocker/presets` | List screener presets with Finviz reference URLs |
| GET | `/api/stocker/scan` | Run stock screener (`?preset=valueMomentum&maxStocks=20&tickers=AAPL,MSFT`) |
| GET | `/api/stocker/analyze/:symbol` | Deep stock analysis with multi-factor scoring |

### LSTM Prediction
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/predict/train/:symbol` | Train LSTM model on symbol (`?epochs=50&windowSize=60`) |
| GET | `/api/predict/:symbol` | Predict next day's price |
| GET | `/api/predict/:symbol/forecast` | Multi-day forecast (`?days=5`) |
| GET | `/api/predict/models` | List cached trained models |
| GET | `/api/predict/models/:symbol` | Get model info for symbol |
| GET | `/api/predict/config` | Get LSTM configuration |

### Public.com-Specific
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/public/instruments` | All instruments (`?typeFilter=EQUITY&optionTradingFilter=BUY_AND_SELL`) |
| GET | `/api/public/instruments/:symbol` | Instrument detail (`?type=EQUITY`) |
| GET | `/api/public/bars/:symbol` | OHLCV bars v2 (`?period=YEAR&aggregation=ONE_DAY`) |
| GET | `/api/public/greeks` | Real option Greeks (`?symbols=OSI1,OSI2`) |
| POST | `/api/public/strategy-quote` | Multi-leg strategy quote |
| GET | `/api/public/portfolio` | Account portfolio (positions, equity, buying power) |
| GET | `/api/public/history` | Account history (`?start=2025-01-01&pageSize=50`) |

### Watchlist & Trades (SQLite)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/watchlist` | Get watchlist (auto-enriches with live prices) |
| POST | `/api/watchlist` | Add to watchlist |
| DELETE | `/api/watchlist/:id` | Remove from watchlist |
| GET | `/api/trades` | Get trades (`?status=open`) |
| POST | `/api/trades` | Open trade |
| PATCH | `/api/trades/:id` | Update trade |
| DELETE | `/api/trades/:id` | Delete trade |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/provider-status` | Health check all providers |
| GET | `/api/scanner/history` | Scan history (`?limit=50`) |
| GET | `/api/scanner/debug/:symbol` | Debug pipeline for a symbol |

## Scanner Scoring

Each candidate is scored on a 0–10 scale:

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Trend | 40% | SMA alignment, MACD, RSI, setup quality |
| Liquidity | 30% | OI, volume, bid/ask spread |
| Risk/Reward | 30% | R:R ratio based on ATR stop and delta target |

**Filters:** OI ≥ 10, Delta 0.20–0.90, Spread ≤ 20%

## Technical Indicators

The scanner computes per-symbol:
- **SMA** (20, 50, 200) — Trend alignment
- **RSI** (14) — Overbought/oversold zones
- **MACD** (12/26/9) — Momentum crossover
- **Stochastic** (14) — Mean reversion signals
- **ATR** (14) — Stop loss and target calculation
- **Swing points** — Support/resistance detection

## Provider Factory

```js
import { getProviderByName, getProviderFromRequest } from './providers/index.js';

// Direct access
const yahoo = getProviderByName('yahoo');
const pub = getProviderByName('public');
const finn = getProviderByName('finnhub');

// From request (checks ?provider= and X-Data-Provider header)
app.get('/api/quote/:symbol', async (req, res) => {
  const provider = getProviderFromRequest(req);
  const data = await provider.quote(req.params.symbol);
  res.json(data);
});
```

Each provider implements: `quote`, `marketSnapshot`, `optionsChain`, `chart`, `news`, `healthCheck`.
Public.com also supports: `bars`, `getAllInstruments`, `getInstrument`, `getOptionGreeks`, `getStrategyQuote`, `getPortfolio`, `getHistory`.

## Environment Variables

```env
# server/.env
PUBLIC_API_KEY=       # Public.com secret key (required for Public.com provider)
FINNHUB_TOKEN=        # Finnhub API token (required for Finnhub provider)
PORT=4000             # Server port (default: 4000)
```

## Database

SQLite at `server/scanner.db` with three tables:
- **watchlist** — Tracked contracts with live P&L
- **trades** — Open/closed trade journal
- **scan_history** — Historical scanner results

Auto-migration on startup (adds columns as needed).