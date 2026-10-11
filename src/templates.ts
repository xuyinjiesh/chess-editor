import type { Project, Piece } from './model';
export const CUSTOM_CODE = `// 可使用 state、move、project，坐标从 0 开始。
// 返回 { valid, pieces, turn, winner?, data?, message? }。
// 此示例：每个棋子可以走到相邻格，吃掉对方棋子。
function onMove(state, move, project) {
  const at = (p, c) => c && p.row === c.row && p.col === c.col;
  const piece = state.pieces.find(p => at(p, move.from));
  if (!piece || piece.side !== state.turn)
    return { valid: false, message: '请选择己方棋子' };
  const target = state.pieces.find(p => at(p, move.to));
  if (target?.side === state.turn)
    return { valid: false, message: '目标格已有己方棋子' };
  const distance = Math.max(Math.abs(piece.row - move.to.row),
                           Math.abs(piece.col - move.to.col));
  if (distance !== 1)
    return { valid: false, message: '只能移动一格' };
  const blocked = project.regions.some(r => r.tag === 'blocked'
    && r.cells.some(c => at(c, move.to)));
  if (blocked) return { valid: false, message: '不能进入禁区' };
  const pieces = state.pieces.filter(p => p.id !== target?.id)
    .map(p => p.id === piece.id ? { ...p, ...move.to } : p);
  const next = state.turn === 'white' ? 'black' : 'white';
  return { valid: true, pieces, turn: next,
    winner: pieces.some(p => p.side === next) ? null : state.turn };
}`;
const base = (id: string, name: string, description: string): Project => ({version:1,id,name,description,board:{rows:8,cols:8,pattern:'checker',light:'#f0d9b5',dark:'#d8b98c',coordinates:true,theme:'wood'},pieceTypes:[],pieces:[],regions:[],rules:{engine:'custom',code:CUSTOM_CODE,winLength:5,firstTurn:'white'},ui:{accent:'#2f6b63',showHints:true,showHistory:true}});
const chess = base('chess', '国际象棋', '在 64 个格子里，创造无限可能。');
chess.rules.engine = 'chess';
chess.pieceTypes = ['k','q','r','b','n','p'].map((id,i)=>({id,name:['王','后','车','象','马','兵'][i],symbol:['♔','♕','♖','♗','♘','♙'][i],blackSymbol:['♚','♛','♜','♝','♞','♟'][i],shape:'chess'}));
for (const [row,side,order] of [[0,'black','rnbqkbnr'],[1,'black','pppppppp'],[6,'white','pppppppp'],[7,'white','rnbqkbnr']] as const) {
  order.split('').forEach((type,col)=>chess.pieces.push({id:`${side}-${row}-${col}`,type,side,row,col}));
}
const gomoku = base('gomoku','五子棋','一黑一白，落子成线。最熟悉的策略游戏。');
gomoku.board = {rows:15,cols:15,pattern:'grid',light:'#e8c88a',dark:'#e8c88a',coordinates:true,theme:'goban'};
gomoku.pieceTypes = [{id:'stone',name:'棋石',symbol:'●',shape:'stone'}];
gomoku.rules = {...gomoku.rules,engine:'gomoku',firstTurn:'black'};
const reversi = base('reversi','黑白棋','步步为营，翻转局面。');
reversi.board = {...reversi.board,pattern:'cells',light:'#eaf2ec',dark:'#d5e5db',theme:'jade'};
reversi.pieceTypes = [{id:'stone',name:'棋石',symbol:'●',shape:'stone'}];
reversi.rules.engine = 'reversi'; reversi.rules.firstTurn = 'black';
reversi.pieces = [{id:'r1',type:'stone',side:'white',row:3,col:3},{id:'r2',type:'stone',side:'white',row:4,col:4},{id:'r3',type:'stone',side:'black',row:3,col:4},{id:'r4',type:'stone',side:'black',row:4,col:3}];
const tic = base('tic','井字棋','三步一线，小棋盘里的大智慧。');
tic.board = {...tic.board,rows:3,cols:3,pattern:'cells',light:'#faf8f4',dark:'#faf8f4',theme:'ink'};
tic.pieceTypes = [{id:'stone',name:'棋石',symbol:'●',shape:'stone'}];
tic.rules = {...tic.rules,engine:'gomoku',winLength:3};
const blank = base('blank','空白画布','规则由你定义，故事从这里开始。');
blank.pieceTypes=[{id:'token',name:'棋子',symbol:'✦',shape:'token'}];
blank.pieces=[{id:'white-token',type:'token',side:'white',row:7,col:3},{id:'black-token',type:'token',side:'black',row:0,col:4}] as Piece[];
const xiangqi = base('xiangqi','中国象棋','楚河汉界，落子乾坤。方寸之间，运筹帷幄。');
xiangqi.board = {rows:10,cols:9,pattern:'xiangqi',light:'#eaf2ec',dark:'#d5e5db',coordinates:true,theme:'jade'};
xiangqi.rules = {...xiangqi.rules,engine:'xiangqi',firstTurn:'white'};
xiangqi.pieceTypes = [
  {id:'k',name:'帅 / 将',symbol:'帥',blackSymbol:'將',shape:'xiangqi'},
  {id:'a',name:'仕 / 士',symbol:'仕',blackSymbol:'士',shape:'xiangqi'},
  {id:'b',name:'相 / 象',symbol:'相',blackSymbol:'象',shape:'xiangqi'},
  {id:'n',name:'马',symbol:'馬',shape:'xiangqi'},
  {id:'r',name:'车',symbol:'車',shape:'xiangqi'},
  {id:'c',name:'炮',symbol:'炮',blackSymbol:'砲',shape:'xiangqi'},
  {id:'p',name:'兵 / 卒',symbol:'兵',blackSymbol:'卒',shape:'xiangqi'},
];
for (const side of ['white','black'] as const) {
  const row = side==='white'?9:0;
  'rnbakabnr'.split('').forEach((type,col)=>xiangqi.pieces.push({id:`${side}-back-${col}`,type,side,row,col}));
  for(const col of [1,7])xiangqi.pieces.push({id:`${side}-cannon-${col}`,type:'c',side,row:side==='white'?7:2,col});
  for(const col of [0,2,4,6,8])xiangqi.pieces.push({id:`${side}-soldier-${col}`,type:'p',side,row:side==='white'?6:3,col});
}
// Keep legacy template indices stable for saved code and tests.
export const TEMPLATES = [chess,gomoku,reversi,tic,blank,xiangqi];
export const CLASSIC_TEMPLATES = [chess,xiangqi,gomoku,reversi,tic];
export const TEMPLATE_TAGS:Record<string,string> = {chess:'策略 · 双人',xiangqi:'楚河汉界 · 双人',gomoku:'连珠 · 双人',reversi:'翻转 · 双人',tic:'轻量 · 双人',blank:'自由创作'};
export const ENGINE_NAMES = {chess:'国际象棋',xiangqi:'中国象棋',gomoku:'连珠规则',reversi:'黑白棋',custom:'自定义 JavaScript'};
