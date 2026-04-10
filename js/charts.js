/**
 * charts.js — Chart rendering using Chart.js
 */

let chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function destroyAllCharts() {
  Object.keys(chartInstances).forEach(id => destroyChart(id));
}

const COLORS = {
  green: '#00c896',
  red: '#ff4d6d',
  blue: '#4e9eff',
  purple: '#b57bee',
  orange: '#ffa048',
  yellow: '#ffe066',
  teal: '#00d4d4',
  gray: '#888',
  gridLine: 'rgba(255,255,255,0.06)',
  textColor: '#c0c8d8'
};

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: COLORS.textColor, font: { size: 12 } } },
    tooltip: {
      backgroundColor: '#1a1f2e',
      titleColor: '#e0e6f0',
      bodyColor: '#b0bac8',
      borderColor: '#2d3548',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      ticks: { color: COLORS.textColor, maxRotation: 45 },
      grid: { color: COLORS.gridLine }
    },
    y: {
      ticks: { color: COLORS.textColor },
      grid: { color: COLORS.gridLine }
    }
  }
};

function renderEquityCurve(analytics, currency) {
  const ctx = document.getElementById('chartEquity');
  if (!ctx) return;
  destroyChart('equity');
  if (!analytics.equityCurve.length) { ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height); return; }

  chartInstances['equity'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: analytics.equityCurve.map(p => p.date),
      datasets: [{
        label: `Cumulative P&L (${currency})`,
        data: analytics.equityCurve.map(p => p.cumulative),
        borderColor: COLORS.green,
        backgroundColor: 'rgba(0,200,150,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: analytics.equityCurve.length > 50 ? 0 : 3,
        pointBackgroundColor: COLORS.green
      }]
    },
    options: { ...baseChartOptions }
  });
}

function renderDailyPnL(analytics, currency) {
  const ctx = document.getElementById('chartDailyPnL');
  if (!ctx) return;
  destroyChart('dailyPnL');
  if (!analytics.dailyPnL.length) return;

  chartInstances['dailyPnL'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: analytics.dailyPnL.map(d => d.date),
      datasets: [{
        label: `Daily P&L (${currency})`,
        data: analytics.dailyPnL.map(d => d.pnl),
        backgroundColor: analytics.dailyPnL.map(d => d.pnl >= 0 ? 'rgba(0,200,150,0.7)' : 'rgba(255,77,109,0.7)'),
        borderColor: analytics.dailyPnL.map(d => d.pnl >= 0 ? COLORS.green : COLORS.red),
        borderWidth: 1
      }]
    },
    options: { ...baseChartOptions }
  });
}

function renderWinLossPie(analytics) {
  const ctx = document.getElementById('chartWinLoss');
  if (!ctx) return;
  destroyChart('winLoss');
  if (!analytics.total) return;

  const breakeven = analytics.total - analytics.wins - analytics.losses;
  chartInstances['winLoss'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Wins', 'Losses', 'Breakeven'],
      datasets: [{
        data: [analytics.wins, analytics.losses, breakeven],
        backgroundColor: [COLORS.green, COLORS.red, COLORS.gray],
        borderColor: '#13192b',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: COLORS.textColor } },
        tooltip: baseChartOptions.plugins.tooltip
      }
    }
  });
}

function renderStrategyChart(analytics, currency) {
  const ctx = document.getElementById('chartStrategy');
  if (!ctx) return;
  destroyChart('strategy');
  if (!analytics.byStrategy.length) return;

  const sorted = [...analytics.byStrategy].sort((a, b) => b.totalPnL - a.totalPnL);
  chartInstances['strategy'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(s => s.strategy),
      datasets: [{
        label: `P&L by Strategy (${currency})`,
        data: sorted.map(s => s.totalPnL),
        backgroundColor: sorted.map(s => s.totalPnL >= 0 ? 'rgba(0,200,150,0.7)' : 'rgba(255,77,109,0.7)'),
        borderColor: sorted.map(s => s.totalPnL >= 0 ? COLORS.green : COLORS.red),
        borderWidth: 1
      }]
    },
    options: { ...baseChartOptions }
  });
}

function renderInstrumentChart(analytics, currency) {
  const ctx = document.getElementById('chartInstrument');
  if (!ctx) return;
  destroyChart('instrument');
  if (!analytics.byInstrument.length) return;

  const sorted = [...analytics.byInstrument].sort((a, b) => b.totalPnL - a.totalPnL);
  chartInstances['instrument'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(s => s.instrument),
      datasets: [{
        label: `P&L by Instrument (${currency})`,
        data: sorted.map(s => s.totalPnL),
        backgroundColor: sorted.map(s => s.totalPnL >= 0 ? 'rgba(78,158,255,0.7)' : 'rgba(255,77,109,0.7)'),
        borderColor: sorted.map(s => s.totalPnL >= 0 ? COLORS.blue : COLORS.red),
        borderWidth: 1
      }]
    },
    options: { ...baseChartOptions }
  });
}

