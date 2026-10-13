import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialState } from './engine';
import { validateProject, type GameState, type Move, type Piece, type Project, type RuleResult, type Side } from './model';
import { validateCatalog, filterEntries } from './gallery-format';
import { galleryCover } from './gallery-cover';
import { validateCustomView } from './custom-play';
import { customAdapter } from './bot-custom';
import { searchGame } from './bot-search';

const project = validateProject(JSON.parse(readFileSync(new URL('../public/gallery/intransitive/v1/project.json',import.meta.url),'utf8')));
const hooks = new Function(project.rules.code+'\nreturn {onMove,getLegalMoves,getGameView,evaluate};')() as {
  onMove: (s: GameState,m: Move,p: Project) => RuleResult;
  getLegalMoves: (s: GameState,p: Project) => Move[];
  getGameView: (s: GameState) => Record<string,unknown>;
  evaluate: (s: GameState,side: Side) => number;
};
const p = (type: string,side: Side,row: number,col: number): Piece => ({id:`${side}-${row}-${col}`,type,side,row,col});
const game = (pieces: Piece[],turn: Side='white',quietPlies=0): GameState => ({...initialState(project),pieces,turn,data:{quietPlies}});
const move = (r: number,c: number,tr: number,tc: number): Move => ({from:{row:r,col:c},to:{row:tr,col:tc}});
const legal = (s: GameState) => hooks.getLegalMoves(s,project);
function play(s: GameState,m: Move): GameState {
  const before = structuredClone(s), result = hooks.onMove(s,m,project);
  expect(s).toEqual(before);
  expect(result.valid,result.message).toBe(true);
  validateProject({...project,pieces:result.pieces});
  return {...s,pieces:result.pieces!,turn:result.turn!,winner:result.winner??null,data:result.data!,history:[...s.history,{...m,side:s.turn,text:result.message!}]};
}

describe('Intransitive gallery publication',()=>{
  it('ships a portable project, generated cover and attributed searchable entry',()=>{
    const catalog=validateCatalog(JSON.parse(readFileSync(new URL('../public/gallery/index.json',import.meta.url),'utf8')));
    const entry=catalog.entries.find(e=>e.id==='intransitive')!;
    for(const query of ['石头剪刀布','Intransitive','webgoatguy']) expect(filterEntries(catalog.entries,query,'')).toContainEqual(entry);
    expect(entry.sources?.map(s=>s.url)).toEqual(['https://www.youtube.com/watch?v=LO_zcGNJriA','https://meaf.us/rps2/']);
    expect(project.rules.code).toBe(readFileSync(new URL('../scripts/rules/intransitive.js',import.meta.url),'utf8'));
    expect(readFileSync(new URL('../public/gallery/intransitive/v1/cover.svg',import.meta.url),'utf8')).toBe(galleryCover(project));
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });
  it('uses the exact reference opening, opposite corner bases and blue first',()=>{
    expect(project.board).toMatchObject({rows:9,cols:9,pattern:'cells'});
    expect(project.ui.sideLabels).toEqual({white:'蓝方',black:'红方'});
    expect(initialState(project).turn).toBe('white');
    const at=(side: Side,type: string)=>project.pieces.filter(p=>p.side===side&&p.type===type).map(p=>String.fromCharCode(97+p.col)+(9-p.row)).sort();
    expect(at('white','rock')).toEqual(['b4','c3','d2']);
    expect(at('white','paper')).toEqual(['b5','c4','d3','e2']);
    expect(at('white','scissors')).toEqual(['c5','d4','e3']);
    expect(at('black','rock')).toEqual(['f8','g7','h6']);
    expect(at('black','paper')).toEqual(['e8','f7','g6','h5']);
    expect(at('black','scissors')).toEqual(['e7','f6','g5']);
    expect(project.regions.map(r=>r.cells)).toEqual([[{row:8,col:0}],[{row:0,col:8}]]);
    expect(project.pieces).toHaveLength(20);
  });
});

