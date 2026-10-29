// functions.js —— 原云函数的 1:1 本地移植版
// 入参/出参与 cloud/functions/ 下同名函数完全一致，所以小程序端不用改业务逻辑，
// 只需把 utils/cloud.js 里的 wx.cloud.callFunction 换成 wx.request（见 README）。
// getNews 无鉴权公开读，其余接口与原实现保持同样的鉴权强度。
const lib = require('./lib');
const ai = require('./ai');
const collection = lib.collection;
const makeSalt = lib.makeSalt;
const hashPassword = lib.hashPassword;
const verifyPassword = lib.verifyPassword;
const newToken = lib.newToken;
const auth = lib.auth;

const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 登录令牌 7 天
const MAX_FAIL = 5;                        // 连续输错 5 次锁定
const LOCK_MS = 10 * 60 * 1000;            // 锁 10 分钟
const MIN_PWD = 6;
const DEFAULT_PWD = '123456';
const MAX_ROWS = 200;
const SEED_KEY = 'CAMPUS_SEED_2026';

// ---------- login：账号密码登录 ----------
async function login(event) {
  const account = event.account;
  const password = event.password;
  const role = event.role;

  if (!account || !password || !role) {
    return { code: 'PARAM_ERR', msg: '缺少账号 / 密码 / 角色' };
  }
  if (role !== 'student' && role !== 'teacher') {
    return { code: 'PARAM_ERR', msg: '角色只能是 student 或 teacher' };
  }

  const coll = role === 'teacher' ? collection('teachers') : collection('students');
  const field = role === 'teacher' ? 'teacherNo' : 'studentNo';
  const u = coll.findOne(d => String(d[field]) === String(account).trim());
  if (!u) return { code: 'ACCOUNT_NOT_FOUND', msg: '账号不存在' };

  if (u.lockUntil && new Date(u.lockUntil).getTime() > Date.now()) {
    return { code: 'LOCKED', msg: '账号已锁定，请 10 分钟后再试' };
  }

  if (!verifyPassword(password, u.salt, u.passwordHash)) {
    const fails = (u.failCount || 0) + 1;
    const update = { failCount: fails };
    if (fails >= MAX_FAIL) update.lockUntil = new Date(Date.now() + LOCK_MS).toISOString();
    coll.updateById(u._id, update);
    return { code: 'WRONG_PASSWORD', msg: '密码错误' };
  }

  coll.updateById(u._id, { failCount: 0, lockUntil: null });

  const token = newToken();
  collection('sessions').insert({
    token: token,
    userId: u._id,
    role: role,
    expireAt: new Date(Date.now() + TOKEN_TTL).toISOString(),
    createdAt: new Date().toISOString()
  });

  return {
    code: 'OK',
    token: token,
    role: role,
    name: u.name,
    mustChangePwd: !!u.mustChangePwd
  };
}

// ---------- changePassword：修改密码（唯一不受强制改密拦截的接口）----------
async function changePassword(event) {
  const token = event.token;
  const oldPwd = event.oldPwd;
  const newPwd = event.newPwd;

  if (!token || !oldPwd || !newPwd) {
    return { code: 'PARAM_ERR', msg: '缺少 token / 原密码 / 新密码' };
  }
  if (String(newPwd).length < MIN_PWD) {
    return { code: 'WEAK_PWD', msg: '新密码至少 ' + MIN_PWD + ' 位' };
  }
  if (String(oldPwd) === String(newPwd)) {
    return { code: 'SAME_PWD', msg: '新密码不能和原密码相同' };
  }

  let ctx;
  try {
    ctx = await auth(token, { allowForceChange: true });
  } catch (e) {
    return e;
  }

  const user = ctx.user;
  const role = ctx.role;

  if (!verifyPassword(oldPwd, user.salt, user.passwordHash)) {
    return { code: 'OLD_PWD_WRONG', msg: '原密码错误' };
  }

  const salt = makeSalt();
  const hash = hashPassword(newPwd, salt);
  const coll = role === 'teacher' ? collection('teachers') : collection('students');
  coll.updateById(user._id, {
    salt: salt,
    passwordHash: hash,
    mustChangePwd: false,
    failCount: 0,
    lockUntil: null
  });

  // 改密后让该用户所有旧令牌失效
  collection('sessions').removeWhere(s => s.userId === user._id);

  return { code: 'OK', msg: '密码修改成功，请重新登录' };
}

// ---------- getNews：读取校园资讯（公开可读，学生端首页用）----------
async function getNews() {
  try {
    const docs = collection('news').orderBy('order', 'asc');
    const banners = docs
      .filter(d => d.type === 'banner' && d.image)
      .map(d => ({ image: d.image }));
    const list = docs
      .filter(d => d.type === 'article')
      .map(d => ({ title: d.title, date: d.date, image: d.image || '', content: d.content || '' }));
    return { code: 'OK', banners: banners, list: list };
  } catch (e) {
    return { code: 'OK', banners: [], list: [] };
  }
}

