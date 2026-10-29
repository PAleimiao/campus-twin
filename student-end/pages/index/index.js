// pages/index/index.js —— 学生端首页（校园资讯 + 功能入口总览）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');
const config = require('../../config.js');

// 校园资讯轮播图数据：优先用 newsBanners；没配则回退到单张 bannerImage；都没有则空数组（显示渐变占位）
const banners = (config.newsBanners && config.newsBanners.length)
  ? config.newsBanners
  : (config.bannerImage ? [config.bannerImage] : []);

Page({
  data: {
    name: '',                       // 当前登录学生姓名
    role: '',
    theme: {},                      // 当前主题（用于给整页上色）
    bannerTitle: config.bannerTitle,
    bannerSubtitle: config.bannerSubtitle,
    newsBanners: banners,           // 校园资讯 · 顶部轮播图
    newsList: config.newsList || [], // 校园资讯 · 列表（演示数据）
    modules: [
      { key: 'announce',  name: '校园公告', icon: '📢', desc: '班级/学院通知' },
      { key: 'leave',     name: '请假申请', icon: '📝', desc: '在线请假' },
      { key: 'timetable', name: '我的课表', icon: '📅', desc: '本周课程' },
      { key: 'score',     name: '成绩查询', icon: '📊', desc: '各科成绩' },
      { key: 'checkin',   name: '上课签到', icon: '✅', desc: '一键签到' },
      { key: 'dorm',      name: '宿舍签到', icon: '🏠', desc: '归寝打卡' },
      { key: 'qual',      name: '我的资质', icon: '🏅', desc: '证书奖项' },
      { key: 'library',   name: '图书馆',   icon: '📚', desc: '检索借还' },
      { key: 'ai',        name: 'AI 答疑',  icon: '🤖', desc: '制度问答' }
    ]
  },

  async onShow() {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({
      name: wx.getStorageSync('name'),
      role: wx.getStorageSync('role'),
      theme: theme.getTheme()
    });

    try {
      const res = await cloud.call('getNews', {});
      if (res && res.code === 'OK') {
        this.setData({
          newsBanners: (res.banners && res.banners.length) ? res.banners.map(b => b.image) : banners,
          newsList: (res.list && res.list.length) ? res.list : (config.newsList || [])
        });
      }
    } catch (e) {}
  },

  goTheme() {
    wx.navigateTo({ url: '/pages/theme/theme' });
  },

  // 👇 新增：点击顶部轮播图跳转 👇
  onTapBanner(e) {
    // 这里默认跳转到「校园公告」页面
    wx.navigateTo({
      url: '/pages/announce/announce'
    });
  },

  onTapNews(e) {
    const i = Number(e.currentTarget.dataset.i);
    const item = this.data.newsList[i];
    if (!item) return;
    wx.setStorageSync('newsDetail', item);
    wx.navigateTo({ url: '/pages/news-detail/news-detail' });
  },

  onTapModule(e) {
    const key = e.currentTarget.dataset.key;
    const routes = {
      announce: '/pages/announce/announce',
      leave: '/pages/leave/leave',
      timetable: '/pages/timetable/timetable',
      score: '/pages/score/score',
      checkin: '/pages/checkin/checkin',
      ai: '/pages/ai/ai',
      dorm: '/pages/studentDormCheckin/studentDormCheckin',
      qual: '/pages/myQual/myQual',
      library: '/pages/library/library',
    };
    if (routes[key]) {
      wx.navigateTo({ url: routes[key] });
      return;
    }
    const m = this.data.modules.find(x => x.key === key);
    wx.showToast({ title: '「' + (m ? m.name : '') + '」还在开发中', icon: 'none' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (r) => {
        if (r.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('role');
          wx.removeStorageSync('name');
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});