import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBoardTopology, boardMetrics, cellCenter, cellAtPoint, cellVertices, hexBoundaryPath } from './board-geometry';
import { regionGeometry } from './terrain';
import { initialState } from './engine';
import { customAdapter } from './bot-custom';
import { searchGame } from './bot-search';
import { validateCustomView } from './custom-play';
import { galleryCover } from './gallery-cover';
import { validateProject, type Cell, type GameState, type Move, type Piece, type Project, type RuleResult, type Side } from './model';

const project = validateProject(JSON.parse(readFileSync(new URL('../public/gallery/hex/v1/project.json',import.meta.url),'utf8')));
const sized = (n=3): Project => ({...structuredClone(project),board:{...project.board,rows:n,cols:n},regions:[]});
type Hooks = {
  onMove(s:GameState,m:Move,p:Project):RuleResult;
  getLegalMoves(s:GameState,p:Project):Move[];
  getGameView(s:GameState,p:Project):Record<string,unknown>;
  evaluate(s:GameState,side:Side,p:Project):number;
  connection(s:GameState,side:Side,p:Project):Cell[];
};
const hooks = (p:Project):Hooks => new Function('boardTopology',p.rules.code+'\nreturn {onMove,getLegalMoves,getGameView,evaluate,connection:(s,side,p)=>hexPath(hexPosition(s.pieces,hexGraph(p)),side,hexGraph(p))};')(createBoardTopology(p.board));
const stones = (side:Side, cells:number[][]):Piece[] => cells.map(([row,col])=>({id:side+'-'+row+'-'+col,type:'stone',side,row,col}));
const game = (pieces:Piece[], turn:Side='white'):GameState => ({pieces,turn,winner:null,history:[],data:{}});
function play(p:Project,s:GameState,m:Move):GameState {
  const before = structuredClone(s), result = hooks(p).onMove(s,m,p);
  expect(s).toEqual(before);
  expect(result.valid,result.message).toBe(true);
  validateProject({...p,pieces:result.pieces});
  return {...s,pieces:result.pieces!,turn:result.turn!,winner:result.winner??null,data:result.data!,history:[...s.history,{...m,side:s.turn,text:result.message||''}]};
}

describe('portable axial rhombus boards',()=>{
  it('round trips the optional layout and rejects malformed values',()=>{
    expect(validateProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    for(const hexLayout of ['square',1,null,{}]) expect(()=>validateProject({...project,board:{...project.board,hexLayout}})).toThrow('布局');
    const legacy = structuredClone(project); delete legacy.board.hexLayout;
    expect(validateProject(legacy).board.hexLayout).toBeUndefined();
  });
  it('shares six equal edges and reciprocal axial neighbors on every row',()=>{
    const board=project.board, topology=createBoardTopology(board);
    for(const row of [2,3,4]) {
      const c={row,col:3}, center=cellCenter(board,c);
      expect(topology.toAxial(c)).toEqual({q:3,r:row});
      expect(topology.fromAxial({q:3,r:row})).toEqual(c);
      expect(topology.neighbors(c)).toHaveLength(6);
      expect(topology.neighbors(c)).toContainEqual({row:row+1,col:2});
      expect(topology.neighbors(c)).not.toContainEqual({row:row+1,col:4});
      for(const n of topology.neighbors(c)) {
        expect(topology.neighbors(n)).toContainEqual(c);
        expect(topology.distance(c,n)).toBe(1);
        const target=cellCenter(board,n);
        expect(Math.hypot(target.x-center.x,target.y-center.y)).toBeCloseTo(100);
        expect(cellVertices(board,c).filter(v=>cellVertices(board,n).some(w=>Math.hypot(v.x-w.x,v.y-w.y)<1e-8))).toHaveLength(2);
      }
    }
  });
  it('hits only real hexagons at sizes 3–24 in either orientation',()=>{
    for(let rows=3;rows<=24;rows++) for(const cols of [3,11,24]) for(const flipped of [false,true]) {
      const board={...project.board,rows,cols}, metrics=boardMetrics(board);
      expect(metrics.width).toBe((cols+(rows-1)/2)*100);
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const c={row,col}, center=cellCenter(board,c,flipped), opposite=cellCenter(board,c,!flipped);
        expect(cellAtPoint(board,center,flipped)).toEqual(c);
        expect(center.x+opposite.x).toBeCloseTo(metrics.width);
        for(const v of cellVertices(board,c,flipped)) expect(cellAtPoint(board,{x:center.x+(v.x-center.x)*.99,y:center.y+(v.y-center.y)*.99},flipped)).toEqual(c);
      }
      expect(cellAtPoint(board,{x:1,y:1},flipped)).toBeUndefined();
      expect(cellAtPoint(board,{x:metrics.width-1,y:1},flipped)).toBeUndefined();
    }
  });
  it('draws each boundary once and removes shared region edges',()=>{
    const board=sized().board;
    const boundaries=['top','bottom','left','right'].map(side=>hexBoundaryPath(board,side));
    expect(boundaries.every(p=>p.length>0)).toBe(true);
    expect(boundaries.join('').match(/M/g)).toHaveLength(22);
    const region=regionGeometry([{row:0,col:1},{row:1,col:0}],3,3,false,'hex','rhombus');
    expect(region.outline.match(/M/g)).toHaveLength(10);
  });
});

