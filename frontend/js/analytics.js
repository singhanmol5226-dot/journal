/**
 * analytics.js — Analytics calculations for MT5-enabled Trade Journal
 * Trades from backend have: symbol, trade_type, open_price, close_price,
 * open_time, close_time, volume, commission, swap, profit, pnl, outcome,
 * strategy, setup_tags, emotion_before
 */

function calcPnL(trade) {
  // pnl is already computed by backend; fall back to calculation if needed
  if (trade.pnl !== undefined && trade.pnl !== null) return parseFloat(trade.pnl) || 0;
  const entry = parseFloat(trade.open_price) || 0;
  const exit = parseFloat(trade.close_price) || 0;
  const vol = parseFloat(trade.volume) || 0;
  const commission = parseFloat(trade.commission) || 0;
  const swap = parseFloat(trade.swap) || 0;
  const profit = parseFloat(trade.profit) || 0;
  if (entry && exit && vol) {
    const raw = trade.trade_type === 'Buy' ? (exit - entry) * vol : (entry - exit) * vol;
    return parseFloat((raw - commission - swap).toFixed(2));
  }
  return parseFloat((profit - commission - swap).toFixed(2));
}

function calcOutcome(pnl) {
  if (pnl > 0) return 'Win';
  if (pnl < 0) return 'Loss';
  return 'Breakeven';
}

function calcRR(trade) {
  const entry = parseFloat(trade.open_price) || 0;
  const sl = parseFloat(trade.stop_loss) || 0;
  const tp = parseFloat(trade.take_profit) || 0;
  if (!sl || !tp || !entry || sl === entry) return null;
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  if (risk === 0) return null;
  return parseFloat((reward / risk).toFixed(2));
}

