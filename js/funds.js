// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let currentMonth = getCurrentYearMonth();
let sortAsc = true;
let longPressTimer = null;
let longPressSourceId = null;
let currentPage = 'assets';
let userNote = '';

const COLORS = getThemeColors().chart;
const ICONS = ['fa-solid fa-wallet', 'fa-solid fa-landmark', 'fa-solid fa-credit-card', 'fa-solid fa-piggy-bank', 'fa-solid fa-chart-line', 'fa-solid fa-coins', 'fa-solid fa-building-columns', 'fa-solid fa-money-bill-wave'];

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  // 立即处理跳转，防止闪烁
  const switchTo = sessionStorage.getItem('switchTo');
  if (switchTo) {
    sessionStorage.removeItem('switchTo');
    if (switchTo === 'history') {
      document.getElementById('assetGrid').style.display = 'none';
      document.querySelector('.section-header').style.display = 'none';
      document.getElementById('recordSection').style.display = '';
      document.getElementById('totalCard').style.display = 'none';
      currentPage = 'history';
    }
  }

  await waitForSupabase();
  if (!(await requireAuth())) return;
  await loadAllData();

  if (switchTo === 'history') {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => n.classList.remove('active'));
    navItems[1].classList.add('active');
    renderRecordPage();
  } else if (switchTo === 'ai') {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(n => n.classList.remove('active'));
    navItems[2].classList.add('active');
    currentPage = 'ai';
  } else {
    renderAssets();
  }

  if (location.hash === '#openAdd') {
    history.replaceState(null, '', location.pathname);
    showAddModal();
  }
});

async function loadAllData() {
  try {
    allSources = await fundApi.getSources();
    allRecords = await fundApi.getAllRecords();
    userNote = await fundApi.getNote();
    updateRecordBadge();
  } catch (e) {
    console.error('加载数据失败:', e);
  }
}

