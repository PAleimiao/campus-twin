// changePassword —— 修改密码云函数
// 这是唯一“不受强制改密拦截”的接口：首次登录必须改密，但改密本身必须能调通。
// 入参：{ token, oldPwd, newPwd }
// 出参：{ code:'OK' } 或错误 code
const lib = require('./lib');
const db = lib.db;
const makeSalt = lib.makeSalt;
const hashPassword = lib.hashPassword;
const verifyPassword = lib.verifyPassword;
const auth = lib.auth;

// 新密码最短长度
const MIN_PWD = 6;

exports.main = async (event) => {
  try {
    const token = event.token;
    const oldPwd = event.oldPwd;
    const newPwd = event.newPwd;

    if (!token || !oldPwd || !newPwd) {
      return { code: 'PARAM_ERR', msg: '缺少 token / 原密码 / 新密码' };
    }
    if (String(newPwd).length < MIN_PWD) {
      return { code: 'WEAK_PWD', msg: '新密码至少 ' + MIN_PWD + ' 位' };
    }
    // 简单防弱密码：不允许新密码和旧密码一样
    if (String(oldPwd) === String(newPwd)) {
      return { code: 'SAME_PWD', msg: '新密码不能和原密码相同' };
    }

    // allowForceChange=true：即便 mustChangePwd 也放行本接口
    let ctx;
    try {
      ctx = await auth(token, { allowForceChange: true });
    } catch (e) {
      return e; // 直接把 { code, msg } 透传给前端
    }

    const user = ctx.user;
    const role = ctx.role;

    // 校验原密码
    if (!verifyPassword(oldPwd, user.salt, user.passwordHash)) {
      return { code: 'OLD_PWD_WRONG', msg: '原密码错误' };
    }

    // 生成新盐 + 新哈希
    const salt = makeSalt();
    const hash = hashPassword(newPwd, salt);

    const database = db();
    const coll = role === 'teacher' ? database.collection('teachers') : database.collection('students');
    await coll.doc(user._id).update({
      data: {
        salt: salt,
        passwordHash: hash,
        mustChangePwd: false,   // 改密成功后解除强制改密
        failCount: 0,
        lockUntil: null
      }
    });

    // 安全：改密后立即让该用户所有旧登录令牌失效（包括当前这一个）
    await database.collection('sessions').where({ userId: user._id }).remove();

    return { code: 'OK', msg: '密码修改成功，请重新登录' };
  } catch (e) {
    return { code: 'SERVER_ERR', msg: (e && e.message) ? e.message : '服务器错误' };
  }
};
