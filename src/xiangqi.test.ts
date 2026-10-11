import { describe, expect, it } from 'vitest';
import { applyMove, hints, initialState } from './engine';
import { clone, pieceSymbol, sideLabel, validateProject, type Cell, type Piece, type Side } from './model';
import { TEMPLATES } from './templates';
import { xiangqiInCheck, xiangqiLegalMoves } from './xiangqi';

const template = TEMPLATES.find(p => p.id === 'xiangqi')!;
const c = (row: number, col: number): Cell => ({ row, col });
const p = (type: string, side: Side, row: number, col: number): Piece => ({ id: `${side}-${type}-${row}-${col}`, type, side, row, col });
function position(...pieces: Piece[]) {
  const project = clone(template);
  project.pieces = [p('k', 'white', 9, 3), p('k', 'black', 0, 5), ...pieces];
  return project;
}

describe('Chinese chess template and persistence', () => {
  it('starts with 32 pieces, red first, and 44 legal opening moves', () => {
    const state = initialState(template);
    expect(state.pieces).toHaveLength(32);
    expect(state.pieces.filter(p => p.side === 'white')).toHaveLength(16);
    expect(state.turn).toBe('white');
    expect(state.data.check).toBe(false);
    expect(xiangqiLegalMoves(state.pieces, state.turn)).toHaveLength(44);
    expect(sideLabel(template, 'white')).toBe('红方');
    expect(pieceSymbol(template.pieceTypes.find(p => p.id === 'k')!, 'black')).toBe('將');
  });

  it('exports and imports board, rules and side-specific symbols', () => {
    expect(validateProject(JSON.parse(JSON.stringify(template)))).toEqual(template);
    expect(() => validateProject({ ...template, board: { ...template.board, rows: 9 } })).toThrow('9 列');
  });

  it('rejects missing generals, pieces outside their palace and facing generals', () => {
    const project = clone(template);
    project.pieces = project.pieces.filter(p => p.type !== 'k');
    expect(() => initialState(project)).toThrow('各一枚');
    project.pieces = [p('k', 'white', 6, 4), p('k', 'black', 0, 3)];
    expect(() => initialState(project)).toThrow('九宫');
    project.pieces = [p('k', 'white', 9, 4), p('k', 'black', 0, 4)];
    expect(() => initialState(project)).toThrow('照面');
  });
});

describe('Chinese chess movement', () => {
  it('moves a red pawn, changes turn, records the move and preserves the old state', async () => {
    const state = initialState(template);
    const next = await applyMove(template, state, { from: c(6, 0), to: c(5, 0) });
    expect(next.turn).toBe('black');
    expect(next.history[0]).toMatchObject({ side: 'white', text: 'a4 → a5' });
    expect(state.pieces.some(p => p.row === 6 && p.col === 0)).toBe(true);
    await expect(applyMove(template, state, { from: c(3, 0), to: c(4, 0) })).rejects.toThrow('当前阵营');
    await expect(applyMove(template, state, { from: c(6, 0), to: c(6, 1) })).rejects.toThrow('走法');
    await expect(applyMove(template, state, { from: c(6, 0), to: c(7, 0) })).rejects.toThrow('走法');
  });

  it.each([['white', 4, 3], ['black', 5, 6]] as const)('allows %s soldiers to move sideways only after crossing the river', async (side, row, forward) => {
    const project = position(p('p', side, row, 2));
    project.rules.firstTurn = side;
    const state = initialState(project);
    expect(hints(project, state, c(row, 2))).toEqual(expect.arrayContaining([c(row, 1), c(row, 3), c(forward, 2)]));
    await expect(applyMove(project, state, { from: c(row, 2), to: c(row * 2 - forward, 2) })).rejects.toThrow();
  });

  it('blocks a horse at its leg in either direction', () => {
    const project = position(p('n', 'white', 6, 2), p('p', 'white', 5, 2), p('p', 'white', 6, 3));
    const moves = hints(project, initialState(project), c(6, 2));
    expect(moves).not.toContainEqual(c(4, 1));
    expect(moves).not.toContainEqual(c(4, 3));
    expect(moves).not.toContainEqual(c(5, 4));
    expect(moves).not.toContainEqual(c(7, 4));
    expect(moves).toContainEqual(c(8, 1));
    expect(moves).toContainEqual(c(5, 0));
  });

  it('blocks an elephant eye and forbids crossing the river', () => {
    const project = position(p('b', 'white', 7, 2), p('p', 'white', 6, 3));
    const moves = hints(project, initialState(project), c(7, 2));
    expect(moves).not.toContainEqual(c(5, 4));
    expect(moves).toContainEqual(c(5, 0));
    const river = position(p('b', 'white', 5, 2));
    expect(hints(river, initialState(river), c(5, 2))).not.toContainEqual(c(3, 4));
    const black = position(p('b', 'black', 4, 2));
    black.rules.firstTurn = 'black';
    expect(hints(black, initialState(black), c(4, 2))).not.toContainEqual(c(6, 4));
  });

  it('keeps the general and advisor inside their palace with distinct movements', () => {
    const project = position(p('a', 'white', 8, 4));
    const state = initialState(project);
    const general = hints(project, state, c(9, 3));
    expect(general).toContainEqual(c(8, 3));
    expect(general).not.toContainEqual(c(9, 2));
    const advisor = hints(project, state, c(8, 4));
    expect(advisor).toContainEqual(c(7, 3));
    expect(advisor).not.toContainEqual(c(7, 4));
    const edge = position(p('a', 'white', 7, 5));
    expect(hints(edge, initialState(edge), c(7, 5))).not.toContainEqual(c(6, 4));
  });

  it('allows a rook to slide but not jump or move diagonally', () => {
    const project = position(p('r', 'white', 5, 0), p('p', 'white', 5, 2), p('p', 'black', 3, 0));
    const moves = hints(project, initialState(project), c(5, 0));
    expect(moves).toContainEqual(c(5, 1));
    expect(moves).toContainEqual(c(3, 0));
    expect(moves).not.toContainEqual(c(5, 3));
    expect(moves).not.toContainEqual(c(4, 1));
  });

  it('requires exactly one screen for a cannon capture and none for an empty destination', async () => {
    const cannon = p('c', 'white', 7, 1), target = p('r', 'black', 2, 1), screen = p('p', 'black', 4, 1);
    const project = position(cannon, target, screen), state = initialState(project);
    const next = await applyMove(project, state, { from: c(7, 1), to: c(2, 1) });
    expect(next.pieces.some(p => p.id === target.id)).toBe(false);
    expect(next.pieces.some(p => p.id === screen.id)).toBe(true);
    expect(hints(project, state, c(7, 1))).toContainEqual(c(6, 1));
    expect(hints(project, state, c(7, 1))).not.toContainEqual(c(3, 1));
    for (const obstacles of [[], [screen, p('p', 'white', 5, 1)]]) {
      const blocked = position(cannon, target, ...obstacles);
      await expect(applyMove(blocked, initialState(blocked), { from: c(7, 1), to: c(2, 1) })).rejects.toThrow('走法');
    }
  });
});

