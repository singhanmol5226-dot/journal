/**
 * ai.js — AI Analysis: Built-in Insights + OpenAI Integration
 */

// Thresholds for built-in insight detection
const OVERTRADING_THRESHOLD = 5; // trades per day considered overtrading
const MAX_LOSS_BAD_THRESHOLD = -1000; // single loss below this is flagged as high-risk

// Local escapeHtml fallback (app.js defines the authoritative version globally)
function _aiEscapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _esc(str) { return typeof escapeHtml === 'function' ? escapeHtml(str) : _aiEscapeHtml(str); }

let aiChatHistory = [];
let aiOpenAIKey = '';

function renderAISection() {
  const container = document.getElementById('aiContainer');
  if (!container) return;

  const savedKey = (typeof settings !== 'undefined' && settings.openaiKey) ? settings.openaiKey : '';
  aiOpenAIKey = savedKey;

  const insights = generateBuiltinInsights(allTrades);

  const insightCards = insights.length
    ? insights.map(ins => `
        <div class="insight-card insight-${ins.type}">
          <div class="insight-icon">${ins.icon}</div>
          <div class="insight-content">
            <div class="insight-title">${_esc(ins.title)}</div>
            <div class="insight-body">${_esc(ins.body)}</div>
          </div>
        </div>
      `).join('')
    : '<p class="empty-state" style="padding:24px 0;">Add some trades to see insights.</p>';

  container.innerHTML = `
    <div class="ai-section-grid">
      <!-- Built-in Insights -->
      <div class="ai-panel">
        <div class="ai-panel-header">
          <h3>🧠 Built-in Insights</h3>
          <button class="btn btn-secondary btn-sm" onclick="downloadAIReport()">📄 Generate Full Report</button>
        </div>
        <div class="insight-cards-container">${insightCards}</div>
      </div>

      <!-- OpenAI Integration -->
      <div class="ai-panel">
        <div class="ai-panel-header">
          <h3>🤖 OpenAI Analysis</h3>
        </div>
        <div class="openai-key-section">
          <label style="font-size:13px;color:var(--text-secondary);display:block;margin-bottom:6px;">OpenAI API Key (stored locally)</label>
          <div style="display:flex;gap:8px;">
            <input type="password" id="openaiKeyInput" class="form-input" placeholder="sk-..." value="${_esc(savedKey)}" style="flex:1;">
            <button class="btn btn-primary btn-sm" onclick="saveOpenAIKey()">Save</button>
          </div>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:6px;">
            Your key is stored only in your browser. It is never sent anywhere except OpenAI's API.
          </p>
        </div>
        <div style="margin-bottom:12px;">
          <button class="btn btn-success" onclick="analyzeWithOpenAIBtn()">🔍 Analyze My Trades with AI</button>
        </div>
        <div class="ai-chat-container" id="aiChatMessages"></div>
        <div class="ai-chat-input-row">
          <textarea id="aiChatInput" class="form-input" placeholder="Ask about your trading patterns..." rows="2" style="flex:1;resize:none;"></textarea>
          <button class="btn btn-primary" onclick="sendAIChat()">Send ↑</button>
        </div>
      </div>
    </div>
  `;

  renderChatHistory();

  // Allow Enter to send (Shift+Enter for newline)
  const chatInput = document.getElementById('aiChatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAIChat();
      }
    });
  }
}

