// 迷你永恒棋：规则设计 日出333。独立数字化实现；授权状态尚未核实。
// 来源：https://newchessbar.fandom.com/zh/wiki/迷你永恒棋
// 坐标：红方在下（1–3 行），蓝方在上（5–7 行）。
const miniOther = side => side === 'white' ? 'black' : 'white';
const miniSame = (a, b) => a.row === b.row && a.col === b.col;
const miniInside = c => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < 7 && c.col >= 0 && c.col < 6;
const miniStone = p => p.type === 'river-stone';
const miniZone = (side, c) => c.row === (side === 'white' ? 6 : 0) && [2, 3].includes(c.col);
const miniHalf = (side, c) => side === 'white' ? c.row >= 4 : c.row <= 2;
const miniGuardian = p => !miniStone(p) && miniZone(p.side, p);
const miniSetup = side => (side === 'white' ? [[6,1],[5,0],[5,1],[6,4],[5,4],[5,5]] : [[0,1],[1,0],[1,1],[0,4],[1,4],[1,5]]).map(([row,col]) => ({row,col}));
const miniPhase = state => state.data.phase || 'setup';
function miniSecondGuardian(pieces, side, to, ignoreId) {
  return miniZone(side, to) && pieces.some(p => p.id !== ignoreId && p.side === side && miniGuardian(p));
}
function miniDestinations(pieces, piece) {
  const destinations = [], at = c => pieces.find(p => miniSame(p, c));
  if (miniStone(piece)) return destinations;
  if (piece.type === 'horse') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]]) {
      const to = {row:piece.row+dr,col:piece.col+dc};
      if (miniInside(to)) destinations.push(to); // 马不蹩腿。
    }
  } else if (['rook','cannon'].includes(piece.type)) {
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let screen = false;
      for (let n = 1; n < 7; n++) {
        const to = {row:piece.row+dr*n,col:piece.col+dc*n};
        if (!miniInside(to)) break;
        const target = at(to);
        if (piece.type === 'rook') { destinations.push(to); if (target) break; }
        else if (!screen) { if (target) screen = true; else destinations.push(to); }
        else if (target) { destinations.push(to); break; }
      }
    }
  }
  return destinations.filter(to => !miniGuardian(at(to) || {type:'river-stone'}) && !miniSecondGuardian(pieces, piece.side, to, piece.id));
}
function miniValidSetup(state) {
  return ['white','black'].every(side => {
    const pieces = state.pieces.filter(p => !miniStone(p) && p.side === side), cells = miniSetup(side);
    return pieces.length === 6 && ['rook','horse','cannon'].every(type => pieces.filter(p => p.type === type).length === 2) && pieces.every(p => cells.some(c => miniSame(p,c)));
  }) && state.pieces.filter(miniStone).length === 6 && state.pieces.filter(miniStone).every(p => p.row === 3);
}
function onMove(state, move) {
  const fail = message => ({valid:false,message});
  if (state.winner) return fail('本局已经结束。');
  if (!miniInside(move.to) || (move.from && !miniInside(move.from))) return fail('落点不在棋盘内。');
  const phase = miniPhase(state), side = state.turn;
  const pieces = state.pieces.map(p => ({...p}));
  const done = (turn, data, winner = null) => ({valid:true,pieces,turn,data,winner,message:phase === 'setup' ? move.action === 'confirm-setup' ? '确认布阵' : '布阵交换' : phase === 'placing' ? '放回 '+String.fromCharCode(97+move.to.col)+(7-move.to.row) : undefined});
  if (phase === 'setup') {
    if (!miniValidSetup(state)) return fail('布阵须在每方六个指定格内各放两车、两马、两炮，并保留六枚河中石。');
    if (move.action === 'confirm-setup') {
      const confirmed = [...(state.data.confirmed || []), side];
      return confirmed.includes('white') && confirmed.includes('black') ? done('white',{phase:'moving'}) : done(miniOther(side),{phase:'setup',confirmed});
    }
    if (move.action) return fail('未知布阵操作。');
    const from = move.from && pieces.find(p => miniSame(p,move.from)), to = pieces.find(p => miniSame(p,move.to));
    if (!from || !to || miniStone(from) || miniStone(to) || from.side !== side || to.side !== side || miniSame(from,to)) return fail('布阵时选择两枚己方棋子交换位置，再确认布阵。');
    const old = {row:from.row,col:from.col}; from.row = to.row; from.col = to.col; to.row = old.row; to.col = old.col;
    return done(side,{...state.data,phase:'setup'});
  }
  if (move.action) return fail('当前不能执行布阵操作。');
  if (phase === 'placing') {
    const captured = state.data.captured;
    if (!captured || miniStone(captured) || move.from || pieces.some(p => miniSame(p,move.to)) || !miniHalf(captured.side,move.to)) return fail('请点击被吃棋子所属半场的一个空位，将它放回。');
    if (miniSecondGuardian(pieces,captured.side,move.to)) return fail('每方最多一名守护者，不能放入第二枚。');
    pieces.push({...captured,...move.to});
    return done(miniOther(side),{phase:'moving',lastAction:'restore'});
  }
  if (phase !== 'moving') return fail('无效的对局阶段。');
  const mover = move.from && pieces.find(p => miniSame(p,move.from));
  if (!mover || miniStone(mover) || mover.side !== side) return fail('请先选择己方的车、马或炮。');
  if (!miniDestinations(pieces,mover).some(c => miniSame(c,move.to))) return fail('不符合走法，或目标受到守护者规则保护。');
  const target = pieces.find(p => miniSame(p,move.to));
  if (target) pieces.splice(pieces.indexOf(target),1);
  mover.row = move.to.row; mover.col = move.to.col;
  // 进入对方禁区立即获胜；此时不再执行放回。
  if (miniZone(miniOther(side),mover)) return done(side,{phase:'moving'},side);
  if (target && !miniStone(target)) return done(side,{phase:'placing',captured:target});
  return done(miniOther(side),{phase:'moving'});
}
function getLegalMoves(state) {
  if (state.winner) return [];
  const phase = miniPhase(state);
  // 电脑采用预设布阵；人工交换不加入搜索树，避免无限交换。
  if (phase === 'setup') return miniValidSetup(state) ? [{action:'confirm-setup',to:miniSetup(state.turn)[0]}] : [];
  if (phase === 'placing') {
    const captured = state.data.captured, moves = [];
    if (!captured) return moves;
    for (let row=0;row<7;row++) for (let col=0;col<6;col++) {
      const to={row,col};
      if (miniHalf(captured.side,to) && !state.pieces.some(p => miniSame(p,to)) && !miniSecondGuardian(state.pieces,captured.side,to)) moves.push({to});
    }
    // 放回时优先远离敌方禁区，不轻易帮助对方发起进攻。
    return moves.sort((a,b) => captured.side === 'white' ? b.to.row-a.to.row : a.to.row-b.to.row);
  }
  const moves = state.pieces.filter(p => !miniStone(p) && p.side === state.turn).flatMap(p => miniDestinations(state.pieces,p).map(to => ({from:{row:p.row,col:p.col},to})));
  return moves.sort((a,b) => Number(miniZone(miniOther(state.turn),b.to))-Number(miniZone(miniOther(state.turn),a.to)));
}
function evaluate(state, side) {
  let score = 0;
  for (const piece of state.pieces) {
    if (miniStone(piece)) continue;
    const progress = piece.side === 'white' ? 6-piece.row : piece.row;
    let value = progress*progress*4 + (miniGuardian(piece) ? 28 : 0);
    for (const to of miniDestinations(state.pieces,piece)) {
      value += 1;
      if (miniZone(miniOther(piece.side),to)) value += 800;
    }
    score += piece.side === side ? value : -value;
  }
  return score;
}
function getGameView(state) {
  if (state.winner) return {};
  const phase = miniPhase(state), label = state.turn === 'white' ? '红方' : '蓝方';
  if (phase === 'setup') return {interaction:'swap',message:label+'布阵：点击或拖动两枚己方棋子交换位置，完成后确认。电脑采用预设布阵。',actions:[{label:'确认布阵',move:{action:'confirm-setup',to:miniSetup(state.turn)[0]}}]};
  if (phase === 'placing') return {interaction:'place',message:'仍由'+label+'操作：把被吃的'+(state.data.captured.side === 'white' ? '红方' : '蓝方')+'棋子放回其所属半场的空位，放回后才换手。'};
  return {interaction:'move',message:'进入对方禁区获胜。可吃己方棋子；己方禁区内的守护者不能被吃，每方最多一名。'};
}
