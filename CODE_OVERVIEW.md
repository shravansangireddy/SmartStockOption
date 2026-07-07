# Options Scanner — Code Overview

## What It Is

A real-time options trading scanner with multi-provider market data, deep technical analysis, ML-based predictions, and a watchlist with P/L tracking. Built as a Node.js + Express backend with a React + Vite + Tailwind frontend.

## Architecture

```
options-scanner/
├── server/                          # Express API (port 4000)
│   ├── index.js                     # 2098 lines — Main server, all API routes, DB, watchlist, trades
│   ├── stocker.js                   # 539 lines — Stock screener engine (multi-factor scoring)
│   ├── full-analysis.js             # 656 lines — Deep-dive analysis (Sections A–D, setups)
│   ├── enhanced-analysis.js         # 532 lines — Pine Script port: volume spike, breakout, KNN, trend score
│   ├── predict.js                   # 398 lines — LSTM price prediction (TensorFlow.js)
│   ├── algorithms.js                # 700 lines — Algorithm configuration & training orchestration
│   ├── cache.js                     # 416 lines — In-memory cache with TTL, rate limiting
│   ├── chart-svg.js                # 257 lines — SVG chart generation (SMA overlays, volume)
│   ├── finviz-screener.js          # 164 lines — Finviz HTML scraper (broken → Yahoo fallback)
│   ├── prob15m-endpoint.js         # 184 lines — 15-min probability (Random Forest)
│   ├── sp500.js                     # 102 lines — S&P 500 ticker list
│   ├── providers/
│   │   ├── index.js                 # Provider factory — resolve by name/request
│   │   ├── yahoo.js                 # 272 lines — Yahoo Finance (primary, free)
│   │   ├── public-com.js            # 531 lines — Public.com (options, Greeks, portfolio, bars)
│   │   ├── finnhub.js               # 214 lines — Finnhub (quotes, news, profile)
│   │   └── alphavantage.js          # 324 lines — Alpha Vantage (quotes, history, fundamentals, technicals)
│   └── .env                         # API keys
│
├── client/                          # React + Vite + Tailwind frontend
│   └── src/
│       ├── App.jsx                  # 369 lines — Main app shell, routing, data flow
│       ├── components/
│       │   ├── AnalysisPage.jsx     # 500 lines — Full analysis (Sections A–D)
│       │   ├── ScannerPage.jsx       # 409 lines — Stock screener results page
│       │   ├── StockScanner.jsx     # 357 lines — Scanner UI (presets, filters, table)
│       │   ├── WatchlistDetail.jsx  # 332 lines — Watchlist with P/L tracking
│       │   ├── TradeModal.jsx       # 176 lines — Trade detail modal (Greeks, R/R, DTE)
│       │   ├── SetupCards.jsx        # 163 lines — Quick setup cards
│       │   ├── ChainTable.jsx        # Options chain table
│       │   ├── PriceChart.jsx         # Price chart (Recharts)
│       │   ├── ProbabilityPanel.jsx   # Probability visualization
│       │   ├── AlgorithmConfig.jsx    # ML algorithm configuration
│       │   ├── ActivityFeed.jsx       # News & activity feed
│       │   ├── HeroStatStrip.jsx     # Market stat strip
│       │   ├── NewsPanel.jsx          # News panel
│       │   ├── TickerTape.jsx         # Ticker tape component
│       │   ├── TickerView.jsx         # Single ticker view
│       │   └── Sidebar.jsx            # Navigation sidebar
│       ├── index.css                 # Global styles + CSS variables
│       └── main.jsx                  # Entry point
│
└── README.md                        # User-facing docs
```

**Total: ~7,500 lines of code** (excluding node_modules and build output)

## Data Providers

### Yahoo Finance (`yahoo.js`) — Primary
- **Cost**: Free
- **Capabilities**: Quotes, options chains (with estimated Greeks), price history, market snapshot
- **How it works**: Uses `yahoo-finance2` npm package for structured data
- **Greeks**: Estimated from BSM model (not exchange-reported)

### Public.com (`public-com.js`) — Options Specialist
- **Cost**: Free (requires API key)
- **Capabilities**: Real options chains with **actual Greeks**, portfolio positions, OHLCV bars v2, strategy quotes, account history
- **How it works**: REST API with SSE for streaming quotes, OAuth2-style auth

### Finnhub (`finnhub.js`) — News & Quotes
- **Cost**: Free tier (25 calls/min, limited endpoints)
- **Capabilities**: Quotes, company news, company profile
- **Limitations**: No options chains or candle data on free tier (403)
- **Special handling**: 403 responses caught gracefully with `"Free tier — no access"` message

### Alpha Vantage (`alphavantage.js`) — Fundamentals & Technicals
- **Cost**: Free tier (25 calls/day, 5/min)
- **Capabilities**: Quotes, daily/intraday/weekly/monthly history, news with sentiment, company overview (PE, EPS, market cap, 52w range, analyst targets), 50+ technical indicators, top gainers/losers
- **Limitations**: Options requires premium; severe rate limiting on free tier
- **Provider routes**: `/api/av/overview/:symbol`, `/api/av/technicals/:symbol/:indicator`, `/api/av/gainers-losers`

