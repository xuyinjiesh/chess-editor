import { Chess } from 'chess.js';
import { applyMove, hints } from './engine';
import { otherSide, sameCell, type Cell, type GameState, type Move, type Project, type Side } from './model';
import { xiangqiLegalMoves } from './xiangqi';
import type { SearchAdapter } from './bot-search';

const values: Record<string, number> = { k: 20000, q: 900, r: 500, b: 330, n: 320, p: 100, a: 200, c: 450 };
const square = (s: string): Cell => ({ row: 8 - Number(s[1]), col: s.charCodeAt(0) - 97 });
const key = (c: Cell) => `${c.row},${c.col}`;

export function builtinMoves(project: Project, state: GameState): Move[] {
  if (state.winner) return [];
  if (project.rules.engine === 'chess') return new Chess(state.fen!).moves({ verbose: true }).map(m => ({
    from: square(m.from), to: square(m.to), ...(m.promotion ? { promotion: m.promotion as Move['promotion'] } : {}),
  }));
  if (project.rules.engine === 'xiangqi') return xiangqiLegalMoves(state.pieces, state.turn);
  if (project.rules.engine === 'reversi') return hints(project, state).map(to => ({ to }));
  const occupied = new Set(state.pieces.map(key)), moves: Move[] = [];
  for (let row = 0; row < project.board.rows; row++) for (let col = 0; col < project.board.cols; col++) {
    if (!occupied.has(key({ row, col }))) moves.push({ to: { row, col } });
  }
  return moves;
}

function linePotential(project: Project, state: GameState, cell: Cell, side: Side): number {
  const board = new Map(state.pieces.map(p => [key(p), p.side]));
  let score = 0;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1, open = 0;
    for (const sign of [-1, 1]) for (let i = 1; i <= project.rules.winLength; i++) {
      const row = cell.row + dr * i * sign, col = cell.col + dc * i * sign;
      if (row < 0 || row >= project.board.rows || col < 0 || col >= project.board.cols) break;
      const occupant = board.get(key({ row, col }));
      if (occupant === side) count++; else { if (!occupant) open++; break; }
    }
    score += count >= project.rules.winLength ? 1000000 : open * Math.pow(8, Math.min(count, 5));
  }
  return score;
}

export function builtinEvaluation(project: Project, state: GameState, side: Side): number {
  const engine = project.rules.engine, { rows, cols } = project.board;
  if (engine === 'gomoku') {
    const board = new Map(state.pieces.map(p => [key(p), p.side])), length = project.rules.winLength;
    let value = 0;
    // Count unblocked winning windows, including lines with gaps.
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const end = { row: row + dr * (length - 1), col: col + dc * (length - 1) };
        if (end.row >= rows || end.col < 0 || end.col >= cols) continue;
        let own = 0, enemy = 0;
        for (let i = 0; i < length; i++) {
          const occupant = board.get(key({ row: row + dr * i, col: col + dc * i }));
          if (occupant === side) own++; else if (occupant) enemy++;
        }
        if (!enemy && own) value += Math.pow(6, Math.min(own, 6));
        if (!own && enemy) value -= Math.pow(6, Math.min(enemy, 6));
      }
    }
    return value;
  }
  return state.pieces.reduce((total, piece) => {
    const center = Math.min(piece.row, rows - 1 - piece.row) + Math.min(piece.col, cols - 1 - piece.col);
    let value = (values[piece.type] || 100) + center * 3;
    if (engine === 'reversi') {
      const edgeRow = piece.row === 0 || piece.row === rows - 1, edgeCol = piece.col === 0 || piece.col === cols - 1;
      const nearRow = piece.row === 1 || piece.row === rows - 2, nearCol = piece.col === 1 || piece.col === cols - 2;
      value = 10 + (edgeRow && edgeCol ? 300 : edgeRow || edgeCol ? 25 : nearRow && nearCol ? -60 : 0);
    }
    if (piece.type === 'p' && engine !== 'reversi') value += (piece.side === 'white' ? rows - 1 - piece.row : piece.row) * 6;
    return total + (piece.side === side ? value : -value);
  }, 0);
}

export function builtinAdapter(project: Project): SearchAdapter {
  return {
    async *moves(state, check) {
      check();
      let moves = builtinMoves(project, state);
      const center = (c: Cell) => Math.abs(c.row - (project.board.rows - 1) / 2) + Math.abs(c.col - (project.board.cols - 1) / 2);
      if (project.rules.engine === 'gomoku') {
        if (project.board.rows * project.board.cols > 25) {
          // Limit distant quiet placements, but retain every adjacent tactical move.
          const nearby = moves.filter(m => state.pieces.some(p => Math.max(Math.abs(p.row - m.to.row), Math.abs(p.col - m.to.col)) <= 2));
          if (nearby.length) moves = nearby;
        }
        const ranked = moves.map(move => ({ move, score: linePotential(project, state, move.to, state.turn) * 1.1 + linePotential(project, state, move.to, otherSide(state.turn)) - center(move.to) }));
        ranked.sort((a, b) => b.score - a.score);
        moves = ranked.map(m => m.move);
      } else {
        const priority = (m: Move) => {
          const captured = state.pieces.find(p => sameCell(p, m.to));
          return (captured ? values[captured.type] || 100 : 0) * 10 + (m.promotion ? values[m.promotion] : 0) - center(m.to);
        };
        moves.sort((a, b) => priority(b) - priority(a));
      }
      for (const move of moves) { check(); yield move; }
    },
    play: (state, move) => applyMove(project, state, move),
    evaluate: (state, side) => builtinEvaluation(project, state, side),
  };
}
