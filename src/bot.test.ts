import { describe, expect, it } from 'vitest';
import { builtinAdapter, builtinMoves } from './bot-builtin';
import { customAdapter } from './bot-custom';
import { searchGame, type SearchAdapter } from './bot-search';
import { navigateGameHistory } from './bot-history';
import { applyMove, initialState } from './engine';
import { clone, type GameState, type Project, type Side } from './model';
import { TEMPLATES } from './templates';
import { validateSearchResult } from './bot';

const limits = { timeMs: 10000, maxDepth: 3, maxNodes: 10000 };
async function position(index: number, moves: [number, number][]) {
  const project = clone(TEMPLATES[index]); let state = initialState(project);
  for (const [row, col] of moves) state = await applyMove(project, state, { to: { row, col } });
  return { project, state };
}

describe('local computer search', () => {
  it('validates messages returned from the untrusted custom worker', () => {
    for (const result of [null, {}, { move: { to: { row: 99, col: 0 } }, depth: 1, nodes: 1, elapsedMs: 1 }, { move: null, depth: {}, nodes: 1, elapsedMs: 1 }]) expect(() => validateSearchResult(result, TEMPLATES[4])).toThrow('无效');
    expect(validateSearchResult({ move: null, depth: 0, nodes: 0, elapsedMs: 1 }, TEMPLATES[4]).move).toBeNull();
  });
  it('generates legal opening moves for every built-in template', async () => {
    for (const [index, count] of [[0, 20], [1, 225], [2, 4], [3, 9], [5, 44]]) {
      const project = TEMPLATES[index], state = initialState(project), moves = builtinMoves(project, state);
      expect(moves).toHaveLength(count);
      for (const move of moves) await expect(applyMove(project, state, move)).resolves.toBeDefined();
    }
  });
  it('takes an immediate win and blocks an immediate loss in tic tac toe', async () => {
    for (const moves of [[[0, 0], [1, 0], [0, 1], [1, 1]], [[1, 1], [0, 0], [2, 2], [0, 1]]] as [number, number][][]) {
      const { project, state } = await position(3, moves);
      const before = clone(state), result = await searchGame(builtinAdapter(project), state, limits);
      expect(result.move?.to).toEqual({ row: 0, col: 2 });
      expect(state).toEqual(before);
    }
  });
  it('finds a gomoku win and blocks a single-ended four on a large board', async () => {
    const { project, state } = await position(1, [[7, 0], [8, 0], [7, 1], [8, 1], [7, 2], [8, 2], [7, 3], [9, 0]]);
    const win = await searchGame(builtinAdapter(project), state, { ...limits, maxDepth: 2 });
    expect(win.move?.to).toEqual({ row: 7, col: 4 });
    state.turn = 'white';
    const block = await searchGame(builtinAdapter(project), state, { ...limits, maxDepth: 2 });
    expect(block.move?.to).toEqual({ row: 7, col: 4 });
  });
  it('finds checkmate and preserves all four promotion options', async () => {
    const project = TEMPLATES[0]; let state = initialState(project);
    for (const [from, to] of [[{ row: 6, col: 5 }, { row: 5, col: 5 }], [{ row: 1, col: 4 }, { row: 3, col: 4 }], [{ row: 6, col: 6 }, { row: 4, col: 6 }]]) state = await applyMove(project, state, { from, to });
    const result = await searchGame(builtinAdapter(project), state, limits);
    expect((await applyMove(project, state, result.move!)).winner).toBe('black');
    const p = clone(project);
    p.pieces = [{ id: 'w', type: 'k', side: 'white', row: 7, col: 0 }, { id: 'b', type: 'k', side: 'black', row: 0, col: 7 }, { id: 'p', type: 'p', side: 'white', row: 1, col: 4 }];
    expect(builtinMoves(p, initialState(p)).filter(m => m.from?.row === 1).map(m => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
  });
  it('keeps a legal fallback when its node budget ends and skips terminal positions', async () => {
    const project = TEMPLATES[0], state = initialState(project);
    const result = await searchGame(builtinAdapter(project), state, { ...limits, maxNodes: 1 });
    expect(result.depth).toBe(0); expect(result.nodes).toBe(1);
    await expect(applyMove(project, state, result.move!)).resolves.toBeDefined();
    expect((await searchGame(builtinAdapter(project), { ...state, winner: 'draw' }, limits)).move).toBeNull();
  });
  it('uses the actual side to move across extra turns', async () => {
    const state = initialState(TEMPLATES[3]);
    const adapter: SearchAdapter = {
      async *moves(s) { yield { to: { row: 0, col: 0 } }; if (!s.history.length) yield { to: { row: 0, col: 1 } }; },
      async play(s, move) {
        const root = !s.history.length;
        return { ...s, turn: root && move.to.col === 0 ? 'white' : 'black', winner: root ? null : s.turn, history: [...s.history, { ...move, side: s.turn, text: '' }] };
      },
      evaluate: () => 0,
    };
    expect((await searchGame(adapter, state, limits)).move?.to.col).toBe(0);
  });
});

describe('custom game adapters', () => {
  it('works with both explicit hooks and legacy onMove-only projects', async () => {
    for (const hooks of [true, false]) {
      const project = clone(TEMPLATES[4]);
      if (!hooks) project.rules.code = project.rules.code.split('// 人机对弈：')[0];
      project.pieces = [{ id: 'w', type: 'token', side: 'white', row: 2, col: 2 }, { id: 'b', type: 'token', side: 'black', row: 2, col: 3 }];
      const state = initialState(project), adapter = customAdapter(project), result = await searchGame(adapter, state, limits);
      expect((await adapter.play(state, result.move!)).winner).toBe('white');
      expect(state.pieces).toEqual(project.pieces);
    }
  });
  it('supports placement rules and carries data/history into subsequent simulation', async () => {
    const project = clone(TEMPLATES[4]); project.pieces = [];
    project.rules.code = `function onMove(s,m,p){if(m.from||s.pieces.some(x=>x.row===m.to.row&&x.col===m.to.col))return {valid:false};return {valid:true,pieces:[...s.pieces,{id:'p'+s.history.length,type:'token',side:s.turn,...m.to}],turn:s.turn,winner:s.data.count===1?s.turn:null,data:{count:(s.data.count||0)+1}}}`;
    const state = initialState(project), adapter = customAdapter(project);
    const result = await searchGame(adapter, state, { ...limits, maxNodes: 2000 });
    const next = await adapter.play(state, result.move!);
    expect(result.move?.from).toBeUndefined(); expect(next.data.count).toBe(1); expect(next.history).toHaveLength(1);
    expect(state.data).toEqual({});
  });
  it('rejects invalid generated moves, disagreement and nonfinite scores', async () => {
    for (const [code, message] of [
      ['function getLegalMoves(){return [{to:{row:99,col:0}}]}', '无效走法'],
      ['function getLegalMoves(){return [{to:{row:0,col:0}}]}', '不一致'],
      ['function evaluate(){return NaN}', '有限数值'],
    ]) {
      const project = clone(TEMPLATES[4]); project.rules.code += '\n' + code;
      await expect(searchGame(customAdapter(project), initialState(project), limits)).rejects.toThrow(message);
    }
  });
  it('isolates hooks that mutate their input and validates simulation results', async () => {
    const project = clone(TEMPLATES[4]);
    project.rules.code += '\nfunction evaluate(s,side,p){s.pieces.length=0;p.pieces.length=0;return 0;}';
    const before = clone(project), state = initialState(project);
    await searchGame(customAdapter(project), state, { ...limits, maxDepth: 1 });
    expect(project).toEqual(before); expect(state.pieces).toEqual(before.pieces);
    project.rules.code = 'function onMove(s){return {valid:true,pieces:[...s.pieces,s.pieces[0]],turn:"black"}}';
    await expect(searchGame(customAdapter(project), state, limits)).rejects.toThrow('重叠');
  });
  it('serializes the search and adapter without module dependencies', async () => {
    const project: Project = clone(TEMPLATES[4]);
    const isolatedSearch = new Function('project', 'state', 'limits', `return (${searchGame.toString()})((${customAdapter.toString()})(project),state,limits)`);
    expect((await isolatedSearch(project, initialState(project), { ...limits, maxDepth: 1 })).move).toBeTruthy();
  });
});

describe('computer game history', () => {
  const snapshot = (turn: Side, count: number): GameState => ({ ...initialState(TEMPLATES[3]), turn, history: Array.from({ length: count }, () => ({ side: 'white', to: { row: 0, col: 0 }, text: '' })) });
  it('undoes and redoes the human move plus all computer extra turns', () => {
    const past = [snapshot('white', 0), snapshot('black', 1), snapshot('black', 2)], future: GameState[] = [];
    const current = snapshot('white', 3), back = navigateGameHistory(current, past, future, false, 'white')!;
    expect(back.history).toHaveLength(0); expect(past).toHaveLength(0);
    expect(navigateGameHistory(back, past, future, true, 'white')).toEqual(current);
  });
  it('undoes a pending reply and refuses to undo the computer opening alone', () => {
    const current = snapshot('black', 1), past = [snapshot('white', 0)], future: GameState[] = [];
    expect(navigateGameHistory(current, past, future, false, 'white')?.history).toHaveLength(0);
    expect(navigateGameHistory(snapshot('white', 1), [snapshot('black', 0)], [], false, 'white')).toBeUndefined();
  });
});
