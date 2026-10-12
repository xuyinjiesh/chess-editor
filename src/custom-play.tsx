import { useEffect, useState } from 'react';
import { runSandbox } from './sandbox';
import { sameCell, type Cell, type GameState, type Move, type Piece, type Project } from './model';

export type CustomView = { message?: string; interaction?: 'move' | 'place' | 'swap'; actions: { label: string; move: Move }[]; moves: Move[] };
const empty: CustomView = { actions: [], moves: [] };
export const neutralPiece = (project: Project, piece: Piece) => !!project.pieceTypes.find(t => t.id === piece.type)?.neutral;

export function validateCustomView(input: unknown, project: Project): CustomView {
  if (!input || typeof input !== 'object') throw new Error('规则界面需返回对象。');
  const raw = input as Record<string, unknown>;
  const cell = (c: Cell) => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.col >= 0 && c.row < project.board.rows && c.col < project.board.cols;
  const move = (m: Move) => {
    if (!m || !cell(m.to) || (m.from !== undefined && !cell(m.from)) || (m.action !== undefined && (typeof m.action !== 'string' || !/^[a-z0-9-]{1,64}$/.test(m.action))) || (m.promotion !== undefined && !['q','r','b','n'].includes(m.promotion))) throw new Error('规则界面返回了无效走法。');
    return { to: { row: m.to.row, col: m.to.col }, ...(m.from ? { from: { row: m.from.row, col: m.from.col } } : {}), ...(m.action ? { action: m.action } : {}), ...(m.promotion ? { promotion: m.promotion } : {}) };
  };
  if (raw.message !== undefined && (typeof raw.message !== 'string' || raw.message.length > 1000)) throw new Error('规则提示需为不超过 1,000 字的文本。');
  if (raw.interaction !== undefined && !['move','place','swap'].includes(String(raw.interaction))) throw new Error('规则交互模式无效。');
  if (!Array.isArray(raw.moves) || raw.moves.length > 10000 || !Array.isArray(raw.actions) || raw.actions.length > 16) throw new Error('规则提示或操作数量超出限制。');
  const actions = raw.actions.map((a: { label: string; move: Move }) => {
    if (!a || typeof a.label !== 'string' || !a.label.trim() || a.label.length > 60) throw new Error('规则操作需要简短的文本名称。');
    return { label: a.label, move: move(a.move) };
  });
  return { message: raw.message as string | undefined, interaction: raw.interaction as CustomView['interaction'], actions, moves: raw.moves.map(move) };
}

// Rule-provided prompts and moves run in the same opaque worker as onMove.
// Viewing a gallery card or editing the design never executes this code.
export function useCustomPlay(project: Project, state: GameState, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ project: Project; state: GameState; view: CustomView; error: string }>();
  useEffect(() => {
    if (!enabled || project.rules.engine !== 'custom' || state.winner) return;
    const controller = new AbortController();
    const code = `onmessage = async event => { try {
      const {project,state} = event.data;
      const hooks = new Function(project.rules.code + '\\n;return {view:typeof getGameView === "function" ? getGameView : null,moves:typeof getLegalMoves === "function" ? getLegalMoves : null};')();
      const view = hooks.view ? await hooks.view(structuredClone(state),structuredClone(project)) : {};
      const moves = hooks.moves ? await hooks.moves(structuredClone(state),structuredClone(project)) : [];
      postMessage({result:{...view,actions:view.actions || [],moves}});
    } catch(error) { postMessage({error:String(error.message || error)}); } };`;
    runSandbox<unknown>(code, { project, state }, 2000, controller.signal)
      .then(raw => { const view = validateCustomView(raw, project); if (!controller.signal.aborted) setLoaded({ project, state, view, error: '' }); })
      .catch(error => { if (!controller.signal.aborted) setLoaded({ project, state, view: empty, error: error.message }); });
    return () => controller.abort();
  }, [project, state, enabled]);
  const current = enabled && loaded?.project === project && loaded.state === state && !state.winner ? loaded : undefined;
  const view = current?.view || empty;
  function click(cell: Cell, selected: Cell | undefined, select: (cell: Cell | undefined) => void, submit: (move: Move) => void) {
    if (view.interaction === 'place') { submit({ to: cell }); return; }
    const piece = state.pieces.find(p => sameCell(p, cell));
    if (piece && !neutralPiece(project, piece) && piece.side === state.turn) {
      if (selected && !sameCell(selected, cell) && (view.interaction === 'swap' || view.moves.some(m => m.from && sameCell(m.from, selected) && sameCell(m.to, cell)))) submit({ from: selected, to: cell });
      else select(selected && sameCell(selected, cell) ? undefined : cell);
    } else if (selected) submit({ from: selected, to: cell });
    else if (!piece || !neutralPiece(project, piece)) submit({ to: cell });
  }
  return {
    view, error: current?.error || '', click,
    canDrag: (piece: Piece) => view.interaction !== 'place' && !neutralPiece(project, piece),
    hints: (selected?: Cell) => view.moves.filter(m => !m.action && (selected ? m.from && sameCell(m.from, selected) : view.interaction === 'place' && !m.from)).map(m => m.to),
  };
}

export function CustomRulePanel({ view, error, disabled, onMove }: { view: CustomView; error: string; disabled: boolean; onMove: (move: Move) => void }) {
  if (!view.message && !view.actions.length && !error) return null;
  return <div className="custom-rule-panel" aria-label="当前操作">
    {view.message && <p role="status">{view.message}</p>}
    {view.actions.map((action, i) => <button key={i} className="button primary" disabled={disabled} onClick={() => onMove(action.move)}>{action.label}</button>)}
    {error && <p className="error-box" role="alert">规则提示加载失败：{error}</p>}
  </div>;
}
