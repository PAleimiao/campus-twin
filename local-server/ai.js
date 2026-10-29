// ai.js —— AI 答疑的模型接入
//
// 三条通道，优先级由 ai-setup.js 开机自检决定，也可以自己在 ai.config.json 里写死：
//   1. cloud  小米 MiMo（https://api.xiaomimimo.com/v1/chat/completions，鉴权头 api-key）
//   2. local  本机 Ollama（http://localhost:11434/v1/chat/completions，不用密钥，不联网）
//   3. kb     本地知识库（functions.js 的 CAMPUS_KB，永远可用）
//
// 设计原则：**任何一条路走不通，就悄悄退到下一条**，绝不拖垮主流程、不让用户干等。
//
// 配置优先级：环境变量 > local-server/ai.config.json > 代码默认值
//   环境变量：AI_API_KEY（或 MIMO_API_KEY）、AI_BASE_URL、AI_MODEL、AI_MODE、AI_TIMEOUT_MS、
//             AI_PROVIDER（auto|mimo|ollama|kb）、OLLAMA_HOST、OLLAMA_MODEL、AI_OFF=1
//   文件字段：apiKey、baseUrl、model、mode、provider、localBaseUrl、localModel、timeoutMs、enabled
'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const CONFIG_FILE = path.join(__dirname, 'ai.config.json');

const DEFAULT_CLOUD_BASE = 'https://api.xiaomimimo.com/v1';
// flash 比 pro 便宜快，短问答够用；想要更聪明把 model 改成 mimo-v2.6-pro
const DEFAULT_CLOUD_MODEL = 'mimo-v2.6-flash';
// 本地默认用小模型：qwen2.5:0.5b 约 400MB，纯 CPU 也能跑，老机器不至于卡死
const DEFAULT_LOCAL_BASE = 'http://localhost:11434/v1';
const DEFAULT_LOCAL_MODEL = 'qwen2.5:0.5b';

// 开机自检的结论写在运行时里（只影响本次进程，不改用户的配置文件）
const runtime = { provider: null, localModel: null };

function setRuntime(patch) {
  Object.keys(patch || {}).forEach((k) => {
    if (patch[k] !== undefined && patch[k] !== null) runtime[k] = patch[k];
  });
  return runtime;
}

function getRuntime() {
  return runtime;
}

function readFileConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const v = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return (v && typeof v === 'object') ? v : {};
  } catch (e) {
    console.warn('[ai] ai.config.json 读不出来，忽略：', (e && e.message) || e);
    return {};
  }
}

// 密钥里带空白 = 还是示例文件里那句占位文案，别拿去请求，省得刷 401
function looksLikePlaceholder(key) {
  return /\s/.test(key) || key.indexOf('在这里') >= 0 || key.indexOf('your') >= 0;
}

// 防呆：有人会直接把密钥填进 ai.config.example.json，而那个文件是要提交到仓库的
let exampleChecked = false;
function checkExampleFile() {
  if (exampleChecked) return;
  exampleChecked = true;
  try {
    const p = path.join(__dirname, 'ai.config.example.json');
    if (!fs.existsSync(p)) return;
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    const k = String((v && v.apiKey) || '').trim();
    if (k && !looksLikePlaceholder(k)) {
      console.warn('[ai] ⚠  ai.config.example.json 里填了真密钥！这个文件会被提交到 Git，');
      console.warn('[ai]    请把它移到 ai.config.json，并把这里改回占位文案。');
    }
  } catch (e) {
    // 读不出来就算了，不影响主流程
  }
}

function normProvider(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'mimo' || s === 'cloud') return 'mimo';
  if (s === 'ollama' || s === 'local') return 'ollama';
  if (s === 'kb' || s === 'off') return 'kb';
  return 'auto';
}

