/* 集成冒烟测试：用 jsdom 加载真实页面与脚本，模拟点击、拖拽、撤销与导出。
 * 运行： node tests/dom.test.mjs      （需要 jsdom： npm i -D jsdom）
 *        JSDOM_PATH=/path/to/jsdom/lib/api.js node tests/dom.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

async function loadJsdom() {
  const candidates = [
    process.env.JSDOM_PATH,
    path.join(root, 'node_modules', 'jsdom', 'lib', 'api.js'),
    '/tmp/cetest/node_modules/jsdom/lib/api.js'
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return (await import(pathToFileURL(c).href)).JSDOM;
  }
  return null;
}

const JSDOM = await loadJsdom();
if (!JSDOM) {
  console.log('跳过 DOM 测试：未找到 jsdom（npm i -D jsdom 后重试）');
  process.exit(0);
}

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; return; }
  fails.push(name + (extra !== undefined ? '  → ' + extra : ''));
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;

// --- 浏览器能力补齐（jsdom 未实现的部分） ---
if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;
window.Element.prototype.setPointerCapture = function () {};
window.Element.prototype.releasePointerCapture = function () {};
let CELL = 40;
const origGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = (el, ps) => {
  const cs = origGCS(el, ps);
  return {
    getPropertyValue: (p) => {
      if (p === '--cell') return CELL + 'px';
      if (p === '--pad') return '0px';
      return cs.getPropertyValue ? cs.getPropertyValue(p) : '';
    }
  };
};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

// --- 加载应用脚本 ---
for (const f of ['presets.js', 'model.js', 'rules.js', 'render.js', 'panels.js', 'mqtt.js', 'net.js', 'room.js', 'app.js']) {
  window.eval(fs.readFileSync(path.join(root, 'src', f), 'utf8'));
}
window.dispatchEvent(new window.Event('DOMContentLoaded'));

const CE = window.CE;
const app = CE.app;
const M = CE.model;
ok('应用已初始化', !!app.state && app.state.pieces.length === 32, app.state && app.state.pieces.length);
ok('棋盘已渲染格子', document.querySelectorAll('#cells .cell').length === 64, document.querySelectorAll('#cells .cell').length);
ok('棋子已渲染', document.querySelectorAll('#pieces .piece').length === 32, document.querySelectorAll('#pieces .piece').length);
ok('棋子库已渲染', document.querySelectorAll('#palette .pal-item').length > 0);

// 棋盘几何（jsdom 没有布局，手动喂给渲染层）
CELL = CE.render.cellSize();
const board = document.getElementById('board');
const rows = app.state.board.rows, cols = app.state.board.cols;
board.getBoundingClientRect = () => ({
  left: 0, top: 0, width: cols * CELL, height: rows * CELL,
  right: cols * CELL, bottom: rows * CELL, x: 0, y: 0
});
const px = (c) => (c + 0.5) * CELL;
const py = (r) => (r + 0.5) * CELL;
function pieceElAt(r, c) {
  const p = M.pieceAt(app.state, r, c);
  return p ? document.querySelector(`#pieces .piece[data-id="${p.id}"]`) : null;
}
function clickModal(x) {
  const nodes = document.querySelectorAll('#modal-host .modal [data-x="' + x + '"]');
  const btn = nodes[nodes.length - 1];
  if (btn) btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return !!btn;
}
/** 切换模板会弹确认框，这里自动确认。 */
async function newTpl(id) {
  const p = app.newFromTemplate(id);
  clickModal('yes');
  await p;
}

function drag(fromR, fromC, toR, toC, steps = 3) {
  const el = pieceElAt(fromR, fromC);
  if (!el) throw new Error('没有找到棋子 ' + fromR + ',' + fromC);
  const opts = { bubbles: true, cancelable: true, clientX: px(fromC), clientY: py(fromR), pointerId: 1, button: 0 };
  el.dispatchEvent(new window.PointerEvent('pointerdown', opts));
  for (let i = 1; i <= steps; i++) {
    const r = fromR + (toR - fromR) * i / steps;
    const c = fromC + (toC - fromC) * i / steps;
    el.dispatchEvent(new window.PointerEvent('pointermove', Object.assign({}, opts, { clientX: px(c), clientY: py(r) })));
  }
  el.dispatchEvent(new window.PointerEvent('pointerup', Object.assign({}, opts, { clientX: px(toC), clientY: py(toR) })));
}