function generateBuiltinInsights(trades) {
  if (!trades || !trades.length) return [];
  const insights = [];
  const enriched = trades.map(t => ({ ...t, pnl: calcPnL(t) }));

  // ── Best/Worst day of week ──────────────────────────────────────────────────
  const dowNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dowStats = {};
  for (const t of enriched) {
    if (!t.entryDate) continue;
    const dow = new Date(t.entryDate + 'T12:00:00').getDay();
    if (!dowStats[dow]) dowStats[dow] = { wins: 0, total: 0, pnl: 0 };
    dowStats[dow].total++;
    dowStats[dow].pnl += t.pnl;
    if (t.pnl > 0) dowStats[dow].wins++;
  }
  const dowArr = Object.entries(dowStats).map(([d, s]) => ({
    name: dowNames[+d], wr: s.total ? Math.round(s.wins / s.total * 100) : 0, pnl: s.pnl, total: s.total
  }));
  if (dowArr.length >= 2) {
    const bestDow = dowArr.reduce((a, b) => (b.wr > a.wr || (b.wr === a.wr && b.pnl > a.pnl)) ? b : a);
    const worstDow = dowArr.reduce((a, b) => (b.wr < a.wr || (b.wr === a.wr && b.pnl < a.pnl)) ? b : a);
    insights.push({ icon: '🏆', title: `Best Day: ${bestDow.name}`, body: `${bestDow.wr}% win rate, ${bestDow.total} trades, total P&L: ${bestDow.pnl.toFixed(2)}`, type: 'good' });
    insights.push({ icon: '⚠️', title: `Weakest Day: ${worstDow.name}`, body: `${worstDow.wr}% win rate, ${worstDow.total} trades, total P&L: ${worstDow.pnl.toFixed(2)}`, type: 'bad' });
  }

  // ── Best strategy ──────────────────────────────────────────────────────────
  const stratStats = {};
  for (const t of enriched) {
    const s = t.strategy || 'Unknown';
    if (!stratStats[s]) stratStats[s] = { wins: 0, total: 0, pnl: 0 };
    stratStats[s].total++;
    stratStats[s].pnl += t.pnl;
    if (t.pnl > 0) stratStats[s].wins++;
  }
  const stratArr = Object.entries(stratStats)
    .filter(([, s]) => s.total >= 2)
    .map(([name, s]) => ({ name, wr: Math.round(s.wins / s.total * 100), pnl: s.pnl, total: s.total }));
  if (stratArr.length) {
    const best = stratArr.reduce((a, b) => b.pnl > a.pnl ? b : a);
    insights.push({ icon: '📈', title: `Best Strategy: ${best.name}`, body: `${best.wr}% win rate, ${best.total} trades, total P&L: ${best.pnl.toFixed(2)}`, type: 'good' });
  }

  // ── Emotion correlation ────────────────────────────────────────────────────
  const emotionStats = {};
  for (const t of enriched) {
    const e = t.emotionBefore || '';
    if (!e) continue;
    if (!emotionStats[e]) emotionStats[e] = { wins: 0, total: 0 };
    emotionStats[e].total++;
    if (t.pnl > 0) emotionStats[e].wins++;
  }
  const emotionArr = Object.entries(emotionStats)
    .filter(([, s]) => s.total >= 2)
    .map(([name, s]) => ({ name, wr: Math.round(s.wins / s.total * 100), total: s.total }));
  if (emotionArr.length) {
    const bestEmo = emotionArr.reduce((a, b) => b.wr > a.wr ? b : a);
    const worstEmo = emotionArr.reduce((a, b) => b.wr < a.wr ? b : a);
    insights.push({ icon: '😊', title: `Emotion: "${bestEmo.name}" → Most Profitable`, body: `${bestEmo.wr}% win rate across ${bestEmo.total} trades with this emotion.`, type: 'good' });
    if (worstEmo.name !== bestEmo.name) {
      insights.push({ icon: '😟', title: `Emotion: "${worstEmo.name}" → Hurts Performance`, body: `Only ${worstEmo.wr}% win rate across ${worstEmo.total} trades with this emotion.`, type: 'bad' });
    }
  }

  // ── Overtrading detector ───────────────────────────────────────────────────
  const tradesPerDay = {};
  for (const t of enriched) {
    if (!t.entryDate) continue;
    tradesPerDay[t.entryDate] = (tradesPerDay[t.entryDate] || 0) + 1;
  }
  const overtradeDays = Object.values(tradesPerDay).filter(n => n >= OVERTRADING_THRESHOLD).length;
  if (overtradeDays > 0) {
    insights.push({ icon: '🔥', title: 'Overtrading Detected', body: `You had ${overtradeDays} day(s) with ${OVERTRADING_THRESHOLD} or more trades. Overtrading often leads to emotional decisions.`, type: 'bad' });
  }

  // ── Revenge trading detector ───────────────────────────────────────────────
  const sorted = [...enriched].sort((a, b) => (a.entryDate || '') > (b.entryDate || '') ? 1 : -1);
  let revengeCount = 0;
  for (let i = 2; i < sorted.length; i++) {
    const prev2 = sorted[i - 2];
    const prev1 = sorted[i - 1];
    const curr = sorted[i];
    if (prev2.pnl < 0 && prev1.pnl < 0) {
      const sameDayBefore = (prev1.entryDate === prev2.entryDate) || (prev1.entryDate === curr.entryDate);
      if (sameDayBefore) revengeCount++;
    }
  }
  if (revengeCount > 0) {
    insights.push({ icon: '😤', title: 'Possible Revenge Trading', body: `Detected ${revengeCount} instance(s) of trading again after 2 consecutive losses on the same day. Stay disciplined.`, type: 'bad' });
  }

  // ── Risk analysis ──────────────────────────────────────────────────────────
  const rrTrades = enriched.filter(t => t.stopLoss && t.target && t.entryPrice);
  if (rrTrades.length) {
    const avgRR = rrTrades.reduce((s, t) => {
      const ep = parseFloat(t.entryPrice) || 0;
      const sl = parseFloat(t.stopLoss) || 0;
      const tgt = parseFloat(t.target) || 0;
      const risk = Math.abs(ep - sl);
      const reward = Math.abs(tgt - ep);
      return s + (risk > 0 ? reward / risk : 0);
    }, 0) / rrTrades.length;
    insights.push({ icon: '⚖️', title: 'Risk-Reward Analysis', body: `Average planned R:R is ${avgRR.toFixed(2)}:1 across ${rrTrades.length} trades with stop/target set. ${avgRR >= 2 ? 'Excellent!' : avgRR >= 1 ? 'Good, aim for 2:1+.' : 'Consider improving your R:R.'}`, type: avgRR >= 2 ? 'good' : avgRR >= 1 ? 'neutral' : 'bad' });

    const maxLoss = Math.min(...enriched.map(t => t.pnl));
    insights.push({ icon: '🛡️', title: 'Max Single Loss', body: `Your worst trade lost ${Math.abs(maxLoss).toFixed(2)}. Make sure this aligns with your risk per trade rules.`, type: maxLoss < MAX_LOSS_BAD_THRESHOLD ? 'bad' : 'neutral' });
  }

  // ── Morning vs Afternoon ───────────────────────────────────────────────────
  const tradesWithTime = enriched.filter(t => t.entryTime);
  if (tradesWithTime.length >= 4) {
    const morningTrades = tradesWithTime.filter(t => {
      const h = parseInt(t.entryTime.split(':')[0], 10);
      return h < 12;
    });
    const afternoonTrades = tradesWithTime.filter(t => {
      const h = parseInt(t.entryTime.split(':')[0], 10);
      return h >= 12;
    });
    if (morningTrades.length && afternoonTrades.length) {
      const morningWR = Math.round(morningTrades.filter(t => t.pnl > 0).length / morningTrades.length * 100);
      const afternoonWR = Math.round(afternoonTrades.filter(t => t.pnl > 0).length / afternoonTrades.length * 100);
      const better = morningWR >= afternoonWR ? 'morning' : 'afternoon';
      insights.push({ icon: '🕐', title: 'Session Performance', body: `Morning: ${morningWR}% WR (${morningTrades.length} trades) | Afternoon: ${afternoonWR}% WR (${afternoonTrades.length} trades). You perform better in the ${better}.`, type: 'neutral' });
    }
  }

  return insights;
}