function loadConfig() {
  checkExampleFile();
  const f = readFileConfig();
  const apiKey = String(process.env.AI_API_KEY || process.env.MIMO_API_KEY || f.apiKey || '').trim();
  const off = String(process.env.AI_OFF || '').trim() === '1' || f.enabled === false;
  const cfg = {
    provider: normProvider(process.env.AI_PROVIDER || f.provider) ,
    cloudEnabled: !off && !!apiKey && !looksLikePlaceholder(apiKey),
    apiKey: apiKey,
    baseUrl: String(process.env.AI_BASE_URL || f.baseUrl || DEFAULT_CLOUD_BASE).trim().replace(/\/+$/, ''),
    model: String(process.env.AI_MODEL || f.model || DEFAULT_CLOUD_MODEL).trim(),
    // kb-first：先查本地知识库（快、离线稳）；llm-first：每个问题都先问模型
    mode: String(process.env.AI_MODE || f.mode || 'kb-first').trim() === 'llm-first' ? 'llm-first' : 'kb-first',
    // 云端和本地分开设模式：本地小模型又慢又容易瞎编，默认让它只补知识库答不上来的题
    localMode: String(process.env.AI_LOCAL_MODE || f.localMode || 'kb-first').trim() === 'llm-first' ? 'llm-first' : 'kb-first',
    timeoutMs: Math.max(1000, Number(process.env.AI_TIMEOUT_MS || f.timeoutMs || 15000) || 15000),
    localBaseUrl: String(process.env.OLLAMA_HOST || f.localBaseUrl || DEFAULT_LOCAL_BASE).trim().replace(/\/+$/, ''),
    localModel: String(process.env.AI_LOCAL_MODEL || process.env.OLLAMA_MODEL || f.localModel || DEFAULT_LOCAL_MODEL).trim(),
    localTimeoutMs: Math.max(5000, Number(process.env.AI_LOCAL_TIMEOUT_MS || f.localTimeoutMs || 120000) || 120000),
    // 要不要让模型「把思考过程也交出来」（学生端可以点开看）。默认开。
    showThinking: !/^(0|false|off|no)$/i.test(String(process.env.AI_THINKING !== undefined ? process.env.AI_THINKING : (f.showThinking !== undefined ? f.showThinking : 1))),
    // 思考过程最长显示多少字（太长学生端一个气泡塞不下，超出部分截断）
    thinkingMaxChars: Math.max(0, Number(process.env.AI_THINKING_MAX || f.thinkingMaxChars || 600) || 0)
  };
  // 自检结论 / 环境变量可以覆盖，但不落盘
  if (runtime.provider) cfg.provider = normProvider(runtime.provider);
  if (runtime.localModel) cfg.localModel = String(runtime.localModel).trim();
  return cfg;
}

function maskKey(key) {
  if (!key) return '(未配置)';
  if (key.length <= 8) return key.slice(0, 2) + '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

// 本地模型服务是否在跑（结果缓存 30 秒，避免每次提问都探测）
// 注意：Ollama 只监听 127.0.0.1，而 Node 解析 localhost 会先试 IPv6(::1)，直接就 refused 了，
// 所以两个地址都要试一遍，并把真正通的那个记下来给后面调模型用。
let localCache = { at: 0, running: false, models: [], base: '' };

async function ollamaProbe() {
  const cfg = loadConfig();
  const raw = cfg.localBaseUrl.replace(/\/v1$/, '');
  const cands = [raw];
  if (raw.indexOf('localhost') >= 0) cands.push(raw.replace(/localhost/g, '127.0.0.1'));
  if (raw.indexOf('127.0.0.1') >= 0) cands.push(raw.replace(/127\.0\.0\.1/g, 'localhost'));

  for (const base of cands) {
    try {
      const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(2500) });
      if (r.ok) {
        const j = await r.json();
        return {
          running: true,
          models: ((j && j.models) || []).map((m) => String(m.name || m.model || '')),
          base: base
        };
      }
    } catch (e) {
      // 换下一个地址再试
    }
  }
  return { running: false, models: [], base: raw };
}

async function ollamaRunning() {
  if (Date.now() - localCache.at < 30000) return localCache.running;
  const r = await ollamaProbe();
  localCache = { at: Date.now(), running: r.running, models: r.models, base: r.base };
  return r.running;
}

// 调本地模型时用哪个地址（优先用探通过的，避开 localhost→IPv6 的坑）
async function localApiBase() {
  if (Date.now() - localCache.at < 30000 && localCache.base) return localCache.base + '/v1';
  const r = await ollamaProbe();
  localCache = { at: Date.now(), running: r.running, models: r.models, base: r.base };
  return r.base + '/v1';
}

function ollamaModels() {
  return localCache.models || [];
}

// ollama 可执行文件在哪。刚装完时 PATH 还没刷新，所以先看默认安装目录，找不到再退回 PATH。
function ollamaExe() {
  const known = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe')
  ];
  return known.find((f) => f && fs.existsSync(f)) || 'ollama';
}

// 本机装了 ollama 吗？
// 注意：刚装完的那次安装不会立刻写进已打开终端的 PATH，所以除了 where 还要看默认安装目录。
function ollamaInstalled() {
  const known = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe')
  ];
  if (known.some((f) => f && fs.existsSync(f))) return Promise.resolve(true);

  return new Promise((resolve) => {
    try {
      const p = spawn('where', ['ollama'], { windowsHide: true });
      let out = '';
      let done = false;
      const fin = (v) => { if (!done) { done = true; resolve(v); } };
      p.stdout.on('data', (d) => { out += d; });
      p.on('error', () => fin(false));
      p.on('close', (c) => fin(c === 0 && !!out.trim()));
      setTimeout(() => { try { p.kill(); } catch (e) { } fin(false); }, 5000);
    } catch (e) {
      resolve(false);
    }
  });
}

