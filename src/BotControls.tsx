import { useState } from 'react';
import { LoaderCircle, Monitor, Play, Square } from 'lucide-react';
import { sideLabel, type Project, type Side } from './model';
import type { BotDifficulty, SearchResult } from './bot-search';
import { Modal } from './components';
import './bot.css';

export type BotOptions = { mode: 'human' | 'watch'; humanSide: Side; difficulty: BotDifficulty };
export const DEFAULT_BOT: BotOptions = { mode: 'human', humanSide: 'white', difficulty: 'normal' };
export const botControlsSide = (options: BotOptions | null, side: Side) => !!options && (options.mode === 'watch' || options.humanSide !== side);

export function BotSetup({ project, options, onClose, onStart }: { project: Project; options: BotOptions | null; onClose: () => void; onStart: (options: BotOptions) => void }) {
  const [draft, setDraft] = useState<BotOptions>(options || { ...DEFAULT_BOT, humanSide: project.rules.firstTurn });
  return <Modal title="和电脑下一盘" subtitle="本地引擎在浏览器中思考，无需配置模型或 API Key。" onClose={onClose}>
    <div className="modal-body bot-setup">
      <label className="field-label">对弈方式<select value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as BotOptions['mode'] })}><option value="human">我与电脑对弈</option><option value="watch">观看电脑自我对弈</option></select></label>
      {draft.mode === 'human' && <label className="field-label">我执哪方<select value={draft.humanSide} onChange={e => setDraft({ ...draft, humanSide: e.target.value as Side })}>{(['white', 'black'] as const).map(side => <option key={side} value={side}>{sideLabel(project, side)} · {side === project.rules.firstTurn ? '先手' : '后手'}</option>)}</select></label>}
      <label className="field-label">电脑难度<select value={draft.difficulty} onChange={e => setDraft({ ...draft, difficulty: e.target.value as BotDifficulty })}><option value="easy">入门 · 最多思考 0.25 秒</option><option value="normal">标准 · 最多思考 0.9 秒</option><option value="hard">挑战 · 最多思考 2.2 秒</option></select></label>
      <p className="muted small">难度决定搜索时间和深度，实际棋力取决于规则复杂度与设备性能。</p>
      {project.rules.engine === 'custom' && <div className="info-note"><Monitor size={18}/><p>支持自定义双人明棋。旧规则会自动尝试合法走法；复杂规则建议让 AI 助手补齐走法生成和局面评价。规则修改后需重新开始对局。</p></div>}
      <button className="button primary full" onClick={() => onStart(draft)}><Play size={16}/>开始新的人机对局</button>
    </div>
  </Modal>;
}

export function BotStatus({ options, thinking, paused, error, stats, onPause, onSettings, onManual }: {
  options: BotOptions; thinking: boolean; paused: boolean; error: string; stats: SearchResult | null;
  onPause: () => void; onSettings: () => void; onManual: () => void;
}) {
  return <section className="bot-status" aria-label="本地 AI 对弈">
    <div className="bot-status-heading"><Monitor size={17}/><strong>{options.mode === 'watch' ? '电脑自我对弈' : '本地人机对弈'}</strong><span>{{ easy: '入门', normal: '标准', hard: '挑战' }[options.difficulty]}</span></div>
    <p role="status">{thinking ? <><LoaderCircle size={13} className="spin"/>电脑正在思考…</> : paused ? '电脑已暂停' : '电脑已就绪'}</p>
    {stats && <small>上次搜索 {stats.depth} 层 · {stats.nodes} 个局面 · {stats.elapsedMs} 毫秒</small>}
    {error && <p className="error-box" role="alert">{error}</p>}
    <div className="bot-actions"><button className="button compact" onClick={onPause}>{paused ? <Play size={13}/> : <Square size={13}/>} {paused ? '继续 / 重试' : '暂停电脑'}</button><button className="text-button" onClick={onSettings}>对弈设置</button><button className="text-button" onClick={onManual}>改为双人操作</button></div>
  </section>;
}