describe('Intransitive movement and cyclic captures',()=>{
  it.each(['rock','paper','scissors'])('%s can move one square in all eight directions for either side',type=>{
    for(const side of ['white','black'] as const) {
      const s=game([p(type,side,4,4),p('paper',side==='white'?'black':'white',0,0)],side);
      expect(legal(s)).toHaveLength(8);
      for(const [r,c] of [[3,3],[3,4],[3,5],[4,3],[4,5],[5,3],[5,4],[5,5]]) {
        const next=play(s,move(4,4,r,c));
        expect(next.pieces.find(p=>p.id===s.pieces[0].id)).toMatchObject({row:r,col:c,type});
        expect(next.turn).not.toBe(side);expect(next.data.quietPlies).toBe(1);
      }
    }
  });
  it('checks all nine capture pairings in both colors, with no mutual or friendly captures',()=>{
    const beats: Record<string,string>={rock:'scissors',paper:'rock',scissors:'paper'};
    for(const side of ['white','black'] as const) for(const type of Object.keys(beats)) for(const victim of Object.keys(beats)) {
      const enemy=side==='white'?'black':'white';
      const s=game([p(type,side,4,4),p(victim,enemy,3,5),p('paper',enemy,0,0)],side,50),m=move(4,4,3,5);
      expect(hooks.onMove(s,m,project).valid).toBe(beats[type]===victim);
      expect(legal(s).some(x=>x.to.row===3&&x.to.col===5)).toBe(beats[type]===victim);
      if(beats[type]===victim) {
        const next=play(s,m);expect(next.pieces).toHaveLength(2);expect(next.data.quietPlies).toBe(0);
        expect(next.pieces.some(p=>p.id===s.pieces[1].id)).toBe(false);
      }
      expect(hooks.onMove(game([p(type,side,4,4),p(victim,side,3,5)],side),m,project).valid).toBe(false);
    }
  });
  it('rejects invalid coordinates, jumps, stationary moves, wrong turns and special actions',()=>{
    const s=game([p('rock','white',4,4),p('paper','black',0,0)]);
    for(const m of [move(4,4,4,4),move(4,4,2,4),move(4,4,-1,4),move(4,4,9,4),move(4,4,3.5,4),move(0,0,1,1),move(3,3,3,4),{to:{row:3,col:4}},{...move(4,4,3,4),action:'pass'},{...move(4,4,3,4),promotion:'q' as const}]) expect(hooks.onMove(s,m,project).valid).toBe(false);
    expect(legal(game([p('rock','white',8,0),p('paper','black',0,4)]))).toHaveLength(3);
    const resized={...project,board:{...project.board,rows:8}};
    expect(hooks.getLegalMoves(s,resized)).toEqual([]);expect(hooks.onMove(s,move(4,4,3,4),resized).valid).toBe(false);
    expect(legal(game([p('king','white',4,4)]))).toEqual([]);
  });
});

