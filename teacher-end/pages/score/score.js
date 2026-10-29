// pages/score/score.js —— 成绩录入（教师端）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

Page({
  data: {
    theme: {},
    rows: [],          // 待提交的成绩行
    cur: { studentNo: '', name: '', courseName: '', score: '', semester: '2026秋' },
    list: [],          // 已录入（本班）
    loading: true
  },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listScores', {});
    if (res.code === 'OK') {
      this.setData({ list: res.list || [], loading: false });
    } else {
      this.setData({ loading: false });
    }
  },

  onField(e) { this.setData({ ['cur.' + e.currentTarget.dataset.f]: e.detail.value }); },

  addRow() {
    const c = this.data.cur;
    const studentNo = String(c.studentNo).trim();
    const courseName = String(c.courseName).trim();
    if (!studentNo || !courseName) { wx.showToast({ title: '请填学号和课程', icon: 'none' }); return; }
    if (isNaN(Number(c.score))) { wx.showToast({ title: '请填分数', icon: 'none' }); return; }
    const rows = this.data.rows.concat([{
      studentNo: studentNo, name: String(c.name).trim(), courseName: courseName,
      score: Number(c.score), semester: String(c.semester).trim()
    }]);
    this.setData({ rows: rows, cur: { studentNo: '', name: '', courseName: '', score: '', semester: c.semester } });
  },

  removeRow(e) {
    const i = Number(e.currentTarget.dataset.i);
    const rows = this.data.rows.slice();
    rows.splice(i, 1);
    this.setData({ rows: rows });
  },

  async save() {
    if (this.data.rows.length === 0) { wx.showToast({ title: '请先添加成绩', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中...' });
    const res = await cloud.call('enterScore', { rows: this.data.rows });
    wx.hideLoading();
    if (res.code === 'OK') {
      wx.showToast({ title: '已保存 ' + res.count + ' 条', icon: 'success' });
      this.setData({ rows: [] });
      this.onShow();
    } else {
      wx.showToast({ title: res.msg || '保存失败', icon: 'none' });
    }
  }
});
