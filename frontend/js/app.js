/**
 * app.js — Main application logic for MT5-enabled Trade Journal
 * Fetches all data from FastAPI backend at API_BASE
 */

const API_BASE = 'http://localhost:8000';

// ─── State ────────────────────────────────────────────────────────────────────
let allTrades = [];
let editingTradeId = null;
let currentSection = 'dashboard';
let filterState = { dateFrom: '', dateTo: '', instrument: '', strategy: '', outcome: '', search: '' };
let settings = {
  currency: '$', instruments: 'EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD',
  dailyGoal: '', maxLoss: '', openaiKey: '', mt5_file_path: '',
  auto_sync: 'false', sync_interval: '30'
};
let currentReportsTab = 'monthly';

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadTrades();
  setupNavigation();
  setupTradeForm();
  setupScreenshotHandlers();
  setupFilterHandlers();
  setupSettingsForm();
  setupImportExport();
  showSection('dashboard');
});

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await apiFetch('/api/settings');
    if (s.currency) settings.currency = s.currency;
    if (s.instruments) settings.instruments = s.instruments;
    if (s.dailyGoal !== undefined) settings.dailyGoal = s.dailyGoal;
    if (s.maxLoss !== undefined) settings.maxLoss = s.maxLoss;
    if (s.openaiKey !== undefined) settings.openaiKey = s.openaiKey;
    if (s.mt5_file_path !== undefined) settings.mt5_file_path = s.mt5_file_path;
    if (s.auto_sync !== undefined) settings.auto_sync = s.auto_sync;
  } catch (e) { /* use defaults */ }
  applySettingsToUI();
}

function applySettingsToUI() {
  const fields = {
    settingCurrency: settings.currency,
    settingInstruments: settings.instruments,
    settingDailyGoal: settings.dailyGoal || '',
    settingMaxLoss: settings.maxLoss || '',
    settingOpenAIKey: settings.openaiKey || '',
    settingMT5FilePath: settings.mt5_file_path || '',
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }
  populateInstrumentDropdown();
}

function populateInstrumentDropdown() {
  const instruments = settings.instruments.split(',').map(s => s.trim()).filter(Boolean);
  const sel = document.getElementById('tradeInstrument');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">Select Instrument</option>';
  for (const inst of instruments) {
    const opt = document.createElement('option');
    opt.value = inst;
    opt.textContent = inst;
    sel.appendChild(opt);
  }
  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '+ Custom...';
  sel.appendChild(customOpt);
  if (current) sel.value = current;
}

// ─── Data Loading ─────────────────────────────────────────────────────────────
async function loadTrades() {
  try {
    allTrades = await apiFetch('/api/trades');
  } catch (e) {
    console.error('Failed to load trades:', e);
    allTrades = [];
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const section = el.getAttribute('data-section');
      showSection(section);
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.classList.remove('active');
    });
  });

  const hamburger = document.getElementById('hamburger');
  const overlay = document.getElementById('sidebarOverlay');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });
  }

  const quickAdd = document.getElementById('quickAddBtn');
  if (quickAdd) quickAdd.addEventListener('click', () => showSection('add'));
}

function showSection(name) {
  currentSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('section-' + name);
  if (target) target.classList.add('active');

  document.querySelectorAll('[data-section]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-section') === name);
  });

  if (name === 'dashboard') renderDashboard();
  if (name === 'log') renderTradeLog();
  if (name === 'analytics') renderAnalytics();
  if (name === 'calendar') renderCalendar();
  if (name === 'reports') renderReports();
  if (name === 'ai') renderAISection();
  if (name === 'mt5sync') renderMT5SyncSection();
  if (name === 'add' && !editingTradeId) resetTradeForm();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const analytics = computeAnalytics(allTrades);
  const c = settings.currency;

  setCard('cardTotal', analytics.total);
  setCard('cardWinRate', analytics.winRate + '%');
  setCard('cardTotalPnL', formatPnL(analytics.totalPnL, c));
  setCard('cardAvgWin', formatPnL(analytics.avgWin, c));
  setCard('cardAvgLoss', formatPnL(analytics.avgLoss, c));
  setCard('cardLargestWin', formatPnL(analytics.largestWin, c));
  setCard('cardLargestLoss', formatPnL(analytics.largestLoss, c));
  setCard('cardProfitFactor', isFinite(analytics.profitFactor) ? analytics.profitFactor : '∞');
  setCard('cardAvgRR', analytics.avgRR + 'R');
  setCard('cardStreak', formatStreak(analytics.currentStreak));
  setCard('cardDrawdown', formatPnL(-analytics.maxDrawdown, c));
  setCard('cardExpectancy', formatPnL(analytics.expectancy, c));

  const pnlCard = document.getElementById('cardTotalPnL');
  if (pnlCard) pnlCard.className = 'card-value ' + (analytics.totalPnL >= 0 ? 'positive' : 'negative');

  renderEquityCurve(analytics, c);
  renderDailyPnL(analytics, c);
  renderWinLossPie(analytics);
  renderDailyGoals();
  renderAchievements(analytics);
  renderRecentTrades(analytics.enrichedTrades.slice(-10).reverse());
}