function downloadAIReport() {
  if (!allTrades.length) { showToast('No trades to report.', 'error'); return; }
  const insights = generateBuiltinInsights(allTrades);
  const enriched = allTrades.map(t => ({ ...t, pnl: calcPnL(t) }));
  const totalPnL = enriched.reduce((s, t) => s + t.pnl, 0);
  const wins = enriched.filter(t => t.pnl > 0).length;
  const losses = enriched.filter(t => t.pnl < 0).length;
  const winRate = enriched.length ? Math.round(wins / enriched.length * 100) : 0;

  let report = `TRADE JOURNAL — FULL ANALYSIS REPORT\n`;
  report += `Generated: ${new Date().toLocaleString()}\n`;
  report += `${'='.repeat(50)}\n\n`;
  report += `SUMMARY\n${'─'.repeat(30)}\n`;
  report += `Total Trades: ${enriched.length}\n`;
  report += `Wins: ${wins} | Losses: ${losses} | Win Rate: ${winRate}%\n`;
  report += `Total P&L: ${totalPnL.toFixed(2)}\n\n`;
  report += `INSIGHTS\n${'─'.repeat(30)}\n`;
  for (const ins of insights) {
    report += `\n[${ins.type.toUpperCase()}] ${ins.icon} ${ins.title}\n${ins.body}\n`;
  }
  report += `\n${'='.repeat(50)}\nEnd of Report\n`;

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade-analysis-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Report downloaded!', 'success');
}

