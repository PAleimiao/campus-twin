// lib.js —— 本云函数依赖的本地公共库（密码哈希 / 登录态校验 / 数据库入口）
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function makeSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const a = Buffer.from(crypto.scryptSync(String(password), salt, 64).toString('hex'), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function db() {
  return cloud.database();
}

async function auth(token, options) {
  const allowForceChange = !!(options && options.allowForceChange);
  if (!token) throw { code: 'NO_TOKEN', msg: '请先登录' };

  const database = db();
  const sessRes = await database.collection('sessions').where({ token: token }).get();
  if (!sessRes.data.length) throw { code: 'AUTH_FAIL', msg: '登录态失效，请重新登录' };

  const session = sessRes.data[0];
  if (session.expireAt && new Date(session.expireAt).getTime() < Date.now()) {
    throw { code: 'TOKEN_EXPIRED', msg: '登录已过期，请重新登录' };
  }

  const coll = session.role === 'teacher' ? database.collection('teachers') : database.collection('students');
  const userRes = await coll.doc(session.userId).get();
  if (!userRes.data) throw { code: 'USER_GONE', msg: '账号不存在或已被删除' };

  const user = userRes.data;
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
