// pages/leave/leave.js —— 请假申请 + 我的请假记录
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

const TYPES = ['事假', '病假', '其它'];
const STATUS = { pending: '待审批', approved: '已通过', rejected: '已驳回' };
const STATUS_CLASS = { pending: 'st-pending', approved: 'st-ok', rejected: 'st-no' };

Page({
  data: {
    theme: {},
    types: TYPES,
    typeIndex: 0,
    reason: '',
    start: '',
    end: '',
    list: [],
    loading: true
  },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listLeaves', {});
    if (res.code === 'OK') {
      const list = (res.list || []).map(l => Object.assign({}, l, {
        statusText: STATUS[l.status] || l.status,
        statusClass: STATUS_CLASS[l.status] || 'st-pending'
      }));
      this.setData({ list: list, loading: false });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  onType(e) { this.setData({ typeIndex: Number(e.detail.value) }); },
  onReason(e) { this.setData({ reason: e.detail.value }); },
  onStart(e) { this.setData({ start: e.detail.value }); },
  onEnd(e) { this.setData({ end: e.detail.value }); },

  async submit() {
    const reason = this.data.reason.trim();
    if (!reason) { wx.showToast({ title: '请填写请假原因', icon: 'none' }); return; }
    wx.showLoading({ title: '提交中...' });
    const res = await cloud.call('submitLeave', {
      type: TYPES[this.data.typeIndex],
      reason: reason,
      start: this.data.start,
      end: this.data.end
    });
    wx.hideLoading();
    if (res.code === 'OK') {
      wx.showToast({ title: '已提交，等待审批', icon: 'none' });
      this.setData({ reason: '', start: '', end: '' });
      this.onShow();
    } else {
      wx.showToast({ title: res.msg || '提交失败', icon: 'none' });
    }
  }
});