function saveOpenAIKey() {
  const keyInput = document.getElementById('openaiKeyInput');
  if (!keyInput) return;
  const key = keyInput.value.trim();
  settings.openaiKey = key;
  aiOpenAIKey = key;
  setSetting('openaiKey', key).then(() => showToast('API key saved!', 'success'));
}

async function analyzeWithOpenAI(apiKey, trades, question) {
  if (!apiKey) { showToast('Please enter your OpenAI API key first.', 'error'); return null; }

  const enriched = trades.map(t => ({ ...t, pnl: calcPnL(t) }));
  const totalPnL = enriched.reduce((s, t) => s + t.pnl, 0);
  const wins = enriched.filter(t => t.pnl > 0).length;
  const winRate = enriched.length ? Math.round(wins / enriched.length * 100) : 0;

  // Build compact summary (avoid sending full data to minimize tokens)
  const summary = {
    totalTrades: enriched.length,
    wins, losses: enriched.filter(t => t.pnl < 0).length,
    winRate: winRate + '%',
    totalPnL: totalPnL.toFixed(2),
    recentTrades: enriched.slice(-20).map(t => ({
      date: t.entryDate, instrument: t.instrument, type: t.tradeType,
      pnl: t.pnl.toFixed(2), outcome: t.outcome, strategy: t.strategy,
      emotion: t.emotionBefore
    }))
  };

  const systemPrompt = `You are an expert trading coach and performance analyst. Analyze the trader's data and provide specific, actionable insights. Be concise and direct. Data: ${JSON.stringify(summary)}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...aiChatHistory.slice(-6).map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: question }
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 600, temperature: 0.7 })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function analyzeWithOpenAIBtn() {
  const key = (document.getElementById('openaiKeyInput')?.value || '').trim() || aiOpenAIKey;
  if (!key) { showToast('Please enter your OpenAI API key.', 'error'); return; }
  if (!allTrades.length) { showToast('No trades to analyze.', 'error'); return; }
  const question = 'Please analyze my trading performance and give me the top 3 specific improvements I should make.';
  await sendMessage(key, question, true);
}

async function sendAIChat() {
  const input = document.getElementById('aiChatInput');
  const key = (document.getElementById('openaiKeyInput')?.value || '').trim() || aiOpenAIKey;
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;
  if (!key) { showToast('Please enter your OpenAI API key.', 'error'); return; }
  input.value = '';
  await sendMessage(key, question, false);
}

async function sendMessage(apiKey, question, isAutoQuestion) {
  aiChatHistory.push({ role: 'user', content: question });
  renderChatHistory();

  const messagesEl = document.getElementById('aiChatMessages');
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'chat-message ai-message';
  loadingDiv.innerHTML = '<span class="chat-thinking">🤖 Thinking…</span>';
  if (messagesEl) messagesEl.appendChild(loadingDiv);
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const reply = await analyzeWithOpenAI(apiKey, allTrades, question);
    aiChatHistory.push({ role: 'assistant', content: reply || '(No response)' });
  } catch (e) {
    aiChatHistory.push({ role: 'assistant', content: `Error: ${e.message}` });
  }

  renderChatHistory();
}

function renderChatHistory() {
  const container = document.getElementById('aiChatMessages');
  if (!container) return;
  if (!aiChatHistory.length) {
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;padding:12px;">Ask anything about your trades — e.g. "What are my biggest weaknesses?" or "How can I improve my win rate?"</p>';
    return;
  }
  container.innerHTML = aiChatHistory.map(m => `
    <div class="chat-message ${m.role === 'user' ? 'user-message' : 'ai-message'}">
      <span class="chat-role">${m.role === 'user' ? '👤 You' : '🤖 AI'}</span>
      <div class="chat-text">${_esc(m.content).replace(/\n/g, '<br>')}</div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

window.saveOpenAIKey = saveOpenAIKey;
window.analyzeWithOpenAIBtn = analyzeWithOpenAIBtn;
window.sendAIChat = sendAIChat;
window.downloadAIReport = downloadAIReport;
