# 广演校园 · 本地后端（可替代微信云开发）

把原来跑在「微信云开发」上的 6 个云函数，**1:1 移植成一个本地 Node 服务**，数据存本地 JSON 文件。
不用开通云环境、不用上传部署云函数，电脑上双击一个 bat 就能跑，学生端/教师端照常登录。

- 零第三方依赖：只用 Node 内置模块，**不需要 `npm install`**
- 接口路径：`POST http://localhost:8080/api/<函数名>`，入参出参与原云函数完全一致
- 数据文件：`local-server/data/db.json`（删掉它 = 清空数据重来）
- 图片目录：`local-server/public/uploads/`（教师端上传的轮播图/资讯配图）

> 想切回微信云开发：把两端 `config.js` 的 `backend` 改成 `'cloud'` 即可，详见文末。

---

## 一、启动（30 秒搞定）

### 方式 A：双击（推荐）
双击 `启动本地服务.bat`。它会依次做四件事：

1. **确保有 Node**：先自动检测（PATH / `.runtime` / Program Files / WorkBuddy 运行时）；
   找不到就**自动下载免安装版 Node**（国内镜像 `registry.npmmirror.com`，无需管理员权限）解压到
   `local-server\.runtime\` 直接用；下载不通再退到静默安装 MSI，最后退到弹出官方安装器（脚本会等待并检测安装结果）。
2. 首次运行自动写入演示数据（`data\db.json` 不存在时）。
3. 若 `package.json` 声明了依赖才跑 `npm install`（本项目零依赖，会跳过）。
4. 启动服务，**窗口保持打开**；关掉窗口即停服。

> 引导逻辑在 `scripts\ensure-node.ps1`（纯 ASCII，避免中文编码问题）。
> 脚本窗口提示为英文，对照见根目录 `操作手册.md` 第 2 节。

### 方式 B：命令行
```bash
cd campus-twin/local-server
node seed.js     # 第一次跑，写入演示账号（已有数据会跳过）
node server.js   # 启动服务
```

看到下面这段就说明起来了：

```
广演校园 · 本地后端已启动
本机访问 : http://localhost:8080
真机调试 : http://192.168.x.x:8080   (小程序里填 http://192.168.x.x:8080/api)
图片目录 : ...\local-server\public\uploads
```

> 没装 Node？去 https://nodejs.org/ 装 18+ 版本（一路下一步），再双击 bat。

浏览器打开 http://localhost:8080/ 能看到 JSON，就说明服务是活的。

### 端口起不来怎么办（`EACCES` / `EADDRINUSE`）

Windows 的 Hyper-V / WSL / Docker 会把某一段端口随机划成「**排除端口**」，落在里面 `listen` 会直接报
`Error: listen EACCES: permission denied 0.0.0.0:8080`，而且这个范围**每次重启都会重新分配**。

服务已经内置了处理：**自动顺延到下一个可用端口**，并在窗口里明确提示改配置文件：

```
⚠ 端口 8080 不可用（被占用 / Windows 保留端口），已自动改用 8088
  → 请把两端 config.js 的 apiBase 改成 http://localhost:8088/api
