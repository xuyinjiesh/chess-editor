import { coord, otherSide, sameCell, type Cell, type GameState, type Move, type Piece, type Project, type Side } from './model';

const at = (pieces: Piece[], cell: Cell) => pieces.find(p => sameCell(p, cell));
const inside = ({ row, col }: Cell) => row >= 0 && row < 10 && col >= 0 && col < 9;
const palace = (side: Side, { row, col }: Cell) => col >= 3 && col <= 5 && (side === 'white' ? row >= 7 && row <= 9 : row >= 0 && row <= 2);
const home = (side: Side, row: number) => side === 'white' ? row >= 5 : row <= 4;

function screens(pieces: Piece[], from: Cell, to: Cell): number {
  if (from.row !== to.row && from.col !== to.col) return -1;
  const dr = Math.sign(to.row - from.row), dc = Math.sign(to.col - from.col);
  const distance = Math.max(Math.abs(to.row - from.row), Math.abs(to.col - from.col));
  let count = 0;
  for (let n = 1; n < distance; n++) if (at(pieces, { row: from.row + dr * n, col: from.col + dc * n })) count++;
  return count;
}

// Piece geometry is shared by check detection and legal move generation.
// An occupied destination is essential to the cannon's capture semantics.
function reachable(pieces: Piece[], piece: Piece, to: Cell): boolean {
  if (!inside(to) || sameCell(piece, to)) return false;
  const target = at(pieces, to);
  if (target?.side === piece.side) return false;
  const dr = to.row - piece.row, dc = to.col - piece.col, ar = Math.abs(dr), ac = Math.abs(dc);
  switch (piece.type) {
    case 'k':
      if (target?.type === 'k' && dc === 0 && screens(pieces, piece, to) === 0) return true;
      return ar + ac === 1 && palace(piece.side, to);
    case 'a':
      return ar === 1 && ac === 1 && palace(piece.side, to);
    case 'b':
      return ar === 2 && ac === 2 && home(piece.side, to.row) && !at(pieces, { row: piece.row + dr / 2, col: piece.col + dc / 2 });
    case 'n': {
      if (!((ar === 2 && ac === 1) || (ar === 1 && ac === 2))) return false;
      const leg = ar === 2 ? { row: piece.row + Math.sign(dr), col: piece.col } : { row: piece.row, col: piece.col + Math.sign(dc) };
      return !at(pieces, leg);
    }
    case 'r':
      return screens(pieces, piece, to) === 0;
    case 'c':
      return screens(pieces, piece, to) === (target ? 1 : 0);
    case 'p':
      return (dc === 0 && dr === (piece.side === 'white' ? -1 : 1)) || (!home(piece.side, piece.row) && dr === 0 && ac === 1);
    default:
      return false;
  }
}

export function xiangqiInCheck(pieces: Piece[], side: Side): boolean {
  const general = pieces.find(p => p.type === 'k' && p.side === side);
  return !general || pieces.some(p => p.side !== side && reachable(pieces, p, general));
}

const movedPieces = (pieces: Piece[], piece: Piece, to: Cell) => pieces.filter(p => !sameCell(p, to)).map(p => p.id === piece.id ? { ...p, ...to } : p);

export function xiangqiLegalMoves(pieces: Piece[], side: Side, from?: Cell): Move[] {
  const moves: Move[] = [];
  for (const piece of pieces) {
    if (piece.side !== side || (from && !sameCell(piece, from))) continue;
    for (let row = 0; row < 10; row++) for (let col = 0; col < 9; col++) {
      const to = { row, col };
      if (reachable(pieces, piece, to) && !xiangqiInCheck(movedPieces(pieces, piece, to), side)) {
        moves.push({ from: { row: piece.row, col: piece.col }, to });
      }
    }
  }
  return moves;
}

export function validateXiangqiSetup(project: Project) {
  if (project.board.rows !== 10 || project.board.cols !== 9) throw new Error('中国象棋需要 9 列 × 10 行棋盘。');
  if (project.pieces.some(p => !['k', 'a', 'b', 'n', 'r', 'c', 'p'].includes(p.type))) throw new Error('中国象棋规则仅支持将帅、士仕、象相、马、车、炮、兵卒。');
  for (const side of ['white', 'black'] as const) {
    const own = project.pieces.filter(p => p.side === side);
    if (own.filter(p => p.type === 'k').length !== 1) throw new Error('中国象棋初始布局需要双方各一枚将 / 帅。');
    if (own.some(p => (p.type === 'k' || p.type === 'a') && !palace(side, p))) throw new Error('将帅和士仕需要放在己方九宫内。');
    if (own.some(p => p.type === 'b' && !home(side, p.row))) throw new Error('象 / 相不能放在河界另一侧。');
  }
  const red = project.pieces.find(p => p.type === 'k' && p.side === 'white')!;
  const black = project.pieces.find(p => p.type === 'k' && p.side === 'black')!;
  if (red.col === black.col && screens(project.pieces, red, black) === 0) throw new Error('初始布局不能让将帅直接照面。');
}

export function applyXiangqiMove(state: GameState, move: Move): { pieces: Piece[]; turn: Side; winner: Side | null; text: string; check: boolean } {
  const piece = move.from && at(state.pieces, move.from);
  if (!piece || piece.side !== state.turn) throw new Error('请先选择当前阵营的棋子。');
  if (!reachable(state.pieces, piece, move.to)) throw new Error('这一步不符合中国象棋走法，请检查蹩马腿、塞象眼、炮架或九宫河界。');
  const pieces = movedPieces(state.pieces, piece, move.to);
  if (xiangqiInCheck(pieces, state.turn)) throw new Error('这一步会使己方将帅受攻，或造成将帅照面。');
  const turn = otherSide(state.turn);
  const check = xiangqiInCheck(pieces, turn);
  // In Xiangqi both checkmate and stalemate are losses for the side to move.
  const winner = !pieces.some(p => p.type === 'k' && p.side === turn) || xiangqiLegalMoves(pieces, turn).length === 0 ? state.turn : null;
  return { pieces, turn, winner, check, text: `${coord(piece, 10)} → ${coord(move.to, 10)}${winner ? ' · 胜' : check ? ' · 将军' : ''}` };
}
