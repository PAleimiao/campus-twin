// pages/score/score.js —— 成绩查询
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');

Page({
  data: { theme: {}, list: [], avg: '', loading: true },

  onLoad() { this.setData({ theme: theme.getTheme() }); },

  async onShow() {
    this.setData({ theme: theme.getTheme() });
    const res = await cloud.call('listScores', {});
    if (res.code === 'OK') {
      const list = res.list || [];
      // 算个平均分（有数据才显示）
      let avg = '';
      if (list.length) {
        const sum = list.reduce((s, x) => s + Number(x.score || 0), 0);
        avg = (sum / list.length).toFixed(1);
      }
      this.setData({ list: list, avg: avg, loading: false });
    } else {
      this.setData({ loading: false });
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  }
});