// ---------------------------------------------------------------- 编辑模式：自由拖动 + 约束
{
  const pawn = M.pieceAt(app.state, 6, 4);
  drag(6, 4, 4, 4);
  const after = app.state.pieces.find((p) => p.id === pawn.id);
  ok('编辑模式：拖动棋子到空位', after.r === 4 && after.c === 4, after.r + ',' + after.c);
  ok('编辑模式：棋子在原位留下空格', M.pieceAt(app.state, 6, 4) === null);

  drag(4, 4, 7, 0);                                   // 目标格上有己方车 → 应被拒绝
  const blocked = app.state.pieces.find((p) => p.id === pawn.id);
  ok('编辑模式：不能与其它棋子重叠', blocked.r === 4 && blocked.c === 4, blocked.r + ',' + blocked.c);

  app.paintTerrain(5, 5, 'block');
  drag(4, 4, 5, 5);                                   // 障碍格 → 应被拒绝
  ok('编辑模式：不能落在障碍格', M.pieceAt(app.state, 4, 4) !== null);

  app.undo();                                         // 撤销：障碍消失
  ok('撤销：地形改动可回退', !app.state.cells['5,5'], JSON.stringify(app.state.cells));
}

// ---------------------------------------------------------------- 落子 / 删除 / 撤销重做
{
  const before = app.state.pieces.length;
  const typeId = app.state.pieceTypes.find((t) => t.army === 'b' && t.name === '马').id;
  app.placePiece(3, 3, typeId);
  ok('落子：新增一枚棋子', app.state.pieces.length === before + 1);
  app.undo();
  ok('撤销：落子被回退', app.state.pieces.length === before);
  app.redo();
  ok('重做：落子恢复', app.state.pieces.length === before + 1);
  app.eraseAt(3, 3);
  ok('橡皮擦：棋子被移除', app.state.pieces.length === before);
}

// ---------------------------------------------------------------- 对局模式：规则约束
{
  await newTpl('chess');
  app.toggleMode('play');
  ok('对局：模式已切换', app.ui.mode === 'play');
  ok('对局：白方先行', CE.rules.currentArmyId(app.state) === 'w');

  drag(6, 4, 3, 4);                                   // 兵一次走三格 → 非法
  ok('对局：非法走法被拒绝', M.pieceAt(app.state, 6, 4) !== null && app.state.play.plies.length === 0,
    'plies=' + app.state.play.plies.length);

  drag(6, 4, 4, 4);                                   // 首步两格 → 合法
  ok('对局：合法走法生效', M.pieceAt(app.state, 4, 4) !== null && app.state.play.plies.length === 1);
  ok('对局：轮到黑方', CE.rules.currentArmyId(app.state) === 'b', CE.rules.currentArmyId(app.state));

  drag(1, 0, 2, 0);                                   // 黑方走兵
  ok('对局：黑方可以走子', app.state.play.plies.length === 2);
  ok('对局：棋谱已记录', /a7|a2/.test(app.state.play.plies[1].text), app.state.play.plies[1].text);

  app.undoPly();
  ok('对局：悔棋', app.state.play.plies.length === 1);
}

// ---------------------------------------------------------------- 胜负判定（擒王）
{
  await newTpl('empty8');
  const wk = app.state.pieceTypes.find((t) => t.isKing && t.army === 'a');
  const bk = app.state.pieceTypes.find((t) => t.isKing && t.army === 'b');
  const wr = app.state.pieceTypes.find((t) => t.name === '车' && t.army === 'a');
  app.placePiece(7, 4, wk.id);
  app.placePiece(0, 0, bk.id);
  app.placePiece(1, 0, wr.id);
  app.toggleMode('play');
  drag(1, 0, 0, 0);                                   // 白车吃黑王
  ok('胜负：擒王结束对局', !!app.state.play.result && app.state.play.result.kind === 'win',
    JSON.stringify(app.state.play.result));
  ok('胜负：面板显示结果', /胜/.test(document.getElementById('play-panel').textContent));
  ok('胜负：状态条提示', /胜|行棋/.test(document.getElementById('statusbar').textContent));
}