function setCard(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatPnL(val, c) {
  const abs = Math.abs(val).toFixed(2);
  return val >= 0 ? `${c}${abs}` : `-${c}${abs}`;
}

function formatStreak(streak) {
  if (streak > 0) return `▲ ${streak}W`;
  if (streak < 0) return `▼ ${Math.abs(streak)}L`;
  return '—';
}

function renderRecentTrades(trades) {
  const tbody = document.getElementById('recentTradesTbody');
  if (!tbody) return;
  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No trades yet. Add your first trade!</td></tr>';
    return;
  }
  tbody.innerHTML = trades.map(t => `
    <tr class="trade-row" onclick="viewTrade(${t.id})">
      <td>${(t.open_time || '').slice(0, 10) || '—'}</td>
      <td>${t.symbol || '—'}</td>
      <td><span class="badge ${t.trade_type === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.trade_type || '—'}</span></td>
      <td>${t.open_price || '—'}</td>
      <td>${t.close_price || '—'}</td>
      <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(t.pnl, settings.currency)}</td>
      <td><span class="badge badge-${(t.outcome || '').toLowerCase()}">${t.outcome || '—'}</span></td>
    </tr>
  `).join('');
}

// ─── Trade Form ───────────────────────────────────────────────────────────────
let pendingScreenshots = [];
let pendingScreenshotFiles = [];

function setupTradeForm() {
  const form = document.getElementById('tradeForm');
  if (!form) return;

  ['tradeEntryPrice', 'tradeExitPrice', 'tradeVolume', 'tradeCommission', 'tradeSwap', 'tradeProfit', 'tradeType'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', updateCalculatedFields); el.addEventListener('change', updateCalculatedFields); }
  });

  const stratSel = document.getElementById('tradeStrategy');
  if (stratSel) {
    stratSel.addEventListener('change', () => {
      const cr = document.getElementById('customStrategyRow');
      if (cr) cr.style.display = stratSel.value === '__custom__' ? 'flex' : 'none';
    });
  }

  const instrSel = document.getElementById('tradeInstrument');
  if (instrSel) {
    instrSel.addEventListener('change', () => {
      const cr = document.getElementById('customInstrumentRow');
      if (cr) cr.style.display = instrSel.value === '__custom__' ? 'flex' : 'none';
    });
  }

  form.addEventListener('submit', async (e) => { e.preventDefault(); await saveTrade(); });

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    editingTradeId = null;
    resetTradeForm();
    showSection('log');
  });
}

function updateCalculatedFields() {
  const entry = parseFloat(document.getElementById('tradeEntryPrice')?.value) || 0;
  const exit = parseFloat(document.getElementById('tradeExitPrice')?.value) || 0;
  const volume = parseFloat(document.getElementById('tradeVolume')?.value) || 0;
  const commission = parseFloat(document.getElementById('tradeCommission')?.value) || 0;
  const swap = parseFloat(document.getElementById('tradeSwap')?.value) || 0;
  const profit = parseFloat(document.getElementById('tradeProfit')?.value) || 0;
  const type = document.getElementById('tradeType')?.value;

  let pnl;
  if (entry && exit && volume) {
    const raw = type === 'Buy' ? (exit - entry) * volume : (entry - exit) * volume;
    pnl = parseFloat((raw - commission - swap).toFixed(2));
  } else if (profit !== 0) {
    pnl = parseFloat((profit - commission - swap).toFixed(2));
  } else {
    const pnlEl = document.getElementById('tradePnLPreview');
    if (pnlEl) pnlEl.textContent = '';
    return;
  }

  const outcome = pnl > 0 ? 'Win' : pnl < 0 ? 'Loss' : 'Breakeven';
  const pnlEl = document.getElementById('tradePnLPreview');
  if (pnlEl) {
    pnlEl.textContent = `P&L: ${formatPnL(pnl, settings.currency)} | Outcome: ${outcome}`;
    pnlEl.className = 'pnl-preview ' + (pnl >= 0 ? 'positive' : 'negative');
  }
}

