# 开发与部署说明

日常使用、界面预览和快速开始见[项目首页](../README.md)。本文面向需要扩展规则、对接模型或部署联机服务器的开发者。

## 技术栈与构建

前端使用 React 19、TypeScript 和 Vite，国际象棋规则基于 chess.js，WebRTC 联机基于 PeerJS。棋盘使用 SVG 网格，棋子使用 CSS 和系统字体符号，无图片服务依赖。Google Fonts 无法加载时使用系统字体。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

GitHub Pages 部署由 `.github/workflows/pages.yml` 完成。工作流按仓库名称传入 Vite 的 `--base` 参数，例如 `/chess-editor/`；其他平台默认构建使用根路径。Pages 需要在仓库设置中选择 **GitHub Actions** 作为 Source。静态托管只发布 `dist/`，不包含可选的 WebSocket 中继。

## 数据兼容与交互

应用版本与项目 JSON 格式版本独立：应用为 `2.0.0`，数据仍为 `version: 1`。可选的 `board.theme` 保存棋盘风格；旧文件缺少此字段时保留原有配色，不覆盖已有作品。

棋子按稳定 ID 渲染，移动、翻面和升变需要保留原棋子 ID。拖拽使用 Pointer Events；棋盘翻转同时更新坐标、玩家位置和拖拽落点。系统开启「减少动态效果」时会关闭动画。

夜间模式首次跟随系统，手动偏好保存在浏览器中，与项目的棋盘主题分开。输入框、下拉框、可编辑文字和 IME 输入期间暂停棋盘快捷键；输入框保留原生撤销，保存和导出仍可使用。编辑工具只在编辑模式生效，联机遵守角色与撤销限制。

## 中国象棋与落点布局

中国象棋模板使用 9 列 × 10 行交叉点棋盘，带楚河汉界、九宫线和兵炮定位标记。红方先手，红黑棋子可分别显示帥 / 將、仕 / 士、相 / 象、兵 / 卒等文字。可在侧栏或模板库载入，直接试玩或开房间。

内置规则覆盖基本走法、自将检查、合法落点提示、将军、将死和困毙判负；暂不实现长将、长捉、重复局面与自然限着等竞赛裁定。内部 `white` 表示红方（从下向上走），`black` 表示黑方，以复用既有房间和自定义规则协议。

交叉网格 `grid` 的线条仅连接最外侧落点，不向边框延伸；`cells` 将线画在格子边界，供黑白棋、井字棋等格内落子游戏使用。象棋样式 `xiangqi` 固定为 9 × 10，修改尺寸后自动改用交叉网格与自定义规则。新字段兼容原 version 1 项目，旧文件可以正常导入；旧作品保留原先选择的棋盘布局。

## AI 接口

本地电脑对手与下面的模型创作接口独立：前者无需模型服务。搜索接口、规则适配、预算和浏览器验证见[本地 AI 对弈](LOCAL_AI.md)。

在「AI 助手 → 配置模型」填写：

1. API 基地址，例如服务商提供的 `https://host/v1`，也可填完整 `/chat/completions` 路径。
2. 模型 ID。
3. API Key（本地无鉴权服务可留空）。

浏览器会把当前项目和设计描述发送到你指定的模型地址。接口必须支持浏览器 CORS；HTTPS 页面不能调用普通 HTTP 的远程服务。Key 只留在当前页面的 React 内存中，刷新清除；只有 API 地址与模型名称会保存。服务商可能按其价格收费。

生成的是完整 `Project` JSON。规则函数可以由模型直接编写，不必套固定棋子走法；UI 目前为可配置工作台，不执行模型生成的任意 HTML。生成结果通过结构校验后展示预览，点击「应用这个设计」才更新项目。

## 自定义规则协议

`src/model.ts` 定义完整的 Project / GameState / Move 类型。坐标是从左上角开始的 0 基 `row` / `col`。六边形为图块外观，邻接关系由自定义代码定义，不会自动套用方格走法。

```js
function onMove(state, move, project) {
  // state: { pieces, turn, winner, history, data }
  // move: { from?: {row,col}, to: {row,col}, promotion?: 'q'|'r'|'b'|'n', action?: string }
  // project: board, pieceTypes, regions, rules, ui ...
  // 移动型规则先选棋子，落子型规则可没有 from。
  return {
    valid: true,
    pieces: state.pieces,       // 必需：移动完成后的完整棋子列表
    turn: 'black',             // 必需：下一回合 white 或 black
    winner: null,              // null / white / black / draw
    data: { energy: 3 },       // 可选：JSON 可序列化自定义状态
  };
}
```

拒绝走子返回 `{ valid: false, message: '原因' }`。棋子对象为 `{id,type,side,row,col}`，其中 `type` 对应 `pieceTypes[].id`。移动、翻面和升变时保留原棋子的 `id`，新建棋子才分配新 ID，让移动动画连续。规则可通过完整状态转换实现连跳、传送、额外回合、资源、特殊胜利条件等。内部阵营仍固定为 white / black。可在 `ui.sideLabels` 和 `ui.sideColors` 中分别提供 `{white,black}` 名称和六位十六进制颜色。`pieceTypes[].neutral: true` 标记中立棋子：为兼容格式仍保存 side 字段，但不会按该阵营选中或计数；实际归属、阻挡及吃子由规则解释。

