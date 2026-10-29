// pages/login/login.js —— 教师登录页
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

Page({
  data: {
    account: '',   // 工号
    password: '',  // 密码
    theme: {}      // 当前主题（给整页上色）
  },

  onLoad() {
    this.setData({ theme: theme.getTheme() });
  },

  onAccountInput(e) { this.setData({ account: e.detail.value }); },
  onPwdInput(e) { this.setData({ password: e.detail.value }); },

  async onLogin() {
    const account = this.data.account.trim();
    const password = this.data.password;
    if (!account || !password) {
      wx.showToast({ title: '请输入工号和密码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中...' });
    // role 固定 teacher
    const res = await cloud.call('login', {
      account: account,
      password: password,
      role: 'teacher'
    });
    wx.hideLoading();

    if (res.code === 'OK') {
      wx.setStorageSync('token', res.token);
      wx.setStorageSync('role', res.role);
      wx.setStorageSync('name', res.name);
      if (res.mustChangePwd) {
        wx.reLaunch({ url: '/pages/change-pwd/change-pwd' });
      } else {
        wx.reLaunch({ url: '/pages/index/index' });
      }
    } else if (res.code === 'LOCKED') {
      wx.showToast({ title: res.msg, icon: 'none' });
    } else {
      wx.showToast({ title: res.msg || '登录失败', icon: 'none' });
    }
  }
});
