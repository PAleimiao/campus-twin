// pages/theme/theme.js —— 主题配色设置页
// 预置色卡直接切换；下方滑块可拖出「自定义色相」，实时预览并及时保存。
const theme = require('../../utils/theme.js');

Page({
  data: {
    themes: theme.THEMES,
    current: '',        // 当前选中的 key（sakura/violet/.../custom）
    hue: 330,           // 自定义色相
    preview: '',        // 预览用主色（根节点 --accent 绑这个，实时变色）
    previewSoft: '',
    custom: {}          // 自定义色对象
  },

  onLoad() {
    const cur = theme.getTheme();
    const hue = cur.hue || 330;
    this.setData({
      current: cur.key,
      hue: hue,
      preview: cur.accent,
      previewSoft: cur.soft
    });
    this.refreshCustom(hue, false);
  },

  // 点了某个预置色卡
  onPickPreset(e) {
    const key = e.currentTarget.dataset.key;
    const t = theme.presetOf(key);
    theme.setTheme({ key: t.key, name: t.name, accent: t.accent, soft: t.soft });
    this.setData({ current: key, preview: t.accent, previewSoft: t.soft });
    wx.showToast({ title: '已切换：' + t.name, icon: 'none' });
  },

  // 拖动色相滑块（changing 连续触发做实时预览，change 松手也走这里）
  onHueChange(e) {
    const hue = e.detail.value;
    this.setData({ hue: hue });
    this.refreshCustom(hue, true);
  },

  // 生成自定义色；applyPreview=true 时顺带保存 + 实时预览
  refreshCustom(hue, applyPreview) {
    const c = theme.buildCustom(hue);
    this.setData({ custom: c });
    if (applyPreview) {
      theme.setTheme(c);
      this.setData({ current: 'custom', preview: c.accent, previewSoft: c.soft });
    }
  },

  // 明确点「应用」按钮
  onApplyCustom() {
    const c = theme.buildCustom(this.data.hue);
    theme.setTheme(c);
    this.setData({ current: 'custom', preview: c.accent, previewSoft: c.soft });
    wx.showToast({ title: '已应用自定义主题', icon: 'none' });
  }
});
