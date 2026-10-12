# 无后端作品广场

作品广场与编辑器共用一个项目，访问 `#/gallery` 打开。作品和清单放在 `public/gallery/`，构建时复制到网站中；浏览、试玩、下载和分享都由浏览器完成。

适合由你独自发布作品：发布权限来自 Git 仓库的写入权限。访客可以下载、试玩和改编，页面上的「准备发布」只导出文件，不会写入网站。没有账号、数据库或投稿接口。

## 发布你的第一款作品

1. 在编辑器设计棋盘、初始布局和规则。分别测试双人操作与人机对弈。
2. 点击项目栏「发布」，填写作品标识、版本、作者、介绍、标签与玩法说明，点击「导出发布包」。广场页「准备发布」也会为当前编辑器草稿导出发布包。
3. 在本地项目根目录运行以下命令，参数可填写下载文件的完整路径：

   ```sh
   npm run gallery:add -- "my-game-v1.qijing-release.json"
   npm test
   npm run build
   npm run preview
   ```

4. 在预览页进入作品广场，检查介绍、封面、玩法和 AI。确认后提交生成的 `public/gallery/` 文件并推送到 `main`。仓库 Pages 工作流完成后，作品才会出现在公开网站。

发布脚本需要 Node.js 22.6 或更新版本，建议使用 Node.js 22 的较新版本或 Node.js 24。它直接复用前端的 TypeScript 格式校验和封面生成代码。

发布包扩展名为 `.qijing-release.json`，包含完整棋类设计、展示资料与自动生成的 SVG 封面。普通「导出」的 `.qijing.json` 只包含设计，用于备份和导入编辑器。发布脚本会重新生成封面，并且不会执行作品里的规则代码。

## 更新与分享

同一作品更新时保留「作品标识」，将版本由 `1` 增加为 `2`，再导出和导入。标识支持小写英文字母、数字与中间的短横线，例如 `forest-chess`。版本是正整数。

广场列表展示每个作品的最高版本；详情页可选择历史版本。分享按钮生成固定版本链接，例如：

```text
https://你的站点/chess-editor/#/gallery/forest-chess/v1
```

旧版文件会保留，导入命令拒绝覆盖已有版本。要修复已发布版本，请增加版本号。访问没有版本后缀的 `#/gallery/forest-chess` 会打开清单中的最新版本。

发布版本号与项目 JSON 的 `version: 1` 无关；后者表示文件格式。

## 文件布局

```text
public/gallery/
  index.json                     # 所有版本的展示资料与玩法说明
  forest-chess/
    v1/
      project.json               # 棋盘、棋子、区域、规则、界面
      cover.svg                  # 自动生成的静态封面
    v2/
      project.json
      cover.svg
```

`npm run gallery:check` 会验证清单、每个设计文件、标题与封面的一致性。`npm run build` 会先执行此检查，避免缺失或损坏的作品进入部署。

清单最多包含 1,000 个发布版本，文件上限为 8 MB；单个设计 JSON 不超过 500 KB。标签最多 6 个，玩法说明最多 6,000 字。

仓库附带「九路四连」「迷你黑白棋」「邻步对决」三款示例，署名与标签均标为示例。发布自己的作品后，可以从 `index.json` 移除示例条目。将 `entries` 设为 `[]` 可以保留一个空广场。

下架时从清单移除对应版本；详情链接会显示「没有找到这个作品版本」。若也要撤下可直接访问的 JSON 和 SVG 文件，需要一并删除相应版本目录后重新部署。更新其他作品无需改动历史版本目录。

## 草稿与试玩

- 广场浏览和试玩使用独立状态，不覆盖编辑器草稿。进入广场时，编辑器中进行中的电脑对弈会暂停。
- 「复制到编辑器」创建新 ID 的副本，并先把原草稿保存在本地「我的作品」。这仍受现有本地作品库最多 20 项的限制，重要作品请导出备份。
- 下载和发布包保存初始设计，不包含当前对局、棋谱、API Key 或联网设置。
- 人机对弈复用本地 AI 引擎，无需远程模型。自定义作品的适用范围及规则接口见 [本地 AI 说明](LOCAL_AI.md)。

## 部署与验证

广场使用 hash 路由，静态服务器无需配置路径重写。加载资源时遵循 Vite 的 `base`，可部署在根路径或 GitHub Pages 的仓库子路径。现有 Pages 工作流会自动指定仓库路径。

若要本地模拟 `/chess-editor/` 子路径：

```sh
npm run build -- --base=/chess-editor/
npm run preview -- --base=/chess-editor/ --port 4174
```

访问 `http://localhost:4174/chess-editor/#/gallery`。浏览器集成测试可对生产预览运行：

```sh
node scripts/test-gallery-browser.mjs
```

默认测试地址是 `http://127.0.0.1:4173/`。使用子路径预览时设置 `GALLERY_TEST_URL`，例如 PowerShell：

```powershell
$env:GALLERY_TEST_URL='http://127.0.0.1:4174/chess-editor/'
node scripts/test-gallery-browser.mjs
```

测试使用 Playwright Chromium；未安装该浏览器时尝试系统 Microsoft Edge。截图和测试导出文件保存在 Git 忽略的 `artifacts/`。