### Provider Selection
```
?provider=yahoo         → Yahoo Finance (default)
?provider=public        → Public.com
?provider=finnhub       → Finnhub
?provider=alphavantage  → Alpha Vantage (or ?provider=av)
X-Data-Provider: public  → Header-based selection
```

## Key Backend Systems

### 1. Stock Screener (`stocker.js`)

Multi-factor scoring engine that evaluates stocks across 6 dimensions:

| Factor | What It Measures | Data Source |
|--------|----------------|-------------|
| Value | P/E, P/B, P/S, PEG | Yahoo fundamentals |
| Growth | Revenue growth, EPS growth | Yahoo |
| Momentum | RSI, MACD, price vs SMAs | Technical indicators |
| Quality | ROE, debt/equity, margins | Yahoo |
| Stability | Beta, volatility, drawdown | Price history |
| Volume | Relative volume, institutional | Yahoo |

**Presets**: `valueMomentum`, `growthBreakout`, `dividendAristocrats`, `turnaround`, `momentumRip`, `highShortInterest`

### 2. Full Analysis (`full-analysis.js`)

Deep-dive analysis organized in 4 sections:

**Section A: Market Conditions**
- SPY/QQQ trend, VIX level, sector rotation
- Market regime detection (bull/bear/neutral)

**Section B: Technical Analysis**
- Price vs SMA 20/50/200, RSI, MACD, Stochastic, ATR
- Options analysis: IV percentile, ATM spread, volume/OI
- Enhanced signals: volume spike, breakout detection, OM MA crossover, KNN probability
- Pine Script port (13+ factor model)

**Section C: Trade Setups**
- Bull Call Spread, Bear Put Spread, Long Call, Long Put, LEAPS Call
- Each setup includes: direction, strike, entry, delta, DTE, OI, spread quality, stop loss, risk/reward, score
- DTE is computed from the options chain or expiry date

**Section D: News & Catalysts**
- Market news from Finnhub RSS
- Sentiment scoring

### 3. Enhanced Analysis (`enhanced-analysis.js`)

Port of Pine Script "Volume Spike + Breakout Trend Score Pro + Probability KNN MTF v3 + OM MA":

- **Volume Spike Detection**: Volume > 2× average with price confirmation
- **Breakout Detection**: Price breaking above/below SMA bands with volume
- **Bollinger Breakout**: %B indicator for squeeze detection
- **OM MA Crossover**: EMA 8/21 crossover signals (Omkar Maheshwari)
- **KNN Pattern Probability**: k-Nearest Neighbors pattern recognition for directional probability
- **Enhanced Trend Score**: 13+ factor model (SMA alignment, MACD, RSI, Stochastic, ATR, volume, momentum)
- **MTF Trend Alignment**: Multi-timeframe trend consistency (5m/15m/1h/1d)

### 4. ML Prediction System

**LSTM (`predict.js`)**:
- TensorFlow.js-based LSTM neural network
- Trained per-symbol on daily price data
- Predicts next-day price and multi-day forecast
- Configurable: epochs, window size, layers

**Random Forest (`prob15m-endpoint.js`)**:
- 15-minute probability model using `ml-random-forest`
- Features: price momentum, RSI, MACD, Bollinger position, volume ratio
- Output: directional probability (bullish/bearish/neutral)

### 5. Cache System (`cache.js`)

- In-memory TTL cache with per-namespace expiry
- Rate limiting per provider
- Cache warming for frequently accessed symbols
- Auto-invalidation on market hours transitions

### 6. SVG Chart Generation (`chart-svg.js`)

- Server-side SVG rendering (no client dependency)
- SMA overlays (20, 50, 200)
- Volume bars
- Trade reason annotations (buy/sell signals)
- Served at `/api/chart/:symbol.svg`

### 7. Database (SQLite via `better-sqlite3`)

Three tables in `server/scanner.db`:

**watchlist**: Tracked contracts with live P/L
- `id`, `ticker`, `direction`, `strategy`, `strike`, `type`, `premium`, `delta`, `gamma`, `theta`, `iv`, `volume`, `openInterest`, `dte`, `score`, `underlyingPrice`, `addedPrice`, `notes`, `createdAt`
- `currentPrice` and `pnl` computed on GET (not stored)
- `addedPrice` auto-populated from `underlyingPrice` or live quote on add

**trades**: Open/closed trade journal
- Entry/exit prices, P/L, stop loss, targets, notes

**scan_history**: Historical scanner results
- Preset used, tickers scanned, top results, timestamp

Auto-migration on startup adds new columns as needed.

### 8. Finviz Screener (`finviz-screener.js`)

- Originally scraped Finviz.com for stock screening
- **BROKEN**: Finviz moved to React SPA, HTML scraping returns 0 results
- Fallback: `getYahooScreenerList()` uses curated stock lists per preset
- Each result tagged with `source: "yahoo"`, `"finviz"`, or `"public"`

