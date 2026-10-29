// server.js —— 广演校园「本地后端」（替代微信云开发，零第三方依赖）
// 用法：node server.js        （或双击 启动本地服务.bat）
// 端口：PORT 环境变量可改，默认 8080；HOST 默认 0.0.0.0（真机调试要能连局域网）
// 接口：POST http://<host>:8080/api/<函数名>  body 为 JSON，返回与云函数一致的 { code, ... }
//       POST http://<host>:8080/api/upload    multipart 上传图片，返回 { code:'OK', fileID, url }
//       GET  http://<host>:8080/uploads/xxx.png  读取已上传的图片
const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const lib = require('./lib');
const handlers = require('./functions');

const demo = require('./demo');
const ai = require('./ai');
const aiSetup = require('./ai-setup');

// 读 AI 配置时任何意外都不能影响服务启动（比如 ai.config.json 被写坏了）
async function aiStatusSafe() {
  try {
    return await ai.status();
  } catch (e) {
    return { provider: 'kb', enabled: false, model: '', mode: '', key: '' };
  }
}

// 启动横幅里那行 AI 状态
function aiStatusLine(st) {
  if (st.provider === 'ollama') {
    return '本机本地模型 ' + st.localModel + '（离线可用，不花 token）';
  }
  if (st.provider === 'mimo') {
    return '云端大模型 ' + st.model + '（密钥 ' + st.key + '，' + (st.mode === 'kb-first' ? '知识库优先' : '大模型优先') + '）';
  }
  return '本地预设知识库（离线可用；想接大模型看 ai.config.example.json）';
}

// 演示模式（默认开）：本次会话里改密码 / 发资讯 / 传图片照常生效，进程结束后自动还原。
// 想真的保存下来：node server.js --keep
const KEEP_DATA = process.argv.includes('--keep') || process.env.KEEP_DATA === '1';
const SESSION = KEEP_DATA ? null : demo.begin();

// 退出时自动还原：Ctrl+C、关掉终端窗口、正常退出都会走到这里。
// 万一被强杀没走到，下次启动会靠 .demo-session 里的 pid 判定并补一次还原（见 demo.js）。
if (SESSION) {
  let restored = false;
  const restoreOnce = () => {
    if (restored) return;
    restored = true;
    demo.finish(SESSION);
  };
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((sig) => {
    process.on(sig, () => {
      restoreOnce();
      process.exit(0);
    });
  });
  process.on('exit', restoreOnce);
  process.on('uncaughtException', (e) => {
    console.error('[server] 未捕获异常：', e);
    restoreOnce();
    process.exit(1);
  });
}

// 默认端口。Windows 的 Hyper-V / WSL 会把某段端口随机划为「排除端口」（重启后还会变），
// 一旦落在那一段里 listen 会直接 EACCES。默认挑一个通常不会被划进去的端口，
// 真碰上了也会自动顺延到下一个可用端口（见下方 start()）。
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 2 * 1024 * 1024;      // 普通 JSON 接口：2MB（导入学生也够用）
const MAX_UPLOAD = 5 * 1024 * 1024;    // 图片上传：单张 5MB
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
};

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  return UPLOAD_DIR;
}

function lanIps() {
  const out = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs || {}).forEach((k) => {
    (ifs[k] || []).forEach((i) => {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    });
  });
  return out;
}

// 读取请求体原始字节。图片必须按 Buffer 处理，转字符串会损坏二进制。
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readRaw(req, MAX_BODY);
  const raw = buf.toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}

// ---------- multipart/form-data 解析（手写，不引入 multer/formidable）----------
function parseHeaders(raw) {
  const headers = {};
  raw.split('\r\n').forEach((line) => {
    const idx = line.indexOf(':');
    if (idx < 0) return;
    headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  });
  return headers;
}

