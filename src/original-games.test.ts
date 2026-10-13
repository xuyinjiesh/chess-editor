import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialState } from './engine';
import { customAdapter } from './bot-custom';
import { searchGame } from './bot-search';
import { customMoveControls, validateCustomView, type CustomView } from './custom-play';
import { validateCatalog } from './gallery-format';
import { galleryCover } from './gallery-cover';
import { validateProject, type GameState, type Move, type Piece, type Project, type RuleResult, type Side } from './model';

const load = (id:string) => validateProject(JSON.parse(readFileSync(new URL(`../public/gallery/${id}/v1/project.json`,import.meta.url),'utf8')));
const football=load('football'), wrestle=load('wrestle-chess');
type Hooks = {onMove:(s:GameState,m:Move,p:Project)=>RuleResult;getLegalMoves:(s:GameState,p:Project)=>Move[];getGameView:(s:GameState,p:Project)=>CustomView;evaluate:(s:GameState,side:Side,p:Project)=>number};
const hooks = (p:Project) => new Function(p.rules.code+'\nreturn {onMove,getLegalMoves,getGameView,evaluate};')() as Hooks;
const f=hooks(football), w=hooks(wrestle);
let id=0;
const piece=(type:string,side:Side,row:number,col:number):Piece=>({id:'p'+id++,type,side,row,col});
const game=(pieces:Piece[],turn:Side='white',data:GameState['data']={}):GameState=>({pieces,turn,winner:null,history:[],data});
const move=(r:number,c:number,tr:number,tc:number,action?:string):Move=>({from:{row:r,col:c},to:{row:tr,col:tc},...(action?{action}:{})});
function play(p:Project,s:GameState,m:Move) {
  const old=structuredClone(s), result=hooks(p).onMove(s,m,p);
  expect(s).toEqual(old);
  if(!result.valid) throw new Error(result.message);
  validateProject({...p,pieces:result.pieces});
  return {...s,pieces:result.pieces!,turn:result.turn!,winner:result.winner??null,data:result.data||s.data,history:[...s.history,{...m,text:result.message||'',side:s.turn}]};
}
const ball=(row=11,col=7)=>piece('ball','white',row,col);
const held=(carrier:Piece,others:Piece[]=[],charged=false)=>game([carrier,...others],carrier.side,{carrierId:carrier.id,charged});
const place=(type:string,row:number,col:number):Move=>({action:'place-'+type,to:{row,col}});

describe('original gallery artifacts and controls',()=>{
  it('publishes attributed, portable snapshots with matching source rules and covers',()=>{
    const catalog=validateCatalog(JSON.parse(readFileSync(new URL('../public/gallery/index.json',import.meta.url),'utf8')));
    for(const [p,source] of [[football,'football'],[wrestle,'wrestle']] as const) {
      const entry=catalog.entries.find(e=>e.id===p.id)!;
      expect(entry.author).toBe('xuyinjie · 原创设计');expect(entry.tags).toContain('原创');
      expect(p.rules.code).toBe(readFileSync(new URL(`../scripts/rules/${source}.js`,import.meta.url),'utf8'));
      expect(readFileSync(new URL(`../public/gallery/${p.id}/v1/cover.svg`,import.meta.url),'utf8')).toBe(galleryCover(p));
      expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    }
    expect(galleryCover(football)).toContain('M0 100H500');
  });
  it('prepares placement and movement choices and filters hints without changing game state',()=>{
    const s=initialState(wrestle),view=validateCustomView({...w.getGameView(s,wrestle),moves:w.getLegalMoves(s,wrestle)},wrestle);
    expect(view.choices).toHaveLength(7);
    const controls=customMoveControls(view,'place-horse');
    expect(controls.interaction).toBe('place');expect(controls.hints({row:2,col:2})).toHaveLength(8);
    expect(controls.prepareMove({to:{row:0,col:0}})).toEqual(place('horse',0,0));
    const fstate=held(piece('fw','white',10,7)), fv=validateCustomView({...f.getGameView(fstate,football),moves:f.getLegalMoves(fstate,football)},football);
    expect(fv.markers?.[0].label).toBe('⚽');
    const kicks=customMoveControls(fv,'kick-ball'), walks=customMoveControls(fv,'move-player');
    expect(kicks.hints({row:10,col:7})).toContainEqual({row:0,col:7});
    expect(walks.hints({row:10,col:7})).not.toContainEqual({row:0,col:7});
    expect(kicks.prepareMove(move(10,7,0,7)).action).toBe('kick-ball');
    expect(kicks.prepareMove(move(10,7,9,7,'move-player')).action).toBe('move-player');
  });
  it('rejects malformed controls and markers from custom code',()=>{
    const choice={action:'move',label:'移动',interaction:'move'},marker={cell:{row:0,col:0},label:'⚽'};
    for(const data of [{choices:[null]},{choices:[{...choice,action:'<script>'}]},{choices:[choice,choice]},{choices:[{...choice,interaction:'html'}]},{choices:Array(17).fill(choice)},{markers:[{...marker,cell:{row:23,col:0}}]},{markers:[{...marker,label:'x'.repeat(13)}]},{markers:[null]}]) {
      expect(()=>validateCustomView({actions:[],moves:[],...data},football)).toThrow();
    }
  });
});

