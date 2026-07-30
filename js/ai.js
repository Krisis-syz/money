// ============ 全局状态 ============
let allSources = [];
let allRecords = [];
let currentReport = null;
let reportMonth = '';
let questions = [];

// ============ 工具函数 ============
function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPrevMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function fmtNum(n) {
  return Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m)}月`;
}

function getAmountForMonth(sourceId, ym) {
  const records = allRecords.filter(r => r.sourceId === sourceId && r.yearMonth === ym);
  return records.length > 0 ? records[records.length - 1].amount : 0;
}

function getMonthTotal(ym) {
  let total = 0;
  allSources.forEach(s => { total += getAmountForMonth(s.id, ym); });
  return total;
}

function getCategoryTotal(type, ym) {
  let total = 0;
  allSources.filter(s => (s.type || '流动') === type).forEach(s => {
    total += getAmountForMonth(s.id, ym);
  });
  return total;
}

function simpleMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '• $1')
    .replace(/\n/g, '<br>')
    .replace(/(<\/h3>)<br>/g, '$1')
    .replace(/(<\/strong>)<br>/g, '$1')
    .replace(/<br>(<div class="chart-placeholder)/g, '$1');
}

// 解析图表标记，返回HTML和图表配置
function parseChartMarkers(text) {
  if (!text) return { html: '', charts: [] };

  const charts = [];
  let chartIndex = 0;

  // 匹配图表标记：[chart:trend]、[chart:pie]、[chart:bar]、[chart:trend:资产ID]
  const html = text.replace(/\[chart:(\w+)(?::([^\]]+))?\]/g, (match, type, param) => {
    const id = `chart-${chartIndex++}`;
    charts.push({ id, type, param });
    return `<div class="chart-placeholder" data-chart-id="${id}"></div>`;
  });

  return { html, charts };
}

// 渲染所有图表（带兜底机制）
function renderCharts(charts) {
  if (!charts || charts.length === 0) return;

  // 尝试加载 Chart.js（如果未加载）
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js 未加载，跳过图表渲染');
    return;
  }

  // 生成月份范围标题
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const titleRange = `${startMonth.getFullYear()}年${startMonth.getMonth() + 1}月 - ${now.getFullYear()}年${now.getMonth() + 1}月`;

  charts.forEach(chart => {
    try {
      const container = document.querySelector(`[data-chart-id="${chart.id}"]`);
      if (!container) return;

      // 根据类型生成标题
      let title = '';
      if (chart.type === 'trend') {
        if (chart.param) {
          // 单资产趋势图，查找资产名称
          const source = allSources.find(s => s.id === chart.param);
          const sourceName = source ? source.name : '未知资产';
          title = `${titleRange}${sourceName}资产趋势图`;
        } else {
          title = `${titleRange}总资产趋势图`;
        }
      } else if (chart.type === 'pie') {
        title = `${now.getFullYear()}年${now.getMonth() + 1}月资产分布`;
      } else if (chart.type === 'bar') {
        title = `${now.getFullYear()}年${now.getMonth() + 1}月资产明细`;
      }

      // 添加标题
      if (title) {
        const titleEl = document.createElement('div');
        titleEl.style.cssText = `text-align:center;font-size:0.78rem;color:${getThemeColors().accent};font-weight:500;margin-bottom:8px;`;
        titleEl.textContent = title;
        container.appendChild(titleEl);
      }

      // 创建 canvas
      const canvas = document.createElement('canvas');
      canvas.id = chart.id;
      canvas.style.width = '100%';
      canvas.style.maxHeight = '220px';
      container.appendChild(canvas);

      // 根据类型渲染图表
      switch (chart.type) {
        case 'trend':
          renderTrendChart(canvas, chart.param);
          break;
        case 'pie':
          renderPieChart(canvas);
          break;
        case 'bar':
          renderBarChart(canvas);
          break;
        default:
          console.warn(`未知图表类型: ${chart.type}`);
          container.innerHTML = `<div style="text-align:center;color:#999;padding:20px;font-size:0.8rem;">图表类型 "${chart.type}" 暂不支持</div>`;
      }
    } catch (e) {
      console.error('图表渲染失败:', e);
      // 兜底：显示错误提示，不阻碍后续内容
      const container = document.querySelector(`[data-chart-id="${chart.id}"]`);
      if (container) {
        container.innerHTML = '';
      }
    }
  });
}

// 渲染趋势图（近12月总资产）
function renderTrendChart(canvas, assetId) {
  const labels = [];
  const data = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push(`${d.getMonth() + 1}月`);

    if (assetId) {
      data.push(getAmountForMonth(assetId, ym));
    } else {
      data.push(getMonthTotal(ym));
    }
  }

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: assetId ? '资产趋势' : '总资产趋势',
        data,
        borderColor: getThemeColors().primary,
        backgroundColor: `rgba(${hexToRgb(getThemeColors().primary)},0.1)`,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: getThemeColors().primary
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label,
            label: (ctx) => '¥' + fmtNum(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 10 } }
        },
        y: {
          beginAtZero: false,
          border: { display: false },
          grid: { color: 'rgba(148,111,178,0.06)' },
          ticks: { callback: v => '¥' + fmtNum(v), color: '#9ca3af', font: { size: 10 } }
        }
      }
    }
  });
}

// 渲染饼图（资产分布）
function renderPieChart(canvas) {
  const typeMap = { '流动': 0, '基金': 0, '股票': 0 };
  const themeColors = getThemeColors();
  const typeColors = { '流动': themeColors.流动, '基金': themeColors.基金, '股票': themeColors.股票 };

  allSources.forEach(s => {
    const amt = getAmountForMonth(s.id, reportMonth);
    const t = s.type || '流动';
    if (typeMap[t] !== undefined) typeMap[t] += amt;
    else typeMap['流动'] += amt;
  });

  const labels = Object.keys(typeMap);
  const data = Object.values(typeMap);
  const colors = labels.map(l => typeColors[l]);

  // 中间标签插件
  const centerLabelPlugin = {
    id: 'centerLabel',
    afterDraw(chart) {
      const { ctx, width, height } = chart;
      const total = data.reduce((a, b) => a + b, 0);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px Outfit';
      ctx.fillStyle = '#2d2d3a';
      ctx.fillText('¥' + fmtNum(total), width / 2, height / 2 - 8);
      ctx.font = '11px Outfit';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText('总资产', width / 2, height / 2 + 12);
      ctx.restore();
    }
  };

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    plugins: [centerLabelPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      layout: { padding: { top: 10, bottom: 5 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            font: { size: 11 },
            color: '#2d2d3a',
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx) => {
              const total = data.reduce((a, b) => a + b, 0);
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : '0.0';
              return ctx.label + '：¥' + fmtNum(ctx.raw) + '（' + pct + '%）';
            }
          }
        }
      }
    }
  });
}

// 渲染柱状图（各资产对比，按金额由高到低排序）
function renderBarChart(canvas) {
  const COLORS = getThemeColors().chart;

  const items = allSources
    .map((s, i) => ({
      name: s.name,
      amount: getAmountForMonth(s.id, reportMonth),
      color: COLORS[i % COLORS.length]
    }))
    .filter(i => i.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (items.length === 0) return;

  const labels = items.map(i => i.name);
  const data = items.map(i => i.amount);
  const colors = items.map(i => i.color);

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '资产金额',
        data,
        backgroundColor: colors.map(c => c + 'B3'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: () => '',
            label: (ctx) => ctx.label + '：¥' + fmtNum(ctx.raw)
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(148,111,178,0.06)' },
          ticks: { callback: v => '¥' + fmtNum(v), color: '#9ca3af', font: { size: 10 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#2d2d3a', font: { size: 11 } }
        }
      }
    }
  });
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  await waitForSupabase();
  if (!(await requireAuth())) return;

  const current = getCurrentYearMonth();
  reportMonth = current;

  allSources = await fundApi.getSources();
  allRecords = await fundApi.getAllRecords();

  try {
    currentReport = await fundApi.getReport(reportMonth);
  } catch (e) {
    currentReport = null;
  }

  questions = calcQuestions();
  renderPage();
});

// ============ 动态问题计算 ============
function calcQuestions() {
  const qs = [];
  const curTotal = getMonthTotal(reportMonth);
  const prevTotal = getMonthTotal(getPrevMonth(reportMonth));

  // 1. 总资产变化 > 20%
  if (prevTotal > 0) {
    const totalChange = ((curTotal - prevTotal) / prevTotal) * 100;
    if (Math.abs(totalChange) > 20) {
      const dir = totalChange > 0 ? '增长' : '下降';
      qs.push({
        id: 'total',
        icon: 'fa-solid fa-chart-line',
        iconBg: 'rgba(148,111,178,0.12)',
        iconColor: getThemeColors().primary,
        label: `总资产较上月${dir} ${Math.abs(totalChange).toFixed(1)}%`,
        placeholder: `请填写总资产${dir}的原因...`
      });
    }
  }

  // 2. 三大类变化 > 20%
  const types = ['流动', '基金', '股票'];
  const themeColors = getThemeColors();
  const typeIcons = {
    '流动': { icon: 'fa-solid fa-money-bill-wave', bg: 'rgba(167,139,250,0.12)', color: themeColors.流动 },
    '基金': { icon: 'fa-solid fa-chart-pie', bg: 'rgba(96,165,250,0.12)', color: themeColors.基金 },
    '股票': { icon: 'fa-solid fa-arrow-trend-up', bg: 'rgba(244,114,182,0.12)', color: themeColors.股票 }
  };

  types.forEach(type => {
    const cur = getCategoryTotal(type, reportMonth);
    const prev = getCategoryTotal(type, getPrevMonth(reportMonth));
    if (prev > 0) {
      const change = ((cur - prev) / prev) * 100;
      if (Math.abs(change) > 20) {
        const dir = change > 0 ? '增长' : '下降';
        const info = typeIcons[type];
        qs.push({
          id: `cat_${type}`,
          icon: info.icon,
          iconBg: info.bg,
          iconColor: info.color,
          label: `${type}类资产较上月${dir} ${Math.abs(change).toFixed(1)}%`,
          placeholder: `请填写${type}类资产${dir}的原因...`
        });
      }
    }
  });

  // 3. 单资产变化 > 25%
  allSources.forEach(s => {
    const cur = getAmountForMonth(s.id, reportMonth);
    const prev = getAmountForMonth(s.id, getPrevMonth(reportMonth));
    if (prev > 0) {
      const change = ((cur - prev) / prev) * 100;
      if (Math.abs(change) > 25) {
        const dir = change > 0 ? '增长' : '下降';
        qs.push({
          id: `src_${s.id}`,
          icon: s.icon || 'fa-solid fa-wallet',
          iconBg: 'rgba(148,111,178,0.12)',
          iconColor: getThemeColors().primary,
          label: `${s.name}资产较上月${dir} ${Math.abs(change).toFixed(1)}%`,
          placeholder: `请填写${s.name}资产${dir}的原因...`
        });
      }
    }
  });

  // 4. 固定问题
  qs.push({
    id: 'extra',
    icon: 'fa-solid fa-lightbulb',
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: '#f59e0b',
    label: '请填写需要补充的内容',
    placeholder: '例如：下月计划、特殊支出、投资策略调整等...'
  });

  return qs;
}

// ============ 页面渲染 ============
function renderPage() {
  const hasReport = currentReport && currentReport.status === 'completed' && currentReport.report_text;

  // 状态条
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  const label = document.getElementById('statusLabel');

  text.textContent = `${fmtMonth(reportMonth)}资产报告`;
  if (hasReport) {
    dot.className = 'status-dot completed';
    label.textContent = '已生成';
    label.style.color = '#22c55e';
  } else {
    dot.className = 'status-dot pending';
    label.textContent = '未生成';
    label.style.color = '#f59e0b';
  }

  // 主内容
  const main = document.getElementById('mainContent');
  if (hasReport) {
    renderReport(main);
  } else {
    renderForm(main);
  }
}

// ============ 表单渲染 ============
function renderForm(container) {
  container.innerHTML = `
    <div class="form-card">
      ${questions.map((q, i) => `
        <div class="question-item">
          <div class="question-label">
            <div class="question-icon" style="background:${q.iconBg};color:${q.iconColor};">
              <i class="${q.icon}"></i>
            </div>
            ${q.label}
          </div>
          <textarea class="question-textarea" data-qid="${q.id}" placeholder="${q.placeholder}" rows="2"></textarea>
        </div>
      `).join('')}
      <button class="generate-btn" onclick="generateReport()">
        <i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp; 一键生成报告
      </button>
    </div>
  `;
}

// ============ 报告渲染 ============
function renderReport(container) {
  // 解析图表标记
  const { html: chartHtml, charts } = parseChartMarkers(currentReport.report_text);
  const reportHtml = simpleMarkdown(chartHtml);

  container.innerHTML = `
    <div class="report-card">
      <div class="report-content">${reportHtml}</div>
      <div class="report-btns">
        <button class="report-btn report-btn-edit" onclick="showEditModal()">
          <i class="fa-solid fa-pen"></i>&nbsp; 重新编辑生成
        </button>
        <button class="report-btn report-btn-history" onclick="showHistoryModal()">
          <i class="fa-solid fa-clock-rotate-left"></i>&nbsp; 查看历史报告
        </button>
      </div>
    </div>
  `;

  // 渲染图表（带兜底机制）
  renderCharts(charts);
}

// ============ 生成报告 ============
async function generateReport() {
  const btn = document.querySelector('.generate-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div>&nbsp;&nbsp;AI 生成中，请稍候...';

  const userInput = {};
  document.querySelectorAll('.question-textarea').forEach(ta => {
    userInput[ta.dataset.qid] = ta.value.trim();
  });

  try {
    // 构建 prompt 并调用 AI
    const prompt = buildAIPrompt(userInput);
    const result = await fundApi.generateReport(prompt);
    const reportText = result.reportText;

    // 保存报告
    await fundApi.saveReport(reportMonth, questions, userInput, reportText, 'completed');

    currentReport = {
      year_month: reportMonth,
      questions,
      user_input: userInput,
      report_text: reportText,
      status: 'completed'
    };
    renderPage();
    showToast('报告生成成功');
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp; 一键生成报告';
    showToast('生成失败: ' + e.message, true);
  }
}

// ============ 构建 AI Prompt ============
function buildAIPrompt(userInput) {
  const curTotal = getMonthTotal(reportMonth);
  const prevTotal = getMonthTotal(getPrevMonth(reportMonth));
  const diff = curTotal - prevTotal;
  const diffPct = prevTotal > 0 ? ((diff / prevTotal) * 100).toFixed(1) : '0.0';

  // 近12个月总资产
  const monthlyTotals = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyTotals.push(`${ym}: ¥${fmtNum(getMonthTotal(ym))}`);
  }

  // 分类数据
  const types = ['流动', '基金', '股票'];
  const categories = types.map(type => {
    const cur = getCategoryTotal(type, reportMonth);
    const prev = getCategoryTotal(type, getPrevMonth(reportMonth));
    const pct = curTotal > 0 ? ((cur / curTotal) * 100).toFixed(1) : '0.0';
    const d = cur - prev;
    const changePct = prev > 0 ? ((d / prev) * 100).toFixed(1) : '0.0';
    const arrow = d >= 0 ? '↑' : '↓';
    return `${type}：¥${fmtNum(cur)}（占比${pct}%），上月¥${fmtNum(prev)}，${arrow}${Math.abs(changePct)}%`;
  }).join('\n');

  // 资产明细
  const assets = allSources.map(s => {
    const cur = getAmountForMonth(s.id, reportMonth);
    const prev = getAmountForMonth(s.id, getPrevMonth(reportMonth));
    const d = cur - prev;
    const changePct = prev > 0 ? ((d / prev) * 100).toFixed(1) : '0.0';
    const arrow = d >= 0 ? '↑' : '↓';
    return `${s.name}（${s.type}）（ID:${s.id}）：¥${fmtNum(cur)}，上月¥${fmtNum(prev)}，${arrow}${Math.abs(changePct)}%`;
  }).join('\n');

  // 用户补充说明
  const userInputText = questions.map(q => {
    const ans = userInput[q.id];
    if (ans) return `【${q.label}】${ans}`;
    return null;
  }).filter(Boolean).join('\n') || '无';

  const prompt = `# 角色
