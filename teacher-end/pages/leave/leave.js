// pages/leave/leave.js —— 请假审批（教师端）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

const STATUS = { pending: '待审批', approved: '已通过', rejected: '已驳回' };

Page({
  data: { theme: {}, list: [], loading: true },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listLeaves', {});
    if (res.code === 'OK') {
      const list = (res.list || []).map(l => Object.assign({}, l, {
        statusText: STATUS[l.status] || l.status,
        isPending: l.status === 'pending',
        dateText: (l.createdAt || '').slice(0, 10)
      }));
      this.setData({ list: list, loading: false });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  // 点「通过 / 驳回」，弹框可填审批意见
  decide(e) {
    const id = e.currentTarget.dataset.id;
    const approved = e.currentTarget.dataset.ok === '1';
    wx.showModal({
      title: approved ? '通过请假' : '驳回请假',
      editable: true,
      placeholderText: '审批意见（可选）',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await cloud.call('approveLeave', {
          leaveId: id,
          status: approved ? 'approved' : 'rejected',
          comment: r.content || ''
        });
        if (res.code === 'OK') {
          wx.showToast({ title: '已处理', icon: 'none' });
          this.onShow();
        } else {
          wx.showToast({ title: res.msg || '处理失败', icon: 'none' });
        }
      }
    });
  }
});
