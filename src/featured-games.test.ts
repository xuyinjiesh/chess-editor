import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEMPLATES } from './templates';
import { initialState } from './engine';
import { customAdapter } from './bot-custom';
import { searchGame } from './bot-search';
import { validateCustomView } from './custom-play';
import { galleryCover } from './gallery-cover';
import { validateCatalog, validateGalleryEntry } from './gallery-format';
import { sideLabel, validateProject, type GameState, type Move, type Piece, type Project, type RuleResult, type Side } from './model';

const load = (id: string) => validateProject(JSON.parse(readFileSync(new URL(`../public/gallery/${id}/v1/project.json`,import.meta.url),'utf8')));
const mini = load('mini-eternal'), shock = load('shock-chess');
type Hooks = { onMove: (s: GameState,m: Move,p: Project) => RuleResult; getLegalMoves: (s: GameState,p: Project) => Move[]; getGameView: (s: GameState,p: Project) => Record<string,unknown> };
const hooks = (p: Project) => new Function(p.rules.code+'\nreturn {onMove,getLegalMoves,getGameView};')() as Hooks;
const m = hooks(mini), s = hooks(shock);
let identity = 0;
const piece = (type: string, side: Side, row: number, col: number): Piece => ({id:'test-'+identity++,type,side,row,col});
const state = (pieces: Piece[],turn: Side='white',data: GameState['data']={phase:'moving'}): GameState => ({pieces,turn,winner:null,history:[],data});
function play(p: Project,before: GameState,move: Move): GameState {
  const original=structuredClone(before), result=hooks(p).onMove(before,move,p);
  expect(before).toEqual(original);
  if (!result.valid) throw new Error(result.message);
  validateProject({...p,pieces:result.pieces});
  return {...before,pieces:result.pieces!,turn:result.turn!,winner:result.winner??null,data:result.data||before.data,history:[...before.history,{...move,side:before.turn,text:result.message||'test'}]};
}
const move = (r: number,c: number,tr: number,tc: number): Move => ({from:{row:r,col:c},to:{row:tr,col:tc}});