// ---------------------------------------------------------------- 棋子设计：自定义走法
{
  app.toggleMode('edit');
  await newTpl('empty8');
  const t = app.state.pieceTypes.find((x) => x.name === '王' && x.army === 'a');
  app.ui.selectedTypeId = t.id;
  app.renderPanels();
  const form = document.getElementById('piece-form');
  const sel = form.querySelector('[data-f="moveDirs"]');
  ok('棋子表单：渲染出方向选择', !!sel);
  sel.value = 'diag';
  sel.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('棋子表单：方向已写入模型', app.state.pieceTypes.find((x) => x.id === t.id).move.moveDirs === 'diag');

  const preset = form.querySelector('[data-f="preset"]');
  preset.value = 'cannon';
  preset.dispatchEvent(new window.Event('change', { bubbles: true }));
  const t2 = app.state.pieceTypes.find((x) => x.id === t.id);
  ok('棋子表单：模板可套用（炮）', t2.move.cannon === true && t2.move.moveDirs === 'ortho', JSON.stringify(t2.move));
}

// ---------------------------------------------------------------- 棋盘设置与导出
{
  const sizeChip = [...document.querySelectorAll('#board-form [data-act="size"]')].find((b) => b.dataset.r === '9');
  sizeChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('棋盘设置：改为 9×10', app.state.board.rows === 9 && app.state.board.cols === 10,
    app.state.board.rows + 'x' + app.state.board.cols);
  ok('棋盘设置：格子数量同步', document.querySelectorAll('#cells .cell').length === 90,
    document.querySelectorAll('#cells .cell').length);

  const svg = app.buildSVG();
  ok('导出：SVG 结构完整', svg.startsWith('<svg') && svg.endsWith('</svg>') && svg.includes('width="540"'), svg.slice(0, 80));

  const json = app.snapshot();
  const clone = M.normalize(JSON.parse(json));
  ok('导出：JSON 可往返', clone.pieces.length === app.state.pieces.length && clone.board.rows === 9);

  app.importState(json);
  ok('导入：状态恢复', app.state.board.rows === 9 && app.state.board.cols === 10);
  app.importState('{ 这不是 json');
  ok('导入：坏数据不会破坏当前棋局', app.state.board.rows === 9);
}

// ---------------------------------------------------------------- 模板
{
  for (const tpl of CE.presets.TEMPLATES) {
    await newTpl(tpl.id);
    const cells = document.querySelectorAll('#cells .cell').length;
    ok('模板 ' + tpl.id + '：渲染正常', cells === app.state.board.rows * app.state.board.cols, cells);
  }
  await newTpl('kingHill');
  const goalCell = document.querySelector('#cells .cell.is-goal');
  ok('模板 kingHill：目标格已渲染', !!goalCell);
}


