// lib.js —— 本云函数依赖的本地公共库（密码哈希 / 登录态校验 / 数据库入口）
// 说明：微信云开发每个云函数独立部署，所以这份公共库在每个函数目录里各放一份，
//       保证右键「上传并部署」后能直接跑。四个函数里的 lib.js 内容一致。
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

// 初始化云环境，DYNAMIC_CURRENT_ENV 表示用当前所在环境（不用写死环境 ID）
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 生成 16 字节随机盐（十六进制字符串）
function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// 用 scrypt 把「密码 + 盐」哈希成 64 字节的十六进制字符串
// scrypt 是 Node 内置算法，自带加盐抗暴力破解，无需安装任何原生依赖
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

// 校验密码：把用户输入的密码用同一份盐哈希后，和库里存的哈希做“定时安全比较”
// timingSafeEqual 防止有人通过响应时间差猜密码
function verifyPassword(password, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(String(password), salt, 64).toString('hex'), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// 生成一个 32 字节的随机登录令牌
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 取得云数据库入口（每次调用都返回同一个 database 实例）
function db() {
  return cloud.database();
}

// 登录态校验：所有“受保护”的云函数入口都要先调它
// 参数 token 来自前端登录后拿到的令牌
// allowForceChange=true 时，即便是“必须改密”状态也放行（只给 changePassword 用）
// 校验通过返回 { user, role, session }；不通过直接抛出 { code, msg }，由调用方 catch 后返回给前端
async function auth(token, options) {
  const allowForceChange = !!(options && options.allowForceChange);
  if (!token) throw { code: 'NO_TOKEN', msg: '请先登录' };

  const database = db();
  const sessRes = await database.collection('sessions').where({ token: token }).get();
  if (!sessRes.data.length) throw { code: 'AUTH_FAIL', msg: '登录态失效，请重新登录' };

  const session = sessRes.data[0];
  // 7 天有效期检查
  if (session.expireAt && new Date(session.expireAt).getTime() < Date.now()) {
    throw { code: 'TOKEN_EXPIRED', msg: '登录已过期，请重新登录' };
  }

  const coll = session.role === 'teacher' ? database.collection('teachers') : database.collection('students');
  const userRes = await coll.doc(session.userId).get();
  if (!userRes.data) throw { code: 'USER_GONE', msg: '账号不存在或已被删除' };

  const user = userRes.data;
  // 强制改密拦截：除了 changePassword 以外，所有接口都拦截
  if (user.mustChangePwd && !allowForceChange) {
    throw { code: 'FORCE_PWD_CHANGE', msg: '请先修改初始密码' };
  }

  return { user: user, role: session.role, session: session };
}

module.exports = {
  cloud: cloud,
  db: db,
  crypto: crypto,
  makeSalt: makeSalt,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  newToken: newToken,
  auth: auth
};