async function saveTrade() {
  const stratSel = document.getElementById('tradeStrategy');
  const instrSel = document.getElementById('tradeInstrument');
  const strategy = stratSel?.value === '__custom__'
    ? document.getElementById('customStrategyInput')?.value?.trim()
    : stratSel?.value;
  const symbol = instrSel?.value === '__custom__'
    ? document.getElementById('customInstrumentInput')?.value?.trim()
    : instrSel?.value;

  const entryDate = document.getElementById('tradeEntryDate')?.value || '';
  const entryTime = document.getElementById('tradeEntryTime')?.value || '';
  const exitDate = document.getElementById('tradeExitDate')?.value || '';
  const exitTime = document.getElementById('tradeExitTime')?.value || '';

  const open_time = entryDate ? (entryTime ? `${entryDate}T${entryTime}:00` : `${entryDate}T00:00:00`) : '';
  const close_time = exitDate ? (exitTime ? `${exitDate}T${exitTime}:00` : `${exitDate}T00:00:00`) : '';

  const open_price = parseFloat(document.getElementById('tradeEntryPrice')?.value) || 0;
  const close_price = parseFloat(document.getElementById('tradeExitPrice')?.value) || 0;
  const volume = parseFloat(document.getElementById('tradeVolume')?.value) || 0;
  const commission = parseFloat(document.getElementById('tradeCommission')?.value) || 0;
  const swap = parseFloat(document.getElementById('tradeSwap')?.value) || 0;
  const profit = parseFloat(document.getElementById('tradeProfit')?.value) || 0;
  const trade_type = document.getElementById('tradeType')?.value || 'Buy';

  let pnl;
  if (open_price && close_price && volume) {
    const raw = trade_type === 'Buy' ? (close_price - open_price) * volume : (open_price - close_price) * volume;
    pnl = parseFloat((raw - commission - swap).toFixed(2));
  } else {
    pnl = parseFloat((profit - commission - swap).toFixed(2));
  }
  const outcome = pnl > 0 ? 'Win' : pnl < 0 ? 'Loss' : 'Breakeven';

  const tradeData = {
    symbol: symbol || '',
    trade_type,
    volume: volume || null,
    open_price: open_price || null,
    close_price: close_price || null,
    open_time: open_time || null,
    close_time: close_time || null,
    stop_loss: parseFloat(document.getElementById('tradeStopLoss')?.value) || null,
    take_profit: parseFloat(document.getElementById('tradeTakeProfit')?.value) || null,
    commission,
    swap,
    profit,
    strategy: strategy || '',
    setup_tags: document.getElementById('tradeSetupTags')?.value || '',
    emotion_before: document.getElementById('tradeEmotionBefore')?.value || '',
    emotion_during: document.getElementById('tradeEmotionDuring')?.value || '',
    notes: document.getElementById('tradeNotes')?.value || '',
    outcome,
    pnl,
  };

  try {
    let savedId;
    if (editingTradeId) {
      await apiFetch(`/api/trades/${editingTradeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: tradeData.strategy,
          setup_tags: tradeData.setup_tags,
          emotion_before: tradeData.emotion_before,
          emotion_during: tradeData.emotion_during,
          notes: tradeData.notes,
          outcome: tradeData.outcome,
        }),
      });
      savedId = editingTradeId;
      editingTradeId = null;
      showToast('Trade updated successfully!', 'success');
    } else {
      const result = await apiFetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData),
      });
      savedId = result.id;
      showToast('Trade saved successfully!', 'success');
    }

    // Upload pending screenshots
    for (const file of pendingScreenshotFiles) {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`${API_BASE}/api/screenshots/${savedId}`, { method: 'POST', body: fd });
    }

    await loadTrades();
    resetTradeForm();
    showSection('log');
  } catch (e) {
    console.error('Failed to save trade:', e);
    showToast('Error saving trade: ' + e.message, 'error');
  }
}

function resetTradeForm() {
  const form = document.getElementById('tradeForm');
  if (form) form.reset();
  pendingScreenshots = [];
  pendingScreenshotFiles = [];
  renderScreenshotPreviews();
  const pnlEl = document.getElementById('tradePnLPreview');
  if (pnlEl) pnlEl.textContent = '';
  ['customStrategyRow', 'customInstrumentRow'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.style.display = 'none';
  const formTitle = document.getElementById('formTitle');
  if (formTitle) formTitle.textContent = 'Add New Trade';
  editingTradeId = null;
}

function editTrade(id) {
  const trade = allTrades.find(t => t.id === id);
  if (!trade) return;
  editingTradeId = id;
  showSection('add');

  // Populate dates from open_time / close_time
  const openDate = (trade.open_time || '').slice(0, 10);
  const openTime = (trade.open_time || '').slice(11, 16);
  const closeDate = (trade.close_time || '').slice(0, 10);
  const closeTime = (trade.close_time || '').slice(11, 16);

  const fields = {
    tradeEntryDate: openDate,
    tradeEntryTime: openTime,
    tradeExitDate: closeDate,
    tradeExitTime: closeTime,
    tradeType: trade.trade_type,
    tradeEntryPrice: trade.open_price,
    tradeExitPrice: trade.close_price,
    tradeVolume: trade.volume,
    tradeCommission: trade.commission,
    tradeSwap: trade.swap,
    tradeProfit: trade.profit,
    tradeStopLoss: trade.stop_loss,
    tradeTakeProfit: trade.take_profit,
    tradeEmotionBefore: trade.emotion_before,
    tradeEmotionDuring: trade.emotion_during,
    tradeNotes: trade.notes,
    tradeSetupTags: trade.setup_tags,
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  }

  // Strategy
  const stratSel = document.getElementById('tradeStrategy');
  if (stratSel && trade.strategy) {
    const opt = [...stratSel.options].find(o => o.value === trade.strategy);
    if (opt) { stratSel.value = trade.strategy; }
    else {
      stratSel.value = '__custom__';
      const cr = document.getElementById('customStrategyRow');
      if (cr) cr.style.display = 'flex';
      const ci = document.getElementById('customStrategyInput');
      if (ci) ci.value = trade.strategy;
    }
  }

  // Instrument
  const instrSel = document.getElementById('tradeInstrument');
  if (instrSel && trade.symbol) {
    const opt = [...instrSel.options].find(o => o.value === trade.symbol);
    if (opt) { instrSel.value = trade.symbol; }
    else {
      instrSel.value = '__custom__';
      const cr = document.getElementById('customInstrumentRow');
      if (cr) cr.style.display = 'flex';
      const ci = document.getElementById('customInstrumentInput');
      if (ci) ci.value = trade.symbol;
    }
  }

  pendingScreenshots = [];
  pendingScreenshotFiles = [];
  renderScreenshotPreviews();

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  const formTitle = document.getElementById('formTitle');
  if (formTitle) formTitle.textContent = 'Edit Trade';
  updateCalculatedFields();
}

async function handleDelete(id) {
  closeModal();
  if (!confirm('Are you sure you want to delete this trade?')) return;
  try {
    await apiFetch(`/api/trades/${id}`, { method: 'DELETE' });
    await loadTrades();
    showToast('Trade deleted.', 'info');
    renderTradeLog();
    renderDashboard();
  } catch (e) {
    showToast('Error deleting trade: ' + e.message, 'error');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function viewTrade(id) {
  const trade = allTrades.find(t => t.id === id);
  if (!trade) return;

  // Fetch screenshots for this trade
  let screenshots = [];
  try {
    screenshots = await apiFetch(`/api/screenshots/${id}`);
  } catch (e) { /* none */ }

  const screenshotsHtml = screenshots.length
    ? `<div class="full-width screenshots-section">
        <label>Screenshots</label>
        <div class="screenshot-grid">
          ${screenshots.map((s, i) => `<img src="${API_BASE}${s.url}" alt="Screenshot ${i+1}" class="screenshot-thumb" data-ss-url="${escapeHtml(API_BASE + s.url)}">`).join('')}
        </div>
       </div>`
    : '';

  const pnl = trade.pnl || 0;
  const isAnnotatable = true;

  const content = `
    <div class="trade-detail-grid">
      <div><label>Open Time</label><span>${escapeHtml((trade.open_time || '').slice(0, 16).replace('T', ' '))}</span></div>
      <div><label>Close Time</label><span>${escapeHtml((trade.close_time || '').slice(0, 16).replace('T', ' '))}</span></div>
      <div><label>Symbol</label><span>${escapeHtml(trade.symbol)}</span></div>
      <div><label>Type</label><span class="badge ${trade.trade_type === 'Buy' ? 'badge-buy' : 'badge-sell'}">${escapeHtml(trade.trade_type)}</span></div>
      <div><label>Entry Price</label><span>${trade.open_price || '—'}</span></div>
      <div><label>Exit Price</label><span>${trade.close_price || '—'}</span></div>
      <div><label>Volume</label><span>${trade.volume || '—'}</span></div>
      <div><label>Commission</label><span>${trade.commission || '0'}</span></div>
      <div><label>Swap</label><span>${trade.swap || '0'}</span></div>
      <div><label>Raw Profit</label><span>${trade.profit || '0'}</span></div>
      <div><label>Stop Loss</label><span>${trade.stop_loss || '—'}</span></div>
      <div><label>Take Profit</label><span>${trade.take_profit || '—'}</span></div>
      <div><label>Strategy</label><span>${escapeHtml(trade.strategy || '—')}</span></div>
      <div><label>Setup Tags</label><span>${escapeHtml(trade.setup_tags || '—')}</span></div>
      <div><label>Emotion Before</label><span>${escapeHtml(trade.emotion_before || '—')}</span></div>
      <div><label>Emotion During</label><span>${escapeHtml(trade.emotion_during || '—')}</span></div>
      <div class="full-width"><label>P&amp;L</label><span class="${pnl >= 0 ? 'positive' : 'negative'} large-pnl">${formatPnL(pnl, settings.currency)}</span></div>
      <div class="full-width"><label>Outcome</label><span class="badge badge-${(trade.outcome || '').toLowerCase()}">${escapeHtml(trade.outcome || '—')}</span></div>
      <div class="full-width"><label>Source</label><span>${escapeHtml(trade.source || '—')}</span></div>
      <div class="full-width"><label>Notes</label><p class="notes-text">${escapeHtml(trade.notes || '(none)')}</p></div>
      ${screenshotsHtml}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="modalEditBtn">✏️ Edit Annotations</button>
      <button class="btn btn-danger" id="modalDeleteBtn">🗑️ Delete</button>
      <button class="btn btn-secondary" id="modalCloseBtn">Close</button>
    </div>
  `;
  openModal(`Trade — ${escapeHtml(trade.symbol)} ${(trade.open_time || '').slice(0, 10)}`, content);

  document.getElementById('modalEditBtn')?.addEventListener('click', () => { editTrade(id); closeModal(); });
  document.getElementById('modalDeleteBtn')?.addEventListener('click', () => handleDelete(id));
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);

  document.querySelectorAll('[data-ss-url]').forEach(img => {
    img.addEventListener('click', () => openLightboxUrl(img.dataset.ssUrl));
  });
}

// ─── Screenshots ───────────────────────────────────────────────────────────────
function setupScreenshotHandlers() {
  const dropzone = document.getElementById('screenshotDropzone');
  const fileInput = document.getElementById('screenshotFileInput');

  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput && fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).forEach(f => addScreenshotFile(f));
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files).filter(f => f.type.startsWith('image/')).forEach(f => addScreenshotFile(f));
      fileInput.value = '';
    });
  }
  document.addEventListener('paste', (e) => {
    if (currentSection !== 'add') return;
    for (const item of (e.clipboardData?.items || [])) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) addScreenshotFile(file);
      }
    }
  });
}

function addScreenshotFile(file) {
  pendingScreenshotFiles.push(file);
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingScreenshots.push({ dataUrl: e.target.result, name: file.name });
    renderScreenshotPreviews();
  };
  reader.readAsDataURL(file);
}

function renderScreenshotPreviews() {
  const container = document.getElementById('screenshotPreviews');
  if (!container) return;
  container.innerHTML = pendingScreenshots.map((s, i) => `
    <div class="screenshot-preview-item">
      <img src="${s.dataUrl}" alt="${escapeHtml(s.name)}" data-index="${i}" class="screenshot-thumb-preview">
      <button class="remove-screenshot" data-index="${i}" title="Remove">×</button>
    </div>
  `).join('');
  container.querySelectorAll('.screenshot-thumb-preview').forEach(img => {
    img.addEventListener('click', () => openLightboxUrl(img.src));
  });
  container.querySelectorAll('.remove-screenshot').forEach(btn => {
    btn.addEventListener('click', () => removeScreenshot(parseInt(btn.dataset.index, 10)));
  });
}

function removeScreenshot(index) {
  pendingScreenshots.splice(index, 1);
  pendingScreenshotFiles.splice(index, 1);
  renderScreenshotPreviews();
}

function openLightboxUrl(url) {
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  if (lb && lbImg) { lbImg.src = url; lb.classList.add('active'); }
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('active');
}

// ─── Trade Log ────────────────────────────────────────────────────────────────
let sortState = { col: 'open_time', dir: 'desc' };

function setupFilterHandlers() {
  const filterIds = ['filterDateFrom', 'filterDateTo', 'filterInstrument', 'filterStrategy', 'filterOutcome', 'filterSearch'];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyFilters);
  });
  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    filterIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    applyFilters();
  });
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else { sortState.col = col; sortState.dir = 'asc'; }
      renderTradeLog();
    });
  });
}

function applyFilters() {
  filterState.dateFrom = document.getElementById('filterDateFrom')?.value || '';
  filterState.dateTo = document.getElementById('filterDateTo')?.value || '';
  filterState.instrument = document.getElementById('filterInstrument')?.value?.toLowerCase() || '';
  filterState.strategy = document.getElementById('filterStrategy')?.value?.toLowerCase() || '';
  filterState.outcome = document.getElementById('filterOutcome')?.value || '';
  filterState.search = document.getElementById('filterSearch')?.value?.toLowerCase() || '';
  renderTradeLog();
}

function getFilteredTrades() {
  return allTrades.filter(t => {
    const d = (t.open_time || '').slice(0, 10);
    if (filterState.dateFrom && d < filterState.dateFrom) return false;
    if (filterState.dateTo && d > filterState.dateTo) return false;
    if (filterState.instrument && !(t.symbol || '').toLowerCase().includes(filterState.instrument)) return false;
    if (filterState.strategy && !(t.strategy || '').toLowerCase().includes(filterState.strategy)) return false;
    if (filterState.outcome && t.outcome !== filterState.outcome) return false;
    if (filterState.search) {
      const hay = `${t.notes} ${t.symbol} ${t.strategy} ${t.setup_tags}`.toLowerCase();
      if (!hay.includes(filterState.search)) return false;
    }
    return true;
  });
}

function renderTradeLog() {
  const filtered = getFilteredTrades();
  const sorted = [...filtered].sort((a, b) => {
    const col = sortState.col;
    let av = a[col] ?? '', bv = b[col] ?? '';
    if (col === 'pnl' || col === 'open_price' || col === 'close_price') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
    if (av < bv) return sortState.dir === 'asc' ? -1 : 1;
    if (av > bv) return sortState.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('tradeLogTbody');
  if (!tbody) return;
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No trades found.</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(t => `
    <tr class="trade-row">
      <td>${(t.open_time || '').slice(0, 10) || '—'}</td>
      <td>${t.symbol || '—'}</td>
      <td><span class="badge ${t.trade_type === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.trade_type || '—'}</span></td>
      <td>${t.open_price || '—'}</td>
      <td>${t.close_price || '—'}</td>
      <td>${t.volume || '—'}</td>
      <td>${t.strategy || '—'}</td>
      <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(t.pnl, settings.currency)}</td>
      <td><span class="badge badge-${(t.outcome || '').toLowerCase()}">${t.outcome || '—'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="viewTrade(${t.id})">View</button>
        <button class="btn btn-sm btn-primary" onclick="editTrade(${t.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="handleDelete(${t.id})">Del</button>
      </td>
    </tr>
  `).join('');

  const countEl = document.getElementById('tradeCount');
  if (countEl) countEl.textContent = `${sorted.length} trade${sorted.length !== 1 ? 's' : ''}`;
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function renderAnalytics() {
  const analytics = computeAnalytics(allTrades);
  const c = settings.currency;
  renderAllCharts(analytics, c);
  renderStrategyTable(analytics.byStrategy, c);
  renderInstrumentTable(analytics.byInstrument, c);
  renderMonthlyTable(analytics.byMonth, c);
}

function renderStrategyTable(data, c) {
  const tbody = document.getElementById('strategyTbody');
  if (!tbody) return;
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No data</td></tr>'; return; }
  tbody.innerHTML = [...data].sort((a, b) => b.totalPnL - a.totalPnL).map(r => `
    <tr>
      <td>${r.strategy}</td>
      <td>${r.trades}</td>
      <td>${r.winRate}%</td>
      <td class="${r.avgPnL >= 0 ? 'positive' : 'negative'}">${formatPnL(r.avgPnL, c)}</td>
      <td class="${r.totalPnL >= 0 ? 'positive' : 'negative'}">${formatPnL(r.totalPnL, c)}</td>
    </tr>
  `).join('');
}

function renderInstrumentTable(data, c) {
  const tbody = document.getElementById('instrumentTbody');
  if (!tbody) return;
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No data</td></tr>'; return; }
  tbody.innerHTML = [...data].sort((a, b) => b.totalPnL - a.totalPnL).map(r => `
    <tr>
      <td>${r.instrument}</td>
      <td>${r.trades}</td>
      <td>${r.winRate}%</td>
      <td class="${r.avgPnL >= 0 ? 'positive' : 'negative'}">${formatPnL(r.avgPnL, c)}</td>
      <td class="${r.totalPnL >= 0 ? 'positive' : 'negative'}">${formatPnL(r.totalPnL, c)}</td>
    </tr>
  `).join('');
}

function renderMonthlyTable(data, c) {
  const tbody = document.getElementById('monthlyTbody');
  if (!tbody) return;
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No data</td></tr>'; return; }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${r.month}</td>
      <td>${r.trades}</td>
      <td>${r.winRate}%</td>
      <td class="${r.totalPnL >= 0 ? 'positive' : 'negative'}">${formatPnL(r.totalPnL, c)}</td>
    </tr>
  `).join('');
}

// ─── Import / Export ──────────────────────────────────────────────────────────
function setupImportExport() {
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportJSON);
  const importInput = document.getElementById('importInput');
  if (importInput) importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (file) importJSON(file);
    importInput.value = '';
  });
  const importBtn = document.getElementById('importBtn');
  if (importBtn) importBtn.addEventListener('click', () => importInput && importInput.click());
}

