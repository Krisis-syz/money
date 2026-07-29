// ============ 主题配置 ============
const THEMES = {
  purple: {
    name: '淡紫星辰',
    desc: '浅紫色主题，温柔典雅',
    bg: '#F0E9F6',
    card: '#F7F2FB',
    primary: '#946FB2',
    accent: '#6b3fa0',
    流动: '#a78bfa',
    基金: '#60a5fa',
    股票: '#f472b6',
    chart: ['#946FB2', '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#ef4444', '#22c55e']
  },
  cyan: {
    name: '水墨青',
    desc: '青绿色主题，清新自然',
    bg: '#E8F4F0',
    card: '#F0FAF6',
    primary: '#2E9E8F',
    accent: '#1A7A6D',
    流动: '#34D399',
    基金: '#22D3EE',
    股票: '#A78BFA',
    chart: ['#2E9E8F', '#0EA5E9', '#8B5CF6', '#F59E0B', '#EC4899', '#10B981', '#6366F1', '#F43F5E']
  },
  ink: {
    name: '山水墨',
    desc: '暖棕色主题，古朴典雅',
    bg: '#F5F0E8',
    card: '#FAF6EF',
    primary: '#8B7355',
    accent: '#6B5340',
    流动: '#D4A574',
    基金: '#A0826D',
    股票: '#C9956B',
    chart: ['#8B7355', '#A0826D', '#C9956B', '#D4A574', '#B8956A', '#96725F', '#C4A484', '#DFC4A8']
  },
  green: {
    name: '浅草绿',
    desc: '草绿色主题，生机盎然',
    bg: '#E8F5E9',
    card: '#F1F8F2',
    primary: '#4CAF50',
    accent: '#2E7D32',
    流动: '#66BB6A',
    基金: '#42A5F5',
    股票: '#FF7043',
    chart: ['#4CAF50', '#42A5F5', '#FF7043', '#AB47BC', '#FFA726', '#26C6DA', '#EF5350', '#8D6E63']
  },
  pink: {
    name: '樱花粉',
    desc: '粉色主题，浪漫温馨',
    bg: '#FDF2F8',
    card: '#FEF7FB',
    primary: '#EC4899',
    accent: '#BE185D',
    流动: '#F472B6',
    基金: '#A78BFA',
    股票: '#60A5FA',
    chart: ['#EC4899', '#A78BFA', '#60A5FA', '#34D399', '#FBBF24', '#F87171', '#818CF8', '#2DD4BF']
  }
};

// ============ 当前主题 ============
let currentTheme = localStorage.getItem('budgetTheme') || 'purple';

// ============ 应用主题 ============
function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;

  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--card', theme.card);
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--流动', theme.流动);
  root.style.setProperty('--基金', theme.基金);
  root.style.setProperty('--股票', theme.股票);

  // 更新 meta theme-color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = theme.bg;

  localStorage.setItem('budgetTheme', themeKey);
  currentTheme = themeKey;
}

// ============ 获取主题颜色 ============
function getThemeColors() {
  return THEMES[currentTheme] || THEMES.purple;
}

// 页面加载时立即应用主题
applyTheme(currentTheme);
