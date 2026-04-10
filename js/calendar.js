/**
 * calendar.js — Trading Calendar View
 */

let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth(); // 0-indexed

function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;

  const c = settings.currency;
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

  // Filter trades for this month
  const monthStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}`;
  const monthTrades = allTrades.filter(t => (t.entryDate || '').startsWith(monthStr));

  // Group by day
  const dayMap = {};
  for (const t of monthTrades) {
    const d = t.entryDate;
    if (!d) continue;
    if (!dayMap[d]) dayMap[d] = [];
    const pnl = calcPnL(t);
    dayMap[d].push({ ...t, pnl });
  }

  // Monthly stats
  const monthPnL = Object.values(dayMap).flat().reduce((s, t) => s + t.pnl, 0);
  const tradingDays = Object.keys(dayMap).length;
  const allMonthTrades = Object.values(dayMap).flat();
  const wins = allMonthTrades.filter(t => t.pnl > 0).length;
  const winRate = allMonthTrades.length ? Math.round(wins / allMonthTrades.length * 100) : 0;

  // Calendar grid
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // Weekly totals: week index -> pnl
  const weekTotals = {};
  const dayWeeks = {}; // day number -> week index

  let cells = [];
  // Fill leading empty cells
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Calculate week index for each day (row in grid)
  for (let i = 0; i < cells.length; i++) {
    const weekIdx = Math.floor(i / 7);
    const day = cells[i];
    if (day === null) continue;
    dayWeeks[day] = weekIdx;
    const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayPnL = (dayMap[dateStr] || []).reduce((s, t) => s + t.pnl, 0);
    weekTotals[weekIdx] = (weekTotals[weekIdx] || 0) + dayPnL;
  }

  // Pad cells to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const numWeeks = cells.length / 7;

  function getDayStyle(dateStr) {
    const trades = dayMap[dateStr];
    if (!trades || !trades.length) return '';
    const pnl = trades.reduce((s, t) => s + t.pnl, 0);
    const intensity = Math.min(Math.abs(pnl) / 2000, 1);
    if (pnl > 0) {
      const alpha = 0.15 + intensity * 0.7;
      return `background: rgba(0, 200, 150, ${alpha.toFixed(2)});`;
    } else {
      const alpha = 0.15 + intensity * 0.7;
      return `background: rgba(255, 77, 109, ${alpha.toFixed(2)});`;
    }
  }

  function getDayClass(dateStr) {
    const trades = dayMap[dateStr];
    let cls = 'calendar-day';
    if (!trades || !trades.length) cls += ' day-empty';
    else {
      const pnl = trades.reduce((s, t) => s + t.pnl, 0);
      cls += pnl >= 0 ? ' day-profit' : ' day-loss';
    }
    if (dateStr === todayStr) cls += ' day-today';
    return cls;
  }

  // Build rows
  let gridRows = '';
  for (let w = 0; w < numWeeks; w++) {
    const weekCells = cells.slice(w * 7, (w + 1) * 7);
    let rowHtml = '';
    for (const day of weekCells) {
      if (day === null) {
        rowHtml += '<div class="calendar-day day-filler"></div>';
      } else {
        const dateStr = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const trades = dayMap[dateStr] || [];
        const dayPnL = trades.reduce((s, t) => s + t.pnl, 0);
        const style = getDayStyle(dateStr);
        const cls = getDayClass(dateStr);
        const pnlLabel = trades.length ? `<div class="day-pnl ${dayPnL >= 0 ? 'positive' : 'negative'}">${dayPnL >= 0 ? '+' : ''}${dayPnL.toFixed(0)}</div>` : '';
        const tradeCount = trades.length ? `<div class="day-trade-count">${trades.length}T</div>` : '';
        rowHtml += `<div class="${cls}" style="${style}" onclick="showDayDetail('${dateStr}')">
          <div class="day-num">${day}</div>
          ${pnlLabel}
          ${tradeCount}
        </div>`;
      }
    }
    const wt = weekTotals[w] || 0;
    const wtClass = wt >= 0 ? 'positive' : 'negative';
    rowHtml += `<div class="calendar-week-total ${wtClass}">${wt >= 0 ? '+' : ''}${c}${Math.abs(wt).toFixed(0)}</div>`;
    gridRows += `<div class="calendar-row">${rowHtml}</div>`;
  }

  const pnlClass = monthPnL >= 0 ? 'positive' : 'negative';

  container.innerHTML = `
    <div class="calendar-stat-bar">
      <div class="cal-stat">
        <span class="cal-stat-label">Total P&L</span>
        <span class="cal-stat-value ${pnlClass}">${monthPnL >= 0 ? '+' : ''}${c}${Math.abs(monthPnL).toFixed(2)}</span>
      </div>
      <div class="cal-stat">
        <span class="cal-stat-label">Trading Days</span>
        <span class="cal-stat-value">${tradingDays}</span>
      </div>
      <div class="cal-stat">
        <span class="cal-stat-label">Win Rate</span>
        <span class="cal-stat-value">${winRate}%</span>
      </div>
      <div class="cal-stat">
        <span class="cal-stat-label">Trades</span>
        <span class="cal-stat-value">${allMonthTrades.length}</span>
      </div>
    </div>

    <div class="calendar-nav">
      <button class="btn btn-secondary btn-sm" onclick="navigateCalendar(-1)">◀ Prev</button>
      <h3 class="calendar-month-title">${monthNames[calendarMonth]} ${calendarYear}</h3>
      <button class="btn btn-secondary btn-sm" onclick="navigateCalendar(1)">Next ▶</button>
    </div>

    <div class="calendar-grid-wrapper">
      <div class="calendar-header-row">
        <div class="calendar-weekday">Sun</div>
        <div class="calendar-weekday">Mon</div>
        <div class="calendar-weekday">Tue</div>
        <div class="calendar-weekday">Wed</div>
        <div class="calendar-weekday">Thu</div>
        <div class="calendar-weekday">Fri</div>
        <div class="calendar-weekday">Sat</div>
        <div class="calendar-weekday">Week</div>
      </div>
      ${gridRows}
    </div>

    <div class="calendar-monthly-total">
      Monthly Total: <span class="${pnlClass}">${monthPnL >= 0 ? '+' : ''}${c}${Math.abs(monthPnL).toFixed(2)}</span>
    </div>
  `;
}

function navigateCalendar(dir) {
  calendarMonth += dir;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
}

function showDayDetail(dateStr) {
  const monthStr = dateStr.slice(0, 7);
  const dayTrades = allTrades
    .filter(t => (t.entryDate || '').startsWith(dateStr))
    .map(t => ({ ...t, pnl: calcPnL(t) }));

  if (!dayTrades.length) {
    openModal(`📅 ${dateStr}`, '<p style="color:var(--text-secondary);padding:20px 0;">No trades on this day.</p>');
    return;
  }

  const totalPnL = dayTrades.reduce((s, t) => s + t.pnl, 0);
  const c = settings.currency;
  const pnlClass = totalPnL >= 0 ? 'positive' : 'negative';

  const rows = dayTrades.map(t => `
    <tr class="trade-row" onclick="viewTrade(${t.id}); closeModal();" style="cursor:pointer;">
      <td>${t.instrument || '—'}</td>
      <td><span class="badge ${t.tradeType === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.tradeType || '—'}</span></td>
      <td>${t.entryPrice || '—'}</td>
      <td>${t.exitPrice || '—'}</td>
      <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(t.pnl, c)}</td>
      <td><span class="badge badge-${(t.outcome || calcOutcome(t.pnl)).toLowerCase()}">${t.outcome || calcOutcome(t.pnl)}</span></td>
    </tr>
  `).join('');

  const content = `
    <div style="margin-bottom:12px;">
      <span style="font-size:15px;font-weight:600;">Day Total: </span>
      <span class="${pnlClass}" style="font-size:15px;font-weight:700;">${totalPnL >= 0 ? '+' : ''}${formatPnL(totalPnL, c)}</span>
      &nbsp;·&nbsp; ${dayTrades.length} trade${dayTrades.length !== 1 ? 's' : ''}
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Instrument</th><th>Type</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Outcome</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
  `;
  openModal(`📅 Trades — ${dateStr}`, content);
}

window.navigateCalendar = navigateCalendar;
window.showDayDetail = showDayDetail;