## Frontend Architecture

### Data Flow
```
App.jsx (state management)
  ├─ ScannerPage → StockScanner → fetches /api/stocker/scan
  ├─ AnalysisPage → fetches /api/analysis/full/:symbol
  ├─ WatchlistDetail → fetches /api/watchlist
  ├─ TradeModal → receives contract data, posts to /api/watchlist
  ├─ SetupCards → receives setups from AnalysisPage
  └─ AlgorithmConfig → fetches /api/predict/config
```

### Key UI Components

**StockScanner** (`StockScanner.jsx`):
- Preset selector (6 presets)
- Ticker input with auto-suggest
- Multi-column sortable table (price, change%, volume, RSI, signal, scores)
- "Add to Watchlist" per row → posts to `/api/watchlist`

**AnalysisPage** (`AnalysisPage.jsx`):
- Search bar with symbol input
- Sections A–D rendering
- Setup cards with "Add to Watchlist" button
- Setup table with columns: Dir, Strategy, Time, Expiry, **DTE**, Strike, Δ, Entry, OI, Spread, Reason, Stop, Risk, R:R, Score
- DTE color-coded: 🔴 ≤7d, 🟠 ≤14d, default >14d

**TradeModal** (`TradeModal.jsx`):
- Full contract detail modal
- Header: Ticker, Call/Put strike, **DTE badge** (color-coded), expiration date
- Grid: Premium, Bid, Ask, Mid, Volume, OI, DTE, ITM
- Greeks: Delta, Gamma, Theta, Vega, Rho
- IV bar visualization
- Probability (delta-based), Setup Score
- Risk/Reward: Max Risk, Max Reward, R/R Ratio
- Notes with contextual advice
- "Add to Watchlist" button

**WatchlistDetail** (`WatchlistDetail.jsx`):
- Live P/L tracking with auto-refresh
- `addedPrice` → `currentPrice` P/L calculation
- Falls back to `underlyingPrice` if `addedPrice` is null
- Dollar P/L and percentage P/L display
- Price change indicators

## API Endpoints (Summary)

### Core
- `GET /api/quote/:symbol` — Stock quote
- `GET /api/options/:symbol` — Options chain
- `GET /api/market-snapshot` — Major index prices
- `GET /api/scanner` — Swing scanner
- `GET /api/setups` — Quick setups
- `GET /api/news` — Market news

### Analysis
- `GET /api/analysis/full/:symbol` — Full deep-dive (Sections A–D)
- `GET /api/analysis/correlation` — Correlation matrix
- `GET /api/analysis/iv/:symbol` — IV analysis
- `GET /api/analysis/greeks/:symbol` — Greeks enrichment
- `GET /api/chart/:symbol.svg` — SVG chart

### Stock Screener
- `GET /api/stocker/presets` — List presets
- `GET /api/stocker/scan` — Run screener
- `GET /api/stocker/analyze/:symbol` — Deep analysis

### ML
- `POST /api/predict/train/:symbol` — Train LSTM
- `GET /api/predict/:symbol` — Predict price
- `GET /api/predict/:symbol/forecast` — Multi-day forecast
- `GET /api/predict/models` — List models

### Alpha Vantage (provider-specific)
- `GET /api/av/overview/:symbol` — Company overview
- `GET /api/av/technicals/:symbol/:indicator` — Technical indicators
- `GET /api/av/gainers-losers` — Top movers

### Watchlist & Trades
- `GET /api/watchlist` — Get watchlist (auto-enriched with live prices)
- `POST /api/watchlist` — Add item (auto-fetches price if `addedPrice` missing)
- `DELETE /api/watchlist/:id` — Remove item
- `GET /api/trades` — Get trades
- `POST /api/trades` — Open trade
- `PATCH /api/trades/:id` — Update trade

### System
- `GET /api/provider-status` — Health check all providers
- `GET /api/scanner/history` — Scan history

## Recent Changes (2026-07-07)

1. **Alpha Vantage Integration** — New provider for fundamentals, technicals, news sentiment
2. **DTE in Options & Watchlist** — Added `dte` field to all trade setups; color-coded DTE badges in TradeModal and analysis table
3. **Watchlist Price Fix** — `addedPrice` now auto-populated from `underlyingPrice` or live quote; P/L always shows when price data available
4. **Pine Script Port** — Enhanced analysis with volume spike, breakout, KNN probability, OM MA crossover
5. **Finnhub 403 Fix** — Graceful handling of free-tier limitations; provider status shows correct capabilities

## Known Issues

- **Finviz scraper broken**: React SPA returns empty results. Yahoo fallback works.
- **Alpha Vantage free tier**: 25 calls/day, 5/min — not suitable for real-time scanning
- **Finnhub free tier**: No options chains or candle data (403)
- **SVG chart**: Basic implementation; Recharts on frontend is preferred for interactive charts