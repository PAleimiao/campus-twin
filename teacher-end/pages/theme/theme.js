// pages/theme/theme.js —— 主题配色设置页（与学生端同款）
const theme = require('../../utils/theme.js');

Page({
  data: {
    themes: theme.THEMES,
    current: '',
    hue: 330,
    preview: '',
    previewSoft: '',
    custom: {}
  },

  onLoad() {
    const cur = theme.getTheme();
    const hue = cur.hue || 330;
    this.setData({ current: cur.key, hue: hue, preview: cur.accent, previewSoft: cur.soft });
    this.refreshCustom(hue, false);
  },

  onPickPreset(e) {
    const key = e.currentTarget.dataset.key;
    const t = theme.presetOf(key);
    theme.setTheme({ key: t.key, name: t.name, accent: t.accent, soft: t.soft });
    this.setData({ current: key, preview: t.accent, previewSoft: t.soft });
    wx.showToast({ title: '已切换：' + t.name, icon: 'none' });
  },

  onHueChange(e) {
    const hue = e.detail.value;
    this.setData({ hue: hue });
    this.refreshCustom(hue, true);
  },

  refreshCustom(hue, applyPreview) {
    const c = theme.buildCustom(hue);
    this.setData({ custom: c });
    if (applyPreview) {
      theme.setTheme(c);
      this.setData({ current: 'custom', preview: c.accent, previewSoft: c.soft });
    }
  },

  onApplyCustom() {
    const c = theme.buildCustom(this.data.hue);
    theme.setTheme(c);
    this.setData({ current: 'custom', preview: c.accent, previewSoft: c.soft });
    wx.showToast({ title: '已应用自定义主题', icon: 'none' });
  }
});
