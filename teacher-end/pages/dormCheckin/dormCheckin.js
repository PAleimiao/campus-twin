// pages/dormCheckin/dormCheckin.js
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    topic: '',
    buildings: ['A 栋', 'B 栋', 'C 栋', '全部楼栋'],
    buildingIndex: 3,
    durations: ['10 分钟', '20 分钟', '30 分钟', '60 分钟'],
    durationIndex: 1,
    activeCode: '',
    remainText: '',
    students: [],
    groupedStudents: [],
    checkedCount: 0,
    checkedIds: [],
    signTimes: {}, 
    realStudents: [] 
  },

  onLoad() {
    this.fetchRealStudents();
    this.restoreCheckinState(); // 页面加载时恢复状态
  },

  onShow() {
    this.restoreCheckinState(); // 从其他页面返回时，恢复签到现场
  },

  onHide: function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  onUnload: function () {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  },

  // 👇 核心：恢复签到状态 👇
  restoreCheckinState: function () {
    var saved = wx.getStorageSync('active_dorm_checkin');
    if (saved && saved.endTime > Date.now()) {
      this.setData({
        activeCode: saved.code,
        topic: saved.topic,
        buildingIndex: saved.buildingIndex || 3
      });
      this.startCountdown(saved.endTime);
      this.startPolling();
    } else {
      this.setData({
        activeCode: '',
        topic: '',
        remainText: '',
        students: [],
        groupedStudents: [],
        checkedCount: 0
      });
      if (saved) wx.removeStorageSync('active_dorm_checkin');
    }
  },

  async fetchRealStudents() {
    const res = await cloud.call('getStudentList', {});
    if (res.code === 'OK' && res.data) {
      let students = res.data.map(s => ({
        id: String(s.id),
        name: s.name,
        dorm: s.dorm || '未知',
        avatarText: s.name.charAt(0)
      }));
      this.setData({ realStudents: students });
      if (this.data.activeCode) {
        this.renderStudents(this.data.checkedIds);
      }
    }
  },

  async onStartCheckin() {
    var topic = this.data.topic.trim();
    if (!topic) return wx.showToast({ title: '请输入签到主题', icon: 'none' });

    wx.showLoading({ title: '发起中...' });
    const res = await cloud.call('createDormCheckin', { topic: topic });
    wx.hideLoading();

    if (res.code === 'OK' && res.data) {
      // 👇 核心：发起成功，把状态存进本地缓存，这样返回上一页再进来就不会丢了 👇
      wx.setStorageSync('active_dorm_checkin', {
        code: res.data.code,
        topic: res.data.topic,
        endTime: res.data.endTime,
        buildingIndex: this.data.buildingIndex
      });

      this.setData({ activeCode: res.data.code, topic: res.data.topic });
      this.startCountdown(res.data.endTime);
      this.startPolling();
      wx.showToast({ title: '签到已发起', icon: 'success' });
    }
  },

  startCountdown: function (endTime) {
    var that = this;
    if (this.timer) clearInterval(this.timer);
    function tick() {
      var remain = endTime - Date.now();
      if (remain <= 0) {
        that.setData({ remainText: '已结束' });
        clearInterval(that.timer);
        that.timer = null;
        return;
      }
      var m = Math.floor(remain / 60000);
      var s = Math.floor((remain % 60000) / 1000);
      that.setData({ remainText: m + '分' + (s < 10 ? '0' + s : s) + '秒' });
    }
    tick();
    this.timer = setInterval(tick, 1000);
  },

  startPolling: function () {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      const res = await cloud.call('getCheckinRecords', {});
      if (res.code === 'OK') {
        this.setData({ 
          checkedIds: res.data || [],
          signTimes: res.times || {}
        });
        this.renderStudents(res.data || []);
      }
    }, 1000);
  },

  renderStudents: function (checkedIds) {
    var that = this;
    var students = this.data.realStudents.map(function (s) {
      // 👇 拿出后端返回的具体签到时间 👇
      var signTime = that.data.signTimes && that.data.signTimes[s.id] ? that.data.signTimes[s.id] : '';
      return {
        id: s.id, 
        name: s.name, 
        dorm: s.dorm, 
        avatarText: s.avatarText,
        checked: checkedIds.indexOf(String(s.id)) !== -1,
        signTime: signTime
      };
    });

    var groups = {};
    students.forEach(function (s) {
      if (!groups[s.dorm]) groups[s.dorm] = { dorm: s.dorm, students: [], checked: 0, total: 0 };
      groups[s.dorm].students.push(s);
      groups[s.dorm].total++;
      if (s.checked) groups[s.dorm].checked++;
    });

    var groupedStudents = Object.keys(groups).sort().map(function (k) { return groups[k]; });
    var checkedCount = students.filter(function (s) { return s.checked; }).length;

    this.setData({ students: students, groupedStudents: groupedStudents, checkedCount: checkedCount });
  },

  onTopicInput: function (e) { this.setData({ topic: e.detail.value }); },
  onBuildingChange: function (e) { this.setData({ buildingIndex: Number(e.detail.value) }); },
  onDurationChange: function (e) { this.setData({ durationIndex: Number(e.detail.value) }); },

  onDormCheckAll: function (e) {
    wx.showToast({ title: '请叫学生自己签', icon: 'none' });
  },

  onStopCheckin: function () {
    var that = this;
    wx.showModal({
      title: '结束签到', content: '确定结束吗？', confirmColor: '#FF6B9D',
      success: function (res) {
        if (res.confirm) {
          if (that.timer) clearInterval(that.timer);
          if (that.pollTimer) clearInterval(that.pollTimer);
          // 结束后必须清除缓存
          wx.removeStorageSync('active_dorm_checkin');
          that.setData({ activeCode: '', topic: '', remainText: '', students: [], groupedStudents: [], checkedCount: 0 });
        }
      }
    });
  }
});