async function exportJSON() {
  try {
    const data = await apiFetch('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-journal-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Trades exported successfully!', 'success');
  } catch (e) {
    showToast('Export failed: ' + e.message, 'error');
  }
}

async function importJSON(file) {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const result = await fetch(`${API_BASE}/api/import`, { method: 'POST', body: fd });
    const data = await result.json();
    if (!result.ok) throw new Error(data.detail || 'Import failed');
    await loadTrades();
    showToast(`Imported ${data.imported} trades successfully!`, 'success');
    renderDashboard();
  } catch (e) {
    showToast('Import failed: ' + e.message, 'error');
  }
}

// ─── Settings Form ────────────────────────────────────────────────────────────
function setupSettingsForm() {
  const saveBtn = document.getElementById('saveSettings');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const updates = {
      currency: document.getElementById('settingCurrency')?.value?.trim() || '$',
      instruments: document.getElementById('settingInstruments')?.value?.trim() || '',
      dailyGoal: document.getElementById('settingDailyGoal')?.value?.trim() || '',
      maxLoss: document.getElementById('settingMaxLoss')?.value?.trim() || '',
      openaiKey: document.getElementById('settingOpenAIKey')?.value?.trim() || '',
      mt5_file_path: document.getElementById('settingMT5FilePath')?.value?.trim() || '',
    };
    try {
      const saved = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      settings.currency = saved.currency || '$';
      settings.instruments = saved.instruments || '';
      settings.dailyGoal = saved.dailyGoal || '';
      settings.maxLoss = saved.maxLoss || '';
      settings.openaiKey = saved.openaiKey || '';
      settings.mt5_file_path = saved.mt5_file_path || '';
      populateInstrumentDropdown();
      showToast('Settings saved!', 'success');
    } catch (e) {
      showToast('Error saving settings: ' + e.message, 'error');
    }
  });

  const clearDataBtn = document.getElementById('clearAllData');
  if (clearDataBtn) clearDataBtn.addEventListener('click', async () => {
    if (!confirm('⚠️ This will DELETE ALL your trades permanently. Are you absolutely sure?')) return;
    if (!confirm('Last chance! All trade data will be lost. Continue?')) return;
    try {
      // Delete each trade individually
      for (const t of allTrades) {
        await apiFetch(`/api/trades/${t.id}`, { method: 'DELETE' });
      }
      allTrades = [];
      showToast('All data cleared.', 'info');
      renderDashboard();
    } catch (e) {
      showToast('Error clearing data: ' + e.message, 'error');
    }
  });
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(title, content) {
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  if (modal && modalTitle && modalBody) {
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.add('active');
  }
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('active');
}

