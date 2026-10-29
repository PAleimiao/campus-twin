// ai-setup.js —— 开机自检：联网？密钥能用？要不要本地跑个小模型？
//
// 流程（全部可跳过，绝不阻塞服务启动）：
//   1. 探网络 + 验密钥   → 能用就直接用云端，打印「密钥已确认，可正常连通使用」
//   2. 密钥缺失/失效/欠费 → 打印原因 + 「本次已切换至本地预设模式」
//   3. 本机已经装了本地模型 → 直接启用，不再打扰
//   4. 都没有 → 终端问一句：要不要本机跑个本地小模型？[y/N]
//      选 y：检测 Ollama，没装就问要不要下载安装，装完拉一个小模型（默认 qwen2.5:0.5b，约 400MB）
//      选 n：老老实实用本地预设知识库
//
// 跳过方式：AI_SETUP=skip / --no-ai-setup / AI_PROVIDER=xxx / 非交互环境（如被脚本拉起）
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

const ai = require('./ai');

const OLLAMA_INSTALLER = 'https://ollama.com/download/OllamaSetup.exe';

// 项目自带的「离线包」：local-ai/OllamaSetup.exe + local-ai/models/（Modelfile + *.gguf）
// 有了它，换台没网的机器也能直接装，不用现下载。
const BUNDLE_DIR = path.join(__dirname, 'local-ai');
const BUNDLE_INSTALLER = path.join(BUNDLE_DIR, 'OllamaSetup.exe');
const BUNDLE_MODEL_DIR = path.join(BUNDLE_DIR, 'models');
const BUNDLE_MODELFILE = path.join(BUNDLE_MODEL_DIR, 'Modelfile');

function mb(file) {
  try { return Math.round(fs.statSync(file).size / 1048576) + 'MB'; } catch (e) { return '?MB'; }
}

function bundledInstaller() {
  return fs.existsSync(BUNDLE_INSTALLER) ? BUNDLE_INSTALLER : null;
}

function bundledModelfile() {
  return fs.existsSync(BUNDLE_MODELFILE) ? BUNDLE_MODELFILE : null;
}

const SKIP = process.argv.includes('--no-ai-setup') ||
  String(process.env.AI_SETUP || '').trim().toLowerCase() === 'skip';

function canAsk() {
  return !!(process.stdin.isTTY && process.stdout.isTTY);
}

// 问一个是/否。非交互或超时都用默认值，绝不卡住启动。
function ask(question, def, timeoutMs) {
  const isYes = (s) => { const a = String(s || '').trim().toLowerCase(); return a === 'y' || a === 'yes'; };
  if (SKIP || !canAsk()) {
    console.log('    ' + question + '  → 默认 ' + (def === 'Y' ? '是' : '否') + (SKIP ? '（已跳过自检）' : '（非交互环境）'));
    return Promise.resolve(def === 'Y');
  }
  return new Promise((resolve) => {
    let done = false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const finish = (v) => { if (done) return; done = true; try { rl.close(); } catch (e) { } resolve(v); };
    const timer = setTimeout(() => {
      console.log('    （等待超时，按默认 ' + (def === 'Y' ? '是' : '否') + ' 处理）');
      finish(def === 'Y');
    }, timeoutMs || 60000);
    rl.question('  ' + question + ' ', (ans) => {
      clearTimeout(timer);
      const a = String(ans || '').trim();
      finish(a === '' ? def === 'Y' : isYes(a));
    });
  });
}

function waitEnter(question, timeoutMs) {
  if (SKIP || !canAsk()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const finish = () => { if (done) return; done = true; try { rl.close(); } catch (e) { } resolve(true); };
    const timer = setTimeout(finish, timeoutMs || 15 * 60 * 1000);
    rl.question('  ' + question, () => { clearTimeout(timer); finish(); });
  });
}

function run(cmd, args, opts, tag, timeoutMs) {
  return new Promise((resolve) => {
    let p;
    try {
      p = spawn(cmd, args, Object.assign({ windowsHide: true }, opts || {}));
    } catch (e) {
      return resolve({ ok: false, code: 'SPAWN_FAIL' });
    }
    if (tag) console.log('  [AI自检] ' + tag + '…');
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => {
      if (tag) console.log('  [AI自检] ' + tag + '超时');
      try { p.kill(); } catch (e) { }
      fin({ ok: false, code: 'TIMEOUT' });
    }, timeoutMs || 20 * 60 * 1000);
    const pipe = (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log('    ' + l.trim()));
    if (p.stdout) p.stdout.on('data', pipe);
    if (p.stderr) p.stderr.on('data', pipe);
    p.on('error', () => { clearTimeout(timer); fin({ ok: false, code: 'ENOENT' }); });
    p.on('close', (c) => { clearTimeout(timer); fin({ ok: c === 0, code: c }); });
  });
}

