// pages/change-pwd/change-pwd.js —— 教师强制修改密码页（逻辑与学生端完全一致）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

Page({
  data: { oldPwd: '', newPwd: '', confirmPwd: '', theme: {} },

  onLoad() {
    this.setData({ theme: theme.getTheme() });
  },

  onOldInput(e) { this.setData({ oldPwd: e.detail.value }); },
  onNewInput(e) { this.setData({ newPwd: e.detail.value }); },
  onConfirmInput(e) { this.setData({ confirmPwd: e.detail.value }); },

  async onSubmit() {
    const oldPwd = this.data.oldPwd;
    const newPwd = this.data.newPwd;
    const confirmPwd = this.data.confirmPwd;

    if (!oldPwd || !newPwd || !confirmPwd) {
      wx.showToast({ title: '请填写完整', icon: 'none' }); return;
    }
    if (newPwd.length < 6) {
      wx.showToast({ title: '新密码至少 6 位', icon: 'none' }); return;
    }
    if (newPwd !== confirmPwd) {
      wx.showToast({ title: '两次新密码不一致', icon: 'none' }); return;
    }

    wx.showLoading({ title: '提交中...' });
    const res = await cloud.call('changePassword', { oldPwd: oldPwd, newPwd: newPwd });
    wx.hideLoading();

    if (res.code === 'OK') {
      wx.removeStorageSync('token');
      wx.removeStorageSync('role');
      wx.removeStorageSync('name');
      wx.showModal({
        title: '修改成功',
        content: '密码已更新，请使用新密码重新登录',
        showCancel: false,
        success() { wx.reLaunch({ url: '/pages/login/login' }); }
      });
    } else {
      wx.showToast({ title: res.msg || '修改失败', icon: 'none' });
    }
  }
});
