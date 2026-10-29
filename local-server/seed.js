// seed.js —— 初始化演示数据（命令行版，等价于云端的 seedOrg 云函数）
// 用法：
//   node seed.js          写入种子数据（已有数据则跳过）
//   node seed.js --reset  先清空 data/db.json 再重新写入
const fs = require('fs');
const path = require('path');
const handlers = require('./functions');
const lib = require('./lib');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

if (process.argv.includes('--reset')) {
  if (fs.existsSync(DB_FILE)) {
    fs.rmSync(DB_FILE);
    console.log('已清空 ' + DB_FILE);
  }
}

// ---- 组织树 + 账号 ----
handlers.seedOrg({ key: handlers.SEED_KEY }).then((res) => {
  console.log('');
  console.log(JSON.stringify(res, null, 2));
  console.log('');
  if (res.code === 'OK' || res.code === 'ALREADY_SEEDED') {
    seedDemoContent();
    console.log('演示账号（初始密码均为 123456，首次登录强制改密）：');
    console.log('  教师 T001 / 123456');
    console.log('  学生 20260001 张三 / 20260002 李四 / 20260003 王五');
    console.log('');
    console.log('已附赠演示数据：校园公告、本周课表、成绩、一条待审批请假。');
  }
  console.log('');
});

// ---- 业务演示数据（课表 / 成绩 / 公告 / 请假）----
function seedDemoContent() {
  const col = lib.collection;
  const now = () => new Date().toISOString();

  // 公告（全校可见）
  if (col('announcements').count() === 0) {
    col('announcements').insert({
      title: '关于 2026 年国庆假期安排的通知',
      content: '根据上级安排，国庆假期为 10 月 1 日至 10 月 7 日，共 7 天，10 月 8 日正常上课。假期外出请注意人身与财产安全。',
      scope: 'school', classId: '', collegeId: '', publisherId: '', publisherName: '演示老师', createdAt: now()
    });
    col('announcements').insert({
      title: '信息工程学院技能大赛报名开启',
      content: '「数创铸魂·码承文脉」小程序/移动应用开发大赛报名现已开启，截止 10 月 20 日，欢迎各班级同学组队参加。',
      scope: 'school', classId: '', collegeId: '', publisherId: '', publisherName: '演示老师', createdAt: now()
    });
  }

  const cls = col('classes').all()[0];

  // 课表
  if (cls && col('timetable').count() === 0) {
    const rows = [
      { courseName: '高等数学', teacherName: '李老师', weekday: 1, startPeriod: 1, endPeriod: 2, location: 'A101', semester: '2026秋' },
      { courseName: '程序设计基础', teacherName: '王老师', weekday: 1, startPeriod: 3, endPeriod: 4, location: '机房 B203', semester: '2026秋' },
      { courseName: '大学英语', teacherName: '张老师', weekday: 2, startPeriod: 1, endPeriod: 2, location: 'A205', semester: '2026秋' },
      { courseName: '网页设计', teacherName: '赵老师', weekday: 3, startPeriod: 3, endPeriod: 4, location: '机房 B203', semester: '2026秋' },
      { courseName: '体育', teacherName: '刘老师', weekday: 4, startPeriod: 5, endPeriod: 6, location: '操场', semester: '2026秋' },
      { courseName: '数据结构', teacherName: '王老师', weekday: 5, startPeriod: 1, endPeriod: 2, location: 'A302', semester: '2026秋' }
    ];
    rows.forEach(r => col('timetable').insert(Object.assign({ classId: cls._id }, r)));
  }

  // 成绩
  const students = col('students').all();
  if (col('scores').count() === 0) {
    const demo = { '20260001': [92, 88, 85], '20260002': [78, 82, 90], '20260003': [85, 76, 95] };
    const courses = ['高等数学', '程序设计基础', '大学英语'];
    students.forEach(s => {
      const arr = demo[s.studentNo] || [80, 80, 80];
      courses.forEach((c, i) => {
        col('scores').insert({
          studentId: s._id, studentNo: s.studentNo, name: s.name, classId: s.classId,
          courseName: c, score: arr[i], semester: '2026秋', teacherId: '', createdAt: now()
        });
      });
    });
  }

  // 一条待审批请假（张三）
  const zs = students.find(s => s.studentNo === '20260001');
  if (zs && col('leaves').count() === 0) {
    col('leaves').insert({
      studentId: zs._id, studentNo: zs.studentNo, name: zs.name, classId: zs.classId,
      type: '病假', reason: '感冒发烧，需回家休息一天。',
      start: '2026-10-13', end: '2026-10-13',
      status: 'pending', approveBy: '', approveAt: '', comment: '', createdAt: now()
    });
  }
}