```

想自己指定（推荐，端口稳定就不会每次改配置）：

```bash
set PORT=8123 && node server.js      # cmd
$env:PORT=8123; node server.js       # PowerShell
```

同时把两端 `config.js` 的 `apiBase` 端口改成一样的。

想查当前哪些端口被 Windows 排除了：

```bash
netsh int ipv4 show excludedportrange protocol=tcp
```

想彻底释放这一段（管理员 PowerShell）：

```powershell
net stop winnat
net start winnat
```

---

## 二、小程序端怎么连

两端 `config.js` 里确认这两个值：

```js
backend: 'local',                        // 'local' = 本地服务；'cloud' = 微信云开发
apiBase: 'http://localhost:8080/api',    // 模拟器 / 开发者工具
```

真机预览/真机调试时，把 `localhost` 换成**电脑的局域网 IP**（服务启动时会打印）：

```js
apiBase: 'http://192.168.1.20:8080/api',
```

并在微信开发者工具里勾选：**详情 → 本地设置 → 不校验合法域名**（两端的 `project.config.json`
里已经是 `urlCheck: false`，一般不用再动）。

---

## 二·三·五、开机自检：自动决定用云端 / 本机 / 本地预设

每次启动（双击 bat 或 `node server.js`）都会先跑一段自检，不用你管：

```
[AI自检] 正在检测…
[AI自检] 已联网；密钥已确认，可正常连通使用（模型 mimo-v2.6-flash）。
```

| 检测到的情况 | 终端提示 | 会怎么做 |
| --- | --- | --- |
| 已联网 + 密钥有效 | 密钥已确认，可正常连通使用 | 用云端模型 |
| 没填密钥 | 没检测到 API 密钥 | 本次已切换至本地预设模式 |
| 密钥无效/被删 | 密钥没通过校验 | 本次已切换至本地预设模式 |
| 余额不足 | 请检查 API 密钥余额是否充足 | 本次已切换至本地预设模式 |
| 没联网 / 超时 | 没检测到网络 | 本次已切换至本地预设模式 |

落到本地预设后，如果**本机已经装了 Ollama 且模型在跑**，会直接启用本地模型，不再问你：

```
[AI自检] 检测到本机本地模型服务已在跑（qwen2.5:0.5b），直接启用。
```

否则会问一句（默认否，30 秒不答也算否）：

```
要不要在本机跑一个本地小模型？（默认 qwen2.5:0.5b，约 400MB，纯 CPU 也能跑，离线可用）[y/N]
```

- 选 **n**：老老实实用内置知识库（离线可用，最省心）
- 选 **y**：
  1. 没装 Ollama → 问要不要下载安装（约 90MB）→ 装完按回车继续
  2. 自动 `ollama serve` 起服务
  3. 自动 `ollama pull qwen2.5:0.5b`（约 400MB，首次要看网速）
  4. 再问一次「记住这个选择吗？」——选 y 才写进 `ai.config.json`（`provider: "ollama"`），否则只对本次生效

> 说明：本机没装 winget，所以安装这一步是**下载并帮你打开安装程序**，点几下「下一步」就完事，
> 不会在后台偷偷静默安装。装完回来按回车，剩下的（起服务、拉模型）都是自动的。

### 项目自带离线包：换台没网的机器也能装

```
local-server/local-ai/
  OllamaSetup.exe                          672MB   Ollama 安装包（v0.11.10）
  models/Modelfile                                 模型定义（FROM 指向下面的 gguf）
  models/qwen2.5-0.5b-instruct-q4_k_m.gguf 379MB  模型本体
```

开机自检会**优先吃文件夹里的东西**，完全不用联网：

```
本机没有 Ollama  →  直接用 local-ai/OllamaSetup.exe 装（不下载）
装完没有模型     →  直接从 local-ai/models 的 gguf 导入（不 pull）
都没有/失败了    →  才退回去联网下载
```

对应终端提示：

```
[AI自检] 本机没检测到 Ollama（本地模型运行时）。
[AI自检] 项目里自带安装包 local-ai/OllamaSetup.exe（672MB），不用下载。
  现在从本地文件夹安装 Ollama 吗？[y/N]
