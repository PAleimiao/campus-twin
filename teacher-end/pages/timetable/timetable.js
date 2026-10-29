// pages/timetable/timetable.js —— 课表编排（教师端，支持 CSV 导入）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');
const csv = require('../../utils/csv.js');

const WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

Page({
  data: {
    theme: {},
    wd: WD,
    periods: PERIODS,
    rows: [],                                   // 待保存的课表（手动加 + CSV 解析都进这里）
    cur: { courseName: '', teacherName: '', location: '', weekdayIdx: 0, startIdx: 0, endIdx: 1 },
    csvText: '',
    loading: true
  },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listSchedule', {});
    if (res.code === 'OK') {
      this.setData({ rows: res.list || [], loading: false });
    } else {
      this.setData({ loading: false });
    }
  },

  // ---- 手动添加 ----
  onField(e) { this.setData({ ['cur.' + e.currentTarget.dataset.f]: e.detail.value }); },
  onPick(e) { this.setData({ ['cur.' + e.currentTarget.dataset.f]: Number(e.detail.value) }); },

  addRow() {
    const c = this.data.cur;
    const name = String(c.courseName).trim();
    if (!name) { wx.showToast({ title: '请填课程名称', icon: 'none' }); return; }
    this.setData({
      rows: this.data.rows.concat([{
        courseName: name,
        teacherName: String(c.teacherName).trim(),
        location: String(c.location).trim(),
        weekday: c.weekdayIdx + 1,
        startPeriod: c.startIdx + 1,
        endPeriod: c.endIdx + 1
      }]),
      cur: { courseName: '', teacherName: '', location: '', weekdayIdx: c.weekdayIdx, startIdx: c.startIdx, endIdx: c.endIdx }
    });
  },

  removeRow(e) {
    const i = Number(e.currentTarget.dataset.i);
    const rows = this.data.rows.slice();
    rows.splice(i, 1);
    this.setData({ rows: rows });
  },

  // ---- CSV 导入 ----
  copyTemplate() {
    wx.setClipboardData({ data: csv.TEMPLATE, success: () => wx.showToast({ title: '模板已复制', icon: 'none' }) });
  },

  // 方式 A：从聊天里选 .csv 文件
  pickCsvFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv'],
      success: (r) => {
        const f = r.tempFiles[0];
        wx.getFileSystemManager().readFile({
          filePath: f.path,
          encoding: 'utf8',
          success: (res) => this.applyParsed(res.data),
          fail: () => wx.showToast({ title: '读取文件失败', icon: 'none' })
        });
      }
    });
  },

  // 方式 B：直接粘贴 CSV 文本（开发者工具里最稳）
  onCsvText(e) { this.setData({ csvText: e.detail.value }); },
  parsePasted() {
    if (!this.data.csvText.trim()) { wx.showToast({ title: '先粘贴 CSV 内容', icon: 'none' }); return; }
    this.applyParsed(this.data.csvText);
  },

  // 解析结果 → 覆盖到待保存列表（会先确认）
  applyParsed(text) {
    if (String(text).indexOf('\uFFFD') >= 0) {
      wx.showModal({
        title: '编码可能不对',
        content: '文件疑似不是 UTF-8 编码（中文会乱码）。请用 WPS/Excel 另存为 CSV 时选择「UTF-8」编码，或改用「粘贴文本」方式。',
        showCancel: false
      });
    }
    const rows = csv.parseCSV(text);
    if (!rows.length) {
      wx.showToast({ title: '没解析到课程，请检查表头/格式', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '导入 ' + rows.length + ' 节课',
      content: '将用导入内容替换下方待保存列表（保存后才生效）。确定？',
      success: (r) => {
        if (r.confirm) {
          this.setData({ rows: rows, csvText: '' });
          wx.showToast({ title: '解析成功，请点保存', icon: 'none' });
        }
      }
    });
  },

  // ---- 保存到后端（覆盖该班课表）----
  async save() {
    const rows = this.data.rows.map(r => ({
      courseName: r.courseName, teacherName: r.teacherName,
      weekday: r.weekday, startPeriod: r.startPeriod, endPeriod: r.endPeriod,
      location: r.location, weeks: r.weeks || '', semester: r.semester || ''
    }));
    if (!rows.length) { wx.showToast({ title: '课表为空', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中...' });
    const res = await cloud.call('publishSchedule', { rows: rows });
    wx.hideLoading();
    if (res.code === 'OK') {
      wx.showToast({ title: '课表已发布', icon: 'success' });
      this.onShow();
    } else {
      wx.showToast({ title: res.msg || '保存失败', icon: 'none' });
    }
  }
});
