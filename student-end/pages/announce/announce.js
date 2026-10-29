// pages/announce/announce.js —— 校园公告（学生端）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

const SCOPE_TEXT = { school: '全校', college: '学院', class: '本班' };

Page({
  data: { theme: {}, list: [], openIdx: -1, loading: true },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listAnnouncements', {});
    if (res.code === 'OK') {
      const list = (res.list || []).map(a => Object.assign({}, a, {
        scopeText: SCOPE_TEXT[a.scope] || '通知',
        dateText: (a.createdAt || '').slice(0, 10)
      }));
      this.setData({ list: list, loading: false });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  // 点标题展开/收起正文
  toggle(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ openIdx: this.data.openIdx === i ? -1 : i });
  }
});
