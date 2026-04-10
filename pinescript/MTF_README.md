# USDJPY Multi-Timeframe (MTF) Analysis Indicator

> **Pine Script v6 Indicator for TradingView**
> Designed for USDJPY 1-minute scalping | Multi-timeframe alignment | Max SL 30 pips | TP target 80–100 pips

---

## Table of Contents

1. [What This Indicator Does](#what-this-indicator-does)
2. [How Multi-Timeframe Analysis Works](#how-multi-timeframe-analysis-works)
3. [How to Install on TradingView](#how-to-install-on-tradingview)
4. [How to Read the Dashboard](#how-to-read-the-dashboard)
5. [Signal Logic Explained](#signal-logic-explained)
6. [Input Settings Explanation](#input-settings-explanation)
7. [Session Filter](#session-filter)
8. [Setting Up Alerts](#setting-up-alerts)
9. [Best Practices](#best-practices)
10. [Risk Disclaimer](#risk-disclaimer)

---

## What This Indicator Does

This indicator checks **five timeframes at once** — 1M, 5M, 15M, 1H, and 4H — and only generates a trading signal when **most or all of them agree on the same direction**. Trading with timeframe alignment dramatically increases the probability that a move is real and not just noise.

For each timeframe, five indicators are calculated:

| Indicator | Bullish Condition |
|---|---|
| EMA 9 & EMA 21 | EMA 9 above EMA 21 (fast trend up) |
| EMA 50 & EMA 200 | EMA 50 above EMA 200 (golden cross / major trend up) |
| RSI | RSI above 50 (bullish momentum) |
| MACD | MACD line above signal line |
| Supertrend | Price above supertrend (direction = up) |

When 3 or more of these 5 indicators agree on a direction, that timeframe is considered **bullish or bearish**.

The indicator then counts how many of the 5 timeframes are bullish (or bearish) and generates a signal based on the alignment:

| Bullish TFs | Signal |
|---|---|
| 5 out of 5 | 🟢🟢 STRONG BUY |
| 4 out of 5 | 🟢 BUY |
| 3 out of 5 | 🟡 WEAK BUY |
| 2 out of 5 | ⚪ NEUTRAL |
| 1 out of 5 | 🟡 WEAK SELL |
| 0 out of 5 | 🔴🔴 STRONG SELL |

---

## How Multi-Timeframe Analysis Works

### Why MTF?

A 1-minute candle move that goes against the 1-hour and 4-hour trend is very likely to reverse. A 1-minute move **with** the higher timeframes behind it has much more power and follow-through. MTF analysis filters out low-probability trades.

### Timeframe Hierarchy

```
4H  ──── Swing trend (most powerful, slowest to change)
1H  ──── Intraday trend
15M ──── Medium-term momentum
5M  ──── Short-term trend confirmation
1M  ──── Execution timeframe (entry/exit)
```

### How Each Timeframe Vote is Calculated

For each timeframe, these 5 conditions are checked:

1. **EMA Fast Bull** — EMA 9 > EMA 21 on that timeframe
2. **EMA Slow Bull** — EMA 50 > EMA 200 on that timeframe (golden cross)
3. **RSI Bull** — RSI > 50
4. **MACD Bull** — MACD line > signal line
5. **Supertrend Bull** — Price is above the Supertrend line (direction = up)

Each condition gets 1 point. If a timeframe scores **3 or more out of 5**, it votes **bullish**.

### Counting Votes Across Timeframes

```
Example: bull_count = 4 (1M, 5M, 15M, 4H all bullish; 1H bearish)
→ Signal: 🟢 BUY (4/5 agreement)
```

---

## How to Install on TradingView

### Step 1 — Open Pine Editor

1. Go to [tradingview.com](https://www.tradingview.com) and open your USDJPY chart
2. At the bottom of the screen, click the **"Pine Editor"** tab
3. If you don't see it, click the `{}` icon in the bottom toolbar

### Step 2 — Paste the Code

1. In the Pine Editor, select all existing code (`Ctrl+A` / `Cmd+A`) and delete it
2. Open `MTF_Analysis_Indicator.pine` from this folder
3. Copy all the code (`Ctrl+A` → `Ctrl+C`)
4. Paste it into the Pine Editor (`Ctrl+V`)

### Step 3 — Add to Chart

1. Click the blue **"Add to chart"** button (top right of Pine Editor panel)
2. Wait a few seconds — the indicator will load and you'll see the dashboard table appear

### Step 4 — Set Up on USDJPY 1-Minute Chart

> ⚠️ **The indicator is designed for USDJPY 1M charts.** Run it on a USDJPY chart for best results.

1. In the symbol search (top left), type **USDJPY** and select it
2. Set the timeframe to **1** (1 minute)
3. The indicator automatically pulls 5M, 15M, 1H, and 4H data via `request.security()`

### Step 5 — Adjust Settings (Optional)

1. Click the **⚙️ Settings icon** next to the indicator name on the chart
2. Customize inputs to fit your style (see [Input Settings](#input-settings-explanation))
3. Click **OK**

---

## How to Read the Dashboard

The dashboard table appears in the top-right corner (configurable) of your chart:

```
┌──────────┬───────────┬────────┬────────┬──────┬────────┬────────────────┐
│ Timeframe│ Trend     │ EMA    │ RSI    │ MACD │ ADX    │ Signal         │
├──────────┼───────────┼────────┼────────┼──────┼────────┼────────────────┤
│ 1M       │ 🟢 UP    │ 🟢🟢  │ 🟢 62  │ 🟢   │ 🟢 32  │ BUY 🟢        │
│ 5M       │ 🟢 UP    │ 🟢🟢  │ 🟢 58  │ 🟢   │ 🟢 28  │ BUY 🟢        │
│ 15M      │ 🟢 UP    │ 🟡     │ 🟢 55  │ 🟢   │ 🟡 22  │ BUY 🟢        │
│ 1H       │ 🔴 DOWN  │ 🔴🔴  │ 🔴 42  │ 🔴   │ 🟢 30  │ SELL 🔴       │
│ 4H       │ 🟢 UP    │ 🟢🟢  │ 🟢 61  │ 🟢   │ 🟢 35  │ BUY 🟢        │
├──────────┼───────────┼────────┼────────┼──────┼────────┼────────────────┤
│ OVERALL  │ 4/5 🟢   │        │        │      │ WR:67% │ 🟢 BUY        │
├──────────┼───────────┼────────┼────────┼──────┼────────┼────────────────┤
│ Stats    │ Sigs: 12  │ W:8    │ L:4    │ +340p│ LONG 🟢│ London 🔵     │
└──────────┴───────────┴────────┴────────┴──────┴────────┴────────────────┘
```

### Column Guide

| Column | Meaning |
|---|---|
| **Timeframe** | 1M, 5M, 15M, 1H, 4H |
| **Trend** | 🟢 UP = net bullish on this TF / 🔴 DOWN = net bearish |
| **EMA** | 🟢🟢 = both EMA pairs bullish / 🟡 = mixed / 🔴🔴 = both bearish |
| **RSI** | Emoji + RSI value (🟢 = above 50, 🔴 = below 50) |
| **MACD** | 🟢 = MACD above signal line / 🔴 = below |
| **ADX** | Emoji + ADX value (🟢 = above threshold / 🟡 = below, market is ranging) |
| **Signal** | This timeframe's individual vote |

### Row Colors

- 🟩 Green background = timeframe is voting bullish
- 🟥 Red background = timeframe is voting bearish

### Stats Row

| Item | Meaning |
|---|---|
| Sigs | Total signals generated this session |
| W / L | Wins / Losses (TP3 = win, SL = loss) |
| Pips | Net pips gained/lost |
| Trade | Current open position direction |
| Session | Which session is currently active |

---

## Signal Logic Explained

### Signal Strength

| Signal | Condition | What to do |
|---|---|---|
| 🟢🟢 **STRONG BUY** | All 5 TFs bullish (default) | Best setup — trade it |
| 🟢 **BUY** | 4/5 TFs bullish | Good setup — trade it if you enable regular signals |
| 🟡 **WEAK BUY** | 3/5 TFs bullish | Mixed — wait for confirmation |
| ⚪ **NEUTRAL** | 2/5 agreement | Don't trade |
| 🟡 **WEAK SELL** | 3/5 TFs bearish | Mixed — wait |
| 🔴 **SELL** | 4/5 TFs bearish | Good short setup |
| 🔴🔴 **STRONG SELL** | All 5 TFs bearish | Best short setup — trade it |

By default, **STRONG BUY/SELL (5/5 TFs) and regular BUY/SELL (4/5 TFs)** trigger a chart signal. You can disable regular signals via the "Also signal on BUY/SELL" toggle.

### Entry, TP & SL Levels

When a signal fires, the chart shows:

```
🟢🟢 STRONG BUY
Entry: 149.250
SL: 149.000 (-25 pips)
TP1: 149.750 (+50 pips)    ← 1:2 R:R (partial close)
TP2: 150.000 (+75 pips)    ← 1:3 R:R (main target)
TP3: 150.250 (+100 pips)   ← 1:4 R:R (runner)
TFs: 5/5 Bullish
```

### Stop Loss Calculation

- **ATR method** (default): SL = ATR × multiplier (capped at Max SL pips)
- **Fixed method**: SL = your chosen fixed pip amount

### Trade Result Labels

When a trade closes, a label appears at the exit price:

| Outcome | Label |
|---|---|
| TP1 hit | `✅ TP1 HIT (+50 pips)` |
| TP2 hit | `✅ TP2 HIT (+75 pips)` |
| TP3 hit | `✅ TP3 HIT (+100 pips)` — trade closed |
| SL hit | `❌ SL HIT (-25 pips)` — trade closed |

---

## Input Settings Explanation

### EMA Settings

| Setting | Default | Description |
|---|---|---|
| EMA Fast Period | 9 | Fast EMA for short-term trend |
| EMA Mid Period | 21 | Mid EMA to compare with fast |
| EMA Slow Period | 50 | Slow EMA for medium-term structure |
| EMA Major Period | 200 | Major EMA — golden cross vs death cross |

### RSI Settings

| Setting | Default | Description |
|---|---|---|
| RSI Period | 14 | Standard RSI length |

### MACD Settings

| Setting | Default | Description |
|---|---|---|
| MACD Fast Length | 12 | Fast EMA for MACD calculation |
| MACD Slow Length | 26 | Slow EMA for MACD calculation |
| MACD Signal Length | 9 | Signal line smoothing |

### ADX & Supertrend Settings

| Setting | Default | Description |
|---|---|---|
| ADX Period | 14 | Period for ADX / DMI calculation |
| ADX Trend Threshold | 25 | ADX above this = trending. Below = ranging (🟡 in table) |
| Supertrend Factor | 3.0 | ATR multiplier for Supertrend bands |
| Supertrend ATR Period | 10 | ATR period for Supertrend |

### Signal Settings

| Setting | Default | Description |
|---|---|---|
| TFs for STRONG signal | 5 | How many of 5 timeframes must agree for STRONG BUY/SELL |
| TFs for BUY/SELL signal | 4 | How many for regular BUY/SELL |
| Also signal on BUY/SELL | ON | Enable this to also get signals on 4/5 agreement (not just 5/5) |
| Signal Cooldown (bars) | 30 | Minimum bars between signals — 30 bars = 30 minutes on 1M chart |
| Enable Volume Filter | OFF | Only signal when volume exceeds its moving average (confirms real participation) |
| Volume MA Length | 20 | Period for volume moving average used in the volume filter |
| Enable Minimum Move Filter | ON | Requires a minimum price move (0.3× ATR) over the last 3 bars before signaling — filters flat/choppy conditions |
| Min EMA Distance (pips) | 0.5 | Price must be at least this far from EMA9 to confirm direction (avoids whipsaw entries) |
| Signal Freshness Lookback | 5 | How many bars back to check that the alignment is "new" — prevents repeat signals during sustained alignment |

### Stop Loss & Take Profit

| Setting | Default | Description |
|---|---|---|
| SL Method | ATR | ATR-based SL (dynamic) or Fixed Pips (static) |
| ATR Period | 14 | Period for ATR calculation |
| ATR Source Timeframe | 15M | Timeframe for ATR — 15M gives more meaningful volatility than 5M for SL sizing |
| ATR Multiplier | 2.0 | SL = ATR × multiplier |
| Min SL (pips) | 10 | Floor — SL will never be smaller than this (prevents tick-sized stops) |
| Max SL (pips) | 30 | Hard cap — SL will never exceed this |
| Fixed SL (pips) | 25 | Used only when SL Method = Fixed Pips |
| TP1 R:R Ratio | 2.0 | TP1 = SL × 2.0 (e.g., 10 pip min SL → 20 pip TP1; illustration only — actual SL depends on ATR) |
| TP2 R:R Ratio | 3.0 | TP2 = SL × 3.0 |
| TP3 R:R Ratio | 4.0 | TP3 = SL × 4.0 |

### Display Settings

| Setting | Default | Description |
|---|---|---|
| Show Dashboard Table | ON | Show/hide the MTF dashboard |
| Table Position | Top Right | Where to put the table on chart |
| Show Signal Labels | ON | Show entry/SL/TP label when signal fires |
| Show TP/SL Lines | ON | Draw horizontal lines for entry, SL, TP1, TP2, TP3 |
| Background Color During Trade | ON | Green tint during long, red tint during short |

---

## Session Filter

### Sessions Available

| Session | Time (GMT) | Best For |
|---|---|---|
| **Tokyo** | 00:00 – 09:00 | USDJPY is most liquid — excellent for 1M scalping |
| **London** | 08:00 – 16:00 | High volatility and volume — strong directional moves |
| **New York** | 13:00 – 21:00 | USD news impact — big moves, especially at 13:30–14:00 |

> **Overlap**: London and New York overlap from 13:00–16:00 GMT — this is the highest volatility window.

### How to Use Session Filter

1. Open indicator settings → **Session Filter** section
2. Enable **"Filter Signals by Session"**
3. Check which sessions you want to trade (London / New York / Tokyo)
4. Enable **"Highlight Sessions on Chart"** to see colored backgrounds:
   - 🔵 Blue = London session
   - 🟣 Purple = New York session
   - 🟠 Orange = Tokyo session

When session filter is ON, signals will only fire during your selected sessions. Outside of sessions, the indicator still calculates but does not generate a signal.

---

## Setting Up Alerts

To get notified on your phone or desktop:

1. Right-click on the chart → **"Add Alert"** (or `Alt+A`)
2. In the **Condition** dropdown, select **"USDJPY MTF Analysis"**
3. Choose the alert type:

| Alert Name | When It Fires |
|---|---|
| **STRONG BUY Signal** | Signal fires on chart (with cooldown respected) |
| **STRONG SELL Signal** | Signal fires on chart (with cooldown respected) |
| **Strong Buy (any bar)** | Any bar where all 5 TFs are bullish |
| **Strong Sell (any bar)** | Any bar where all 5 TFs are bearish |
| **BUY Signal** | 4/5 TFs bullish (fires continuously while condition holds) |
| **SELL Signal** | 4/5 TFs bearish |
| **TP1 Hit** | TP1 price reached |
| **TP2 Hit** | TP2 price reached |
| **TP3 Hit** | TP3 price reached — trade is fully closed |
| **SL Hit** | Stop loss hit — trade is closed |

4. Set expiry to "Open-ended" (doesn't expire)
5. Add notification method (TradingView app push, email, webhook)
6. Click **Create**

### Alert Message Contents

STRONG BUY alerts include:
- Direction, Entry price, SL price (with pips), TP1/TP2/TP3 prices, how many TFs are aligned

---

## Best Practices

### When to Trade

| Condition | Recommendation |
|---|---|
| 5/5 TFs aligned | ✅ Best probability — take the trade |
| 4/5 TFs aligned | ✅ Good setup — trade with normal size |
| 3/5 TFs aligned | ⚠️ Weak — wait for another TF to flip or skip |
| 2/5 or below | ❌ Don't trade — mixed signals |

### Trade Management

1. **At TP1** (+50 pips): Close 30–50% of position, move SL to breakeven
2. **At TP2** (+75 pips): Close another 30–50%, let the remainder run to TP3
3. **At TP3** (+100 pips): Close all — this is the full target
4. **If SL hits before TP1**: Accept the loss — do not move the stop loss further

### Recommended Sessions for USDJPY 1M

| Priority | Session | Reason |
|---|---|---|
| ⭐⭐⭐ Best | Tokyo Open (00:00–03:00 GMT) | Highest USDJPY-specific liquidity |
| ⭐⭐⭐ Best | London Open (07:00–09:00 GMT) | Strong directional moves |
| ⭐⭐ Good | NY Open (13:00–15:00 GMT) | USD news-driven volatility |
| ❌ Avoid | Late NY / overnight | Low volume, erratic movement |

### Avoiding False Signals

- **ADX below threshold (🟡)** = market is ranging, not trending — be extra cautious even if other indicators align
- **Cooldown** prevents entering back-to-back trades — always respect it
- **Do not trade before high-impact news** (Non-farm Payrolls, FOMC, BOJ decisions) — news overrides all technical signals

### Combining with DXY Correlation Indicator

For highest confidence on USDJPY:
1. Check the **MTF Analysis** dashboard — wait for 5/5 or 4/5 alignment
2. Cross-check with the **DXY-USDJPY Correlation Indicator** in the same folder
3. Both indicators agreeing = maximum conviction trade

---

## Risk Disclaimer

> ⚠️ **IMPORTANT — READ BEFORE USE**

- This indicator is a **technical analysis tool**, not financial advice
- **Past performance does not guarantee future results.** Markets change — what works now may not work in the future
- **Multi-timeframe alignment does not guarantee a winning trade.** It improves probability, not certainty
- **All trading involves risk of loss.** You can lose your entire account
- Never trade with money you cannot afford to lose
- Always use a **stop loss** on every trade without exception
- **Test this indicator on a demo account** for at least 2–4 weeks before trading real money
- The developer takes **no responsibility** for any trading losses you incur using this indicator

---

## File Reference

```
pinescript/
├── MTF_Analysis_Indicator.pine          ← Paste this into TradingView Pine Editor
├── MTF_README.md                        ← This file
├── DXY_USDJPY_Correlation_Indicator.pine ← Companion indicator for DXY correlation
└── README.md                            ← DXY correlation indicator README
```

---

*Built for USDJPY 1M scalping | Multi-timeframe alignment strategy | Pine Script v6*
