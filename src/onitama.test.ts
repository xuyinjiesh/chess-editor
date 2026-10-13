import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { initialState } from './engine';
import { validateProject, type GameState, type Move, type Project, type RuleResult, type Side } from './model';
import { validateCustomView } from './custom-play';
import { validateRuleCards } from './custom-cards';
import { customAdapter } from './bot-custom';
import { searchGame } from './bot-search';
import { galleryCover } from './gallery-cover';
import { filterEntries, validateCatalog } from './gallery-format';

const project = validateProject(JSON.parse(readFileSync(new URL('../public/gallery/onitama/v1/project.json', import.meta.url),'utf8')));
type Card = { id: string; stamp: Side; steps: number[][] };
const hooks = new Function(project.rules.code+'\nreturn {onMove,getLegalMoves,getGameView,evaluate,cards:onitamaCards};')() as {
  onMove: (s: GameState, m: Move, p: Project) => RuleResult;
  getLegalMoves: (s: GameState) => Move[];
  getGameView: (s: GameState) => Record<string, unknown>;
  evaluate: (s: GameState, side: Side) => number;
  cards: Card[];
};
const piece = (type: string, side: Side, row: number, col: number) => ({id:`${side}-${type}-${row}-${col}`,type,side,row,col});
function game(white = ['tiger','dragon'], black = ['frog','rabbit'], shared = 'crab', turn: Side = 'white'): GameState {
  return {...initialState(project),turn,data:{hands:{white,black},shared}};
}
function play(state: GameState, move: Move) {
  const original = structuredClone(state), result = hooks.onMove(state,move,project);
  expect(state).toEqual(original);
  expect(result.valid, result.message).toBe(true);
  validateProject({...project,pieces:result.pieces});
  return {...state,pieces:result.pieces!,turn:result.turn!,winner:result.winner??null,data:result.data!,history:[...state.history,{...move,side:state.turn,text:result.message!}]};
}
const move = (from: number[], to: number[], id: string): Move => ({from:{row:from[0],col:from[1]},to:{row:to[0],col:to[1]},action:'card-'+id});
const deal: Move = {action:'deal-cards',to:{row:2,col:2}};

describe('Onitama gallery and dealing',()=>{
  it('ships a portable attributed project and generated cover, searchable in English',()=>{
    const catalog = validateCatalog(JSON.parse(readFileSync(new URL('../public/gallery/index.json',import.meta.url),'utf8')));
    const entry = catalog.entries.find(e=>e.id==='onitama')!;
    expect(filterEntries(catalog.entries,'Onitama','')).toContainEqual(entry);
    expect(entry.sources?.[0].url).toContain('arcanewonders.com');
    expect(entry.author).toContain('Shimpei Sato');
    expect(project.rules.code).toBe(readFileSync(new URL('../scripts/rules/onitama.js',import.meta.url),'utf8'));
    expect(readFileSync(new URL('../public/gallery/onitama/v1/cover.svg',import.meta.url),'utf8')).toBe(galleryCover(project));
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(project.board).toMatchObject({rows:5,cols:5,pattern:'cells'});
    for (const side of ['white','black']) {
      expect(project.pieces.filter(p=>p.side===side&&p.type==='master')).toHaveLength(1);
      expect(project.pieces.filter(p=>p.side===side&&p.type==='student')).toHaveLength(4);
      expect(project.pieces.find(p=>p.side===side&&p.type==='master')).toMatchObject({col:2,row:side==='white'?4:0});
    }
  });
  it('requires dealing, draws five unique cards from all sixteen, and uses the fifth stamp for either starter',()=>{
    const start = initialState(project);
    expect(hooks.cards).toHaveLength(16);
    expect(new Set(hooks.cards.map(c=>c.id)).size).toBe(16);
    expect(hooks.getLegalMoves(start)).toEqual([deal]);
    expect(hooks.onMove(start,move([4,2],[2,2],'tiger'),project).valid).toBe(false);
    for(const [random,side] of [[0,'white'],[0.999,'black']] as const) {
      const mock = vi.spyOn(Math,'random').mockReturnValue(random);
      let next: GameState;
      try { next=play(start,deal); } finally {mock.mockRestore();}
      const hands = next.data.hands as Record<Side,string[]>;
      expect(new Set([...hands.white,...hands.black,next.data.shared]).size).toBe(5);
      expect(next.turn).toBe(side);
      expect(next.turn).toBe(hooks.cards.find(c=>c.id===next.data.shared)?.stamp);
      expect(hooks.onMove(next,deal,project).valid).toBe(false);
    }
    expect(initialState(project).data).toEqual({});
  });
  it('rejects malformed decks and invalid edited starting boards',()=>{
    const bad=game(['tiger','tiger']);
    expect(hooks.getLegalMoves(bad)).toEqual([]);
    expect(hooks.onMove(bad,move([4,2],[2,2],'tiger'),project).valid).toBe(false);
    expect(hooks.onMove({...initialState(project),pieces:[]},deal,project).valid).toBe(false);
    expect(hooks.onMove(initialState(project),deal,{...project,board:{...project.board,cols:6}}).valid).toBe(false);
  });
});

