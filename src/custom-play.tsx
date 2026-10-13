import { useEffect, useState } from 'react';
import { runSandbox } from './sandbox';
import { sameCell, type Cell, type GameState, type Move, type Piece, type Project } from './model';
import { RuleCards, validateRuleCards, type RuleCard } from './custom-cards';

export type RuleChoice = { action: string; label: string; interaction: 'move' | 'place' };
export type RuleMarker = { cell: Cell; label: string };
export type CustomView = { message?: string; interaction?: 'move' | 'place' | 'swap'; actions: { label: string; move: Move }[]; moves: Move[]; cards?: RuleCard[]; choices?: RuleChoice[]; markers?: RuleMarker[] };
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
  if (raw.choices !== undefined && (!Array.isArray(raw.choices) || raw.choices.length > 16)) throw new Error('规则选项数量超出限制。');
  const choiceIds = new Set<string>();
  const choices = (raw.choices as RuleChoice[] | undefined)?.map(c => {
    if (!c || typeof c.action !== 'string' || !/^[a-z0-9-]{1,64}$/.test(c.action) || choiceIds.has(c.action) || typeof c.label !== 'string' || !c.label.trim() || c.label.length > 60 || !['move','place'].includes(c.interaction)) throw new Error('规则选项无效。');
    choiceIds.add(c.action);
    return {action:c.action,label:c.label,interaction:c.interaction};
  });
  if (raw.markers !== undefined && (!Array.isArray(raw.markers) || raw.markers.length > 576)) throw new Error('棋子标记数量超出限制。');
  const markers = (raw.markers as RuleMarker[] | undefined)?.map(m => {
    if (!m || !cell(m.cell) || typeof m.label !== 'string' || !m.label.trim() || m.label.length > 12) throw new Error('棋子标记无效。');
    return {cell:{row:m.cell.row,col:m.cell.col},label:m.label};
  });
  return { message: raw.message as string | undefined, interaction: raw.interaction as CustomView['interaction'], actions, moves: raw.moves.map(move), cards: validateRuleCards(raw.cards), choices, markers };
}

export function customMoveControls(view: CustomView, selectedAction?: string) {
  const choice = view.choices?.find(c => c.action === selectedAction);
  const interaction = choice?.interaction || view.interaction;
  const moves = view.moves.filter(m => !m.action || m.action === selectedAction);
  return {
    interaction, moves,
    prepareMove: (move: Move): Move => !move.action && selectedAction && (choice || move.from) ? {...move,action:selectedAction} : move,
    hints: (selected?: Cell) => moves.filter(m => interaction === 'place' ? !m.from : selected && m.from && sameCell(m.from,selected)).map(m => m.to),
  };
}

// Rule-provided prompts and moves run in the same opaque worker as onMove.
// Viewing a gallery card or editing the design never executes this code.
export function useCustomPlay(project: Project, state: GameState, enabled: boolean) {
  const [loaded, setLoaded] = useState<{ project: Project; state: GameState; view: CustomView; error: string }>();
  const [selection, setSelection] = useState<{ project: Project; state: GameState; action: string }>();
  useEffect(() => {
    if (!enabled || project.rules.engine !== 'custom') return;
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
  const current = enabled && loaded?.project === project && loaded.state === state ? loaded : undefined;
  const view = current?.view || empty;
  const selectable = [...(view.cards?.filter(c => c.action) || []),...(view.choices || [])];
  const selectedAction = selection?.project === project && selection.state === state && selectable.some(c => c.action === selection.action) ? selection.action : selectable[0]?.action;
  const controls = customMoveControls(view,selectedAction);
  function click(cell: Cell, selected: Cell | undefined, select: (cell: Cell | undefined) => void, submit: (move: Move) => void) {
    if (controls.interaction === 'place') { submit({ to: cell }); return; }
    const piece = state.pieces.find(p => sameCell(p, cell));
    if (piece && !neutralPiece(project, piece) && piece.side === state.turn) {
      if (selected && (view.interaction === 'swap' && !sameCell(selected,cell) || controls.moves.some(m => m.from && sameCell(m.from, selected) && sameCell(m.to, cell)))) submit({ from: selected, to: cell });
      else select(selected && sameCell(selected, cell) ? undefined : cell);
    } else if (selected) submit({ from: selected, to: cell });
    else if (!piece || !neutralPiece(project, piece)) submit({ to: cell });
  }
  return {
    view, error: current?.error || '', click, prepareMove: controls.prepareMove, selectedAction,
    selectAction: (action: string) => setSelection({project,state,action}),
    canDrag: (piece: Piece) => controls.interaction !== 'place' && !neutralPiece(project, piece),
    hints: controls.hints,
  };
}

export function CustomRulePanel({ view, error, disabled, onMove, selectedAction, onSelectAction, flipped }: { view: CustomView; error: string; disabled: boolean; onMove: (move: Move) => void; selectedAction?: string; onSelectAction?: (action: string) => void; flipped?: boolean }) {
  if (!view.message && !view.actions.length && !view.cards?.length && !view.choices?.length && !error) return null;
  return <div className="custom-rule-panel" aria-label="当前操作">
    {view.message && <p role="status">{view.message}</p>}
    {!!view.choices?.length && <div className="rule-choices" role="group" aria-label="选择操作">{view.choices.map(choice => <button key={choice.action} className="button" aria-pressed={selectedAction === choice.action} disabled={disabled} onClick={() => onSelectAction?.(choice.action)}>{choice.label}</button>)}</div>}
    {!!view.cards?.length && <RuleCards cards={view.cards} selectedAction={selectedAction} disabled={disabled} onSelect={onSelectAction} flipped={flipped}/>}
    {view.actions.map((action, i) => <button key={i} className="button primary" disabled={disabled} onClick={() => onMove(action.move)}>{action.label}</button>)}
    {error && <p className="error-box" role="alert">规则提示加载失败：{error}</p>}
  </div>;
}