自定义规则还可提供 `getGameView(state,project)`，在试玩期间于隔离沙箱内执行：

```js
function getGameView(state,project) {
  return {
    message: '请选择被吃棋子的放回位置。',
    interaction: 'place', // move / place / swap
    actions: [{label:'确认布阵',move:{action:'confirm-setup',to:{row:6,col:1}}}],
  };
}
```

`message` 只显示纯文本，`actions` 最多 16 个，走法仍经 `onMove` 校验。`action` 为 1–64 位小写字母、数字或短横线的自定义动作名，仍须提供棋盘内的 `to`。`place` 使点击直接落子，`swap` 允许选中己方两枚棋子提交交换，`move` 的落点提示由 `getLegalMoves` 提供（可包含吃己方棋子的走法）。缺省保持原有移动交互。AI 仍只使用 `getLegalMoves`，因此人工布阵交换不必加入搜索树。成功返回的 `message` 可用作棋谱文本。浏览作品介绍或编辑棋盘时不运行这些钩子。

`getGameView` 可返回通用 `zones`，展示手牌、备用棋子、公共牌堆或弃牌区。编辑器试玩与作品广场共用这套布局：双方区域随阵营固定在棋盘上下，翻转棋盘时互换；公共区域位于棋盘侧边，窄屏移到棋盘下方。没有区域的作品保持原有布局。

```js
zones: [
  {id:'hand-white',label:'红方手牌',owner:'white',items:[
    {id:'tiger',label:'虎',subtitle:'Tiger',stamp:'black',
      offsets:[{row:-2,col:0},{row:1,col:0}],
      action:'card-tiger',interaction:'move'}
  ]},
  {id:'reserve-black',label:'蓝方储备',owner:'black',items:[
    {id:'horse',label:'马',piece:{type:'horse',side:'black'},count:2,
      action:'place-horse',interaction:'place',description:'选择后点击合法落点上场。'}
  ]},
  {id:'discard',label:'弃牌区',owner:'shared',emptyLabel:'暂无弃牌',items:[]}
]
```

区域必需字段为 `id`、`label`、`owner` 和 `items`，可带 `description`、`emptyLabel`。最多 8 个区域，每区最多 64 项、合计最多 128 项；长列表在区域内横向滚动。区域 ID 唯一，项目 ID 在所属区域内唯一，长度均不超过 64 字；区域和项目名称不超过 60 字。`owner` 是 `white` / `black` / `shared`，表示阵营归属，不随轮到谁行动而改变位置。

每项必需 `id`、`label`，其余字段可选：`subtitle`（40 字）、`description`（300 字）、`symbol`（8 字）、`caption`（40 字）、`count`（0–1,000,000 的整数）、`disabled`（布尔值）。无走法图的项目可展示普通卡牌、符号和数量；`count:0` 或 `disabled:true` 禁止选择。空区域显示 `emptyLabel`，缺省为「暂无内容」。`offsets` 为 1–8 个非原点偏移，row/col 范围 -2…2；按未翻转棋盘方向提供，翻转时自动旋转示意图。`stamp` 可选 `white` / `black`，用于阵营印记。

备用棋子推荐使用 `piece:{type,side}`：`type` 引用项目中已有的 `pieceTypes[].id`，`side` 为 `white` / `black`。界面直接复用棋盘上的棋子形状、双方符号和配色，以紧凑棋子和数量角标呈现，不再显示重复的文字标题；`label` 仍用于无障碍名称和悬停提示。`piece` 优先于 `offsets` / `symbol`，适用于角斗棋等从储备上场的玩法。

没有 `action` 或 `move` 的项目仅供查看；有动作的项目只允许当前行动方或公共区操作。`action` 的选择不执行走子、不消耗回合：`interaction:'move'` 为点击或拖拽移动附上所选动作名，`'place'` 为直接点击落子附上动作名并禁用拖拽。省略时沿用视图交互模式。合法落点由 `getLegalMoves` 返回，并按所选动作过滤；无动作名的通用走法仍保留。动作名需符合前述格式，在所有区域及 `choices` 中唯一，最终仍经 `onMove` 校验。

卡片也可提供 `move:{action:'choose-skill',to:{row:0,col:0}}`，点击或按 Enter / Space 直接提交完整走法。这与 `action` / `interaction` 互斥，不进入棋盘选项列表；走法复用规则面板的棋盘边界与字段校验，并由现有提交流程校验回合、加载状态、电脑或联机控制权。异步更新期间保留旧卡片，同时阻止重复提交。

区域可选 `kind:'hand' | 'offer'`，卡片可选 `skillType:'instant' | 'trick' | 'persistent'`，用于展示已获技能和三选一；类型只表达技能的生效方式，不引入稀有度、抽取概率或强度规则。这些字段均为白名单枚举，旧的区域、棋子储备和 `cards` 内容无需迁移。

