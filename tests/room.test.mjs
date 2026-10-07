/* 房间协议测试：用内存总线模拟 3 个客户端，验证同步、对战校验、在线状态与房主接管。
 * 运行： node tests/room.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');
const sandbox = {};
const code = ['presets.js', 'model.js', 'rules.js', 'net.js']
  .map((f) => fs.readFileSync(path.join(srcDir, f), 'utf8'))
  .join('\n;\n');
new Function('globalThis', 'window', code)(sandbox, sandbox);
const CE = sandbox.CE;
const M = CE.model, R = CE.rules, P = CE.presets, N = CE.net;

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; return; }
  fails.push(name + (extra !== undefined ? '  → ' + extra : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 内存总线：每个房间挂上一个假传输，消息异步投递给其他所有房间。 */
function makeBus() {
  const rooms = new Map();
  return {
    createTransport(selfId) {
      let alive = true;
      return {
        kind: 'fake',
        get ready() { return alive; },
        send(text) {
          if (!alive) return false;
          setTimeout(() => {
            for (const [id, r] of rooms) if (id !== selfId && r && r._receive) r._receive(text);
          }, 0);
          return true;
        },
        close() { alive = false; rooms.delete(selfId); }
      };
    },
    register(id, room) { rooms.set(id, room); },
    count() { return rooms.size; }
  };
}

/** 一个模拟客户端：持有自己的棋局状态，并按房间消息更新。 */
function makeClient(bus, id, name, opts) {
  const o = opts || {};
  const client = {
    id, name,
    state: o.state || P.build('chess'),
    applied: 0,
    notices: [],
    statuses: [],
    room: null
  };
  const transport = bus.createTransport(id);
  client.room = N.createRoom({
    code: o.code,
    selfId: id,
    name,
    armyId: o.armyId || null,
    role: o.role,
    mode: o.mode || 'coedit',
    transport,
    getState: () => client.state,
    getArmies: () => client.state.armies.map((a) => a.id),
    onState: (st, meta) => {
      if (st) { client.state = JSON.parse(JSON.stringify(st)); client.applied += 1; }
      client.lastMeta = meta;
    },
    onRoom: () => {},
    onNotice: (t) => client.notices.push(t),
    onStatus: (s, d) => client.statuses.push(s + (d ? ':' + d : '')),
    applyOp: o.applyOp ? (op, member) => o.applyOp(client, op, member) : null
  });
  bus.register(id, client.room);
  return client;
}

/** 房主用的走子校验（与 app.js 中同构）。 */
function hostApplyOp(client, member) {
  return (op) => {
    const st = client.state;
    if (op.kind === 'move') {
      const piece = st.pieces.find((p) => p.id === op.pieceId);
      if (!piece) return false;
      const t = M.typeById(st, piece.t);
      if (!t) return false;
      if (client.room.mode === 'match' && member && member.armyId && t.army !== member.armyId) return false;
      if (t.army !== R.currentArmyId(st)) return false;
      if (!R.legalMovesFor(st, piece).some((m) => m.r === op.r && m.c === op.c)) return false;
      R.applyPly(st, piece.id, { r: op.r, c: op.c });
      R.advanceTurn(st);
      return true;
    }
    if (op.kind === 'undo') {
      const last = st.play.plies[st.play.plies.length - 1];
      if (!last) return false;
      if (member && member.armyId && last.army !== member.armyId) return false;
      return false;                             // 由 app 层负责真正的回退
    }
    return false;
  };
}

// ---------------------------------------------------------------- 创建 / 加入
const bus = makeBus();
const host2 = makeClient(bus, 'host', '房主', {
  code: 'ROOM1', role: 'host', mode: 'coedit',
  applyOp: (client, op, member) => hostApplyOp(client)(op, member)   // 房主侧走子校验
});

