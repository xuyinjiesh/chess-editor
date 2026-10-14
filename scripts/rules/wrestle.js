// 角斗棋 · xuyinjie 原创。禁中心只限全局第一手；将、兵、士可按各自走法吃子。
const WC_TYPES = ['rook','horse','cannon','elephant','advisor','king','pawn'];
const WC_NAMES = {rook:'车',horse:'马',cannon:'炮',elephant:'相',advisor:'士',king:'将',pawn:'兵'};
const WC_STOCK = {rook:2,horse:2,cannon:2,elephant:2,advisor:2,king:1,pawn:5};
const WC_ORTH = [[-1,0],[1,0],[0,-1],[0,1]], WC_DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const wcSame = (a,b) => a.row === b.row && a.col === b.col;
const wcInside = c => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < 3 && c.col >= 0 && c.col < 3;
const wcAt = (s,c) => s.pieces.find(p => wcSame(p,c));
const wcOther = side => side === 'white' ? 'black' : 'white';
const wcCoord = c => String.fromCharCode(97+c.col)+(3-c.row);
function wcReserves(state,project) {
  if (state.data.reserves) return structuredClone(state.data.reserves);
  return Object.fromEntries(['white','black'].map(side => [side,Object.fromEntries(WC_TYPES.map(type => [type,Math.max(0,WC_STOCK[type]-project.pieces.filter(p => p.side === side && p.type === type).length)]))]));
}
function wcTargets(state,p) {
  const targets = new Map(), add = (row,col,capture=true) => {
    const to = {row,col}, target = wcAt(state,to);
    if (wcInside(to) && (!target || capture && target.side !== p.side)) targets.set(row+','+col,to);
  };
  // Every piece may step orthogonally onto an empty square.
  for (const [dr,dc] of WC_ORTH) add(p.row+dr,p.col+dc,false);
  if (['king','pawn'].includes(p.type)) for (const [dr,dc] of WC_ORTH) add(p.row+dr,p.col+dc);
  if (p.type === 'advisor') for (const [dr,dc] of WC_DIAG) add(p.row+dr,p.col+dc);
  if (p.type === 'elephant') for (const [dr,dc] of WC_DIAG) add(p.row+dr*2,p.col+dc*2);
  if (p.type === 'horse') for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const leg = wcAt(state,{row:p.row+(Math.abs(dr) === 2 ? Math.sign(dr) : 0),col:p.col+(Math.abs(dc) === 2 ? Math.sign(dc) : 0)});
    if (!leg || leg.side === p.side) add(p.row+dr,p.col+dc);
  }
  if (['rook','cannon'].includes(p.type)) for (const [dr,dc] of [...WC_ORTH,...(p.type === 'cannon' ? WC_DIAG : [])]) {
    let screen = false;
    for (let n=1;n<3;n++) {
      const to = {row:p.row+dr*n,col:p.col+dc*n};
      if (!wcInside(to)) break;
      const target = wcAt(state,to);
      if (p.type === 'rook') { add(to.row,to.col); if (target) break; }
      else if (!screen) {
        if (target) screen = true;
        else if (dr === 0 || dc === 0) add(to.row,to.col);
      } else if (target) { if (target.side !== p.side) add(to.row,to.col); break; }
    }
  }
  return [...targets.values()];
}
function wcCanPlace(state,to) {
  return wcInside(to) && !wcAt(state,to) && state.pieces.filter(p => p.side === state.turn).length < 3 && !(state.history.length === 0 && to.row === 1 && to.col === 1);
}
function onMove(state,move,project) {
  if (state.winner) return {valid:false,message:'本局已经结束。'};
  if (project.board.rows !== 3 || project.board.cols !== 3) return {valid:false,message:'角斗棋需要 3 × 3 棋盘。'};
  if (!wcInside(move.to)) return {valid:false,message:'落点不在棋盘内。'};
  const reserves = wcReserves(state,project), side = state.turn;
  let pieces = state.pieces.map(p => ({...p})), text, captured = [];
  if (move.action?.startsWith('place-')) {
    const type = move.action.slice(6);
    if (move.from || !WC_TYPES.includes(type) || !reserves[side][type]) return {valid:false,message:'储备中没有这枚棋子。'};
    if (!wcCanPlace(state,move.to)) return {valid:false,message:'请选择空格上场，每方最多三子；全局第一手不能占中心。'};
    pieces.push({id:'wrestle-'+side+'-'+type+'-'+state.history.length,type,side,...move.to});
    reserves[side][type]--;
    text = WC_NAMES[type]+'上场 '+wcCoord(move.to);
  } else {
    if (move.action && move.action !== 'move' || !wcInside(move.from)) return {valid:false,message:'请选择储备棋子上场，或选择「移动棋子」。'};
    const player = wcAt(state,move.from);
    if (!player || player.side !== side || !wcTargets(state,player).some(c => wcSame(c,move.to))) return {valid:false,message:'这一步不符合角斗棋走法。'};
    const target = wcAt(state,move.to);
    if (target) captured.push(target);
    if (player.type === 'elephant' && Math.abs(player.row-move.to.row) === 2 && Math.abs(player.col-move.to.col) === 2) {
      const middle = wcAt(state,{row:1,col:1});
      if (middle && middle.side !== side) captured.push(middle);
    }
    pieces = pieces.filter(p => !captured.some(c => c.id === p.id));
    Object.assign(pieces.find(p => p.id === player.id),move.to);
    text = WC_NAMES[player.type]+' '+wcCoord(player)+' → '+wcCoord(move.to)+(captured.length ? ' · 吃'+captured.map(p => WC_NAMES[p.type]).join('、') : '');
  }
  const winner = captured.some(p => p.type === 'king') ? side : null;
  return {valid:true,pieces,turn:wcOther(side),winner,data:{...state.data,reserves},message:text+(winner ? ' · 吃将获胜！' : '')};
}
function getLegalMoves(state,project) {
  if (state.winner || project.board.rows !== 3 || project.board.cols !== 3) return [];
  const moves = [], reserves = wcReserves(state,project);
  for (const p of state.pieces) if (p.side === state.turn) for (const to of wcTargets(state,p)) moves.push({from:{row:p.row,col:p.col},to,action:'move'});
  for (let row=0;row<3;row++) for (let col=0;col<3;col++) if (wcCanPlace(state,{row,col})) {
    for (const type of WC_TYPES) if (reserves[state.turn][type] > 0) moves.push({to:{row,col},action:'place-'+type});
  }
  const priority = m => {
    const target = wcAt(state,m.to), p = m.from && wcAt(state,m.from), middle = wcAt(state,{row:1,col:1});
    if (target?.type === 'king' || p?.type === 'elephant' && Math.abs(m.from.row-m.to.row) === 2 && middle?.type === 'king' && middle.side !== state.turn) return 10000;
    return (target ? 100 : 0)+(m.to.row === 1 && m.to.col === 1 ? 5 : 0)-(m.action === 'place-king' ? 20 : 0);
  };
  return moves.sort((a,b) => priority(b)-priority(a));
}
function evaluate(state,side,project) {
  if (state.winner) return state.winner === side ? 100000 : -100000;
  const reserves = wcReserves(state,project), values = {rook:100,horse:60,cannon:65,elephant:80,advisor:55,king:30,pawn:60};
  let score = 0;
  for (const team of ['white','black']) {
    const sign = team === side ? 1 : -1;
    for (const type of WC_TYPES) score += sign*reserves[team][type]*values[type]*.4;
    for (const p of state.pieces.filter(p => p.side === team)) {
      const moves = wcTargets(state,p);
      score += sign*(values[p.type]+moves.length*3+(p.row === 1 && p.col === 1 ? 8 : 0));
      for (const to of moves) {
        const victim = wcAt(state,to);
        if (victim?.type === 'king') score += sign*(state.turn === team ? 900 : 350);
        else if (victim) score += sign*values[victim.type]*.5;
        if (p.type === 'elephant' && Math.abs(to.row-p.row) === 2) {
          const middle = wcAt(state,{row:1,col:1});
          if (middle?.side !== team && middle?.type === 'king') score += sign*(state.turn === team ? 900 : 350);
        }
      }
    }
  }
  return score;
}
function getGameView(state,project) {
  const reserves = wcReserves(state,project), count = state.pieces.filter(p => p.side === state.turn).length;
  const choices = !state.winner && count ? [{action:'move',label:'移动棋子',interaction:'move'}] : [];
  const zones = ['white','black'].map(side => ({
    id:'reserve-'+side,label:(side === 'white' ? '红方' : '蓝方')+'储备',owner:side,
    items:WC_TYPES.map(type => ({id:type,label:WC_NAMES[type],piece:{type,side},count:reserves[side][type],
      ...(!state.winner && side === state.turn ? {action:'place-'+type,interaction:'place',disabled:count >= 3} : {})})),
  }));
  return {interaction:'move',actions:[],choices,zones,message:state.winner ? '吃将获胜。' : '当前上场 '+count+'/3 子。点击储备棋子，再点击空格上场；选择「移动棋子」可操作场上棋子。'+(count >= 3 ? '已达三子上限，暂不能上场。' : state.history.length === 0 ? '第一手不能占中心。' : '')};
}