describe('Onitama movement, card circulation and wins',()=>{
  // Explicit expected patterns, independent of the move generator, facing red.
  const patterns: Record<string,number[][]> = {
    tiger:[[-2,0],[1,0]],dragon:[[-1,-2],[-1,2],[1,-1],[1,1]],frog:[[0,-2],[-1,-1],[1,1]],rabbit:[[0,2],[-1,1],[1,-1]],
    crab:[[0,-2],[-1,0],[0,2]],elephant:[[0,-1],[-1,-1],[-1,1],[0,1]],goose:[[-1,-1],[0,-1],[0,1],[1,1]],rooster:[[-1,1],[0,1],[0,-1],[1,-1]],
    monkey:[[-1,-1],[-1,1],[1,-1],[1,1]],mantis:[[-1,-1],[-1,1],[1,0]],horse:[[-1,0],[0,-1],[1,0]],ox:[[-1,0],[0,1],[1,0]],
    crane:[[-1,0],[1,-1],[1,1]],boar:[[0,-1],[-1,0],[0,1]],eel:[[-1,-1],[1,-1],[0,1]],cobra:[[-1,1],[1,1],[0,-1]],
  };
  it.each(Object.keys(patterns))('implements %s for both sides with a full 180-degree rotation',id=>{
    for(const side of ['white','black'] as const) {
      const others=Object.keys(patterns).filter(k=>k!==id).slice(0,4);
      const state=game([id,others[0]],[others[1],others[2]],others[3],side);
      if(side==='black') (state.data.hands as Record<Side,string[]>).black=[id,others[1]],(state.data.hands as Record<Side,string[]>).white=[others[0],others[2]];
      state.pieces=[piece('master',side,2,2)];
      const actual=hooks.getLegalMoves(state).filter(m=>m.action==='card-'+id).map(m=>[m.to.row,m.to.col]);
      const direction=side==='white'?1:-1;
      expect(actual).toEqual(expect.arrayContaining(patterns[id].map(([dr,dc])=>[2+dr*direction,2+dc*direction])));
      expect(actual).toHaveLength(patterns[id].length);
      for(const candidate of hooks.getLegalMoves(state)) expect(hooks.onMove(state,candidate,project).valid).toBe(true);
    }
  });
  it('jumps over pieces, preserves identity, and swaps only the used card with the reserve',()=>{
    const before=game(), mover=before.pieces.find(p=>p.id==='white-2')!;
    before.pieces.push(piece('student','black',3,2));
    const next=play(before,move([4,2],[2,2],'tiger'));
    expect(next.pieces.find(p=>p.id===mover.id)).toMatchObject({row:2,col:2});
    expect(next.pieces.some(p=>p.row===3&&p.col===2)).toBe(true);
    expect(next.data).toEqual({hands:{white:['crab','dragon'],black:['frog','rabbit']},shared:'tiger'});
    expect(next.turn).toBe('black');
    const reply=play(next,move([0,0],[1,1],'frog'));
    expect(reply.data).toEqual({hands:{white:['crab','dragon'],black:['tiger','rabbit']},shared:'frog'});
  });
  it('rejects off-board, friendly, wrong-side, missing-card and unowned-card moves',()=>{
    const state=game();
    for(const candidate of [move([4,2],[4,1],'dragon'),move([0,2],[2,2],'tiger'),move([4,2],[2,2],'frog'),move([4,2],[1,2],'tiger'),move([4,0],[3,-2],'dragon'),{from:{row:4,col:2},to:{row:2,col:2}}]) expect(hooks.onMove(state,candidate,project).valid).toBe(false);
  });
  it('captures only the landing piece, including master captures by students',()=>{
    const state=game();state.pieces=[piece('student','white',2,2),piece('master','white',4,2),piece('master','black',0,2),piece('student','black',1,2)];
    const next=play(state,move([2,2],[0,2],'tiger'));
    expect(next.winner).toBe('white');
    expect(next.pieces.some(p=>p.side==='black'&&p.type==='master')).toBe(false);
    expect(next.pieces.some(p=>p.row===1&&p.col===2)).toBe(true);
    expect(hooks.getLegalMoves(next)).toEqual([]);
    expect(hooks.onMove(next,move([1,2],[2,1],'frog'),project).valid).toBe(false);
    expect((hooks.getGameView(next).cards as unknown[])).toHaveLength(5);
  });
  it('captures students without ending the game',()=>{
    const state=game();state.pieces.push(piece('student','black',2,2));
    const next=play(state,move([4,2],[2,2],'tiger'));
    expect(next.winner).toBeNull();expect(next.pieces).toHaveLength(10);
    expect(next.history.at(-1)?.text).toContain('吃弟子');
  });
  it('awards temple victory only to the entering master, for both sides',()=>{
    for(const side of ['white','black'] as const) for(const type of ['master','student']) {
      const state=game(['tiger','dragon'],['crab','rabbit'],'monkey',side),from=side==='white'?[2,2]:[3,2],to=side==='white'?[0,2]:[4,2];
      state.pieces=[piece(type,side,from[0],from[1]),piece('master',side==='white'?'black':'white',2,4)];
      expect(play(state,move(from,to,side==='white'?'tiger':'crab')).winner).toBe(type==='master'?side:null);
    }
  });
  it('does not impose chess check or self-check rules on masters',()=>{
    const state=game();state.pieces=[piece('master','white',4,2),piece('master','black',0,2)];
    expect(play(state,move([4,2],[2,2],'tiger')).winner).toBeNull();
  });
  it('requires a pass and an exchange only when neither card offers a move',()=>{
    const state=game(['crab','boar'],['tiger','dragon'],'monkey');
    state.pieces=Array.from({length:5},(_,col)=>piece(col===0?'master':'student','white',0,col));
    state.pieces.push(piece('master','black',4,2));
    expect(hooks.getLegalMoves(state)).toEqual(['crab','boar'].map(id=>({action:'pass-'+id,to:{row:2,col:2}})));
    for(const id of ['crab','boar']) {
      const next=play(state,{action:'pass-'+id,to:{row:2,col:2}});
      expect(next.pieces).toEqual(state.pieces);expect(next.turn).toBe('black');expect(next.data.shared).toBe(id);
    }
    expect(hooks.onMove(game(),{action:'pass-tiger',to:{row:2,col:2}},project).valid).toBe(false);
    (state.data.hands as Record<Side,string[]>).white=['crab','tiger'];
    expect(hooks.onMove(state,{action:'pass-crab',to:{row:2,col:2}},project).valid).toBe(false);
  });
});

