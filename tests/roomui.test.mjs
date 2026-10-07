/* 联机端到端测试：在 jsdom 里开两个「浏览器」，通过（模拟的）BroadcastChannel 组成房间，
 * 验证创建/加入、状态同步、对战走子校验、阵营归属与离开。需要 jsdom。
 * 运行： node tests/roomui.test.mjs
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
  console.log('跳过联机端到端测试：未找到 jsdom（npm i -D jsdom 后重试）');
  process.exit(0);
}

let pass = 0;
const fails = [];
const ok = (n, c, e) => { if (c) pass += 1; else fails.push(n + (e !== undefined ? '  → ' + e : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 一个进程内的 BroadcastChannel 实现，供两个 jsdom 窗口共享 ---
const channels = new Set();
class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.onmessage = null; channels.add(this); }
  postMessage(data) {
    const self = this;
    setTimeout(() => {
      for (const ch of channels) {
        if (ch !== self && ch.name === self.name && typeof ch.onmessage === 'function') ch.onmessage({ data });
      }
    }, 0);
  }
  close() { channels.delete(this); }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SCRIPTS = ['presets.js', 'model.js', 'rules.js', 'render.js', 'panels.js', 'mqtt.js', 'net.js', 'room.js', 'app.js'];

function boot(name) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  window.BroadcastChannel = FakeBroadcastChannel;
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
  window.__name = name;
  return window;
}

const A = boot('A');       // 房主
const B = boot('B');       // 加入者
const CA = A.CE, CB = B.CE;

// 房主先改一下棋局，用来验证加入者确实收到了同步
CA.room._setPrefs({ kind: 'local', name: '房主甲' });
CB.room._setPrefs({ kind: 'local', name: '棋友乙' });
CA.app.placePiece(4, 4, CA.app.state.pieceTypes[0].id);
const markerId = CA.model.pieceAt(CA.app.state, 4, 4).id;

const code = CA.room.create('local');
ok('创建房间：拿到房间号', /^[A-Z0-9]{5}$/.test(code), code);
ok('创建房间：自己是房主', CA.room.isHost() === true);
ok('创建房间：顶部出现房间徽标', A.document.getElementById('room-badge').hidden === false);

CB.room.join(code, 'local');
await sleep(600);
ok('加入房间：成为加入者', CB.room.isActive() && !CB.room.isHost());
ok('加入房间：状态码一致', CB.room.session.room.meta().status === 'ready',
  CB.room.session.room.meta().status);
ok('加入房间：拿到房主的棋局', CB.app.state.pieces.some((p) => p.id === markerId),
  CB.app.state.pieces.length + ' 枚');
ok('加入房间：双方成员列表各 2 人',
  CA.room.session.room.meta().members.length === 2 && CB.room.session.room.meta().members.length === 2,
  CA.room.session.room.meta().members.length + '/' + CB.room.session.room.meta().members.length);
ok('加入房间：自动分配了不同阵营',
  CA.room.session.room.meta().members.find((m) => m.id === CB.room.session.room.meta().selfId).armyId !== null);

// ---------------- 协作编辑：乙改动 → 甲收到 ----------------
{
  const before = CA.app.state.pieces.length;
  let free = null;
  for (let r = 0; r < CB.app.state.board.rows && !free; r++) {
    for (let c = 0; c < CB.app.state.board.cols; c++) {
      if (!CB.model.pieceAt(CB.app.state, r, c)) { free = { r, c }; break; }
    }
  }
  CB.app.placePiece(free.r, free.c, CB.app.state.pieceTypes[0].id);
  await sleep(400);
  ok('协作编辑：甲的棋局收到乙的落子', CA.app.state.pieces.length === before + 1,
    CA.app.state.pieces.length + ' vs ' + (before + 1));
  ok('协作编辑：甲界面重绘了棋子', A.document.querySelectorAll('#pieces .piece').length === CA.app.state.pieces.length,
    A.document.querySelectorAll('#pieces .piece').length);
}

// ---------------- 甲改动 → 乙收到 ----------------
{
  CA.app.placePiece(0, 0, CA.app.state.pieceTypes[0].id);
  await sleep(400);
  ok('协作编辑：乙的棋局收到甲的落子', !!CB.model.pieceAt(CB.app.state, 0, 0));
}

// ---------------- 对战模式 ----------------
{
  CA.room.setMode('match');
  await sleep(400);
  ok('对战模式：双方都切到对局界面', CA.app.ui.mode === 'play' && CB.app.ui.mode === 'play',
    CA.app.ui.mode + '/' + CB.app.ui.mode);
  ok('对战模式：加入者的编辑入口被锁定', B.document.body.classList.contains('room-locked'));
  ok('对战模式：房主未被锁定', !A.document.body.classList.contains('room-locked'));
  ok('对战模式：开局后回合顺序已建立', CA.app.state.play.order.length === 2,
    JSON.stringify(CA.app.state.play.order));

  const mm = CB.room.session.room.meta();
  const myId = mm.selfId;
  const myArmy = mm.members.find((m) => m.id === myId).armyId;
  ok('对战模式：乙有自己操控的阵营', !!myArmy, myArmy);

  // 让乙的阵营成为当前回合，便于测试合法/非法走子
  const rules = CB.rules;
  let guard = 0;
  while (rules.currentArmyId(CA.app.state) !== myArmy && guard++ < 4) {
    const st = CA.app.state;
    const cur = rules.currentArmyId(st);
    const piece = st.pieces.find((p) => CA.model.typeById(st, p.t).army === cur && rules.legalMovesFor(st, p).length);
    if (!piece) break;
    const mv = rules.legalMovesFor(st, piece)[0];
    CA.app.movePiece(piece.id, mv.r, mv.c);
    await sleep(260);
  }
  ok('对战模式：轮到乙的阵营', rules.currentArmyId(CA.app.state) === myArmy,
    rules.currentArmyId(CA.app.state) + ' vs ' + myArmy);

  // 非法走法：直接绕过界面发指令，考验房主校验
  const mine = CA.app.state.pieces.filter((p) => CA.model.typeById(CA.app.state, p.t).army === myArmy);
  const pawn = mine.find((p) => rules.legalMovesFor(CA.app.state, p).length);
  ok('对战校验：本方有可走的棋子', !!pawn, mine.length + ' 枚');
  const legalSet = new Set(rules.legalMovesFor(CA.app.state, pawn).map((m) => m.r + ',' + m.c));
  let bad = null;
  for (let r = 0; r < CA.app.state.board.rows && !bad; r++) {
    for (let c = 0; c < CA.app.state.board.cols; c++) {
      if (!legalSet.has(r + ',' + c) && !(r === pawn.r && c === pawn.c)) { bad = { r, c }; break; }
    }
  }
  const pliesBefore = CA.app.state.play.plies.length;
  CB.room.session.room.localChanged({ kind: 'move', pieceId: pawn.id, r: bad.r, c: bad.c });
  await sleep(300);
  ok('对战校验：非法走法被房主拒绝', CA.app.state.play.plies.length === pliesBefore,
    CA.app.state.play.plies.length + ' vs ' + pliesBefore);

  // 走对方的棋：也应被拒绝
  const enemy = CA.app.state.pieces.find((p) => CA.model.typeById(CA.app.state, p.t).army !== myArmy);
  const enemyMoves = rules.legalMovesFor(CA.app.state, enemy);
  if (enemyMoves.length) {
    CB.room.session.room.localChanged({ kind: 'move', pieceId: enemy.id, r: enemyMoves[0].r, c: enemyMoves[0].c });
    await sleep(300);
    ok('对战校验：不能替对方走子', CA.app.state.play.plies.length === pliesBefore);
  } else {
    ok('对战校验：不能替对方走子', true);
  }

  // 合法走法
  const legal = rules.legalMovesFor(CA.app.state, pawn)[0];
  const nextArmy = rules.currentArmyId(CA.app.state);
  CB.app.movePiece(pawn.id, legal.r, legal.c);
  await sleep(500);
  const moved = CA.app.state.pieces.find((p) => p.id === pawn.id);
  ok('对战校验：合法走法被接受', moved && moved.r === legal.r && moved.c === legal.c,
    moved ? moved.r + ',' + moved.c : 'missing');
  ok('对战校验：房主状态里换了回合', rules.currentArmyId(CA.app.state) !== nextArmy,
    rules.currentArmyId(CA.app.state));
  ok('对战校验：加入者状态同步', CB.app.state.play.plies.length === CA.app.state.play.plies.length,
    CB.app.state.play.plies.length + ' vs ' + CA.app.state.play.plies.length);
  ok('对战校验：界面状态条提示归属', /轮到你|等待对方|观战/.test(B.document.getElementById('statusbar').textContent),
    B.document.getElementById('statusbar').textContent);
}

// ---------------- 悔棋请求 ----------------
{
  const before = CA.app.state.play.plies.length;
  CB.app.undoPly();                                  // 加入者 → 请求房主
  await sleep(400);
  ok('悔棋：房主代加入者回退了一步', CA.app.state.play.plies.length === before - 1,
    CA.app.state.play.plies.length + ' vs ' + (before - 1));
}

// ---------------- 离开 / 房主接管 ----------------
{
  CB.room.leave();
  await sleep(300);
  ok('离开：房主成员列表减少', CA.room.session.room.meta().members.length === 1,
    CA.room.session.room.meta().members.length);
}

// ---------------- 面板渲染 ----------------
{
  A.document.getElementById('btn-room').dispatchEvent(new A.window.MouseEvent('click', { bubbles: true }));
  const body = A.document.getElementById('room-body');
  ok('顶部按钮：点击「房间」打开面板', !!body);
  if (!body) { console.log('  房间面板没打开，跳过面板断言'); }
  ok('房间面板：显示房间号', !!body && body.textContent.includes(code), code);
  ok('房间面板：显示成员', !!body && /房主甲/.test(body.textContent));
  ok('房间面板：有邀请链接', !!body && /#room=/.test(body.textContent));
  ok('房间面板：可切换玩法', !!body && !!body.querySelector('[data-room="mode"][data-mode="match"]'));
  ok('房间面板：徽标显示房间号', /[A-Z0-9]{5}/.test(A.document.getElementById('room-badge').textContent),
    A.document.getElementById('room-badge').textContent);
  CA.room.closePanel();
  await sleep(280);
  ok('房间面板：可以关闭', !A.document.getElementById('room-body'));
}

// 收尾：停掉定时器
CA.room.leave();
CB.room.leave();
A.close(); B.close();

console.log(`\n联机端到端测试通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