你是专业的个人资产分析师，输出风格极简、精准、落地、生活化，不堆砌金融术语，专为个人月度资产复盘生成报告。

# 输入变量
- 统计月份：${reportMonth}
- 本月总资产：¥${fmtNum(curTotal)}
- 上月总资产：¥${fmtNum(prevTotal)}
- 近12个月总资产：
${monthlyTotals.map(t => '  ' + t).join('\n')}
- 环比变动：${diffPct}%
- 资产分类数据（类别+金额+占比，含上月数据及对比）：
${categories}
- 细分资产明细（含上月对比、涨跌）：
${assets}
- 用户月度补充说明：
${userInputText}

# 强制输出规范
1. 全文使用标准 Markdown，所有章节使用 ## 二级标题。
2. 必须插入三个图表标签，**单独一行、前后空行**，顺序固定：
   - [chart:trend] 放在资产总览的总趋势图 // 近12月总资产趋势图
   - [chart:pie] 放在资产结构分析 // 资产分布占比（流动等三类的饼状图）
   - [chart:bar] 可以放在资产明细分析 // 各资产横向柱状图（对应总资产详情-资产明细里的柱状图）
   - [chart:trend:资产ID] 某资产趋势图，可在分析具体资产时使用。例如：[chart:trend:40e632a3-1ade-47c7-ae74-2ad8acf3caa6]
