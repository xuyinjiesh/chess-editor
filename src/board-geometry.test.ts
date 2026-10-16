import { describe, expect, it } from 'vitest';
import { boardMetrics, cellAtPoint, cellCenter, cellVertices, createBoardTopology, hexGridPath } from './board-geometry';
import { regionGeometry } from './terrain';
import { applyMove, hints, initialState, reversiFlips } from './engine';
import { builtinAdapter } from './bot-builtin';
import { customAdapter } from './bot-custom';
import { searchGame } from './bot-search';
import { TEMPLATES } from './templates';
import { validateProject, type Cell, type Piece, type Project } from './model';
import { galleryCover } from './gallery-cover';

const board = { rows: 7, cols: 7, pattern: 'hex' as const };
const key = (c: Cell) => `${c.row},${c.col}`;
const topology = createBoardTopology(board);
const edges = (path: string) => (path.match(/M/g) || []).length;
function project(engine: Project['rules']['engine'] = 'custom') {
  const p = structuredClone(TEMPLATES[4]);
  p.board = {...p.board,...board}; p.rules.engine = engine; p.rules.winLength = 4;
  p.pieces = [piece({row:3,col:3},'white'),piece({row:6,col:6},'black')];
  return p;
}
function piece(cell: Cell, side: Piece['side']): Piece { return {...cell,side,type:'token',id:`${side}-${key(cell)}`}; }

