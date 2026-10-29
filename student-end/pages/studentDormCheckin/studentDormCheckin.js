// pages/studentDormCheckin/studentDormCheckin.js
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    codeArr: ['', '', '', ''],
    focusIndex: 0,
    submitting: false,
    resultVisible: false,
    resultOk: false,
    resultText: '',
    resultSub: '',
    activeCheckin: null // 从后端拉取的当前签到信息
  },

  onLoad() {
    this.fetchCurrentCheckin();
  },

  // 1. 页面加载时，向老师端拉取当前的签到信息
  async fetchCurrentCheckin() {
    const res = await cloud.call('getCurrentDormCheckin', {});
    if (res.code === 'OK' && res.data) {
      this.setData({ activeCheckin: res.data });
    } else {
      this.showResult(false, '暂无签到', '老师还没发起宿舍签到');
    }
  },

  onCodeInput: function (e) {
    var index = Number(e.currentTarget.dataset.index);
    var value = e.detail.value;
    var codeArr = this.data.codeArr.slice();
    value = value.replace(/\D/g, '').slice(-1);
    codeArr[index] = value;
    var focusIndex = index;
    if (value && index < 3) focusIndex = index + 1;
    this.setData({ codeArr: codeArr, focusIndex: focusIndex });
  },

  onCodeFocus: function (e) {
    this.setData({ focusIndex: Number(e.currentTarget.dataset.index) });
  },

  // 2. 输入完成，点击确认
  async onSubmit() {
    var code = this.data.codeArr.join('');
    if (code.length !== 4) {
      wx.showToast({ title: '请输入 4 位签到码', icon: 'none' });
      return;
    }

    if (!this.data.activeCheckin) {
      this.showResult(false, '暂无签到', '老师还没发起宿舍签到');
      return;
    }

    if (this.data.activeCheckin.code !== code) {
      this.showResult(false, '签到码错误', '请向老师确认');
      return;
    }

    // 👇 核心改动：获取登录人名字，去后端名单里找真实的自己 👇
    let myName = wx.getStorageSync('name') || '同学';
    
    wx.showLoading({ title: '匹配身份中...' });
    const res = await cloud.call('getStudentList', {});
    wx.hideLoading();

    if (res.code === 'OK' && res.data) {
      // 在名单里找自己
      let me = res.data.find(s => s.name === myName);
      
      if (me) {
        // 找到了，带着自己的真实 ID 去签到
        this.doSubmit(me);
      } else {
        // 如果后端没这个名字，提示错误
        this.showResult(false, '未找到信息', '请联系老师导入名单');
      }
    } else {
      wx.showToast({ title: '获取名单失败', icon: 'none' });
    }
  },

  // 3. 真正提交签到给后端
  async doSubmit(student) {
    wx.showLoading({ title: '提交中...' });
    
    const res = await cloud.call('submitDormCheckin', {
      checkinId: this.data.activeCheckin.checkinId,
      studentId: student.id // 这里现在传的是真实匹配到的 id 了
    });
    
    wx.hideLoading();

    if (res.code === 'OK') {
      this.showResult(true, '归寝签到成功', student.name + ' · ' + student.dorm);
    } else {
      this.showResult(false, '签到失败', res.msg || '可能已签到');
    }
  },

  showResult: function (ok, text, sub) {
    this.setData({
      resultVisible: true,
      resultOk: ok,
      resultText: text,
      resultSub: sub
    });
    if (ok) wx.showToast({ title: '签到成功', icon: 'success' });
  }
});