describe('football chess',()=>{
  it('starts with the original asymmetric forward positions, seven players each and one neutral ball',()=>{
    expect(football.board).toMatchObject({rows:23,cols:15});expect(football.pieces).toHaveLength(15);
    expect(football.pieceTypes.find(t=>t.id==='ball')?.neutral).toBe(true);
    for(const side of ['white','black']) for(const [type,count] of [['gk',1],['df',2],['mf',2],['fw',2]] as const) expect(football.pieces.filter(p=>p.side===side&&p.type===type)).toHaveLength(count);
    expect(football.pieces.filter(p=>p.type==='fw').map(p=>p.row)).toEqual([10,10,13,13]);
    expect(initialState(football).turn).toBe('white');
  });
  it('implements each movement range, midfielder jumps and blockers',()=>{
    for(const [type,limit] of [['gk',2],['df',3],['fw',4]] as const) {
      const s=game([piece(type,'white',10,7),ball(20,7)]);
      expect(f.onMove(s,move(10,7,10-limit,7-limit),football).valid).toBe(true);
      expect(f.onMove(s,move(10,7,10-limit-1,7),football).valid).toBe(false);
    }
    const s=game([piece('mf','white',10,7),piece('df','black',9,7),ball(20,7)]);
    expect(f.onMove(s,move(10,7,8,6),football).valid).toBe(true);
    expect(f.onMove(s,move(10,7,8,5),football).valid).toBe(false);
    expect(f.onMove(s,move(10,7,9,6),football).valid).toBe(true);
    expect(f.onMove(s,move(10,7,10,10),football).valid).toBe(true);
    expect(f.onMove(s,move(10,7,8,7),football).valid).toBe(false);
    expect(f.onMove(s,move(10,7,9,7),football).valid).toBe(false);
    expect(f.onMove(s,move(9,7,9,8),football).valid).toBe(false);
  });
  it('picks up the ball only at the destination and keeps one logical ball while dribbling',()=>{
    const s=game([piece('fw','white',13,6),ball(11,6)]);
    const passed=play(football,s,move(13,6,10,6));expect(passed.pieces.some(p=>p.type==='ball')).toBe(true);
    let next=play(football,s,move(13,6,11,6));expect(next.pieces).toHaveLength(1);expect(next.data.carrierId).toBe(s.pieces[0].id);
    next=play(football,{...next,turn:'white'},move(11,6,8,6));expect(next.pieces[0]).toMatchObject({row:8,col:6});expect(next.data.charged).toBe(false);
    const shot=play(football,{...next,turn:'white'},move(8,6,7,6,'kick-ball'));
    expect(shot.pieces.find(p=>p.type==='ball')?.id).toBe(s.pieces[1].id);expect(shot.data.carrierId).toBeNull();
  });
  it('allows adjacent kicks and steals but rejects backward kicks and distant kickers',()=>{
    for(const owner of ['white','black'] as const) {
      const carrier=piece('df',owner,11,7),kicker=piece('fw','white',11,6),s=game([carrier,kicker],'white',{carrierId:carrier.id});
      expect(f.onMove(s,move(11,6,11,5,'kick-ball'),football).valid).toBe(false);
      expect(f.onMove(s,move(11,6,10,7,'kick-ball'),football).valid).toBe(true);
      const next=play(football,s,move(11,6,11,9,'kick-ball'));expect(next.pieces).toContainEqual(carrier);expect(next.pieces.find(p=>p.type==='ball')).toMatchObject({row:11,col:9});
    }
    expect(f.onMove(game([piece('fw','white',11,4),ball()]),move(11,4,11,9,'kick-ball'),football).valid).toBe(false);
  });
  it('stops passes at teammates or opponents and supports receiving the ball',()=>{
    const carrier=piece('df','white',11,7),friend=piece('fw','white',11,9),enemy=piece('df','black',9,7),s=held(carrier,[friend,enemy]);
    expect(f.onMove(s,move(11,7,11,10,'kick-ball'),football).valid).toBe(false);
    expect(f.onMove(s,move(11,7,9,7,'kick-ball'),football).valid).toBe(false);
    expect(f.onMove(s,move(11,7,8,7,'kick-ball'),football).valid).toBe(false);
    const next=play(football,s,move(11,7,11,9,'kick-ball'));expect(next.data.carrierId).toBe(friend.id);expect(next.pieces).toHaveLength(3);
  });
  it('charges only after a valid friendly action that leaves the carrier in place, then resets on movement or loss',()=>{
    const carrier=piece('fw','white',10,7),s=held(carrier,[piece('gk','white',21,7),piece('gk','black',1,7)]);
    const original=structuredClone(s);expect(f.onMove(s,move(21,7,15,7),football).valid).toBe(false);expect(s).toEqual(original);
    let next=play(football,s,move(21,7,20,7));expect(next.data.charged).toBe(true);
    next=play(football,next,move(1,7,2,7));expect(next.data.charged).toBe(true);
    expect(f.getGameView(next,football).markers?.[0].label).toBe('⚽蓄');
    const dribble=play(football,next,move(10,7,9,7));expect(dribble.data.charged).toBe(false);
    const shot=play(football,next,move(10,7,7,5,'kick-ball'));expect(shot.data.charged).toBe(false);expect(shot.data.carrierId).toBeNull();
  });
  it('supports midfielder knight rays, charged forward/defender knight rays and bend passes',()=>{
    for(const type of ['fw','df','mf','gk']) {
      const p=piece(type,'white',10,7),normal=held(p),charged=held(p,[],true);
      expect(f.onMove(normal,move(10,7,6,5,'kick-ball'),football).valid).toBe(type==='mf');
      expect(f.onMove(charged,move(10,7,6,5,'kick-ball'),football).valid).toBe(type!=='gk');
      expect(f.onMove(normal,move(10,7,7,5,'kick-ball'),football).valid).toBe(false);
      expect(f.onMove(charged,move(10,7,7,5,'kick-ball'),football).valid).toBe(type!=='gk');
    }
    const mf=piece('mf','white',10,7);
    expect(f.onMove(held(mf,[piece('df','black',9,7)]),move(10,7,6,5,'kick-ball'),football).valid).toBe(true);
    expect(f.onMove(held(mf,[piece('df','black',8,6)]),move(10,7,6,5,'kick-ball'),football).valid).toBe(false);
    const fw=piece('fw','white',10,7);
    expect(f.onMove(held(fw,[piece('df','white',9,7)],true),move(10,7,7,5,'kick-ball'),football).valid).toBe(true);
    expect(f.onMove(held(fw,[piece('df','black',9,7)],true),move(10,7,7,5,'kick-ball'),football).valid).toBe(false);
  });
  it('allows players including carriers on the endline sides but forbids kicking there',()=>{
    const carrier=piece('fw','white',1,3),s=held(carrier);
    expect(play(football,s,move(1,3,0,3)).winner).toBeNull();
    expect(f.onMove(s,move(1,3,0,3,'kick-ball'),football).valid).toBe(false);
    expect(f.onMove(s,move(1,3,-1,3),football).valid).toBe(false);
  });
  it('scores on dribbles, shots, receiving in goal and own goals, but not empty-handed entry',()=>{
    for(const side of ['white','black'] as const) {
      const row=side==='white'?1:21,goal=side==='white'?0:22,p=piece('fw',side,row,7);
      for(const action of ['move-player','kick-ball']) expect(play(football,held(p),move(row,7,goal,7,action)).winner).toBe(side);
      expect(play(football,held(p,[piece('df',side,goal,7)]),move(row,7,goal,7,'kick-ball')).winner).toBe(side);
      expect(play(football,game([p,ball()],side),move(row,7,goal,7)).winner).toBeNull();
      expect(play(football,held(piece('fw',side,22-row,7)),move(22-row,7,22-goal,7)).winner).toBe(side==='white'?'black':'white');
    }
    const won=play(football,held(piece('fw','white',1,7)),move(1,7,0,7));expect(f.getLegalMoves(won,football)).toEqual([]);expect(f.onMove(won,move(0,7,1,7),football).valid).toBe(false);
  });
});

