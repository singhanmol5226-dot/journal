/**
 * app.js — Main application logic for Trade Journal
 */

// ─── State ────────────────────────────────────────────────────────────────────
let allTrades = [];
let editingTradeId = null;
let currentSection = 'dashboard';
let filterState = { dateFrom: '', dateTo: '', instrument: '', strategy: '', outcome: '', search: '' };
let settings = { currency: '₹', instruments: 'NIFTY,BANKNIFTY,SENSEX,AAPL,BTC,ETH,RELIANCE,TCS', dailyGoal: '', maxLoss: '', openaiKey: '' };
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

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await getAllSettings();
    if (s.currency) settings.currency = s.currency;
    if (s.instruments) settings.instruments = s.instruments;
    if (s.dailyGoal !== undefined) settings.dailyGoal = s.dailyGoal;
    if (s.maxLoss !== undefined) settings.maxLoss = s.maxLoss;
    if (s.openaiKey !== undefined) settings.openaiKey = s.openaiKey;
  } catch (e) { /* use defaults */ }
  applySettingsToUI();
}

function applySettingsToUI() {
  const currInput = document.getElementById('settingCurrency');
  const instrInput = document.getElementById('settingInstruments');
  const dailyGoalInput = document.getElementById('settingDailyGoal');
  const maxLossInput = document.getElementById('settingMaxLoss');
  const openaiKeyInput = document.getElementById('settingOpenAIKey');
  if (currInput) currInput.value = settings.currency;
  if (instrInput) instrInput.value = settings.instruments;
  if (dailyGoalInput) dailyGoalInput.value = settings.dailyGoal || '';
  if (maxLossInput) maxLossInput.value = settings.maxLoss || '';
  if (openaiKeyInput) openaiKeyInput.value = settings.openaiKey || '';
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
    allTrades = await getAllTrades();
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
      // Close mobile nav if open
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
    });
  });

  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('open');
    });
  }
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
  if (name === 'add') {
    if (!editingTradeId) resetTradeForm();
  }
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

  // Color total P&L
  const pnlCard = document.getElementById('cardTotalPnL');
  if (pnlCard) pnlCard.className = 'card-value ' + (analytics.totalPnL >= 0 ? 'positive' : 'negative');

  renderEquityCurve(analytics, c);
  renderDailyPnL(analytics, c);
  renderWinLossPie(analytics);

  // Daily goals
  renderDailyGoals();

  // Achievements
  renderAchievements(analytics);

  // Recent trades table
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
      <td>${t.entryDate || '—'}</td>
      <td>${t.instrument || '—'}</td>
      <td><span class="badge ${t.tradeType === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.tradeType || '—'}</span></td>
      <td>${t.entryPrice || '—'}</td>
      <td>${t.exitPrice || '—'}</td>
      <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(t.pnl, settings.currency)}</td>
      <td><span class="badge badge-${(t.outcome || '').toLowerCase()}">${t.outcome || '—'}</span></td>
    </tr>
  `).join('');
}

// ─── Trade Form ───────────────────────────────────────────────────────────────
let pendingScreenshots = []; // [{dataUrl, name}]

function setupTradeForm() {
  const form = document.getElementById('tradeForm');
  if (!form) return;

  // Auto-calculate P&L on field changes
  ['tradeEntryPrice', 'tradeExitPrice', 'tradeQuantity', 'tradeFees', 'tradeType'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateCalculatedFields);
    if (el) el.addEventListener('change', updateCalculatedFields);
  });

  // Strategy custom
  const stratSel = document.getElementById('tradeStrategy');
  if (stratSel) {
    stratSel.addEventListener('change', () => {
      const customRow = document.getElementById('customStrategyRow');
      if (customRow) customRow.style.display = stratSel.value === '__custom__' ? 'flex' : 'none';
    });
  }

  // Instrument custom
  const instrSel = document.getElementById('tradeInstrument');
  if (instrSel) {
    instrSel.addEventListener('change', () => {
      const customRow = document.getElementById('customInstrumentRow');
      if (customRow) customRow.style.display = instrSel.value === '__custom__' ? 'flex' : 'none';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTrade();
  });

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
  const qty = parseFloat(document.getElementById('tradeQuantity')?.value) || 0;
  const fees = parseFloat(document.getElementById('tradeFees')?.value) || 0;
  const type = document.getElementById('tradeType')?.value;

  if (entry && exit && qty) {
    const raw = type === 'Buy' ? (exit - entry) * qty : (entry - exit) * qty;
    const pnl = parseFloat((raw - fees).toFixed(2));
    const outcome = pnl > 0 ? 'Win' : pnl < 0 ? 'Loss' : 'Breakeven';

    const pnlEl = document.getElementById('tradePnLPreview');
    if (pnlEl) {
      pnlEl.textContent = `P&L: ${formatPnL(pnl, settings.currency)} | Outcome: ${outcome}`;
      pnlEl.className = 'pnl-preview ' + (pnl >= 0 ? 'positive' : 'negative');
    }
  } else {
    const pnlEl = document.getElementById('tradePnLPreview');
    if (pnlEl) pnlEl.textContent = '';
  }
}

async function saveTrade() {
  const stratSel = document.getElementById('tradeStrategy');
  const instrSel = document.getElementById('tradeInstrument');
  const strategy = stratSel?.value === '__custom__'
    ? document.getElementById('customStrategyInput')?.value?.trim()
    : stratSel?.value;
  const instrument = instrSel?.value === '__custom__'
    ? document.getElementById('customInstrumentInput')?.value?.trim()
    : instrSel?.value;

  const trade = {
    entryDate: document.getElementById('tradeEntryDate')?.value || '',
    entryTime: document.getElementById('tradeEntryTime')?.value || '',
    exitDate: document.getElementById('tradeExitDate')?.value || '',
    exitTime: document.getElementById('tradeExitTime')?.value || '',
    instrument: instrument || '',
    tradeType: document.getElementById('tradeType')?.value || 'Buy',
    entryPrice: document.getElementById('tradeEntryPrice')?.value || '',
    exitPrice: document.getElementById('tradeExitPrice')?.value || '',
    quantity: document.getElementById('tradeQuantity')?.value || '',
    fees: document.getElementById('tradeFees')?.value || '0',
    stopLoss: document.getElementById('tradeStopLoss')?.value || '',
    target: document.getElementById('tradeTarget')?.value || '',
    strategy: strategy || '',
    setupTags: document.getElementById('tradeSetupTags')?.value || '',
    emotionBefore: document.getElementById('tradeEmotionBefore')?.value || '',
    emotionDuring: document.getElementById('tradeEmotionDuring')?.value || '',
    notes: document.getElementById('tradeNotes')?.value || '',
    screenshots: pendingScreenshots.map(s => ({ dataUrl: s.dataUrl, name: s.name }))
  };

  // Compute P&L and outcome
  trade.pnl = calcPnL(trade);
  trade.outcome = calcOutcome(trade.pnl);

  try {
    if (editingTradeId) {
      trade.id = editingTradeId;
      await updateTrade(trade);
      const idx = allTrades.findIndex(t => t.id === editingTradeId);
      if (idx !== -1) allTrades[idx] = trade;
      else allTrades.push(trade);
      editingTradeId = null;
      showToast('Trade updated successfully! 💾', 'success');
    } else {
      const id = await addTrade(trade);
      trade.id = id;
      allTrades.push(trade);
      showToast('Trade saved successfully! 💾', 'success');
    }
    resetTradeForm();
    showSection('log');
  } catch (e) {
    console.error('Failed to save trade:', e);
    showToast('Error saving trade. Please try again.', 'error');
  }
}

function resetTradeForm() {
  const form = document.getElementById('tradeForm');
  if (form) form.reset();
  pendingScreenshots = [];
  renderScreenshotPreviews();
  const pnlEl = document.getElementById('tradePnLPreview');
  if (pnlEl) pnlEl.textContent = '';
  const customStratRow = document.getElementById('customStrategyRow');
  if (customStratRow) customStratRow.style.display = 'none';
  const customInstrRow = document.getElementById('customInstrumentRow');
  if (customInstrRow) customInstrRow.style.display = 'none';
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

  // Populate form fields
  const fields = {
    tradeEntryDate: trade.entryDate, tradeEntryTime: trade.entryTime,
    tradeExitDate: trade.exitDate, tradeExitTime: trade.exitTime,
    tradeType: trade.tradeType, tradeEntryPrice: trade.entryPrice,
    tradeExitPrice: trade.exitPrice, tradeQuantity: trade.quantity,
    tradeFees: trade.fees, tradeStopLoss: trade.stopLoss,
    tradeTarget: trade.target, tradeEmotionBefore: trade.emotionBefore,
    tradeEmotionDuring: trade.emotionDuring, tradeNotes: trade.notes,
    tradeSetupTags: trade.setupTags
  };
  for (const [id, val] of Object.entries(fields)) {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  }

  // Strategy
  const stratSel = document.getElementById('tradeStrategy');
  if (stratSel) {
    const opt = [...stratSel.options].find(o => o.value === trade.strategy);
    if (opt) {
      stratSel.value = trade.strategy;
    } else if (trade.strategy) {
      stratSel.value = '__custom__';
      const customRow = document.getElementById('customStrategyRow');
      if (customRow) customRow.style.display = 'flex';
      const customInput = document.getElementById('customStrategyInput');
      if (customInput) customInput.value = trade.strategy;
    }
  }

  // Instrument
  const instrSel = document.getElementById('tradeInstrument');
  if (instrSel) {
    const opt = [...instrSel.options].find(o => o.value === trade.instrument);
    if (opt) {
      instrSel.value = trade.instrument;
    } else if (trade.instrument) {
      instrSel.value = '__custom__';
      const customRow = document.getElementById('customInstrumentRow');
      if (customRow) customRow.style.display = 'flex';
      const customInput = document.getElementById('customInstrumentInput');
      if (customInput) customInput.value = trade.instrument;
    }
  }

  // Screenshots
  pendingScreenshots = (trade.screenshots || []).map(s => ({ dataUrl: s.dataUrl, name: s.name }));
  renderScreenshotPreviews();

  const cancelBtn = document.getElementById('cancelEdit');
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  const formTitle = document.getElementById('formTitle');
  if (formTitle) formTitle.textContent = 'Edit Trade';

  updateCalculatedFields();
}

async function confirmAndDeleteTrade(id) {
  if (!confirm('Are you sure you want to delete this trade? This cannot be undone.')) return;
  try {
    await deleteTrade(id);
    allTrades = allTrades.filter(t => t.id !== id);
    showToast('Trade deleted.', 'info');
    renderTradeLog();
    if (currentSection === 'dashboard') renderDashboard();
  } catch (e) {
    showToast('Error deleting trade.', 'error');
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

function viewTrade(id) {
  const trade = allTrades.find(t => t.id === id);
  if (!trade) return;
  const pnl = calcPnL(trade);
  const outcome = calcOutcome(pnl);

  const screenshots = trade.screenshots || [];
  const screenshotsHtml = screenshots.length
    ? `<div class="full-width screenshots-section"><label>Screenshots</label><div class="screenshot-grid">${
        screenshots.map((s, i) => `<img src="${escapeHtml(s.dataUrl)}" alt="Screenshot ${i + 1}" class="screenshot-thumb" data-ss-index="${i}">`).join('')
      }</div></div>`
    : '';

  const content = `
    <div class="trade-detail-grid">
      <div><label>Date</label><span>${escapeHtml(trade.entryDate)} ${escapeHtml(trade.entryTime)}</span></div>
      <div><label>Exit</label><span>${escapeHtml(trade.exitDate)} ${escapeHtml(trade.exitTime)}</span></div>
      <div><label>Instrument</label><span>${escapeHtml(trade.instrument)}</span></div>
      <div><label>Type</label><span class="badge ${trade.tradeType === 'Buy' ? 'badge-buy' : 'badge-sell'}">${escapeHtml(trade.tradeType)}</span></div>
      <div><label>Entry Price</label><span>${escapeHtml(trade.entryPrice)}</span></div>
      <div><label>Exit Price</label><span>${escapeHtml(trade.exitPrice)}</span></div>
      <div><label>Quantity</label><span>${escapeHtml(trade.quantity)}</span></div>
      <div><label>Fees</label><span>${escapeHtml(trade.fees || '0')}</span></div>
      <div><label>Stop Loss</label><span>${escapeHtml(trade.stopLoss)}</span></div>
      <div><label>Target</label><span>${escapeHtml(trade.target)}</span></div>
      <div><label>Strategy</label><span>${escapeHtml(trade.strategy)}</span></div>
      <div><label>Setup Tags</label><span>${escapeHtml(trade.setupTags)}</span></div>
      <div><label>Emotion Before</label><span>${escapeHtml(trade.emotionBefore)}</span></div>
      <div><label>Emotion During</label><span>${escapeHtml(trade.emotionDuring)}</span></div>
      <div class="full-width"><label>P&amp;L</label><span class="${pnl >= 0 ? 'positive' : 'negative'} large-pnl">${formatPnL(pnl, settings.currency)}</span></div>
      <div class="full-width"><label>Outcome</label><span class="badge badge-${outcome.toLowerCase()}">${escapeHtml(outcome)}</span></div>
      <div class="full-width"><label>Notes</label><p class="notes-text">${escapeHtml(trade.notes)}</p></div>
      ${screenshotsHtml}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="modalEditBtn">Edit</button>
      <button class="btn btn-danger" id="modalDeleteBtn">Delete</button>
      <button class="btn btn-secondary" id="modalCloseBtn">Close</button>
    </div>
  `;
  openModal(`Trade — ${escapeHtml(trade.instrument)} ${escapeHtml(trade.entryDate)}`, content);

  // Attach event listeners after modal is rendered
  document.getElementById('modalEditBtn')?.addEventListener('click', () => { editTrade(id); closeModal(); });
  document.getElementById('modalDeleteBtn')?.addEventListener('click', () => handleDelete(id));
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);

  // Screenshot lightbox
  document.querySelectorAll('[data-ss-index]').forEach(img => {
    img.addEventListener('click', () => {
      const ssIdx = parseInt(img.dataset.ssIndex, 10);
      openLightboxUrl(screenshots[ssIdx]?.dataUrl || '');
    });
  });
}

async function handleDelete(id) {
  closeModal();
  if (!confirm('Are you sure you want to delete this trade?')) return;
  try {
    await deleteTrade(id);
    allTrades = allTrades.filter(t => t.id !== id);
    showToast('Trade deleted.', 'info');
    renderTradeLog();
    renderDashboard();
  } catch (e) {
    showToast('Error deleting trade.', 'error');
  }
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
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      files.forEach(f => readImageFile(f));
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files).filter(f => f.type.startsWith('image/')).forEach(f => readImageFile(f));
      fileInput.value = '';
    });
  }

  // Paste handler (global, active when on add/edit page)
  document.addEventListener('paste', (e) => {
    if (currentSection !== 'add') return;
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) readImageFile(file);
      }
    }
  });
}

function readImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingScreenshots.push({ dataUrl: e.target.result, name: file.name || 'screenshot.png' });
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
    img.addEventListener('click', () => openLightbox(parseInt(img.dataset.index, 10)));
  });
  container.querySelectorAll('.remove-screenshot').forEach(btn => {
    btn.addEventListener('click', () => removeScreenshot(parseInt(btn.dataset.index, 10)));
  });
}

function removeScreenshot(index) {
  pendingScreenshots.splice(index, 1);
  renderScreenshotPreviews();
}

function openLightbox(srcOrIndex) {
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  if (lb && lbImg) {
    if (typeof srcOrIndex === 'number') {
      lbImg.src = pendingScreenshots[srcOrIndex]?.dataUrl || '';
    } else {
      lbImg.src = srcOrIndex;
    }
    lb.classList.add('active');
  }
}

function openLightboxUrl(url) {
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  if (lb && lbImg) {
    lbImg.src = url;
    lb.classList.add('active');
  }
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (lb) lb.classList.remove('active');
}

// ─── Trade Log ────────────────────────────────────────────────────────────────
let sortState = { col: 'entryDate', dir: 'desc' };

function setupFilterHandlers() {
  const filterIds = ['filterDateFrom', 'filterDateTo', 'filterInstrument', 'filterStrategy', 'filterOutcome', 'filterSearch'];
  filterIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyFilters);
  });

  const clearBtn = document.getElementById('clearFilters');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    filterIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    applyFilters();
  });

  // Sort headers
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
  const enriched = allTrades.map(t => ({ ...t, pnl: calcPnL(t), outcome: t.outcome || calcOutcome(calcPnL(t)) }));
  return enriched.filter(t => {
    if (filterState.dateFrom && t.entryDate < filterState.dateFrom) return false;
    if (filterState.dateTo && t.entryDate > filterState.dateTo) return false;
    if (filterState.instrument && !(t.instrument || '').toLowerCase().includes(filterState.instrument)) return false;
    if (filterState.strategy && !(t.strategy || '').toLowerCase().includes(filterState.strategy)) return false;
    if (filterState.outcome && t.outcome !== filterState.outcome) return false;
    if (filterState.search) {
      const haystack = `${t.notes} ${t.instrument} ${t.strategy} ${t.setupTags}`.toLowerCase();
      if (!haystack.includes(filterState.search)) return false;
    }
    return true;
  });
}

function renderTradeLog() {
  const filtered = getFilteredTrades();
  const sorted = [...filtered].sort((a, b) => {
    const col = sortState.col;
    let av = a[col] ?? '', bv = b[col] ?? '';
    if (col === 'pnl' || col === 'entryPrice' || col === 'exitPrice') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
    if (av < bv) return sortState.dir === 'asc' ? -1 : 1;
    if (av > bv) return sortState.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = document.getElementById('tradeLogTbody');
  if (!tbody) return;

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No trades found. Add your first trade!</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(t => `
    <tr class="trade-row">
      <td>${t.entryDate || '—'}</td>
      <td>${t.instrument || '—'}</td>
      <td><span class="badge ${t.tradeType === 'Buy' ? 'badge-buy' : 'badge-sell'}">${t.tradeType || '—'}</span></td>
      <td>${t.entryPrice || '—'}</td>
      <td>${t.exitPrice || '—'}</td>
      <td>${t.quantity || '—'}</td>
      <td>${t.strategy || '—'}</td>
      <td class="${t.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(t.pnl, settings.currency)}</td>
      <td><span class="badge badge-${(t.outcome || '').toLowerCase()}">${t.outcome || '—'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" onclick="viewTrade(${t.id})">View</button>
        <button class="btn btn-sm btn-primary" onclick="editTrade(${t.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="handleDelete(${t.id})">Del</button>
        ${(t.screenshots && t.screenshots.length) ? `<span class="img-count" title="${t.screenshots.length} screenshot(s)">📷${t.screenshots.length}</span>` : ''}
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
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (file) importJSON(file);
      importInput.value = '';
    });
  }

  const importBtn = document.getElementById('importBtn');
  if (importBtn) importBtn.addEventListener('click', () => importInput && importInput.click());
}