// 下载 Ollama 安装包（只下载 + 启动安装程序，剩下的几步交给用户点，不擅自静默安装）
async function downloadInstaller() {
  const dest = path.join(os.tmpdir(), 'OllamaSetup.exe');
  console.log('  [AI自检] 正在下载 Ollama 安装包（约 90MB）…');
  try {
    const res = await fetch(OLLAMA_INSTALLER, { signal: AbortSignal.timeout(5 * 60 * 1000) });
    if (!res.ok || !res.body) {
      console.log('  [AI自检] 下载失败（HTTP ' + res.status + '），请手动到 https://ollama.com/download 装一下。');
      return null;
    }
    const { Readable } = require('stream');
    const ws = fs.createWriteStream(dest);
    let got = 0;
    let shown = 0;
    await new Promise((resolve, reject) => {
      Readable.fromWeb(res.body).on('data', (c) => {
        got += c.length;
        if (got - shown > 20 * 1024 * 1024) {
          shown = got;
          console.log('  [AI自检] 已下载 ' + Math.round(got / 1024 / 1024) + 'MB…');
        }
      }).pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    console.log('  [AI自检] 下载完成：' + dest + '（' + Math.round(got / 1024 / 1024) + 'MB）');
    return dest;
  } catch (e) {
    console.log('  [AI自检] 下载失败：' + ((e && e.message) || e) + '，请手动到 https://ollama.com/download 装一下。');
    return null;
  }
}

// 优先用项目自带的模型文件导入（离线可用，不用下载）
async function importBundledModel(model, modelfile) {
  console.log('  [AI自检] 用项目自带的模型文件导入（离线可用，不联网）：' + path.basename(modelfile));
  const r = await run(ai.ollamaExe(), ['create', model, '-f', path.basename(modelfile)],
    { cwd: path.dirname(modelfile) }, '导入模型 ' + model, 10 * 60 * 1000);
  if (!r.ok) {
    console.log('  [AI自检] 导入失败，改从网上拉。');
    return false;
  }
  console.log('  [AI自检] 模型就绪（本地文件导入）：' + model);
  return true;
}

// 兜底：联网拉
async function pullModel(model) {
  console.log('  [AI自检] 项目里没带模型文件，正在联网拉取 ' + model + '（约 400MB，看网速）…');
  const r = await run(ai.ollamaExe(), ['pull', model], {}, 'ollama pull ' + model, 30 * 60 * 1000);
  if (!r.ok) {
    console.log('  [AI自检] 拉取失败。可以手动试：ollama pull ' + model);
    return false;
  }
  console.log('  [AI自检] 模型就绪：' + model);
  return true;
}

async function waitForOllama(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 20000)) {
    if (await ai.ollamaRunning()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 保证本地模型可用：没装→问装；没起→起；没模型→拉
async function ensureLocal(cfg) {
  const model = cfg.localModel || ai.DEFAULT_LOCAL_MODEL;
  let st = await ai.ollamaStatus();

  if (!st.installed) {
    console.log('  [AI自检] 本机没检测到 Ollama（本地模型运行时）。');
    const bundled = bundledInstaller();
    let exe = null;
    if (bundled) {
      // 项目里带了安装包 → 直接装，不联网
      console.log('  [AI自检] 项目里自带安装包 local-ai/OllamaSetup.exe（' + mb(bundled) + '），不用下载。');
      const yes = await ask('现在从本地文件夹安装 Ollama 吗？[y/N]', 'N', 60000);
      if (!yes) return false;
      exe = bundled;
    } else {
      const yes = await ask('要不要现在下载安装 Ollama？（约 90MB，装完还要拉约 400MB 的小模型）[y/N]', 'N', 60000);
      if (!yes) return false;
      exe = await downloadInstaller();
      if (!exe) return false;
    }
    console.log('  [AI自检] 已打开安装程序，按提示装完（一路下一步即可）。');
    try {
      const p = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
      p.unref();
    } catch (e) {
      console.log('  [AI自检] 启动安装程序失败，请手动打开：' + exe);
    }
    await waitEnter('  装完后回到这个窗口按回车继续…', 15 * 60 * 1000);
    st = await ai.ollamaStatus();
    if (!st.installed) {
      console.log('  [AI自检] 还是没检测到 ollama（可能没装完，或需要重开一个终端）。本次用本地预设。');
      return false;
    }
  }

  if (!st.running) {
    console.log('  [AI自检] 正在启动本地模型服务（ollama serve）…');
    try {
      const p = spawn(ai.ollamaExe(), ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
    } catch (e) {
      /* 起不来下面会检测到 */
    }
    if (!(await waitForOllama(25000))) {
      console.log('  [AI自检] 本地模型服务没起来。本次用本地预设。');
      return false;
    }
  }

  const has = (st.models || []).some((m) => String(m) === model || String(m).split(':')[0] === model.split(':')[0]);
  if (!has) {
    // 先用项目自带的模型文件（离线），没有再联网拉
    const mf = bundledModelfile();
    if (mf && await importBundledModel(model, mf)) return true;
    if (!(await pullModel(model))) return false;
  }
  return true;
}

// 把选择写回 ai.config.json（只在用户明确同意时）
function persistProvider(value) {
  try {
    const p = ai.CONFIG_FILE;
    let cfg = {};
    if (fs.existsSync(p)) {
      cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    cfg.provider = value;
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('  [AI自检] 已写入 ai.config.json：provider = ' + value);
  } catch (e) {
    console.log('  [AI自检] 写入配置失败（不影响本次运行）：' + ((e && e.message) || e));
  }
}

const CLOUD_MSG = {
  OK: '密钥已确认，可正常连通使用',
  NO_KEY: '没检测到 API 密钥',
  AUTH: '密钥没通过校验（可能被删了或复制时少了几位）',
  NO_BALANCE: '请检查 API 密钥余额是否充足',
  OFFLINE: '没检测到网络（或访问不通）',
  TIMEOUT: '连接超时，网络可能不通'
};

/**
 * 开机自检主流程。返回最终 provider：'mimo' | 'ollama' | 'kb'
 * 任何异常都被吞掉，最差也是回到 'kb'（本地知识库）。
 */
async function preflight() {
  if (SKIP) {
    console.log('  （AI 自检已跳过：AI_SETUP=skip，走 ai.config.json 的配置）');
    return 'auto';
  }
  console.log('  [AI自检] 正在检测…');
  try {
    const cfg = ai.loadConfig();

    // 用户在配置里写死了 provider，就尊重配置，不探测不打扰
    if (cfg.provider === 'kb') {
      console.log('  [AI自检] 配置为只使用本地预设知识库（provider=kb），跳过检测。');
      ai.setRuntime({ provider: 'kb' });
      return 'kb';
    }
    if (cfg.provider === 'ollama') {
      console.log('  [AI自检] 配置为本地模型（provider=ollama），略过云端检测。');
      const ok = await ensureLocal(cfg);
      ai.setRuntime({ provider: ok ? 'ollama' : 'kb' });
      return ok ? 'ollama' : 'kb';
    }

    // 1) 探网络 + 验密钥
    const probe = await ai.probeCloud();
    if (probe.status === 'OK') {
      console.log('  [AI自检] 已联网；' + CLOUD_MSG.OK + '（模型 ' + cfg.model + '）。');
      ai.setRuntime({ provider: 'mimo' });
      return 'mimo';
    }

    const why = CLOUD_MSG[probe.status] || ('云端接口异常（' + probe.status + '）');
    console.log('  [AI自检] ' + (probe.status === 'NO_KEY' && !probe.online ? '没检测到网络，且' : '') + why + '；本次已切换至本地预设模式。');
    if (probe.status === 'NO_KEY') {
      console.log('           想用云端：把 ai.config.example.json 复制成 ai.config.json 并填 apiKey。');
    }
    ai.setRuntime({ provider: 'kb' });

    // 2) 本机已经有本地模型 → 直接用，不再问
    const st = await ai.ollamaStatus();
    if (st.running && (st.models || []).length) {
      console.log('  [AI自检] 检测到本机本地模型服务已在跑（' + (st.models[0] || cfg.localModel) + '），直接启用。');
      console.log('           本地小模型默认「知识库优先」：常见问题仍走又快又准的知识库，答不上来才问它。');
      ai.setRuntime({ provider: 'ollama' });
      return 'ollama';
    }

    // 3) 问一句要不要本机跑
    const yes = await ask('要不要在本机跑一个本地小模型？（默认 ' + cfg.localModel + '，约 400MB，纯 CPU 也能跑，离线可用）[y/N]', 'N', 30000);
    if (!yes) {
      console.log('  [AI自检] 好的，本次使用本地预设模式（内置校园制度知识库，离线可用）。');
      return 'kb';
    }
    const ok = await ensureLocal(cfg);
    if (!ok) {
      console.log('  [AI自检] 本地模型没就绪，本次使用本地预设模式。');
      return 'kb';
    }
    console.log('           本地小模型默认「知识库优先」（想每题都问它就在 ai.config.json 里加 "localMode": "llm-first"，但会慢）。');
    ai.setRuntime({ provider: 'ollama', localModel: cfg.localModel });
    const remember = await ask('记住这个选择吗？（以后开机默认用本地模型）[y/N]', 'N', 20000);
    if (remember) persistProvider('ollama');
    return 'ollama';
  } catch (e) {
    console.log('  [AI自检] 自检出错了（不影响服务）：' + ((e && e.message) || e));
    ai.setRuntime({ provider: 'kb' });
    return 'kb';
  }
}

module.exports = {
  preflight: preflight,
  SKIP: SKIP,
  bundle: {
    dir: BUNDLE_DIR,
    installer: bundledInstaller,
    modelfile: bundledModelfile
  }
};
