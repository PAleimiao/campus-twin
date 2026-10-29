// pages/announce/announce.js —— 发布公告（教师端）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

const SCOPES = ['全校', '本学院', '本班'];
const SCOPE_VAL = ['school', 'college', 'class'];
const SCOPE_TEXT = { school: '全校', college: '学院', class: '本班' };

Page({
  data: { theme: {}, scopes: SCOPES, scopeIndex: 0, title: '', content: '', list: [], loading: true },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listAnnouncements', {});
    if (res.code === 'OK') {
      this.setData({
        list: (res.list || []).map(a => Object.assign({}, a, {
          scopeText: SCOPE_TEXT[a.scope] || '通知',
          dateText: (a.createdAt || '').slice(0, 10)
        })),
        loading: false
      });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  onScope(e) { this.setData({ scopeIndex: Number(e.detail.value) }); },
  onTitle(e) { this.setData({ title: e.detail.value }); },
  onContent(e) { this.setData({ content: e.detail.value }); },

  async publish() {
    const title = this.data.title.trim();
    if (!title) { wx.showToast({ title: '请填写公告标题', icon: 'none' }); return; }
    wx.showLoading({ title: '发布中...' });
    const res = await cloud.call('publishAnnouncement', {
      title: title,
      content: this.data.content.trim(),
      scope: SCOPE_VAL[this.data.scopeIndex]
    });
    wx.hideLoading();
    if (res.code === 'OK') {
      wx.showToast({ title: '已发布', icon: 'success' });
      this.setData({ title: '', content: '' });
      this.onShow();
    } else {
      wx.showToast({ title: res.msg || '发布失败', icon: 'none' });
    }
  }
});