describe('curated gallery artifacts and safe rule view',()=>{
  it('replaces demo catalog entries with the two attributed games',()=>{
    const catalog=validateCatalog(JSON.parse(readFileSync(new URL('../public/gallery/index.json',import.meta.url),'utf8')));
    const ids=catalog.entries.map(e=>e.id);
    expect(ids).toEqual(expect.arrayContaining(['mini-eternal','shock-chess']));
    for(const id of ['nine-four','mini-reversi','adjacent-duel']) expect(ids).not.toContain(id);
    for (const entry of catalog.entries.filter(e=>['mini-eternal','shock-chess'].includes(e.id)&&e.revision===1)) {
      expect(entry.credits).toContain('授权状态尚未核实'); expect(entry.sources).toHaveLength(1);
      const p=load(entry.id);
      expect(p.rules.code).toBe(readFileSync(new URL(`../scripts/rules/${entry.id==='mini-eternal'?'mini-eternal':'shock'}.js`,import.meta.url),'utf8'));
      expect(p.description).toContain('授权状态尚未核实');
      expect(readFileSync(new URL(`../public/gallery/${entry.id}/v1/cover.svg`,import.meta.url),'utf8')).toBe(galleryCover(p));
    }
  });
  it('retains neutral definitions and red/blue labels through project imports',()=>{
    expect(validateProject(JSON.parse(JSON.stringify(mini)))).toEqual(mini);
    expect(mini.pieceTypes.find(t=>t.id==='river-stone')?.neutral).toBe(true);
    expect(sideLabel(mini,'white')).toBe('红方'); expect(sideLabel(mini,'black')).toBe('蓝方');
    expect(()=>validateProject({...mini,ui:{...mini.ui,sideColors:{white:'red',black:'#123456'}}})).toThrow();
    expect(()=>validateProject({...mini,pieceTypes:mini.pieceTypes.map(t=>({...t,neutral:'yes'}))})).toThrow();
  });
  it('keeps default red and black xiangqi cover glyphs legible without color overrides',()=>{
    const project=TEMPLATES.find(p=>p.rules.engine==='xiangqi')!, cover=galleryCover(project);
    expect(cover).toContain('fill="#344138"'); expect(cover).toContain('fill="#a2392d"');
  });
  it('validates source URLs and never accepts executable schemes',()=>{
    const entry=JSON.parse(readFileSync(new URL('../public/gallery/index.json',import.meta.url),'utf8')).entries.find((e:{id:string})=>e.id==='mini-eternal');
    for(const url of ['javascript:alert(1)','data:text/html,x','file:///secret']) expect(()=>validateGalleryEntry({...entry,sources:[{label:'source',url}]})).toThrow();
    expect(validateGalleryEntry(entry).sources![0].url).toMatch(/^https:/);
  });
  it('accepts only bounded text controls and valid board moves',()=>{
    const view=m.getGameView(initialState(mini),mini);
    expect(validateCustomView({...view,moves:m.getLegalMoves(initialState(mini),mini)},mini).actions[0].move.action).toBe('confirm-setup');
    for(const value of [{message:4},{actions:Array(17).fill({})},{moves:[{to:{row:-1,col:0}}]},{interaction:'html'},{actions:[{label:'x',move:{to:{row:0,col:0},action:'<script>'}}]}]) expect(()=>validateCustomView({actions:[],moves:[],...value},mini)).toThrow();
  });
});
describe('mini eternal chess',()=>{
  it('starts with two of each piece per side and six neutral stones',()=>{
    expect(mini.board).toMatchObject({rows:7,cols:6}); expect(mini.rules.firstTurn).toBe('white');
    for(const side of ['white','black']) for(const type of ['rook','horse','cannon']) expect(mini.pieces.filter(p=>p.side===side&&p.type===type)).toHaveLength(2);
    expect(mini.pieces.filter(p=>p.type==='river-stone')).toHaveLength(6);
  });
  it('allows swaps only on the current side and confirms both setups before red moves',()=>{
    let game=initialState(mini);
    const first=game.pieces.find(p=>p.side==='white'&&p.type==='rook')!;
    game=play(mini,game,move(6,1,5,0)); expect(game.turn).toBe('white'); expect(game.pieces.find(p=>p.id===first.id)).toMatchObject({row:5,col:0});
    expect(m.onMove(game,move(5,0,0,1),mini).valid).toBe(false);
    game=play(mini,game,{action:'confirm-setup',to:{row:6,col:1}}); expect(game.turn).toBe('black');
    expect(game.data.phase).toBe('setup');
    game=play(mini,game,{action:'confirm-setup',to:{row:0,col:1}}); expect(game.turn).toBe('white'); expect(game.data.phase).toBe('moving');
    expect(m.onMove(game,{action:'confirm-setup',to:{row:0,col:1}},mini).valid).toBe(false);
  });
  it('rejects edited setups with wrong counts or starting cells',()=>{
    for(const edit of [(p: Piece[])=>p.slice(1),(p: Piece[])=>p.map((q,i)=>i===0?{...q,type:'horse'}:q),(p: Piece[])=>p.map((q,i)=>i===0?{...q,row:4}:q)]) {
      const game={...initialState(mini),pieces:edit(mini.pieces)};
      expect(m.onMove(game,{action:'confirm-setup',to:{row:6,col:1}},mini).valid).toBe(false); expect(m.getLegalMoves(game,mini)).toEqual([]);
    }
  });
  it('lets horses jump regardless of a blocked leg',()=>{
    const game=state([piece('horse','white',5,2),piece('rook','white',4,2)]);
    expect(play(mini,game,move(5,2,3,3)).pieces.some(p=>p.type==='horse'&&p.row===3&&p.col===3)).toBe(true);
  });
  it('stops rooks at the first piece and allows friendly captures',()=>{
    const game=state([piece('rook','white',5,0),piece('horse','white',5,2)]);
    expect(m.onMove(game,move(5,0,5,3),mini).valid).toBe(false);
    const next=play(mini,game,move(5,0,5,2)); expect(next.data.phase).toBe('placing'); expect(next.turn).toBe('white');
    expect(next.data.captured).toMatchObject({type:'horse',side:'white'});
  });
  it('requires exactly one screen for cannon captures',()=>{
    const cannon=piece('cannon','white',5,0), target=piece('rook','black',5,4);
    expect(m.onMove(state([cannon,target]),move(5,0,5,4),mini).valid).toBe(false);
    expect(play(mini,state([cannon,piece('horse','white',5,2),target]),move(5,0,5,4)).data.phase).toBe('placing');
    expect(m.onMove(state([cannon,piece('horse','white',5,1),piece('horse','black',5,2),target]),move(5,0,5,4),mini).valid).toBe(false);
    expect(play(mini,state([cannon,target]),move(5,0,5,2)).turn).toBe('black');
  });
  it('restores captured colored pieces with identity in their own half before switching turns',()=>{
    const captured=piece('horse','black',4,2);
    let game=play(mini,state([piece('rook','white',4,0),captured]),move(4,0,4,2));
    expect(game.turn).toBe('white'); expect(game.pieces.find(p=>p.id===captured.id)).toBeUndefined();
    for(const to of [{row:3,col:2},{row:5,col:2},{row:4,col:2}]) expect(m.onMove(game,{to},mini).valid).toBe(false);
    expect(m.onMove(game,move(4,2,1,2),mini).valid).toBe(false);
    game=play(mini,game,{to:{row:1,col:2}}); expect(game.turn).toBe('black'); expect(game.data.phase).toBe('moving');
    expect(game.pieces.find(p=>p.id===captured.id)).toMatchObject({row:1,col:2,type:'horse',side:'black'});
  });
  it('permanently removes captured neutral stones without a restore step',()=>{
    const stone=piece('river-stone','black',3,0), game=state([piece('rook','white',5,0),stone]);
    const next=play(mini,game,move(5,0,3,0)); expect(next.turn).toBe('black'); expect(next.data.phase).toBe('moving'); expect(next.pieces).toHaveLength(1);
    expect(m.onMove(state([stone],'black'),move(3,0,3,1),mini).valid).toBe(false);
  });
  it('protects guardians from enemy and friendly capture while allowing them to move',()=>{
    for(const side of ['white','black'] as const) {
      const game=state([piece('rook',side,6,0),piece('horse','white',6,2)],side);
      expect(m.onMove(game,move(6,0,6,2),mini).valid).toBe(false);
      expect(m.getLegalMoves(game,mini).some(v=>v.from?.col===0&&v.to.row===6&&v.to.col===2)).toBe(false);
    }
    expect(play(mini,state([piece('rook','white',6,2)]),move(6,2,6,3)).winner).toBeNull();
  });
  it('prevents a second guardian both by moving and by restoration',()=>{
    expect(m.onMove(state([piece('rook','white',6,2),piece('rook','white',5,3)]),move(5,3,6,3),mini).valid).toBe(false);
    const game=state([piece('rook','black',0,2)],'white',{phase:'placing',captured:piece('horse','black',4,4)});
    expect(m.onMove(game,{to:{row:0,col:3}},mini).valid).toBe(false);
    expect(m.getLegalMoves(game,mini).some(v=>v.to.row===0&&v.to.col===3)).toBe(false);
  });
  it('wins immediately on entering the opposing forbidden zone',()=>{
    const game=state([piece('rook','white',1,2)]);
    const next=play(mini,game,move(1,2,0,2)); expect(next.winner).toBe('white'); expect(next.data.phase).toBe('moving');
    expect(m.getLegalMoves(next,mini)).toEqual([]);
    expect(play(mini,state([piece('rook','black',5,3)],'black'),move(5,3,6,3)).winner).toBe('black');
  });
  it('keeps human hints and AI-generated moves consistent with every phase',async()=>{
    const games=[initialState(mini),state([piece('rook','white',4,0),piece('horse','white',4,2),piece('rook','black',0,2)]),state([piece('rook','white',6,2)],'black',{phase:'placing',captured:piece('horse','white',1,1)})];
    for(const game of games) {
      const adapter=customAdapter(mini), list=[];
      for await(const candidate of adapter.moves(game,()=>{})) {list.push(candidate); expect(await adapter.play(game,candidate)).toBeTruthy();}
      expect(list).toEqual(m.getLegalMoves(game,mini)); expect(list.length).toBeGreaterThan(0);
    }
  });
  it('lets AI confirm setup, find an immediate win and complete restoration',async()=>{
    for(const game of [initialState(mini),state([piece('rook','white',1,2)]),state([],'black',{phase:'placing',captured:piece('horse','white',1,1)})]) {
      const result=await searchGame(customAdapter(mini),game,{timeMs:1500,maxDepth:2,maxNodes:20000});
      expect(result.move).not.toBeNull(); const next=play(mini,game,result.move!);
      if(game.data.phase==='moving') expect(next.winner).toBe('white');
      if(game.data.phase==='placing') expect(next.data.phase).toBe('moving');
    }
  });
});
describe('shock chess',()=>{
  it('uses an empty 8 by 8 cell-centered board with black first and rejects occupied cells',()=>{
    expect(shock.board).toMatchObject({rows:8,cols:8,pattern:'cells'}); expect(initialState(shock).turn).toBe('black'); expect(shock.pieces).toEqual([]);
    const game=play(shock,initialState(shock),{to:{row:4,col:4}}); expect(game.turn).toBe('white');
    expect(s.onMove(game,{to:{row:4,col:4}},shock).valid).toBe(false); expect(s.onMove(game,move(4,4,5,5),shock).valid).toBe(false);
    for(const to of [{row:8,col:0},{row:0,col:8}]) expect(s.onMove(game,{to},shock).valid).toBe(false);
  });
  it('pushes all eight adjacent cells of either side simultaneously',()=>{
    const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const pieces=dirs.map(([dr,dc],i)=>piece('stone',i%2?'black':'white',4+dr,4+dc));
    const next=play(shock,state(pieces,'black'),{to:{row:4,col:4}});
    dirs.forEach(([dr,dc],i)=>expect(next.pieces.find(p=>p.id===pieces[i].id)).toMatchObject({row:4+dr*2,col:4+dc*2,side:pieces[i].side}));
    expect(next.pieces.find(p=>p.row===4&&p.col===4)?.side).toBe('black');
  });
  it('leaves blocked stones in place without chain pushes',()=>{
    const adjacent=piece('stone','white',4,5), blocker=piece('stone','black',4,6);
    const next=play(shock,state([adjacent,blocker],'black'),{to:{row:4,col:4}});
    expect(next.pieces).toEqual(expect.arrayContaining([adjacent,blocker]));
  });
  it('removes pieces pushed out at edges and corners',()=>{
    const next=play(shock,state([piece('stone','black',0,0),piece('stone','white',0,1),piece('stone','black',1,0)],'black'),{to:{row:1,col:1}});
    expect(next.pieces).toHaveLength(1); expect(next.pieces[0]).toMatchObject({row:1,col:1});
  });
  it('ends immediately if the placement completes four, without any shock',()=>{
    const old=[0,1,3].map(col=>piece('stone','black',4,col)), neighbour=piece('stone','white',3,2);
    const next=play(shock,state([...old,neighbour],'black'),{to:{row:4,col:2}});
    expect(next.winner).toBe('black'); expect(next.data.lastAction).toBe('win-before-shock'); expect(next.pieces).toEqual(expect.arrayContaining([...old,neighbour]));
  });
  it('can award the opponent a win after shock',()=>{
    const pieces=[1,2,3].map(col=>piece('stone','white',4,col)); pieces.push(piece('stone','white',3,4));
    const next=play(shock,state(pieces,'black'),{to:{row:2,col:4}}); expect(next.winner).toBe('white');
  });
  it('declares a draw when both sides form four after shock',()=>{
    const pieces=[1,2,3].map(col=>piece('stone','white',4,col)); pieces.push(piece('stone','white',3,4));
    for(const col of [1,2,3]) pieces.push(piece('stone','black',0,col)); pieces.push(piece('stone','black',1,4));
    const next=play(shock,state(pieces,'black'),{to:{row:2,col:4}}); expect(next.winner).toBe('draw');
  });
  it('treats runs longer than four as wins in every direction',()=>{
    for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      const col=dc<0?6:2, old=Array.from({length:4},(_,n)=>piece('stone','black',2+dr*n,col+dc*n));
      expect(play(shock,state(old,'black'),{to:{row:2+dr*4,col:col+dc*4}}).winner).toBe('black');
    }
  });
  it('draws on a full board without a four-piece line',()=>{
    const small={...shock,board:{...shock.board,rows:3,cols:3}};
    const pieces=Array.from({length:9},(_,n)=>piece('stone',n%2?'white':'black',Math.floor(n/3),n%3)).slice(1);
    expect(play(small,state(pieces,'black'),{to:{row:0,col:0}}).winner).toBe('draw');
  });
  it('AI enumerates only valid placements and finds the winning move',async()=>{
    const game=state([0,1,3].map(col=>piece('stone','black',4,col)),'black');
    const adapter=customAdapter(shock); let count=0;
    for await(const candidate of adapter.moves(game,()=>{})) {expect(s.onMove(game,candidate,shock).valid).toBe(true); count++;}
    expect(count).toBe(61);
    const result=await searchGame(adapter,game,{timeMs:1500,maxDepth:2,maxNodes:20000}); expect(result.move).not.toBeNull(); expect(play(shock,game,result.move!).winner).toBe('black');
  });
});
