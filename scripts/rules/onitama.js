// Onitama · base game, designed by Shimpei Sato, published by Arcane Wonders.
// Rules: https://www.arcanewonders.com/wp-content/uploads/2021/05/Onitama-Rulebook.pdf
// Offsets face up the board (red at the bottom); blue rotates both axes 180°.
const onitamaCards = [
  {id:'tiger',name:'虎',english:'Tiger',stamp:'black',steps:[[-2,0],[1,0]]},
  {id:'dragon',name:'龙',english:'Dragon',stamp:'white',steps:[[-1,-2],[-1,2],[1,-1],[1,1]]},
  {id:'frog',name:'蛙',english:'Frog',stamp:'white',steps:[[0,-2],[-1,-1],[1,1]]},
  {id:'rabbit',name:'兔',english:'Rabbit',stamp:'black',steps:[[0,2],[-1,1],[1,-1]]},
  {id:'crab',name:'蟹',english:'Crab',stamp:'black',steps:[[0,-2],[-1,0],[0,2]]},
  {id:'elephant',name:'象',english:'Elephant',stamp:'white',steps:[[0,-1],[-1,-1],[-1,1],[0,1]]},
  {id:'goose',name:'雁',english:'Goose',stamp:'black',steps:[[-1,-1],[0,-1],[0,1],[1,1]]},
  {id:'rooster',name:'鸡',english:'Rooster',stamp:'white',steps:[[-1,1],[0,1],[0,-1],[1,-1]]},
  {id:'monkey',name:'猴',english:'Monkey',stamp:'black',steps:[[-1,-1],[-1,1],[1,-1],[1,1]]},
  {id:'mantis',name:'螳螂',english:'Mantis',stamp:'white',steps:[[-1,-1],[-1,1],[1,0]]},
  {id:'horse',name:'马',english:'Horse',stamp:'white',steps:[[-1,0],[0,-1],[1,0]]},
  {id:'ox',name:'牛',english:'Ox',stamp:'black',steps:[[-1,0],[0,1],[1,0]]},
  {id:'crane',name:'鹤',english:'Crane',stamp:'black',steps:[[-1,0],[1,-1],[1,1]]},
  {id:'boar',name:'野猪',english:'Boar',stamp:'white',steps:[[0,-1],[-1,0],[0,1]]},
  {id:'eel',name:'鳗',english:'Eel',stamp:'black',steps:[[-1,-1],[1,-1],[0,1]]},
  {id:'cobra',name:'蛇',english:'Cobra',stamp:'white',steps:[[-1,1],[1,1],[0,-1]]},
];
const oniOther = side => side === 'white' ? 'black' : 'white';
const oniLabel = side => side === 'white' ? '红方' : '蓝方';
const oniSame = (a,b) => a.row === b.row && a.col === b.col;
const oniInside = c => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < 5 && c.col >= 0 && c.col < 5;
const oniCard = id => onitamaCards.find(c => c.id === id);
const oniReady = state => !!state.data.hands;
function oniValidDeal(state) {
  const {hands,shared} = state.data;
  if (!hands || !Array.isArray(hands.white) || !Array.isArray(hands.black) || hands.white.length !== 2 || hands.black.length !== 2) return false;
  const ids = [...hands.white,...hands.black,shared];
  return new Set(ids).size === 5 && ids.every(id => !!oniCard(id));
}
function oniMoves(state, side = state.turn) {
  if (!oniValidDeal(state)) return [];
  const moves = [], direction = side === 'white' ? 1 : -1;
  for (const id of state.data.hands[side]) for (const p of state.pieces.filter(p => p.side === side)) {
    for (const [dr,dc] of oniCard(id).steps) {
      const to = {row:p.row+dr*direction,col:p.col+dc*direction};
      if (oniInside(to) && !state.pieces.some(q => q.side === side && oniSame(q,to))) moves.push({from:{row:p.row,col:p.col},to,action:'card-'+id});
    }
  }
  // Immediate wins and captures first, useful even with a short AI budget.
  const priority = m => {
    const p = state.pieces.find(p => oniSame(p,m.from)), target = state.pieces.find(p => oniSame(p,m.to));
    return target?.type === 'master' || p.type === 'master' && m.to.col === 2 && m.to.row === (side === 'white' ? 0 : 4) ? 100 : target ? 10 : 0;
  };
  return moves.sort((a,b) => priority(b)-priority(a));
}
function onMove(state, move, project) {
  const fail = message => ({valid:false,message});
  if (state.winner) return fail('本局已结束，请重新开始。');
  if (project.board.rows !== 5 || project.board.cols !== 5) return fail('形意棋需要 5 × 5 棋盘。');
  if (!oniInside(move.to) || move.from && !oniInside(move.from)) return fail('落点不在棋盘内。');
  if (!oniReady(state)) {
    if (move.action !== 'deal-cards' || move.from) return fail('请先抽取招式卡，开始对局。');
    if (['white','black'].some(side => state.pieces.filter(p => p.side === side && p.type === 'master').length !== 1) || state.pieces.some(p => !['master','student'].includes(p.type))) return fail('双方需各有一位师父，棋子仅可使用师父和弟子。');
    const deck = onitamaCards.map(c => c.id);
    for (let i=deck.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]]; }
    const shared = deck[4], turn = oniCard(shared).stamp;
    return {valid:true,pieces:state.pieces.map(p => ({...p})),turn,winner:null,data:{hands:{white:deck.slice(0,2),black:deck.slice(2,4)},shared},message:'抽取五张招式 · '+oniLabel(turn)+'先手'};
  }
  if (!oniValidDeal(state)) return fail('招式卡状态无效，请重新开始。');
  const side = state.turn, pass = move.action?.startsWith('pass-');
  const id = move.action?.slice(5);
  if ((!pass && !move.action?.startsWith('card-')) || !state.data.hands[side].includes(id)) return fail('请选择己方的一张招式卡。');
  const legal = oniMoves(state);
  if (pass ? move.from || legal.length > 0 : !move.from || !legal.some(m => m.action === move.action && oniSame(m.from,move.from) && oniSame(m.to,move.to))) return fail(pass ? '仍有合法走法，不能停着。' : '此落点不符合所选招式，或已有己方棋子。');
  const pieces = state.pieces.map(p => ({...p})), hands = {white:[...state.data.hands.white],black:[...state.data.hands.black]};
  hands[side][hands[side].indexOf(id)] = state.data.shared;
  const data = {hands,shared:id}, card = oniCard(id);
  if (pass) return {valid:true,pieces,turn:oniOther(side),winner:null,data,message:'无合法走法 · 停着换「'+card.name+'」'};
  const mover = pieces.find(p => oniSame(p,move.from)), target = pieces.find(p => oniSame(p,move.to));
  if (target) pieces.splice(pieces.indexOf(target),1);
  Object.assign(mover,move.to);
  const capturedMaster = target?.type === 'master', enteredTemple = mover.type === 'master' && mover.col === 2 && mover.row === (side === 'white' ? 0 : 4);
  const winner = capturedMaster || enteredTemple ? side : null;
  const at = c => String.fromCharCode(97+c.col)+(5-c.row);
  return {valid:true,pieces,turn:oniOther(side),winner,data,message:'「'+card.name+'」'+at(move.from)+' → '+at(move.to)+(capturedMaster ? ' · 擒师获胜' : enteredTemple ? ' · 入庙获胜' : target ? ' · 吃弟子' : '')};
}
function getLegalMoves(state) {
  if (state.winner) return [];
  if (!oniReady(state)) return [{action:'deal-cards',to:{row:2,col:2}}];
  if (!oniValidDeal(state)) return [];
  const moves = oniMoves(state);
  return moves.length ? moves : state.data.hands[state.turn].map(id => ({action:'pass-'+id,to:{row:2,col:2}}));
}
function evaluate(state, side) {
  if (!oniValidDeal(state)) return 0;
  let score = 0;
  for (const p of state.pieces) {
    const sign = p.side === side ? 1 : -1;
    const distance = Math.abs(p.row-(p.side === 'white' ? 0 : 4))+Math.abs(p.col-2);
    score += sign*(p.type === 'master' ? 1000+(6-distance)*10 : 100+(p.side === 'white' ? 4-p.row : p.row)*3);
  }
  for (const player of [side,oniOther(side)]) {
    const moves = oniMoves(state,player), sign = player === side ? 1 : -1;
    score += sign*moves.length*2;
    if (moves.some(m => state.pieces.some(p => p.side !== player && p.type === 'master' && oniSame(p,m.to)))) score += sign*(player === state.turn ? 450 : 60);
  }
  return score;
}
function getGameView(state) {
  const emptyZones = [
    {id:'hand-white',label:'红方手牌',owner:'white',items:[],emptyLabel:'等待抽取两张招式'},
    {id:'hand-black',label:'蓝方手牌',owner:'black',items:[],emptyLabel:'等待抽取两张招式'},
    {id:'exchange',label:'待换招式',owner:'shared',items:[],emptyLabel:'等待发牌'},
  ];
  if (!oniReady(state)) return {interaction:'move',zones:emptyZones,message:'一位师父，四位弟子。随机抽取五张招式，以待换卡的印记决定先手。',actions:[{label:'抽取招式 · 开始对局',move:{action:'deal-cards',to:{row:2,col:2}}}]};
  if (!oniValidDeal(state)) return {message:'招式卡状态无效，请重新开始。'};
  const current = state.turn;
  const cardView = (id,owner) => {
    const card = oniCard(id), orientation = (owner === 'shared' ? current : owner) === 'white' ? 1 : -1;
    return {id,label:card.name,subtitle:card.english,stamp:card.stamp,offsets:card.steps.map(([row,col]) => ({row:row*orientation||0,col:col*orientation||0})),...(owner === 'shared' ? {caption:'走子后换入'} : {}),...(!state.winner && owner === current ? {action:'card-'+id,interaction:'move'} : {})};
  };
  const zones = emptyZones.map(zone => ({...zone,...(zone.owner === 'shared' ? {description:'用过的招式将交给对手'} : {}),items:zone.owner === 'shared' ? [cardView(state.data.shared,'shared')] : state.data.hands[zone.owner].map(id => cardView(id,zone.owner))}));
  const noMoves = !state.winner && !oniMoves(state).length;
  return {interaction:'move',zones,message:state.winner ? oniLabel(state.winner)+'获胜。可悔棋复盘，或重新开始抽取新招式。' : noMoves ? oniLabel(current)+'没有合法走法，请选择一张卡停着换牌。' : oniLabel(current)+'：选择招式，再点击或拖动己方棋子。圆点为起点，色块为可达位置，图示与棋盘方向一致；擒师或师父入敌庙即胜。',actions:noMoves ? state.data.hands[current].map(id => ({label:'停着换「'+oniCard(id).name+'」',move:{action:'pass-'+id,to:{row:2,col:2}}})) : []};
}