function exportJSON() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    trades: allTrades
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade-journal-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Trades exported successfully!', 'success');
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const trades = Array.isArray(data) ? data : (data.trades || []);
    if (!trades.length) { showToast('No trades found in file.', 'error'); return; }
    const mode = await confirmImportMode();
    if (mode === 'cancel') return;
    if (mode === 'replace') {
      await clearAllTrades();
      allTrades = [];
    }
    const count = await bulkAddTrades(trades);
    allTrades = await getAllTrades();
    showToast(`Imported ${count} trades successfully!`, 'success');
    renderDashboard();
  } catch (e) {
    console.error('Import failed:', e);
    showToast('Import failed — invalid JSON file.', 'error');
  }
}

function confirmImportMode() {
  return new Promise((resolve) => {
    const content = `
      <p>How would you like to import?</p>
      <div class="modal-actions">
        <button class="btn btn-danger" id="importReplaceBtn">Replace All</button>
        <button class="btn btn-primary" id="importMergeBtn">Merge / Append</button>
        <button class="btn btn-secondary" id="importCancelBtn">Cancel</button>
      </div>
    `;
    openModal('Import Trades', content);

    const done = (mode) => { closeModal(); resolve(mode); };
    document.getElementById('importReplaceBtn')?.addEventListener('click', () => done('replace'));
    document.getElementById('importMergeBtn')?.addEventListener('click', () => done('merge'));
    document.getElementById('importCancelBtn')?.addEventListener('click', () => done('cancel'));
  });
}

