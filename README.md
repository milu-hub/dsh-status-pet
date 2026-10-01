# DSH 工作状态桌宠 · DSH Status Pet

一只浮在 Windows 桌面上的桌宠：默认右下角是宠物本体，左上角是椭圆云对话框。它实时跟随 DeepSeek Harness 的工作状态，用中英文显示

`深度思考...` · `干活...` · `等待...` · `出错了...` · `ok!` · `吐泡泡...`

宠物形象使用仓库根目录的 `image.png`（已抠好的透明底图，自带 alpha 通道）。构建脚本只做「裁掉四周空白 + 缩放 + 留出气泡口袋」，不做抠图，所以边缘干净、没有白边。

## 功能

- **六种状态**：气泡文字 + 椭圆描边颜色一起跟着 DSH 走
- **中英文切换**：菜单里一键切，文字立即生效
- **对话框显隐** / **桌宠显隐**：菜单勾选，或点托盘图标；隐藏时窗口真正收起，不占屏幕也不挡鼠标
- **点击动效**：左键点宠物会被压扁再弹回（弹性缓动），伴随音效。
- **音效开关**：可关；`ok!` 时另有一声轻响
- **大小三档**：小 180 / 中 280 / 大 420，桌宠与气泡等比缩放
- **可拖动**：按住宠物随便拖，位置会被记住；菜单里有「回到右下角」和「回到左下角」
- **左右转向**：宠物跑到屏幕左半边就自动转身面向屏幕中央，**对话框跟着一起翻**（见下）
- **托盘图标**：就是宠物那张脸

## 界面与状态

| 界面显示（中 / 英） | 描边颜色 | 触发条件 |
|---|---|---|
| `深度思考...` / `Reasoning…` | 蓝 `#3f74e0` | 正在生成内容、但还没开始动工具 |
| `干活...` / `Working…` | 蓝 `#3f74e0` | 正在执行工具或命令，以及工具刚结束的 15 秒内（连续编辑文件会稳定停在这个状态） |
| `等待...` / `Waiting…` | 琥珀 `#e2a03c` | 出现审批或提问 |
| `出错了...` / `Error…` | 红 `#dc4b4b` | 本回合以错误结束（具体错误见 `pet.log`） |
| `ok!` | 亮绿 `#23b26d` | 本回合正常完成，显示约 4 秒后回到空闲 |
| `吐泡泡...` / `Bubbling…` | 灰蓝 `#8a94b8` | 没有打开的回合，或回合长时间无事件 |

除了文字，对话框的**椭圆描边颜色**也跟着状态走（切换是瞬时的，不会出现颜色和句子对不上的中间态）。宠物会在 `thinking`/`working` 时轻微呼吸，`waiting` 时左右小幅晃动，出错时对话框抖动一下，`ok!` 时有一声轻响。

### 交互

| 操作 | 效果 |
|---|---|
| 左键点宠物 | 压扁弹回 + 橡皮鸭吱声 |
| 按住宠物拖动 | 移动位置，松开后记住 |
| 左键点对话框 | 隐藏对话框（并发出更高的吱声） |
| 右键任意位置 | 原生菜单：显隐桌宠/对话框、音效、大小、语言、回到右下角、回到左下角、恢复默认、退出 |
| 托盘图标 | 左键切换桌宠显示；右键同一套菜单 |

### 左右两种朝向

桌宠有**两种朝向**，由它站在屏幕的哪一半决定，整只桌宠（宠物本体 + 对话框）一起翻：

| 站在 | 宠物 | 对话框 | 尖角 |
|---|---|---|---|
| 屏幕右半边（默认） | 窗口右下角，朝左（贴图原方向） | 窗口左上角 | 朝右下，指向宠物 |
| 屏幕左半边 | 窗口左下角，翻转朝右 | 窗口右上角 | 朝左下，指向宠物 |

