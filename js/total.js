// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let currentMonth = getCurrentYearMonth();
let trendMode = 'total';
let chartRange = '1y';
let trendChart = null;
let historyShowCount = 3;
let categoryMonth = currentMonth;
let catPieChart = null;
let assetVizMode = 'pie';
let assetSortMode = 'amount';
let assetMonth = currentMonth;
let assetPieChart = null;

const TYPE_COLORS = { '流动': '#a78bfa', '基金': '#60a5fa', '股票': '#f472b6' };

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;

  allSources = await fundApi.getSources();
  allRecords = await fundApi.getAllRecords();

  renderTotalCard();
  renderTrendChart();
  renderHistory();
  renderCategoryPie();
  renderAssetViz();
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

function fmtNum(n) {
  return Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getMonthTotal(ym) {
  let total = 0;
  allSources.forEach(s => {
    const records = allRecords.filter(r => r.sourceId === s.id && r.yearMonth === ym);
    if (records.length > 0) total += records[records.length - 1].amount;
  });
  return total;
}

function getTypeTotals(ym) {
  const totals = { '流动': 0, '基金': 0, '股票': 0 };
  allSources.forEach(s => {
    const records = allRecords.filter(r => r.sourceId === s.id && r.yearMonth === ym);
    const amt = records.length > 0 ? records[records.length - 1].amount : 0;
    const t = s.type || '流动';
    if (totals[t] !== undefined) totals[t] += amt;
    else totals['流动'] += amt;
  });
  return totals;
}

function getSourceAmount(sourceId, ym) {
  const records = allRecords.filter(r => r.sourceId === sourceId && r.yearMonth === ym);
  return records.length > 0 ? records[records.length - 1].amount : 0;
}

function filterByRange(data) {
  if (chartRange === 'all') return data;
  const now = new Date();
  const yearsBack = chartRange === '3y' ? 3 : 1;
  const cutoff = new Date(now.getFullYear() - yearsBack, now.getMonth() + 1, 1);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
  return data.filter(d => d.month >= cutoffStr);
}

// ============ 总资产卡片 ============
function renderTotalCard() {
  const total = getMonthTotal(currentMonth);
  const prev = getMonthTotal(getPrevMonth(currentMonth));
  const diff = total - prev;

  document.getElementById('totalAmount').textContent = '¥' + fmtNum(total);

  const tagsEl = document.getElementById('totalTags');
  if (allSources.length === 0) { tagsEl.innerHTML = ''; return; }

  const typeMap = getTypeTotals(currentMonth);
  tagsEl.innerHTML = Object.entries(typeMap).map(([name, amt]) => {
    const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : '0.0';
    return `<div class="asset-tag"><span style="color:${TYPE_COLORS[name]}">●</span> ${name} <span class="asset-tag-val">${pct}%</span></div>`;
  }).join('');
}

// ============ 趋势图 ============
function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  if (trendChart) trendChart.destroy();

  const allMonths = [...new Set(allRecords.map(r => r.yearMonth))].sort();
  const isTotal = trendMode === 'total';

  let datasets, labels;

  if (isTotal) {
    const data = allMonths.map(m => ({ month: m, value: getMonthTotal(m) }));
    const filtered = filterByRange(data);
    labels = filtered.map(d => d.month);

    const canvas = ctx.getContext('2d');
    const gradient = canvas.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(148,111,178,0.5)');
    gradient.addColorStop(1, 'rgba(148,111,178,0.0)');

    datasets = [{
      data: filtered.map(d => d.value),
      borderColor: '#946FB2',
      backgroundColor: gradient,
      pointBackgroundColor: '#946FB2',
      fill: true, tension: 0.4, pointRadius: 2.5, borderWidth: 2.5
    }];
  } else {
    const types = ['流动', '基金', '股票'];
    const colors = ['#a78bfa', '#60a5fa', '#f472b6'];
    const data = allMonths.map(m => {
      const t = getTypeTotals(m);
      const total = getMonthTotal(m);
      return {
        month: m,
        values: types.map(tp => total > 0 ? (t[tp] / total * 100) : 0)
      };
    });
    const filtered = filterByRange(data);
    labels = filtered.map(d => d.month);

    datasets = types.map((tp, i) => ({
      label: tp,
      data: filtered.map(d => d.values[i]),
      borderColor: colors[i],
      backgroundColor: 'transparent',
      pointBackgroundColor: colors[i],
      fill: false, tension: 0.4, pointRadius: 2, borderWidth: 2
    }));
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: !isTotal, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, padding: 12 } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: '#9ca3af', font: { size: 10 } } },
        y: {
          border: { display: false },
          grid: { color: 'rgba(148,111,178,0.08)', drawTicks: false },
          ticks: {
            color: '#9ca3af', font: { size: 10 },
            callback: v => isTotal ? ('¥' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : v)) : v.toFixed(0) + '%'
          }
        }
      }
    }
  });
}

