// 足球棋 · xuyinjie 原创。根据 chess-room 移植，带球入门同样进球。
const FB_DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const FB_KNIGHTS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const FB_NAMES = {gk:'守门员',df:'后卫',mf:'中场',fw:'前锋'};
const fbSame = (a,b) => a.row === b.row && a.col === b.col;
const fbAt = (s,c) => s.pieces.find(p => fbSame(p,c));
const fbInside = c => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < 23 && c.col >= 0 && c.col < 15;
const fbGoal = c => (c.row === 0 || c.row === 22) && c.col >= 5 && c.col <= 9;
const fbBallInside = c => fbInside(c) && (c.row > 0 && c.row < 22 || fbGoal(c));
const fbCoord = c => String.fromCharCode(97+c.col)+(23-c.row);
const fbOther = side => side === 'white' ? 'black' : 'white';
function fbBall(s) {
  return s.pieces.find(p => p.id === s.data.carrierId && FB_NAMES[p.type]) || s.pieces.find(p => p.type === 'ball');
}
function fbReady(s,p) {
  return s.data.carrierId === p.id && s.data.charged === true;
}
function fbPlayerTargets(s,p) {
  const targets = [], limit = {gk:2,df:3,mf:3,fw:4}[p.type];
  if (!limit) return targets;
  for (const [dr,dc] of FB_DIRS) for (let n=1;n<=limit;n++) {
    if (p.type === 'mf' && n*(Math.abs(dr)+Math.abs(dc)) > 3) break;
    const to = {row:p.row+dr*n,col:p.col+dc*n};
    if (!fbInside(to)) break;
    const target = fbAt(s,to);
    if (target && target.type !== 'ball') break;
    targets.push(to);
  }
  if (p.type === 'mf') for (const [dr,dc] of FB_KNIGHTS) {
    const to = {row:p.row+dr,col:p.col+dc}, target = fbAt(s,to);
    if (fbInside(to) && (!target || target.type === 'ball')) targets.push(to);
  }
  return targets;
}
function fbKickTargets(s,p) {
  const ball = fbBall(s), targets = new Map();
  if (!ball || Math.max(Math.abs(ball.row-p.row),Math.abs(ball.col-p.col)) > 1) return [];
  const ready = fbReady(s,p), br = ball.row-p.row, bc = ball.col-p.col;
  const passable = to => fbBallInside(to) && (!fbAt(s,to) || fbAt(s,to).type !== 'ball' && fbAt(s,to).side === p.side);
  function ray(start,dr,dc) {
    for (let n=1;n<24;n++) {
      const to = {row:start.row+dr*n,col:start.col+dc*n};
      if (!passable(to) || fbSame(to,ball)) break;
      targets.set(to.row+','+to.col,to);
      if (fbAt(s,to)) break; // A teammate receives; an opponent blocks.
    }
  }
  for (const [dr,dc] of FB_DIRS) if (ready && p.type !== 'fw' || br*dr+bc*dc >= 0) ray(ball,dr,dc);
  if (p.type === 'mf' || ready && ['fw','df'].includes(p.type)) for (const [dr,dc] of FB_KNIGHTS) ray(ball,dr,dc);
  if (ready && p.type !== 'gk') for (const [dr,dc] of FB_DIRS) {
    const bend = {row:ball.row+dr,col:ball.col+dc};
    if (!passable(bend)) continue;
    if (dr === 0 || dc === 0) {
      ray(bend,dr+dc,dc-dr);
      ray(bend,dr-dc,dc+dr);
    } else {
      ray(bend,dr,0);
      ray(bend,0,dc);
    }
  }
  return [...targets.values()];
}
function fbValidSetup(s,p) {
  return p.board.rows === 23 && p.board.cols === 15 && !!fbBall(s);
}
function onMove(state,move,project) {
  if (state.winner) return {valid:false,message:'比赛已结束。'};
  if (!fbValidSetup(state,project)) return {valid:false,message:'足球棋需要 15 列 × 23 行的球场和一枚足球。'};
  if (!fbInside(move.from) || !fbInside(move.to)) return {valid:false,message:'先选择己方球员，再选择目的格。'};
  const player = fbAt(state,move.from), action = move.action || 'move-player';
  if (!player || !FB_NAMES[player.type] || player.side !== state.turn) return {valid:false,message:'请选择当前阵营的球员。'};
  if (!['move-player','kick-ball'].includes(action)) return {valid:false,message:'请选择移动或踢球。'};
  const targets = action === 'kick-ball' ? fbKickTargets(state,player) : fbPlayerTargets(state,player);
  if (!targets.some(c => fbSame(c,move.to))) return {valid:false,message:action === 'kick-ball' ? '这个落点不符合踢球规则，请查看踢球提示。' : '球员不能这样移动，也不能吃掉其他球员。'};
  let pieces = state.pieces.map(p => ({...p}));
  const data = {...state.data}, ball = fbBall(state), beforeCarrier = state.pieces.find(p => p.id === data.carrierId);
  data.ballId = data.ballId || state.pieces.find(p => p.type === 'ball')?.id || 'football-ball';
  let text;
  if (action === 'move-player') {
    const target = fbAt(state,move.to);
    if (target?.type === 'ball') { pieces = pieces.filter(p => p.id !== target.id); data.carrierId = player.id; }
    Object.assign(pieces.find(p => p.id === player.id),move.to);
    text = FB_NAMES[player.type]+(data.carrierId === player.id ? '带球' : '移动')+' '+fbCoord(player)+' → '+fbCoord(move.to);
  } else {
    pieces = pieces.filter(p => p.type !== 'ball');
    const receiver = pieces.find(p => fbSame(p,move.to));
    data.carrierId = receiver?.id || null;
    if (!receiver) pieces.push({id:data.ballId,type:'ball',side:'white',...move.to});
    text = FB_NAMES[player.type]+'踢球 '+fbCoord(ball)+' → '+fbCoord(move.to)+(receiver ? ' · 队友接球' : '');
  }
  const afterCarrier = pieces.find(p => p.id === data.carrierId);
  if (!beforeCarrier || !afterCarrier || beforeCarrier.id !== afterCarrier.id || !fbSame(beforeCarrier,afterCarrier)) data.charged = false;
  else if (beforeCarrier.side === state.turn) data.charged = true;
  const nextBall = afterCarrier || pieces.find(p => p.type === 'ball');
  const winner = fbGoal(nextBall) ? nextBall.row === 0 ? 'white' : 'black' : null;
  if (winner) text += ' · '+(winner === 'white' ? '红方' : '黑方')+'进球获胜！';
  return {valid:true,pieces,data,turn:fbOther(state.turn),winner,message:text};
}
function getLegalMoves(state,project) {
  if (state.winner || !fbValidSetup(state,project)) return [];
  const moves = [];
  for (const p of state.pieces) if (p.side === state.turn && FB_NAMES[p.type]) {
    const from = {row:p.row,col:p.col};
    for (const to of fbKickTargets(state,p)) moves.push({from,to,action:'kick-ball'});
    for (const to of fbPlayerTargets(state,p)) moves.push({from,to,action:'move-player'});
  }
  const ball = fbBall(state), goalRow = state.turn === 'white' ? 0 : 22;
  const priority = m => {
    const withBall = m.action === 'kick-ball' || fbAt(state,m.from)?.id === state.data.carrierId;
    if (withBall) return (fbGoal(m.to) ? m.to.row === goalRow ? 10000 : -10000 : 0) + 100-Math.abs(m.to.row-goalRow)*3-Math.abs(m.to.col-7);
    return 30-Math.max(Math.abs(m.to.row-ball.row),Math.abs(m.to.col-ball.col))*3;
  };
  return moves.sort((a,b) => priority(b)-priority(a));
}
function evaluate(state,side) {
  if (state.winner) return state.winner === side ? 100000 : -100000;
  const ball = fbBall(state);
  if (!ball) return 0;
  let score = (11-ball.row)*14;
  for (const team of ['white','black']) {
    const players = state.pieces.filter(p => p.side === team && FB_NAMES[p.type]);
    const distance = Math.min(...players.map(p => Math.max(Math.abs(p.row-ball.row),Math.abs(p.col-ball.col))));
    const sign = team === 'white' ? 1 : -1;
    score += sign*(40-distance*8);
    if (state.data.carrierId && ball.side === team) score += sign*(100+(state.data.charged ? 35 : 0));
    for (const p of players) if (Math.max(Math.abs(p.row-ball.row),Math.abs(p.col-ball.col)) <= 1) {
      score += sign*20;
      if (fbKickTargets(state,p).some(c => fbGoal(c) && c.row === (team === 'white' ? 0 : 22))) score += sign*(state.turn === team ? 600 : 180);
    }
  }
  return side === 'white' ? score : -score;
}
function getGameView(state) {
  const ball = fbBall(state), carrier = state.pieces.find(p => p.id === state.data.carrierId);
  return {
    interaction:'move', actions:[],
    choices:[{action:'move-player',label:'移动 / 带球',interaction:'move'},{action:'kick-ball',label:'传球 / 射门',interaction:'move'}],
    markers:carrier ? [{cell:{row:carrier.row,col:carrier.col},label:state.data.charged ? '⚽蓄' : '⚽'}] : [],
    message:(state.winner ? '进球！比赛结束。' : carrier ? (carrier.side === 'white' ? '红方' : '黑方')+FB_NAMES[carrier.type]+'在 '+fbCoord(carrier)+' 持球'+(state.data.charged ? '，已蓄力。' : '。') : '足球位于 '+(ball ? fbCoord(ball) : '场外')+'。')+'先选「移动 / 带球」或「传球 / 射门」，再选球员与目的格。球旁八格的球员也能踢球，包括抢走对手脚下的球；持球队员原地不动、行动其他队友一次即可蓄力。',
  };
}
