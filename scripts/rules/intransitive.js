// Intransitive / Rock Paper Scissors 2, designed by webgoatguy.
// Rules and setup: https://www.youtube.com/watch?v=LO_zcGNJriA · https://meaf.us/rps2/
// Independent implementation. white = blue (a1); black = red (i9).
const rpsBeats = {rock:'scissors',paper:'rock',scissors:'paper'};
const rpsNames = {rock:'石',paper:'布',scissors:'剪'};
const rpsOther = side => side === 'white' ? 'black' : 'white';
const rpsLabel = side => side === 'white' ? '蓝方' : '红方';
const rpsBase = side => side === 'white' ? {row:8,col:0} : {row:0,col:8};
const rpsSame = (a,b) => a.row === b.row && a.col === b.col;
const rpsInside = c => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < 9 && c.col >= 0 && c.col < 9;
const rpsQuiet = state => state.data.quietPlies ?? 0;
function rpsValid(state, project) {
  return project.board.rows === 9 && project.board.cols === 9 && state.pieces.every(p => Object.hasOwn(rpsBeats,p.type) && rpsInside(p)) && Number.isInteger(rpsQuiet(state)) && rpsQuiet(state) >= 0;
}
function rpsMoves(pieces, side) {
  const occupied = new Map(pieces.map(p => [p.row*9+p.col,p])), moves = [];
  for (const piece of pieces) {
    if (piece.side !== side) continue;
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
      if (!dr && !dc) continue;
      const to = {row:piece.row+dr,col:piece.col+dc};
      if (!rpsInside(to)) continue;
      const target = occupied.get(to.row*9+to.col);
      if (!target || target.side !== side && rpsBeats[piece.type] === target.type) moves.push({from:{row:piece.row,col:piece.col},to});
    }
  }
  const goal = rpsBase(rpsOther(side));
  const priority = m => rpsSame(m.to,goal) ? 1000 : occupied.has(m.to.row*9+m.to.col) ? 100 : 8-Math.max(Math.abs(m.to.row-goal.row),Math.abs(m.to.col-goal.col));
  return moves.sort((a,b) => priority(b)-priority(a));
}
function onMove(state, move, project) {
  const fail = message => ({valid:false,message});
  if (state.winner) return fail('本局已结束，请重新开始。');
  if (!rpsValid(state,project)) return fail('石头剪刀布棋需要 9 × 9 棋盘，以及石、布、剪三种棋子。');
  if (!rpsInside(move.from) || !rpsInside(move.to)) return fail('请先选择己方棋子，再选择棋盘内的相邻格。');
  if (move.action !== undefined || move.promotion !== undefined) return fail('本棋没有特殊动作或升变。');
  const mover = state.pieces.find(p => rpsSame(p,move.from));
  if (!mover || mover.side !== state.turn) return fail('请选择当前一方的棋子。');
  if (Math.max(Math.abs(move.to.row-mover.row),Math.abs(move.to.col-mover.col)) !== 1) return fail('每次只能横、竖或斜向移动一格，不能原地停着。');
  const target = state.pieces.find(p => rpsSame(p,move.to));
  if (target?.side === mover.side) return fail('不能进入己方棋子占据的格子。');
  if (target && rpsBeats[mover.type] !== target.type) return fail('石吃剪、剪吃布、布吃石；同类与克制自己的棋子不能吃。');
  const pieces = state.pieces.filter(p => p.id !== target?.id).map(p => p.id === mover.id ? {...p,...move.to} : {...p});
  const next = rpsOther(state.turn), quietPlies = target ? 0 : rpsQuiet(state)+1;
  let winner = null, reason = '';
  if (rpsSame(move.to,rpsBase(next))) { winner = state.turn; reason = '攻入敌方基地'; }
  else if (!pieces.some(p => p.side === next)) { winner = state.turn; reason = '吃光对方棋子'; }
  else if (!rpsMoves(pieces,next).length) { winner = state.turn; reason = '对方无合法走法'; }
  else if (quietPlies >= 200) { winner = 'draw'; reason = '连续 200 手未吃子'; }
  const at = c => String.fromCharCode(97+c.col)+(9-c.row);
  const message = rpsLabel(state.turn)+rpsNames[mover.type]+' '+at(move.from)+' → '+at(move.to)+(target ? ' · 吃'+rpsNames[target.type] : '')+(reason ? ' · '+reason+(winner === 'draw' ? '，和棋' : '，获胜') : '');
  return {valid:true,pieces,turn:next,winner,data:{...state.data,quietPlies,reason},message};
}
function getLegalMoves(state, project) {
  return state.winner || !rpsValid(state,project) ? [] : rpsMoves(state.pieces,state.turn);
}
function evaluate(state, side) {
  if (state.winner) return state.winner === 'draw' ? 0 : state.winner === side ? 100000 : -100000;
  let score = 0;
  for (const player of [side,rpsOther(side)]) {
    const own = state.pieces.filter(p => p.side === player), enemy = state.pieces.filter(p => p.side !== player);
    const goal = rpsBase(rpsOther(player)), sign = player === side ? 1 : -1;
    let closest = 9;
    for (const p of own) {
      const distance = Math.max(Math.abs(p.row-goal.row),Math.abs(p.col-goal.col));
      closest = Math.min(closest,distance);
      const threatened = enemy.some(q => rpsBeats[q.type] === p.type && Math.max(Math.abs(p.row-q.row),Math.abs(p.col-q.col)) === 1);
      score += sign*(120+(8-distance)*5-(threatened ? state.turn === player ? 18 : 55 : 0));
    }
    score += sign*((8-closest)*22+new Set(own.map(p => p.type)).size*15+rpsMoves(state.pieces,player).length);
    if (closest === 1) score += sign*(state.turn === player ? 500 : 120);
  }
  return score;
}
function getGameView(state) {
  const counts = side => ['rock','paper','scissors'].map(type => rpsNames[type]+' '+state.pieces.filter(p => p.side === side && p.type === type).length).join(' · ');
  return {
    interaction:'move',actions:[],
    message:state.winner ? (state.winner === 'draw' ? '和棋' : rpsLabel(state.winner)+'获胜')+' · '+state.data.reason : rpsLabel(state.turn)+'行动：八向一步；石吃剪、剪吃布、布吃石。攻入'+(state.turn === 'white' ? '右上 i9 红方基地' : '左下 a1 蓝方基地')+'即胜。',
    markers:[{cell:rpsBase('white'),label:'蓝方基地'},{cell:rpsBase('black'),label:'红方基地'}],
    details:[{title:'兵力与和棋计数',text:'蓝方：'+counts('white')+'\n红方：'+counts('black')+'\n连续未吃子：'+rpsQuiet(state)+' / 200 手（双方各走一次为两手）。吃子后归零。'},
      {title:'玩法速查',text:'蓝方先手，双方交替移动一枚棋子。石、布、剪都能横、竖、斜向移动一格。只能落在空格，或吃掉被自己克制的敌子；同类不能互吃，不能吃己子，也没有跳跃、变身或随机猜拳。\n任意己子进入敌方基地立即获胜，即使该格受到敌子攻击。可以进入和守卫己方基地。吃光敌子或让对方无合法走法也获胜。\n沿用视频所附网站电脑对弈版的和棋规则：连续 200 手（100 回合）未吃子则和棋；攻入基地等胜利条件优先。'}],
  };
}
