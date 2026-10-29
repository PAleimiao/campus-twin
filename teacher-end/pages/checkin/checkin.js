// pages/checkin/checkin.js —— 签到管理（教师端）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

const ATT = { signed: '已签到', absent: '旷课', late: '请假' };

Page({
  data: { 
    theme: {}, 
    list: [], 
    courseName: '', 
    openId: '', 
    att: [], 
    loading: true 
  },

  onLoad() { 
    this.setData({ theme: theme.getTheme() }); 
  },

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

  onCourse(e) { 
    this.setData({ courseName: e.detail.value }); 
  },

  // 发起一次签到
  async open() {
    const res = await cloud.call('openCheckin', { courseName: this.data.courseName.trim() });
    if (res.code === 'OK') {
      wx.showToast({ title: '已发起签到', icon: 'success' });
      this.setData({ courseName: '' });
      this.onShow();
    } else {
      wx.showToast({ title: res.msg || '发起失败', icon: 'none' });
    }
  },

  // 结束签到：未签到的本班学生自动记为旷课
  async close(e) {
    const id = e.currentTarget.dataset.id;
    const res = await cloud.call('closeCheckin', { sessionId: id });
    if (res.code === 'OK') {
      wx.showToast({ title: '已结束，未签到记为旷课', icon: 'none' });
      await this.onShow();
      this.loadAtt(id);
    } else {
      wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
    }
  },

  viewAtt(e) { 
    this.loadAtt(e.currentTarget.dataset.id); 
  },

  async loadAtt(id) {
    const res = await cloud.call('listAttendance', { sessionId: id });
    if (res.code === 'OK') {
      this.setData({
        openId: id,
        att: (res.list || []).map(a => Object.assign({}, a, { statusText: ATT[a.status] || a.status }))
      });
    }
  },

  // 👇 新增：老师手动修改学生的考勤状态 👇
  async onChangeStatus(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    
    // 1. 前端立刻变颜色
    const newAtt = this.data.att.map(item => {
      if (item._id === id) {
        return Object.assign({}, item, {
          status: status,
          statusText: ATT[status] || status
        });
      }
      return item;
    });
    this.setData({ att: newAtt });

    // 2. 调后端接口，把真实状态存进数据库
    const res = await cloud.call('updateAttendanceStatus', { 
      attendanceId: id, 
      status: status 
    });

    if (res.code === 'OK') {
      wx.showToast({ title: '修改成功', icon: 'success' });
    } else {
      wx.showToast({ title: res.msg || '修改失败', icon: 'none' });
    }
  }
});