/**
 * S&P 500 Tickers List
 * 
 * Complete list of S&P 500 constituent stocks as of 2025.
 * Used by the Options Scanner as the default universe when no custom tickers are specified.
 * 
 * Source: Standard & Poor's official index constituents
 */

export const SP500_TICKERS = [
  // ─── Top 10 ETFs (most traded, liquid options) ───────────────
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'XLK', 'XLF', 'XLE', 'VWO',

  // ─── Technology ────────────────────────────────────────────────
  'AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'AMD', 'ADBE', 'INTC', 'CSCO',
  'QCOM', 'TXN', 'IBM', 'NOW', 'INTU', 'AMAT', 'MU', 'LRCX', 'KLAC', 'MRVL',
  'SNPS', 'CDNS', 'FTNT', 'PANW', 'CRWD', 'MCHP', 'MPWR', 'ON', 'SWKS', 'ZS',
  'DDOG', 'NET', 'MDB', 'PLTR', 'SHOP', 'COIN', 'UBER', 'SNAP', 'SQ', 'PATH',
  'ANET', 'FSLR', 'MNST', 'VEEV', 'ZI', 'GDDY', 'AKAM', 'FFIV',

  // ─── Communications ───────────────────────────────────────────
  'META', 'GOOGL', 'GOOG', 'DIS', 'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS', 'WBD',
  'PARA', 'EA', 'TTWO', 'NWSA', 'FOX', 'OMC', 'IPG',

  // ─── Consumer Discretionary ──────────────────────────────────
  'AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TGT', 'BKNG', 'ABNB',
  'CMG', 'LULU', 'YUM', 'MAR', 'ROST', 'TJX', 'DLTR', 'BBY', 'ETSY', 'RCL',
  'CCL', 'NCLH', 'HAS', 'MAT', 'LEN', 'DHI', 'TSLA', 'POOL', 'ULTA', 'BURL',
  'AZO', 'ORLY', 'AAP', 'EBAY', 'WHR', 'MHK',

  // ─── Consumer Staples ─────────────────────────────────────────
  'PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'EL', 'CL', 'KMB',
  'GIS', 'MDLZ', 'HSY', 'K', 'STZ', 'SJM', 'CLX', 'CHD', 'BIO',
  'CL', 'CAG', 'HRL', 'CPB', 'SYY', 'TAP',

  // ─── Energy ───────────────────────────────────────────────────
  'XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'VLO', 'PSX', 'WMB',
  'OKE', 'KMI', 'DVN', 'FANG', 'HAL', 'EQT', 'PAA', 'FSLR', 'OIH', 'USO',
  'VLO', 'MRO', 'HES', 'SU', 'CVE',

  // ─── Financials ───────────────────────────────────────────────
  'BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'SCHW',
  'C', 'USB', 'PNC', 'AXP', 'COF', 'BK', 'STT', 'TFC', 'SBNY', 'AIG',
  'MET', 'PRU', 'ALL', 'TRV', 'PGR', 'AFL', 'MMC', 'AON', 'WTW', 'EFX',
  'SPGI', 'MCO', 'ICE', 'CME', 'NDAQ', 'AMP', 'TROW', 'BEN', 'IVZ',
  'RJF', 'LPLA', 'BRO', 'WRB', 'EG', 'DFS', 'FITB', 'KEY', 'HBAN', 'RF',

  // ─── Healthcare ────────────────────────────────────────────────
  'UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY',
  'AMGN', 'GILD', 'VRTX', 'ISRG', 'SYK', 'BSX', 'EW', 'ZBH', 'HOLX',
  'IDXX', 'IQV', 'MCK', 'CI', 'HUM', 'CNC', 'ELV', 'CVS', 'WBA',
  'REGN', 'BIIB', 'MRNA', 'DXCM', 'STE', 'TECH', 'VTRS', 'IART',

  // ─── Industrials ──────────────────────────────────────────────
  'GE', 'CAT', 'BA', 'HON', 'UNP', 'RTX', 'LMT', 'NOC', 'UPS', 'FDX',
  'DE', 'MMM', 'EMR', 'ETN', 'CMI', 'PCAR', 'PH', 'ROK', 'IR', 'DOV',
  'ITW', 'GWW', 'XYL', 'AME', 'SWK', 'TT', 'WAB', 'GNRC', 'RSG', 'WM',
  'HWM', 'LHX', 'TDY', 'ALLE', 'CARR', 'OTIS',

  // ─── Materials ────────────────────────────────────────────────
  'LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DD', 'DOW', 'CE',
  'EMN', 'ALB', 'VMC', 'MLM', 'FMC', 'IFF',

  // ─── Real Estate ─────────────────────────────────────────────
  'AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'O', 'SPG', 'DLR', 'WELL', 'AVB',
  'EQR', 'VTR', 'ESS', 'ARE', 'INVH', 'CBRE', 'UDR', 'MAA',

  // ─── Utilities ───────────────────────────────────────────────
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'PEG', 'WEC',
  'ED', 'ES', 'DTE', 'AEE', 'ETR', 'PPL', 'FE', 'EIX', 'CMS',
];

// Deduplicated and sorted
export const SP500_UNIQUE = [...new Set(SP500_TICKERS)].sort();

// Top 10 ETFs for options scanning (most liquid, tightest spreads, highest OI)
// MUST be defined before SP500_SECTORS since it's referenced there
export const TOP_10_ETFS = [
  'SPY',   // S\u0026P 500 — #1 most traded options in the world
  'QQQ',   // Nasdaq-100 — tech-heavy, very liquid
  'IWM',   // Russell 2000 — small-cap exposure
  'DIA',   // Dow Jones — 30 blue-chip stocks
  'VOO',   // Vanguard S\u0026P 500 — low-cost SPY alternative
  'VTI',   // Vanguard Total Stock Market — broadest US exposure
  'XLK',   // Technology Select Sector — concentrated tech
  'XLF',   // Financial Select Sector — banks \u0026 financials
  'XLE',   // Energy Select Sector — oil \u0026 gas
  'VWO',   // Vanguard Emerging Markets — international exposure
];

