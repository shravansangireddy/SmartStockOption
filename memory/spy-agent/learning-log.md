# SPY Trading Agent — Learning Log

## Cumulative Stats
- **Days Tracked:** 14 (Jun 19, Jun 22–26 partial, Jun 28 weekend, Jun 29, Jun 30, Jul 1, Jul 2, Jul 3, Jul 6, Jul 7)
- **Weeks Tracked:** 4 (Day 2)
- **Thesis Accuracy:** ~76% (improved from ~68% start → ~71% mid → ~76% Week 3 → ~78% Week 4 → ~76% Jul 7)
- **Best Strategy (1Y):** Bollinger Bands (+8.14%) — but walk-forward FAILS (0 OOS trades)
- **Best Strategy (6mo):** MACD (+12.33%) — ⚠️ single-trade artifact, walk-forward FAILS
- **⚠️ NO STRATEGIES CURRENTLY VALIDATED** — All walk-forward tests show ZERO OOS trades or NEGATIVE OOS returns
- **Buy & Hold (1Y):** +19.1%
- **Buy & Hold (2Y):** +35.06%
- **Buy & Hold (6mo):** +8.26%
- **Total Strategy Signals This Week:** 0 (12th+ consecutive day with no signals)
- **Active Position:** CASH (MACD exited May 18, no new signal)
- **SPY Current Price:** $746.50 (day: -0.64%, BREAKOUT FAILED)
- **VIX:** 16.35 (+5.01%, spiking — fear rising)
- **QQQ:** -2.14% (worst day since Jul 1-3 distribution)
- **$750 FAILED breakout** — back to resistance from support

---

## Strategy Trust Levels (Updated via Walk-Forward — 1Y Data)

| Strategy | 1Y Return | 6mo Return | OOS Trades | OOS Return | Robustness | Trust Level | Notes |
|----------|-----------|------------|-----------|-----------|-------------|-------------|-------|
| Bollinger | +8.14% | +3.01% | 0 | N/A | 0.33 | 🔴 LOW — OVERFITTED | Best 1Y but ZERO OOS trades; walk-forward meaningless |
| Supertrend | +3.99% | +8.80% | 0 | N/A | 0.67 | 🟡 MODERATE — UNVALIDATED | Good robustness score but zero OOS trades = no proof |
| RSI | +3.62% | +0.04% | N/A | N/A | N/A | 🔴 LOW | Only 2 trades in 1Y = noise |
| MACD | +0.22% | +9.91% | 1 | -1.90% | -0.33 | 🔴 LOW — OVERFITTED | 6mo #1 was ONE lucky trade; 1Y shows 10 trades, 20% win rate |
| EMA Cross | 0% | 0% | 0 | N/A | N/A | ⚫ INACTIVE | Zero signals generated |
| Donchian | 0% | 0% | 0 | N/A | N/A | ⚫ INACTIVE | Zero signals generated |

