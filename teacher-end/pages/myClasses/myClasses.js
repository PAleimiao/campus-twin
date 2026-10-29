// pages/myClasses/myClasses.js
Page({
  data: {
    classes: [],
    currentClassId: null
  },

  onShow: function () {
    var classes = wx.getStorageSync('my_classes_v2');
    
    // 如果没有班级数据，就给几个默认的
    if (!classes || !classes.length) {
      classes = [
        { id: '1', name: '计应1班', emoji: '🌸' },
        { id: '2', name: '计应2班', emoji: '🌷' },
        { id: '3', name: '计应3班', emoji: '🌺' }
      ];
      wx.setStorageSync('my_classes_v2', classes);
    }

    // 去全局缓存里拿所有的学生，计算每个班的人数
    var allStudents = wx.getStorageSync('students') || [];

    var updatedClasses = classes.map(function (c) {
      var count = allStudents.filter(function (s) {
        return String(s.classId) === String(c.id);
      }).length;
      
      return {
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        studentCount: count
      };
    });

    this.setData({
      classes: updatedClasses,
      currentClassId: wx.getStorageSync('current_class_id_v1') || null
    });
  },

  // 点击班级进入管理
  onSelectClass(e) {
    var id = e.currentTarget.dataset.id;
    var cls = this.data.classes.find(function (c) { return c.id == id; });
    if (!cls) return;

    wx.setStorageSync('current_class_id_v1', id);
    wx.navigateTo({
      url: '/pages/classManage/classManage?classId=' + id + '&className=' + encodeURIComponent(cls.name)
    });
  },

  // 新建班级
  onAddClass: function () {
    var that = this;
    wx.showModal({
      title: '新建班级',
      editable: true,
      placeholderText: '请输入班级名称，如：计应4班',
      confirmColor: '#FF6B9D',
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var name = res.content.trim();
          
          var newClass = {
            id: Date.now().toString(),
            name: name,
            emoji: '🌸',
            studentCount: 0
          };

          var newList = that.data.classes.concat([newClass]);
          wx.setStorageSync('my_classes_v2', newList);
          
          that.onShow(); // 刷新页面
          wx.showToast({ title: '创建成功', icon: 'success' });
        }
      }
    });
  },

  // 👇 删除班级 👇
  onDeleteClass: function (e) {
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    var that = this;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + name + '」吗？该班学生也会一并移除。',
      confirmColor: '#FF6B9D',
      success: function (res) {
        if (res.confirm) {
          // 1. 删班级列表里的数据
          var newList = that.data.classes.filter(function (c) { 
            return String(c.id) !== String(id); 
          });
          wx.setStorageSync('my_classes_v2', newList);
          
          // 2. 顺便把该班的学生也清空
          var allStudents = wx.getStorageSync('students') || [];
          var remainingStudents = allStudents.filter(function (s) { 
            return String(s.classId) !== String(id); 
          });
          wx.setStorageSync('students', remainingStudents);

          // 3. 如果删的是当前选中的班级，把当前选中状态清空
          if (String(that.data.currentClassId) === String(id)) {
            wx.removeStorageSync('current_class_id_v1');
          }

          that.onShow();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  }
});