function setTrendMode(mode) {
  trendMode = mode;
  document.querySelectorAll('#trendTabs .module-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (mode === 'total' ? '总资金' : '分类占比'));
  });
  renderTrendChart();
}

function setRange(range) {
  chartRange = range;
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
  renderTrendChart();
}

// ============ 历史记录 ============
function renderHistory() {
  const container = document.getElementById('historyContent');
  const months = [...new Set(allRecords.map(r => r.yearMonth))].sort().reverse();

  let data = months.map(m => {
    const total = getMonthTotal(m);
    return { month: m, total };
  });

  if (data.length === 0) {
    container.innerHTML = '<div class="empty-hint"><i class="fa-solid fa-inbox"></i>暂无记录</div>';
    return;
  }

  const show = data.slice(0, historyShowCount);
  const hasMore = data.length > historyShowCount;

  container.innerHTML = `
    <table class="history-table">
      <thead><tr><th>时间</th><th>金额</th><th>收支</th><th>环比</th></tr></thead>
      <tbody>${show.map((d, i) => {
        const next = data[i + 1];
        let diff = '-', diffColor = '';
        let mom = '-';
        if (next) {
          const dv = d.total - next.total;
          diff = (dv >= 0 ? '+' : '-') + fmtNum(dv);
          diffColor = dv >= 0 ? '#ef4444' : '#22c55e';
          mom = (next.total > 0 ? ((dv / next.total) * 100).toFixed(1) : '0.0') + '%';
          mom = (dv >= 0 ? '+' : '') + mom;
        }
        return `<tr>
          <td>${d.month}</td>
          <td class="mono">¥${fmtNum(d.total)}</td>
          <td class="mono" style="color:${diffColor}">${diff}</td>
          <td class="mono" style="color:${diffColor}">${mom}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    ${hasMore ? '<button class="more-btn" onclick="showMoreHistory()">更多</button>' : ''}
  `;
}

function showMoreHistory() {
  historyShowCount += 6;
  renderHistory();
}

// ============ 分类占比饼图 ============
function renderCategoryPie() {
  document.getElementById('catMonthText').textContent = categoryMonth;

  const ctx = document.getElementById('catPieChart');
  if (!ctx) return;
  if (catPieChart) catPieChart.destroy();

  const typeTotals = getTypeTotals(categoryMonth);
  const total = getMonthTotal(categoryMonth);
  const labels = Object.keys(typeTotals);
  const values = Object.values(typeTotals);
  const colors = labels.map(t => TYPE_COLORS[t]);

  catPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } }
      }
    }
  });

  // 计算环比变化
  const prevTypeTotals = getTypeTotals(getPrevMonth(categoryMonth));
  const prevTotal = getMonthTotal(getPrevMonth(categoryMonth));

  const changesEl = document.getElementById('catChanges');
  changesEl.innerHTML = labels.map((tp, i) => {
    const curPct = total > 0 ? (values[i] / total * 100) : 0;
    const prevPct = prevTotal > 0 ? (prevTypeTotals[tp] / prevTotal * 100) : 0;
    const diff = curPct - prevPct;
    const arrow = diff > 0.1 ? '↑' : diff < -0.1 ? '↓' : '→';
    const color = diff > 0.1 ? '#ef4444' : diff < -0.1 ? '#22c55e' : '#9ca3af';
    return `<div class="cat-change">
      <div class="cat-change-name">${tp}</div>
      <div class="cat-change-val" style="color:${color}">${arrow} ${Math.abs(diff).toFixed(1)}%</div>
    </div>`;
  }).join('');
}

function changeCatMonth(delta) {
  const [y, m] = categoryMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (newMonth > currentMonth) return;
  categoryMonth = newMonth;
  renderCategoryPie();
}

// ============ 各资产可视化 ============
function renderAssetViz() {
  document.getElementById('assetMonthText').textContent = assetMonth;

  const container = document.getElementById('vizContent');
  if (allSources.length === 0) {
    container.innerHTML = '<div class="empty-hint"><i class="fa-solid fa-chart-pie"></i>暂无资产</div>';
    return;
  }

  if (assetVizMode === 'pie') {
    renderAssetPie(container);
  } else {
    renderAssetBar(container);
  }
}

function renderAssetPie(container) {
  const ctx = document.createElement('canvas');
  container.innerHTML = '';
  container.appendChild(ctx);
  container.style.height = '220px';

  if (assetPieChart) assetPieChart.destroy();

  const items = allSources.map(s => ({
    name: s.name,
    amount: getSourceAmount(s.id, assetMonth)
  })).filter(i => i.amount > 0);

  const COLORS = ['#946FB2', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e'];

  assetPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: items.map(i => i.name),
      datasets: [{
        data: items.map(i => i.amount),
        backgroundColor: items.map((_, i) => COLORS[i % COLORS.length]),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, padding: 8 } }
      }
    }
  });
}

function renderAssetBar(container) {
  const items = allSources.map(s => {
    const amount = getSourceAmount(s.id, assetMonth);
    const prevAmount = getSourceAmount(s.id, getPrevMonth(assetMonth));
    const pnl = amount - prevAmount;
    return { id: s.id, name: s.name, amount, pnl };
  });

  if (assetSortMode === 'amount') items.sort((a, b) => b.amount - a.amount);
  else items.sort((a, b) => b.pnl - a.pnl);

  container.style.height = 'auto';
  container.innerHTML = `
    <div class="sort-btns">
      <button class="sort-btn ${assetSortMode === 'amount' ? 'active' : ''}" onclick="setAssetSort('amount')">按金额</button>
      <button class="sort-btn ${assetSortMode === 'pnl' ? 'active' : ''}" onclick="setAssetSort('pnl')">按收支</button>
    </div>
    <div class="bar-list">
      ${items.map(item => {
        const bgClass = item.pnl > 0 ? 'positive' : item.pnl < 0 ? 'negative' : 'flat';
        const pnlColor = item.pnl > 0 ? '#ef4444' : item.pnl < 0 ? '#22c55e' : '#9ca3af';
        return `<div class="bar-row">
          <div class="bar-bg ${bgClass}"></div>
          <div class="bar-name">${item.name}</div>
          <div class="bar-amount">¥${fmtNum(item.amount)}</div>
          <div class="bar-pnl" style="color:${pnlColor}">${item.pnl >= 0 ? '+' : '-'}${fmtNum(item.pnl)}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

function setVizMode(mode) {
  assetVizMode = mode;
  document.querySelectorAll('#vizTabs .module-tab').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === (mode === 'pie' ? '饼图' : '柱形图'));
  });
  renderAssetViz();
}

function setAssetSort(mode) {
  assetSortMode = mode;
  renderAssetViz();
}

function changeAssetMonth(delta) {
  const [y, m] = assetMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (newMonth > currentMonth) return;
  assetMonth = newMonth;
  renderAssetViz();
}
