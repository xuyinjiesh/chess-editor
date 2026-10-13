import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { CustomRulePanel, useCustomPlay } from './custom-play';
import { Board, PieceIcon } from './Board';
import { BoardLegend } from './BoardTerrain';
import { BotSetup, BotStatus, botControlsSide, type BotOptions } from './BotControls';
import { Modal } from './components';
import { applyMove, hints, initialState } from './engine';
import { chooseBotMove } from './bot';
import { navigateGameHistory } from './bot-history';
import { sameCell, sideLabel, type Cell, type GameState, type Move, type Project } from './model';
import type { SearchResult } from './bot-search';

export function GalleryPlayer({ project, initial, initialBot, onClose }: { project: Project; initial: GameState; initialBot: BotOptions | null; onClose: () => void }) {
  const [state, setState] = useState(initial), [selected, setSelected] = useState<Cell>();
  const [options, setOptions] = useState(initialBot), [paused, setPaused] = useState(false), [thinking, setThinking] = useState(false);
  const [stats, setStats] = useState<SearchResult | null>(null), [error, setError] = useState('');
  const [settings, setSettings] = useState(false), [promotion, setPromotion] = useState<Move | null>(null);
  const current = useRef(state), revision = useRef(0), pending = useRef<AbortController | null>(null), search = useRef<AbortController | null>(null);
  const past = useRef<GameState[]>([]), future = useRef<GameState[]>([]);
  const section = useRef<HTMLElement>(null);
  useLayoutEffect(() => { section.current?.closest('.gallery-page')?.scrollTo(0, 0); window.scrollTo(0, 0); }, []);
  current.current = state;
  const custom = useCustomPlay(project,state,true);
  function cancel() { revision.current++; search.current?.abort(); pending.current?.abort(); setThinking(false); }
  useEffect(() => () => { search.current?.abort(); pending.current?.abort(); }, []);
  async function move(move: Move, expected = revision.current, controller = new AbortController()) {
    if (pending.current || expected !== revision.current || controller.signal.aborted) return;
    const before = current.current; pending.current = controller;
    try {
      const next = await applyMove(project, before, move, controller.signal);
      if (controller.signal.aborted || expected !== revision.current) return;
      past.current.push(before); future.current = []; current.current = next; revision.current++;
      setState(next); setSelected(undefined); setError('');
    } catch (error) { if (!controller.signal.aborted) throw error; }
    finally { if (pending.current === controller) pending.current = null; }
  }
  useEffect(() => {
    if (!options || paused || state.winner || !botControlsSide(options, state.turn)) return;
    const controller = new AbortController(), expected = revision.current;
    search.current = controller; setThinking(true); setError('');
    const timer = setTimeout(() => { void (async () => {
      try {
        const result = await chooseBotMove(project, state, options.difficulty, controller.signal);
        if (controller.signal.aborted || revision.current !== expected) return;
        if (!result.move) throw new Error('当前没有可用走法，电脑已暂停。');
        await move(result.move, expected, controller);
        if (!controller.signal.aborted) setStats(result);
      } catch (error) { if (!controller.signal.aborted) { setError((error as Error).message); setPaused(true); } }
      finally { if (search.current === controller) { search.current = null; setThinking(false); } }
    })(); }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [state, options, paused, project]);
  function reset(nextOptions = options) {
    try {
      const next = initialState(project); cancel(); current.current = next; setState(next); setSelected(undefined); setPromotion(null);
      past.current = []; future.current = []; setOptions(nextOptions); setPaused(false); setError(''); setStats(null); setSettings(false);
    } catch (error) { setError((error as Error).message); }
  }
  function history(redo = false) {
    const next = navigateGameHistory(state, past.current, future.current, redo, options?.mode === 'human' ? options.humanSide : undefined);
    if (!next) return;
    cancel(); if (options?.mode === 'watch') setPaused(true);
    current.current = next; setState(next); setSelected(undefined); setPromotion(null); setError(''); setStats(null);
  }
  function submit(candidate: Move) {
    if (state.winner || botControlsSide(options, state.turn)) return;
    candidate = custom.prepareMove(candidate);
    const piece = candidate.from && state.pieces.find(p => sameCell(p, candidate.from!));
    if (!candidate.promotion && project.rules.engine === 'chess' && piece?.type === 'p' && [0, 7].includes(candidate.to.row)) { setPromotion(candidate); return; }
    void move(candidate).catch(error => setError(error.message));
  }
  function click(cell: Cell) {
    if (state.winner || botControlsSide(options, state.turn)) return;
    if (project.rules.engine === 'custom') { custom.click(cell, selected, setSelected, submit); return; }
    if (['gomoku', 'reversi'].includes(project.rules.engine)) { submit({ to: cell }); return; }
    const piece = state.pieces.find(p => sameCell(p, cell));
    if (piece?.side === state.turn) { setSelected(selected && sameCell(selected, cell) ? undefined : cell); return; }
    if (selected) submit({ from: selected, to: cell });
  }
  return <section ref={section} className="gallery-player" aria-label="作品试玩">
    <div className="gallery-player-top"><button className="text-button" onClick={() => { cancel(); onClose(); }}><ArrowLeft size={16}/>返回作品介绍</button><span>独立试玩 · 编辑器草稿已保留</span></div>
    <div className="gallery-player-layout">
      <div className="gallery-play-board">{custom.view.choices?.length ? <CustomRulePanel view={custom.view} error={custom.error} disabled={!!state.winner || botControlsSide(options,state.turn)} onMove={submit} selectedAction={custom.selectedAction} onSelectAction={custom.selectAction}/> : null}<div className="gallery-turn" role="status">{state.winner ? state.winner === 'draw' ? '本局和棋' : `${sideLabel(project, state.winner)}获胜` : `${sideLabel(project, state.turn)}回合${thinking ? ' · 电脑思考中' : ''}`}</div>
        <Board project={project} pieces={state.pieces} markers={custom.view.markers} selected={selected} hints={project.ui.showHints ? project.rules.engine === 'custom' ? custom.hints(selected) : hints(project, state, selected) : []} lastMove={state.history.at(-1)} onCell={click} onDrop={(from, to) => submit({ from, to })} onPick={setSelected} canDrag={p => !state.winner && p.side === state.turn && custom.canDrag(p) && !botControlsSide(options, state.turn)} tool="play"/>
        <BoardLegend project={project}/>
        <div className="gallery-play-toolbar"><button className="button" onClick={() => history()} disabled={!past.current.length}><Undo2 size={16}/>悔棋</button><button className="button" onClick={() => history(true)} disabled={!future.current.length}><Redo2 size={16}/>重做</button><button className="button" onClick={() => reset()}><RotateCcw size={16}/>重新开始</button></div>
      </div>
      <aside className="gallery-play-info">{!custom.view.choices?.length && <CustomRulePanel view={custom.view} error={custom.error} disabled={!!state.winner || botControlsSide(options,state.turn)} onMove={submit} selectedAction={custom.selectedAction} onSelectAction={custom.selectAction}/>}<h2>{project.name}</h2><p className="gallery-step-count">已走 <strong>{state.history.length}</strong> 步</p>
        {options ? <BotStatus options={options} thinking={thinking} paused={paused} error={error} stats={stats} onPause={() => { cancel(); setPaused(p => !p); setError(''); }} onSettings={() => setSettings(true)} onManual={() => { cancel(); setOptions(null); setError(''); }}/> : <><p>双方可在此设备轮流操作。</p><button className="button primary" onClick={() => setSettings(true)}>开始人机对弈</button>{error && <p className="error-box" role="alert">{error}</p>}</>}
        {project.ui.showHistory && <div className="gallery-moves" aria-label="试玩棋谱">{state.history.length ? state.history.map((m, i) => <div key={i}><span>{i + 1}.</span><span>{sideLabel(project, m.side)}</span><strong>{m.text}</strong></div>) : <p>落子后，棋谱会记录在这里。</p>}</div>}
      </aside>
    </div>
    {settings && <BotSetup project={project} options={options} onClose={() => setSettings(false)} onStart={reset}/>}
    {promotion && <Modal title="选择升变棋子" onClose={() => setPromotion(null)}><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map((p, i) => <button key={p} onClick={() => { setPromotion(null); submit({ ...promotion, promotion: p }); }}><PieceIcon type={p} side={state.turn}/><span>{['后', '车', '象', '马'][i]}</span></button>)}</div></Modal>}
  </section>;
}