// ---------------------------------------------------------------- 画笔、点击落子、右键
function clickCell(r, c) {
  document.getElementById('cells').dispatchEvent(new window.PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, clientX: px(c), clientY: py(r), pointerId: 2, button: 0
  }));
}
function clickOn(sel) {
  const node = document.querySelector(sel);
  if (!node) throw new Error('未找到元素 ' + sel);
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  return node;
}
{
  await newTpl('empty8');
  clickOn('#palette .pal-item');
  const brushType = app.ui.brush.typeId;
  ok('棋子库：点击后成为当前画笔', !!brushType && app.ui.brush.kind === 'piece');
  clickCell(3, 3);
  const placed = M.pieceAt(app.state, 3, 3);
  ok('点击空格：按画笔落子', !!placed && placed.t === brushType);
  clickCell(3, 3);
  ok('点击已有棋子：不会覆盖', app.state.pieces.filter((p) => p.r === 3 && p.c === 3).length === 1);
  ok('点击已有棋子：变为选中', app.ui.selectedPieceId === placed.id);
  ok('状态条：显示选中信息', /已选中/.test(document.getElementById('statusbar').textContent));

  clickOn('[data-act="brush-erase"]');
  clickCell(3, 3);
  ok('橡皮擦：擦掉棋子', M.pieceAt(app.state, 3, 3) === null);

  clickOn('[data-act="brush-terrain"][data-terrain="block"]');
  clickCell(5, 5);
  ok('障碍画笔：写入地形', app.state.cells['5,5'] === 'block');
  ok('障碍画笔：格子加上 is-block', document.querySelector('#cells .cell[data-r="5"][data-c="5"]').classList.contains('is-block'));

  document.getElementById('board').dispatchEvent(new window.MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: px(5), clientY: py(5)
  }));
  ok('右键：清除地形', !app.state.cells['5,5']);

  clickOn('[data-act="brush-terrain"][data-terrain="goal"]');
  clickCell(2, 2);
  ok('目标画笔：写入并渲染', app.state.cells['2,2'] === 'goal' &&
    document.querySelector('#cells .cell[data-r="2"][data-c="2"]').classList.contains('is-goal'));
}

// ---------------------------------------------------------------- 胜负条件编辑
{
  await newTpl('empty8');
  const before = app.state.wins.length;
  clickOn('#wins-form [data-act="add-win"]');
  ok('胜负条件：可以添加', app.state.wins.length === before + 1);
  const row = () => document.querySelector('#wins-form .win-row:last-child');
  const sel = row().querySelector('[data-w="kind"]');
  sel.value = 'reachGoal';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('胜负条件：切换类型', app.state.wins[app.state.wins.length - 1].kind === 'reachGoal');
  ok('胜负条件：出现参数选择', !!row().querySelector('[data-w="typeId"]'));
  const typeSel = row().querySelector('[data-w="typeId"]');
  typeSel.value = app.state.pieceTypes[0].id;
  typeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
  ok('胜负条件：参数可保存', app.state.wins[app.state.wins.length - 1].typeId === app.state.pieceTypes[0].id);
  clickOn('#wins-form .win-row:last-child [data-act="del-win"]');
  ok('胜负条件：可以删除', app.state.wins.length === before);
}

// ---------------------------------------------------------------- 棋盘设置
{
  await newTpl('chess');
  const p = M.pieceAt(app.state, 0, 0);
  clickOn('#board-form [data-act="flip"]');
  const el = document.querySelector(`#pieces .piece[data-id="${p.id}"]`);
  ok('翻转棋盘：棋子移到对角', Number(el.style.getPropertyValue('--r')) === 7 && Number(el.style.getPropertyValue('--c')) === 7,
    el.style.getPropertyValue('--r') + ',' + el.style.getPropertyValue('--c'));

  const theme = document.querySelector('#board-form [data-b="theme"]');
  theme.value = 'midnight';
  theme.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('棋盘风格：外框类名同步', document.getElementById('board-frame').className.includes('board-frame--midnight'),
    document.getElementById('board-frame').className);

  const coords = document.querySelector('#board-form [data-b="coords"]');
  coords.checked = false;
  coords.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('坐标开关：关闭后不再渲染坐标', document.querySelectorAll('#cells .coord').length === 0);

  ok('阵营编辑器：渲染了阵营行', document.querySelectorAll('#army-editor .army-row').length === 2);
  clickOn('#army-editor [data-a="add"]');
  ok('阵营编辑器：可以加阵营', app.state.armies.length === 3);

  clickOn('#board-form [data-act="mirror-h"]');
  ok('镜像：棋子仍在棋盘内', app.state.pieces.every((q) => q.c >= 0 && q.c < app.state.board.cols));
}

