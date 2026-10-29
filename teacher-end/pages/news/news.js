// pages/news/news.js —— 教师端「校园资讯」管理页
// 远程维护学生端首页的：顶部轮播图 + 资讯列表（本地模式存 data/db.json，云开发模式存云数据库 news 集合）
const cloud = require('../../utils/cloud.js');
const theme = require('../../utils/theme.js');
const config = require('../../config.js');

Page({
  data: {
    theme: {},
    banners: [],        // 轮播图列表
    articles: [],       // 资讯列表
    title: '',          // 新增资讯标题
    date: '',           // 新增资讯日期
    content: '',        // 新增资讯正文
    bannerImg: '',      // 待添加的轮播图（图片地址：本地 http:// 或云端 cloud://）
    articleImg: ''      // 待添加的资讯配图（可选）
  },

  onLoad() { this.setData({ theme: theme.getTheme() }); },
  onShow() { this.load(); },

  // 拉取全部资讯记录
  async load() {
    const res = await cloud.call('manageNews', { action: 'listAll' });
    if (res.code === 'OK') {
      const items = res.items || [];
      this.setData({
        banners: items.filter(d => d.type === 'banner'),
        articles: items.filter(d => d.type === 'article')
      });
    } else {
      wx.showToast({ title: res.msg || '加载失败', icon: 'none' });
    }
  },

  // 选一张图并上传，成功后回调「可直接塞进 image 字段的字符串」
  //   backend='local' → wx.uploadFile 打本地服务，得到 http://<host>/uploads/xxx.png
  //   backend='cloud' → wx.cloud.uploadFile 传云存储，得到 cloud://... 的 fileID
  // 两种返回值都能直接当图片地址用，所以下面的 addBanner / addArticle 一行都不用改。
  chooseUpload(cb) {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (r) => {
        const file = r.tempFiles[0];
        wx.showLoading({ title: '上传中...' });

        const done = (image) => {
          wx.hideLoading();
          cb(image);
        };
        const fail = (e) => {
          wx.hideLoading();
          console.warn('[news] 上传失败：', e);
          wx.showToast({ title: '上传失败', icon: 'none' });
        };

        if (cloud.isCloudMode()) {
          wx.cloud.uploadFile({
            cloudPath: 'news/' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.png',
            filePath: file.tempFilePath
          }).then((up) => done(up.fileID)).catch(fail);
          return;
        }

        wx.uploadFile({
          url: String(config.apiBase || '').replace(/\/+$/, '') + '/upload',
          filePath: file.tempFilePath,
          name: 'file',
          // 本地服务的上传接口要校验教师身份
          formData: { token: wx.getStorageSync('token') || '' },
          success: (res) => {
            let result = {};
            try {
              result = JSON.parse(res.data);
            } catch (e) {
              result = { code: 'BAD_RESPONSE', msg: '服务端返回无法解析' };
            }
            if (result.code === 'OK' && (result.fileID || result.url)) {
              return done(result.fileID || result.url);
            }
            // 登录态失效：回登录页
            if (result.code === 'AUTH_FAIL' || result.code === 'TOKEN_EXPIRED' || result.code === 'NO_TOKEN') {
              wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
              setTimeout(() => wx.reLaunch({ url: '/pages/login/login' }), 800);
              return;
            }
            wx.showToast({ title: result.msg || '上传失败', icon: 'none' });
          },
          fail: fail
        });
      }
    });
  },

  pickBanner() { this.chooseUpload(id => this.setData({ bannerImg: id })); },
  pickArticleImg() { this.chooseUpload(id => this.setData({ articleImg: id })); },

  // 添加轮播图
  async addBanner() {
    if (!this.data.bannerImg) {
      wx.showToast({ title: '请先选择图片', icon: 'none' }); return;
    }
    const res = await cloud.call('manageNews', { action: 'addBanner', image: this.data.bannerImg });
    if (res.code === 'OK') {
      this.setData({ bannerImg: '' });
      wx.showToast({ title: '已添加轮播图', icon: 'none' });
      this.load();
    } else {
      wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
    }
  },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onDate(e) { this.setData({ date: e.detail.value }); },
  onContent(e) { this.setData({ content: e.detail.value }); },

  // 添加资讯
  async addArticle() {
    const title = this.data.title.trim();
    if (!title) { wx.showToast({ title: '请填写标题', icon: 'none' }); return; }
    const res = await cloud.call('manageNews', {
      action: 'addArticle',
      title: title,
      date: this.data.date,
      content: this.data.content,
      image: this.data.articleImg
    });
    if (res.code === 'OK') {
      this.setData({ title: '', date: '', content: '', articleImg: '' });
      wx.showToast({ title: '已添加资讯', icon: 'none' });
      this.load();
    } else {
      wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
    }
  },

  // 删除某条
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除',
      content: '确定删除这条资讯吗？',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await cloud.call('manageNews', { action: 'delete', id: id });
        if (res.code === 'OK') {
          wx.showToast({ title: '已删除', icon: 'none' });
          this.load();
        } else {
          wx.showToast({ title: res.msg || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