// Sector groupings for the scanner
export const SP500_SECTORS = {
  ETFs: [...TOP_10_ETFS],
  Technology: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'CRM', 'ORCL', 'AMD', 'ADBE', 'INTC', 'CSCO', 'QCOM', 'TXN', 'IBM', 'NOW', 'INTU', 'AMAT', 'MU', 'LRCX', 'KLAC', 'MRVL', 'SNPS', 'CDNS', 'FTNT', 'PANW', 'CRWD', 'MCHP', 'MPWR', 'ON', 'SWKS', 'ZS', 'DDOG', 'NET', 'MDB', 'PLTR', 'SHOP', 'COIN', 'UBER', 'SNAP', 'SQ', 'PATH', 'ANET', 'FSLR', 'MNST', 'VEEV', 'ZI', 'GDDY', 'AKAM', 'FFIV'],
  Communications: ['META', 'GOOGL', 'GOOG', 'DIS', 'NFLX', 'CMCSA', 'T', 'VZ', 'TMUS', 'WBD', 'PARA', 'EA', 'TTWO', 'NWSA', 'FOX', 'OMC', 'IPG'],
  'Consumer Discretionary': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'TGT', 'BKNG', 'ABNB', 'CMG', 'LULU', 'YUM', 'MAR', 'ROST', 'TJX', 'DLTR', 'BBY', 'ETSY', 'RCL', 'CCL', 'NCLH', 'HAS', 'MAT', 'LEN', 'DHI', 'POOL', 'ULTA', 'BURL', 'AZO', 'ORLY', 'AAP', 'EBAY', 'WHR', 'MHK'],
  'Consumer Staples': ['PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'EL', 'CL', 'KMB', 'GIS', 'MDLZ', 'HSY', 'K', 'STZ', 'SJM', 'CLX', 'CHD', 'BIO', 'CAG', 'HRL', 'CPB', 'SYY', 'TAP'],
  Energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'VLO', 'PSX', 'WMB', 'OKE', 'KMI', 'DVN', 'FANG', 'HAL', 'EQT', 'PAA', 'OIH', 'USO', 'MRO', 'HES', 'SU', 'CVE'],
  Financials: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'BLK', 'SCHW', 'C', 'USB', 'PNC', 'AXP', 'COF', 'BK', 'STT', 'TFC', 'AIG', 'MET', 'PRU', 'ALL', 'TRV', 'PGR', 'AFL', 'MMC', 'AON', 'WTW', 'EFX', 'SPGI', 'MCO', 'ICE', 'CME', 'NDAQ', 'AMP', 'TROW', 'BEN', 'IVZ', 'RJF', 'LPLA', 'BRO', 'WRB', 'EG', 'DFS', 'FITB', 'KEY', 'HBAN', 'RF'],
  Healthcare: ['UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'PFE', 'TMO', 'ABT', 'DHR', 'BMY', 'AMGN', 'GILD', 'VRTX', 'ISRG', 'SYK', 'BSX', 'EW', 'ZBH', 'HOLX', 'IDXX', 'IQV', 'MCK', 'CI', 'HUM', 'CNC', 'ELV', 'CVS', 'WBA', 'REGN', 'BIIB', 'MRNA', 'DXCM', 'STE', 'TECH', 'VTRS', 'IART'],
  Industrials: ['GE', 'CAT', 'BA', 'HON', 'UNP', 'RTX', 'LMT', 'NOC', 'UPS', 'FDX', 'DE', 'MMM', 'EMR', 'ETN', 'CMI', 'PCAR', 'PH', 'ROK', 'IR', 'DOV', 'ITW', 'GWW', 'XYL', 'AME', 'SWK', 'TT', 'WAB', 'GNRC', 'RSG', 'WM', 'HWM', 'LHX', 'TDY', 'ALLE', 'CARR', 'OTIS'],
  Materials: ['LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'NUE', 'DD', 'DOW', 'CE', 'EMN', 'ALB', 'VMC', 'MLM', 'FMC', 'IFF'],
  'Real Estate': ['AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'O', 'SPG', 'DLR', 'WELL', 'AVB', 'EQR', 'VTR', 'ESS', 'ARE', 'INVH', 'CBRE', 'UDR', 'MAA'],
  Utilities: ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'PEG', 'WEC', 'ED', 'ES', 'DTE', 'AEE', 'ETR', 'PPL', 'FE', 'EIX', 'CMS'],
};

// Default watchlist for the scanner (most liquid S&P 500 names with options + top ETFs)
export const SCANNER_WATCHLIST = [
  // ─── Top ETFs (highest liquidity for options) ───────────────────
  ...TOP_10_ETFS,

  // ─── Mega-cap tech ─────────────────────────────────────────────
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOG', 'AVGO', 'AMD', 'CRM', 'ORCL',

  // ─── Mega-cap non-tech ─────────────────────────────────────────
  'BRK.B', 'JPM', 'V', 'MA', 'UNH', 'LLY', 'JNJ', 'PG', 'HD', 'COST',

  // ─── High-volume / high-IV favorites ────────────────────────────
  'TSLA', 'NFLX', 'COIN', 'UBER', 'SQ', 'PLTR', 'SNAP', 'SHOP', 'BABA', 'RIVN',
];

export default SP500_UNIQUE;