// ---------------------------------------------------------------- 围棋盘 / 圆形棋子外观
{
  await newTpl('go19');
  ok('围棋盘：19×19 线框棋盘', app.state.board.rows === 19 && app.state.board.grid === 'line');
  ok('围棋盘：棋子库为石子外观', document.querySelectorAll('#palette .pal-item__icon.shape-stone').length === 1);
  clickOn('#army-tabs [data-id="w"]');                       // 切到白子阵营
  ok('围棋盘：切换阵营后显示白子', document.querySelectorAll('#palette .pal-item').length === 1 &&
    /白子/.test(document.getElementById('palette').textContent));
  clickOn('#palette .pal-item');
  clickCell(9, 9);
  ok('围棋盘：可以摆子', !!M.pieceAt(app.state, 9, 9));
  ok('围棋盘：状态条可用', document.getElementById('statusbar').textContent.length > 0);
}


// ---------------------------------------------------------------- 编辑模式走法校验
{
  app.toggleMode('edit');
  await newTpl('chess');
  app.commit((st) => { st.rules.validateInEdit = true; });
  const pawn = M.pieceAt(app.state, 6, 4);
  drag(6, 4, 3, 4);                                   // 兵一次三格 → 校验后应被拒绝
  ok('编辑校验：非法走法被拒绝', app.state.pieces.find((x) => x.id === pawn.id).r === 6);
  drag(6, 4, 5, 4);                                   // 一格 → 允许
  ok('编辑校验：合法走法允许', app.state.pieces.find((x) => x.id === pawn.id).r === 5);
  app.commit((st) => { st.rules.validateInEdit = false; });
  drag(5, 4, 2, 4);                                   // 关掉校验后自由拖动
  ok('编辑校验：关闭后可自由摆放', app.state.pieces.find((x) => x.id === pawn.id).r === 2);
}


// ---------------------------------------------------------------- 落点以松手位置为准（回归测试）
{
  await newTpl('empty8');
  const typeId = app.state.pieceTypes.find((t) => t.name === '车' && t.army === 'a').id;
  app.placePiece(7, 0, typeId);
  // 只在「起点与终点中间」发一次 pointermove，然后直接松手在终点：
  // 快速拖动 / 触屏时就是这样，落点必须按松手位置算。
  const p0 = M.pieceAt(app.state, 7, 0);
  const el = document.querySelector(`#pieces .piece[data-id="${p0.id}"]`);
  const base = { bubbles: true, cancelable: true, pointerId: 9, button: 0, clientX: px(0), clientY: py(7) };
  el.dispatchEvent(new window.PointerEvent('pointerdown', base));
  el.dispatchEvent(new window.PointerEvent('pointermove', Object.assign({}, base, { clientX: px(2), clientY: py(5) })));
  el.dispatchEvent(new window.PointerEvent('pointerup', Object.assign({}, base, { clientX: px(4), clientY: py(3) })));
  ok('落点：按松手位置计算', !!M.pieceAt(app.state, 3, 4) && !M.pieceAt(app.state, 5, 2),
    '3,4=' + !!M.pieceAt(app.state, 3, 4) + ' 5,2=' + !!M.pieceAt(app.state, 5, 2));

  // 拖出棋盘后松手 = 取消，回到原位
  const el2 = document.querySelector(`#pieces .piece[data-id="${p0.id}"]`);
  const b2 = { bubbles: true, cancelable: true, pointerId: 10, button: 0, clientX: px(4), clientY: py(3) };
  el2.dispatchEvent(new window.PointerEvent('pointerdown', b2));
  el2.dispatchEvent(new window.PointerEvent('pointermove', Object.assign({}, b2, { clientX: px(6), clientY: py(2) })));
  el2.dispatchEvent(new window.PointerEvent('pointerup', Object.assign({}, b2, { clientX: -80, clientY: -80 })));
  ok('落点：拖出棋盘视为取消', !!M.pieceAt(app.state, 3, 4), '3,4=' + !!M.pieceAt(app.state, 3, 4));
}

console.log(`\nDOM 测试通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
