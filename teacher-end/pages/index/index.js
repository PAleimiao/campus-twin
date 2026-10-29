// pages/index/index.js —— 教师端工作台（管理入口总览）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');
const config = require('../../config.js');

Page({
  data: {
    name: '',
    role: '',
    theme: {},                      // 当前主题
    banner: config.bannerImage,     // 顶部横幅（在 config.js 里换）
    bannerTitle: config.bannerTitle,
    bannerSubtitle: config.bannerSubtitle,
    // 九大管理模块入口。骨架阶段点进去提示“开发中”，后续替换为真实页面。
    modules: [
      { key: 'roster',    name: '班级学生', icon: '👥', desc: '花名册/导入' },
      { key: 'leave',     name: '请假管理', icon: '✅', desc: '审批请假' },
      { key: 'timetable', name: '课表编排', icon: '📅', desc: '排课' },
      { key: 'score',     name: '成绩录入', icon: '📊', desc: '录成绩' },
      { key: 'checkin',   name: '签到管理', icon: '🟢', desc: '发起/统计' },
      { key: 'dorm',      name: '宿舍签到', icon: '🏠', desc: '归寝管理' },
      { key: 'qual',      name: '资质审核', icon: '🏅', desc: '证书审核' },
      { key: 'library',   name: '图书管理', icon: '📚', desc: '上架/下架' },
      { key: 'announce',  name: '校园资讯', icon: '📰', desc: '轮播/资讯维护' },
      { key: 'notice',    name: '发布公告', icon: '📢', desc: '定向通知' }
    ]
  },

  onShow() {
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
    // TODO：后续接入教师接口，拉取 classIds → 渲染“我的班级”选择卡
  },

  goTheme() {
    wx.navigateTo({ url: '/pages/theme/theme' });
  },

  onTapModule(e) {
    const key = e.currentTarget.dataset.key;
    const routes = {
      roster: '/pages/classManage/classManage',
      announce: '/pages/news/news',          // 校园资讯（轮播图 + 资讯列表）
      notice: '/pages/announce/announce',    // 发布公告
      leave: '/pages/leave/leave',           // 请假审批
      timetable: '/pages/timetable/timetable', // 课表编排
      score: '/pages/score/score',           // 成绩录入
      checkin: '/pages/checkin/checkin', // 签到管理
      myClasses:  '/pages/myClasses/myClasses', 
      dorm:       '/pages/dormCheckin/dormCheckin',
      qual:       '/pages/qual/qual' ,
      library: '/pages/library/library'
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
