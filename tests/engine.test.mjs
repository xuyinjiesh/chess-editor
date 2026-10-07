/* 规则引擎测试：在 Node 中直接加载浏览器脚本（IIFE + window）运行断言。
 * 运行： node tests/engine.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');
const win = {};
const code = ['presets.js', 'model.js', 'rules.js']
  .map((f) => fs.readFileSync(path.join(srcDir, f), 'utf8'))
  .join('\n;\n');
new Function('window', code)(win);
const CE = win.CE;
const { model: M, rules: R, presets: P } = CE;

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass += 1; return; }
  fails.push(name + (extra ? '  → ' + extra : ''));
}
function mv(state, r, c) {
  const p = M.pieceAt(state, r, c);
  if (!p) return null;
  return R.generateMoves(state, p).map((m) => `${m.r},${m.c}${m.capture ? 'x' : ''}`).sort();
}
function legal(state, r, c) {
  const p = M.pieceAt(state, r, c);
  if (!p) return null;
  return R.legalMovesFor(state, p).map((m) => `${m.r},${m.c}${m.capture ? 'x' : ''}`).sort();
}

// ---------------------------------------------------------------- 模板
const ids = ['chess', 'xiangqi', 'mini6', 'empty8', 'kingHill', 'go19'];
for (const id of ids) {
  let s;
  try { s = P.build(id); } catch (e) { ok('模板 ' + id + ' 可构建', false, e.message); continue; }
  ok('模板 ' + id + ' 可构建', !!s && Array.isArray(s.pieces));
  const round = M.normalize(JSON.parse(JSON.stringify(s)));
  ok('模板 ' + id + ' 序列化往返', round.pieces.length === s.pieces.length && round.pieceTypes.length === s.pieceTypes.length,
    `pieces ${s.pieces.length}→${round.pieces.length}, types ${s.pieceTypes.length}→${round.pieceTypes.length}`);
}

// ---------------------------------------------------------------- 国际象棋
{
  const s = P.build('chess');
  ok('象棋：32 子', s.pieces.length === 32, String(s.pieces.length));
  const e2 = s.pieces.find((p) => p.r === 6 && p.c === 4);
  ok('象棋：e2 兵可走 e3/e4', JSON.stringify(mv(s, 6, 4)) === JSON.stringify(['4,4', '5,4']), JSON.stringify(mv(s, 6, 4)));
  ok('象棋：e2 兵不可斜吃', !mv(s, 6, 4).some((x) => x.includes('x')));
  ok('象棋：g1 马两个落点', JSON.stringify(mv(s, 7, 6)) === JSON.stringify(['5,5', '5,7']), JSON.stringify(mv(s, 7, 6)));
  ok('象棋：a1 车被己方挡住', JSON.stringify(mv(s, 7, 0)) === JSON.stringify([]), JSON.stringify(mv(s, 7, 0)));
  // 白兵前进后能吃黑兵
  const s2 = JSON.parse(JSON.stringify(s));
  s2.pieces = s2.pieces.filter((p) => !(p.r === 5 && p.c === 5));
  const wp = s2.pieces.find((p) => p.r === 6 && p.c === 4);
  wp.r = 5; wp.c = 4;
  const bp = s2.pieces.find((p) => p.r === 1 && p.c === 5);
  bp.r = 4; bp.c = 5;
  const m = mv(s2, 5, 4);
  ok('象棋：兵斜吃 d5', m.includes('4,5x'), JSON.stringify(m));
  // 首步两格被挡则只剩一格
  const s3 = JSON.parse(JSON.stringify(s2));
  s3.pieces.push({ id: 'tmp', t: s3.pieceTypes.find((t) => t.name === '马' && t.army === 'w').id, r: 4, c: 4, moved: false });
  const m3 = mv(s3, 5, 4);
  ok('象棋：前方被占则不能走两格', !m3.includes('3,4') && m3.includes('4,4') === false, JSON.stringify(m3));
}

// ---------------------------------------------------------------- 炮
{
  const s = P.build('xiangqi');
  const cannon = mv(s, 7, 1);
  // 竖线上行 4 格、下行 1 格（被己方马挡住），横线 6 格
  ok('象棋：炮不吃子走法 11 个', cannon.filter((x) => !x.includes('x')).length === 11, JSON.stringify(cannon));
  ok('象棋：炮隔子吃黑马', cannon.includes('0,1x'), JSON.stringify(cannon));
  ok('象棋：炮不能吃炮架', !cannon.includes('2,1x'));
  ok('象棋：炮不吃子时不能穿过炮架', !cannon.includes('1,1'), JSON.stringify(cannon));
}

// ---------------------------------------------------------------- 马腿 / 象眼
{
  const s = P.build('xiangqi');
  ok('象棋：马两个落点', JSON.stringify(mv(s, 9, 1)) === JSON.stringify(['7,0', '7,2']), JSON.stringify(mv(s, 9, 1)));
  const s2 = JSON.parse(JSON.stringify(s));
  s2.pieces.push({ id: 'blk', t: s2.pieceTypes.find((t) => t.name === '卒').id, r: 8, c: 1, moved: false });
  ok('象棋：蹩马腿', JSON.stringify(mv(s2, 9, 1)) === JSON.stringify([]), JSON.stringify(mv(s2, 9, 1)));
  ok('象棋：相走田字', JSON.stringify(mv(s, 9, 2)) === JSON.stringify(['7,0', '7,4']), JSON.stringify(mv(s, 9, 2)));
  const s3 = JSON.parse(JSON.stringify(s));
  s3.pieces.push({ id: 'blk2', t: s3.pieceTypes.find((t) => t.name === '卒').id, r: 8, c: 3, moved: false });
  ok('象棋：塞象眼', JSON.stringify(mv(s3, 9, 2)) === JSON.stringify(['7,0']), JSON.stringify(mv(s3, 9, 2)));
  // 相不能过河
  const s4 = JSON.parse(JSON.stringify(s));
  const el = s4.pieces.find((p) => p.r === 9 && p.c === 2);
  el.r = 5; el.c = 2;
  const m4 = mv(s4, 5, 2) || [];
  ok('象棋：相不过河', m4.every((k) => Number(k.split(',')[0]) >= 4), JSON.stringify(m4));
}

// ---------------------------------------------------------------- 将军与送将
{
  const s = P.build('empty8');
  const wk = s.pieceTypes.find((t) => t.name === '王' && t.army === 'a');
  const br = s.pieceTypes.find((t) => t.name === '车' && t.army === 'b');
  const bp = s.pieceTypes.find((t) => t.name === '兵' && t.army === 'b');
  s.pieces = [
    { id: 'k', t: wk.id, r: 7, c: 4, moved: false },
    { id: 'r', t: br.id, r: 0, c: 4, moved: false },
    { id: 'p', t: bp.id, r: 7, c: 0, moved: false }
  ];
  ok('将军：判定成立', R.isInCheck(s, 'a') === true);
  const pm = legal(s, 7, 0);
  ok('将军：被将时不能随便走兵', pm !== null && pm.every((k) => k.startsWith('6,0') === false), JSON.stringify(pm));
  const k = M.pieceAt(s, 7, 4);
  const km = R.legalMovesFor(s, k).map((m) => `${m.r},${m.c}`);
  ok('将军：王不能留在车的射线上', !km.includes('6,4'), JSON.stringify(km));
  ok('将军：王可以横向躲开', km.includes('7,3') && km.includes('7,5'), JSON.stringify(km));
}

// ---------------------------------------------------------------- 胜负判定
{
  const s = P.build('chess');
  R.startPlay(s);
  const wp = M.pieceAt(s, 6, 4);
  R.applyPly(s, wp.id, { r: 4, c: 4, capture: false });
  ok('对局：记录一步', s.play.plies.length === 1);
  ok('对局：走子后回合未自动切换', R.currentArmyId(s) === 'w');
  R.advanceTurn(s);
  ok('对局：回合切换', R.currentArmyId(s) === 'b');

  const s2 = P.build('empty8');
  const wk = s2.pieceTypes.find((t) => t.name === '王' && t.army === 'a');
  const bk = s2.pieceTypes.find((t) => t.name === '王' && t.army === 'b');
  const wr = s2.pieceTypes.find((t) => t.name === '车' && t.army === 'a');
  s2.pieces = [
    { id: 'wk', t: wk.id, r: 7, c: 0, moved: false },
    { id: 'bk', t: bk.id, r: 0, c: 7, moved: false },
    { id: 'wr', t: wr.id, r: 0, c: 0, moved: false }
  ];
  s2.play.order = ['a', 'b'];
  s2.play.turn = 0;
  R.applyPly(s2, 'wr', { r: 0, c: 7, capture: true });
  const res = R.evaluate(s2);
  ok('胜负：擒王', res && res.kind === 'win' && res.army === 'a', JSON.stringify(res));

  // 目标格
  const s3 = P.build('kingHill');
  s3.play.order = ['r', 'b'];
  s3.play.turn = 0;
  const rk = s3.pieces.find((p) => p.r === 6 && p.c === 3);
  R.applyPly(s3, rk.id, { r: 5, c: 3, capture: false });
  ok('胜负：未到目标继续', R.evaluate(s3) === null);
  R.applyPly(s3, rk.id, { r: 4, c: 3, capture: false });
  R.applyPly(s3, rk.id, { r: 3, c: 3, capture: false });
  const res3 = R.evaluate(s3);
  ok('胜负：抵达目标格', res3 && res3.kind === 'win' && /目标/.test(res3.reason), JSON.stringify(res3));

  // 无子可动（困毙）：黑王被困在角落，白车封锁第 1 行、白象守住 a7
  const s4 = P.build('empty8');
  const b1 = s4.pieceTypes.find((t) => t.name === '王' && t.army === 'a');
  const b2 = s4.pieceTypes.find((t) => t.name === '王' && t.army === 'b');
  const rook = s4.pieceTypes.find((t) => t.name === '车' && t.army === 'a');
  const bishop = s4.pieceTypes.find((t) => t.name === '象' && t.army === 'a');
  s4.pieces = [
    { id: 'k1', t: b1.id, r: 7, c: 7, moved: false },
    { id: 'k2', t: b2.id, r: 0, c: 0, moved: false },
    { id: 'r1', t: rook.id, r: 1, c: 7, moved: false },
    { id: 'b1', t: bishop.id, r: 2, c: 3, moved: false }
  ];
  s4.play.order = ['a', 'b'];
  s4.play.turn = 1;                                    // 轮到黑方
  s4.play.plies.push({ army: 'a', t: rook.id, from: { r: 0, c: 7 }, to: { r: 1, c: 7 }, captured: null, to2: null });
  ok('困毙：黑方确实无子可动', R.hasAnyLegalMove(s4, 'b') === false);
  const res4 = R.evaluate(s4);
  ok('胜负：无子可动判负', res4 && res4.kind === 'win' && res4.army === 'a', JSON.stringify(res4));
}

// ---------------------------------------------------------------- 规则细节
{
  const s = P.build('empty8');
  const t = M.pieceAt(s, 0, 0);
  ok('空模板无棋子', s.pieces.length === 0 && t === null);
  const st = M.normalize({ board: { rows: 99, cols: 1 }, pieces: [] });
  ok('越界参数被修正', st.board.rows === 24 && st.board.cols === 2, st.board.rows + 'x' + st.board.cols);

  // 障碍格阻断
  const s5 = P.build('empty8');
  const rookT = s5.pieceTypes.find((x) => x.name === '车' && x.army === 'a');
  s5.pieces = [{ id: 'R', t: rookT.id, r: 4, c: 0, moved: false }];
  s5.cells = { '4,2': 'block' };
  const rm = mv(s5, 4, 0);
  ok('障碍：阻断直线', !rm.some((k) => k.startsWith('4,2')) && !rm.some((k) => k.startsWith('4,3')), JSON.stringify(rm));
  ok('障碍：不能落在障碍上', !rm.some((k) => k.startsWith('4,2')));

  // 不可吃子
  const s6 = P.build('empty8');
  const bT = s6.pieceTypes.find((x) => x.name === '兵' && x.army === 'b');
  const aT = s6.pieceTypes.find((x) => x.name === '兵' && x.army === 'a');
  s6.pieces = [
    { id: 'a1', t: aT.id, r: 4, c: 0, moved: true },
    { id: 'b1', t: bT.id, r: 3, c: 0, moved: true }
  ];
  const am = mv(s6, 4, 0) || [];
  ok('兵：前方有敌子不能直吃', !am.some((k) => k.includes('x')), JSON.stringify(am));
  const bm = mv(s6, 3, 0) || [];
  ok('黑兵：前方红兵同样不能直吃', !bm.some((k) => k.includes('x')), JSON.stringify(bm));
}

console.log(`\n通过 ${pass} 项，失败 ${fails.length} 项`);
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('全部通过 ✓');
