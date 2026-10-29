// pages/timetable/timetable.js —— 我的课表（WakeUp 风格 · 周视图网格）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

const WEEK = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 课程配色（同一门课固定同色）
const PALETTE = [
  { c: '#ff7eb6', bg: 'rgba(255,126,182,.16)', t: '#b8246a' },
  { c: '#7c6cff', bg: 'rgba(124,108,255,.16)', t: '#4b3fb0' },
  { c: '#3aa0ff', bg: 'rgba(58,160,255,.16)', t: '#1c6ab0' },
  { c: '#2bbf7a', bg: 'rgba(43,191,122,.16)', t: '#1a7a4d' },
  { c: '#ff8a3d', bg: 'rgba(255,138,61,.16)', t: '#b85812' },
  { c: '#9b6cff', bg: 'rgba(155,108,255,.16)', t: '#6a45b0' },
  { c: '#00b8d4', bg: 'rgba(0,184,212,.16)', t: '#00768a' },
  { c: '#f06292', bg: 'rgba(240,98,146,.16)', t: '#b0335f' }
];

// 网格尺寸（单位 rpx）
const GRID_W = 710;
const HEADER_H = 64;
const CELL_H = 104;
const LEFT_W = 52;

Page({
  data: {
    theme: {},
    loading: true,
    hasData: false,
    semester: '',
    headers: [], rowLabels: [], vlines: [], hlines: [], blocks: [],
    gridH: 600, gridW: GRID_W, leftW: LEFT_W, bodyW: GRID_W - LEFT_W
  },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listSchedule', {});
    if (res.code === 'OK') {
      const list = res.list || [];
      if (!list.length) {
        this.setData({ loading: false, hasData: false });
        return;
      }
      this.build(list);
    } else {
      this.setData({ loading: false, hasData: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  // 把课程列表排成周视图网格
  build(list) {
    // 最多节次
    let maxP = 0;
    list.forEach(t => { maxP = Math.max(maxP, Number(t.endPeriod) || 0); });
    if (maxP < 10) maxP = 10;

    // 用到星期几（至少显示周一到周五；有周末课才显示 7 列）
    let dayCount = 5;
    list.forEach(t => { dayCount = Math.max(dayCount, Number(t.weekday) || 0); });
    if (dayCount > 7) dayCount = 7;

    const colW = Math.floor((GRID_W - LEFT_W) / dayCount);

    // 今天（周日=7）
    const d = new Date().getDay();
    const today = d === 0 ? 7 : d;

    // 星期表头
    const headers = [];
    for (let i = 1; i <= dayCount; i++) {
      headers.push({
        name: WEEK[i - 1],
        left: LEFT_W + (i - 1) * colW,
        width: colW,
        isToday: i === today
      });
    }

    // 节次标签
    const rowLabels = [];
    for (let p = 1; p <= maxP; p++) {
      rowLabels.push({ text: '第' + p + '节', top: HEADER_H + (p - 1) * CELL_H, height: CELL_H });
    }

    // 网格线
    const vlines = [];
    for (let i = 0; i <= dayCount; i++) vlines.push({ left: LEFT_W + i * colW });
    const hlines = [];
    for (let p = 0; p <= maxP; p++) hlines.push({ top: HEADER_H + p * CELL_H });

    // 课程块
    const colorOf = {};
    let ci = 0;
    const blocks = [];
    list.forEach(t => {
      const name = t.courseName || '课程';
      if (!(name in colorOf)) { colorOf[name] = PALETTE[ci % PALETTE.length]; ci++; }
      const col = colorOf[name];
      const w = Number(t.weekday) || 1;
      const sp = Number(t.startPeriod) || 1;
      const ep = Math.max(sp, Number(t.endPeriod) || sp);
      blocks.push({
        name: name,
        loc: t.location || '',
        teacher: t.teacherName || '',
        left: LEFT_W + (w - 1) * colW + 2,
        top: HEADER_H + (sp - 1) * CELL_H + 2,
        width: colW - 4,
        height: (ep - sp + 1) * CELL_H - 4,
        bg: col.bg,
        border: col.c,
        text: col.t
      });
    });

    const semester = (list[0] && list[0].semester) ? list[0].semester : '';
    this.setData({
      loading: false,
      hasData: true,
      semester: semester,
      headers: headers,
      rowLabels: rowLabels,
      vlines: vlines,
      hlines: hlines,
      blocks: blocks,
      gridH: HEADER_H + maxP * CELL_H,
      bodyW: GRID_W - LEFT_W
    });
  }
});
