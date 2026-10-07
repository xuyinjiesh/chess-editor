/* 线上部署验证：抓取 GitHub Pages 上的真实文件，在 jsdom 里跑一遍核心交互。
 * 运行： node tests/live.test.mjs            （默认验证 xuyinjiesh.github.io/chess-editor/）
 *        LIVE_BASE=http://127.0.0.1:4173/ node tests/live.test.mjs
 * 需要 jsdom（仅测试用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const BASE = process.env.LIVE_BASE || 'https://xuyinjiesh.github.io/chess-editor/';

async function loadJsdom() {
  const candidates = [
    process.env.JSDOM_PATH,
    path.join(root, 'node_modules', 'jsdom', 'lib', 'api.js'),
    '/tmp/cetest/node_modules/jsdom/lib/api.js'
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return (await import(pathToFileURL(c).href)).JSDOM;
  return null;
}
const JSDOM = await loadJsdom();
if (!JSDOM) { console.log('跳过：未找到 jsdom（npm i -D jsdom 后重试）'); process.exit(0); }

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; return; }
  fails.push(name + (extra !== undefined ? '  → ' + extra : ''));
}

const get = async (p) => {
  const url = new URL(p, BASE).href;
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  return res.text();
};

console.log('验证目标：' + BASE + '\n');

// ---------------------------------------------------------------- 抓取产物
let html;
try {
  html = await get('');
} catch (e) {
  console.log('无法访问线上站点：' + e.message);
  process.exit(1);
}
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const links = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((m) => m[1]);
ok('首页包含棋盘容器', /id="board"/.test(html));
ok('首页引用了脚本', scripts.length >= 5, scripts.join(', '));

for (const asset of [...links, ...scripts]) {
  try {
    const res = await fetch(new URL(asset, BASE).href);
    ok('线上资源 ' + asset, res.ok && Number(res.headers.get('content-length') || 1) > 0, res.status);
  } catch (e) {
    ok('线上资源 ' + asset, false, e.message);
  }
}

const sources = {};
for (const s of scripts) sources[s] = await get(s);

// ---------------------------------------------------------------- 在 jsdom 里执行
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: BASE });
const { window } = dom;
if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;
window.Element.prototype.setPointerCapture = function () {};
window.Element.prototype.releasePointerCapture = function () {};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
let CELL = 40;
const origGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = (el, ps) => {
  const cs = origGCS(el, ps);
  return { getPropertyValue: (p) => (p === '--cell' ? CELL + 'px' : p === '--pad' ? '0px' : (cs.getPropertyValue ? cs.getPropertyValue(p) : '')) };
};

for (const s of scripts) window.eval(sources[s]);
window.dispatchEvent(new window.Event('DOMContentLoaded'));

const CE = window.CE;
const app = CE.app, M = CE.model, R = CE.rules;
ok('线上脚本可初始化', !!app && !!app.state);
if (!app || !app.state) {
  console.log('\n初始化失败，无法继续');
  process.exit(1);
}
ok('默认载入国际象棋 32 子', app.state.pieces.length === 32, app.state.pieces.length);
ok('棋盘渲染完整', window.document.querySelectorAll('#cells .cell').length === 64);
ok('棋子渲染完整', window.document.querySelectorAll('#pieces .piece').length === 32);
ok('棋子库渲染', window.document.querySelectorAll('#palette .pal-item').length > 0);
ok('样式表已挂载', !!window.document.querySelector('link[rel="stylesheet"]'));

CELL = CE.render.cellSize();
const board = window.document.getElementById('board');
const px = (c) => (c + 0.5) * CELL, py = (r) => (r + 0.5) * CELL;
board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 8 * CELL, height: 8 * CELL, right: 8 * CELL, bottom: 8 * CELL, x: 0, y: 0 });
function drag(fr, fc, tr, tc) {
  const p = M.pieceAt(app.state, fr, fc);
  const el = window.document.querySelector(`#pieces .piece[data-id="${p.id}"]`);
  const base = { bubbles: true, cancelable: true, clientX: px(fc), clientY: py(fr), pointerId: 1, button: 0 };
  el.dispatchEvent(new window.PointerEvent('pointerdown', base));
  el.dispatchEvent(new window.PointerEvent('pointermove', Object.assign({}, base, { clientX: px((fc + tc) / 2), clientY: py((fr + tr) / 2) })));
  el.dispatchEvent(new window.PointerEvent('pointerup', Object.assign({}, base, { clientX: px(tc), clientY: py(tr) })));
}

// 编辑模式：拖拽
drag(6, 4, 4, 4);
ok('线上：编辑模式拖动棋子', !!M.pieceAt(app.state, 4, 4));
drag(4, 4, 7, 0);
ok('线上：不能与其它棋子重叠', !!M.pieceAt(app.state, 4, 4));
app.undo();
ok('线上：撤销可用', !!M.pieceAt(app.state, 6, 4));

// 对局模式：规则校验
app.newFromTemplate('chess');
app.toggleMode('play');
ok('线上：进入对局模式', app.ui.mode === 'play' && R.currentArmyId(app.state) === 'w');
drag(6, 4, 3, 4);
ok('线上：非法走法被拒绝', !!M.pieceAt(app.state, 6, 4) && app.state.play.plies.length === 0);
drag(6, 4, 4, 4);
ok('线上：合法走法生效', !!M.pieceAt(app.state, 4, 4) && app.state.play.plies.length === 1);
ok('线上：回合已交给黑方', R.currentArmyId(app.state) === 'b');

// 导出与模板
ok('线上：SVG 导出可用', app.buildSVG().startsWith('<svg'));
app.toggleMode('edit');
const cellsBefore = window.document.querySelectorAll('#cells .cell').length;
app.resize(9, 10);
ok('线上：改棋盘尺寸后重绘', window.document.querySelectorAll('#cells .cell').length === 90 && cellsBefore === 64);

console.log(`\n线上验证通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('部署产物功能正常 ✓');