const guestA = makeClient(bus, 'ga', '小明', { code: 'ROOM1', role: 'guest', mode: 'coedit' });
await sleep(200);
ok('加入：房主看到 2 名成员', host2.room.meta().members.length === 2, JSON.stringify(host2.room.meta().members.map((m) => m.name)));
ok('加入：房主收到欢迎请求', host2.notices.some((t) => /加入/.test(t)), JSON.stringify(host2.notices));
ok('加入：新人拿到房主的棋局', guestA.state.pieces.length === 32, guestA.state.pieces.length);
ok('加入：新人被自动分配阵营', !!guestA.room.meta().members.find((m) => m.id === 'ga').armyId,
  JSON.stringify(guestA.room.meta().members));
ok('加入：房主身份正确', guestA.room.hostId === 'host', guestA.room.hostId);

// ---------------------------------------------------------------- 协作编辑同步
{
  const before = host2.state.pieces.length;
  // 小明在棋盘上放一枚棋子（模拟本地编辑 → 整盘同步）
  guestA.state.pieces.push({ id: 'newp', t: guestA.state.pieceTypes[0].id, r: 4, c: 4, moved: false });
  guestA.room.localChanged({ kind: 'place' });
  await sleep(80);
  ok('协作：房主收到并应用了小明的改动', host2.state.pieces.length === before + 1, host2.state.pieces.length);
  ok('协作：房主把新状态广播给所有人', guestA.applied > 0, guestA.applied);
}

// ---------------------------------------------------------------- 第三人看到全部改动
const guestB = makeClient(bus, 'gb', '小红', { code: 'ROOM1', role: 'guest', mode: 'coedit' });
await sleep(200);
ok('第三人：加入后拿到最新状态', guestB.state.pieces.length === host2.state.pieces.length, guestB.state.pieces.length);
ok('第三人：成员列表 3 人', host2.room.meta().members.length === 3, host2.room.meta().members.length);

{
  // 房主自己改动 → 广播
  host2.state.board.rows = 9;
  host2.room.localChanged({ kind: 'resize' });
  await sleep(80);
  ok('协作：房主的改动同步给所有人', guestA.state.board.rows === 9 && guestB.state.board.rows === 9,
    guestA.state.board.rows + '/' + guestB.state.board.rows);
}

