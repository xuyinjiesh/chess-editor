// 震棋：参考用户 chess-room 实现及日出333的视频介绍。
// https://www.bilibili.com/video/BV1ch4y1c7Kn/ （原规则设计者与授权状态尚未核实）
const shockDirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const shockLines = [[0,1],[1,0],[1,1],[1,-1]];
const shockSame = (a,b) => a.row === b.row && a.col === b.col;
const shockInside = (c,project) => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < project.board.rows && c.col >= 0 && c.col < project.board.cols;
function shockWins(pieces,side) {
  const occupied = new Set(pieces.filter(p => p.side === side).map(p => p.row+','+p.col));
  return pieces.filter(p => p.side === side).some(p => shockLines.some(([dr,dc]) => [1,2,3].every(n => occupied.has((p.row+dr*n)+','+(p.col+dc*n)))));
}
function onMove(state,move,project) {
  const fail = message => ({valid:false,message});
  if (state.winner) return fail('本局已经结束。');
  if (move.from || move.action || !shockInside(move.to,project)) return fail('请在棋盘空位落子。');
  if (state.pieces.some(p => shockSame(p,move.to))) return fail('这个位置已有棋子。');
  const placed = {id:'shock-'+state.history.length+'-'+move.to.row+'-'+move.to.col,type:project.pieceTypes[0].id,side:state.turn,...move.to};
  const before = [...state.pieces,placed], turn = state.turn === 'black' ? 'white' : 'black';
  // 与参考版本相同：新落子已连四时立即结束，不再击退。
  if (shockWins(before,state.turn)) return {valid:true,pieces:before,turn,winner:state.turn,data:{lastAction:'win-before-shock'}};
  const occupied = new Set(before.map(p => p.row+','+p.col));
  const pieces = before.flatMap(piece => {
    if (piece === placed) return [{...piece}];
    const dr = piece.row-placed.row, dc = piece.col-placed.col;
    if (Math.max(Math.abs(dr),Math.abs(dc)) !== 1) return [{...piece}];
    const to = {row:piece.row+dr,col:piece.col+dc};
    if (!shockInside(to,project)) return []; // 出界移除。
    if (occupied.has(to.row+','+to.col)) return [{...piece}]; // 受阻不动，不连锁。
    return [{...piece,...to}]; // 所有击退依据击退前的棋盘同时发生。
  });
  const black = shockWins(pieces,'black'), white = shockWins(pieces,'white');
  const winner = black && white ? 'draw' : black ? 'black' : white ? 'white' : pieces.length === project.board.rows*project.board.cols ? 'draw' : null;
  return {valid:true,pieces,turn,winner,data:{lastAction:'shock'}};
}
function getLegalMoves(state,project) {
  if (state.winner) return [];
  const occupied = new Set(state.pieces.map(p => p.row+','+p.col)), moves = [];
  const priority = to => shockDirs.filter(([dr,dc]) => occupied.has((to.row+dr)+','+(to.col+dc))).length*8-Math.abs(to.row-(project.board.rows-1)/2)-Math.abs(to.col-(project.board.cols-1)/2);
  for (let row=0;row<project.board.rows;row++) for (let col=0;col<project.board.cols;col++) if (!occupied.has(row+','+col)) moves.push({to:{row,col}});
  return moves.sort((a,b) => priority(b.to)-priority(a.to));
}
function evaluate(state,side,project) {
  let score = 0;
  const at = new Map(state.pieces.map(p => [p.row+','+p.col,p.side]));
  for (const piece of state.pieces) {
    const sign = piece.side === side ? 1 : -1;
    score += sign*(project.board.rows+project.board.cols-Math.abs(piece.row-(project.board.rows-1)/2)-Math.abs(piece.col-(project.board.cols-1)/2));
    for (const [dr,dc] of shockLines) {
      const behind = {row:piece.row-dr,col:piece.col-dc};
      if (at.get(behind.row+','+behind.col) === piece.side) continue;
      let length = 1;
      while (at.get((piece.row+dr*length)+','+(piece.col+dc*length)) === piece.side) length++;
      const ahead = {row:piece.row+dr*length,col:piece.col+dc*length};
      const open = Number(shockInside(behind,project) && !at.has(behind.row+','+behind.col))+Number(shockInside(ahead,project) && !at.has(ahead.row+','+ahead.col));
      score += sign*(length >= 4 ? 5000 : length === 3 ? [6,100,180][open] : length === 2 ? [1,8,18][open] : 0);
    }
  }
  return score;
}
function getGameView(state) {
  return state.winner ? {} : {interaction:'place',message:'点击空位落子。周围八格的棋子同时向外退一格：受阻不动，出界移除。落子已连四则立即获胜；否则击退后再判连四。'};
}
