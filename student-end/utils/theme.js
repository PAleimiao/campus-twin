// utils/theme.js —— 主题（配色）管理
// 预置几套配色 + 支持「自定义色相」；用户选择存本地（storage key = 'theme'），下次打开自动生效。
// 页面用法：在根 <view> 上写 style="--accent:{{theme.accent}}; --accent-soft:{{theme.soft}};"
//          即可让整页的 var(--accent) 跟随主题变色。
const KEY = 'theme';

// 预置主题。soft = 同色 12% 透明度的浅底，用于标签药丸 / 选中态背景
const THEMES = [
  { key: 'sakura', name: '樱花粉', accent: '#ff7eb6', soft: 'rgba(255,126,182,0.12)' },
  { key: 'violet', name: '淡紫',   accent: '#7c6cff', soft: 'rgba(124,108,255,0.12)' },
  { key: 'ocean',  name: '湖蓝',   accent: '#3aa0ff', soft: 'rgba(58,160,255,0.12)' },
  { key: 'mint',   name: '薄荷',   accent: '#2bbf7a', soft: 'rgba(43,191,122,0.12)' },
  { key: 'sunset', name: '蜜橘',   accent: '#ff8a3d', soft: 'rgba(255,138,61,0.12)' },
  { key: 'grape',  name: '葡萄',   accent: '#9b6cff', soft: 'rgba(155,108,255,0.12)' }
];
const DEFAULT_KEY = 'sakura'; // 默认主题：樱花粉

function presetOf(key) {
  return THEMES.find(t => t.key === key) || THEMES[0];
}

// 取当前主题（没存过 → 默认樱花粉）
function getTheme() {
  const saved = wx.getStorageSync(KEY);
  if (saved && saved.accent) return saved;
  const d = presetOf(DEFAULT_KEY);
  return { key: d.key, name: d.name, accent: d.accent, soft: d.soft };
}

// 保存主题
function setTheme(t) {
  wx.setStorageSync(KEY, t);
}

// HSL → HEX（色相 0-360，饱和度/亮度 0-1）
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to255 = v => Math.round((v + m) * 255);
  const hx = n => n.toString(16).padStart(2, '0');
  return '#' + hx(to255(r)) + hx(to255(g)) + hx(to255(b));
}
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// 由色相生成一整套自定义主题色（饱和度/亮度固定，保证好看）
function buildCustom(hue) {
  const accent = hslToHex(hue, 0.62, 0.62);
  const rgb = hexToRgb(accent);
  const soft = 'rgba(' + rgb.join(',') + ',0.12)';
  return { key: 'custom', name: '自定义', accent: accent, soft: soft, hue: hue };
}

module.exports = {
  THEMES: THEMES,
  DEFAULT_KEY: DEFAULT_KEY,
  presetOf: presetOf,
  getTheme: getTheme,
  setTheme: setTheme,
  hslToHex: hslToHex,
  hexToRgb: hexToRgb,
  buildCustom: buildCustom
};
