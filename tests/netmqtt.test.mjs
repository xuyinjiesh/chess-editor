/* 公共中继（MQTT）真实链路测试：两个 jsdom「浏览器」通过公共 MQTT 代理组房间。
 * 这条链路完全不需要自己部署服务器。需要联网；代理不可达时会自动跳过。
 * 运行： node tests/netmqtt.test.mjs
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
  for (const c of candidates) if (fs.existsSync(c)) return (await import(pathToFileURL(c).href)).JSDOM;
  return null;
}
const JSDOM = await loadJsdom();
if (!JSDOM) {
  console.log('跳过：未找到 jsdom（npm i -D jsdom 后重试）');
  process.exit(0);
}

let pass = 0;
const fails = [];
const ok = (n, c, e) => { if (c) pass += 1; else fails.push(n + (e !== undefined ? '  → ' + e : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await sleep(120);
  }
  return fn();
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SCRIPTS = ['presets.js', 'model.js', 'rules.js', 'render.js', 'panels.js', 'mqtt.js', 'net.js', 'room.js', 'app.js'];

function boot() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  window.PointerEvent = window.MouseEvent;
  window.Element.prototype.setPointerCapture = function () {};
  window.Element.prototype.releasePointerCapture = function () {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.getComputedStyle = ((orig) => (el, ps) => {
    const cs = orig(el, ps);
    return { getPropertyValue: (p) => (p === '--cell' ? '40px' : p === '--pad' ? '0px' : (cs.getPropertyValue ? cs.getPropertyValue(p) : '')) };
  })(window.getComputedStyle.bind(window));
  for (const f of SCRIPTS) window.eval(fs.readFileSync(path.join(root, 'src', f), 'utf8'));
  window.dispatchEvent(new window.Event('DOMContentLoaded'));
  return window;
}

const A = boot();
const B = boot();
const CA = A.CE, CB = B.CE;

CA.room._setPrefs({ kind: 'mqtt', name: '房主甲' });
CB.room._setPrefs({ kind: 'mqtt', name: '棋友乙' });

// 房主先摆一个可识别的局面
CA.app.newFromTemplate('empty8');
CA.app.placePiece(3, 3, CA.app.state.pieceTypes[0].id);
CA.app.placePiece(6, 6, CA.app.state.pieceTypes[0].id);
const marks = CA.app.state.pieces.map((p) => p.r + ',' + p.c).sort().join('|');

const code = CA.room.create('mqtt');
console.log('  房间号', code, '· 等待公共代理…');

const aReady = await waitFor(() => CA.room.session && CA.room.session.room.meta().status === 'ready', 25000);
if (!aReady) {
  const st = CA.room.session.room.meta();
  console.log('跳过：连不上公共 MQTT 代理（' + st.status + '），可能当前环境没有外网。');
  A.close(); B.close();
  process.exit(0);
}
ok('公共中继：房主已连上代理', true);

CB.room.join(code, 'mqtt');
const joined = await waitFor(() => {
  const m = CB.room.session && CB.room.session.room.meta();
  return m && m.status === 'ready' && m.members.length === 2;
}, 25000);
ok('公共中继：加入者入房成功', joined, CB.room.session && CB.room.session.room.meta().status);
ok('公共中继：拿到房主的局面', CB.app.state.pieces.map((p) => p.r + ',' + p.c).sort().join('|') === marks,
  CB.app.state.pieces.map((p) => p.r + ',' + p.c).join(' / '));

// 加入者改棋盘 → 房主收到（整盘同步）
await sleep(400);
CB.app.placePiece(0, 5, CB.app.state.pieceTypes[0].id);
const synced = await waitFor(() => !!CA.model.pieceAt(CA.app.state, 0, 5), 15000);
ok('公共中继：协作改动回传到房主', synced);

// 房主改棋盘 → 加入者收到
CA.app.placePiece(7, 1, CA.app.state.pieceTypes[0].id);
const back = await waitFor(() => !!CB.model.pieceAt(CB.app.state, 7, 1), 15000);
ok('公共中继：房主改动下发到加入者', back);

// 对战模式 + 走子（走指令通道）
CA.room.setMode('match');
const modeSynced = await waitFor(() => CA.app.ui.mode === 'play' && CB.app.ui.mode === 'play', 20000);
ok('公共中继：模式同步', modeSynced, CA.app.ui.mode + '/' + CB.app.ui.mode);
if (!modeSynced) {   // 代理太慢时不必继续后面的走子用例
  CA.room.leave(); CB.room.leave(); A.close(); B.close();
  console.log(`\n公共中继测试通过 ${pass} 项，失败 ${fails.length} 项（网络较慢，后续用例跳过）`);
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}

const myArmy = (CB.room.session.room.meta().members.find((m) => m.id === CB.room.session.room.meta().selfId) || {}).armyId;
const rules = CB.rules;
let guard = 0;
while (rules.currentArmyId(CA.app.state) !== myArmy && guard++ < 3) {
  const st = CA.app.state;
  const cur = rules.currentArmyId(st);
  const piece = st.pieces.find((p) => CA.model.typeById(st, p.t).army === cur && rules.legalMovesFor(st, p).length);
  if (!piece) break;
  const mv = rules.legalMovesFor(st, piece)[0];
  CA.app.movePiece(piece.id, mv.r, mv.c);
  await sleep(900);
}
const mine = CA.app.state.pieces.find((p) => CA.model.typeById(CA.app.state, p.t).army === myArmy && rules.legalMovesFor(CA.app.state, p).length);
if (mine) {
  const mv = rules.legalMovesFor(CA.app.state, mine)[0];
  const before = CA.app.state.play.plies.length;
  CB.app.movePiece(mine.id, mv.r, mv.c);
  const moved = await waitFor(() => CA.app.state.play.plies.length > before
    && CB.app.state.play.plies.length === CA.app.state.play.plies.length, 15000);
  ok('公共中继：走子指令被房主接受并广播', moved,
    CA.app.state.play.plies.length + ' / ' + CB.app.state.play.plies.length);
} else {
  ok('公共中继：走子指令被房主接受并广播', true);   // 局面恰好无可走子时跳过
}

// 离开
CB.room.leave();
const left = await waitFor(() => CA.room.session.room.meta().members.length === 1, 15000);
ok('公共中继：离开后成员列表更新', left, CA.room.session.room.meta().members.length);

CA.room.leave();
A.close(); B.close();

console.log(`\n公共中继测试通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
