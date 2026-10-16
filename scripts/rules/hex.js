// Hex: red (white) connects rows; blue (black) connects columns.
// All adjacency comes from the same axial rhombus topology as the renderer.
function hexError(project) {
  if (project.board.pattern !== 'hex' || project.board.hexLayout !== 'rhombus' || project.board.rows !== project.board.cols) return '六贯棋需要行列数相同的菱形六边形棋盘。';
  if (project.rules.firstTurn !== 'white') return '六贯棋请设置红方先手。';
  if (!project.pieceTypes.some(t => t.id === 'stone' && !t.neutral)) return '六贯棋需要 ID 为 stone 的非中立棋石。';
  return '';
}
let hexCachedGraph;
function hexGraph(project) {
  const n = project.board.rows;
  if (!hexCachedGraph || hexCachedGraph.n !== n) {
    const cells = Array.from({length:n*n},(_,i)=>({row:Math.floor(i/n),col:i%n}));
    hexCachedGraph = {n,cells,neighbors:cells.map(c=>boardTopology.neighbors(c).map(a=>a.row*n+a.col))};
  }
  return hexCachedGraph;
}
function hexPosition(pieces,graph) {
  const occupied = new Uint8Array(graph.n*graph.n);
  for (const p of pieces) occupied[p.row*graph.n+p.col] = p.side === 'white' ? 1 : 2;
  return occupied;
}
function hexPath(occupied,side,graph) {
  const {n,neighbors,cells} = graph, own = side === 'white' ? 1 : 2;
  const previous = new Int32Array(n*n).fill(-2), queue = [];
  for (let i=0;i<n;i++) {
    const start = side === 'white' ? i : i*n;
    if (occupied[start] === own) { previous[start] = -1; queue.push(start); }
  }
  for (let head=0;head<queue.length;head++) {
    const at = queue[head];
    if (side === 'white' ? Math.floor(at/n) === n-1 : at%n === n-1) {
      const path = [];
      for (let cur=at;cur>=0;cur=previous[cur]) path.push({...cells[cur]});
      return path.reverse();
    }
    for (const next of neighbors[at]) if (occupied[next] === own && previous[next] === -2) {
      previous[next] = at; queue.push(next);
    }
  }
  return [];
}
function hexCanSwap(state) {
  return !state.winner && state.data.hexPly === 1 && state.turn === 'black' && state.pieces.length === 1 && state.pieces[0].side === 'white';
}
function onMove(state,move,project) {
  const fail = message => ({valid:false,message}), error = hexError(project);
  if (error) return fail(error);
  if (state.winner) return fail('本局已经结束。');
  if (move.from || move.promotion || !boardTopology.contains(move.to)) return fail('请在空格放置棋石，落定的棋石不能移动。');
  const ply = Number.isInteger(state.data.hexPly) ? state.data.hexPly : state.history.length;
  if (move.action === 'swap') {
    const first = state.pieces[0];
    if (!hexCanSwap(state) || first.row !== move.to.row || first.col !== move.to.col) return fail('只有第二手可以交换首子。');
    const stone = {...first,side:'black',row:first.col,col:first.row};
    return {valid:true,pieces:[stone],turn:'white',winner:null,data:{...state.data,hexPly:2,hexPath:[]},message:'蓝方交换首子：改为蓝色并对调行列，轮到红方。'};
  }
  if (move.action) return fail('未知的六贯棋操作。');
  if (state.pieces.some(p=>p.row===move.to.row && p.col===move.to.col)) return fail('这个格子已有棋石。');
  let id = 'hex-'+ply+'-'+move.to.row+'-'+move.to.col;
  while (state.pieces.some(p=>p.id===id)) id += '-s';
  const pieces = [...state.pieces.map(p=>({...p})),{id,type:'stone',side:state.turn,row:move.to.row,col:move.to.col}];
  const graph = hexGraph(project), path = hexPath(hexPosition(pieces,graph),state.turn,graph);
  const label = state.turn === 'white' ? '红方' : '蓝方', coordinate = String.fromCharCode(97+move.to.col)+(project.board.rows-move.to.row);
  return {valid:true,pieces,turn:state.turn==='white'?'black':'white',winner:path.length?state.turn:null,data:{...state.data,hexPly:ply+1,hexPath:path},message:label+'落子 '+coordinate+(path.length?'，连通两条对边获胜。':'')};
}
function getLegalMoves(state,project) {
  if (state.winner || hexError(project)) return [];
  const graph = hexGraph(project), occupied = hexPosition(state.pieces,graph), center = (graph.n-1)/2;
  // Prioritize immediate wins/blocks and nearby play, while exposing EVERY empty
  // cell. No pruning here: these moves also drive UI, replay and bot validation.
  const own = state.turn === 'white' ? 1 : 2, opponent = own === 1 ? 2 : 1;
  const moves = graph.cells.flatMap((to,index)=>{
    if (occupied[index]) return [];
    occupied[index] = own;
    const win = hexPath(occupied,state.turn,graph).length > 0;
    occupied[index] = opponent;
    const block = hexPath(occupied,state.turn==='white'?'black':'white',graph).length > 0;
    occupied[index] = 0;
    const priority = (win?100000:0)+(block?50000:0)+graph.neighbors[index].filter(i=>occupied[i]).length*3-Math.abs(to.row-center)-Math.abs(to.col-center);
    return [{move:{to:{...to}},priority}];
  }).sort((a,b)=>b.priority-a.priority).map(item=>item.move);
  if (hexCanSwap(state)) moves.unshift({action:'swap',to:{row:state.pieces[0].row,col:state.pieces[0].col}});
  return moves;
}
// 0–1 shortest paths: own stones cost zero, empty hexes one, enemies block.
// The bot compares how many placements each side still needs to connect.
function hexCost(occupied,side,graph) {
  const {n,neighbors} = graph, own = side === 'white' ? 1 : 2, enemy = own === 1 ? 2 : 1;
  const distance = new Int32Array(n*n).fill(n*n+1), queue = new Map();
  let head = 0, tail = 0;
  for (let i=0;i<n;i++) {
    const at = side === 'white' ? i : i*n;
    if (occupied[at] === enemy) continue;
    distance[at] = occupied[at] === own ? 0 : 1;
    if (distance[at]===0) queue.set(--head,at); else queue.set(tail++,at);
  }
  while (head<tail) {
    const at = queue.get(head); queue.delete(head++);
    for (const next of neighbors[at]) {
      if (occupied[next] === enemy) continue;
      const cost = occupied[next] === own ? 0 : 1, nextDistance = distance[at]+cost;
      if (nextDistance >= distance[next]) continue;
      distance[next] = nextDistance;
      if (cost===0) queue.set(--head,next); else queue.set(tail++,next);
    }
  }
  let best = n*n+1;
  for (let i=0;i<n;i++) best = Math.min(best,distance[side==='white'?(n-1)*n+i:i*n+n-1]);
  return best;
}
function evaluate(state,side,project) {
  if (state.winner) return state.winner === side ? 100000 : -100000;
  if (hexError(project)) return 0;
  const graph = hexGraph(project), position = hexPosition(state.pieces,graph), opponent = side==='white'?'black':'white';
  const own = hexCost(position,side,graph), enemy = hexCost(position,opponent,graph);
  const center = (graph.n-1)/2;
  let score = (enemy-own)*100;
  if (own===1 && state.turn===side) score += 10000;
  if (enemy===1 && state.turn===opponent) score -= 10000;
  for (const p of state.pieces) score += (p.side===side?1:-1)*(graph.n-Math.abs(p.row-center)-Math.abs(p.col-center));
  return score;
}
function getGameView(state,project) {
  const error = hexError(project);
  if (error) return {message:error,interaction:'place'};
  const path = state.winner ? hexPath(hexPosition(state.pieces,hexGraph(project)),state.winner,hexGraph(project)) : [];
  return {
    interaction:'place',
    message:state.winner ? (state.winner==='white'?'红方':'蓝方')+'已连通两条对边。标有「连」的棋石组成获胜路径。' : (state.turn==='white'?'红方：连接上下两条红边。':'蓝方：连接左右两条蓝边。')+'点击空格落子，六个共边方向相连；路径可以转弯。'+(hexCanSwap(state)?'第二手可选择交换首子。':''),
    actions:hexCanSwap(state)?[{label:'交换首子',description:'把首子改为蓝色并对调行列，随后轮到红方。仅第二手可用。',move:{action:'swap',to:{row:state.pieces[0].row,col:state.pieces[0].col}}}]:[],
    markers:path.map(cell=>({cell,label:'连'})),
  };
}