[AI自检] 用项目自带的模型文件导入（离线可用，不联网）：Modelfile
```

> 这个目录已经写进 `.gitignore`（合计约 1GB，塞进仓库会很难受）。
> **拷文件夹 / U 盘带着走不受影响**，git 不跟踪而已。想让它进仓库，把 `.gitignore` 里 `local-ai/` 那行删掉。
> 想换更大的模型：下载新的 gguf 放进 `local-ai/models/`，改 `Modelfile` 的 `FROM`，再把 `ai.config.json` 的 `localModel` 改成对应名字。

### AI 能读到你的真实数据（课表 / 公告 / 成绩 / 请假）

AI 答疑不是只背话术——当问题涉及**个人数据**时，后端会先把当前登录学生的真实数据抓出来喂给模型：

| 你问 | AI 查什么 | 回答里有什么 |
| --- | --- | --- |
| 我周三有什么课 | 该班课表（timetable） | 真实课程、老师、教室、节次 |
| 老师最近发了什么通知 | 可见公告（announcements） | 真实标题、发布人、日期、要点 |
| 我考得怎么样 | 成绩（scores） | 真实分数 |
| 我的请假批了吗 | 请假记录（leaves） | 真实状态与备注 |
| 最近有什么资讯 | 校园资讯（news） | 真实标题与摘要 |

规则：

- **没登录 / token 失效**：拿不到个人数据，AI 会直说"没查到，建议去相应入口查看"，不会编。
- 关键词命中才查（比如问题里有"课""通知""成绩"），普通制度问题不多花一次查询。
- 有真实数据可答时，知识库的关键词短答会让位给模型，避免答非所问。
- 数据接口全部复用现成查询函数（自带鉴权），不存在越权读取别人数据的问题。

### 学生端显示「AI 思考过程」

默认开启：云端大模型回答时，会把它**怎么想到这个答案的过程**一起带回来，学生端气泡上方出现一行
「◌ 查看思考过程（xx 字）」，点一下展开，再点收起（默认收起，不打扰看答案）。

| 通道 | 有没有思考过程 |
| --- | --- |
| 云端大模型（MiMo） | ✅ 有（接口返回的 `reasoning_content`） |
| 本机本地模型（Ollama） | 一般没有（小模型不产出），万一有也照常显示 |
| 本地知识库 | 没有（本来就是查表，没有推理过程） |

开关在 `ai.config.json`：

```json
"showThinking": true,      // 设 false 关掉（略省 token）
"thinkingMaxChars": 600    // 最多显示多少字，超出截断并标注「已省略」
```

也可以用环境变量临时关：`set AI_THINKING=0 && node server.js`。

> 终端那边**不打思考内容**（部分 Windows 终端中文会乱码），只打一行纯英文统计：`[ai] thinking: 44 chars`。

---

### 不想要本地 AI 了：卸载脚本

双击 **`卸载本地AI.bat`**（或 `node uninstall-local-ai.js`），一步步问着你来，默认都是「否」，不会误删。

它会做五件事：

| 步骤 | 干什么 |
| --- | --- |
| 1 | 停掉本地模型服务（`ollama.exe`） |
| 2 | 删掉本地模型（`ollama rm`） |
| 3 | 调用 Ollama 自带的卸载程序 |
| 4 | 清残留目录（模型文件占大头，几百 MB） |
| 5 | 把 `ai.config.json` 里写死的 `provider: "ollama"` 改回 `auto` |

**不会动**：你的小米密钥、账号密码、资讯、上传的图片。

其他用法：

```bat
node uninstall-local-ai.js --check    :: 只看现状，什么都不删
node uninstall-local-ai.js -y         :: 不问，直接卸（脚本里调它时用）
```

> 这个脚本跟「演示模式（关窗口自动还原数据）」是两回事：演示模式还原的是**业务数据**，
> 这个卸载的是**本地模型运行时**。卸完之后程序照常能用——有网有密钥就用云端，都没有就用内置知识库。
> 想再装回来，双击 `启动本地服务.bat`，自检问到的时候选 y 就行，安装包还在 `local-ai/` 里，不用重新下载。

---

### 本地模型已经装好了（这台机器）

- 运行时：Ollama，装在 `C:\Users\<你>\AppData\Local\Programs\Ollama\`
- 模型：`qwen2.5:0.5b`（397MB，纯 CPU 可跑）
- 它会**自动启用**：云端用不了时（没网 / 没密钥 / 欠费）自动顶上，不用你操作

三条通道的优先级：

```
云端 MiMo（联网 + 密钥有效）→ 本机 Ollama（云端不可用但本机装了）→ 内置知识库（都没有）
```

想手动指定：

| 目的 | 做法 |
| --- | --- |
| 强制走本机模型（演示离线场景） | `set AI_OFF=1 && node server.js` |
| 永久只用本机模型 | `ai.config.json` 里 `"provider": "ollama"` |
| 恢复自动 | 把 `provider` 改回 `auto` 或删掉这一行 |

`localMode`（只管本地模型）：`kb-first`（默认，知识库答不上来才问它，快且准）、`llm-first`（每题都问，明显更慢，小模型还容易瞎编，**不推荐**）。

不想自检（比如赶时间、或脚本里拉起服务）：

```bat
set AI_SETUP=skip && node server.js
node server.js --no-ai-setup
```

想固定用某条通道，在 `ai.config.json` 里写 `"provider": "mimo" | "ollama" | "kb" | "auto"`，
或用环境变量 `AI_PROVIDER=ollama`。

---

## 二·四、AI 答疑：接大模型（可选，不配也能用）

学生端「AI 答疑」默认用**内置校园制度知识库**回答（离线可用）。想让它更聪明，可以接一个大模型。

**第 1 步：拿密钥** —— 到 [小米 MiMo 开放平台](https://platform.xiaomimimo.com/) 注册、实名、在控制台建一个 API Key 并复制保存。

**第 2 步：填配置** —— 复制 `ai.config.example.json` 成 `ai.config.json`（同目录），把 `apiKey` 换成你的密钥：

```json
{
  "enabled": true,
  "apiKey": "sk-你的密钥",
  "model": "mimo-v2.6-flash",
  "baseUrl": "https://api.xiaomimimo.com/v1",
  "mode": "kb-first",
  "timeoutMs": 15000
}
```

**第 3 步：重启服务** —— 启动日志会显示当前用的是哪种：

```
AI 答疑   : 大模型 mimo-v2.6-flash（密钥 sk-x****abcd，知识库优先）
AI 答疑   : 本地知识库（未配置密钥，想接大模型看 ai.config.example.json）
```

### 工作模式

| `mode` | 行为 |
| --- | --- |
| `kb-first`（默认） | 问题命中本地知识库就直接答：**不联网、不花钱、毫秒级**；只有没命中才去问大模型 |
| `llm-first` | 每个问题都先问大模型，知识库只当上下文；更聪明，但每次都要联网、花 token |

知识库里有：请假、奖助学金、图书馆、作息时间、宿舍门禁、成绩查询、校园卡、失物招领。
改答案直接改 `functions.js` 里的 `CAMPUS_KB`。

### 三层兜底（断网也不翻车）

```
本地知识库命中 → 直接返回
      ↓ 没命中