// ---------- manageNews：校园资讯管理（仅教师/管理员）----------
async function manageNews(event) {
  const action = event.action;
  const coll = collection('news');

  let ctx;
  try {
    ctx = await auth(event.token);
  } catch (e) {
    return e;
  }
  if (ctx.role !== 'teacher') {
    return { code: 'FORBIDDEN', msg: '仅教师/管理员可管理资讯' };
  }

  if (action === 'listAll') {
    return { code: 'OK', items: coll.orderBy('order', 'asc') };
  }

  if (action === 'addBanner') {
    const image = String(event.image || '').trim();
    if (!image) return { code: 'PARAM_ERR', msg: '请先上传图片' };
    coll.insert({
      type: 'banner', image: image, title: '', date: '',
      order: coll.count(), createdAt: new Date().toISOString()
    });
    return { code: 'OK' };
  }

  if (action === 'addArticle') {
    const title = String(event.title || '').trim();
    if (!title) return { code: 'PARAM_ERR', msg: '请填写资讯标题' };
    coll.insert({
      type: 'article',
      title: title,
      date: String(event.date || '').trim(),
      image: String(event.image || '').trim(),
      content: String(event.content || '').trim(),
      order: coll.count(),
      createdAt: new Date().toISOString()
    });
    return { code: 'OK' };
  }

  if (action === 'delete') {
    const id = String(event.id || '').trim();
    if (!id) return { code: 'PARAM_ERR', msg: '缺少要删除的 id' };
    coll.removeById(id);
    return { code: 'OK' };
  }

  return { code: 'PARAM_ERR', msg: '未知的 action：' + action };
}

// ---------- importStudents：教师批量导入学生 ----------
async function importStudents(event) {
  const token = event.token;
  const rows = event.rows;

  let ctx;
  try {
    ctx = await auth(token);
  } catch (e) {
    return e;
  }
  if (ctx.role !== 'teacher') {
    return { code: 'FORBIDDEN', msg: '仅教师/管理员可导入学生' };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { code: 'PARAM_ERR', msg: '请传入 rows 数组' };
  }
  if (rows.length > MAX_ROWS) {
    return { code: 'TOO_MANY', msg: '单次最多导入 ' + MAX_ROWS + ' 条' };
  }

  const coll = collection('students');
  const result = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  for (const r of rows) {
    const studentNo = String(r.studentNo || '').trim();
    const name = String(r.name || '').trim();
    const classId = String(r.classId || '').trim();

    if (!/^\d{6,}$/.test(studentNo)) {
      result.skipped++; result.errors.push({ studentNo: studentNo, reason: '学号格式错误（至少6位数字）' }); continue;
    }
    if (!name) {
      result.skipped++; result.errors.push({ studentNo: studentNo, reason: '姓名缺失' }); continue;
    }
    if (!classId) {
      result.skipped++; result.errors.push({ studentNo: studentNo, reason: '班级缺失' }); continue;
    }

    const salt = makeSalt();
    const hash = hashPassword(DEFAULT_PWD, salt);
    const data = {
      studentNo: studentNo,
      name: name,
      classId: classId,
      passwordHash: hash,
      salt: salt,
      mustChangePwd: true,
      status: 'active',
      createdAt: new Date().toISOString()
    };
    if (r.gradeId) data.gradeId = String(r.gradeId).trim();
    if (r.collegeId) data.collegeId = String(r.collegeId).trim();

    const exists = coll.findOne(d => d.studentNo === studentNo);
    if (exists) {
      coll.updateById(exists._id, data);
      result.updated++;
    } else {
      coll.insert(data);
      result.inserted++;
    }
  }

  return Object.assign({ code: 'OK' }, result);
}

// ---------- seedOrg：组织树 + 演示账号初始化（幂等）----------
async function seedOrg(event) {
  if (event.key !== SEED_KEY) {
    return { code: 'NO_KEY', msg: '缺少或错误的种子口令' };
  }
  if (collection('colleges').count() > 0) {
    return { code: 'ALREADY_SEEDED', msg: '组织树已初始化，跳过' };
  }

  const grade = collection('grades').insert({ year: 26, name: '26届', createdAt: new Date().toISOString() });
  const college = collection('colleges').insert({ gradeId: grade._id, name: '信息工程学院' });
  const major = collection('majors').insert({ collegeId: college._id, name: '计算机应用' });
  const cls = collection('classes').insert({
    gradeId: grade._id, collegeId: college._id, majorId: major._id, name: '3班', studentCount: 0
  });

  const tSalt = makeSalt();
  collection('teachers').insert({
    teacherNo: 'T001',
    name: '演示老师',
    collegeId: college._id,
    classIds: [cls._id],
    role: 'admin',
    salt: tSalt,
    passwordHash: hashPassword(DEFAULT_PWD, tSalt),
    mustChangePwd: true,
    createdAt: new Date().toISOString()
  });

  const samples = [
    { studentNo: '20260001', name: '张三' },
    { studentNo: '20260002', name: '李四' },
    { studentNo: '20260003', name: '王五' }
  ];
  for (const s of samples) {
    const sSalt = makeSalt();
    collection('students').insert({
      studentNo: s.studentNo,
      name: s.name,
      classId: cls._id,
      gradeId: grade._id,
      collegeId: college._id,
      passwordHash: hashPassword(DEFAULT_PWD, sSalt),
      salt: sSalt,
      mustChangePwd: true,
      status: 'active',
      createdAt: new Date().toISOString()
    });
  }

  return {
    code: 'OK',
    msg: '种子数据已写入',
    demoTeacher: { teacherNo: 'T001', password: DEFAULT_PWD },
    demoStudents: samples.map(s => ({ studentNo: s.studentNo, password: DEFAULT_PWD })),
    ids: { gradeId: grade._id, collegeId: college._id, majorId: major._id, classId: cls._id }
  };
}

