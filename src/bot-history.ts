import type { GameState, Side } from './model';

// In human-v-computer games rewind/replay an entire response (including extra
// turns), so undo returns control to the human instead of triggering the same AI.
export function navigateGameHistory(state: GameState, past: GameState[], future: GameState[], redo: boolean, humanSide?: Side): GameState | undefined {
  const from = redo ? future : past, to = redo ? past : future;
  if (!from.length) return undefined;
  if (!redo && humanSide && !from.some(s => s.turn === humanSide && !s.winner)) return undefined;
  let next = state;
  do {
    to.push(structuredClone(next)); next = from.pop()!;
  } while (humanSide && next.turn !== humanSide && !next.winner && from.length);
  return next;
}
