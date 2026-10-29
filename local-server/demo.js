// demo.js —— 演示模式：本次进程里的操作照常记录，进程结束后自动还原到快照
//
// 目的：用它演示/答辩时，改密码、发资讯、传图片都能正常走通；
//       但关掉黑窗口后数据会自动回到干净的初始状态，下次演示不用手动清。
//       想真的留存数据：node server.js --keep
//
// 实现要点：
//   1) 启动时用「快照文件」覆盖 data/db.json（snaptshot 缺失时现场灌一份种子数据）
//   2) 写一个 .demo-session 标记文件记录 pid
//   3) 正常退出（Ctrl+C / 关终端 / exit）时还原快照 + 删掉本次会话新建的图片
//   4) 万一进程被强杀没走到第 3 步：下次启动发现标记的 pid 已经不在了，先还原再接着跑
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SNAPSHOT = path.join(DATA_DIR, 'db.snapshot.json');
const MARKER = path.join(DATA_DIR, '.demo-session');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function pidAlive(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);   // 信号 0 = 只探测进程是否存在
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // 存在但无权限发信号，也算活着
  }
}

function listUploads() {
  try {
    return fs.readdirSync(UPLOAD_DIR).filter(f => f !== '.gitkeep' && f !== '.gitignore');
  } catch (e) {
    return [];
  }
}

// 生成「干净的初始数据」快照：开一个子进程在快照文件上灌种子，
// 这样不会碰正在使用的 data/db.json（lib.js 通过 CAMPUS_DB_FILE 改写入目标）
function ensureSnapshot() {
  if (fs.existsSync(SNAPSHOT)) return true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], {
      env: Object.assign({}, process.env, { CAMPUS_DB_FILE: SNAPSHOT }),
      stdio: 'ignore'
    });
  } catch (e) {
    console.error('[demo] 生成数据快照失败：', (e && e.message) || e);
    return false;
  }
  return fs.existsSync(SNAPSHOT);
}

function restorePristine() {
  if (!ensureSnapshot()) return false;
  try {
    fs.copyFileSync(SNAPSHOT, DB_FILE);
    return true;
  } catch (e) {
    console.error('[demo] 还原数据失败：', (e && e.message) || e);
    return false;
  }
}

// 上一次会话是不是没来得及还原（被强杀 / 直接断电）
function readStaleSession() {
  const m = readJSON(MARKER);
  if (!m || !m.pid) return null;
  return pidAlive(m.pid) ? null : m;
}

// 清空上传目录。快照里本来就没有图片，所以「还原」就应该把这里清空；
// 否则一次强杀留下的图会不断被下一次会话当成「本来就有的」，形成残留。
// （想长期保留图片请用 --keep 模式，那时不会碰这个目录）
function cleanUploads() {
  let n = 0;
  listUploads().forEach((f) => {
    try {
      fs.rmSync(path.join(UPLOAD_DIR, f), { force: true });
      n++;
    } catch (e) {
      // ignore
    }
  });
  return n;
}

// 另一个演示会话正在跑：这一份不要抢着还原，否则会把人家的数据冲掉
function otherSessionAlive() {
  const m = readJSON(MARKER);
  if (!m || !m.pid) return false;
  return pidAlive(m.pid);
}

// 开始一次演示会话。返回本次会话的上下文；taken=false 表示交给了别人负责还原
function begin() {
  const session = { pid: process.pid, taken: false };

  if (otherSessionAlive()) {
    return session;
  }

  const stale = readStaleSession();
  if (stale) console.log('[demo] 检测到上次会话没有正常结束，正在还原…');

  // 每次演示会话都从「数据快照 + 空图片目录」起步，保证演示起点一致
  if (!restorePristine()) {
    return session;
  }
  const cleaned = cleanUploads();
  if (cleaned > 0) console.log('[demo] 已清掉演示图片 ' + cleaned + ' 张');
  session.taken = true;
  try {
    fs.writeFileSync(MARKER, JSON.stringify({ pid: process.pid, at: Date.now() }));
  } catch (e) {
    // 写不了标记也不影响使用，只是异常退出时没法自动还原
  }
  return session;
}

// 结束会话：还原数据 + 清掉本次会话里新上传的图片
function finish(session) {
  if (!session || !session.taken) return;
  session.taken = false;

  restorePristine();
  cleanUploads();

  try {
    fs.rmSync(MARKER, { force: true });
  } catch (e) {
    // ignore
  }
}

module.exports = {
  begin: begin,
  finish: finish,
  restorePristine: restorePristine,
  snapshotExists: () => fs.existsSync(SNAPSHOT)
};