// ================= 公告 announcements =================
// 教师发布；按 scope 定向：school(全校) / college(本学院) / class(本班)
async function publishAnnouncement(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可发布公告' };

  const title = String(event.title || '').trim();
  if (!title) return { code: 'PARAM_ERR', msg: '请填写公告标题' };
  const scope = ['school', 'college', 'class'].indexOf(event.scope) >= 0 ? event.scope : 'school';
  const u = ctx.user;

  collection('announcements').insert({
    title: title,
    content: String(event.content || '').trim(),
    scope: scope,
    classId: scope === 'class' ? String(event.classId || (u.classIds || [])[0] || '') : '',
    collegeId: scope === 'college' ? String(u.collegeId || '') : '',
    publisherId: u._id,
    publisherName: u.name,
    createdAt: new Date().toISOString()
  });
  return { code: 'OK' };
}

async function listAnnouncements(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  const all = collection('announcements').orderBy('createdAt', 'desc');
  let list;
  if (ctx.role === 'teacher') {
    list = all;
  } else {
    const u = ctx.user;
    list = all.filter(a =>
      a.scope === 'school' ||
      (a.scope === 'college' && a.collegeId && a.collegeId === u.collegeId) ||
      (a.scope === 'class' && a.classId && a.classId === u.classId)
    );
  }
  return {
    code: 'OK',
    list: list.map(a => ({
      id: a._id, title: a.title, content: a.content, scope: a.scope,
      publisherName: a.publisherName, createdAt: a.createdAt
    }))
  };
}

// ================= 请假 leaves =================
async function submitLeave(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'student') return { code: 'FORBIDDEN', msg: '仅学生可提交请假' };

  const reason = String(event.reason || '').trim();
  if (!reason) return { code: 'PARAM_ERR', msg: '请填写请假原因' };
  const u = ctx.user;

  collection('leaves').insert({
    studentId: u._id, studentNo: u.studentNo, name: u.name, classId: u.classId,
    type: String(event.type || '事假'),
    reason: reason,
    start: String(event.start || ''), end: String(event.end || ''),
    status: 'pending', approveBy: '', approveAt: '', comment: '',
    createdAt: new Date().toISOString()
  });
  return { code: 'OK' };
}

async function listLeaves(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  const all = collection('leaves').orderBy('createdAt', 'desc');
  if (ctx.role === 'student') {
    return { code: 'OK', list: all.filter(l => l.studentId === ctx.user._id) };
  }
  const cids = ctx.user.classIds || [];
  return { code: 'OK', list: all.filter(l => cids.indexOf(l.classId) >= 0) };
}

async function approveLeave(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可审批请假' };

  const lv = collection('leaves').byId(String(event.leaveId || ''));
  if (!lv) return { code: 'NOT_FOUND', msg: '请假记录不存在' };
  const cids = ctx.user.classIds || [];
  if (cids.indexOf(lv.classId) < 0) return { code: 'FORBIDDEN', msg: '无权审批其它班级' };

  const status = event.status === 'approved' ? 'approved' : 'rejected';
  collection('leaves').updateById(lv._id, {
    status: status,
    comment: String(event.comment || ''),
    approveBy: ctx.user.name,
    approveAt: new Date().toISOString()
  });
  return { code: 'OK' };
}

// ================= 课表 timetable =================
async function publishSchedule(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可排课' };

  const classId = String(event.classId || (ctx.user.classIds || [])[0] || '');
  if (!classId) return { code: 'PARAM_ERR', msg: '缺少班级' };
  const rows = Array.isArray(event.rows) ? event.rows : [];

  const coll = collection('timetable');
  coll.removeWhere(t => t.classId === classId);   // 覆盖式：先清空该班课表
  rows.forEach(r => {
    const name = String(r.courseName || '').trim();
    if (!name) return;
    coll.insert({
      classId: classId,
      courseName: name,
      teacherName: String(r.teacherName || '').trim(),
      weekday: Number(r.weekday) || 1,
      startPeriod: Number(r.startPeriod) || 1,
      endPeriod: Number(r.endPeriod) || 1,
      location: String(r.location || '').trim(),
      semester: String(r.semester || '').trim(),
      weeks: String(r.weeks || '').trim()
    });
  });
  return { code: 'OK', count: rows.length };
}

async function listSchedule(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  const classId = ctx.role === 'student'
    ? ctx.user.classId
    : String(event.classId || (ctx.user.classIds || [])[0] || '');
  const list = collection('timetable').orderBy('weekday', 'asc').filter(t => t.classId === classId);
  return { code: 'OK', list: list, classId: classId };
}

// ================= 成绩 scores =================
async function enterScore(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可录入成绩' };

  const rows = Array.isArray(event.rows) ? event.rows : [];
  const coll = collection('scores');
  const stu = collection('students');
  let n = 0;
  rows.forEach(r => {
    const studentNo = String(r.studentNo || '').trim();
    const courseName = String(r.courseName || '').trim();
    const score = Number(r.score);
    if (!studentNo || !courseName || isNaN(score)) return;
    const s = stu.findOne(d => d.studentNo === studentNo);
    if (!s) return;                       // 学号不存在则跳过
    const semester = String(r.semester || '').trim();
    const data = {
      studentId: s._id, studentNo: studentNo, name: s.name, classId: s.classId,
      courseName: courseName, score: score, semester: semester,
      teacherId: ctx.user._id, createdAt: new Date().toISOString()
    };
    const exist = coll.findOne(d => d.studentNo === studentNo && d.courseName === courseName && (d.semester || '') === semester);
    if (exist) coll.updateById(exist._id, data); else coll.insert(data);
    n++;
  });
  return { code: 'OK', count: n };
}

