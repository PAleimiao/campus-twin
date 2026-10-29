// lib.js —— 本地后端公共库
// 对应云开发版 cloud/functions/*/lib.js：密码哈希 / 登录态校验 / 数据库入口
// 区别：这里的「数据库」是一个本地 JSON 文件（local-server/data/db.json），零依赖、零安装。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
// 默认写 data/db.json；demo.js 生成快照时会用 CAMPUS_DB_FILE 指到别的文件上，
// 避免为了做快照把正在使用的数据文件污染掉。
const DB_FILE = process.env.CAMPUS_DB_FILE
  ? path.resolve(process.env.CAMPUS_DB_FILE)
  : path.join(DATA_DIR, 'db.json');

// ---------- JSON 文件库 ----------
let store = null;

function load() {
  if (store) return store;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      store = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.error('[db] db.json 解析失败，已备份为 db.json.bad 并重建');
      fs.copyFileSync(DB_FILE, DB_FILE + '.bad');
      store = {};
    }
  } else {
    store = {};
  }
  if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
  return store;
}

// 每次写盘都整体覆盖（数据量很小，够用）；先写临时文件再改名，避免中途崩溃写坏
function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(load(), null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

// 取一个「集合」（= 一个 JSON 数组），API 尽量贴近云开发的写法，方便对照原云函数
function collection(name) {
  const db = load();
  if (!Array.isArray(db[name])) db[name] = [];
  const list = db[name];

  return {
    name: name,
    all: () => list.slice(),
    count: () => list.length,
    find: (pred) => list.filter(pred),
    findOne: (pred) => list.find(pred) || null,
    byId: (id) => list.find(d => d._id === id) || null,
    orderBy: (field, dir) => list.slice().sort((a, b) => {
      const x = a[field];
      const y = b[field];
      const r = (typeof x === 'number' && typeof y === 'number')
        ? x - y
        : String(x || '').localeCompare(String(y || ''));
      return String(dir).toLowerCase() === 'desc' ? -r : r;
    }),
    insert: (doc) => {
      const d = Object.assign({ _id: newId() }, doc);
      list.push(d);
      save();
      return d;
    },
    updateById: (id, patch) => {
      const i = list.findIndex(d => d._id === id);
      if (i < 0) return false;
      list[i] = Object.assign({}, list[i], patch);
      save();
      return true;
    },
    removeById: (id) => {
      const i = list.findIndex(d => d._id === id);
      if (i < 0) return false;
      list.splice(i, 1);
      save();
      return true;
    },
    removeWhere: (pred) => {
      const keep = list.filter(d => !pred(d));
      const removed = list.length - keep.length;
      if (removed > 0) {
        list.length = 0;
        keep.forEach(d => list.push(d));
        save();
      }
      return removed;
    }
  };
}

// ---------- 密码学（与云端完全一致，用的是 Node 内置 crypto）----------
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

// ---------- 登录态校验 ----------
// 校验通过返回 { user, role, session }；不通过直接 throw { code, msg }，由调用方 catch 后返回前端
async function auth(token, options) {
  const allowForceChange = !!(options && options.allowForceChange);
  if (!token) throw { code: 'NO_TOKEN', msg: '请先登录' };

  const session = collection('sessions').findOne(s => s.token === token);
  if (!session) throw { code: 'AUTH_FAIL', msg: '登录态失效，请重新登录' };

  if (session.expireAt && new Date(session.expireAt).getTime() < Date.now()) {
    throw { code: 'TOKEN_EXPIRED', msg: '登录已过期，请重新登录' };
  }

  const coll = session.role === 'teacher' ? collection('teachers') : collection('students');
  const user = coll.byId(session.userId);
  if (!user) throw { code: 'USER_GONE', msg: '账号不存在或已被删除' };

  // 强制改密拦截：除 changePassword 外所有接口都拦
  if (user.mustChangePwd && !allowForceChange) {
    throw { code: 'FORCE_PWD_CHANGE', msg: '请先修改初始密码' };
  }

  return { user: user, role: session.role, session: session };
}

module.exports = {
  crypto: crypto,
  collection: collection,
  save: save,
  newId: newId,
  makeSalt: makeSalt,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  newToken: newToken,
  auth: auth
};