function computeAnalytics(trades) {
  if (!trades || trades.length === 0) return getEmptyAnalytics();

  const enriched = trades.map(t => ({
    ...t,
    pnl: calcPnL(t),
    outcome: t.outcome || calcOutcome(calcPnL(t)),
    rr: calcRR(t),
    // Normalized field access — backend uses open_time, emotion_before, etc.
    entryDate: (t.open_time || '').slice(0, 10),
    entryTime: (t.open_time || '').slice(11, 16),
    instrument: t.symbol || t.instrument || '',
    tradeType: t.trade_type || t.tradeType || 'Buy',
    emotionBefore: t.emotion_before || t.emotionBefore || '',
  }));

  const wins = enriched.filter(t => t.pnl > 0);
  const losses = enriched.filter(t => t.pnl < 0);
  const total = enriched.length;

  const totalPnL = enriched.reduce((s, t) => s + t.pnl, 0);
  const winRate = total > 0 ? (wins.length / total) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? Infinity : 0;

  const validRR = enriched.filter(t => t.rr !== null).map(t => t.rr);
  const avgRR = validRR.length > 0 ? parseFloat((validRR.reduce((s, v) => s + v, 0) / validRR.length).toFixed(2)) : 0;

  // Sort by open_time
  const sorted = [...enriched].sort((a, b) => (a.open_time || '') > (b.open_time || '') ? 1 : -1);

  // Streaks
  let currentStreak = 0, maxWinStreak = 0, maxLossStreak = 0, tmpW = 0, tmpL = 0;
  for (const t of sorted) {
    if (t.pnl > 0) { tmpW++; tmpL = 0; maxWinStreak = Math.max(maxWinStreak, tmpW); }
    else if (t.pnl < 0) { tmpL++; tmpW = 0; maxLossStreak = Math.max(maxLossStreak, tmpL); }
  }
  let cW = 0, cL = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].pnl > 0) { if (cL > 0) break; cW++; }
    else if (sorted[i].pnl < 0) { if (cW > 0) break; cL++; }
    else break;
  }
  currentStreak = cW > 0 ? cW : -cL;

  // Max drawdown
  let peak = 0, cumPnL = 0, maxDrawdown = 0;
  for (const t of sorted) {
    cumPnL += t.pnl;
    if (cumPnL > peak) peak = cumPnL;
    const dd = peak - cumPnL;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Expectancy
  const expectancy = (winRate / 100) * avgWin + (1 - winRate / 100) * avgLoss;

  // Equity curve — use open_time for date
  const equityCurve = [];
  let cumulative = 0;
  for (const t of sorted) {
    cumulative += t.pnl;
    equityCurve.push({
      date: (t.open_time || '').slice(0, 10),
      pnl: t.pnl,
      cumulative: parseFloat(cumulative.toFixed(2)),
    });
  }

  // Daily P&L
  const dailyMap = {};
  for (const t of enriched) {
    const d = (t.open_time || '').slice(0, 10) || 'Unknown';
    if (!dailyMap[d]) dailyMap[d] = 0;
    dailyMap[d] += t.pnl;
  }
  const dailyPnL = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }));

  // By strategy
  const stratMap = {};
  for (const t of enriched) {
    const s = t.strategy || 'Unknown';
    if (!stratMap[s]) stratMap[s] = { trades: 0, wins: 0, totalPnL: 0 };
    stratMap[s].trades++;
    if (t.pnl > 0) stratMap[s].wins++;
    stratMap[s].totalPnL += t.pnl;
  }
  const byStrategy = Object.entries(stratMap).map(([strategy, d]) => ({
    strategy,
    trades: d.trades,
    winRate: parseFloat(((d.wins / d.trades) * 100).toFixed(1)),
    avgPnL: parseFloat((d.totalPnL / d.trades).toFixed(2)),
    totalPnL: parseFloat(d.totalPnL.toFixed(2)),
  }));

  // By instrument (symbol)
  const instrMap = {};
  for (const t of enriched) {
    const s = t.instrument || 'Unknown';
    if (!instrMap[s]) instrMap[s] = { trades: 0, wins: 0, totalPnL: 0 };
    instrMap[s].trades++;
    if (t.pnl > 0) instrMap[s].wins++;
    instrMap[s].totalPnL += t.pnl;
  }
  const byInstrument = Object.entries(instrMap).map(([instrument, d]) => ({
    instrument,
    trades: d.trades,
    winRate: parseFloat(((d.wins / d.trades) * 100).toFixed(1)),
    avgPnL: parseFloat((d.totalPnL / d.trades).toFixed(2)),
    totalPnL: parseFloat(d.totalPnL.toFixed(2)),
  }));

  // By day of week — use open_time
  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dowMap = {};
  for (const t of enriched) {
    const ot = t.open_time || '';
    if (!ot) continue;
    let d;
    try { d = new Date(ot.slice(0, 10) + 'T12:00:00').getDay(); } catch { continue; }
    const name = dowNames[d];
    if (!dowMap[name]) dowMap[name] = { trades: 0, wins: 0, totalPnL: 0 };
    dowMap[name].trades++;
    if (t.pnl > 0) dowMap[name].wins++;
    dowMap[name].totalPnL += t.pnl;
  }
  const byDayOfWeek = dowNames.filter(n => dowMap[n]).map(name => ({
    day: name,
    trades: dowMap[name].trades,
    winRate: parseFloat(((dowMap[name].wins / dowMap[name].trades) * 100).toFixed(1)),
    totalPnL: parseFloat(dowMap[name].totalPnL.toFixed(2)),
  }));

  // By hour — from open_time
  const hourMap = {};
  for (const t of enriched) {
    const ot = t.open_time || '';
    if (ot.length < 13) continue;
    const hour = parseInt(ot.slice(11, 13));
    if (isNaN(hour)) continue;
    if (!hourMap[hour]) hourMap[hour] = { trades: 0, wins: 0, totalPnL: 0 };
    hourMap[hour].trades++;
    if (t.pnl > 0) hourMap[hour].wins++;
    hourMap[hour].totalPnL += t.pnl;
  }
  const byHour = Object.entries(hourMap)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([hour, d]) => ({
      hour: parseInt(hour),
      label: `${hour.toString().padStart(2, '0')}:00`,
      trades: d.trades,
      winRate: parseFloat(((d.wins / d.trades) * 100).toFixed(1)),
      totalPnL: parseFloat(d.totalPnL.toFixed(2)),
    }));

  // Monthly summary
  const monthMap = {};
  for (const t of enriched) {
    const ot = t.open_time || '';
    if (!ot) continue;
    const key = ot.slice(0, 7);
    if (!monthMap[key]) monthMap[key] = { trades: 0, wins: 0, totalPnL: 0 };
    monthMap[key].trades++;
    if (t.pnl > 0) monthMap[key].wins++;
    monthMap[key].totalPnL += t.pnl;
  }
  const byMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      trades: d.trades,
      winRate: parseFloat(((d.wins / d.trades) * 100).toFixed(1)),
      totalPnL: parseFloat(d.totalPnL.toFixed(2)),
    }));

  // Emotion analysis
  const emotionMap = {};
  for (const t of enriched) {
    const emo = t.emotionBefore || 'Unknown';
    if (!emotionMap[emo]) emotionMap[emo] = { trades: 0, wins: 0, totalPnL: 0 };
    emotionMap[emo].trades++;
    if (t.pnl > 0) emotionMap[emo].wins++;
    emotionMap[emo].totalPnL += t.pnl;
  }
  const byEmotion = Object.entries(emotionMap).map(([emotion, d]) => ({
    emotion,
    trades: d.trades,
    winRate: parseFloat(((d.wins / d.trades) * 100).toFixed(1)),
    totalPnL: parseFloat(d.totalPnL.toFixed(2)),
  }));

  // RR scatter
  const rrScatter = enriched
    .filter(t => t.rr !== null)
    .map(t => ({ x: t.rr, y: t.pnl, outcome: t.outcome, instrument: t.instrument, date: t.entryDate }));

  return {
    total,
    wins: wins.length,
    losses: losses.length,
    winRate: parseFloat(winRate.toFixed(1)),
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    largestWin: parseFloat(largestWin.toFixed(2)),
    largestLoss: parseFloat(largestLoss.toFixed(2)),
    profitFactor,
    avgRR,
    currentStreak,
    maxWinStreak,
    maxLossStreak,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    equityCurve,
    dailyPnL,
    byStrategy,
    byInstrument,
    byDayOfWeek,
    byHour,
    byMonth,
    byEmotion,
    rrScatter,
    enrichedTrades: enriched,
  };
}

function getEmptyAnalytics() {
  return {
    total: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0,
    avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
    profitFactor: 0, avgRR: 0, currentStreak: 0,
    maxWinStreak: 0, maxLossStreak: 0, maxDrawdown: 0, expectancy: 0,
    equityCurve: [], dailyPnL: [], byStrategy: [], byInstrument: [],
    byDayOfWeek: [], byHour: [], byMonth: [], byEmotion: [], rrScatter: [],
    enrichedTrades: [],
  };
}
