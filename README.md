# 📈 Trade Journal — Offline Trading Journal

A **fully offline, browser-based trade journaling application** that works entirely without internet after the first load. All your data is stored locally in your browser using **IndexedDB** — your trades will **never disappear** between sessions.

---

## 🚀 How to Use

1. **Download or clone** this repository
2. **Open `index.html`** in any modern browser (Chrome, Edge, Firefox)
3. That's it! No server, no install, no internet required after first load

> **Tip:** For full offline support including Chart.js, open the app once with internet so the service worker can cache everything. After that, it works 100% offline.

---

## ✨ Features

### 💾 Data Persistence (Never Lose Trades Again)
- Uses **IndexedDB** for all storage — trades survive browser restarts, tab closes, and computer reboots
- Visible **confirmation toast** whenever a trade is saved
- **Export to JSON** and **Import from JSON** for backup/restore

### 📝 Detailed Trade Entry
- Entry & Exit date/time
- Instrument/Symbol (customizable list + custom input)
- Trade Type: Buy (Long) / Sell (Short)
- Entry Price, Exit Price, Quantity/Lot Size, Fees/Commission
- Stop Loss and Target prices
- Strategy (Breakout, Reversal, Scalping, Swing, and more + custom)
- Setup Tags
- Emotion/Psychology before and during trade
- Notes/Remarks text area
- Multiple screenshot uploads (drag & drop, paste, file picker)
- **Auto-calculated P&L and Outcome** (Win/Loss/Breakeven)

### 📸 Screenshot Support
- **Drag & drop** chart screenshots into the dropzone
- **Paste from clipboard** (Ctrl+V) to capture screenshots instantly
- **File picker** for browsing your files
- Thumbnails in trade list with click-to-expand lightbox
- Multiple screenshots per trade
- Stored as base64 in IndexedDB — fully offline

### 📊 Performance Dashboard
**Summary Cards:**
- Total Trades | Win Rate | Total P&L
- Average Win vs Average Loss
- Largest Win & Largest Loss
- Profit Factor | Average R:R
- Current Winning/Losing Streak
- Max Drawdown | Expectancy per trade

**Charts & Visualizations:**
1. Equity Curve (Cumulative P&L over time)
2. Daily P&L Bar Chart (green/red)
3. Win/Loss Donut Chart
4. P&L by Strategy
5. P&L by Instrument
6. Trade Distribution by Day of Week
7. Trade Distribution by Hour
8. Emotion vs Performance
9. Risk-Reward Scatter Plot

### 📋 Trade Log
- Sortable table (click column headers)
- Filter by date range, instrument, strategy, outcome
- Search by notes/remarks/tags
- View full trade details with screenshots
- Edit and delete trades (with confirmation)

### ⚙️ Settings
- Currency symbol preference (₹, $, €, etc.)
- Customizable instrument/symbol list
- Export all data to JSON
- Import from JSON (merge or replace)
- Clear all data option

### 🌐 Fully Offline
- Service Worker caches all assets and Chart.js CDN
- Works offline after first internet load

---

## 📁 File Structure

```
index.html          — Main HTML file
css/style.css       — Dark theme styles
js/app.js           — Main app logic, routing, UI
js/db.js            — IndexedDB wrapper (CRUD operations)
js/analytics.js     — All analytics calculations
js/charts.js        — Chart.js rendering
sw.js               — Service Worker for offline support
README.md           — This file
```

---

## 🖼️ Screenshots

*(Add screenshots of your app here after setup)*

---

## 🔧 Technical Details

- **Pure HTML + CSS + JavaScript** — no frameworks, no build tools, no server
- **IndexedDB** via native browser API — handles large data including base64 screenshots
- **Chart.js 4.x** via CDN (cached offline by service worker)
- Works by simply opening `index.html` — no `npm install` or setup required

---

## 💾 Backup & Restore

1. Go to **Settings** → **Export to JSON** to download a backup file
2. To restore: **Settings** → **Import from JSON** → choose your backup file
3. Choose "Merge" to add to existing trades, or "Replace All" to restore fresh
