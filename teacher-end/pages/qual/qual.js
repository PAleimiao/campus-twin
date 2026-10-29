const cloud = require('../../utils/cloud.js');

Page({
  data: {
    certs: [],
    filteredCerts: [],
    currentTab: 'pending',
    pendingCount: 0,
    passedCount: 0,
    rejectedCount: 0
  },

  onShow: function () {
    this.fetchAllCerts();
  },

  // 拉取所有证书
  async fetchAllCerts() {
    wx.showLoading({ title: '加载中...' });
    const res = await cloud.call('listCerts', {});
    wx.hideLoading();

    if (res.code === 'OK') {
      var certs = res.list || [];
      this.setData({ certs: certs });
      this.updateStats(certs);
      this.applyFilter(certs, this.data.currentTab);
    } else {
      wx.showToast({ title: res.msg || '获取失败', icon: 'none' });
    }
  },

  // 审批通过/驳回
  async onUpdateStatus(e) {
    var id = e.currentTarget.dataset.id;
    var status = e.currentTarget.dataset.status;
    if (!id) return;

    if (status === 'rejected') {
      // 如果是驳回，弹出输入框让老师写理由
      wx.showModal({
        title: '驳回理由',
        editable: true,
        placeholderText: '请填写驳回原因',
        success: async (res) => {
          if (res.confirm && res.content && res.content.trim()) {
            this.doApprove(id, status, res.content.trim());
          }
        }
      });
    } else {
      // 如果是通过，直接提交
      this.doApprove(id, status, '');
    }
  },

  // 抽离出提交的方法
  async doApprove(id, status, rejectReason) {
    wx.showLoading({ title: '处理中...' });
    const res = await cloud.call('approveCert', { 
      certId: id, 
      status: status,
      rejectReason: rejectReason // 把驳回理由传过去
    });
    wx.hideLoading();

    if (res.code === 'OK') {
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.fetchAllCerts();
    } else {
      wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
    }
  },

  // 以下是原有的工具函数，保留不动
  updateStats: function (list) {
    var pending = 0, passed = 0, rejected = 0;
    list.forEach(function (c) {
      if (c.status === 'pending') pending++;
      else if (c.status === 'passed') passed++;
      else if (c.status === 'rejected') rejected++;
    });
    this.setData({ pendingCount: pending, passedCount: passed, rejectedCount: rejected });
  },

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.applyFilter(this.data.certs, tab);
  },

  applyFilter: function (list, tab) {
    this.setData({ filteredCerts: list.filter(function (c) { return c.status === tab; }) });
  }
});