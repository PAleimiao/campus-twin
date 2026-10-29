// pages/checkin/checkin.js —— 上课签到（学生端）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

Page({
  data: { theme: {}, list: [], loading: true },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listCheckinSessions', {});
    if (res.code === 'OK') {
      const list = (res.list || []).map(s => Object.assign({}, s, {
        timeText: (s.openAt || '').slice(5, 16).replace('T', ' '),
        isOpen: s.status === 'open'
      }));
      this.setData({ list: list, loading: false });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  // 签到
  async sign(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '签到中...' });
    const res = await cloud.call('studentCheckin', { sessionId: id });
    wx.hideLoading();
    wx.showToast({
      title: res.msg || (res.code === 'OK' ? '签到成功' : '签到失败'),
      icon: res.code === 'OK' ? 'success' : 'none'
    });
    this.onShow();
  }
});