describe('Onitama rule interface and local AI',()=>{
  it('returns five bounded diagram cards, with selection actions only on current cards',()=>{
    const state=game(),view=validateCustomView({...hooks.getGameView(state),moves:hooks.getLegalMoves(state)},project);
    expect(view.cards).toHaveLength(5);
    expect(view.cards?.filter(c=>c.action).map(c=>c.id)).toEqual(['tiger','dragon']);
    expect(view.cards?.find(c=>c.id==='frog')?.offsets).toContainEqual({row:0,col:2});
    expect(hooks.getGameView(state)).toEqual(hooks.getGameView(state));
    expect(state.history).toHaveLength(0);
  });
  it('rejects malformed card payloads without accepting arbitrary fields',()=>{
    const card=validateCustomView({...hooks.getGameView(game()),moves:[]},project).cards![0];
    for(const cards of [Array(17).fill(card),[card,card],[{...card,label:1}],[{...card,offsets:[{row:3,col:0}]}],[{...card,offsets:[{row:0,col:0}]}],[{...card,action:'javascript:alert(1)'}],[{...card,stamp:'red'}]]) expect(()=>validateRuleCards(cards)).toThrow();
    expect(validateRuleCards([{...card,html:'<script>'}])[0]).not.toHaveProperty('html');
  });
  it('AI enumerates valid card-specific moves and finds capture and temple wins',async()=>{
    for(const type of ['student','master']) {
      const state=game();state.pieces=[piece(type,'white',2,2),piece('master','black',type==='student'?0:1,type==='student'?2:4)];
      const adapter=customAdapter(project),generated=[];
      for await(const candidate of adapter.moves(state,()=>{})) {generated.push(candidate);expect((await adapter.play(state,candidate)).data.shared).toBe(candidate.action?.slice(5));}
      expect(generated).toEqual(hooks.getLegalMoves(state));
      const result=await searchGame(adapter,state,{timeMs:1500,maxDepth:2,maxNodes:15000});
      expect(play(state,result.move!).winner).toBe('white');
    }
  });
  it('AI can deal, pass, and play through a circulating deck',async()=>{
    const adapter=customAdapter(project);
    let state=initialState(project);
    for(let turn=0;turn<12&&!state.winner;turn++) {
      const result=await searchGame(adapter,state,{timeMs:200,maxDepth:1,maxNodes:2000});
      expect(result.move).toBeTruthy();state=play(state,result.move!);
      expect(Number.isFinite(hooks.evaluate(state,'white'))).toBe(true);
    }
    const blocked=game(['crab','boar'],['tiger','dragon'],'monkey');
    blocked.pieces=Array.from({length:5},(_,col)=>piece(col===0?'master':'student','white',0,col));
    const result=await searchGame(adapter,blocked,{timeMs:200,maxDepth:1,maxNodes:2000});
    expect(result.move?.action).toMatch(/^pass-/);
  });
});