window.closeModal = closeModal;
window.closeLightbox = closeLightbox;
window.viewTrade = viewTrade;
window.editTrade = editTrade;
window.handleDelete = handleDelete;
window.removeScreenshot = removeScreenshot;

// ─── Daily Goals ──────────────────────────────────────────────────────────────
function renderDailyGoals() {
  const section = document.getElementById('dailyGoalsSection');
  const content = document.getElementById('dailyGoalsContent');
  if (!section || !content) return;
  const goalVal = parseFloat(settings.dailyGoal);
  const maxLossVal = parseFloat(settings.maxLoss);
  if (!goalVal && !maxLossVal) { section.style.display = 'none'; return; }

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTrades = allTrades.filter(t => (t.open_time || '').startsWith(todayStr));
  const todayPnL = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const c = settings.currency;

  let html = '<div class="daily-goals-grid">';
  if (goalVal) {
    const pct = Math.min(Math.max(todayPnL / goalVal * 100, 0), 100);
    html += `<div class="goal-item">
      <div class="goal-label">🎯 Daily Goal: <strong>${c}${goalVal.toFixed(0)}</strong> &nbsp; Today: <span class="${todayPnL >= goalVal ? 'positive' : ''}">${formatPnL(todayPnL, c)}</span></div>
      <div class="goal-progress-bar"><div class="goal-progress-fill goal-fill-green" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="goal-pct">${pct.toFixed(0)}% achieved</div>
    </div>`;
  }
  if (maxLossVal) {
    const loss = Math.max(-todayPnL, 0);
    const pct = Math.min(loss / maxLossVal * 100, 100);
    html += `<div class="goal-item">
      <div class="goal-label">🛡️ Max Loss Limit: <strong>${c}${maxLossVal.toFixed(0)}</strong> &nbsp; Today's Loss: <span class="${todayPnL < -maxLossVal ? 'negative' : ''}">${c}${loss.toFixed(2)}</span></div>
      <div class="goal-progress-bar"><div class="goal-progress-fill goal-fill-red" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="goal-pct">${pct.toFixed(0)}% of limit used${pct >= 100 ? ' ⚠️ STOP TRADING' : ''}</div>
    </div>`;
  }
  html += '</div>';
  content.innerHTML = html;
  section.style.display = '';
}