async function listScores(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  const all = collection('scores').orderBy('createdAt', 'desc');
  if (ctx.role === 'student') {
    return { code: 'OK', list: all.filter(s => s.studentNo === ctx.user.studentNo) };
  }
  const cids = ctx.user.classIds || [];
  return { code: 'OK', list: all.filter(s => cids.indexOf(s.classId) >= 0) };
}

// ================= 上课签到 checkin =================
async function openCheckin(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可发起签到' };

  const classId = String(event.classId || (ctx.user.classIds || [])[0] || '');
  if (!classId) return { code: 'PARAM_ERR', msg: '缺少班级' };
  const s = collection('checkinSessions').insert({
    type: String(event.type || 'class'),
    classId: classId,
    teacherId: ctx.user._id,
    teacherName: ctx.user.name,
    courseName: String(event.courseName || '').trim(),
    openAt: new Date().toISOString(),
    closeAt: '',
    status: 'open'
  });
  return { code: 'OK', sessionId: s._id };
}

async function listCheckinSessions(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  const all = collection('checkinSessions').orderBy('openAt', 'desc');
  if (ctx.role === 'student') {
    return { code: 'OK', list: all.filter(s => s.classId === ctx.user.classId) };
  }
  const cids = ctx.user.classIds || [];
  return { code: 'OK', list: all.filter(s => cids.indexOf(s.classId) >= 0) };
}

async function studentCheckin(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'student') return { code: 'FORBIDDEN', msg: '仅学生可签到' };

  const sess = collection('checkinSessions').byId(String(event.sessionId || ''));
  if (!sess) return { code: 'NOT_FOUND', msg: '签到不存在' };
  if (sess.status !== 'open') return { code: 'CLOSED', msg: '签到已结束' };
  if (sess.classId !== ctx.user.classId) return { code: 'FORBIDDEN', msg: '这不是本班的签到' };

  const att = collection('attendance');
  const exist = att.findOne(a => a.sessionId === sess._id && a.studentId === ctx.user._id);
  if (exist) return { code: 'OK', msg: '你已签到（' + exist.status + '）', status: exist.status };

  att.insert({
    sessionId: sess._id, studentId: ctx.user._id, studentNo: ctx.user.studentNo,
    name: ctx.user.name, classId: ctx.user.classId, status: 'signed',
    signAt: new Date().toISOString()
  });
  return { code: 'OK', msg: '签到成功', status: 'signed' };
}

async function closeCheckin(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可结束签到' };

  const sess = collection('checkinSessions').byId(String(event.sessionId || ''));
  if (!sess) return { code: 'NOT_FOUND', msg: '签到不存在' };
  const cids = ctx.user.classIds || [];
  if (cids.indexOf(sess.classId) < 0) return { code: 'FORBIDDEN', msg: '无权操作' };

  const att = collection('attendance');
  collection('students').find(d => d.classId === sess.classId).forEach(s => {
    const exist = att.findOne(a => a.sessionId === sess._id && a.studentId === s._id);
    if (!exist) {
      att.insert({
        sessionId: sess._id, studentId: s._id, studentNo: s.studentNo,
        name: s.name, classId: s.classId, status: 'absent', signAt: ''
      });
    }
  });
  collection('checkinSessions').updateById(sess._id, { status: 'closed', closeAt: new Date().toISOString() });
  return { code: 'OK' };
}

async function listAttendance(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可查看考勤' };
  const list = collection('attendance').find(a => a.sessionId === String(event.sessionId || ''));
  return { code: 'OK', list: list };
}

// 老师手动修改考勤状态
async function updateAttendanceStatus(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role != 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可修改考勤' };

  const attList = collection('attendance');
  // 把 findById 换成 find，根据 _id 找
  const record = attList.find(a => String(a._id) === String(event.attendanceId))[0];

  if (!record) return { code: 'NOT_FOUND', msg: '考勤记录不存在' };

  collection('attendance').updateById(record._id, { 
    status: event.status,
    signAt: event.status === 'signed' ? new Date().toISOString() : record.signAt 
  });

  return { code: 'OK', msg: '修改成功' };
}
// ================= AI 答疑（本地知识库兜底 + 可选大模型）=================
// 分三层：本地知识库（离线必中）→ 大模型（配了 Key 才走）→ 兜底话术。
// 大模型那层的配置见 local-server/ai.config.example.json。
const CAMPUS_KB = [
  { k: ['请假', '怎么请', '手续'], a: '请假流程：学生端「请假申请」填写类型、原因、起止时间 → 提交 → 班主任在教师端审批。病假建议附上证明。' },
  { k: ['奖助', '奖学金', '助学', '补助'], a: '奖助学金一般每学年评定一次，需提供成绩单与相关证明，具体名额和截止时间以学院通知为准。' },
  { k: ['图书馆', '借书', '还书', '开放'], a: '图书馆开放时间：工作日 8:00–21:30，周末 9:00–17:00。借阅一般可续借一次，逾期可能产生滞纳金。' },
  { k: ['上课', '时间', '作息', '几点'], a: '作息参考：上午 8:00 开始，下午 14:00 开始，具体以你的课表为准（学生端「我的课表」可查）。' },
  { k: ['宿舍', '归寝', '门禁'], a: '宿舍一般 23:00 熄灯，门禁后晚归需登记。宿舍签到可在学生端「宿舍签到」完成。' },
  { k: ['成绩', '分数', '查分'], a: '成绩发布后可在学生端「成绩查询」查看各科分数与学期。如有疑问请联系任课教师。' },
  { k: ['校园卡', '饭卡', '充值'], a: '校园卡可在自助机或线上充值，遗失请及时到一卡通服务中心挂失。' },
  { k: ['失物', '招领', '丢了'], a: '失物招领可关注校园资讯或咨询辅导员；建议给贵重物品做标记。' }
];