大模型（配了 Key 才走） → 成功则返回，气泡标「AI 生成」
      ↓ 失败（断网 / 401 / 超时 15s）
兜底话术 → 气泡标「本地知识库」
```

任何一层都不会让小程序报错，也不会让用户干等。

### 密钥安全

- `ai.config.json` 已加入 `.gitignore`，**不会进仓库**；仓库里只有 `ai.config.example.json`
- 启动日志里的密钥是掩码（`sk-x****abcd`），不会明文打印
- 不想落文件就用环境变量：`set AI_API_KEY=sk-xxx && node server.js`（PowerShell：`$env:AI_API_KEY='sk-xxx'; node server.js`）
- 临时关掉大模型：`AI_OFF=1 node server.js`，或把 `enabled` 改成 `false`

### 换别家的模型

接口是 **OpenAI 兼容协议**，改 `baseUrl` + `model` 就能换成别家（DeepSeek、智谱、通义、Kimi 等）：

```json
{ "apiKey": "sk-xxx", "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat" }
```

---

## 二·五、演示模式（默认开启）：退出后自动还原

演示/答辩场景下最省事的用法：**演示过程中一切照常生效，关掉黑窗口后自动回到干净的初始状态**。

| 用法 | 行为 |
| --- | --- |
| 双击 `启动本地服务.bat` / `node server.js` | **演示模式**：本次改密码、发资讯、传图片都能走通；窗口关闭后还原成快照，下次演示从零开始 |

> `启动本地服务.bat` 内容是**纯 ASCII / 英文**，这是故意的：`cmd.exe` 解析不了 UTF-8 的 .bat（多字节字符会让它拆错行），GBK 又只对中文系统有效，所以启动器用 ASCII 才在任何语言环境都稳。项目里其它文件（js / json / md / ps1）仍然是 UTF-8。
| cmd 里跑 `启动本地服务.bat keep` | **保留模式**：改动真的存下来，适合当正式数据用 |
| `node server.js --keep` | **保留模式**（等价写法） |

还原的范围：账号回到初始密码 `123456`（强制改密状态也复位）、资讯/轮播图清空、`public/uploads/` 里的演示图片清掉。

实现上做了三层保险：

1. 启动时把 `data/db.snapshot.json`（干净的种子快照）覆盖到 `data/db.json`，并写一个带 pid 的会话标记
2. 正常退出（Ctrl+C / 关窗口 / `exit`）时还原快照 + 清空图片 + 删标记
3. 万一被强杀没走到第 2 步：下次启动发现标记里的 pid 已经不在了，会先还原再启动，并在窗口里提示

> 演示模式会把 `public/uploads/` 清空，因为这个目录本来就是给演示上传用的。
> 想长期保留图片就别用它，改跑 `--keep`。

---

## 三、演示账号（跑完 `node seed.js` 后）

| 角色 | 账号 | 初始密码 | 姓名 |
| --- | --- | --- | --- |
| 教师(管理员) | `T001` | `123456` | 演示老师 |
| 学生 | `20260001` | `123456` | 张三 |
| 学生 | `20260002` | `123456` | 李四 |
| 学生 | `20260003` | `123456` | 王五 |

首次登录会强制改密（和云端逻辑一致）。想恢复初始状态：`node seed.js --reset`。

---

## 四、接口一览

| 接口 | 说明 | 鉴权 |
| --- | --- | --- |
| `POST /api/login` | 账号密码登录，返回 token | 无 |
| `POST /api/changePassword` | 改密（唯一在「强制改密」状态下仍可用的接口） | token |
| `POST /api/getNews` | 学生端首页校园资讯（公开读，读不到就用前端兜底数据） | 无 |
| `POST /api/manageNews` | 资讯管理：`listAll` / `addBanner` / `addArticle` / `delete` | 教师 |
| `POST /api/importStudents` | 教师批量导入学生 | 教师 |
| `POST /api/seedOrg` | 初始化组织树与演示账号（需 `key`） | 种子口令 |
| `POST /api/upload` | **上传图片**（multipart），返回可直接当图片地址的 URL | 教师 |
| `GET /uploads/xxx.png` | 读取已上传的图片 | 无 |

想用浏览器/curl 自测，例如登录：

```bash
curl -X POST http://localhost:8080/api/login -H "Content-Type: application/json" -d "{\"account\":\"20260001\",\"password\":\"123456\",\"role\":\"student\"}"
```

---

## 五、图片上传（教师端「校园资讯」用）

教师端「校园资讯」管理页选图后，会调这个接口：

```
POST /api/upload
Content-Type: multipart/form-data
字段：file = 图片二进制；token = 教师登录令牌
```

成功返回：

```json
{ "code": "OK", "fileID": "http://localhost:8080/uploads/1697000000000_a1b2c3d4.png", "url": "同上", "size": 68421 }
```

约定与限制：

- 返回字段名刻意和 `wx.cloud.uploadFile` 的 `fileID` 对齐，所以云/本地两种模式在教师端共用同一段回填代码
- 单张 ≤ 5MB，只收 `png / jpg / jpeg / gif / webp`
- 文件名是「时间戳 + 随机串」，不会覆盖同名文件；同时对 `../` 这类路径穿越做了过滤
- 返回的是**绝对地址**（含 host 和端口），不能用相对路径——小程序 `image` 组件不认 `/uploads/xxx.png`
- 浏览器打开 http://localhost:8080/uploads/<文件名> 可以直接看图

> 真机调试时，上传得到的图片地址会是 `http://<电脑IP>:8080/uploads/...`，
> 手机和电脑要在同一个局域网，且服务不能关。