拖动时一旦越过桌面中线就立刻转向，不用松手。对话框**不是**原地镜像：它整个翻过来，所以尖角始终指向宠物；里面的文字块会再翻回去，永远是从左到右正常阅读。两种朝向里气泡、尖角、文字的位置完全对称（`tools\measure-poses.js` 会在真实 DOM 上核实这一点）。

菜单里的两个归位动作各自带着朝向：

- **回到右下角（默认朝向）**：挪到右下角，恢复贴图原方向；
- **回到左下角（镜像朝向）**：挪到左下角，并切成镜像朝向。

设置保存在 `%APPDATA%\DSH Status Pet\settings.json`，重启后仍然生效。

## 目录结构

```text
dsh-status-pet/
├─ image.png                ← 桌宠外观来源（透明底图）
├─ LICENSE                  ← MIT
├─ README.md
├─ .gitignore               ← 忽略 node_modules/ 与 .shots/
├─ 启动桌宠.cmd              ← 双击启动
├─ 重启桌宠.cmd              ← 先结束旧进程再启动
├─ app/                     ← Electron 程序
│  ├─ package.json          ← 依赖清单（electron + fzstd）
│  ├─ pnpm-lock.yaml
│  ├─ pnpm-workspace.yaml   ← 允许 electron 的安装脚本执行
│  ├─ assets/               ← 由 image.png 生成：贴图、应用图标、托盘图标、音效
│  └─ src/
│     ├─ main/              ← 主进程
│     │  ├─ main.js         ← 窗口、托盘、IPC、设置持久化
│     │  ├─ status-reader.js← 读取会话日志 → 六种状态
│     │  ├─ placement.js    ← 窗口定位（左下/右下吸附、两种朝向、越界夹取）
│     │  ├─ menu.js         ← 中英双语菜单模板
│     │  └─ settings.js     ← 设置读写与校验
│     ├─ preload/preload.js ← contextBridge 安全桥
│     └─ renderer/          ← 界面
│        ├─ index.html      ← 椭圆云 SVG + 宠物
│        ├─ style.css       ← 两种朝向、气泡位置/大小、状态配色、动效
│        ├─ renderer.js     ← 状态渲染、朝向切换、点击压扁、拖动
│        ├─ sound.js        ← 橡皮鸭音效（Web Audio）
│        └─ strings.js      ← 中英文文案
└─ tools/                   ← 素材生成与验证脚本
   ├─ launch.js             ← 无控制台启动桌宠（.cmd 也用它）
   ├─ widget-geometry.js    ← 气泡/宠物几何的唯一出处，供各检查脚本共用
   ├─ png-alpha.js          ← 纯 zlib 读 PNG alpha 通道，检查脚本共用
   ├─ test-status.js        ← 状态机断言
   ├─ check-snap.js         ← 定位与朝向的单元断言
   ├─ check-layout.js       ← 按 alpha 通道逐像素的几何断言
   ├─ overlay-check.js      ← 气泡落点/覆盖量的调参视图
   ├─ pocket-probe.js       ← 从贴图扫出气泡可用空间
   ├─ measure-poses.js      ← 在 Electron 里量真实 DOM 的两种朝向
   ├─ measure-text.js       ← 量各语言文案占多宽，用来定字号
   ├─ inspect-live.js       ← 连到正在运行的桌宠，核对朝向并截图
   ├─ capture.js            ← 渲染截图与翻转断言
   ├─ check-main.js         ← 主进程/菜单自检（需 Electron）
   ├─ check-tray.js         ← 托盘自检（需 Electron）
   ├─ size-cycle.js         ← 三档尺寸端到端
   ├─ snap-cycle.js         ← 「回到角落」端到端
   ├─ state-labels.js       ← 回放会话日志，打印状态切换
   ├─ screen-capture.js     ← 屏幕截图辅助
   ├─ screenshot.ps1        ← 截取屏幕区域
   ├─ windows.ps1           ← 列出可见窗口（排查遮挡用）
   ├─ make_pet_asset.py     ← 生成贴图
   ├─ make_app_icon.py      ← 生成 app.ico / icon.png / tray.png
   ├─ make_squeak.py        ← 合成 squeak.wav
   ├─ inspect_wav.py        ← 查看 wav 波形/响度
   ├─ check_alpha.py        ← 查看抠图 alpha 分布
   ├─ check_encoding.py     ← 全仓源文件 UTF-8 校验
   ├─ free-rect.js          ← 贴图里最大空白矩形（口袋模型）
   ├─ probe-origin.js       ← transform-origin 百分比解析的一次性验证
   ├─ make_squeak_variants.py / squeak_spectrogram.py  ← 音效变体与频谱分析
```

