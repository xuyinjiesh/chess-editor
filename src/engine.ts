import { Chess, type Square } from 'chess.js';
import { coord, otherSide, sameCell, type GameState, type Move, type Piece, type Project, type Side } from './model';
import { runRule } from './sandbox';
import { applyXiangqiMove, validateXiangqiSetup, xiangqiInCheck, xiangqiLegalMoves } from './xiangqi';
export function toFen(project: Project, pieces: Piece[], turn: Side): string {
  const ranks = Array.from({length:8},(_,row)=>{
    let text='', empty=0;
    for (let col=0;col<8;col++) {
      const p=pieces.find(p=>p.row===row&&p.col===col);
      if (!p) {empty++;continue;}
      if (!'kqrbnp'.includes(p.type) || p.type.length!==1) throw new Error('国际象棋规则仅支持王、后、车、象、马、兵。');
      if(empty) text+=empty; empty=0;
      text+=p.side==='white'?p.type.toUpperCase():p.type;
    }
    return text+(empty||'');
  });
  let rights='';
  for(const [side,row,k,q] of [['white',7,'K','Q'],['black',0,'k','q']] as const){
    const has=(col:number,type:string)=>pieces.some(p=>p.row===row&&p.col===col&&p.type===type&&p.side===side);
    if(has(4,'k')) {if(has(7,'r')) rights+=k;if(has(0,'r')) rights+=q;}
  }
  if(project.board.rows!==8||project.board.cols!==8)throw new Error('国际象棋规则需要 8 × 8 棋盘。');
  return `${ranks.join('/')} ${turn==='white'?'w':'b'} ${rights||'-'} - 0 1`;
}
export function initialState(project: Project): GameState {
  const state:GameState={pieces:structuredClone(project.pieces),turn:project.rules.firstTurn,winner:null,history:[],data:{}};
  if(project.rules.engine==='chess') {state.fen=toFen(project,state.pieces,state.turn); const chess=new Chess(state.fen);state.fenHistory=[state.fen];state.winner=chess.isCheckmate()?otherSide(state.turn):chess.isDraw()?'draw':null;}
  if(project.rules.engine==='xiangqi') {validateXiangqiSetup(project);state.data.check=xiangqiInCheck(state.pieces,state.turn);if(!xiangqiLegalMoves(state.pieces,state.turn).length)state.winner=otherSide(state.turn);}
  if(project.rules.engine==='reversi'&&!reversiHasMove(project,state.pieces,state.turn)){const next=otherSide(state.turn);state.turn=next;if(!reversiHasMove(project,state.pieces,next))state.winner=stoneWinner(state.pieces);}
  return state;
}
const inside=(project:Project,c:{row:number;col:number})=>Number.isInteger(c.row)&&Number.isInteger(c.col)&&c.row>=0&&c.col>=0&&c.row<project.board.rows&&c.col<project.board.cols;
export function reversiFlips(pieces:Piece[],row:number,col:number,side:Side):Piece[]{
  if(pieces.some(p=>p.row===row&&p.col===col)) return [];
  const all:Piece[]=[];
  for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
    let r=row+dr,c=col+dc;const line:Piece[]=[];
    for(let i=0;i<24;i++) {const p=pieces.find(p=>p.row===r&&p.col===c);if(!p)break;if(p.side===side){if(line.length)all.push(...line);break;}line.push(p);r+=dr;c+=dc;}
  }return all;
}
function reversiHasMove(project:Project,pieces:Piece[],side:Side){for(let r=0;r<project.board.rows;r++)for(let c=0;c<project.board.cols;c++)if(reversiFlips(pieces,r,c,side).length)return true;return false;}
const stoneWinner=(pieces:Piece[]):Side|'draw'=>{const w=pieces.filter(p=>p.side==='white').length,b=pieces.length-w;return w===b?'draw':w>b?'white':'black';};
export function hints(project:Project,state:GameState,from?:{row:number;col:number}) {
  if(state.winner) return [];
  if(project.rules.engine==='xiangqi'&&from)return xiangqiLegalMoves(state.pieces,state.turn,from).map(m=>m.to);
  if(project.rules.engine==='chess'&&from&&state.fen){try {return new Chess(state.fen).moves({square:coord(from,8) as Square,verbose:true}).map(m=>({row:8-Number(m.to[1]),col:m.to.charCodeAt(0)-97}));}catch{return [];}}
  if(project.rules.engine==='reversi'){const list=[];for(let row=0;row<project.board.rows;row++)for(let col=0;col<project.board.cols;col++)if(reversiFlips(state.pieces,row,col,state.turn).length)list.push({row,col});return list;}
  return [];
}
export async function applyMove(project:Project,state:GameState,move:Move):Promise<GameState>{
  if(state.winner)throw new Error('这局已经结束，可以重新开始。');
  if(!move||!move.to||!inside(project,move.to)||(move.from&&!inside(project,move.from)))throw new Error('落点不在棋盘内。');
  let next:GameState=structuredClone(state),text='';
  if(project.rules.engine==='chess'){
    if(!move.from||!state.fen)throw new Error('请先选择棋子。');
    const chess=new Chess(state.fen);
    let result;
    try {result=chess.move({from:coord(move.from,8),to:coord(move.to,8),promotion:move.promotion||'q'});}catch {throw new Error('这一步不符合国际象棋规则。');}
    // Preserve identity across moves, captures, castling and promotion so the
    // renderer can move the existing piece instead of remounting every icon.
    const mover=state.pieces.find(p=>sameCell(p,move.from!));
    const castle=result.flags.includes('k')?'king':result.flags.includes('q')?'queen':null;
    next.pieces=chess.board().flatMap((rank,row)=>rank.flatMap((p,col)=>{
      if(!p)return [];
      const side:Side=p.color==='w'?'white':'black',at={row,col};
      const old=sameCell(at,move.to)?mover
        :castle&&row===move.from!.row&&col===(castle==='king'?5:3)&&p.type==='r'&&side===state.turn
          ?state.pieces.find(x=>x.row===row&&x.col===(castle==='king'?7:0)&&x.side===side&&x.type==='r')
          :state.pieces.find(x=>sameCell(x,at)&&x.side===side&&x.type===p.type);
      return [{id:old?.id||crypto.randomUUID(),type:p.type,side,row,col}];
    }));
    next.fen=chess.fen();next.fenHistory=[...(state.fenHistory||[]),next.fen];next.turn=chess.turn()==='w'?'white':'black';
    const key=next.fen.split(' ').slice(0,4).join(' '), repetition=next.fenHistory.filter(f=>f.split(' ').slice(0,4).join(' ')===key).length>=3;
    next.winner=chess.isCheckmate()?state.turn:chess.isDraw()||repetition?'draw':null;
    text=result.san;
  }else if(project.rules.engine==='xiangqi'){
    const result=applyXiangqiMove(state,move);
    next={...next,pieces:result.pieces,turn:result.turn,winner:result.winner,data:{...state.data,check:result.check}};
    text=result.text;
  }else if(project.rules.engine==='gomoku'){
    if(state.pieces.some(p=>sameCell(p,move.to)))throw new Error('这个位置已有棋子。');
    next.pieces.push({id:crypto.randomUUID(),type:project.pieceTypes[0].id,side:state.turn,...move.to});
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
      let count=1;
      for(const sign of [-1,1])for(let n=1;n<24;n++){const r=move.to.row+dr*n*sign,c=move.to.col+dc*n*sign;if(!next.pieces.some(p=>p.row===r&&p.col===c&&p.side===state.turn))break;count++;}
      if(count>=project.rules.winLength)next.winner=state.turn;
    }
    if(!next.winner&&next.pieces.length===project.board.rows*project.board.cols)next.winner='draw';
    next.turn=otherSide(state.turn);text=coord(move.to,project.board.rows);
  }else if(project.rules.engine==='reversi'){
    const flips=reversiFlips(state.pieces,move.to.row,move.to.col,state.turn);
    if(!flips.length)throw new Error('需要夹住至少一枚对方棋子。');
    next.pieces=state.pieces.map(p=>flips.some(f=>f.id===p.id)?{...p,side:state.turn}:p);
    next.pieces.push({id:crypto.randomUUID(),type:project.pieceTypes[0].id,side:state.turn,...move.to});
    next.turn=otherSide(state.turn);
    if(!reversiHasMove(project,next.pieces,next.turn)){next.turn=state.turn;if(!reversiHasMove(project,next.pieces,next.turn))next.winner=stoneWinner(next.pieces);}
    text=`${coord(move.to,project.board.rows)} · 翻转 ${flips.length}`;
  }else{
    const result=await runRule(project.rules.code,state,move,project);
    if(!result.valid)throw new Error(result.message||'规则不允许这一步。');
    next={...next,pieces:result.pieces!,turn:result.turn!,winner:result.winner??null,data:result.data||state.data};
    text=`${move.from?coord(move.from,project.board.rows)+' → ':''}${coord(move.to,project.board.rows)}`;
  }
  next.history=[...state.history,{text,side:state.turn,...move}];
  return next;
}