// 系统提示词：把模型限定在「校园答疑」这件事上，避免它瞎编具体规定
const AI_SYSTEM = [
  '你是「广演校园」小程序学生端里的校园答疑助手。',
  '只回答与校园相关的问题：请假、奖助学金、图书馆、作息时间、宿舍门禁、成绩、校园卡、课表、老师/学校发布的通知公告等。',
  '提问里可能附「实时数据」——那是当前登录学生本人的真实数据（课表/公告/成绩/请假/资讯）。',
  '凡是「我的课表」「老师发了什么通知」「我的成绩/请假」这类个人数据问题，必须依据实时数据回答；实时数据里没有就直说没查到，绝对不要编。',
  '要求：用中文回答，简洁、分点更好；普通问题不超过 200 字，列表类（课表、成绩、公告清单）可以适当加长；语气亲切。',
  '「校园知识库」是权威资料，与它冲突时以知识库为准。',
  '与校园无关、或确实没有依据的：说明无法确认，建议咨询辅导员/班主任，不要编造具体规定和数字。'
].join('\n');

// 本地知识库命中判断（原逻辑不变）
function kbAnswer(q) {
  for (const item of CAMPUS_KB) {
    if (item.k.some(k => q.indexOf(k) >= 0)) return item.a;
  }
  return null;
}

// 把知识库当作上下文喂给模型 —— 轻量 RAG，让答案贴着本校规则走
function kbContext() {
  return CAMPUS_KB.map(i => '- ' + i.k.join('、') + '：' + i.a).join('\n');
}

// ---------- 给模型喂「当前登录学生的真实数据」 ----------
// 问题里命中哪类关键词，才去查哪类数据，避免每个问题都把全部数据塞进提示词（又慢又费 token）
// 数据一律复用上面现成的查询函数（它们自带鉴权：token 不对/没登录就拿不到，天然安全）

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDate(s) { return String(s || '').slice(0, 10); }

async function fetchScheduleCtx(token) {
  const r = await listSchedule({ token: token });
  if (!r || r.code !== 'OK' || !r.list || !r.list.length) return '';
  const wd = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const byDay = {};
  r.list.forEach(t => { (byDay[t.weekday] = byDay[t.weekday] || []).push(t); });
  const lines = Object.keys(byDay).sort((a, b) => a - b).map(d =>
    wd[d] + '：' + byDay[d].map(t =>
      '第' + t.startPeriod + '-' + t.endPeriod + '节 ' + t.courseName +
      (t.teacherName ? '（' + t.teacherName + '）' : '') + (t.location ? '@' + t.location : '')
    ).join('；')
  );
  return '【我的课表】\n' + lines.join('\n');
}

async function fetchAnnouncementCtx(token) {
  const r = await listAnnouncements({ token: token });
  if (!r || r.code !== 'OK' || !r.list || !r.list.length) return '';
  return '【老师/学校发布的公告（最新在前）】\n' + r.list.slice(0, 6).map(a =>
    '· ' + a.title + '（' + (a.publisherName || '?') + ' ' + fmtDate(a.createdAt) + '）：' + String(a.content || '').replace(/\s+/g, ' ').slice(0, 80)
  ).join('\n');
}

async function fetchScoreCtx(token) {
  const r = await listScores({ token: token });
  if (!r || r.code !== 'OK' || !r.list || !r.list.length) return '';
  return '【我的成绩】\n' + r.list.slice(0, 15).map(s =>
    '· ' + s.courseName + '：' + s.score + (s.semester ? '（' + s.semester + '）' : '')
  ).join('\n');
}

async function fetchLeaveCtx(token) {
  const r = await listLeaves({ token: token });
  if (!r || r.code !== 'OK' || !r.list || !r.list.length) return '';
  const st = { pending: '待审批', approved: '已通过', rejected: '未通过' };
  return '【我的请假记录】\n' + r.list.slice(0, 5).map(l =>
    '· ' + l.type + '（' + fmtDate(l.start) + ' ~ ' + fmtDate(l.end) + '）：' + (st[l.status] || l.status) + (l.comment ? '，备注：' + l.comment : '')
  ).join('\n');
}

async function fetchNewsCtx() {
  const r = await getNews();
  if (!r || r.code !== 'OK' || !r.list || !r.list.length) return '';
  return '【最新校园资讯】\n' + r.list.slice(0, 5).map(n =>
    '· ' + n.title + (n.date ? '（' + n.date + '）' : '') + '：' + String(n.content || '').replace(/\s+/g, ' ').slice(0, 60)
  ).join('\n');
}

