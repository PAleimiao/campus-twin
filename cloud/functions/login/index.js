// login —— 账号密码登录云函数
// 入参：{ account, password, role }
//   account: 学号（学生）或工号（教师）
//   password: 明文密码（只在云函数内哈希校验，绝不明文存储/回传）
//   role: 'student' 或 'teacher'
// 出参：{ code:'OK', token, role, name, mustChangePwd } 或各种错误 code
const lib = require('./lib');
const db = lib.db;
const makeSalt = lib.makeSalt;
const hashPassword = lib.hashPassword;
const verifyPassword = lib.verifyPassword;
const newToken = lib.newToken;

// 登录令牌有效期：7 天
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000;
// 连续输错 5 次锁定 10 分钟
const MAX_FAIL = 5;
const LOCK_MS = 10 * 60 * 1000;

exports.main = async (event) => {
  try {
    const account = event.account;
    const password = event.password;
    const role = event.role;

    // 参数检查
    if (!account || !password || !role) {
      return { code: 'PARAM_ERR', msg: '缺少账号 / 密码 / 角色' };
    }
    if (role !== 'student' && role !== 'teacher') {
      return { code: 'PARAM_ERR', msg: '角色只能是 student 或 teacher' };
    }

    const database = db();
    // 学生查 students 表（按 studentNo），教师查 teachers 表（按 teacherNo）
    const coll = role === 'teacher' ? database.collection('teachers') : database.collection('students');
    const field = role === 'teacher' ? 'teacherNo' : 'studentNo';

    const res = await coll.where({ [field]: String(account).trim() }).get();
    if (!res.data.length) {
      return { code: 'ACCOUNT_NOT_FOUND', msg: '账号不存在' };
    }
    const u = res.data[0];

    // 锁定检查：lockUntil 还在未来 → 拒绝
    if (u.lockUntil && new Date(u.lockUntil).getTime() > Date.now()) {
      return { code: 'LOCKED', msg: '账号已锁定，请 10 分钟后再试' };
    }

    // 密码校验
    if (!verifyPassword(password, u.salt, u.passwordHash)) {
      const fails = (u.failCount || 0) + 1;
      const update = { failCount: fails };
      if (fails >= MAX_FAIL) {
        update.lockUntil = new Date(Date.now() + LOCK_MS);
      }
      await coll.doc(u._id).update({ data: update });
      return { code: 'WRONG_PASSWORD', msg: '密码错误' };
    }

    // 校验通过：清空失败计数与锁定
    await coll.doc(u._id).update({ data: { failCount: 0, lockUntil: null } });

    // 写登录态（sessions 表），token 随机长串 + 7 天过期
    const token = newToken();
    await database.collection('sessions').add({
      data: {
        token: token,
        userId: u._id,
        role: role,
        expireAt: new Date(Date.now() + TOKEN_TTL),
        createdAt: new Date()
      }
    });

    return {
      code: 'OK',
      token: token,
      role: role,
      name: u.name,
      // 前端拿到 true 后弹“强制改密”窗口；后端也会在其它接口拦截
      mustChangePwd: !!u.mustChangePwd
    };
  } catch (e) {
    return { code: 'SERVER_ERR', msg: (e && e.message) ? e.message : '服务器错误' };
  }
};