function updateRecordBadge() {
  const badge = document.getElementById('recordBadge');
  if (!badge) return;
  let unfilled = 0;
  allSources.forEach(s => {
    const has = allRecords.some(r => r.sourceId === s.id && r.yearMonth === currentMonth);
    if (!has) unfilled++;
  });
  if (unfilled > 0) {
    badge.textContent = unfilled;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ============ 渲染资产 ============
function renderAssets() {
  renderTotalCard();
  renderAssetGrid();
}

function renderTotalCard() {
  const total = getMonthTotal(currentMonth, true);
  const prev = getMonthTotal(getPrevMonth(currentMonth), true);
  const diff = total - prev;

  const amountEl = document.getElementById('totalAmount');
  amountEl.childNodes[0].textContent = '¥' + fmtNum(total);

  const pnlEl = document.getElementById('monthPnl');
  if (prev > 0 || total > 0) {
    pnlEl.textContent = (diff >= 0 ? '+' + fmtNum(diff) : fmtNum(diff)) + '    本月';
    pnlEl.className = 'total-pnl';
    pnlEl.style.color = diff >= 0 ? '#ef4444' : '#22c55e';
  } else {
    pnlEl.textContent = '暂无数据';
    pnlEl.className = 'total-pnl';
    pnlEl.style.color = '';
  }

  // 资产大类标签（排除借贷）
  const tagsEl = document.getElementById('totalTags');
  if (allSources.length === 0) {
    tagsEl.innerHTML = '';
    return;
  }

  const typeMap = { '流动': 0, '基金': 0, '股票': 0 };
  const themeColors = getThemeColors();
  const typeColors = { '流动': themeColors.流动, '基金': themeColors.基金, '股票': themeColors.股票 };
  allSources.forEach(s => {
    if (s.type === '借贷') return;
    const amt = getAmountForMonth(s.id, currentMonth);
    const t = s.type || '流动';
    if (typeMap[t] !== undefined) typeMap[t] += amt;
    else typeMap['流动'] += amt;
  });

  tagsEl.innerHTML = Object.entries(typeMap).map(([name, amt]) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : '0.0';
    return `<div class="total-tag"><span class="total-tag-dot" style="background:${typeColors[name]}"></span>${name} ${pct}%</div>`;
  }).join('');

  // 借贷总额
  let loanTotal = 0;
  allSources.forEach(s => {
    if (s.type === '借贷') {
      loanTotal += Math.abs(getAmountForMonth(s.id, currentMonth));
    }
  });
  const loanEl = document.getElementById('totalLoan');
  if (loanTotal > 0) {
    loanEl.textContent = ' / 借贷：¥' + fmtNum(loanTotal);
    loanEl.style.display = '';
  } else {
    loanEl.style.display = 'none';
  }
}

function renderAssetGrid() {
  const grid = document.getElementById('assetGrid');

  if (allSources.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i class="fa-solid fa-wallet"></i><p>还没有资产，点击 + 添加</p></div>`;
    return;
  }

  const items = allSources.map((s, i) => {
    const total = getAmountForMonth(s.id, currentMonth);
    const prev = getAmountForMonth(s.id, getPrevMonth(currentMonth));
    const diff = total - prev;
    let pnlClass = 'flat', pnlText = '本月 +0';
    if (prev > 0 || total > 0) {
      pnlClass = diff >= 0 ? 'up' : 'down';
      pnlText = '本月 ' + (diff >= 0 ? '+' + fmtNum(diff) : fmtNum(diff));
    }
    return { ...s, total, pnlClass, pnlText, color: COLORS[i % COLORS.length], icon: s.icon || ICONS[i % ICONS.length], idx: i };
  });

  if (sortAsc) items.sort((a, b) => b.total - a.total);
  else items.sort((a, b) => a.total - b.total);

  grid.innerHTML = items.map(item => `
    <div class="asset-card" data-id="${item.id}" onclick="handleCardClick('${item.id}')" onmousedown="startLongPress('${item.id}')" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()" ontouchstart="startLongPress('${item.id}')" ontouchend="cancelLongPress()" ontouchcancel="cancelLongPress()" style="cursor:pointer;">
      <div class="asset-info">
        <div class="asset-top-row">
          <div class="asset-name">${item.name}</div>
          <div class="asset-pnl ${item.pnlClass}">${item.pnlText}</div>
        </div>
        <div class="asset-amount">¥${fmtNum(item.total)}</div>
      </div>
      <div class="asset-icon" style="background:${item.color}18;color:${item.color};">
        <i class="${item.icon}"></i>
      </div>
    </div>
  `).join('');
}

// ============ 排序 ============
function toggleSort() {
  sortAsc = !sortAsc;
  const icon = document.querySelector('#sortBtn i');
  icon.className = sortAsc ? 'fa-solid fa-arrow-down-wide-short' : 'fa-solid fa-arrow-up-wide-short';
  renderAssetGrid();
}

// ============ 新增/删除 ============
function showAddModal() {
  document.getElementById('addModal').classList.add('show');
  const inp = document.getElementById('addModalInput');
  inp.value = '';
  setTimeout(() => inp.focus(), 100);
}

function hideAddModal() { document.getElementById('addModal').classList.remove('show'); }

document.getElementById('addModal').addEventListener('click', e => { if (e.target === e.currentTarget) hideAddModal(); });
document.getElementById('addModalInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmAddSource(); });

async function confirmAddSource() {
  const inp = document.getElementById('addModalInput');
  const typeEl = document.getElementById('addModalType');
  const name = inp.value.trim();
  if (!name) return;
  try {
    const icon = guessIcon(name);
    await fundApi.addSource(name, typeEl.value, icon);
    allSources = await fundApi.getSources();
    hideAddModal();
    renderAssets();
  } catch (e) { alert('添加失败: ' + e.message); }
}

// ============ 底部导航 ============
function switchPage(page, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  else if (event && event.currentTarget) event.currentTarget.classList.add('active');
  currentPage = page;

  const assetGrid = document.getElementById('assetGrid');
  const sectionHeader = document.querySelector('.section-header');
  const recordSection = document.getElementById('recordSection');
  const totalCard = document.getElementById('totalCard');

  if (page === 'assets') {
    assetGrid.style.display = '';
    sectionHeader.style.display = '';
    recordSection.style.display = 'none';
    totalCard.style.display = '';
    renderAssets();
  } else if (page === 'history') {
    assetGrid.style.display = 'none';
    sectionHeader.style.display = 'none';
    recordSection.style.display = '';
    totalCard.style.display = 'none';
    renderRecordPage();
  } else {
    assetGrid.style.display = '';
    sectionHeader.style.display = '';
    recordSection.style.display = 'none';
    totalCard.style.display = '';
  }
}

// ============ 长按检测 ============
function startLongPress(id) {
  cancelLongPress();
  longPressTimer = setTimeout(() => {
    longPressSourceId = id;
    showActionModal(id);
  }, 500);
}

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

let cardClickBlocked = false;

function handleCardClick(id) {
  if (cardClickBlocked) { cardClickBlocked = false; return; }
  location.href = 'detail.html?id=' + id;
}

// ============ 长按操作弹窗 ============
function showActionModal(id) {
  cardClickBlocked = true;
  const source = allSources.find(s => s.id === id);
  if (!source) return;
  document.getElementById('actionTitle').textContent = source.name;
  document.getElementById('actionModal').classList.add('show');
}

function hideActionModal() {
  document.getElementById('actionModal').classList.remove('show');
  longPressSourceId = null;
}

document.getElementById('actionModal').addEventListener('click', e => { if (e.target === e.currentTarget) hideActionModal(); });

// ============ 修改类别弹窗 ============
function showEditModal() {
  const id = longPressSourceId;
  hideActionModal();
  const source = allSources.find(s => s.id === id);
  if (!source) return;
  longPressSourceId = id;
  document.getElementById('editModalInput').value = source.name;
  document.getElementById('editModalType').value = source.type || '流动';
  document.getElementById('editModal').classList.add('show');
  setTimeout(() => document.getElementById('editModalInput').focus(), 100);
}

function hideEditModal() {
  document.getElementById('editModal').classList.remove('show');
  longPressSourceId = null;
}

document.getElementById('editModal').addEventListener('click', e => { if (e.target === e.currentTarget) hideEditModal(); });
document.getElementById('editModalInput').addEventListener('keydown', e => { if (e.key === 'Enter') confirmEditSource(); });

async function confirmEditSource() {
  const name = document.getElementById('editModalInput').value.trim();
  const type = document.getElementById('editModalType').value;
  if (!name || !longPressSourceId) return;
  try {
    await fundApi.updateSource(longPressSourceId, name, type);
    allSources = await fundApi.getSources();
    hideEditModal();
    renderAssets();
  } catch (e) { alert('修改失败: ' + e.message); }
}

// ============ 删除类别弹窗 ============
function showDeleteModal() {
  const id = longPressSourceId;
  hideActionModal();
  const source = allSources.find(s => s.id === id);
  if (!source) return;
  longPressSourceId = id;
  document.getElementById('deleteModalText').textContent = `确定要删除"${source.name}"吗？删除后相关记录也会被删除。`;
  document.getElementById('deleteModal').classList.add('show');
}

function hideDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  longPressSourceId = null;
}

document.getElementById('deleteModal').addEventListener('click', e => { if (e.target === e.currentTarget) hideDeleteModal(); });

async function confirmDeleteSource() {
  if (!longPressSourceId) return;
  try {
    await fundApi.deleteSource(longPressSourceId);
    allSources = await fundApi.getSources();
    allRecords = allRecords.filter(r => r.sourceId !== longPressSourceId);
    hideDeleteModal();
    renderAssets();
  } catch (e) { alert('删除失败: ' + e.message); }
}

// ============ 记录页面 ============
function renderRecordPage() {
  const container = document.getElementById('recordSection');
  if (allSources.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-pen-to-square"></i><p>请先添加资产</p></div>';
    return;
  }

  const items = allSources.map(s => {
    const records = allRecords.filter(r => r.sourceId === s.id && r.yearMonth === currentMonth);
    const hasRecord = records.length > 0;
    const amount = hasRecord ? records[records.length - 1].amount : '';
    return { ...s, hasRecord, amount };
  });

  container.innerHTML = `
    <div class="record-section">
      <div class="record-header">
        <div class="record-title">本月记录</div>
        <div class="record-month">${currentMonth}</div>
      </div>
      <div class="record-grid">
        ${items.map(item => `
          <div class="record-card">
            <div class="record-card-top">
              <div class="record-card-icon"><i class="${item.icon || 'fa-solid fa-wallet'}"></i></div>
              <div class="record-status ${item.hasRecord ? 'filled' : 'empty'}">${item.hasRecord ? '已填写' : '未填写'}</div>
            </div>
            <div class="record-card-name">${item.name}</div>
            <input type="text" class="record-input" data-id="${item.id}" placeholder="¥0.00" value="${item.amount !== '' ? item.amount : ''}" readonly inputmode="none" onfocus="this.blur()">
          </div>
        `).join('')}
      </div>
      <button class="save-record-btn" onclick="saveMonthRecords()">保存本月记录</button>
    </div>
  `;
}

async function saveMonthRecords() {
  const inputs = document.querySelectorAll('.record-input');
  const records = [];
  let allFilled = true;

  inputs.forEach(inp => {
    const sourceId = inp.dataset.id;
    const val = parseFloat(inp.value);
    if (isNaN(val) || inp.value.trim() === '') {
      allFilled = false;
    } else {
      records.push({ sourceId, amount: val });
    }
  });

  if (!allFilled) {
    alert('请填写所有资产的金额');
    return;
  }

  // 借贷类资产必须为负数
  for (const inp of inputs) {
    const sourceId = inp.dataset.id;
    const source = allSources.find(s => s.id === sourceId);
    if (source && source.type === '借贷') {
      const val = parseFloat(inp.value);
      if (!isNaN(val) && val > 0) {
        alert('借贷类资产的金额必须为负数');
        return;
      }
    }
  }

  pendingRecords = records;
  document.getElementById('confirmText').textContent = userNote || '确认保存本月记录？';
  document.getElementById('confirmModal').classList.add('show');
}

let pendingRecords = [];

function hideConfirmModal() {
  document.getElementById('confirmModal').classList.remove('show');
  pendingRecords = [];
}

document.getElementById('confirmModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideConfirmModal();
});

async function doSaveRecords() {
  const records = [...pendingRecords];
  hideConfirmModal();
  try {
    await fundApi.saveRecords(currentMonth, records);
    allRecords = await fundApi.getAllRecords();
    updateRecordBadge();
    renderRecordPage();
    const toast = document.createElement('div');
    toast.className = 'save-toast';
    toast.textContent = '保存成功';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  } catch (e) { alert('保存失败: ' + e.message); }
  pendingRecords = [];
}

// ============ 数字键盘 ============
let kbTarget = null;
let kbValue = '';

function showKeyboard(input) {
  kbTarget = input;
  kbValue = input.value || '';
  updateKbPreview();
  document.getElementById('numKeyboard').classList.add('show');
}

function hideKeyboard() {
  document.getElementById('numKeyboard').classList.remove('show');
  kbTarget = null;
}

function updateKbPreview() {
  document.getElementById('kbPreview').textContent = kbValue || '0';
}

function kbInput(ch) {
  if (ch === '-') {
    if (kbValue.startsWith('-')) { kbValue = kbValue.slice(1); }
    else { kbValue = '-' + kbValue; }
    if (kbTarget) kbTarget.value = kbValue;
    updateKbPreview();
    return;
  }
  if (ch === '.' && kbValue.includes('.')) return;
  if (kbValue === '0' && ch !== '.') kbValue = ch;
  else kbValue += ch;
  if (kbTarget) kbTarget.value = kbValue;
  updateKbPreview();
}

function kbBackspace() {
  kbValue = kbValue.slice(0, -1);
  if (kbTarget) kbTarget.value = kbValue;
  updateKbPreview();
}

function kbClear() {
  kbValue = '';
  if (kbTarget) kbTarget.value = '';
  updateKbPreview();
}

function kbConfirm() {
  hideKeyboard();
}

// 绑定所有数字输入框
document.addEventListener('click', e => {
  const inp = e.target.closest('.record-input');
  if (inp) {
    inp.blur();
    showKeyboard(inp);
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

// 点击键盘外部关闭
document.addEventListener('click', e => {
  if (!e.target.closest('.num-keyboard') && !e.target.closest('.record-input')) {
    hideKeyboard();
  }
});

// ============ 工具函数 ============
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPrevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function getMonthTotal(ym, excludeLoan) {
  let total = 0;
  allSources.forEach(s => {
    if (excludeLoan && s.type === '借贷') return;
    total += getAmountForMonth(s.id, ym);
  });
  return total;
}

function getAmountForMonth(sourceId, ym) {
  const records = allRecords.filter(r => r.sourceId === sourceId && r.yearMonth === ym);
  if (records.length > 0) return records[records.length - 1].amount;
  // 没有当月记录时，回退到上个月
  if (ym === currentMonth) {
    const prev = getPrevMonth(ym);
    const prevRecords = allRecords.filter(r => r.sourceId === sourceId && r.yearMonth === prev);
    return prevRecords.length > 0 ? prevRecords[prevRecords.length - 1].amount : 0;
  }
  return 0;
}

function fmtNum(n) {
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function guessIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('支付宝') || n.includes('alipay')) return 'fa-brands fa-alipay';
  if (n.includes('京东') || n.includes('jd')) return 'fa-brands fa-jd';
  if (n.includes('微信') || n.includes('wechat')) return 'fa-brands fa-weixin';
  if (n.includes('农行') || n.includes('农业')) return 'fa-solid fa-leaf';
  if (n.includes('建行') || n.includes('建设')) return 'fa-solid fa-building';
  if (n.includes('工行') || n.includes('工商')) return 'fa-solid fa-industry';
  if (n.includes('中行') || n.includes('中国银行')) return 'fa-solid fa-landmark';
  if (n.includes('招商') || n.includes('招行')) return 'fa-solid fa-hands-holding-circle';
  if (n.includes('银行卡') || n.includes('储蓄')) return 'fa-solid fa-credit-card';
  if (n.includes('股票') || n.includes('证券') || n.includes('炒股')) return 'fa-solid fa-arrow-trend-up';
  if (n.includes('基金') || n.includes('理财') || n.includes('定投')) return 'fa-solid fa-chart-line';
  if (n.includes('现金') || n.includes('钱包')) return 'fa-solid fa-wallet';
  if (n.includes('银行') || n.includes('存款')) return 'fa-solid fa-building-columns';
  if (n.includes('利息') || n.includes('收益') || n.includes('分红')) return 'fa-solid fa-coins';
  if (n.includes('社保') || n.includes('公积金')) return 'fa-solid fa-shield-halved';
  if (n.includes('定期') || n.includes('国债')) return 'fa-solid fa-piggy-bank';
  if (n.includes('借') || n.includes('贷') || n.includes('loan') || n.includes('花呗') || n.includes('白条')) return 'fa-solid fa-hand-holding-dollar';
  if (n.includes('其他') || n.includes('other')) {
    const others = ['fa-solid fa-ellipsis', 'fa-solid fa-asterisk', 'fa-solid fa-folder', 'fa-solid fa-tag', 'fa-solid fa-bookmark', 'fa-solid fa-thumbtack'];
    return others[Math.floor(Math.random() * others.length)];
  }
  return ICONS[allSources.length % ICONS.length];
}