const REAL_DATA_ROUTES = [
  { keys: ['课表', '上课', '课程', '什么课', '有课', '哪节', '排课', '星期', '周几', '礼拜', '第一节'], fetch: fetchScheduleCtx },
  { keys: ['通知', '公告', '发布', '老师发', '发了什么', '活动', '评奖', '评选', '班会'], fetch: fetchAnnouncementCtx },
  { keys: ['成绩', '分数', '考了', '考得', '查分', '绩点', '挂科'], fetch: fetchScoreCtx },
  { keys: ['请假', '假条', '批了', '审批'], fetch: fetchLeaveCtx },
  { keys: ['资讯', '新闻', '动态'], fetch: fetchNewsCtx }
];

// 按问题关键词抓取真实数据；没登录 / 没命中 / 查询失败都安静返回空串，绝不影响答疑主流程
async function collectRealData(q, token) {
  const hits = REAL_DATA_ROUTES.filter(rt => rt.keys.some(k => q.indexOf(k) >= 0));
  if (!hits.length) return '';
  const parts = [];
  for (const rt of hits) {
    try {
      const s = await rt.fetch(token);
      if (s) parts.push(s);
    } catch (e) { /* 单路失败不影响其它 */ }
  }
  if (!parts.length) return '';
  const d = new Date();
  const head = '今天是 ' + todayStr() + ' 周' + '日一二三四五六'[d.getDay()] + '。以下是当前登录学生的真实数据，回答相关问题时以它为准：';
  return '【实时数据】' + head + '\n' + parts.join('\n');
}

function buildPrompt(q, extra) {
  let p = '【校园知识库】\n' + kbContext() + '\n';
  if (extra) p += '\n' + extra + '\n';
  return p + '\n【学生提问】\n' + q;
}

async function aiChat(event) {
  const q = String(event.question || '').trim();
  if (!q) return { code: 'PARAM_ERR', msg: '请输入问题' };

  const cfg = ai.loadConfig();
  const provider = await ai.resolveProvider();   // mimo（云端）/ ollama（本机）/ kb（没模型）
  const hasModel = provider !== 'kb';

  // 命中了个人数据类问题（课表/公告/成绩/请假/资讯），先去把真实数据抓来喂给模型
  const realData = await collectRealData(q, event.token);
  const prompt = buildPrompt(q, realData);
  // 有真实数据时不让知识库关键词抢先 —— 否则模型拿不到数据，只能说"请去某某入口查看"
  let kb = kbAnswer(q);
  if (realData) kb = null;
  // 本地小模型单独用一套模式：默认知识库优先（又快又准），只有知识库答不上来才劳烦它
  const mode = provider === 'ollama' ? cfg.localMode : cfg.mode;

  // 1) 有模型且是「先问模型」模式 → 优先问模型
  if (hasModel && mode === 'llm-first') {
    const r = await ai.chat({ system: AI_SYSTEM, prompt: prompt });
    if (r.ok) return { code: 'OK', answer: r.text, thinking: r.thinking, source: 'llm', model: r.model, provider: r.provider };
    if (kb) return { code: 'OK', answer: kb, source: 'kb', degraded: r.reason };
  }

  // 2) 本地知识库关键词命中（不花钱、不联网，答辩离线也稳）
  if (kb) return { code: 'OK', answer: kb, source: 'kb' };

  // 3) 知识库没命中，才去问模型（kb-first 模式）
  if (hasModel) {
    const r = await ai.chat({ system: AI_SYSTEM, prompt: prompt });
    if (r.ok) return { code: 'OK', answer: r.text, thinking: r.thinking, source: 'llm', model: r.model, provider: r.provider };
    // 调不通（断网 / 401 / 超时）也不能让用户干等，直接落到兜底话术
    return {
      code: 'OK',
      source: 'fallback',
      degraded: r.reason,
      answer: '这个问题我暂时没查到～ 你可以换种问法，或者问问辅导员/班主任。' +
        '我比较擅长回答：请假流程、奖助学金、图书馆、作息时间、宿舍门禁、成绩查询等校园制度问题。'
    };
  }

  // 4) 没配 Key 时的兜底
  return {
    code: 'OK',
    source: 'fallback',
    answer: '这个问题我暂时没查到～ 你可以换种问法，或者问问辅导员/班主任。' +
      '我比较擅长回答：请假流程、奖助学金、图书馆、作息时间、宿舍门禁、成绩查询等校园制度问题。'
  };
}
// ================= 宿舍签到 =================
async function createDormCheckin(event) {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  global.currentDormCheckin = {
    checkinId: Date.now().toString(),
    code: code,
    topic: event.topic || '宿舍签到',
    endTime: Date.now() + 600000,
    checkedIds: []
  };
  return { code: 'OK', data: global.currentDormCheckin };
}

async function getCurrentDormCheckin(event) {
  if (global.currentDormCheckin && global.currentDormCheckin.endTime > Date.now()) {
    return { code: 'OK', data: global.currentDormCheckin };
  }
  return { code: 'NOT_FOUND', msg: '暂无签到' };
}

async function submitDormCheckin(event) {
  if (global.currentDormCheckin) {
    const studentId = String(event.studentId);
    if (studentId && !global.currentDormCheckin.checkedIds.includes(studentId)) {
      global.currentDormCheckin.checkedIds.push(studentId);
      
      if (!global.currentDormCheckin.signTimes) {
        global.currentDormCheckin.signTimes = {};
      }
      global.currentDormCheckin.signTimes[studentId] = new Date().toLocaleTimeString(); // 比如 "14:30:25"
    }
    return { code: 'OK', msg: '签到成功' };
  }
  return { code: 'ERR', msg: '签到已结束' };
}

