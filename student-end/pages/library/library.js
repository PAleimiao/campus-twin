// pages/library/library.js
const cloud = require('../../utils/cloud.js');

Page({
  data: {
    searchKey: '',
    currentTab: 'all',
    books: [],
    filteredBooks: []
  },

  onShow: function () {
    this.fetchBooks();
  },

  // 从后端拉取图书列表
  async fetchBooks() {
    wx.showLoading({ title: '加载中...' });
    // 1. 从本地缓存读取我借了哪些书
    var myBorrowedIds = wx.getStorageSync('myBorrowedIds') || [];
    
    // 2. 调后端拉取最新库存
    const res = await cloud.call('getBooks', {});
    wx.hideLoading();

    if (res.code === 'OK') {
      var allBooks = res.list || [];
      var visibleBooks = allBooks.filter(function(b) { return b.online === true; });
      
      // 3. 把本地记录和最新库存合并
      visibleBooks = visibleBooks.map(function(b) {
        return {
          id: b.id, title: b.title, author: b.author,
          category: b.category, cover: b.cover, stock: b.stock, online: b.online,
          isBorrowedByMe: myBorrowedIds.indexOf(b.id) !== -1
        };
      });
      
      this.setData({ books: visibleBooks });
      this.applyFilter(visibleBooks, this.data.currentTab, this.data.searchKey);
    } else {
      wx.showToast({ title: res.msg || '获取图书失败', icon: 'none' });
    }
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

  onTabChange: function (e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
    this.applyFilter(this.data.books, tab, this.data.searchKey);
  },

  applyFilter: function (list, tab, key) {
    var term = (key || '').trim().toLowerCase();
    var result = list.filter(function (b) {
      // 如果是“我的借阅”，只显示我借了的
      if (tab === 'borrowed' && !b.isBorrowedByMe) return false;
      
      if (term) {
        return b.title.toLowerCase().indexOf(term) !== -1 ||
               b.author.toLowerCase().indexOf(term) !== -1;
      }
      return true;
    });
    this.setData({ filteredBooks: result });
  },

  // 借阅图书
  onBorrowBook: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    
    wx.showModal({
      title: '借阅确认',
      content: '确定要借阅这本书吗？',
      confirmColor: '#FF6B9D',
      success: async function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '借阅中...' });
          // 调后端扣库存
          const apiRes = await cloud.call('borrowBook', { id: id });
          wx.hideLoading();

          if (apiRes.code === 'OK') {
            // 👇 把借阅记录存到本地缓存 👇
            var myBorrowedIds = wx.getStorageSync('myBorrowedIds') || [];
            if (myBorrowedIds.indexOf(id) === -1) {
              myBorrowedIds.push(id);
              wx.setStorageSync('myBorrowedIds', myBorrowedIds);
            }
            
            wx.showToast({ title: '借阅成功', icon: 'success' });
            that.fetchBooks(); // 重新拉取刷新界面
          } else {
            wx.showToast({ title: apiRes.msg || '借阅失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 归还图书
  onReturnBook: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    
    wx.showModal({
      title: '还书确认',
      content: '确定要归还这本书吗？',
      confirmColor: '#FF6B9D',
      success: async function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '还书中...' });
          // 调后端加库存
          const apiRes = await cloud.call('returnBook', { id: id });
          wx.hideLoading();

          if (apiRes.code === 'OK') {
            // 👇 从本地缓存里删掉借阅记录 👇
            var myBorrowedIds = wx.getStorageSync('myBorrowedIds') || [];
            myBorrowedIds = myBorrowedIds.filter(function(bid) { return bid != id; });
            wx.setStorageSync('myBorrowedIds', myBorrowedIds);
            
            wx.showToast({ title: '还书成功', icon: 'success' });
            that.fetchBooks(); // 重新拉取刷新界面
          } else {
            wx.showToast({ title: apiRes.msg || '还书失败', icon: 'none' });
          }
        }
      }
    });
  }
});