describe('wrestle chess',()=>{
  it('has 16 reserves each, no opening center, then allows center with no red pieces on board',()=>{
    let s=initialState(wrestle);expect(w.getLegalMoves(s,wrestle)).toHaveLength(56);
    expect(w.onMove(s,place('rook',1,1),wrestle).valid).toBe(false);
    s=play(wrestle,s,place('rook',0,0));expect(s.data.reserves).toMatchObject({white:{rook:1,king:1}});
    s=play(wrestle,s,place('pawn',1,1));expect(s.pieces).toHaveLength(2);
    const later={...s,pieces:s.pieces.filter(p=>p.side==='black'&&p.row!==1)};
    expect(play(wrestle,later,place('horse',1,1)).pieces).toHaveLength(1);
    expect(w.onMove(s,place('queen',2,2),wrestle).valid).toBe(false);
  });
  it('enforces the three-piece cap, stock counts and permanent captures',()=>{
    let s=initialState(wrestle);
    for(const [type,row,col] of [['rook',0,0],['pawn',2,2],['rook',0,1],['pawn',2,1],['pawn',0,2],['pawn',2,0]] as const) s=play(wrestle,s,place(type,row,col));
    expect(w.onMove(s,place('horse',1,1),wrestle).valid).toBe(false);
    expect(w.getLegalMoves(s,wrestle).every(m=>!!m.from)).toBe(true);
    const captured=play(wrestle,s,move(0,0,2,0,'move'));expect(captured.pieces.filter(p=>p.side==='black')).toHaveLength(2);
    expect(captured.data.reserves).toEqual(s.data.reserves);
    expect(w.onMove({...captured,turn:'white',pieces:captured.pieces.filter(p=>p.side==='black')},place('rook',1,0),wrestle).valid).toBe(false);
    expect(w.onMove(captured,place('pawn',2,2),wrestle).valid).toBe(false);
  });
  it('lets every piece step orthogonally to empties but not all capture there',()=>{
    for(const type of wrestle.pieceTypes.map(t=>t.id)) {
      const p=piece(type,'white',0,0);
      expect(w.onMove(game([p]),move(0,0,1,0),wrestle).valid).toBe(true);
      expect(w.onMove(game([p,piece('pawn','black',1,0)]),move(0,0,1,0),wrestle).valid).toBe(['rook','king','pawn'].includes(type));
      expect(w.onMove(game([p,piece('pawn','white',1,0)]),move(0,0,1,0),wrestle).valid).toBe(false);
    }
    expect(play(wrestle,game([piece('advisor','white',0,0),piece('king','black',1,1)]),move(0,0,1,1)).winner).toBe('white');
  });
  it('lets elephants capture both diagonal enemies, retains a friendly middle and forbids friendly destinations',()=>{
    for(const middleSide of ['white','black'] as const) {
      const middle=piece('pawn',middleSide,1,1),p=piece('elephant','white',0,0),target=piece('king','black',2,2);
      const next=play(wrestle,game([p,middle,target]),move(0,0,2,2));expect(next.winner).toBe('white');expect(next.pieces.some(p=>p.id===middle.id)).toBe(middleSide==='white');
    }
    expect(play(wrestle,game([piece('elephant','white',0,0),piece('king','black',1,1)]),move(0,0,2,2)).winner).toBe('white');
    expect(w.onMove(game([piece('elephant','white',0,0),piece('pawn','white',2,2)]),move(0,0,2,2),wrestle).valid).toBe(false);
    expect(w.onMove(game([piece('elephant','white',0,0)]),move(0,0,1,1),wrestle).valid).toBe(false);
  });
  it('blocks horses only with an enemy leg and lets cannons capture diagonally over exactly one screen',()=>{
    for(const side of ['white','black'] as const) expect(w.onMove(game([piece('horse','white',0,0),piece('pawn',side,1,0)]),move(0,0,2,1),wrestle).valid).toBe(side==='white');
    for(const side of ['white','black'] as const) expect(play(wrestle,game([piece('cannon','white',0,0),piece('pawn',side,1,1),piece('king','black',2,2)]),move(0,0,2,2)).winner).toBe('white');
    expect(w.onMove(game([piece('cannon','white',0,0),piece('king','black',2,2)]),move(0,0,2,2),wrestle).valid).toBe(false);
    expect(w.onMove(game([piece('cannon','white',0,0)]),move(0,0,2,2),wrestle).valid).toBe(false);
    expect(w.onMove(game([piece('cannon','white',0,0)]),move(0,0,2,0),wrestle).valid).toBe(true);
    expect(play(wrestle,game([piece('cannon','white',0,0),piece('pawn','white',1,0),piece('king','black',2,0)]),move(0,0,2,0)).winner).toBe('white');
  });
  it('keeps kings in reserve without declaring victory and wins only after capturing an on-board king',()=>{
    const s=play(wrestle,initialState(wrestle),place('rook',0,0));
    const next=play(wrestle,{...s,turn:'white'},move(0,0,0,2));expect(next.winner).toBeNull();
    const won=play(wrestle,game([piece('pawn','white',1,1),piece('king','black',1,2)]),move(1,1,1,2));expect(won.winner).toBe('white');expect(w.getLegalMoves(won,wrestle)).toEqual([]);
  });
});

