import type { GameState, Move, Side } from './model';

export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type SearchLimits = { timeMs: number; maxDepth: number; maxNodes: number };
export type SearchResult = { move: Move | null; depth: number; nodes: number; elapsedMs: number };
export interface SearchAdapter {
  moves(state: GameState, check: () => void): AsyncIterable<Move>;
  play(state: GameState, move: Move): Promise<GameState>;
  evaluate(state: GameState, side: Side): number | Promise<number>;
}
export const BOT_LIMITS: Record<BotDifficulty, SearchLimits> = {
  easy: { timeMs: 250, maxDepth: 2, maxNodes: 3000 },
  normal: { timeMs: 900, maxDepth: 4, maxNodes: 20000 },
  hard: { timeMs: 2200, maxDepth: 8, maxNodes: 80000 },
};

// Keep this function self-contained: the custom-rule sandbox receives its source.
// Scores always use the root player's perspective; extra turns must not negate it.
export async function searchGame(adapter: SearchAdapter, initial: GameState, limits: SearchLimits): Promise<SearchResult> {
  const started = performance.now(), expired = Symbol('search deadline'), side = initial.turn;
  let nodes = 0, depth = 0, bestMove: Move | null = null;
  const check = () => { if (performance.now() - started >= limits.timeMs || nodes >= limits.maxNodes) throw expired; };
  const score = async (state: GameState, ply: number) => {
    if (state.winner) return state.winner === 'draw' ? 0 : (state.winner === side ? 1 : -1) * (1000000 - ply);
    const value = await adapter.evaluate(state, side);
    if (!Number.isFinite(value)) throw new Error('evaluate 必须返回有限数值。');
    return Math.max(-100000, Math.min(100000, value));
  };
  async function visit(state: GameState, remaining: number, alpha: number, beta: number, ply: number): Promise<number> {
    check(); nodes++;
    if (state.winner || remaining === 0) return score(state, ply);
    const maximizing = state.turn === side;
    let value = maximizing ? -Infinity : Infinity, found = false;
    for await (const move of adapter.moves(state, check)) {
      check(); found = true;
      const child = await adapter.play(state, move);
      const result = await visit(child, remaining - 1, alpha, beta, ply + 1);
      value = maximizing ? Math.max(value, result) : Math.min(value, result);
      if (maximizing) alpha = Math.max(alpha, value); else beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    // Custom games must report their own terminal outcome; never invent a loss.
    return found ? value : score(state, ply);
  }
  if (!initial.winner) {
    try {
      const roots: { move: Move; state: GameState; value: number }[] = [];
      let fallbackScore = -Infinity;
      // Establish a legal fallback and finish a one-ply pass before deeper search.
      for await (const move of adapter.moves(initial, check)) {
        check();
        const state = await adapter.play(initial, move);
        nodes++;
        if (!bestMove) bestMove = move;
        const value = await score(state, 1);
        roots.push({ move, state, value });
        if (value > fallbackScore) { fallbackScore = value; bestMove = move; }
        if (value >= 999999) break;
      }
      if (roots.length) {
        depth = 1;
        roots.sort((a, b) => b.value - a.value);
        bestMove = roots[0].move;
        for (let target = 2; target <= limits.maxDepth && roots[0].value < 999999; target++) {
          let alpha = -Infinity, choice = roots[0].move;
          const values: number[] = [];
          for (const root of roots) {
            const value = await visit(root.state, target - 1, alpha, Infinity, 1);
            values.push(value);
            if (value > alpha) { alpha = value; choice = root.move; }
          }
          // An interrupted iteration cannot replace the last fully searched result.
          bestMove = choice; depth = target;
          roots.forEach((root, i) => { root.value = values[i]; });
          roots.sort((a, b) => b.value - a.value);
          if (Math.abs(alpha) > 900000) break;
        }
      }
    } catch (error) {
      if (error !== expired) throw error;
      if (!bestMove) throw new Error('思考时间内未找到合法走法；自定义规则可添加 getLegalMoves，或提高难度后重试。');
    }
  }
  return { move: bestMove, depth, nodes, elapsedMs: Math.round(performance.now() - started) };
}