3. 数据上涨使用红色字体，下跌使用绿色字体。
4. 必须结合用户填写的补充说明解释资产波动原因，不能脱离用户实际情况。
5. 全文字数不超过 1500 字。
6. 结构固定、顺序不可乱、不可删减章节。行文有条理，可以使用icon和emoji，如💰🏦📊📈📉💳📒💸📌💡。

# 固定报告结构（严格按此输出）
## 一、月度资产总览
一段话概括本月总资产、环比涨跌、整体财务状态（增值/缩水/平稳）。

[chart:trend]

## 二、资产结构分析
根据三个分类占比数据，分析本月资产配置风格：保守 / 均衡 / 偏激进。
指出占比最高、最低的资产类别，说明当前资产结构的优势与隐患。

[chart:pie]

## 三、资产明细变动分析
展示本月各资产具体情况
[chart:bar]
逐一解读本月重点变动资产，找出拉动总资产上涨或下跌的核心项目。
对比上月数据，分析波动原因与资金流向。
注意这部分资产有很多，重点分析变动大的即可。
可选：[chart:trend:资产ID]

## 四、本月个人情况复盘
结合用户填写的月度备注，融合数据与实际生活场景，解释本月资产变化的真实原因，包括收入、消费、转入转出、市场波动、操作行为等。

