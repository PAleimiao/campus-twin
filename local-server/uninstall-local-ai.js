/**
 * 卸载本地 AI（Ollama 运行时 + 本地模型文件）
 * ---------------------------------------------------------------
 * 这是【独立脚本】，跟演示模式（关窗口自动还原数据）没有任何关系，
 * 也不动你的账号数据、资讯、图片。它只做一件事：把本机装的本地模型那一套删掉。
 *
 * 用法：
 *   双击 卸载本地AI.bat          交互式，每一步都问你
 *   node uninstall-local-ai.js -y   全自动（不问，直接卸）
 *   node uninstall-local-ai.js --check   只看现状，什么都不删
 *
 * 卸载完程序不受影响：没本地模型时会自动用云端，云端也没有就用内置知识库。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const YES = process.argv.indexOf('-y') >= 0 || process.argv.indexOf('--yes') >= 0;
const CHECK = process.argv.indexOf('--check') >= 0;

const L = (s) => console.log(s);

// 只在真人面前才提问；非交互环境（比如被别的脚本调起）一律走默认值，绝不卡住
function canAsk() {
  return process.stdin && process.stdin.isTTY && !YES;
}

function ask(question, def) {
  if (YES) { L('  ' + question.replace(/\[y\/N\]/, '') + '  -> 是（-y 模式）'); return Promise.resolve(true); }
  if (!canAsk()) { L('  ' + question.replace(/\[y\/N\]/, '') + '  -> 否（非交互环境，默认不删）'); return Promise.resolve(false); }
  return new Promise((resolve) => {
    let done = false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const fin = (v) => { if (done) return; done = true; try { rl.close(); } catch (e) { } resolve(v); };
    const timer = setTimeout(() => { L('    超时未选择，当作「否」'); fin(false); }, 60000);
    rl.question('  ' + question + ' ', (a) => {
      clearTimeout(timer);
      const s = String(a || '').trim().toLowerCase();
      fin(s === '' ? def === 'Y' : (s === 'y' || s === 'yes'));
    });
  });
}

// ollama.exe 在哪（刚装完 PATH 可能没刷新，所以先看默认安装目录）
function ollamaExe() {
  const known = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe')
  ];
  const hit = known.find((f) => f && fs.existsSync(f));
  if (hit) return hit;
  try {
    const r = spawnSync('where', ['ollama'], { encoding: 'utf8', windowsHide: true });
    const first = String(r.stdout || '').trim().split(/\r?\n/)[0];
    if (first && fs.existsSync(first)) return first;
  } catch (e) { }
  return '';
}

// Ollama 的卸载程序（Inno Setup 装的，卸载器叫 unins000.exe）
function uninstaller() {
  const dirs = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama')
  ];
  for (const d of dirs) {
    const u = path.join(d, 'unins000.exe');
    if (fs.existsSync(u)) return u;
  }
  return '';
}

function runSync(cmd, args) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
    return { ok: r.status === 0, out: String(r.stdout || '') + String(r.stderr || '') };
  } catch (e) {
    return { ok: false, out: String((e && e.message) || e) };
  }
}

function sizeOf(p) {
  if (!fs.existsSync(p)) return null;
  let mb = 0;
  const walk = (d) => {
    let items = [];
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const f of items) {
      const fp = path.join(d, f.name);
      if (f.isDirectory()) walk(fp);
      else { try { mb += fs.statSync(fp).size; } catch (e) { } }
    }
  };
  walk(p);
  return Math.round(mb / 1048576);
}

function rmDir(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); return true; } catch (e) { return false; }
}

(async function main() {
  L('');
  L('=========== 卸载本地 AI（Ollama + 本地模型）===========');
  L('说明：只删本地模型那一套，不动你的账号/资讯/图片数据。');
  L('');

  const exe = ollamaExe();
  const unins = uninstaller();
  const modelDir = path.join(os.homedir(), '.ollama', 'models');
  const modelSize = sizeOf(modelDir);
  const appDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama');

  let models = [];
  if (exe) {
    const r = runSync(exe, ['list']);
    models = String(r.out || '').split(/\r?\n/).slice(1)
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((m) => m && m.indexOf('NAME') !== 0);
  }

  L('  当前状态：');
  L('    Ollama 程序   : ' + (exe ? '已安装（' + exe + '）' : '未安装'));
  L('    本地模型     : ' + (models.length ? models.join('、') + '（' + (modelSize === null ? '?' : modelSize) + 'MB）' : '无'));
  L('    卸载程序     : ' + (unins ? '已找到' : '未找到（可能已经卸了）'));
  L('');

  if (CHECK) { L('（--check 模式：只看不删）'); return; }

  if (!exe && !unins && (!modelSize || modelSize === 0)) {
    L('  本机没有装本地 AI，不用卸。');
    return;
  }

  if (!(await ask('确认卸载？[y/N]', 'N'))) { L('  已取消，什么都没动。'); return; }

  // 1) 停掉本地模型服务
  L('');
  L('  [1/5] 停止本地模型服务…');
  const k = runSync('taskkill', ['/F', '/IM', 'ollama.exe']);
  L('        ' + (k.out.indexOf('成功') >= 0 || k.ok ? '已停止' : '本来就没在跑'));

  // 2) 删模型（先让 ollama 自己删，删不干净后面再清目录）
  L('  [2/5] 删除本地模型…');
  if (exe && models.length) {
    for (const m of models) {
      const r = runSync(exe, ['rm', m]);
      L('        ' + (r.ok ? '已删除 ' + m : '删除失败 ' + m + '（后面直接清目录）'));
    }
  } else {
    L('        没有可删的模型，跳过');
  }

  // 3) 卸载 Ollama 程序
  L('  [3/5] 卸载 Ollama 程序…');
  if (unins) {
    const r = runSync(unins, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES']);
    L('        ' + (r.ok ? '卸载程序已执行完成' : '卸载程序返回非 0（可能要手动确认一下）'));
  } else {
    L('        没找到卸载程序；如果还残留，去 Windows 设置 → 应用 → 搜索 Ollama → 卸载');
  }

  // 4) 清残留目录（模型文件占大头）
  L('  [4/5] 清理残留文件…');
  const leftovers = [
    { p: modelDir, name: '模型目录（' + (modelSize === null ? 0 : modelSize) + 'MB）' },
    { p: appDir, name: 'Ollama 安装目录' },
    { p: path.join(process.env.LOCALAPPDATA || '', 'Ollama'), name: 'Ollama 数据目录' }
  ];
  for (const it of leftovers) {
    if (!fs.existsSync(it.p)) { L('        ' + it.name + '：不存在，跳过'); continue; }
    const sz = sizeOf(it.p) || 0;
    const ok = rmDir(it.p);
    L('        ' + it.name + '：' + (ok ? '已删除（腾出 ' + sz + 'MB）' : '删除失败，可能被占用，手动删：' + it.p));
  }

  // 5) 把配置里的「固定走本机模型」改回自动，免得卸完还去找已经不存在的本地模型
  L('  [5/5] 恢复配置…');
  const cfgPath = path.join(__dirname, 'ai.config.json');
  try {
    if (fs.existsSync(cfgPath)) {
      const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      let changed = false;
      if (j.provider === 'ollama') { j.provider = 'auto'; changed = true; }
      if (changed) {
        fs.writeFileSync(cfgPath, JSON.stringify(j, null, 2), 'utf8');
        L('        ai.config.json：provider 已改回 auto（自动选择云端/知识库）');
      } else {
        L('        ai.config.json：无需改动（密钥保留着，不受影响）');
      }
    } else {
      L('        ai.config.json：不存在，跳过');
    }
  } catch (e) {
    L('        ai.config.json 读取失败（跳过，不影响）：' + ((e && e.message) || e));
  }

  L('');
  L('=========== 卸载完成 ===========');
  L('  · Ollama 与本地模型已移除');
  L('  · 你的小米密钥、账号数据、资讯图片都没动');
  L('  · 以后还想用本地模型：双击 启动本地服务.bat，自检会问你要不要装，装完照样能用');
  L('    （项目里还留着离线安装包 local-ai/，想装随时能装，不用重新下载）');
  L('');
})();