## 运行

需要 Node.js + pnpm（用于拉取 Electron），首次安装要联网。

```powershell
cd app
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"   # 国内镜像更快，可省略
pnpm install
```

装完回到仓库根目录双击 `启动桌宠.cmd` 即可。也可以直接运行：

```powershell
.\app\node_modules\electron\dist\electron.exe .\app
```

> **坑**：从 Harness 自带的终端启动时，环境里可能带着 `ELECTRON_RUN_AS_NODE=1`，这会让 Electron 退化成普通 Node 解释器（报 `app` is undefined）。手动启动前先执行 `Remove-Item Env:ELECTRON_RUN_AS_NODE`；两个 `.cmd` 脚本已经处理了这一点。

## 状态是怎么读出来的

Harness 会把每个会话的完整事件流持久化到：

```text
%USERPROFILE%\.dsh\sessions\<工作区>\<session-id>\session*.jsonl.zstd
```

这个文件是**追加写**的，由一串**独立的 zstd 帧**拼成，每帧里是一条 JSON 事件。桌宠按字节偏移量持续 tail 最新被写入的会话文件，只解压新出现的帧，因此：

- 不需要给 Harness 打补丁，也不依赖它的内部接口；
- 无论会话日志多大，单次轮询只读增量，开销极小；
- 跟随的是**最近被写入**的会话 —— 所以桌面版、浏览器 WebUI、命令行三种界面都能跟，换界面不用改桌宠。