describe('Chinese chess check and game endings', () => {
  it('forbids uncovering facing generals', async () => {
    const project = clone(template);
    project.pieces = [p('k', 'white', 9, 4), p('k', 'black', 0, 4), p('r', 'white', 5, 4)];
    const state = initialState(project);
    expect(hints(project, state, c(5, 4))).not.toContainEqual(c(5, 3));
    await expect(applyMove(project, state, { from: c(5, 4), to: c(5, 3) })).rejects.toThrow('照面');
    expect(hints(project, state, c(5, 4))).toContainEqual(c(4, 4));
  });

  it('forbids exposing the general to a rook attack', async () => {
    const project = clone(template);
    project.pieces = [p('k', 'white', 9, 4), p('k', 'black', 0, 3), p('r', 'black', 2, 4), p('r', 'white', 7, 4)];
    await expect(applyMove(project, initialState(project), { from: c(7, 4), to: c(7, 5) })).rejects.toThrow('受攻');
  });

  it('recognizes cannon and horse checks and requires an answer to check', async () => {
    const project = position(p('r', 'black', 5, 3), p('p', 'white', 6, 0));
    const state = initialState(project);
    expect(state.data.check).toBe(true);
    await expect(applyMove(project, state, { from: c(6, 0), to: c(5, 0) })).rejects.toThrow('受攻');
    expect((await applyMove(project, state, { from: c(9, 3), to: c(9, 4) })).data.check).toBe(false);
    expect(xiangqiInCheck(position(p('c', 'black', 5, 3)).pieces, 'white')).toBe(false);
    expect(xiangqiInCheck(position(p('c', 'black', 5, 3), p('p', 'white', 7, 3)).pieces, 'white')).toBe(true);
    expect(xiangqiInCheck(position(p('n', 'black', 7, 2)).pieces, 'white')).toBe(true);
    expect(xiangqiInCheck(position(p('n', 'black', 7, 2), p('p', 'white', 8, 2)).pieces, 'white')).toBe(false);
  });

  it('counts stalemate as a loss, then recognizes checkmate after a move', async () => {
    const project = clone(template);
    project.pieces = [p('k', 'white', 9, 3), p('k', 'black', 0, 4), p('r', 'white', 1, 3), p('r', 'white', 1, 5)];
    project.rules.firstTurn = 'black';
    const stalemate = initialState(project);
    expect(stalemate.data.check).toBe(false);
    expect(stalemate.winner).toBe('white');
    project.rules.firstTurn = 'white';
    project.pieces.push(p('r', 'white', 2, 0));
    const mate = await applyMove(project, initialState(project), { from: c(2, 0), to: c(2, 4) });
    expect(mate.data.check).toBe(true);
    expect(mate.winner).toBe('white');
    expect(mate.history[0].text).toContain('胜');
    await expect(applyMove(project, mate, { from: c(0, 4), to: c(0, 3) })).rejects.toThrow('结束');
  });
});