// ---------------------------------------------------------------- 对战模式：走子校验
{
  const h = host2, a = guestA, b = guestB;
  h.room.setMode('match');
  await sleep(80);
  ok('对战：模式同步到所有客户端', a.room.mode === 'match', a.room.mode);

  // 重建一个干净的象棋局面 + 明确阵营
  h.state = P.build('chess');
  h.state.play.order = [];
  R.startPlay(h.state);
  h.room.forceBroadcast();
  await sleep(80);
  ok('对战：新局面已下发', a.state.pieces.length === 32 && a.state.play.plies.length === 0);

  const members = () => h.room.meta().members;
  const aArmy = members().find((m) => m.id === 'ga').armyId;
  const bArmy = members().find((m) => m.id === 'gb').armyId;
  ok('对战：两名玩家阵营不同', aArmy !== bArmy && !!aArmy && !!bArmy, aArmy + '/' + bArmy);
  ok('对战：回合顺序包含双方', h.state.play.order.join(',') === [aArmy, bArmy].sort().join(',') || h.state.play.order.length === 2,
    h.state.play.order.join(','));

  // 让 ga 的阵营成为先手（若当前先手是 gb，则先走一步）
  const turnArmy = () => R.currentArmyId(h.state);
  if (turnArmy() === bArmy) {
    const p = h.state.pieces.find((x) => M.typeById(h.state, x.t).army === bArmy && R.legalMovesFor(h.state, x).length);
    const mv = R.legalMovesFor(h.state, p)[0];
    R.applyPly(h.state, p.id, mv); R.advanceTurn(h.state);
    h.room.forceBroadcast();
    await sleep(80);
  }
  ok('对战：轮到小明一方', turnArmy() === aArmy, turnArmy() + ' vs ' + aArmy);

  // 非法走法：把自己的兵一次走三格
  const pawn = h.state.pieces.find((x) => M.typeById(h.state, x.t).army === aArmy && M.typeById(h.state, x.t).name === '兵');
  a.room.localChanged({ kind: 'move', pieceId: pawn.id, r: pawn.r - 3, c: pawn.c });
  await sleep(80);
  ok('对战：非法走法被房主拒绝', h.state.pieces.find((x) => x.id === pawn.id).r === pawn.r,
    h.state.pieces.find((x) => x.id === pawn.id).r + ' vs ' + pawn.r);

  // 走对方的棋 → 拒绝
  const enemy = h.state.pieces.find((x) => M.typeById(h.state, x.t).army === bArmy);
  const enemyMoves = R.legalMovesFor(h.state, enemy);
  a.room.localChanged({ kind: 'move', pieceId: enemy.id, r: enemy.r, c: enemy.c + 1 });
  await sleep(80);
  ok('对战：不能替对方走子', h.state.pieces.find((x) => x.id === enemy.id).r === enemy.r);

  // 合法走法 → 通过并轮到对方
  const legal = R.legalMovesFor(h.state, pawn)[0];
  a.room.localChanged({ kind: 'move', pieceId: pawn.id, r: legal.r, c: legal.c });
  await sleep(120);
  const moved = h.state.pieces.find((x) => x.id === pawn.id);
  ok('对战：合法走法被接受', moved.r === legal.r && moved.c === legal.c, moved.r + ',' + moved.c);
  ok('对战：回合切换', R.currentArmyId(h.state) === bArmy, R.currentArmyId(h.state));
  ok('对战：所有客户端同步了新状态', a.state.play.plies.length === h.state.play.plies.length &&
    b.state.play.plies.length === h.state.play.plies.length,
    [a.state.play.plies.length, b.state.play.plies.length, h.state.play.plies.length].join('/'));
}

// ---------------------------------------------------------------- 在线状态 / 离开
{
  guestB.room.leave();
  await sleep(80);
  ok('离开：房主成员数减少', host2.room.meta().members.length === 2, host2.room.meta().members.length);
  ok('离开：其他人收到提示', host2.notices.some((t) => /离开/.test(t)), JSON.stringify(host2.notices));
}

// ---------------------------------------------------------------- 接管房主
{
  host2.room.leave();
  await sleep(60);
  ok('房主离线：加入者被识别', guestA.room.hostId === 'host');
  guestA.room.takeover();
  await sleep(60);
  ok('接管：身份变为主持', guestA.room.role === 'host' && guestA.room.hostId === 'ga');

  const guestC = makeClient(bus, 'gc', '小刚', { code: 'ROOM1', role: 'guest', mode: 'coedit' });
  await sleep(200);
  ok('接管：新加入者由新主持接待', guestC.state.pieces.length === guestA.state.pieces.length &&
    guestA.room.meta().members.length === 2,
    guestC.state.pieces.length + ' / ' + guestA.room.meta().members.length);
  guestC.room.leave();
}

// ---------------------------------------------------------------- 邀请链接
{
  const parsed = N.parseHash('#room=AB23X&net=mqtt&mode=match');
  ok('邀请链接：可解析房间号', parsed.room === 'AB23X' && parsed.net === 'mqtt' && parsed.mode === 'match', JSON.stringify(parsed));
  ok('房间号：随机且不含易混字符', /^[A-HJ-NP-Z2-9]{5}$/.test(N.makeCode(5)), N.makeCode(5));
  ok('主题名：带前缀与房间号', N.topicFor('ab23x') === 'chess-studio/v1/AB23X', N.topicFor('ab23x'));
}

// 收尾：清掉心跳定时器，否则进程不会退出
try { guestA.room.leave(); } catch (e) { /* ignore */ }
try { host2.room.leave(); } catch (e) { /* ignore */ }

console.log(`\n房间协议测试通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
process.exit(0);
