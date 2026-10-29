// pages/classManage/classManage.js
Page({
  data: {
    allClasses: [],       // 下拉框用的班级列表
    classId: null,        // 当前班级ID
    className: '班级',    // 当前班级名称
    searchKey: '',
    students: [],
    filteredStudents: [],
    showAddModal: false,
    newStudentName: ''
  },

  onLoad: function (options) {
    var classId = options.classId || 'default';
    var className = options.className ? decodeURIComponent(options.className) : '我的班级';

    // 去缓存里把所有班级拿出来，塞给下拉框
    var allClasses = wx.getStorageSync('my_classes_v2') || [
      { id: '1', name: '计应1班' },
      { id: '2', name: '计应2班' },
      { id: '3', name: '计应3班' }
    ];

    this.setData({
      classId: classId,
      className: className,
      allClasses: allClasses 
    });

    this.loadStudents();
  },

  // 阻止弹窗点击冒泡（给弹窗用的）
  noop: function () {},

  // 读取学生数据
  loadStudents: function () {
    var allStudents = wx.getStorageSync('students') || [];
    var list = allStudents.filter(function (s) {
      return String(s.classId) === String(this.data.classId);
    }.bind(this));

    this.setData({
      students: list,
      filteredStudents: list
    });
  },

  // 保存学生数据
  saveToGlobal: function (newClassList) {
    var allStudents = wx.getStorageSync('students') || [];
    allStudents = allStudents.filter(function (s) {
      return String(s.classId) !== String(this.data.classId);
    }.bind(this));
    allStudents = allStudents.concat(newClassList);
    wx.setStorageSync('students', allStudents);
  },

  // 👇 你之前问的：下拉切换班级的方法 👇
  onSwitchClass: function (e) {
    var index = e.detail.value;
    var cls = this.data.allClasses[index];
    if (!cls) return;

    this.setData({
      classId: cls.id,
      className: cls.name
    });
    this.loadStudents();
    wx.setStorageSync('current_class_id_v1', cls.id);
  },

  onSearchInput: function (e) {
    var key = e.detail.value;
    this.setData({ searchKey: key });
    this.filterList(key);
  },

  clearSearch: function () {
    this.setData({ searchKey: '' });
    this.filterList('');
  },

  filterList: function (key) {
    var term = key.trim().toLowerCase();
    if (!term) {
      this.setData({ filteredStudents: this.data.students });
      return;
    }
    var result = this.data.students.filter(function (s) {
      return s.name.toLowerCase().indexOf(term) !== -1;
    });
    this.setData({ filteredStudents: result });
  },

  // 添加学生弹窗
  onAddStudent: function () {
    this.setData({ showAddModal: true, newStudentName: '' });
  },

  onNewNameInput: function (e) {
    this.setData({ newStudentName: e.detail.value });
  },

  closeAddModal: function () {
    this.setData({ showAddModal: false });
  },

  confirmAddStudent: function () {
    var name = (this.data.newStudentName || '').trim();
    if (!name) return wx.showToast({ title: '请输入姓名', icon: 'none' });
    
    var newStudent = {
      id: Date.now().toString(),
      name: name, age: 18, gender: '未知', hobby: '待填写',
      tag: '新同学', avatarText: name.charAt(name.length - 1), classId: this.data.classId
    };

    var newList = this.data.students.concat([newStudent]);
    this.saveToGlobal(newList);
    this.setData({ students: newList, filteredStudents: newList, showAddModal: false, newStudentName: '' });
    wx.showToast({ title: '添加成功', icon: 'success' });
  },

  // 导入表格
  onImportCSV: function () {
    var that = this;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['csv'],
      success: function (res) {
        var file = res.tempFiles[0];
        if (!file.name.endsWith('.csv')) {
          return wx.showToast({ title: '请选择 .csv 格式', icon: 'none' });
        }

        wx.showLoading({ title: '读取中...' });
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: function (fileRes) {
            wx.hideLoading();
            var lines = fileRes.data.split('\n');
            var newStudents = [];

            for (var i = 1; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line) continue;
              
              var cols = line.split(',');
              var name = cols[0] ? cols[0].trim() : '';
              var age = cols[1] ? Number(cols[1].trim()) : 18;
              var gender = cols[2] ? cols[2].trim() : '未知';
              
              if (name) {
                newStudents.push({
                  id: Date.now() + Math.random() + '',
                  name: name, age: isNaN(age) ? 18 : age, gender: gender,
                  tag: '新同学', classId: that.data.classId,
                  avatarText: name.charAt(name.length - 1), hobby: '待填写'
                });
              }
            }

            if (newStudents.length === 0) {
              return wx.showToast({ title: '表格数据为空', icon: 'none' });
            }

            var newList = that.data.students.concat(newStudents);
            that.saveToGlobal(newList);
            that.setData({ students: newList, filteredStudents: newList });
            wx.showToast({ title: '导入 ' + newStudents.length + ' 人', icon: 'success' });
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({ title: '读取失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 删除
  onDeleteStudent: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: '确认删除', content: '确定删除吗？', confirmColor: '#FF6B9D',
      success: function (res) {
        if (res.confirm) {
          var newList = that.data.students.filter(function (s) { return String(s.id) !== String(id); });
          that.saveToGlobal(newList);
          that.setData({ students: newList, filteredStudents: newList });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 修改
  onEditStudent: function (e) {
    var id = e.currentTarget.dataset.id;
    var student = this.data.students.find(function (s) { return String(s.id) === String(id); });
    if (!student) return;
    var that = this;
    wx.showModal({
      title: '修改姓名', editable: true, placeholderText: '请输入新姓名', content: student.name,
      success: function (res) {
        if (res.confirm && res.content && res.content.trim()) {
          var newName = res.content.trim();
          var newList = that.data.students.map(function (s) {
            if (String(s.id) === String(id)) {
              return { id: s.id, name: newName, age: s.age, gender: s.gender, hobby: s.hobby, tag: s.tag, avatarText: newName.charAt(newName.length - 1), classId: s.classId };
            }
            return s;
          });
          that.saveToGlobal(newList);
          that.setData({ students: newList, filteredStudents: newList });
          wx.showToast({ title: '修改成功', icon: 'success' });
        }
      }
    });
  }
});