function parseMultipart(buf, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary, 'latin1');
  let start = buf.indexOf(delim);
  if (start < 0) return parts;

  while (start >= 0) {
    // 紧跟 boundary 之后是 \r\n；若是 '--' 说明到了结束标记
    const after = buf.slice(start + delim.length, start + delim.length + 2).toString('latin1');
    if (after === '--') break;

    const partStart = start + delim.length + 2;
    const headerEnd = buf.indexOf('\r\n\r\n', partStart, 'latin1');
    if (headerEnd < 0) break;

    const headers = parseHeaders(buf.slice(partStart, headerEnd).toString('utf8'));
    const bodyStart = headerEnd + 4;
    const nextDelim = buf.indexOf(delim, bodyStart);
    if (nextDelim < 0) break;

    // 下一个 boundary 之前还有一组 \r\n，要去掉，否则图片尾部会多两个字节
    const bodyEnd = Math.max(bodyStart, nextDelim - 2);
    const cd = headers['content-disposition'] || '';
    const nameMatch = /name="([^"]*)"/.exec(cd);
    const fileMatch = /filename="([^"]*)"/.exec(cd);

    parts.push({
      name: nameMatch ? nameMatch[1] : '',
      filename: fileMatch ? fileMatch[1] : '',
      contentType: headers['content-type'] || '',
      body: buf.slice(bodyStart, bodyEnd)
    });

    start = nextDelim;
  }
  return parts;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // 允许浏览器/其它来源直接调，方便用浏览器或 Postman 自测
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ---------- 图片上传：POST /api/upload（multipart，字段名 file，可带 token）----------
async function handleUpload(req, res) {
  const contentType = String(req.headers['content-type'] || '');
  const bm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (contentType.toLowerCase().indexOf('multipart/form-data') < 0 || !bm) {
    return send(res, 400, { code: 'BAD_FORM', msg: '请用 multipart/form-data 上传' });
  }

  let buf;
  try {
    buf = await readRaw(req, MAX_UPLOAD + 64 * 1024); // 留一点余量给表单头尾
  } catch (e) {
    return send(res, 413, { code: 'TOO_LARGE', msg: '文件不能超过 5MB' });
  }

  const parts = parseMultipart(buf, (bm[1] || bm[2]).trim());
  const fields = {};
  let filePart = null;
  parts.forEach((p) => {
    if (p.filename && p.name === 'file') filePart = p;
    else if (p.name) fields[p.name] = p.body.toString('utf8');
  });

  // 鉴权：必须是已登录且已改密的教师/管理员，避免开放写口子
  try {
    const ctx = await lib.auth(fields.token);
    if (ctx.role !== 'teacher') {
      return send(res, 200, { code: 'FORBIDDEN', msg: '仅教师/管理员可上传图片' });
    }
  } catch (e) {
    return send(res, 200, e);
  }

  if (!filePart) return send(res, 200, { code: 'NO_FILE', msg: '没有收到文件' });

  const ext = path.extname(filePart.filename).toLowerCase().replace('.', '');
  if (ALLOWED_EXT.indexOf(ext) < 0) {
    return send(res, 200, { code: 'BAD_TYPE', msg: '只支持 png / jpg / jpeg / gif / webp' });
  }
  if (filePart.body.length > MAX_UPLOAD) {
    return send(res, 200, { code: 'TOO_LARGE', msg: '文件不能超过 5MB' });
  }

  const fname = Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(ensureUploadDir(), fname), filePart.body);

  // 必须回绝对地址：小程序 image 组件不认 /uploads/xxx.png 这种相对路径
  const host = req.headers.host || ('localhost:' + PORT);
  const url = 'http://' + host + '/uploads/' + fname;
  console.log('[api] upload -> %s (%d bytes)', fname, filePart.body.length);
  return send(res, 200, {
    code: 'OK',
    fileID: url,   // 与 wx.cloud.uploadFile 的字段名对齐，前端两种模式可共用同一段回填逻辑
    url: url,
    size: filePart.body.length
  });
}