function renderDowChart(analytics) {
  const ctx = document.getElementById('chartDow');
  if (!ctx) return;
  destroyChart('dow');
  if (!analytics.byDayOfWeek.length) return;

  chartInstances['dow'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: analytics.byDayOfWeek.map(d => d.day),
      datasets: [
        {
          label: 'Trades',
          data: analytics.byDayOfWeek.map(d => d.trades),
          backgroundColor: 'rgba(78,158,255,0.5)',
          borderColor: COLORS.blue,
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Win Rate (%)',
          data: analytics.byDayOfWeek.map(d => d.winRate),
          backgroundColor: 'rgba(0,200,150,0.5)',
          borderColor: COLORS.green,
          borderWidth: 1,
          type: 'line',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      ...baseChartOptions,
      scales: {
        x: { ticks: { color: COLORS.textColor }, grid: { color: COLORS.gridLine } },
        y: { ticks: { color: COLORS.textColor }, grid: { color: COLORS.gridLine }, position: 'left' },
        y1: { ticks: { color: COLORS.textColor }, grid: { display: false }, position: 'right', min: 0, max: 100 }
      }
    }
  });
}

function renderHourChart(analytics) {
  const ctx = document.getElementById('chartHour');
  if (!ctx) return;
  destroyChart('hour');
  if (!analytics.byHour.length) return;

  chartInstances['hour'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: analytics.byHour.map(h => h.label),
      datasets: [{
        label: 'Trades by Hour',
        data: analytics.byHour.map(h => h.trades),
        backgroundColor: 'rgba(181,123,238,0.7)',
        borderColor: COLORS.purple,
        borderWidth: 1
      }]
    },
    options: { ...baseChartOptions }
  });
}

function renderEmotionChart(analytics) {
  const ctx = document.getElementById('chartEmotion');
  if (!ctx) return;
  destroyChart('emotion');
  if (!analytics.byEmotion.length) return;

  chartInstances['emotion'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: analytics.byEmotion.map(e => e.emotion),
      datasets: [
        {
          label: 'Win Rate (%)',
          data: analytics.byEmotion.map(e => e.winRate),
          backgroundColor: 'rgba(0,200,150,0.7)',
          borderColor: COLORS.green,
          borderWidth: 1
        },
        {
          label: 'Trades',
          data: analytics.byEmotion.map(e => e.trades),
          backgroundColor: 'rgba(78,158,255,0.5)',
          borderColor: COLORS.blue,
          borderWidth: 1
        }
      ]
    },
    options: { ...baseChartOptions }
  });
}

function renderRRScatter(analytics, currency) {
  const ctx = document.getElementById('chartRR');
  if (!ctx) return;
  destroyChart('rr');
  if (!analytics.rrScatter.length) return;

  const wins = analytics.rrScatter.filter(p => p.outcome === 'Win');
  const losses = analytics.rrScatter.filter(p => p.outcome === 'Loss');
  const be = analytics.rrScatter.filter(p => p.outcome === 'Breakeven');

  chartInstances['rr'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        { label: 'Win', data: wins.map(p => ({ x: p.x, y: p.y })), backgroundColor: 'rgba(0,200,150,0.7)' },
        { label: 'Loss', data: losses.map(p => ({ x: p.x, y: p.y })), backgroundColor: 'rgba(255,77,109,0.7)' },
        { label: 'Breakeven', data: be.map(p => ({ x: p.x, y: p.y })), backgroundColor: 'rgba(136,136,136,0.7)' }
      ]
    },
    options: {
      ...baseChartOptions,
      plugins: {
        ...baseChartOptions.plugins,
        tooltip: {
          ...baseChartOptions.plugins.tooltip,
          callbacks: {
            label: ctx => `R:R ${ctx.parsed.x} | P&L: ${currency}${ctx.parsed.y}`
          }
        }
      }
    }
  });
}

function renderAllCharts(analytics, currency) {
  renderEquityCurve(analytics, currency);
  renderDailyPnL(analytics, currency);
  renderWinLossPie(analytics);
  renderStrategyChart(analytics, currency);
  renderInstrumentChart(analytics, currency);
  renderDowChart(analytics);
  renderHourChart(analytics);
  renderEmotionChart(analytics);
  renderRRScatter(analytics, currency);
}