describe('Hex rules and pie opening',()=>{
  it('publishes an empty 11×11 game with consistent rules, colored goals and cover',()=>{
    expect(project.board).toMatchObject({rows:11,cols:11,pattern:'hex',hexLayout:'rhombus'});
    expect(project.pieces).toEqual([]); expect(project.regions).toHaveLength(4);
    expect(hooks(project).getLegalMoves(initialState(project),project)).toHaveLength(121);
    expect(project.rules.code).toBe(readFileSync(new URL('../scripts/rules/hex.js',import.meta.url),'utf8'));
    expect(readFileSync(new URL('../public/gallery/hex/v1/cover.svg',import.meta.url),'utf8')).toBe(galleryCover(project));
    const cover=galleryCover({...project,pieces:[...stones('white',[[0,0]]),...stones('black',[[0,1]])]});
    expect(cover).toContain('fill="'+project.ui.sideColors!.white+'"');
    expect(cover).toContain('fill="'+project.ui.sideColors!.black+'"');
  });
  it('alternates placements, keeps the input immutable and rejects occupied/move/invalid actions',()=>{
    const p=sized(),h=hooks(p); let s=initialState(p);
    s=play(p,s,{to:{row:1,col:1}}); expect(s.turn).toBe('black');
    for(const move of [{to:{row:1,col:1}},{to:{row:3,col:0}},{to:{row:1.5,col:0}},{from:{row:1,col:1},to:{row:0,col:0}},{action:'unknown',to:{row:0,col:0}},{promotion:'q' as const,to:{row:0,col:0}}]) expect(h.onMove(s,move,p).valid).toBe(false);
    s=play(p,s,{to:{row:0,col:0}}); expect(s.turn).toBe('white');
    expect(s.pieces).toHaveLength(2); expect(h.getLegalMoves(s,p)).toHaveLength(7);
    expect(h.getLegalMoves(s,p).every(m=>!m.action)).toBe(true);
  });
  it('offers swapping only after the first move and mirrors the stone without changing player identities',()=>{
    const p=sized(),h=hooks(p),start=initialState(p);
    expect(h.onMove(start,{action:'swap',to:{row:0,col:1}},p).valid).toBe(false);
    const first=play(p,start,{to:{row:0,col:1}}), before=structuredClone(first);
    const raw=h.getGameView(first,p), view=validateCustomView({...raw,moves:h.getLegalMoves(first,p)},p);
    expect(view.actions[0].label).toBe('交换首子');
    expect(view.moves).toHaveLength(9);
    expect(h.onMove(first,{action:'swap',to:{row:1,col:0}},p).valid).toBe(false);
    let swapped=play(p,first,view.actions[0].move);
    expect(first).toEqual(before); expect(swapped.turn).toBe('white');
    expect(swapped.pieces).toEqual([{...first.pieces[0],side:'black',row:1,col:0}]);
    expect(h.getLegalMoves(swapped,p).every(m=>!m.action)).toBe(true);
    expect(h.onMove(swapped,view.actions[0].move,p).valid).toBe(false);
    swapped=play(p,swapped,{to:{row:0,col:1}});
    expect(new Set(swapped.pieces.map(p=>p.id)).size).toBe(2);
    expect(h.getGameView(first,p)).toEqual(raw); // Undo can reuse the earlier state.
    expect(h.getLegalMoves(game(stones('white',[[0,1]]),'black'),p).every(m=>!m.action)).toBe(true);
  });
  it.each(['white','black'] as const)('detects a bent %s connection with no fixed win length',side=>{
    const p=sized(5), path=[[0,3],[1,2],[2,2],[3,1],[4,1]].map(([r,c])=>side==='white'?[r,c]:[c,r]);
    let s=game(stones(side,path.slice(0,-1)),side);
    s=play(p,s,{to:{row:path[4][0],col:path[4][1]}});
    expect(s.winner).toBe(side);
    const h=hooks(p), view=validateCustomView({...h.getGameView(s,p),moves:h.getLegalMoves(s,p)},p);
    expect(view.markers).toHaveLength(5); expect(view.moves).toEqual([]);
    expect(h.onMove(s,{to:{row:0,col:0}},p).valid).toBe(false);
  });
  it('does not connect square diagonals, separated islands or the wrong pair of edges',()=>{
    const p=sized(),h=hooks(p);
    for(const cells of [[[0,0],[1,1],[2,2]],[[0,1],[2,1]],[[1,0],[1,1],[1,2]]]) expect(h.connection(game(stones('white',cells)),'white',p)).toEqual([]);
    expect(h.connection(game(stones('black',[[0,1],[1,1],[2,1]])),'black',p)).toEqual([]);
    expect(h.connection(game([...stones('white',[[0,0],[2,0]]),...stones('black',[[1,0]])]),'white',p)).toEqual([]);
  });
  it('lets corners belong to either goal and never has two winners or a full-board draw',()=>{
    const p=sized(),h=hooks(p);
    expect(h.connection(game(stones('white',[[0,0],[1,0],[2,0]])),'white',p)).toHaveLength(3);
    expect(h.connection(game(stones('black',[[0,0],[0,1],[0,2]])),'black',p)).toHaveLength(3);
    for(let mask=0;mask<512;mask++) {
      const s=game(Array.from({length:9},(_,i)=>stones(mask&(1<<i)?'white':'black',[[Math.floor(i/3),i%3]])[0]));
      expect(Number(h.connection(s,'white',p).length>0)+Number(h.connection(s,'black',p).length>0)).toBe(1);
    }
  });
  it('enumerates only legal moves throughout deterministic complete games',()=>{
    const p=sized(),h=hooks(p);
    for(let seed=1;seed<=32;seed++) {
      let random=seed,s=initialState(p);
      for(let turn=0;turn<10&&!s.winner;turn++) {
        const moves=h.getLegalMoves(s,p); expect(moves.length).toBeGreaterThan(0);
        for(const m of moves) expect(h.onMove(s,m,p).valid).toBe(true);
        random=(Math.imul(random,1664525)+1013904223)>>>0;
        s=play(p,s,moves[random%moves.length]);
      }
      expect(['white','black']).toContain(s.winner);
    }
  });
  it('reports an actionable error for incompatible edited boards',()=>{
    for(const p of [{...sized(),board:{...sized().board,hexLayout:'offset' as const}},{...sized(),board:{...sized().board,cols:4}},{...sized(),rules:{...project.rules,firstTurn:'black' as const}}]) {
      const h=hooks(p),s=initialState(p);
      expect(h.getLegalMoves(s,p)).toEqual([]); expect(h.getGameView(s,p).message).toBeTruthy();
      expect(h.onMove(s,{to:{row:1,col:1}},p).valid).toBe(false);
    }
  });
});