describe('honeycomb coordinates and geometry', () => {
  it('has exactly six reciprocal, equidistant neighbors on both row parities', () => {
    for (const row of [2,3]) {
      const cell = {row,col:3}, center = cellCenter(board,cell), neighbors = topology.neighbors(cell);
      expect(neighbors).toHaveLength(6);
      for (const neighbor of neighbors) {
        expect(topology.neighbors(neighbor)).toContainEqual(cell);
        expect(topology.distance(cell,neighbor)).toBe(1);
        const other = cellCenter(board,neighbor);
        expect(Math.hypot(other.x-center.x,other.y-center.y)).toBeCloseTo(100);
        const vertices = cellVertices(board,cell), adjacent = cellVertices(board,neighbor);
        expect(vertices.filter(p => adjacent.some(q => Math.hypot(p.x-q.x,p.y-q.y)<1e-8))).toHaveLength(2);
      }
    }
    expect(topology.neighbors({row:0,col:0})).toEqual([{row:0,col:1},{row:1,col:0}]);
    expect(topology.distance({row:2,col:2},{row:3,col:3})).toBe(2);
    expect(topology.distance({row:3,col:2},{row:4,col:3})).toBe(1);
  });
  it('keeps all six rays straight across alternating rows and reverses steps', () => {
    const cell = {row:3,col:3}, start = cellCenter(board,cell);
    for(let direction=0;direction<6;direction++) {
      const one=topology.step(cell,direction), vector=cellCenter(board,one);
      expect(topology.step(one,(direction+3)%6)).toEqual(cell);
      for(let n=1;n<4;n++) {
        const next=topology.step(cell,direction,n), point=cellCenter(board,next);
        expect(point.x-start.x).toBeCloseTo((vector.x-start.x)*n);
        expect(point.y-start.y).toBeCloseTo((vector.y-start.y)*n);
        expect(topology.distance(cell,next)).toBe(n);
      }
      expect(topology.ray(cell,direction).every(topology.contains)).toBe(true);
    }
    expect(topology.fromAxial(topology.toAxial({row:-3,col:-2}))).toEqual({row:-3,col:-2});
    expect(()=>topology.step(cell,6)).toThrow();
  });
  it('matches shortest path distance on the board', () => {
    const start={row:0,col:0}, queue=[start], distances=new Map([[key(start),0]]);
    for(let i=0;i<queue.length;i++) for(const next of topology.neighbors(queue[i])) if(!distances.has(key(next))) {
      distances.set(key(next),distances.get(key(queue[i]))!+1); queue.push(next);
    }
    expect(queue).toHaveLength(49);
    for(const cell of queue) expect(topology.distance(start,cell)).toBe(distances.get(key(cell)));
  });
  it('round trips centers and points near every vertex for sizes 3–24, including true 180 degree flips', () => {
    for (let rows=3;rows<=24;rows++) for(const cols of [3,8,24]) for(const flipped of [false,true]) {
      const b={...board,rows,cols}, metrics=boardMetrics(b);
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const cell={row,col}, center=cellCenter(b,cell,flipped), opposite=cellCenter(b,cell,!flipped);
        expect(cellAtPoint(b,center,flipped)).toEqual(cell);
        expect(center.x+opposite.x).toBeCloseTo(metrics.width);
        expect(center.y+opposite.y).toBeCloseTo(metrics.height);
        for(const vertex of cellVertices(b,cell,flipped)) expect(cellAtPoint(b,{x:center.x+(vertex.x-center.x)*.98,y:center.y+(vertex.y-center.y)*.98},flipped)).toEqual(cell);
      }
    }
  });
  it('rejects gaps along the jagged outline and finds the adjacent hex inside overlapping boxes', () => {
    const metrics=boardMetrics(board);
    for(const flipped of [false,true]) {
      const convert=(x:number,y:number)=>flipped?{x:metrics.width-x,y:metrics.height-y}:{x,y};
      expect(cellAtPoint(board,convert(1,1),flipped)).toBeUndefined();
      expect(cellAtPoint(board,convert(101,1),flipped)).toBeUndefined();
      expect(cellAtPoint(board,convert(51,90),flipped)).toEqual({row:0,col:0});
      expect(cellAtPoint(board,convert(51,115),flipped)).toEqual({row:1,col:0});
      expect(cellAtPoint(board,convert(-1,50),flipped)).toBeUndefined();
    }
    expect(cellAtPoint(board,{x:NaN,y:30})).toBeUndefined();
  });
  it('removes shared region borders, preserves holes, and never duplicates grid edges', () => {
    const center={row:3,col:3}, neighbors=topology.neighbors(center);
    expect(edges(regionGeometry([center,neighbors[0],center],7,7,false,'hex').outline)).toBe(10);
    expect(edges(regionGeometry([center,...neighbors],7,7,false,'hex').outline)).toBe(18);
    expect(edges(regionGeometry(neighbors,7,7,true,'hex').outline)).toBe(24);
    expect(regionGeometry([{row:-1,col:0}],7,7,false,'hex')).toEqual({fill:'',outline:''});
    const all=Array.from({length:49},(_,i)=>({row:Math.floor(i/7),col:i%7}));
    const shared=all.reduce((n,c)=>n+topology.neighbors(c).length,0)/2;
    expect(edges(hexGridPath(board))).toBe(49*6-shared);
  });
  it('preserves the existing square board geometry and eight adjacent moves', () => {
    const square={...board,pattern:'cells' as const}, grid=createBoardTopology(square);
    expect(boardMetrics(square)).toEqual({cellWidth:100,cellHeight:100,width:700,height:700});
    expect(grid.neighbors({row:3,col:3})).toHaveLength(8);
    expect(grid.distance({row:1,col:1},{row:3,col:3})).toBe(2);
    expect(cellAtPoint(square,{x:150,y:250},true)).toEqual({row:4,col:5});
  });
});