所有手牌和储备状态由规则在 `state.data` 中保存，随走子、悔棋和重做重新生成视图；选择本身仅保存在本机。沙箱视图更新期间保留区域布局并暂时禁用操作。终局保留区域供复盘，规则应移除终局操作，并让 `getLegalMoves` 返回空数组。区域内容经过有界纯数据校验，不接受 HTML 或样式。示例见 `scripts/rules/onitama.js`。

旧版 `cards` 协议仍兼容：最多 16 张，按 `group` 与 `tone` 自动转换成区域，`tone` 对应 `owner`；同时返回 `zones` 时以 `zones` 为准。旧版下载的形意棋可以直接使用新布局。

需要选择行动方式或储备棋子时，可返回 `choices`（最多 16 个、动作名唯一），以及按逻辑坐标附着在棋子上的 `markers`（最多 576 个、每个标签不超过 12 字）：

```js
choices: [
  {action:'move-player',label:'移动 / 带球',interaction:'move'},
  {action:'kick-ball',label:'传球 / 射门',interaction:'move'},
  // 储备玩法可使用 {action:'place-rook',label:'车 ×2 · 上场',interaction:'place'}
],
markers: [{cell:{row:11,col:7},label:'⚽蓄'}]
```

选择按钮只改变本机操作方式，不写入棋谱。`move` 选项为点击／拖拽生成的移动附上动作名，`place` 选项为直接点击落子附上动作名，并禁用拖拽；提示仅显示对应动作的合法走法。局面改变后优先选择 `choices` 的首项，没有选项时选择首个可用区域项目。按钮名最多 60 字，界面只接受校验后的文本和坐标；不能通过这些字段注入样式或 HTML。对局资源仍由规则在 `state.data` 中维护，例如足球棋的 `carrierId` / `charged` 和角斗棋的 `reserves`，因此下载、复制、AI 模拟与悔棋使用同一规则。

每次执行会创建无同源权限的 sandbox iframe，在其中创建专用 Worker。CSP 禁止网络访问，Worker 无 DOM / localStorage 权限，主页面在期限结束后移除整个沙箱。返回的棋子、回合和状态经过结构校验。浏览器沙箱不为恶意代码提供独立进程内存配额，极端资源分配仍可能造成标签页资源耗尽；不要载入未知来源的代码。

国际象棋从编辑布局开始新对局；位于初始位置的王车视为具有易位权。导出文件保存**项目设计和初始布局**，不保存正在进行的对局；如需持久棋谱或重连恢复，可在当前协议上扩展。区域效果只由自定义规则决定，内置经典规则不解释区域标签。

## 联机部署

### 房主浏览器托管（P2P）

创建房间，将房间码或链接发给好友。默认 PeerJS 公共信令服务仅用于建立 WebRTC 连接，游戏状态通过数据通道传输；信令服务可用性取决于外部网络。双方使用相同的站点或相同协议版本即可。

「自定义信令 / TURN 服务」支持自建 PeerServer 的 HTTP(S) 地址与标准 `RTCIceServer[]` JSON。在严格 NAT、防火墙或企业网下可能需要 TURN，否则请使用 WebSocket 中继。自定义信令与 TURN 凭据不会写入邀请 URL，加入者需要自行配置。关闭房主页面会结束房间；不提供自动重连 / 房主迁移。

### 指定服务器（WebSocket 中继）

```sh
npm run server
# 默认监听 8787，使用 PORT 环境变量可覆盖
```

在联机窗口选择「指定服务器」，本机开发填 `ws://localhost:8787`。跨设备请填可访问的主机地址；正式 HTTPS 站点需要反向代理 TLS 后的 `wss://your-server`。静态站点托管不包含这个可选 Node 服务器，需要单独启动它。

中继进程只负责房间和消息转发，规则权威仍在房主浏览器。房主校验对方身份、回合、状态版本和合法走法，再广播新状态。房主执白，首位加入者执黑，其余观战。中继有消息体积、频率、房间人数和心跳限制；没有账户、持久化、断线恢复或竞技防作弊。持有码者可加入，适合朋友间私局。

如果使用带登录和访问控制的静态托管平台，还需要确保受邀者具有站点访问权限；房间码本身不会改变站点访问权限。

## 目录

```text
src/App.tsx          编辑 / 对弈状态、AI 与联机工作流
src/Board.tsx        SVG 网格、字体棋子与拖拽图层
src/appearance.ts    棋盘主题与自定义颜色适配
src/appearance.css   棋盘主题和棋子外观
src/interactions.ts 主题偏好、快捷键与棋盘尺寸计算
src/interaction.css 棋子动效、夜间主题与专注模式
src/components.tsx 属性面板、弹窗
src/model.ts        数据类型、导入与返回值校验
src/templates.ts    经典模板与规则示例
src/engine.ts       内置规则和对局状态转换
src/sandbox.ts      自定义规则执行隔离
src/ai.ts           兼容模型接口
src/network.ts      房间、角色与同步协议
server/relay.mjs    可选自托管 WebSocket 中继
```

规则实现参照 [chess.js 文档](https://jhlywa.github.io/chess.js/)；WebRTC 通道参照 [PeerJS 文档](https://peerjs.com/client/getting-started)。
