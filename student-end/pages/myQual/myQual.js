const cloud = require('../../utils/cloud.js');

Page({
  data: {
    currentTab: 'all',
    certs: [],
    filteredCerts: [],
    totalCount: 0,
    pendingCount: 0,
    passedCount: 0
  },

  onShow: function () {
    this.fetchMyCerts();
  },

  // 从后端拉取我的证书
  async fetchMyCerts() {
    const res = await cloud.call('listCerts', {}); // 调后端
    if (res.code === 'OK') {
      var certs = res.list || [];
      this.setData({ certs: certs });
      this.updateStats(certs);
      this.applyFilter(certs, this.data.currentTab);
    } else {
      wx.showToast({ title: res.msg || '获取失败', icon: 'none' });
    }
  },

  // 上传证书
  onUploadCert: function () {
    var that = this;
    // 第一层弹窗：填证书名称
    wx.showModal({
      title: '证书名称',
      editable: true,
      placeholderText: '如：英语四级',
      success: function (res1) {
        if (res1.confirm && res1.content && res1.content.trim()) {
          var certName = res1.content.trim();
          
          // 第二层弹窗：填发证机构
          wx.showModal({
            title: '发证机构',
            editable: true,
            placeholderText: '如：教育部考试中心',
            success: function (res2) {
              if (res2.confirm && res2.content && res2.content.trim()) {
                var issuer = res2.content.trim();

                // 第三层弹窗：填证书编号
                wx.showModal({
                  title: '证书编号',
                  editable: true,
                  placeholderText: '如：CET4-2024-001',
                  success: async function (res3) {
                    if (res3.confirm && res3.content && res3.content.trim()) {
                      var certNo = res3.content.trim();
                      
                      wx.showLoading({ title: '提交中...' });
                      // 把完整的三个信息传给后端
                      const apiRes = await cloud.call('submitCert', { 
                        certName: certName, 
                        issuer: issuer, 
                        certNo: certNo 
                      });
                      wx.hideLoading();
                      
                      if (apiRes.code === 'OK') {
                        wx.showToast({ title: '提交成功', icon: 'success' });
                        that.fetchMyCerts();
                      } else {
                        wx.showToast({ title: apiRes.msg || '提交失败', icon: 'none' });
                      }
                    }
                  }
                });
              }
            }
          });
        }
      }
    });
  },

  // 以下是原有的工具函数，保留不动
  updateStats: function (list) {
    var pending = 0, passed = 0;
    list.forEach(function (c) {
      if (c.status === 'pending') pending++;
      else if (c.status === 'passed') passed++;
    });
    this.setData({ totalCount: list.length, pendingCount: pending, passedCount: passed });
  },

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.applyFilter(this.data.certs, tab);
  },

  applyFilter: function (list, tab) {
    if (tab === 'all') this.setData({ filteredCerts: list });
    else this.setData({ filteredCerts: list.filter(function (c) { return c.status === tab; }) });
  }
});