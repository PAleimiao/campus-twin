// pages/news-detail/news-detail.js —— 校园资讯详情
const theme = require('../../utils/theme.js');

Page({
  data: { theme: {}, item: {} },

  onLoad() {
    // 列表页把这条资讯存进了 storage，这里读出来展示
    this.setData({
      theme: theme.getTheme(),
      item: wx.getStorageSync('newsDetail') || {}
    });
  }
});