describe('Intransitive bases and end conditions',()=>{
  it('any type can enter either enemy base even under attack; own base is only defensive',()=>{
    for(const type of ['rock','paper','scissors']) for(const side of ['white','black'] as const) {
      const enemy=side==='white'?'black':'white',target=side==='white'?[0,8]:[8,0],origin=side==='white'?[1,7]:[7,1];
      const predator={rock:'paper',paper:'scissors',scissors:'rock'}[type]!;
      const s=game([p(type,side,origin[0],origin[1]),p(predator,enemy,target[0],origin[1])],side,199);
      const next=play(s,move(origin[0],origin[1],target[0],target[1]));
      expect(next.winner).toBe(side);expect(next.data.reason).toBe('攻入敌方基地');expect(legal(next)).toEqual([]);
      expect(hooks.onMove(next,move(target[0],target[1],origin[0],origin[1]),project).valid).toBe(false);
      const own=side==='white'?[8,0]:[0,8],start=side==='white'?[7,1]:[1,7];
      expect(play(game([p(type,side,...start as [number,number]),p('rock',enemy,4,4)],side),move(start[0],start[1],own[0],own[1])).winner).toBeNull();
    }
  });
  it('cannot enter a guarded base unless the attacker can capture its defender',()=>{
    for(const defender of ['rock','paper','scissors']) {
      const s=game([p('rock','white',1,7),p(defender,'black',0,8)]);
      expect(hooks.onMove(s,move(1,7,0,8),project).valid).toBe(defender==='scissors');
    }
  });
  it('wins by elimination or immobilization',()=>{
    const eliminated=play(game([p('rock','white',4,4),p('scissors','black',4,5)]),move(4,4,4,5));
    expect(eliminated.winner).toBe('white');expect(eliminated.data.reason).toBe('吃光对方棋子');
    const trapped=game([p('rock','black',0,0),p('paper','white',0,1),p('paper','white',1,0),p('paper','white',2,2)],'white',199);
    const next=play(trapped,move(2,2,1,1));
    expect(next.winner).toBe('white');expect(next.data.reason).toBe('对方无合法走法');
  });
  it('draws at 200 individual non-capturing moves, resets on capture and restores counters with snapshots',()=>{
    const before=game([p('rock','white',4,4),p('scissors','black',3,5),p('paper','black',0,0)],'white',198);
    const next=play(before,move(4,4,5,4));expect(next.winner).toBeNull();expect(next.data.quietPlies).toBe(199);
    const draw=play(next,move(0,0,0,1));expect(draw.winner).toBe('draw');expect(legal(draw)).toEqual([]);
    expect(hooks.evaluate(draw,'white')).toBe(0);
    expect(play({...before,data:{quietPlies:199}},move(4,4,3,5)).winner).toBeNull();
    expect(before.data.quietPlies).toBe(198);expect(next.data.quietPlies).toBe(199);
  });
});

describe('Intransitive portable UI and local AI',()=>{
  it('exposes legal hints, base markers, piece counts and the quiet counter',()=>{
    const s=initialState(project),view=validateCustomView({...hooks.getGameView(s),moves:legal(s)},project);
    expect(view.message).toContain('蓝方行动');expect(view.markers).toHaveLength(2);
    expect(view.details?.[0].text).toContain('石 3 · 布 4 · 剪 3');expect(view.details?.[0].text).toContain('0 / 200');
    expect(view.moves.length).toBeGreaterThan(0);
  });
  it('AI finds immediate base and elimination wins and can defend its base',async()=>{
    const adapter=customAdapter(project);
    for(const s of [game([p('paper','white',1,7),p('rock','black',4,4)]),game([p('rock','white',4,4),p('scissors','black',4,5)])]) {
      const result=await searchGame(adapter,s,{timeMs:1500,maxDepth:2,maxNodes:10000});
      expect(play(s,result.move!).winner).toBe('white');
    }
    const defend=game([p('rock','white',6,0),p('paper','white',4,4),p('scissors','black',7,1)]);
    const result=await searchGame(adapter,defend,{timeMs:1500,maxDepth:2,maxNodes:10000});
    expect(result.move).toEqual(move(6,0,7,1));
  });
  it('AI and human rule hooks agree over a sequence without mutating prior states',async()=>{
    const adapter=customAdapter(project);let s=initialState(project);
    for(let i=0;i<12&&!s.winner;i++) {
      const generated=[];for await(const m of adapter.moves(s,()=>{})) generated.push(m);
      expect(generated).toEqual(legal(s));
      const result=await searchGame(adapter,s,{timeMs:200,maxDepth:1,maxNodes:2000});
      expect(result.move).toBeTruthy();s=play(s,result.move!);
      expect(Number.isFinite(hooks.evaluate(s,'white'))).toBe(true);
      expect(hooks.evaluate(s,'white')+hooks.evaluate(s,'black')).toBe(0);
    }
  });
});