## 五、月度总结与下月建议
1. 总结本月整体财务表现。
2. 给出 1-2 条可落地、极简、适合个人理财的下月优化建议：资产平衡、风险控制、现金流管理、投资节奏、储蓄规划。`;

  return prompt;
}

// ============ 历史报告弹窗 ============
async function showHistoryModal() {
  document.getElementById('historyModal').classList.add('show');
  const list = document.getElementById('historyList');

  try {
    const reports = await fundApi.getReports();
    if (reports.length === 0) {
      list.innerHTML = '<div class="empty-hint"><i class="fa-solid fa-inbox"></i>暂无历史报告</div>';
      return;
    }

    list.innerHTML = `<ul class="timeline">${reports.map(r => `
      <li class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="timeline-month">${fmtMonth(r.year_month)}</div>
        <div class="timeline-date">生成于 ${new Date(r.created_at).toLocaleDateString('zh-CN')}</div>
        <button class="timeline-btn" onclick="viewReport('${r.year_month}')">点击查看</button>
      </li>
    `).join('')}</ul>`;
  } catch (e) {
    list.innerHTML = '<div class="empty-hint"><i class="fa-solid fa-triangle-exclamation"></i>加载失败</div>';
  }
}

function hideHistoryModal() {
  document.getElementById('historyModal').classList.remove('show');
}

document.getElementById('historyModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideHistoryModal();
});

async function viewReport(yearMonth) {
  hideHistoryModal();
  try {
    const reports = await fundApi.getReports();
    const report = reports.find(r => r.year_month === yearMonth);
    if (!report) return;

    // 解析图表标记
    const { html: chartHtml, charts } = parseChartMarkers(report.report_text);
    const reportHtml = simpleMarkdown(chartHtml);

    document.getElementById('viewReportTitle').textContent = `${fmtMonth(yearMonth)}资产报告`;
    document.getElementById('viewReportContent').innerHTML = reportHtml;
    document.getElementById('viewReportModal').classList.add('show');

    // 渲染图表（带兜底机制）
    renderCharts(charts);
  } catch (e) {
    showToast('加载失败', true);
  }
}

function hideViewReportModal() {
  document.getElementById('viewReportModal').classList.remove('show');
}

document.getElementById('viewReportModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideViewReportModal();
});

// ============ 重新编辑弹窗 ============
function showEditModal() {
  document.getElementById('editModal').classList.add('show');
  const form = document.getElementById('editForm');
  const savedInput = currentReport.user_input || {};

  form.innerHTML = questions.map(q => `
    <div class="edit-label">${q.label}</div>
    <textarea class="edit-textarea" data-qid="${q.id}" rows="2">${savedInput[q.id] || ''}</textarea>
  `).join('');
}

function hideEditModal() {
  document.getElementById('editModal').classList.remove('show');
}

document.getElementById('editModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideEditModal();
});

async function regenerateFromEdit() {
  hideEditModal();

  const userInput = {};
  document.querySelectorAll('#editForm .edit-textarea').forEach(ta => {
    userInput[ta.dataset.qid] = ta.value.trim();
  });

  // 显示加载状态
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="form-card" style="text-align:center;padding:40px 20px;">
      <div class="spinner" style="margin:0 auto 16px;"></div>
      <div style="color:${getThemeColors().primary};font-size:0.9rem;font-weight:500;">AI 重新生成中，请稍候...</div>
    </div>
  `;

  try {
    // 构建 prompt 并调用 AI
    const prompt = buildAIPrompt(userInput);
    const result = await fundApi.generateReport(prompt);
    const reportText = result.reportText;

    await fundApi.saveReport(reportMonth, questions, userInput, reportText, 'completed');

    currentReport.report_text = reportText;
    currentReport.user_input = userInput;
    renderPage();
    showToast('报告已重新生成');
  } catch (e) {
    showToast('生成失败: ' + e.message, true);
    renderPage();
  }
}

// ============ Toast ============
function showToast(msg, isError) {
  const toast = document.createElement('div');
  toast.className = 'save-toast';
  if (isError) toast.style.background = 'rgba(239,68,68,0.95)';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}