// ---------- 静态资源：GET /uploads/xxx.png ----------
function handleStatic(req, res, url) {
  const rawName = decodeURIComponent(url.slice('/uploads/'.length));
  // 目录穿越防护：只保留文件名本身，非法字符替换掉
  const safeName = path.basename(rawName).replace(/[^\w.\-]/g, '_');
  if (!safeName) return send(res, 404, { code: 'NOT_FOUND', msg: '图片不存在' });

  const file = path.join(UPLOAD_DIR, safeName);
  if (!fs.existsSync(file)) return send(res, 404, { code: 'NOT_FOUND', msg: '图片不存在' });

  const ext = path.extname(safeName).toLowerCase().replace('.', '');
  const data = fs.readFileSync(file);
  res.writeHead(200, Object.assign({
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': 'public, max-age=86400'
  }, CORS_HEADERS));
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = String(req.url || '/').split('?')[0];

  // 健康检查：浏览器打开 http://localhost:3000/ 能看到这一页，说明服务活着
  if (req.method === 'GET' && (url === '/' || url === '/health')) {
    return send(res, 200, {
      code: 'OK',
      msg: 'campus-twin 本地后端运行中',
      functions: Object.keys(handlers).filter(k => typeof handlers[k] === 'function'),
      upload: '/api/upload',
      lanIps: lanIps()
    });
  }

  // 上传接口必须排在通用 /api/<函数名> 之前：它读的是 multipart，不是 JSON
  if (req.method === 'POST' && url === '/api/upload') {
    try {
      return await handleUpload(req, res);
    } catch (e) {
      console.error('[api] upload 出错：', e);
      return send(res, 200, { code: 'SERVER_ERR', msg: (e && e.message) || '服务器错误' });
    }
  }

  if (req.method === 'GET' && url.indexOf('/uploads/') === 0) {
    try {
      return handleStatic(req, res, url);
    } catch (e) {
      return send(res, 200, { code: 'SERVER_ERR', msg: (e && e.message) || '服务器错误' });
    }
  }

  // 业务接口：/api/login、/api/changePassword、/api/getNews ...
  if (url.indexOf('/api/') === 0) {
    const funcName = url.slice('/api'.length).replace(/^\//, '').replace(/\/$/, '');

    const fn = handlers[funcName];
    if (typeof fn !== 'function') {
      return send(res, 404, { code: 'NO_FUNC', msg: '没有这个接口：' + funcName });
    }

    let event = {};
    if (req.method === 'POST') {
      try {
        event = await readJsonBody(req);
      } catch (e) {
        return send(res, 400, { code: 'BAD_JSON', msg: '请求体不是合法 JSON' });
      }
    }
    if (!event || typeof event !== 'object') event = {};

    try {
      const result = await fn(event);
      console.log('[api] %s -> %s', funcName, (result && result.code) || 'OK');
      return send(res, 200, result || {});
    } catch (e) {
      console.error('[api] %s 出错：', funcName, e);
      return send(res, 200, {
        code: 'SERVER_ERR',
        msg: (e && e.message) ? e.message : '服务器错误'
      });
    }
  }

  return send(res, 404, { code: 'NOT_FOUND', msg: '未知地址：' + url });
});

// 端口与预期不一致时，顺手把两端 config.js 的 apiBase 改成实际端口。
// 否则小程序里还写着旧端口 —— 服务起来了但前端连不上，「自动顺延」就白搭。
// 只改形如 http://localhost:数字/api 的地址，局域网 IP / 其它写法不动。
function syncConfigPort(port) {
  const files = [
    path.join(__dirname, '..', 'student-end', 'config.js'),
    path.join(__dirname, '..', 'teacher-end', 'config.js')
  ];
  const changed = [];
  files.forEach((f) => {
    try {
      const src = fs.readFileSync(f, 'utf8');
      const out = src.replace(/http:\/\/localhost:\d+\/api/g, 'http://localhost:' + port + '/api');
      if (out !== src) {
        fs.writeFileSync(f, out, 'utf8');
        changed.push(path.basename(path.dirname(f)));
      }
    } catch (e) {
      // 读不到/写不了就别管，下面会提示手动改
    }
  });
  return changed;
}