// ─── Achievements ─────────────────────────────────────────────────────────────
function renderAchievements(analytics) {
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  const total = allTrades.length;
  const sorted = [...allTrades].sort((a, b) => (a.open_time || '') > (b.open_time || '') ? 1 : -1);
  let maxStreak = 0, cur = 0;
  for (const t of sorted) {
    if ((t.pnl || 0) > 0) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  }
  const byMonth = {};
  for (const t of allTrades) {
    const m = (t.open_time || '').slice(0, 7);
    if (!m) continue;
    byMonth[m] = (byMonth[m] || 0) + (t.pnl || 0);
  }
  const hasProfitableMonth = Object.values(byMonth).some(v => v > 0);
  const achievements = [
    { icon: '🌱', title: 'First Trade', desc: 'Logged your first trade', unlocked: total >= 1 },
    { icon: '📋', title: '10 Trades', desc: 'Logged 10 trades', unlocked: total >= 10 },
    { icon: '💯', title: '100 Trades', desc: 'Logged 100 trades', unlocked: total >= 100 },
    { icon: '🔥', title: 'Win Streak 3', desc: '3 consecutive winning trades', unlocked: maxStreak >= 3 },
    { icon: '⚡', title: 'Win Streak 5', desc: '5 consecutive winning trades', unlocked: maxStreak >= 5 },
    { icon: '🏆', title: 'Best Month', desc: 'Had a profitable month', unlocked: hasProfitableMonth },
    { icon: '📈', title: 'Profit Factor 2', desc: 'Achieved profit factor above 2', unlocked: isFinite(analytics.profitFactor) && analytics.profitFactor >= 2 },
  ];
  grid.innerHTML = achievements.map(a => `
    <div class="achievement-card ${a.unlocked ? 'achievement-unlocked' : 'achievement-locked'}">
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-info">
        <div class="achievement-title">${a.title}</div>
        <div class="achievement-desc">${a.desc}</div>
      </div>
      <div class="achievement-badge">${a.unlocked ? '✓' : '🔒'}</div>
    </div>
  `).join('');
}