解压用纯 JS 的 [`fzstd`](https://www.npmjs.com/package/fzstd) 完成（Electron 33 自带的 Node 20 没有 `zlib.zstdDecompressSync`；若运行环境有原生实现会自动优先使用）。

### 两个容易误解的地方

**1. 不会把「干活中」误判成「空闲」**

Harness 是**按批落盘**的：一个回合（`turn/start` … `turn/end`）里，两步之间可能安静 20 秒以上。早期版本用「2.6 秒没新事件就算空闲」，于是编辑文件、跑长命令时桌宠会闪回「空闲...」。现在状态机以**回合是否结束**为准：

- 收到 `turn/start` 就记下「回合打开」，此后即使日志安静也保持 `干活...`／`深度思考...`；
- `turn/end` 才关闭回合：`completed` → `ok!` → 空闲，`error` → 出错了，`interrupted` → 空闲；
- 只有安静超过 120 秒（日志被截断、会话被强杀等异常）才降级为空闲；之后若同一回合还有事件，会自动回到忙碌状态。

**2. 编辑文件时显示「干活」而不是「深度思考」**

工具结束后的 15 秒内仍算「干活」，避免连续编辑时在两步之间闪回「深度思考」。只有真的停下来思考（超过 15 秒没有新工具）才切过去。

## 测试与验证

```powershell
# 状态机断言（25 项：六种状态、回合内静默、工具延续、错误摘要等）
node tools\test-status.js

# 窗口定位断言（左下/右下吸附、两种朝向、拖动位置、归位、越界夹取）
node tools\check-snap.js

# 气泡与宠物几何断言：按贴图 alpha 通道逐像素检查，两种朝向都查
node tools\check-layout.js

# 真实 DOM 断言：在 Electron 里量两种朝向的气泡/尖角/文字盒子，确认不被窗口裁掉
app\node_modules\electron\dist\electron.exe tools\measure-poses.js

# 线上实况断言：连到**正在运行**的桌宠，核对两种朝向的类名/transform/盒子并截图
# （先带调试端口启动：electron.exe . --remote-debugging-port=9222）
node tools\inspect-live.js left
node tools\inspect-live.js right

# 三档尺寸端到端切换（会重启桌宠并检查实际窗口尺寸）
node tools\size-cycle.js

# 「回到右下角」端到端（会重启桌宠，核对窗口坐标与朝向）
node tools\snap-cycle.js

# 主进程 / 托盘自检（需要 Electron）
app\node_modules\electron\dist\electron.exe tools\check-main.js
app\node_modules\electron\dist\electron.exe tools\check-tray.js

# 六种状态 + 两种朝向截图，并断言翻转传到了宠物、气泡和文字（输出到 .shots\）
app\node_modules\electron\dist\electron.exe tools\capture.js
```

调气泡位置时，这两个脚本不用启动 Electron 就能报数：

```powershell
# 打印气泡/尖角落点、压住多少宠物像素、离预算还剩多少
node tools\overlay-check.js 280
# 按贴图 alpha 通道扫出「口袋」边界：气泡最多能多宽多高
node tools\pocket-probe.js
```

用一个真实会话日志回放，可以打印每次状态切换：

```powershell
node tools\state-labels.js "$env:USERPROFILE\.dsh\sessions\<工作区>\<session-id>\session.v4.jsonl.zstd"
```

> 从 Harness 终端跑 Electron 之前先 `Remove-Item Env:ELECTRON_RUN_AS_NODE`，否则 Electron 会退化成 Node。

调试主进程时打开日志：

```powershell
$env:DSH_PET_DEBUG="1"
# 日志位置：%APPDATA%\DSH Status Pet\pet.log
```

## 素材与图标生成

```powershell
# 由 image.png 生成桌宠贴图（裁边 → 左侧/上方留出气泡口袋 → 正方形 PNG）
python tools\make_pet_asset.py

# 生成应用图标：app.ico（窗口/任务栏，多分辨率）、icon.png、tray.png（托盘）
python tools\make_app_icon.py

# 合成橡皮鸭吱吱声，并用频谱确认音高走向
python tools\make_squeak.py
python tools\inspect_wav.py app\assets\squeak.wav
```

`make_pet_asset.py` 会把主体放在一个**正方形画布的右下角**，左侧与上方留出约 42% 主体尺寸的透明区域——那块就是对话框的「口袋」。本仓库贴图里已绘制像素从画布 **x ≈ 0.335、y ≈ 0.30** 开始（头顶那撮呆毛是最高点）。

气泡的几何全部由 `--pet-size` 推导：距窗口内侧边 0.04、距顶 0.06，尺寸 0.66 × 0.27。两种朝向用的是同一套数字，只是挂在不同的边上，所以天然镜像。

| 档位 | 窗口 | 气泡 | 气泡压住的已绘制像素 |
|---|---|---|---|
| 180px | 244 × 180 | 119 × 49 | 0 |
| 280px | 378 × 280 | 185 × 76 | 0 |
| 420px | 568 × 420 | 277 × 113 | 0 |

这张表不是估的：`tools\pocket-probe.js` 会从贴图 alpha 通道扫出「口袋」的边界（横向大概到 `0.68 × --pet-size`，地板——也就是气泡底下最高的那个头发像素——在 `0.30` 左右），而 `tools\check-layout.js` 会逐个尺寸、两种朝向去数气泡和尖角到底压住了几个已绘制像素，只要不为 0 就报错。上面那个 0 就是它数出来的。

对话框是一个**椭圆云**：`<ellipse>` 作云体，加一个**等腰三角形的气泡尖角**（底边贴在椭圆右下弧线上、尖角朝下偏右，停靠在宠物头部左侧）。SVG 里先描合并轮廓（`.bubble-ink`）再用填充（`.bubble-fill`）盖住接缝，因此尖角和椭圆之间没有内部线条。

字号**按语言分开给**：`.bubble-line` 的 `clamp(10px, 9.9vmin, 25px)` 是中文的基准，`:lang(en) .bubble-line` 的 `clamp(8px, 7.6vmin, 17px)` 把英文调小一档 —— 同样的字号下英文字形更宽，不区分就会顶出气泡。语言钩子由 `renderer.js` 写 `<html lang>` 提供。改完文案想知道还占多少余量：

```powershell
app\node_modules\electron\dist\electron.exe tools\measure-text.js
```

它会按真实字体量每条文案的宽度，报出占文本框的百分比和「字号缩到多少刚好放得下」。

改了留白比例后，要同步三处：`tools\widget-geometry.js` 里的气泡常量、`app/src/renderer/style.css` 里的 `.bubble`，以及 `app/src/main/settings.js` 里的 `PET_ASPECT`（当前为正方形，即 `1.0`）。然后跑一遍：

```powershell
node tools\check-layout.js
app\node_modules\electron\dist\electron.exe tools\measure-poses.js
```

第一个按 alpha 通道算，第二个量真实 DOM —— 两边都过，才算真的没压到宠物也没超出窗口。

## 常见问题

**桌宠没出现？**
先看 `%APPDATA%\DSH Status Pet\pet.log` 有没有 `window shown at ...`。窗口默认贴在主屏右下角；若之前拖到副屏、而副屏已拔掉，右键菜单里点「回到右下角」。

**桌宠朝向不对 / 对话框没跟着翻？**
朝向由窗口中心落在屏幕哪一半决定，拖动时会实时翻转。想强制归位就用菜单里的两项：「回到右下角（默认朝向）」或「回到左下角（镜像朝向）」。

**状态一直显示「空闲...」？**
说明最近没有新事件写入。确认 Harness 正在跑，且 `%USERPROFILE%\.dsh\sessions\` 下的日志时间在更新。Harness 按批落盘，所以状态刷新可能比对话晚一两秒。

**弹出 `A JavaScript error occurred in the main process`？**
这是 Electron 的默认异常弹窗。本程序已接管未捕获异常，错误只写进 `pet.log`（形如 `uncaught exception:`）。若看到旧弹窗，通常是改动代码前启动的旧进程留下的：右键宠物选「退出」，或运行 `重启桌宠.cmd`。

**和我抢鼠标？**
菜单里暂时没有点击穿透开关（设置里的 `clickThrough` 字段已预留）。需要时把桌宠调小或直接隐藏。

**可以移到 macOS 吗？**
核心逻辑（读日志、状态机、渲染层）是跨平台的，但当前版本只在 Windows 验证过。要适配的是平台外壳：启动脚本（`.cmd` → `.command`）、Electron 二进制路径、应用图标（`.ico` → `.icns`），以及 macOS 上的托盘与窗口行为（`app.dock.hide()`、Spaces、全屏）。`.dsh` 路径本身天然兼容（`~/.dsh`）。

## 说明

- 本项目是**独立的桌面程序**，不是 DSH 插件：它不安装进 DSH 的 profile，插件管理页面里看不到它，启停请用自己的菜单或托盘图标。它对 DSH 零侵入 —— 只读取会话日志文件，不碰进程、端口、profile 和会话锁。
- 渲染层与主进程通过 `contextBridge` 暴露的少量方法通信：`nodeIntegration: false`、`contextIsolation: true`，页面 CSP 只放开自有的 `pet-asset:` 协议。
- 贴图通过自定义协议 `pet-asset://` 读取，避免 `file://` 页面的不透明源导致 CSP 拦截。
- 系统开启「减少动态效果」时，所有动画自动禁用。

## License

[MIT](LICENSE)