---

## 六、双模式切换

两端 `config.js` 里：

```js
backend: 'local',                 // 改成 'cloud' 就切回微信云开发
apiBase: 'http://localhost:8080/api',  // 'local' 模式用
cloudEnv: 'your-env-id',               // 'cloud' 模式用，两端必须填同一个环境 ID
```

切到 `'cloud'` 后，需要按 `cloud/README.md` 把 6 个云函数全部「上传并部署」，
并且跑一次 `seedOrg` 初始化数据。业务代码一行都不用改。

---

## 七、安全逻辑（与云端完全一致）

1. 密码用 Node 内置 `crypto.scrypt` 加盐哈希，库里永远不明文；
2. 连续输错 5 次锁定 10 分钟；
3. `mustChangePwd=true` 时，除 `changePassword` 外所有接口返回 `FORCE_PWD_CHANGE`；
4. 改密成功后该用户所有 token 作废，必须重新登录；
5. token 随机 32 字节，7 天过期；
6. 上传接口要校验教师身份，匿名和非教师传不了。

---

## 八、已知差别（本地模式 vs 云开发）

- 本地模式的数据是单文件 JSON，适合演示/开发/答辩；多人并发写入的场景还是得上真数据库。
- 真机调试走局域网 HTTP，仅限开发阶段；正式上线仍需 HTTPS + 备案域名。
- 服务关掉后，学生端/教师端会提示「连不上本地服务」，重启即可。