async function ollamaStatus() {
  const installed = await ollamaInstalled();
  await ollamaRunning();
  return {
    installed: installed,
    running: localCache.running,
    models: ollamaModels(),
    base: localCache.base || loadConfig().localBaseUrl.replace(/\/v1$/, '')
  };
}

// 最终决定这一问走哪条路
async function resolveProvider() {
  const cfg = loadConfig();
  if (cfg.provider === 'kb') return 'kb';
  if (cfg.provider === 'ollama') return (await ollamaRunning()) ? 'ollama' : 'kb';
  if (cfg.provider === 'mimo') return cfg.cloudEnabled ? 'mimo' : 'kb';
  // auto：云端有 Key 就走云端；没有就看本机有没有起本地模型；都没有才回知识库
  if (cfg.cloudEnabled) return 'mimo';
  if (await ollamaRunning()) return 'ollama';
  return 'kb';
}

// 给启动日志用的状态摘要（密钥只显示掩码）
async function status() {
  const cfg = loadConfig();
  const provider = await resolveProvider();
  const local = (localCache.at && localCache.running) ? localCache : null;
  return {
    provider: provider,
    enabled: provider !== 'kb',
    model: provider === 'ollama' ? cfg.localModel : cfg.model,
    baseUrl: provider === 'ollama' ? cfg.localBaseUrl : cfg.baseUrl,
    mode: cfg.mode,
    key: maskKey(cfg.apiKey),
    cloudEnabled: cfg.cloudEnabled,
    localRunning: !!(local && local.running),
    localModel: cfg.localModel
  };
}

// ---------- 自检探针 ----------

// TCP 连通性（比 ping 靠谱：很多网络禁 ICMP，但业务端口能通）
function tcpOk(host, port, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; socket.destroy(); resolve(v); } };
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs || 3000);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port || 443, host);
  });
}

/**
 * 一次性探明：网络通不通 + 密钥能不能用。
 * @returns {Promise<{online:boolean, status:string, detail:string}>}
 *   status: OK | NO_KEY | OFFLINE | TIMEOUT | AUTH | NO_BALANCE | HTTP_<code>
 */
// 从 baseUrl 里拆出 host / port（不能写死 443，本地调试可能跑在别的端口上）
function hostPortOf(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80) };
  } catch (e) {
    return { host: '', port: 443 };
  }
}

async function probeCloud() {
  const cfg = loadConfig();
  const hp = hostPortOf(cfg.baseUrl);

  if (!cfg.cloudEnabled) {
    // 没 Key 也要顺手看看网络，好提示「是没网还是没 Key」
    const online = hp.host ? await tcpOk(hp.host, hp.port, 3000) : false;
    return { online: online, status: 'NO_KEY', detail: online ? '网络正常，但没填密钥' : '网络不通' };
  }

  if (hp.host && !(await tcpOk(hp.host, hp.port, 3000))) {
    return { online: false, status: 'OFFLINE', detail: '连不上 ' + hp.host + ':' + hp.port };
  }

  try {
    const r = await fetch(cfg.baseUrl + '/models', {
      headers: { 'api-key': cfg.apiKey },
      signal: AbortSignal.timeout(8000)
    });
    if (r.ok) return { online: true, status: 'OK', detail: 'HTTP ' + r.status };
    const body = await r.text().catch(() => '');
    if (r.status === 401 || r.status === 403) {
      return { online: true, status: 'AUTH', detail: 'HTTP ' + r.status };
    }
    // 欠费 / 额度用尽：各家返回的码和文案都不统一，状态码 + 关键词一起认
    if (r.status === 402 || r.status === 429 ||
      /insufficient|quota|balance|arrears|overdue|余额|欠费|额度/i.test(body)) {
      return { online: true, status: 'NO_BALANCE', detail: 'HTTP ' + r.status + ' ' + body.slice(0, 120) };
    }
    return { online: true, status: 'HTTP_' + r.status, detail: body.slice(0, 120) };
  } catch (e) {
    const isTimeout = (e && e.name === 'TimeoutError');
    return { online: !isTimeout, status: isTimeout ? 'TIMEOUT' : 'OFFLINE', detail: (e && e.message) || '' };
  }
}

// ---------- 实际调用 ----------

