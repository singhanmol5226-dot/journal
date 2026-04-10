# DXY–USDJPY Correlation Trading Signals

> **Pine Script v5 Indicator for TradingView**
> Designed for USDJPY 1-minute scalping | Max SL 30 pips | TP target 80–100 pips

---

## Table of Contents

1. [What This Indicator Does](#what-this-indicator-does)
2. [How the Correlation Logic Works](#how-the-correlation-logic-works)
3. [How to Install on TradingView](#how-to-install-on-tradingview)
4. [Input Settings Explained](#input-settings-explained)
5. [How to Read the Signals](#how-to-read-the-signals)
6. [Visual Elements on Chart](#visual-elements-on-chart)
7. [Setting Up Alerts](#setting-up-alerts)
8. [Recommended Usage Tips](#recommended-usage-tips)
9. [Risk Disclaimer](#risk-disclaimer)

---

## What This Indicator Does

This indicator watches two instruments at the same time — **DXY** (US Dollar Index) and **USDJPY** — and generates high-probability **BUY** and **SELL** signals when these two normally correlated assets diverge temporarily.

The core idea: when DXY rises but USDJPY hasn't caught up yet, there is a statistical case for USDJPY to follow (catch-up trade). The indicator measures this divergence, filters it through correlation strength, RSI, and MACD momentum, then draws your **entry, stop loss, TP1, TP2, and TP3** directly on the chart.

When a trade closes (either at a TP or the SL), the chart shows exactly what happened and tracks your running win rate and total pips.

---

## How the Correlation Logic Works

### Pearson Rolling Correlation

The indicator calculates a rolling [Pearson correlation coefficient](https://en.wikipedia.org/wiki/Pearson_correlation_coefficient) between USDJPY close prices and DXY close prices over three windows:

| Window | Default | Purpose |
|---|---|---|
| Short | 20 bars | Quick, reactive correlation |
| Medium | 50 bars | Primary signal filter |
| Long | 100 bars | Structural / trend correlation |

A value of **+1.0** means perfect positive correlation (they move together).  
A value of **0.0** means no relationship.  
A value of **−1.0** means perfect inverse correlation.

DXY and USDJPY historically maintain a **strong positive correlation** (~0.8–0.95). The indicator only generates signals when the medium-term correlation is **above your threshold** (default: 0.7).

### Divergence Detection

Every bar, the indicator measures the **percentage change** over the last 3 bars for both DXY and USDJPY.

- **BUY Divergence**: DXY rose ≥ `i_div_pct`% but USDJPY moved less than 50% of DXY's move → USDJPY is lagging, likely to catch up → BUY
- **SELL Divergence**: DXY fell ≥ `i_div_pct`% but USDJPY hasn't fallen as much → USDJPY is lagging to the downside → SELL

### Confirmation Filters

Before a signal fires, **all** of the following must be true:

1. **Correlation is strong** — medium-term Pearson ≥ threshold (default 0.7)
2. **Divergence detected** — DXY moved, USDJPY lagged
3. **RSI confirms momentum** — RSI > 50 for BUY (not yet overbought), RSI < 50 for SELL (not yet oversold)
4. **MACD confirms momentum** — MACD line crosses or is above signal for BUY; below for SELL
5. **Not low-volatility / ranging** — ATR is in the top 80% of its recent range
6. **Cooldown respected** — no signal fired in the last N bars (default: 10)

---

## How to Install on TradingView

### Step 1 — Open Pine Editor

1. Go to [tradingview.com](https://www.tradingview.com) and open any chart
2. At the bottom of the screen, click the **"Pine Editor"** tab
3. If you don't see it, click the `{}` icon in the bottom toolbar

```
[Screenshot: Bottom toolbar with Pine Editor tab highlighted]
```

### Step 2 — Paste the Code

1. In the Pine Editor, **select all** existing code (`Ctrl+A` / `Cmd+A`) and **delete** it
2. Open the file `DXY_USDJPY_Correlation_Indicator.pine` from this folder
3. **Copy** all the code (`Ctrl+A` → `Ctrl+C`)
4. **Paste** it into the Pine Editor (`Ctrl+V`)

```
[Screenshot: Pine Editor with code pasted in]
```

### Step 3 — Add to Chart

1. Click the blue **"Add to chart"** button (top right of Pine Editor panel)
2. The indicator will load on your chart

```
[Screenshot: "Add to chart" button highlighted]
```

### Step 4 — Switch to USDJPY 1-Minute Chart

> ⚠️ **The indicator must run on a USDJPY chart.** It pulls DXY data automatically via `request.security`.

1. In the search box (top left), type **USDJPY** and select it
2. Set the timeframe to **1** (1 minute) in the timeframe dropdown

```
[Screenshot: USDJPY 1M chart with indicator active]
```

### Step 5 — Adjust Settings (Optional)

1. Click the **⚙️ Settings icon** next to the indicator name on the chart
2. Adjust inputs to match your trading style (see [Input Settings](#input-settings-explained) below)
3. Click **OK**

---

## Input Settings Explained

### DXY Symbol

| Setting | Default | Description |
|---|---|---|
| DXY Symbol | `TVC:DXY` | The DXY ticker to use. `TVC:DXY` works on most TradingView plans. Alternatives: `CAPITALCOM:DXY`, `INDEX:DXY` |

### Correlation Settings

| Setting | Default | Description |
|---|---|---|
| Short Correlation Period | 20 | Number of bars for the fast correlation window |
| Medium Correlation Period | 50 | **Primary filter** — signals only fire when this is ≥ threshold |
| Long Correlation Period | 100 | Structural correlation for reference |
| Min Correlation Threshold | 0.70 | Minimum correlation required to generate a signal (0–1). Raise to 0.80+ for stricter signals |

### Signal Settings

| Setting | Default | Description |
|---|---|---|
| Signal Cooldown (bars) | 10 | Minimum bars between signals to avoid overtrading |
| DXY Move % to trigger divergence | 0.05% | How much DXY must move (%) before divergence is measured |

### Stop Loss & Take Profit

| Setting | Default | Description |
|---|---|---|
| SL Method | ATR | `ATR` = dynamic SL based on volatility; `Fixed Pips` = exact pip amount |
| ATR Period | 14 | Period for Average True Range calculation |
| ATR Multiplier for SL | 1.5 | SL distance = ATR × multiplier (capped at Max SL) |
| Max SL (pips) | 30 | Hard cap on SL size in pips |
| Fixed SL (pips) | 25 | Used only when SL Method = Fixed Pips |
| TP1 R:R Ratio | 2.0 | TP1 = SL × 2.0 (e.g., 25 pip SL → 50 pip TP1) |
| TP2 R:R Ratio | 3.0 | TP2 = SL × 3.0 (e.g., 25 pip SL → 75 pip TP2) |
| TP3 R:R Ratio | 4.0 | TP3 = SL × 4.0 (e.g., 25 pip SL → 100 pip TP3) |

### RSI Settings

| Setting | Default | Description |
|---|---|---|
| RSI Period | 14 | Standard RSI period |
| RSI Overbought Level | 60 | RSI must be **below** this for a BUY signal (avoids buying at extremes) |
| RSI Oversold Level | 40 | RSI must be **above** this for a SELL signal |

### MACD Settings

| Setting | Default | Description |
|---|---|---|
| MACD Fast Length | 12 | Fast EMA period |
| MACD Slow Length | 26 | Slow EMA period |
| MACD Signal Length | 9 | Signal line period |

### Display Settings

| Setting | Default | Description |
|---|---|---|
| Show TP Lines | ✅ On | Draw TP1/TP2/TP3 horizontal lines on chart |
| Show SL Line | ✅ On | Draw SL horizontal line on chart |
| Show Signal Labels | ✅ On | Show BUY/SELL labels with entry/SL/TP values |
| Show Correlation Panel | ✅ On | Show the info table in the top-right corner |
| Background Color During Trade | ✅ On | Light green tint during long, light red tint during short |

---

## How to Read the Signals

### BUY Signal 🟢

A **green upward triangle** below the candle with a "BUY" label appears when:

- DXY has moved up but USDJPY hasn't followed yet (bullish divergence)
- The medium-term DXY–USDJPY correlation is ≥ 0.70
- RSI is above 50 (bullish momentum, not overbought)
- MACD line is above or crossing the signal line
- Volatility is not in a ranging / low-volatility state

**The label shows:**
```
🟢 BUY
Entry: 149.250
SL: 149.000 (-25 pips)
TP1: 149.750 (+50 pips)
TP2: 150.000 (+75 pips)
TP3: 150.250 (+100 pips)
```

### SELL Signal 🔴

A **red downward triangle** above the candle with a "SELL" label appears when:

- DXY has moved down but USDJPY hasn't followed yet (bearish divergence)
- Correlation is strong, RSI is below 50, MACD is bearish

### Trade Result Labels

When a trade closes, a label appears at the close price:

| Outcome | Label | Color |
|---|---|---|
| TP1 reached | `✅ TP1 HIT (+50 pips)` | Light green |
| TP2 reached | `✅ TP2 HIT (+75 pips)` | Green |
| TP3 reached | `✅ TP3 HIT (+100 pips)` | Teal |
| SL hit | `❌ SL HIT (-25 pips)` | Red |

> **Note on partial closes & statistics**: The indicator tracks TP1 hits and SL hits independently. If TP1 is hit first and then price later reverses to the SL, the statistics record **both** a win (for the TP1 hit) and a loss (for the SL hit) — reflecting the partial close scenario where you locked in some profit at TP1 before price reversed.

---

## Visual Elements on Chart

### Lines Drawn During Active Trade

| Line | Color | Style | Meaning |
|---|---|---|---|
| Entry | White | Solid | Your entry price |
| SL | Red | Dashed | Stop loss — close trade if price reaches here |
| TP1 | Lime | Dotted thin | First target — consider partial close (30–50%) |
| TP2 | Green | Dotted medium | Main target — close most or all of position |
| TP3 | Teal | Dotted thick | Extended runner target |

All lines extend right as the trade progresses and are **removed automatically** when the trade closes.

### Correlation Panel (Top Right)

```
┌──────────────────────────────┐
│  DXY-JPY CORRELATION         │
├─────────────────┬────────────┤
│ Short Corr (20) │  0.84      │
│ Med Corr (50)   │  0.79 ✅   │
│ Long Corr (100) │  0.72      │
│ Corr Trend      │ ↑ Rising   │
│ Strength        │ Medium ✅  │
│ Trade           │ LONG 🟢    │
│ Signals / WR    │ 12 / 75%   │
│ Total Pips      │ +340 pips  │
└─────────────────┴────────────┘
```

---

## Setting Up Alerts

To get notified on your phone or desktop:

1. Right-click on the chart → **"Add Alert"** (or press `Alt+A`)
2. In the **Condition** dropdown, select **"DXY-USDJPY Correlation Signals"**
3. Choose the alert type:
   - **BUY Signal** — fires when a new buy signal appears
   - **SELL Signal** — fires when a new sell signal appears
   - **TP1 Hit** — fires when TP1 is reached
   - **TP2 Hit** — fires when TP2 is reached
   - **TP3 Hit** — fires when TP3 is reached
   - **SL Hit** — fires when stop loss is hit
4. Set expiry (e.g., "Open-ended")
5. Add notification method (TradingView app, email, webhook)
6. Click **Create**

Alert messages include direction, entry price, and all SL/TP levels for quick reference.

---

## Recommended Usage Tips

### Best Timeframe
- **Designed for 1-minute (1M)** charts on USDJPY
- Can be tested on 5M for fewer but more reliable signals

### Best Sessions
| Session | Quality |
|---|---|
| Tokyo Open (00:00–03:00 UTC) | ⭐⭐⭐ Best — highest USDJPY liquidity |
| London Open (07:00–09:00 UTC) | ⭐⭐⭐ Best — high volatility, strong moves |
| New York Open (13:00–15:00 UTC) | ⭐⭐ Good — especially on USD news days |
| Overnight / Low liquidity | ❌ Avoid — low ATR filter will suppress most signals |

### DXY Data Tips
- Use `TVC:DXY` as the default — it's the most reliable free source on TradingView
- If your plan doesn't have access to `TVC:DXY`, try `CAPITALCOM:DXY` or `INDEX:DXY`
- Make sure your chart's DXY data loads — you'll see it in the correlation panel values

### Trade Management Suggestions
1. **At TP1**: Close 30–50% of your position, move SL to breakeven
2. **At TP2**: Close another 30–50%, let the remainder run to TP3
3. **At TP3**: Close everything (or trail SL tightly)
4. **If SL hits before TP1**: Accept the loss, do not move SL

### Correlation Threshold
- **0.70** (default): Good balance of signal frequency vs quality
- **0.80**: Fewer signals, higher confidence — recommended during ranging markets
- **0.60**: More signals, more noise — only use during strong trending periods

### Risk Management
- Risk no more than **1–2% of your account per trade**
- The indicator shows a SL of up to 30 pips — always calculate your position size accordingly
- Example: 1% risk on $1,000 account = $10 risk. If SL = 25 pips, position size = $10 / (25 × pip value)

---

## Risk Disclaimer

> ⚠️ **IMPORTANT — READ BEFORE USE**

- This indicator is a **technical analysis tool**, not financial advice.
- **Past performance does not guarantee future results.** Correlation between DXY and USDJPY can break down during major news events, central bank interventions, or unusual market conditions.
- **All trading involves risk of loss.** You can lose more than you invest.
- Never trade with money you cannot afford to lose.
- Always use a **stop loss** on every trade.
- This indicator is designed for educational and analytical purposes. Test thoroughly on a **demo account** before trading with real money.
- The developer of this indicator takes **no responsibility** for any trading losses you may incur.

---

## File Reference

```
pinescript/
├── DXY_USDJPY_Correlation_Indicator.pine   ← Paste this into TradingView Pine Editor
└── README.md                                ← This file
```

---

*Built for the USDJPY 1M scalping strategy | DXY correlation divergence approach*