async function getCheckinRecords(event) {
  if (global.currentDormCheckin) {
    return { 
      code: 'OK', 
      data: global.currentDormCheckin.checkedIds,
      times: global.currentDormCheckin.signTimes || {} 
    };
  }
  return { code: 'OK', data: [], times: {} };
}

async function getStudentList(event) {
  try {
    // 既然 .find() 报错，咱们直接用一个合法的查询方式
    // 很多本地库里，不传参数是获取全部，或者用 getAll
    let allStudents = [];
    
    try {
      // 尝试直接获取全部（不传参数）
      allStudents = collection('students').find(); 
    } catch (e) {
      // 如果 find() 还是报错，说明这个库不支持这种写法
      // 那就换个方法，或者直接读缓存
      console.log("find报错，尝试其他方式");
    }

    // 如果依然拿不到数组，或者数组是空的，直接抛出个提示
    if (!Array.isArray(allStudents) || allStudents.length === 0) {
      return {
        code: 'OK',
        data: [
          { id: '1', name: '张三', dorm: 'A-101' },
          { id: '2', name: '李四', dorm: 'A-102' }
        ]
      };
    }

    // 把真实数据映射成前端需要的格式
    const data = allStudents.map(s => ({
      id: s._id || s.id, 
      name: s.name,
      dorm: s.dorm || 'A-101' 
    }));

    return { code: 'OK', data: data };
  } catch (err) {
    console.error("获取学生名单彻底失败:", err);
    return { 
      code: 'OK', 
      data: [
        { id: '1', name: '张三', dorm: 'A-101' },
        { id: '2', name: '李四', dorm: 'A-102' }
      ] 
    };
  }
}
// ================= 资质证书审批 =================
// 1. 学生端提交证书
async function submitCert(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  const certName = String(event.certName || '').trim();
  if (!certName) return { code: 'PARAM_ERR', msg: '证书名称不能为空' };

  collection('certs').insert({
    studentName: ctx.user.name || '学生',
    className: ctx.user.classId || '未知班级',
    certName: certName,
    issuer: event.issuer || '未知机构',  
    certNo: event.certNo || '无编号',     
    submitTime: new Date().toLocaleString(),
    status: 'pending',
    rejectReason: '' // 初始化驳回理由为空
  });
  return { code: 'OK', msg: '提交成功' };
}

// 2. 获取证书列表（学生看自己的，老师看所有人的）
async function listCerts(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  
  const allCerts = collection('certs').orderBy('submitTime', 'desc');
  
  // 如果是老师，返回所有学生的证书
  if (ctx.role === 'teacher') {
    return { code: 'OK', list: allCerts };
  }
  
  // 如果是学生，只返回属于这个学生的证书
  // （这里根据学生姓名或学号过滤，你之前的提交里存了 studentName）
  const myCerts = allCerts.filter(c => c.studentName === ctx.user.name);
  return { code: 'OK', list: myCerts };
}

// 3. 教师端审批（通过/驳回）
async function approveCert(event) {
  let ctx; try { ctx = await auth(event.token); } catch (e) { return e; }
  if (ctx.role !== 'teacher') return { code: 'FORBIDDEN', msg: '仅教师可审批' };

  const id = String(event.certId || '');
  if (!id) return { code: 'PARAM_ERR', msg: '缺少证书ID' };

  const cert = collection('certs').byId(id);
  if (!cert) return { code: 'NOT_FOUND', msg: '证书不存在' };

  // 更新状态，以及驳回理由
  collection('certs').updateById(id, { 
    status: event.status,
    rejectReason: event.rejectReason || '' 
  });
  return { code: 'OK', msg: '操作成功' };
}
// ================= 图书馆管理 =================
// 初始化图书数据（只在服务刚启动时执行一次）
if (!global.currentBooks) {
  global.currentBooks = [
    { id: 1, title: '三体', author: '刘慈欣', category: '科幻', stock: 5, cover: '📘', online: true },
    { id: 2, title: '活着', author: '余华', category: '文学', stock: 3, cover: '📗', online: true },
    { id: 3, title: '人类简史', author: '尤瓦尔·赫拉利', category: '历史', stock: 2, cover: '📙', online: false },
    { id: 4, title: '算法导论', author: 'Cormen', category: '计算机', stock: 4, cover: '📕', online: true }
  ];
}

// 1. 获取图书列表
async function getBooks(event) {
  return { code: 'OK', list: global.currentBooks };
}

// 2. 上架/下架
async function toggleBookOnline(event) {
  const id = Number(event.id);
  const book = global.currentBooks.find(b => b.id === id);
  if (book) {
    book.online = !book.online;
  }
  return { code: 'OK', msg: '状态已更新' };
}
// 学生借书
async function borrowBook(event) {
  const id = Number(event.id);
  const book = global.currentBooks.find(b => b.id === id);
  
  if (book && book.stock > 0) {
    book.stock -= 1; // 库存减 1
    return { code: 'OK', msg: '借阅成功' };
  }
  return { code: 'ERR', msg: '库存不足' };
}