describe('portable AI for the original games',()=>{
  it('enumerates valid moves and preserves invariants through deterministic multi-turn playouts',async()=>{
    for(const p of [football,wrestle]) {
      const h=hooks(p),adapter=customAdapter(p);let s=initialState(p);
      for(let turn=0;turn<24&&!s.winner;turn++) {
        const moves=h.getLegalMoves(s,p);expect(moves.length).toBeGreaterThan(0);
        for(const m of moves) expect(h.onMove(s,m,p).valid).toBe(true);
        const index=(turn*47+13)%moves.length;s=play(p,s,moves[index]);
        expect(Number.isFinite(h.evaluate(s,'white',p))).toBe(true);
        expect(h.evaluate(s,'white',p)).toBe(-h.evaluate(s,'black',p));
        if(p===football) expect(s.pieces.filter(pc=>pc.type!=='ball')).toHaveLength(14);
        else for(const side of ['white','black']) expect(s.pieces.filter(pc=>pc.side===side).length).toBeLessThanOrEqual(3);
      }
      if(!s.winner) {let count=0;for await(const m of adapter.moves(s,()=>{})){expect(await adapter.play(s,m)).toBeTruthy();count++;}expect(count).toBeGreaterThan(0);}
    }
  });
  it('finds a goal, a king capture through the center, and an opening deployment',async()=>{
    const fixtures:[Project,GameState][]=[[football,held(piece('fw','white',1,7))],[wrestle,game([piece('elephant','white',0,0),piece('king','black',1,1)])],[wrestle,initialState(wrestle)]];
    for(const [p,s] of fixtures) {
      const result=await searchGame(customAdapter(p),s,{timeMs:1500,maxDepth:2,maxNodes:10000});expect(result.move).not.toBeNull();
      const next=play(p,s,result.move!);if(s.pieces.length) expect(next.winner).toBe('white');else expect(next.pieces).toHaveLength(1);
    }
  });
});
