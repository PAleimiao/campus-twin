// pages/library/library.js —— 教师端
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    books: [],
    filteredBooks: [],
    searchKey: '',
    currentTab: 'all',
    onlineCount: 0,
    offlineCount: 0,
    showAddModal: false,
    newBook: {
      title: '',
      author: '',
      category: '',
      stock: ''
    }
  },

  onShow: function () {
    this.fetchBooks();
  },

  // 从后端拉取图书列表
  async fetchBooks() {
    wx.showLoading({ title: '加载中...' });
    const res = await cloud.call('getBooks', {});
    wx.hideLoading();

    if (res.code === 'OK') {
      var books = res.list || [];
      this.setData({ books: books });
      this.updateStats(books);
      this.applyFilter(books, this.data.currentTab, this.data.searchKey);
    } else {
      wx.showToast({ title: res.msg || '获取图书失败', icon: 'none' });
    }
  },

  updateStats: function (list) {
    var online = 0;
    list.forEach(function (b) { if (b.online) online++; });
    this.setData({
      onlineCount: online,
      offlineCount: list.length - online
    });
  },

  applyFilter: function (list, tab, key) {
    var term = (key || '').trim().toLowerCase();
    var result = list.filter(function (b) {
      // 标签过滤
      if (tab === 'online' && !b.online) return false;
      if (tab === 'offline' && b.online) return false;
      // 搜索过滤
      if (term) {
        return b.title.toLowerCase().indexOf(term) !== -1 ||
          b.author.toLowerCase().indexOf(term) !== -1;
      }
      return true;
    });
    this.setData({ filteredBooks: result });
  },

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.applyFilter(this.data.books, tab, this.data.searchKey);
  },

  onSearchInput: function (e) {
    var key = e.detail.value;
    this.setData({ searchKey: key });
    this.applyFilter(this.data.books, this.data.currentTab, key);
  },

  clearSearch: function () {
    this.setData({ searchKey: '' });
    this.applyFilter(this.data.books, this.data.currentTab, '');
  },

  // 上架/下架（调后端接口）
  async onToggleOnline(e) {
    var id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '处理中...' });
    const res = await cloud.call('toggleBookOnline', { id: id });
    wx.hideLoading();

    if (res.code === 'OK') {
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.fetchBooks(); // 重新拉取最新数据
    } else {
      wx.showToast({ title: res.msg || '操作失败', icon: 'none' });
    }
  },

  // 删除图书（调后端接口）
  onDeleteBook: function (e) {
    var id = e.currentTarget.dataset.id;
    var title = e.currentTarget.dataset.title;
    var that = this;
    wx.showModal({
      title: '删除图书',
      content: '确定要删除「' + title + '」吗？',
      confirmColor: '#FF6B9D',
      success: async function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          // 调后端删除接口
          const apiRes = await cloud.call('deleteBook', { id: id });
          wx.hideLoading();

          if (apiRes.code === 'OK') {
            wx.showToast({ title: '已删除', icon: 'success' });
            that.fetchBooks(); // 重新拉取
          } else {
            wx.showToast({ title: apiRes.msg || '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 添加图书弹窗控制
  onAddBook: function () {
    this.setData({
      showAddModal: true,
      newBook: { title: '', author: '', category: '', stock: '' }
    });
  },

  onTitleInput: function (e) {
    this.setData({ 'newBook.title': e.detail.value });
  },
  onAuthorInput: function (e) {
    this.setData({ 'newBook.author': e.detail.value });
  },
  onCategoryInput: function (e) {
    this.setData({ 'newBook.category': e.detail.value });
  },
  onStockInput: function (e) {
    this.setData({ 'newBook.stock': e.detail.value });
  },

  closeAddModal: function () {
    this.setData({ showAddModal: false });
  },

  // 确认添加图书
  async confirmAddBook() {
    var b = this.data.newBook;
    var title = (b.title || '').trim();
    if (!title) {
      wx.showToast({ title: '请输入书名', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    // 调后端添加接口
    const res = await cloud.call('addBook', {
      title: title,
      author: (b.author || '').trim() || '未知',
      category: (b.category || '').trim() || '未分类',
      stock: Number(b.stock) || 0
    });
    wx.hideLoading();

    if (res.code === 'OK') {
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ showAddModal: false });
      this.fetchBooks(); // 重新拉取数据
    } else {
      wx.showToast({ title: res.msg || '添加失败', icon: 'none' });
    }
  }
});