// ─── Reports ──────────────────────────────────────────────────────────────────
function switchReportsTab(tab) {
  currentReportsTab = tab;
  document.querySelectorAll('.report-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  renderReports();
}

function renderReports() {
  const content = document.getElementById('reportsContent');
  if (!content) return;
  if (!allTrades.length) {
    content.innerHTML = '<p class="empty-state" style="padding:40px 0;">No trades yet.</p>';
    return;
  }
  const c = settings.currency;
  if (currentReportsTab === 'monthly') content.innerHTML = renderMonthlyReport(allTrades, c);
  else if (currentReportsTab === 'weekly') content.innerHTML = renderWeeklyReport(allTrades, c);
  else if (currentReportsTab === 'yearly') content.innerHTML = renderYearlyReport(allTrades, c);
}

function renderMonthlyReport(trades, c) {
  const byMonth = {};
  for (const t of trades) {
    const m = (t.open_time || '').slice(0, 7);
    if (!m) continue;
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(t);
  }
  const months = Object.keys(byMonth).sort().reverse();
  if (!months.length) return '<p class="empty-state">No data.</p>';
  const monthStats = months.map(m => {
    const ts = byMonth[m];
    const pnl = ts.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = ts.filter(t => (t.pnl || 0) > 0).length;
    const wr = Math.round(wins / ts.length * 100);
    const bestDay = Math.max(...ts.map(t => t.pnl || 0));
    const worstDay = Math.min(...ts.map(t => t.pnl || 0));
    return { m, trades: ts.length, wr, pnl, bestDay, worstDay };
  });
  const bestPnL = Math.max(...monthStats.map(s => s.pnl));
  const worstPnL = Math.min(...monthStats.map(s => s.pnl));
  const rows = monthStats.map(s => {
    const isBest = s.pnl === bestPnL && bestPnL > 0;
    const isWorst = s.pnl === worstPnL && worstPnL < 0;
    return `<tr class="${isBest ? 'row-highlight-best' : isWorst ? 'row-highlight-worst' : ''}">
      <td>${s.m}${isBest ? ' 🏆' : isWorst ? ' ⚠️' : ''}</td>
      <td>${s.trades}</td><td>${s.wr}%</td>
      <td class="${s.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(s.pnl, c)}</td>
      <td class="positive">${formatPnL(s.bestDay, c)}</td>
      <td class="negative">${formatPnL(s.worstDay, c)}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrapper"><table>
    <thead><tr><th>Month</th><th>Trades</th><th>Win Rate</th><th>P&L</th><th>Best Day</th><th>Worst Day</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderWeeklyReport(trades, c) {
  function getWeekLabel(dateStr) {
    try {
      const d = new Date(dateStr + 'T12:00:00');
      const iso = d.getFullYear() + '-W' + String(
        Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7)
      ).padStart(2, '0');
      return iso;
    } catch { return 'Unknown'; }
  }
  const byWeek = {};
  for (const t of trades) {
    const d = (t.open_time || '').slice(0, 10);
    if (!d) continue;
    const wk = getWeekLabel(d);
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(t);
  }
  const weeks = Object.keys(byWeek).sort().reverse().slice(0, 8);
  if (!weeks.length) return '<p class="empty-state">No data.</p>';
  const rows = weeks.map(wk => {
    const ts = byWeek[wk];
    const pnl = ts.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = ts.filter(t => (t.pnl || 0) > 0).length;
    const wr = Math.round(wins / ts.length * 100);
    return `<tr><td>${wk}</td><td>${ts.length}</td><td>${wr}%</td>
      <td class="${pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(pnl, c)}</td></tr>`;
  }).join('');
  return `<p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">Last 8 weeks</p>
    <div class="table-wrapper"><table>
    <thead><tr><th>Week</th><th>Trades</th><th>Win Rate</th><th>P&L</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function renderYearlyReport(trades, c) {
  const byYear = {};
  for (const t of trades) {
    const y = (t.open_time || '').slice(0, 4);
    if (!y) continue;
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(t);
  }
  const years = Object.keys(byYear).sort().reverse();
  if (!years.length) return '<p class="empty-state">No data.</p>';
  const yearlyRows = years.map(y => {
    const ts = byYear[y];
    const pnl = ts.reduce((s, t) => s + (t.pnl || 0), 0);
    const wins = ts.filter(t => (t.pnl || 0) > 0).length;
    const wr = Math.round(wins / ts.length * 100);
    return `<tr><td>${y}</td><td>${ts.length}</td><td>${wr}%</td>
      <td class="${pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(pnl, c)}</td></tr>`;
  }).join('');

  const recentYear = years[0];
  const monthlyPnL = Array(12).fill(0);
  for (const t of byYear[recentYear]) {
    const m = parseInt((t.open_time || '').slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthlyPnL[m] += (t.pnl || 0);
  }
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const chartId = 'yearlyMonthlyChart';
  setTimeout(() => {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    const existing = Chart.getChart ? Chart.getChart(canvas) : null;
    if (existing) existing.destroy();
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: `Monthly P&L (${recentYear})`,
          data: monthlyPnL,
          backgroundColor: monthlyPnL.map(v => v >= 0 ? 'rgba(0,200,150,0.7)' : 'rgba(255,77,109,0.7)'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
          x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
        }
      }
    });
  }, 50);

  return `<div class="table-wrapper" style="margin-bottom:24px;"><table>
    <thead><tr><th>Year</th><th>Trades</th><th>Win Rate</th><th>P&L</th></tr></thead>
    <tbody>${yearlyRows}</tbody></table></div>
    <div class="chart-card">
      <h3>📅 Monthly P&L — ${recentYear}</h3>
      <div class="chart-wrapper"><canvas id="${chartId}"></canvas></div>
    </div>`;
}

window.switchReportsTab = switchReportsTab;

// ─── Modal / Lightbox close handlers ─────────────────────────────────────────
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modal');
  if (e.target === modal) closeModal();
  const lb = document.getElementById('lightbox');
  if (e.target === lb) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const lb = document.getElementById('lightbox');
    if (lb && lb.classList.contains('active')) { closeLightbox(); return; }
    const modal = document.getElementById('modal');
    if (modal && modal.classList.contains('active')) closeModal();
  }
});

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
}