describe('honeycomb rules, computer search and portable designs', () => {
  it.each([0,1,2,3,4,5])('recognizes a real straight win in direction %i', async direction => {
    const p=project('gomoku'), start={row:3,col:3};
    p.rules.winLength=3; p.pieces=[piece(start,'white'),piece(topology.step(start,direction),'white')];
    const next=await applyMove(p,initialState(p),{to:topology.step(start,direction,2)});
    expect(next.winner).toBe('white');
  });
  it('does not count a rectangular column zigzag as a hex straight line', async () => {
    const p=project('gomoku'); p.rules.winLength=3;
    p.pieces=[piece({row:1,col:3},'white'),piece({row:2,col:3},'white')];
    expect((await applyMove(p,initialState(p),{to:{row:3,col:3}})).winner).toBeNull();
  });
  it('flips across all six hex rays and excludes rectangular zigzags', async () => {
    const p=project('reversi'), center={row:3,col:3}; p.pieces=[];
    for(let d=0;d<6;d++) p.pieces.push(piece(topology.step(center,d),'black'),piece(topology.step(center,d,2),'white'));
    expect(reversiFlips(p.pieces,3,3,'white',p.board)).toHaveLength(6);
    const state=initialState(p); expect(hints(p,state)).toContainEqual(center);
    const next=await applyMove(p,state,{to:center}); expect(next.pieces.every(p=>p.side==='white')).toBe(true);
    expect(next.winner).toBe('white');
    const zigzag=[piece({row:3,col:3},'black'),piece({row:2,col:3},'white')];
    expect(reversiFlips(zigzag,4,3,'white',p.board)).toHaveLength(0);
    expect(reversiFlips(zigzag,4,3,'white')).toHaveLength(1);
  });
  it('gives custom moves and AI the same six-neighbor and blocked-region semantics', async () => {
    const p=project(), state=initialState(p), adapter=customAdapter(p), moves=[];
    for await(const move of adapter.moves(state,()=>{})) moves.push(move);
    expect(moves.map(m=>m.to)).toEqual(topology.neighbors({row:3,col:3}));
    const blocked=moves[0].to;
    p.regions=[{id:'blocked',name:'禁区',tag:'blocked',color:'#ff0000',cells:[blocked]}];
    const constrained=customAdapter(p), legal=[];
    for await(const move of constrained.moves(state,()=>{})) legal.push(move);
    expect(legal).toHaveLength(5); expect(legal.map(m=>m.to)).not.toContainEqual(blocked);
    await expect(constrained.play(state,{from:{row:3,col:3},to:{row:2,col:2}})).rejects.toThrow('拒绝');
    const result=await searchGame(constrained,state,{timeMs:1000,maxDepth:2,maxNodes:1000});
    expect(legal).toContainEqual(result.move);
  });
  it('finds a forced winning move on a slanted hex axis', async () => {
    const p=project('gomoku'); p.rules.winLength=3;
    p.pieces=[piece({row:0,col:3},'white'),piece({row:1,col:2},'white')];
    const result=await searchGame(builtinAdapter(p),initialState(p),{timeMs:10000,maxDepth:2,maxNodes:3000});
    expect(result.move?.to).toEqual({row:2,col:2});
  });
  it('injects a self-contained topology when serialized outside the application module', async () => {
    const p=project(), isolated = new Function('project','state',`return (${searchGame.toString()})((${customAdapter.toString()})(project, (${createBoardTopology.toString()})(project.board)),state,{timeMs:1000,maxDepth:1,maxNodes:1000});`);
    const result=await isolated(p,initialState(p)); expect(topology.distance(p.pieces[0],result.move.to)).toBe(1);
  });
  it('round trips existing row/col data and produces a staggered vector cover without executing rules', () => {
    const p=project(); p.regions=[{id:'river',name:'河流',tag:'river',color:'#6699aa',cells:topology.neighbors({row:3,col:3})}];
    p.rules.code='throw Error("must not execute")';
    expect(validateProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const svg=galleryCover(p), center=cellCenter(p.board,p.pieces[0]), metrics=boardMetrics(p.board);
    expect(svg).toContain(`viewBox="0 0 ${metrics.width*.44+52} ${metrics.height*.44+52}"`);
    expect(svg).toContain(`cx="${center.x*.44}" cy="${center.y*.44}"`);
    expect(svg.match(/<polygon /g)).toHaveLength(49);
    expect(svg).toContain(regionGeometry(p.regions[0].cells,7,7,false,'hex').fill);
  });
  it('preserves legacy hex designs while preventing standard chess rules from running on them', async () => {
    for(const index of [0,5]) {
      const p=structuredClone(TEMPLATES[index]); p.board.pattern='hex';
      expect(validateProject(p)).toEqual(p);
      expect(()=>initialState(p)).toThrow('六边形');
      await expect(applyMove(p,initialState(TEMPLATES[index]),{to:{row:1,col:1}})).rejects.toThrow('六边形');
    }
  });
});