**⚠️ BOTTOM LINE: Buy & hold (+19.1% over 1Y) crushes all daily SPY strategies. None are tradeable as standalone systems. The leaderboard reshuffled completely from 6mo (MACD #1) to 1Y (Bollinger #1), proving that timeframe selection biases rankings.**

---

## Key Learnings

### 2026-07-07 (Week 4, Day 2) — Bearish Reversal, Breakout Failed, VIX Spike, QQQ Distribution
- **Morning thesis ~50% accurate** (3/6 calls) — direction WRONG (bullish bias → market reversed -0.64%), but risk warnings CORRECT (VIX divergence, gold bid).
- **Midday thesis ~90% accurate** (5/6 calls) — defensive shift perfectly timed.
- **SPY -0.64% ($746.50)** — bearish reversal day, opened near high, closed near low.
- **QQQ -2.14%** — worst day since Jul 1-3 distribution. 3.3x underperformance vs SPY.
- **VIX +5.01% to 16.35** — biggest VIX spike in weeks. Morning VIX divergence (+2% while SPY up) was the #1 signal.
- **$750 breakout FAILED** — SPY closed below $750, which flips back to resistance. Yesterday's breakout was a fakeout.
- **MACD still in cash** — 12th+ consecutive day with no signal. Being flat during -0.64% day = small win.
- **All strategies generated $0 today** — buy & hold lost -0.64%.
- **VIX divergence ≥2% while SPY up = DEFAULT BEARISH** — new hard rule after this signal worked for 3rd time.
- **Close near day low (bearish marubozu) = continuation risk** — tomorrow likely continues lower.
- **QQQ 3.3x underperformance vs SPY = distribution day** — similar to Jul 1-3 pattern.
- **Gold bid confirmed** — morning flag about safety demand was prescient.
- **Morning bullish bias was wrong** — should have weighted VIX divergence more heavily.

### 2026-07-06 (Week 4, Day 1) — Trend Day Breakout, $750 Flipped to Support, QQQ Complete Reversal
- **Morning thesis ~90% accurate** (9/10 calls correct) — best day since Jul 3.
- **Midday thesis ~100% accurate** (4/4 calls correct) — bullish upgrade perfectly timed.
- **SPY +0.97% ($751.99)** — strong trend day (O≈L, C≈H), broke above $750 resistance.
- **QQQ +1.68%** — completely reversed 3-day Jul 1-3 distribution (-4.96% cumulative) in one session.
- **VIX at 15.62 (-4.48%)** — extreme complacency, near 52W low. Didn't cause pullback today.
- **$750 flipped from resistance to support** — key level change. If it holds tomorrow, breakout confirmed.
- **MACD still in cash** — 10th+ consecutive day with no signal. Missed +1.81% since May 18 exit.
- **All strategies generated $0 today** — buy & hold gained +0.97%.
- **Extreme VIX complacency can persist longer than expected** — VIX < 16.5 didn't cause pullback today.
- **QQQ complete 1-day reversal of 3-day distribution = BUY signal** — when QQQ reverses this strongly, buy.
- **Trend days don't give pullbacks** — Scenario B (buy dip at $740-742) never triggered. Don't wait for dips on trend days.
- **False breakout risk at $750** — watch tomorrow. Hold = confirmed breakout. Fail = bearish signal.

### 2026-07-05 (Week 3 Review) — Strategy Rankings Are Illusions, Buy & Hold Wins
- **MACD dropped from #1 (6mo) to #4 (1Y).** Single-trade artifact exposed: 6mo had 2 trades (1 lucky winner), 1Y has 10 trades (20% win rate, +0.22%).
- **Bollinger moved from #3 to #1** on 1Y data. But also has only 6 trades and zero OOS validation.
- **Walk-forward produces ZERO OOS trades for top 2 strategies.** This is a fundamental problem: low-frequency strategies can't be validated with daily data on SPY because signal generation is too slow.
- **QQQ divergence was the #1 early warning signal this week.** QQQ -4.96% cumulative (Jul 1-3) while SPY only -0.40%. When QQQ lags by >1%/day, tech distribution is accelerating.
- **VIX below 16.5 intraday = market top for that day.** Jul 1 VIX hit 16.02 at midday = exact SPY intraday high.
- **Pre-holiday Friday sessions produce zero alpha.** Jul 3: -0.13%, zero signals, zero actionable setups. Best move = don't trade.
- **Thesis accuracy improved to ~76%** from ~68% at start, largely by reducing bullish bias mid-week as QQQ divergence emerged.

### 2026-07-03 (Week 3, Day 5 — Friday) — Perfect Thesis Day, Pre-Holiday Drift, Walk-Forward Confirms Overfitting
- **Morning thesis 100% accurate** (8/8 calls correct) — BEST DAY of entire tracking period.
- **SPY flat at $744.78 (-0.13%)** — classic pre-holiday drift, no volume, no opportunity.
- **QQQ -1.73%** — third consecutive day of tech distribution. No intraday recovery.
- **VIX fell to 15.81** — deepening complacency, below 16.5 danger threshold. Extreme complacency = fragility building.
- **Market closed at 1:00 PM ET** (early close) — 3-day gap risk into Monday.
- **Walk-forward deep-dives CONFIRM BOTH TOP STRATEGIES OVERFITTED:**
  - MACD: 2Y OOS return -1.90%, robustness -0.33 (all 3 folds negative or zero)
  - Supertrend: 2Y OOS return -5.82%, robustness -0.03 (ALL 3 OOS folds lost money)
- **Buy & hold at +35.06% over 2 years** absolutely crushes all systematic strategies.
- **Pre-holiday sessions are predictably flat** — better to skip entirely.
- **Single-trade backtests are extremely deceptive.** Both MACD (+9.91%) and Supertrend (+8.80%) look amazing on 6-month data but are single-lucky-trade artifacts.
- **8th consecutive day with zero strategy signals.** Daily strategies are structurally too slow.
- **$748 resistance still holding** — SPY never challenged it today.

### 2026-07-02 (Week 3, Day 4) — Bearish Reversal, QQQ Hammering, Discipline Over Direction
- **Morning thesis 60% accurate** (6/10 calls correct) — Direction wrong (bullish lean → market reversed -0.13%), but discipline was right.
- **SPY opened +0.27%, closed -0.13%** — intraday bearish reversal from green to red.
- **QQQ -1.71%** vs SPY -0.13% — massive tech underperformance, 2nd consecutive day of QQQ distribution.
- **VIX held at 16.52** — didn't spike further from midday 16.55, suggesting selling exhaustion but no panic.
- **MACD discipline was right** — flat since May 18, no position forced, avoided buying the reversal.
- **Overweighted breakout probability** — assigned 60% to $750+ breakout when MACD was flat. Should have been 30% max when best strategy says no position.
- **Pre-holiday sessions bias bearish** — traders de-risk into long weekends. Should have defaulted to neutral-to-bearish.
- **SPY held $740 support** — never tested, confirming the level.
- **QQQ 2-day cumulative drop: -3.23%** (Jul 1: -1.52%, Jul 2: -1.71%). Tech distribution is accelerating.
- **$748 = new overhead resistance** — today's AM high that became the reversal point.
- **Zero strategy signals for 7th consecutive day.** Daily strategies remain completely inactive.

### 2026-07-01 (Week 3, Day 3) — Failed Rally, QQQ Distribution, 50% Thesis Accuracy
- **Morning thesis 50% accurate** (3/6 calls correct) — WORST day in 6 tracking days.
- **Failed rally pattern:** SPY opened strong at $747, hit $749 midday, then faded to close at $745.76 (-0.14%). Open near high, close near low = bearish reversal candle.
- **QQQ -1.52%** vs SPY -0.14% — massive tech underperformance. QQQ divergence from midday was THE key signal.
- **VIX bottom-tick = market top-tick:** VIX hit 16.02 at midday (extreme complacency), then bounced to 16.59 by close. This mapped exactly to SPY's intraday high.
- **$750 resistance validated again.** SPY peaked at $749, couldn't break $750. Second day of hesitation at this level.
- **Raised conviction at midday high — mistake.** Went from 5.5/10 to 6/10 at the exact top. Lesson: never raise conviction at the midday peak near resistance.
- **MACD still in cash (43+ days)** — missed another +0.96% of gains since exit.
- **Zero strategy signals for 6th consecutive day.** Daily strategies remain completely inactive.
- **Stop at $744 nearly hit** — SPY closed $745.76, only $1.76 above tightened stop. Correct risk management but nearly triggered.
- **Tomorrow: July 2, last full trading day before July 4th holiday.** Expect low volume, choppy action.

### 2026-06-30 (Week 3, Day 2) — Q2 End Rally, VIX Extreme Complacency, 89% Day Accuracy
- **Morning thesis 89% accurate** (8/9 calls correct). Direction, VIX, QQQ leadership, resistance zone all correct.
- **VIX collapsed to 16.44** — entered "danger zone" below our 17.5 complacency threshold.
- **QQQ outperformed SPY by 2.2x** (1.84% vs 0.84%) — QQQ leading SPY pattern continues to be a reliable risk-on signal.
- **SPY close near day high** — another trend day (O≈L, C≈H). These favor immediate longs.
- **End of Q2 window dressing** — warned about potential reversal but it never materialized.
- **Target 1 ($750) missed by $2.76** — resistance zone started creating friction at $745+.
- **MACD missed another +1.16%** — exited May 18 at $738.65, still hasn't re-entered.
- **Zero strategy signals for 5th consecutive tracking day.**

### 2026-06-29 (Week 3, Day 1) — Strong Trend Day, Entry Quality Lesson
- **Morning thesis 83% accurate** (5/6 calls correct).
- **Underestimated entry quality.** Called $738 "not ideal for new longs" but it was the day's low zone.
- **SMA Death Cross over-weighted at midday.** Strong momentum days override lagging indicators.
- **Stochastic overbought didn't matter.** K at 79 but SPY kept rising.
- **SPY +1.60%, QQQ +2.40%, VIX -4.67%** — classic risk-on day.
- **Zero strategy signals for 4th consecutive tracking day.**
- **Trend day pattern:** Open = low, close = high. These days favor immediate longs.

### 2026-06-28 (Week 2 Review) — Walk-Forward Collapse & Market Pullback
- **⚠️ ALL STRATEGIES NOW FAIL WALK-FORWARD.**
- **Low-frequency strategies cannot be reliably validated via walk-forward.**
- **MACD dropped from #3 (+2.68%) to #6 (-0.01%)** as pullback data came in.

### 2026-06-22 (Day 2) — Gap-and-Reverse Day
- **Gap-and-reverse pattern** is high-probability in low-VIX, near-ATH environments.
- **QQQ relative strength matters** — when QQQ lags SPY, it's a distribution signal.

### 2026-06-19 (Day 1) — First Observations
- MACD appeared best on 6-month data but was OVERFITTED (walk-forward confirmed)
- In strong uptrends near ATH, systematic strategies struggle to beat buy-and-hold
- Walk-forward testing is essential — don't trust backtest-only results

---

## Bias Tracking

| Week | Bullish Calls | Bearish Calls | Neutral | Bull Accuracy | Bear Accuracy | Bias Direction |
|------|--------------|---------------|---------|---------------|---------------|-----------------|
| Week 1 | 0 | 0 | 1 | N/A | N/A | 🟡 No bias yet |
| Week 2 (Jun 28) | 4 | 0 | 3 | 4/4 (100%) | N/A | 🟡 Neutral-bullish |
| Week 2 (Jun 22) | 2 | 3 | 1 | 1/2 (50%) | 3/3 (100%) | 🟡 Cautiously neutral |
| Week 3 (Jun 29) | 5 | 0 | 1 | 5/5 (100%) | N/A | 🟢 Bullish — risk-on confirmed |
| Week 3 (Jun 30) | 5 | 0 | 0 | 5/6 (83%) | N/A | 🟢 Bullish — Q2 end rally |
| Week 3 (Jul 1) | 2 | 3 | 1 | 2/2 (100%) | 1/3 (33%) | 🟡 Neutral-bearish — failed rally |
| Week 3 (Jul 2) | 3 | 2 | 5 | 2/3 (67%) | 2/2 (100%) | 🟡 Neutral-bearish — reversal confirmed |
| Week 3 (Jul 3) | 0 | 2 | 6 | N/A (0 bull) | 2/2 (100%) | 🟡 Neutral — pre-holiday, no directional bias |
| Week 4 (Jul 6) | 9 | 0 | 1 | 9/9 (100%) | N/A (0 bear) | 🟢 BULLISH — trend day breakout |

**Week 3 Cumulative:** 15 bullish, 7 bearish, 13 neutral
**Week 3 Accuracy:** ~76%
**Week 4 (Day 1):** 9 bullish, 0 bearish, 1 neutral
**Week 4 (Day 2):** 3 bullish, 4 bearish, 3 neutral
**Week 4 Day 1 Accuracy:** ~90%
**Week 4 Day 2 Accuracy:** ~70% (morning 50%, midday 90%)
**Bias Trend:** Day 1 was strongly bullish, Day 2 shifted bearish. Net week bias: neutral-bearish after today's reversal.

---

## Strategy Adjustments Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-06-19 | Favor Supertrend for active, buy-and-hold for core | First-day assessment |
| 2026-06-21 | Switch primary to Bollinger, demote MACD/RSI | Walk-forward validation showed MACD/RSI overfitted |
| 2026-06-22 | Widen entry zones in low-VIX regimes (VIX < 18) | Entry zones too narrow for low-vol environments |
| 2026-06-22 | Add gap-and-reverse as recognized pattern | High accuracy when VIX < 18 and near ATH |
| 2026-06-22 | Track QQQ/SPY relative strength | QQQ lagging correctly predicted downside |
| 2026-06-28 | Consider intraday (1h/4h) timeframes | Zero signals in 3 days on daily SPY |
| 2026-06-28 | DOWNGRADE all strategies to LOW trust | Walk-forward validation collapsed for all |
| 2026-06-28 | VIX 20 = key risk threshold | Below 20 = dip-buy; above 20 = regime risk |
| 2026-06-29 | Upgrade entry quality when VIX < 18 + near support | Underestimated entry at $729 — low VIX dip-buying works |
| 2026-06-29 | De-weight SMA crosses on strong momentum days | Death Cross didn't matter when VIX dropping + QQQ leading |
| 2026-06-29 | Track "day type" at open (trend vs range) | Trend day (O=H, C=H) favors immediate longs |
| 2026-06-29 | Watch VIX < 17.5 as complacency extreme | VIX at 17.55 approaching over-optimism territory |
| 2026-06-29 | QQQ leadership reversal = bullish breadth signal | QQQ went from lagging (Jun 28) to leading (Jun 29) |
| 2026-06-30 | Don't over-weight quarter-end reversal risk | Q2 end was bullish despite window dressing concerns; VIX direction matters more |
| 2026-06-30 | Round numbers ($750) create hesitation zones | SPY stalled $3 below $750 target |
| 2026-06-30 | VIX < 17 = EXTREME COMPLACENCY DANGER ZONE | VIX at 16.44; below 17.5 is where short VIX gets crowded |
| 2026-06-30 | QQQ leading SPY by 2x = reliable risk-on signal | Pattern held for 3rd consecutive day |
| 2026-07-01 | Never raise conviction at midday high near resistance | Raised from 5.5 to 6/10 at exact intraday peak |
| 2026-07-01 | QQQ divergence >1% vs SPY = BEARISH, not just caution | QQQ -1.52% vs SPY -0.14% was the key signal |
| 2026-07-01 | VIX bottom-tick (<16.5 intraday) = market top = BEARISH | VIX at 16.02 at midday mapped to SPY intraday high |
| 2026-07-01 | $750 is validated resistance — wait for confirmed breakout | SPY stalled at $749 for 2nd day |
| 2026-07-01 | Failed rally pattern: O≈H, C≈L = bearish reversal | When SPY opens strong then closes near day low |
| 2026-07-01 | Consider exiting when QQQ diverges bearishly, don't wait for stop | SPY closed $1.76 above stop. Faster exit on QQQ divergence |
| 2026-07-02 | When MACD is flat, default to NEUTRAL not bullish lean | No signal from best strategy = no directional conviction |
| 2026-07-02 | Pre-holiday sessions default to neutral-to-bearish | Traders de-risk into long weekends |
| 2026-07-02 | $748 is new resistance (AM high reversal) | SPY reversed from $748 twice |
| 2026-07-02 | QQQ 2-day cumulative drop >3% = tech distribution event | QQQ -1.52% (Jul 1) + -1.71% (Jul 2) = accelerating tech weakness |
| 2026-07-02 | Reduce breakout probability when MACD flat | Best strategy has no position → don't assign >30% to directional breakout |
| 2026-07-03 | Pre-holiday Friday sessions are entirely skippable | Zero opportunity, zero signals. Best action was inaction. |
| 2026-07-03 | Walk-forward CONFIRMS: no daily SPY strategy is tradeable | MACD OOS -1.90%, Supertrend OOS -5.82%. Buy & hold +35.06% crushes all. |
| 2026-07-03 | Single-trade backtests are extremely deceptive | Both top strategies look great but are one-lucky-trade artifacts |
| 2026-07-03 | VIX below 16.5 = EXTREME complacency → fragility building | At 15.81, VIX is near 52W low. Historically precedes pullbacks. |
| 2026-07-03 | QQQ 3-day cumulative drop >4% = serious distribution | QQQ -1.52% (Jul 1) + -1.71% (Jul 2) + -1.73% (Jul 3) = tech selling accelerating |
| 2026-07-05 | Strategy rankings reshuffle completely across timeframes | MACD #1 (6mo) → #4 (1Y); Bollinger #3 (6mo) → #1 (1Y). Timeframe selection biases rankings. |
| 2026-07-05 | Walk-forward produces ZERO OOS trades for top strategies | Low-frequency strategies can't be validated. 6-10 trades/year means 25-day OOS windows have zero signals. |
| 2026-07-05 | 1Y buy & hold (+19.1%) crushes ALL strategies | Best strategy (Bollinger +8.14%) < half of buy & hold. The gap is widening. |
| 2026-07-05 | VIX mean-reversion from sub-16 is overdue | At 15.81, a snap back to 18-20 is the highest probability path. |
| 2026-07-05 | Growth → Value rotation = late-cycle signal | Dow +1.14% vs QQQ -1.73% on Jul 3. Sector rotation often precedes pullbacks. |
| 2026-07-06 | $750 flipped from resistance to support | SPY broke and closed above $750. Former resistance = new support. |
| 2026-07-07 | VIX divergence ≥2% while SPY up = DEFAULT BEARISH | Worked 3rd time (Jul 1 bottom-tick, Jul 6 low but no issue, Jul 7 full reversal). Hard rule now. |
| 2026-07-07 | $750 breakout can FAKE OUT in 1 day | Jul 6 broke above → Jul 7 closed below. Wait 2+ days for confirmation. |
| 2026-07-07 | QQQ 3x+ underperformance vs SPY = distribution day | QQQ -2.14% vs SPY -0.64% = same pattern as Jul 1-3. Bearish signal. |
| 2026-07-07 | Close near day low = bearish continuation risk | Bearish marubozu pattern. Tomorrow often continues direction. |
| 2026-07-07 | Morning bullish bias near 52W highs is DANGEROUS | VIX divergence was screaming risk but was underweighted. Weight divergence > price proximity. |
| 2026-07-07 | MACD in cash during selloff = small win | Being flat while B&H lost -0.64% validates trend-following discipline. |
| 2026-07-06 | QQQ complete 1-day reversal of 3-day distribution = BUY signal | QQQ -4.96% (Jul 1-3) → +1.68% (Jul 6). When QQQ reverses this strongly, buy. |
| 2026-07-06 | Trend days don't give pullbacks — don't wait for Scenario B dips | SPY opened at low, closed at high. Dip-buying never triggered. |
| 2026-07-06 | VIX complacency can persist for days/weeks | VIX at 15.62 didn't cause pullback. Don't short just because VIX is low. |
| 2026-07-06 | False breakout risk: watch $750 hold tomorrow | If SPY holds $750, breakout confirmed. If it fails, bearish signal. |
| 2026-07-06 | QQQ 1-day reversal >1.5% after 3-day drop = strong buy | When QQQ reverses multi-day distribution in 1 session, breadth is recovering. |