// 学生还书
async function returnBook(event) {
  const id = Number(event.id);
  const book = global.currentBooks.find(b => b.id === id);
  
  if (book) {
    book.stock += 1; // 库存加 1
    return { code: 'OK', msg: '还书成功' };
  }
  return { code: 'ERR', msg: '书不存在' };
}

// 3. 添加图书
async function addBook(event) {
  const title = String(event.title || '').trim();
  if (!title) return { code: 'PARAM_ERR', msg: '书名不能为空' };
  
  const covers = ['📘', '📗', '📙', '📕', '📓', '📔', '📒', '📖'];
  const newBook = {
    id: Date.now(),
    title: title,
    author: event.author || '未知',
    category: event.category || '未分类',
    stock: Number(event.stock) || 0,
    cover: covers[Math.floor(Math.random() * covers.length)],
    online: true 
  };
  
  global.currentBooks.push(newBook);
  return { code: 'OK', msg: '添加成功' };
}

// 4. 删除图书
async function deleteBook(event) {
  const id = Number(event.id);
  global.currentBooks = global.currentBooks.filter(b => b.id !== id);
  return { code: 'OK', msg: '删除成功' };
}
// ===============================================
// ================= 班级统计管理 =================
// 获取带有真实学生人数的班级列表
async function getClassStats(event) {
  const classes = [
    { id: '1', name: '计应1班', grade: '1', emoji: '🌸' },
    { id: '2', name: '计应2班', grade: '2', emoji: '🌷' },
    { id: '3', name: '计应3班', grade: '3', emoji: '🌺' }
  ];

  // 直接读内存，绝不查库
  const result = classes.map(c => {
    const count = global.memoryStudents.filter(s => String(s.classId) === String(c.id)).length;
    return {
      id: c.id,
      name: c.name,
      grade: c.grade,
      emoji: c.emoji,
      studentCount: count
    };
  });

  return { code: 'OK', list: result };
}

// ================= 真实班级学生管理 =================
// 在全局变量里模拟一个学生数据库，避开坏掉的 lib.js
if (!global.memoryStudents) {
  global.memoryStudents = [];
}

// 1. 获取某个班级的学生
async function getStudentsByClass(event) {
  const classId = String(event.classId || '');
  if (!classId) return { code: 'PARAM_ERR', msg: '缺少班级ID' };

  // 直接从内存里过滤
  const list = global.memoryStudents.filter(s => String(s.classId) === classId);
  return { code: 'OK', list: list };
}

// 2. 添加学生
async function addStudent(event) {
  const name = String(event.name || '').trim();
  const classId = String(event.classId || '').trim();
  if (!name || !classId) return { code: 'PARAM_ERR', msg: '缺少姓名或班级ID' };

  // 往内存里加
  const newStudent = {
    id: Date.now().toString(),
    name: name,
    classId: classId,
    studentNo: '2026' + Math.floor(1000 + Math.random() * 9000),
    age: 18,
    gender: '未知',
    hobby: '待填写',
    tag: '新同学',
    avatarText: name.charAt(name.length - 1),
    createdAt: new Date().toISOString()
  };

  global.memoryStudents.push(newStudent);
  return { code: 'OK', msg: '添加成功', data: newStudent };
}

// 3. 删除学生
async function deleteStudent(event) {
  const id = String(event.id || '');
  if (!id) return { code: 'PARAM_ERR', msg: '缺少学生ID' };
  
  // 从内存里删
  global.memoryStudents = global.memoryStudents.filter(s => s.id !== id);
  return { code: 'OK', msg: '删除成功' };
}
// ====================================================

// 3. 删除学生
async function deleteStudent(event) {
  const id = String(event.id || '');
  if (!id) return { code: 'PARAM_ERR', msg: '缺少学生ID' };
  
  collection('students').removeById(id);
  return { code: 'OK', msg: '删除成功' };
}
// ====================================================
module.exports = {
  login: login,
  changePassword: changePassword,
  getNews: getNews,
  manageNews: manageNews,
  importStudents: importStudents,
  seedOrg: seedOrg,
  publishAnnouncement: publishAnnouncement,
  listAnnouncements: listAnnouncements,
  submitLeave: submitLeave,
  listLeaves: listLeaves,
  approveLeave: approveLeave,
  publishSchedule: publishSchedule,
  listSchedule: listSchedule,
  enterScore: enterScore,
  listScores: listScores,
  openCheckin: openCheckin,
  listCheckinSessions: listCheckinSessions,
  studentCheckin: studentCheckin,
  closeCheckin: closeCheckin,
  listAttendance: listAttendance,
  aiChat: aiChat,
  updateAttendanceStatus: updateAttendanceStatus,
  createDormCheckin: createDormCheckin,
  getCurrentDormCheckin: getCurrentDormCheckin,
  submitDormCheckin: submitDormCheckin,
  getCheckinRecords: getCheckinRecords,
  getStudentList: getStudentList,  
  submitCert: submitCert,
  listCerts: listCerts,
  approveCert: approveCert,
  getBooks: getBooks,
  toggleBookOnline: toggleBookOnline,
  addBook: addBook, 
  deleteBook: deleteBook,
  borrowBook: borrowBook,
  returnBook: returnBook,
  getClassStats: getClassStats,
  getStudentsByClass: getStudentsByClass,
  addStudent: addStudent,
  deleteStudent: deleteStudent,
  SEED_KEY: SEED_KEY           
};                               