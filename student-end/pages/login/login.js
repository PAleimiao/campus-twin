// pages/login/login.js —— 学生登录页
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

Page({
  data: {
    account: '',   // 学号
    password: '',  // 密码
    theme: {}      // 当前主题（给整页上色）
  },

  // 进页面时读一次主题
  onLoad() {
    this.setData({ theme: theme.getTheme() });
  },

  // 学号输入框：实时把输入存进 data
  onAccountInput(e) {
    this.setData({ account: e.detail.value });
  },

  // 密码输入框
  onPwdInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 点击登录
  async onLogin() {
    const account = this.data.account.trim();
    const password = this.data.password;
    if (!account || !password) {
      wx.showToast({ title: '请输入学号和密码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中...' });
    // 调用后端 login 云函数，role 固定 student（学生端）
    const res = await cloud.call('login', {
      account: account,
      password: password,
      role: 'student'
    });
    wx.hideLoading();

    if (res.code === 'OK') {
      // 登录成功：把 token / 角色 / 姓名 存本地，后续页面和云调用都用
      wx.setStorageSync('token', res.token);
      wx.setStorageSync('role', res.role);
      wx.setStorageSync('name', res.name);

      if (res.mustChangePwd) {
        // 首次登录：跳到强制改密页（不可跳过）
        wx.reLaunch({ url: '/pages/change-pwd/change-pwd' });
      } else {
        // 已改过密：进首页
        wx.reLaunch({ url: '/pages/index/index' });
      }
    } else if (res.code === 'LOCKED') {
      // 输错太多次被锁定
      wx.showToast({ title: res.msg, icon: 'none' });
    } else {
      wx.showToast({ title: res.msg || '登录失败', icon: 'none' });
    }
  }
});