describe('Hex computer play',()=>{
  it('takes an immediate win and blocks the opponent’s one-move connection',async()=>{
    const p=sized();
    const win=game([...stones('white',[[0,1],[2,1]]),...stones('black',[[0,2],[2,0]])]);
    const winning=await searchGame(customAdapter(p),win,{timeMs:1000,maxDepth:2,maxNodes:3000});
    expect(winning.move?.to).toEqual({row:1,col:1});
    expect(play(p,win,winning.move!).winner).toBe('white');
    const block=game([...stones('black',[[1,0],[1,2]]),...stones('white',[[0,0],[2,2]])]);
    const defense=await searchGame(customAdapter(p),block,{timeMs:1000,maxDepth:2,maxNodes:3000});
    expect(defense.move?.to).toEqual({row:1,col:1});
  });
  it('generates a legal opening and swap reply within normal search limits',async()=>{
    const start=initialState(project);
    const opening=await searchGame(customAdapter(project),start,{timeMs:900,maxDepth:2,maxNodes:3000});
    expect(opening.move).toBeTruthy(); const first=play(project,start,opening.move!);
    const reply=await searchGame(customAdapter(project),first,{timeMs:900,maxDepth:2,maxNodes:3000});
    expect(reply.move).toBeTruthy(); expect(play(project,first,reply.move!).turn).toBe('white');
    expect(hooks(project).evaluate(first,'white',project)).toBe(-hooks(project).evaluate(first,'black',project));
  });
});