// 启动成功后打印信息。端口与期望的不一致时重点提示，避免连不上还不知道原因。
async function started(port) {
  ensureUploadDir();
  const aiSt = await aiStatusSafe();
  console.log('');
  console.log('  广演校园 · 本地后端已启动');
  console.log('  ------------------------------------------');
  if (port !== PORT) {
    console.log('  ⚠ 端口 ' + PORT + ' 不可用（被占用 / Windows 保留端口），已自动改用 ' + port);
    const changed = syncConfigPort(port);
    if (changed.length) {
      console.log('    已自动把 ' + changed.join(' / ') + ' 的 config.js apiBase 同步为 :' + port);
    } else {
      console.log('    → 请手动把两端 config.js 的 apiBase 改成 http://localhost:' + port + '/api');
    }
    console.log('  ------------------------------------------');
  }
  console.log('  本机访问 : http://localhost:' + port);
  lanIps().forEach((ip) => {
    console.log('  真机调试 : http://' + ip + ':' + port + '   (小程序里填 http://' + ip + ':' + port + '/api)');
  });
  console.log('  数据文件 : ' + path.join(__dirname, 'data', 'db.json'));
  console.log('  图片目录 : ' + UPLOAD_DIR);
  console.log('  接口列表 : ' + Object.keys(handlers).filter(k => typeof handlers[k] === 'function').join(' / '));
  console.log('  上传接口 : POST /api/upload（multipart，字段 file + token）');
  if (KEEP_DATA) {
    console.log('  数据模式 : 保留模式（--keep）：本次的所有改动都会留存');
  } else if (SESSION && SESSION.taken) {
    console.log('  数据模式 : 演示模式：改动在本窗口中正常生效，关掉窗口后自动还原');
    console.log('            想留存数据请改用：node server.js --keep');
  } else {
    console.log('  数据模式 : 检测到已有服务在跑，本实例不负责还原数据');
  }
  console.log('  AI 答疑   : ' + aiStatusLine(aiSt));
  console.log('  停止服务 : Ctrl + C');
  console.log('  ------------------------------------------');
  console.log('');
  // 运行期错误只记录，不退出，避免一次异常把服务搞挂
  server.on('error', (e) => console.error('[server] 运行期错误：', (e && e.message) || e));
}

// 探测端口是否可用。用一次性 probe server，避免在主 server 上反复 listen 留下监听器。
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));  // EADDRINUSE 被占用 / EACCES 落在 Windows 排除端口内
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, HOST);
  });
}

// 在候选端口上起服务，失败 resolve(false)（不抛），交给上层换下一个
function listenOnce(port) {
  return new Promise((resolve) => {
    const onError = (err) => {
      server.removeListener('error', onError);
      resolve(false);
    };
    server.on('error', onError);
    server.listen(port, HOST, () => {
      server.removeListener('error', onError);
      resolve(true);
    });
  });
}

// 候选端口：先试 PORT 及其后 9 个 → 再试几个常见的 → 最后在 PORT 附近继续扫
function portCandidates(base) {
  const list = [];
  const push = (p) => {
    if (p >= 1 && p <= 65535 && list.indexOf(p) < 0) list.push(p);
  };
  for (let i = 0; i < 10; i++) push(base + i);
  [8080, 8888, 5000, 5173, 4321, 7000].forEach(push);
  for (let i = 10; i < 80; i++) push(base + i);
  return list;
}

(async function start() {
  // 开机自检：联网？密钥能用？要不要本机跑个小模型？（可跳过：AI_SETUP=skip 或 --no-ai-setup）
  try {
    await aiSetup.preflight();
  } catch (e) {
    console.log('  [AI自检] 自检异常（忽略）：' + ((e && e.message) || e));
  }

  const candidates = portCandidates(PORT);
  for (const port of candidates) {
    if (await isPortFree(port) && await listenOnce(port)) {
      await started(port);
      return;
    }
  }

  console.error('');
  console.error('  [X] 端口 ' + PORT + ' 及所有备选端口都不可用。');
  console.error('');
  console.error('  最常见的原因：Windows 把这段端口划进了「排除端口」范围（Hyper-V / WSL / 容器常见，');
  console.error('  每次重启都可能重新分配）。可以自己查一下：');
  console.error('      netsh int ipv4 show excludedportrange protocol=tcp');
  console.error('');
  console.error('  两种解决方式：');
  console.error('    1) 指定一个没被排除的端口启动，例如：');
  console.error('       set PORT=8080 && node server.js     （cmd）');
  console.error('       $env:PORT=8080; node server.js      （PowerShell）');
  console.error('       同时把两端 config.js 的 apiBase 改成 http://localhost:8080/api');
  console.error('    2) 释放系统保留范围：用管理员 PowerShell 执行 net stop winnat → net start winnat');
  console.error('');
  process.exit(1);
})();
