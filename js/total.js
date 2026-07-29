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
let assetVizMode = 'bar';
let assetSortMode = 'pnl';
let assetMonth = currentMonth;
let assetPieChart = null;
let monthInputTarget = null;

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
      plugins: {
        legend: {
          display: !isTotal, position: 'bottom',
          labels: {
            boxWidth: 10, font: { size: 10 }, padding: 8, color: '#9ca3af',
            generateLabels: (chart) => {
              return chart.data.datasets.map((ds, i) => ({
                text: ds.label,
                fillStyle: ds.borderColor,
                strokeStyle: ds.borderColor,
                fontColor: '#9ca3af',
                hidden: false,
                index: i
              }));
            }
          }
        }
      },
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
  const labels = { '1y': '近一年', '3y': '近三年', 'all': '全部' };
  document.getElementById('rangeBtn').innerHTML = labels[range] + ' <i class="fa-solid fa-chevron-down"></i>';
  hideRangeDropdown();
  renderTrendChart();
}

function toggleRangeDropdown() {
  document.getElementById('rangeDropdown').classList.toggle('show');
}

function hideRangeDropdown() {
  document.getElementById('rangeDropdown').classList.remove('show');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown-wrap')) hideRangeDropdown();
});

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


  // 自定义插件：画引线 + 标注文字 + 横线分隔
  const catLabelPlugin = {
    id: 'catLabelPlugin',
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const { ctx } = chart;
      const chartArea = chart.chartArea;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;

      meta.data.forEach((arc, i) => {
        const angle = (arc.startAngle + arc.endAngle) / 2;
        const outerR = arc.outerRadius;
        const val = values[i];
        const pct = total > 0 ? (val / total * 100).toFixed(0) : 0;
        const label = labels[i];

        // 引线起点：饼图边缘
        const sx = centerX + Math.cos(angle) * outerR;
        const sy = centerY + Math.sin(angle) * outerR;
        // 引线终点：向外延伸
        const lineLen = 22;
        const ex = centerX + Math.cos(angle) * (outerR + lineLen);
        const ey = centerY + Math.sin(angle) * (outerR + lineLen);

        ctx.save();

        // 画斜线（饼图边缘 → 终点）
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 根据角度决定左右
        const isRight = Math.cos(angle) >= 0;
        const gap = 6; // 斜线终点到文字的间距


        // 横线：从斜线终点开始，向文字方向延伸
        const horizStartX = ex;
        const horizEndX = isRight ? ex + gap : ex - gap;
        ctx.beginPath();
        ctx.moveTo(horizStartX, ey);
        ctx.lineTo(horizEndX, ey);
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 文字X：横线末端再偏移
        const textX = isRight ? horizEndX + 3 : horizEndX - 3;
        const line1 = '¥' + fmtNum(val);
        const line2 = label + '  ' + pct + '%';

        ctx.textBaseline = 'middle';
        ctx.textAlign = isRight ? 'left' : 'right';

        // 测量文字宽度，横线与文字等长
        ctx.font = '500 11px "JetBrains Mono", monospace';
        const w1 = ctx.measureText(line1).width;
        ctx.font = '500 10px Outfit, sans-serif';
        const w2 = ctx.measureText(line2).width;
        const lineW = Math.max(w1, w2) + 8;

        // 第一行（金额）
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(line1, textX, ey - 8);

        // 横线分隔（与文字等长）
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + (isRight ? lineW : -lineW), ey);
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 第二行（类型 + 百分比）
        ctx.font = '500 10px Outfit, sans-serif';
        ctx.fillStyle = '#999';
        ctx.fillText(line2, textX, ey + 9);

        ctx.restore();
      });
    }
  };

  catPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }]
    },
    plugins: [catLabelPlugin],
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '60%',
      layout: { padding: { top: 20, bottom: 10, left: 40, right: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx) => ctx.label + '：¥' + fmtNum(ctx.raw)
          }
        }
      }
    }
  });

  // 计算环比变化
  const prevTypeTotals = getTypeTotals(getPrevMonth(categoryMonth));
  const prevTotal = getMonthTotal(getPrevMonth(categoryMonth));

  const changesEl = document.getElementById('catChanges');
  changesEl.innerHTML = labels.map((tp, i) => {
    const cur = values[i];
    const prev = prevTypeTotals[tp] || 0;
    const diff = cur - prev;
    const pctChange = prev > 0 ? (diff / prev * 100).toFixed(1) : '0.0';
    const arrow = diff > 0.1 ? '↑' : diff < -0.1 ? '↓' : '→';
    const color = diff > 0.1 ? '#ef4444' : diff < -0.1 ? '#22c55e' : '#9ca3af';
    const typeColor = TYPE_COLORS[tp];
    const sign = diff >= 0 ? '+' : '-';
    return `<div class="cat-change">
      <div class="cat-change-name"><span class="cat-dot" style="background:${typeColor}"></span>${tp}</div>
      <div class="cat-change-val" style="color:${color}">${sign}${fmtNum(diff)}</div>
      <div class="cat-change-pct" style="color:${color}">${arrow}${pctChange}%</div>
    </div>`;
  }).join('');
}