function pickText(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  const t = msg && String(msg.content || '').trim();
  return t || '';
}

// 模型的「思考过程」。各家字段名不统一，都认一遍：
//   小米 MiMo / DeepSeek → reasoning_content，部分厂家用 reasoning / thinking
function pickThinking(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return '';
  return String(msg.reasoning_content || msg.reasoning || msg.thinking || '').trim();
}

// 太长就截断，免得学生端一个气泡塞几千字
function trimThinking(s, max) {
  const t = String(s || '').trim();
  if (!t) return '';
  if (max > 0 && t.length > max) return t.slice(0, max) + '…（思考过程较长，已省略）';
  return t;
}

async function callCloud(opts, cfg) {
  const wantThinking = !!cfg.showThinking;
  const body = {
    model: cfg.model,
    messages: [
      { role: 'system', content: String((opts && opts.system) || '') },
      { role: 'user', content: String((opts && opts.prompt) || '') }
    ],
    // 开着思考会多耗一点 token，上限给足一点，免得把答案截没了
    max_completion_tokens: Number(process.env.AI_MAX_TOKENS || (wantThinking ? 1600 : 512)),
    thinking: { type: wantThinking ? 'enabled' : 'disabled' },
    stream: false
  };
  const r = await fetch(cfg.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': cfg.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs)
  });
  const raw = await r.text();
  if (!r.ok) {
    console.warn('[ai] 云端返回 HTTP ' + r.status + '：' + String(raw).slice(0, 200));
    return { ok: false, reason: 'HTTP_' + r.status };
  }
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'BAD_JSON' }; }
  const text = pickText(data);
  if (!text) return { ok: false, reason: 'EMPTY' };
  const thinking = trimThinking(pickThinking(data), cfg.thinkingMaxChars);
  // 终端只打纯 ASCII 的统计（中文在部分 Windows 终端里会乱码，不打内容）
  if (thinking) console.log('[ai] thinking: ' + thinking.length + ' chars');
  return { ok: true, text: text, thinking: thinking, provider: 'mimo', model: data.model || cfg.model };
}

async function callLocal(opts, cfg) {
  const body = {
    model: cfg.localModel,
    messages: [
      { role: 'system', content: String((opts && opts.system) || '') },
      { role: 'user', content: String((opts && opts.prompt) || '') }
    ],
    max_tokens: Number(process.env.AI_MAX_TOKENS || 512),
    stream: false
  };
  const r = await fetch((await localApiBase()) + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.localTimeoutMs)
  });
  const raw = await r.text();
  if (!r.ok) {
    console.warn('[ai] 本地模型返回 HTTP ' + r.status + '：' + String(raw).slice(0, 200));
    return { ok: false, reason: 'HTTP_' + r.status };
  }
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { ok: false, reason: 'BAD_JSON' }; }
  const text = pickText(data);
  if (!text) return { ok: false, reason: 'EMPTY' };
  // 本地小模型一般不给思考过程；万一给了也照样带回去
  const thinking = trimThinking(pickThinking(data), cfg.thinkingMaxChars);
  return { ok: true, text: text, thinking: thinking, provider: 'ollama', model: data.model || cfg.localModel };
}

/**
 * 问一次模型。永远不 throw，失败用 ok:false + reason 表达。
 * @returns {Promise<{ok:boolean, reason?:string, text?:string, provider?:string, model?:string}>}
 */
async function chat(opts) {
  const cfg = loadConfig();
  const provider = await resolveProvider();
  if (provider === 'kb') return { ok: false, reason: 'NO_MODEL' };
  try {
    return provider === 'ollama' ? await callLocal(opts, cfg) : await callCloud(opts, cfg);
  } catch (e) {
    const reason = (e && e.name === 'TimeoutError') ? 'TIMEOUT' : 'NETWORK_ERR';
    console.warn('[ai] 调模型失败(' + provider + '/' + reason + ')：', (e && e.message) || e);
    return { ok: false, reason: reason };
  }
}

module.exports = {
  loadConfig: loadConfig,
  chat: chat,
  status: status,
  probeCloud: probeCloud,
  ollamaStatus: ollamaStatus,
  ollamaInstalled: ollamaInstalled,
  ollamaExe: ollamaExe,
  ollamaRunning: ollamaRunning,
  resolveProvider: resolveProvider,
  setRuntime: setRuntime,
  getRuntime: getRuntime,
  maskKey: maskKey,
  isEnabled: function () { return loadConfig().cloudEnabled; },
  CONFIG_FILE: CONFIG_FILE,
  DEFAULT_LOCAL_MODEL: DEFAULT_LOCAL_MODEL
};
