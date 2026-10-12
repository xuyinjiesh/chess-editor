import type { Cell, GameState, Move, Project, RuleResult, Side } from './model';
import type { SearchAdapter } from './bot-search';

// Self-contained so the same tested adapter can run inside the opaque sandbox.
// Every hook gets fresh inputs; rule mutations must not corrupt other branches.
export function customAdapter(project: Project): SearchAdapter {
  const hooks = new Function(project.rules.code + '\n;return { onMove: typeof onMove === "function" ? onMove : null, getLegalMoves: typeof getLegalMoves === "function" ? getLegalMoves : null, evaluate: typeof evaluate === "function" ? evaluate : null };')() as {
    onMove: (state: GameState, move: Move, project: Project) => RuleResult | Promise<RuleResult>;
    getLegalMoves?: (state: GameState, project: Project) => Move[] | Promise<Move[]>;
    evaluate?: (state: GameState, side: Side, project: Project) => number | Promise<number>;
  };
  if (typeof hooks.onMove !== 'function') throw new Error('请定义 onMove(state, move, project)。');
  const validCell = (c: Cell) => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.col >= 0 && c.row < project.board.rows && c.col < project.board.cols;
  const key = (move: Move) => JSON.stringify(move);
  // Retain only the yielded successor, not the entire explored subtree.
  const cache = new WeakMap<GameState, { move: string; state: GameState }>();
  async function simulate(state: GameState, move: Move): Promise<GameState | null> {
    if (move?.action !== undefined && (typeof move.action !== 'string' || !/^[a-z0-9-]{1,64}$/.test(move.action))) throw new Error('getLegalMoves 返回了无效操作。');
    if (!move || !validCell(move.to) || (move.from !== undefined && !validCell(move.from)) || (move.promotion !== undefined && !['q', 'r', 'b', 'n'].includes(move.promotion))) throw new Error('getLegalMoves 返回了无效走法。');
    const result = await hooks.onMove(structuredClone(state), structuredClone(move), structuredClone(project));
    if (!result || typeof result.valid !== 'boolean') throw new Error('onMove 需要返回 { valid: boolean, ... }。');
    if (!result.valid) return null;
    if (result.message !== undefined && typeof result.message !== 'string') throw new Error('规则 message 必须是文本。');
    if (!['white', 'black'].includes(result.turn!) || ![undefined, null, 'white', 'black', 'draw'].includes(result.winner)) throw new Error('规则返回的回合或胜负无效。');
    if (!Array.isArray(result.pieces) || result.pieces.length > project.board.rows * project.board.cols) throw new Error('规则返回的棋子列表无效。');
    const cells = new Set<string>(), ids = new Set<string>();
    for (const piece of result.pieces) {
      const cell = `${piece?.row},${piece?.col}`;
      if (!piece || !validCell(piece) || typeof piece.id !== 'string' || !piece.id || piece.id.length > 120 || ids.has(piece.id) || cells.has(cell) || !['white', 'black'].includes(piece.side) || !project.pieceTypes.some(t => t.id === piece.type)) throw new Error('规则返回了无效、重叠或越界棋子。');
      cells.add(cell); ids.add(piece.id);
    }
    if (result.data !== undefined && (!result.data || typeof result.data !== 'object' || Array.isArray(result.data) || JSON.stringify(result.data).length > 50000)) throw new Error('自定义状态 data 必须是小于 50 KB 的对象。');
    const coord = (c: Cell) => `${String.fromCharCode(97 + c.col)}${project.board.rows - c.row}`;
    return { ...state, pieces: structuredClone(result.pieces), turn: result.turn!, winner: result.winner ?? null, data: structuredClone(result.data || state.data), history: [...state.history, { ...move, side: state.turn, text: result.message || `${move.from ? coord(move.from) + ' → ' : ''}${coord(move.to)}` }] };
  }
  return {
    async *moves(state, check) {
      if (state.winner) return;
      const seen = new Set<string>();
      let supplied: Move[] | undefined;
      if (hooks.getLegalMoves) {
        supplied = await hooks.getLegalMoves(structuredClone(state), structuredClone(project));
        if (!Array.isArray(supplied) || supplied.length > 10000) throw new Error('getLegalMoves 必须返回不超过 10,000 个走法的数组。');
      }
      function* candidates(): Generator<Move> {
        if (supplied) { yield* supplied; return; }
        // Compatibility with older projects: probe placements and piece moves.
        // Custom promotion choices require getLegalMoves to avoid guessing semantics.
        for (let row = 0; row < project.board.rows; row++) for (let col = 0; col < project.board.cols; col++) {
          yield { to: { row, col } };
          for (const piece of state.pieces) yield { from: { row: piece.row, col: piece.col }, to: { row, col } };
        }
      }
      try {
        for (const move of candidates()) {
          check();
          const moveKey = key(move);
          if (seen.has(moveKey)) continue;
          seen.add(moveKey);
          const next = await simulate(state, move);
          if (!next) { if (supplied) throw new Error('getLegalMoves 与 onMove 不一致：生成的走法被规则拒绝。'); continue; }
          cache.set(state, { move: moveKey, state: next });
          yield move;
        }
      } finally { cache.delete(state); }
    },
    async play(state, move) {
      const cached = cache.get(state);
      const result = cached?.move === key(move) ? cached.state : await simulate(state, move);
      if (!result) throw new Error('规则拒绝了 AI 走法。');
      return result;
    },
    async evaluate(state, side) {
      // Unknown games have no assumed piece values; terminal results still guide search.
      return hooks.evaluate ? await hooks.evaluate(structuredClone(state), side, structuredClone(project)) : 0;
    },
  };
}