function changeCatMonth(delta) {
  const [y, m] = categoryMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (newMonth > currentMonth) {
    alert('不能选择未来的时间');
    return;
  }
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
  const COLORS = ['#946FB2', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e'];

  const items = allSources.map((s, i) => ({
    name: s.name,
    icon: s.icon || 'fa-solid fa-wallet',
    amount: getSourceAmount(s.id, assetMonth),
    color: COLORS[i % COLORS.length]
  })).filter(i => i.amount > 0).sort((a, b) => b.amount - a.amount);

  const total = items.reduce((s, i) => s + i.amount, 0);

  // 布局：左饼图 + 右图例
  container.style.height = 'auto';
  container.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;justify-content:center;padding:0 4px;">
      <div style="flex:0 0 180px;height:180px;"><canvas id="assetPieCanvas"></canvas></div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${items.map(item => {
          const pct = total > 0 ? (item.amount / total * 100).toFixed(1) : '0.0';
          return `<div style="display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:2px;background:${item.color};flex-shrink:0;"></span>
            <span style="font-size:0.75rem;color:#666;">${item.name}</span>
            <span style="font-size:0.7rem;color:#b0a4c4;">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;

  const pieCtx = document.getElementById('assetPieCanvas');
  if (assetPieChart) assetPieChart.destroy();

  assetPieChart = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: items.map(i => i.name),
      datasets: [{
        data: items.map(i => i.amount),
        backgroundColor: items.map(i => i.color),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx) => {
              const item = items[ctx.dataIndex];
              return item.name + '：¥' + fmtNum(ctx.raw);
            }
          }
        }
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

  if (assetSortMode === 'amount') {
    items.sort((a, b) => b.amount - a.amount);
  } else {
    // 按收支排序：正数在前（大到小），负数在后（亏得少的在上）
    items.sort((a, b) => {
      if (a.pnl >= 0 && b.pnl < 0) return -1;
      if (a.pnl < 0 && b.pnl >= 0) return 1;
      return b.pnl - a.pnl;
    });
  }

  // 计算柱形宽度
  let barWidths = [];
  if (assetSortMode === 'amount') {
    const maxAmount = items.length > 0 ? items[0].amount : 1;
    barWidths = items.map(i => maxAmount > 0 ? (i.amount / maxAmount * 100) : 0);
  } else {
    // 按收支：正数组和负数组分别计算，正数组最大100%，负数组亏损最多100%
    const positives = items.filter(i => i.pnl >= 0);
    const negatives = items.filter(i => i.pnl < 0);
    const maxPos = positives.length > 0 ? positives[0].pnl : 0;
    const maxNeg = negatives.length > 0 ? Math.abs(negatives[negatives.length - 1].pnl) : 0;

    barWidths = items.map(i => {
      if (i.pnl >= 0) return maxPos > 0 ? (i.pnl / maxPos * 100) : 0;
      else return maxNeg > 0 ? (Math.abs(i.pnl) / maxNeg * 100) : 0;
    });
  }

  container.style.height = 'auto';
  container.innerHTML = `
    <div class="sort-btns">
      <button class="sort-btn ${assetSortMode === 'pnl' ? 'active' : ''}" onclick="setAssetSort('pnl')">按收支</button>
      <button class="sort-btn ${assetSortMode === 'amount' ? 'active' : ''}" onclick="setAssetSort('amount')">按金额</button>
    </div>
    <div class="bar-list">
      ${items.map((item, idx) => {
        let bgClass, barColor;
        if (assetSortMode === 'amount') {
          bgClass = 'flat';
          barColor = '#d8c6e8';
        } else {
          if (item.pnl > 0) { bgClass = 'positive'; barColor = 'rgba(239,68,68,0.12)'; }
          else if (item.pnl < 0) { bgClass = 'negative'; barColor = 'rgba(34,197,94,0.12)'; }
          else { bgClass = 'flat'; barColor = 'rgba(156,163,175,0.08)'; }
        }
        const pnlColor = item.pnl > 0 ? '#ef4444' : item.pnl < 0 ? '#22c55e' : '#9ca3af';
        return `<div class="bar-row">
          <div class="bar-bg ${bgClass}" style="width:${barWidths[idx]}%"></div>
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
    btn.classList.toggle('active', btn.textContent === (mode === 'pie' ? '占比' : '排行榜'));
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
  if (newMonth > currentMonth) {
    alert('不能选择未来的时间');
    return;
  }
  assetMonth = newMonth;
  renderAssetViz();
}

// ============ 月份选择弹窗 ============
function showMonthInput(target) {
  monthInputTarget = target;
  const current = target === 'cat' ? categoryMonth : assetMonth;
  const [y, m] = current.split('-').map(Number);

  const curYear = new Date().getFullYear();
  const years = [];
  for (let yr = curYear; yr >= curYear - 10; yr--) years.push(yr);
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];

  renderWheel('yearWheel', years, y, 'year');
  renderWheel('monthWheel', months, m, 'month');
  document.getElementById('monthInputOverlay').classList.add('show');
}

function renderWheel(containerId, items, selected, type) {
  const container = document.getElementById(containerId);
  // 前后各加一个占位项，确保首尾都能居中
  const pad = '<div class="picker-pad"></div>';
  container.innerHTML = pad + items.map(item => {
    const val = type === 'month' ? String(item).padStart(2, '0') : item;
    const isActive = item === selected;
    return `<div class="picker-item ${isActive ? 'active' : ''}" data-value="${item}">${type === 'month' ? val + '月' : val + '年'}</div>`;
  }).join('') + pad;

  // 滚动到选中项
  const activeEl = container.querySelector('.picker-item.active');
  if (activeEl) {
    setTimeout(() => {
      container.scrollTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
    }, 50);
  }

  // 监听滚动（替换innerHTML不会清除容器上的事件监听器，用标记防重复）
  if (!container._hasScrollListener) {
    container._hasScrollListener = true;
    container.addEventListener('scroll', () => {
      const allItems = container.querySelectorAll('.picker-item[data-value]');
      const center = container.scrollTop + container.clientHeight / 2;
      let closest = allItems[0];
      let minDist = Infinity;
      allItems.forEach(item => {
        const dist = Math.abs(item.offsetTop + item.clientHeight / 2 - center);
        if (dist < minDist) { minDist = dist; closest = item; }
      });
      allItems.forEach(item => item.classList.remove('active'));
      if (closest) closest.classList.add('active');
    });
  }
}

function hideMonthInput() {
  document.getElementById('monthInputOverlay').classList.remove('show');
  monthInputTarget = null;
}

function confirmMonthInput() {
  const yearEl = document.querySelector('#yearWheel .active');
  const monthEl = document.querySelector('#monthWheel .active');
  if (!yearEl || !monthEl) return;

  const y = parseInt(yearEl.dataset.value);
  const m = parseInt(monthEl.dataset.value);
  const newMonth = `${y}-${String(m).padStart(2, '0')}`;

  if (newMonth > currentMonth) {
    alert('不能选择未来的时间');
    return;
  }

  if (monthInputTarget === 'cat') {
    categoryMonth = newMonth;
    renderCategoryPie();
  } else {
    assetMonth = newMonth;
    renderAssetViz();
  }

  hideMonthInput();
}

document.getElementById('monthInputOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideMonthInput();
});