// ─── Settings Form ────────────────────────────────────────────────────────────
function setupSettingsForm() {
  const saveBtn = document.getElementById('saveSettings');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const currency = document.getElementById('settingCurrency')?.value?.trim() || '₹';
    const instruments = document.getElementById('settingInstruments')?.value?.trim() || '';
    const dailyGoal = document.getElementById('settingDailyGoal')?.value?.trim() || '';
    const maxLoss = document.getElementById('settingMaxLoss')?.value?.trim() || '';
    const openaiKey = document.getElementById('settingOpenAIKey')?.value?.trim() || '';
    settings.currency = currency;
    settings.instruments = instruments;
    settings.dailyGoal = dailyGoal;
    settings.maxLoss = maxLoss;
    settings.openaiKey = openaiKey;
    await setSetting('currency', currency);
    await setSetting('instruments', instruments);
    await setSetting('dailyGoal', dailyGoal);
    await setSetting('maxLoss', maxLoss);
    await setSetting('openaiKey', openaiKey);
    populateInstrumentDropdown();
    showToast('Settings saved!', 'success');
  });

  const clearDataBtn = document.getElementById('clearAllData');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
      if (!confirm('⚠️ This will DELETE ALL your trades permanently. Are you absolutely sure?')) return;
      if (!confirm('Last chance! All trade data will be lost. Continue?')) return;
      await clearAllTrades();
      allTrades = [];
      showToast('All data cleared.', 'info');
      renderDashboard();
    });
  }
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
window.openLightbox = openLightbox;
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

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const todayTrades = allTrades.filter(t => (t.entryDate || '') === todayStr);
  const todayPnL = todayTrades.reduce((s, t) => s + calcPnL(t), 0);
  const c = settings.currency;

  let html = '<div class="daily-goals-grid">';

  if (goalVal) {
    const pct = Math.min(Math.max(todayPnL / goalVal * 100, 0), 100);
    const goalClass = todayPnL >= goalVal ? 'positive' : '';
    html += `
      <div class="goal-item">
        <div class="goal-label">🎯 Daily Goal: <strong>${c}${goalVal.toFixed(0)}</strong> &nbsp; Today: <span class="${goalClass}">${formatPnL(todayPnL, c)}</span></div>
        <div class="goal-progress-bar"><div class="goal-progress-fill goal-fill-green" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="goal-pct">${pct.toFixed(0)}% achieved</div>
      </div>`;
  }

  if (maxLossVal) {
    const loss = Math.max(-todayPnL, 0);
    const pct = Math.min(loss / maxLossVal * 100, 100);
    const lossClass = todayPnL < -maxLossVal ? 'negative' : '';
    html += `
      <div class="goal-item">
        <div class="goal-label">🛡️ Max Loss Limit: <strong>${c}${maxLossVal.toFixed(0)}</strong> &nbsp; Today's Loss: <span class="${lossClass}">${c}${loss.toFixed(2)}</span></div>
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

  const enriched = allTrades.map(t => ({ ...t, pnl: calcPnL(t) }));
  const total = enriched.length;
  const profitFactor = analytics.profitFactor;

  const sorted = [...enriched].sort((a, b) => ((a.entryDate||'') + (a.entryTime||'')) > ((b.entryDate||'') + (b.entryTime||'')) ? 1 : -1);
  let maxStreak = 0, curStreak = 0;
  for (const t of sorted) {
    if (t.pnl > 0) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 0;
  }

  const byMonth = {};
  for (const t of enriched) {
    if (!t.entryDate) continue;
    const m = t.entryDate.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + t.pnl;
  }
  const hasProfitableMonth = Object.values(byMonth).some(v => v > 0);

  const achievements = [
    { icon: '🌱', title: 'First Trade', desc: 'Logged your first trade', unlocked: total >= 1 },
    { icon: '📋', title: '10 Trades', desc: 'Logged 10 trades', unlocked: total >= 10 },
    { icon: '💯', title: '100 Trades', desc: 'Logged 100 trades', unlocked: total >= 100 },
    { icon: '🔥', title: 'Win Streak 3', desc: '3 consecutive winning trades', unlocked: maxStreak >= 3 },
    { icon: '⚡', title: 'Win Streak 5', desc: '5 consecutive winning trades', unlocked: maxStreak >= 5 },
    { icon: '🏆', title: 'Best Month', desc: 'Had a profitable month', unlocked: hasProfitableMonth },
    { icon: '📈', title: 'Profit Factor 2', desc: 'Achieved profit factor above 2', unlocked: isFinite(profitFactor) && profitFactor >= 2 },
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
    content.innerHTML = '<p class="empty-state" style="padding:40px 0;">No trades yet. Add some trades to see reports.</p>';
    return;
  }

  const enriched = allTrades.map(t => ({ ...t, pnl: calcPnL(t) }));
  const c = settings.currency;

  if (currentReportsTab === 'monthly') content.innerHTML = renderMonthlyReport(enriched, c);
  else if (currentReportsTab === 'weekly') content.innerHTML = renderWeeklyReport(enriched, c);
  else if (currentReportsTab === 'yearly') content.innerHTML = renderYearlyReport(enriched, c);
}

function renderMonthlyReport(enriched, c) {
  const byMonth = {};
  for (const t of enriched) {
    if (!t.entryDate) continue;
    const m = t.entryDate.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(t);
  }
  const months = Object.keys(byMonth).sort().reverse();
  if (!months.length) return '<p class="empty-state">No data.</p>';

  const monthStats = months.map(m => {
    const trades = byMonth[m];
    const pnl = trades.reduce((s, t) => s + t.pnl, 0);
    const wins = trades.filter(t => t.pnl > 0).length;
    const wr = Math.round(wins / trades.length * 100);
    const bestDay = Math.max(...trades.map(t => t.pnl));
    const worstDay = Math.min(...trades.map(t => t.pnl));
    return { m, trades: trades.length, wr, pnl, bestDay, worstDay };
  });

  const bestPnL = Math.max(...monthStats.map(s => s.pnl));
  const worstPnL = Math.min(...monthStats.map(s => s.pnl));

  const rows = monthStats.map(s => {
    const isBest = s.pnl === bestPnL && bestPnL > 0;
    const isWorst = s.pnl === worstPnL && worstPnL < 0;
    const rowClass = isBest ? 'row-highlight-best' : isWorst ? 'row-highlight-worst' : '';
    return `<tr class="${rowClass}">
      <td>${s.m} ${isBest ? '🏆' : isWorst ? '⚠️' : ''}</td>
      <td>${s.trades}</td>
      <td>${s.wr}%</td>
      <td class="${s.pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(s.pnl, c)}</td>
      <td class="positive">${s.bestDay >= 0 ? '+' : ''}${formatPnL(s.bestDay, c)}</td>
      <td class="negative">${formatPnL(s.worstDay, c)}</td>
    </tr>`;
  }).join('');

  return `
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Month</th><th>Trades</th><th>Win Rate</th><th>P&L</th><th>Best Day</th><th>Worst Day</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderWeeklyReport(enriched, c) {
  function getWeekLabel(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  function getWeekRange(weekLabel) {
    const [year, wStr] = weekLabel.split('-W');
    const weekNum = parseInt(wStr, 10);
    const d = new Date(parseInt(year, 10), 0, 1 + (weekNum - 1) * 7);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')} – ${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
  }

  const byWeek = {};
  for (const t of enriched) {
    if (!t.entryDate) continue;
    const wk = getWeekLabel(t.entryDate);
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(t);
  }
  const weeks = Object.keys(byWeek).sort().reverse().slice(0, 8);
  if (!weeks.length) return '<p class="empty-state">No data.</p>';

  const rows = weeks.map(wk => {
    const trades = byWeek[wk];
    const pnl = trades.reduce((s, t) => s + t.pnl, 0);
    const wins = trades.filter(t => t.pnl > 0).length;
    const wr = Math.round(wins / trades.length * 100);
    return `<tr>
      <td>${wk} <small style="color:var(--text-secondary)">(${getWeekRange(wk)})</small></td>
      <td>${trades.length}</td>
      <td>${wr}%</td>
      <td class="${pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(pnl, c)}</td>
    </tr>`;
  }).join('');

  return `
    <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">Last 8 weeks</p>
    <div class="table-wrapper">
      <table>
        <thead><tr><th>Week</th><th>Trades</th><th>Win Rate</th><th>P&L</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderYearlyReport(enriched, c) {
  const byYear = {};
  for (const t of enriched) {
    if (!t.entryDate) continue;
    const y = t.entryDate.slice(0, 4);
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push(t);
  }
  const years = Object.keys(byYear).sort().reverse();
  if (!years.length) return '<p class="empty-state">No data.</p>';

  const yearlyRows = years.map(y => {
    const trades = byYear[y];
    const pnl = trades.reduce((s, t) => s + t.pnl, 0);
    const wins = trades.filter(t => t.pnl > 0).length;
    const wr = Math.round(wins / trades.length * 100);
    return `<tr>
      <td>${y}</td>
      <td>${trades.length}</td>
      <td>${wr}%</td>
      <td class="${pnl >= 0 ? 'positive' : 'negative'}">${formatPnL(pnl, c)}</td>
    </tr>`;
  }).join('');

  const recentYear = years[0];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthlyPnL = Array(12).fill(0);
  for (const t of byYear[recentYear]) {
    const m = parseInt((t.entryDate || '').slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) monthlyPnL[m] += t.pnl;
  }

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

  return `
    <div class="table-wrapper" style="margin-bottom:24px;">
      <table>
        <thead><tr><th>Year</th><th>Trades</th><th>Win Rate</th><th>P&L</th></tr></thead>
        <tbody>${yearlyRows}</tbody>
      </table>
    </div>
    <div class="chart-card">
      <h3>📅 Monthly P&L — ${recentYear}</h3>
      <div class="chart-wrapper"><canvas id="${chartId}"></canvas></div>
    </div>`;
}

window.switchReportsTab = switchReportsTab;

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('modal');
  if (e.target === modal) closeModal();
  const lb = document.getElementById('lightbox');
  if (e.target === lb) closeLightbox();
});

// Keyboard: Escape to close modal/lightbox
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
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
