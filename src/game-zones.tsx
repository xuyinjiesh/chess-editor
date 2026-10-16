import { useId, type CSSProperties, type ReactNode } from 'react';
import { pieceSymbol, sideLabel, type Cell, type Move, type Project, type Side } from './model';
import { PieceIcon } from './Board';
import type { RuleCard } from './custom-cards';
import { validateRuleViewMove } from './rule-view-move';

export type ZoneItem = {
  id: string; label: string; subtitle?: string; description?: string; symbol?: string;
  piece?: { type: string; side: Side };
  count?: number; offsets?: Cell[]; stamp?: Side; caption?: string;
  action?: string; interaction?: 'move' | 'place'; move?: Move; disabled?: boolean;
  skillType?: 'instant' | 'trick' | 'persistent';
};
export type GameZone = {
  id: string; label: string; owner: Side | 'shared';
  description?: string; emptyLabel?: string; items: ZoneItem[];
  kind?: 'hand' | 'offer';
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function boundedText(value: unknown, limit: number, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > limit || required && !value.trim()) throw new Error('对局区域需要有效的简短文本。');
  return value;
}

// All content crossing the rule sandbox boundary is data, never HTML or CSS.
export function validateGameZones(input: unknown, project?: Pick<Project,'pieceTypes' | 'board'>): GameZone[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 8) throw new Error('最多显示 8 个对局区域。');
  const ids = new Set<string>(), actions = new Set<string>();
  let total = 0;
  return input.map(zone => {
    if (!object(zone)) throw new Error('对局区域无效。');
    const id = boundedText(zone.id,64,true)!, label = boundedText(zone.label,60,true)!;
    if (ids.has(id) || !['white','black','shared'].includes(String(zone.owner))) throw new Error('对局区域标识重复或归属无效。');
    ids.add(id);
    if (zone.kind !== undefined && !['hand','offer'].includes(String(zone.kind))) throw new Error('对局区域类型无效。');
    if (!Array.isArray(zone.items) || zone.items.length > 64 || (total += zone.items.length) > 128) throw new Error('单个区域最多 64 项，所有区域合计最多 128 项。');
    const itemIds = new Set<string>();
    const items = zone.items.map(item => {
      if (!object(item)) throw new Error('区域项目无效。');
      const itemId = boundedText(item.id,64,true)!, itemLabel = boundedText(item.label,60,true)!;
      if (itemIds.has(itemId)) throw new Error('同一区域的项目标识不能重复。');
      itemIds.add(itemId);
      if (item.action !== undefined && (typeof item.action !== 'string' || !/^[a-z0-9-]{1,64}$/.test(item.action) || actions.has(item.action))) throw new Error('区域操作名称无效或重复。');
      if (item.action) actions.add(item.action as string);
      if (item.interaction !== undefined && !['move','place'].includes(String(item.interaction))) throw new Error('区域交互模式无效。');
      let move: Move | undefined;
      if (item.move !== undefined) {
        if (!project || item.action !== undefined || item.interaction !== undefined) throw new Error('直接执行的卡片需要棋盘配置，且不能同时选择棋盘操作。');
        move = validateRuleViewMove(item.move,project);
      }
      if (item.disabled !== undefined && typeof item.disabled !== 'boolean') throw new Error('区域项目的禁用标记无效。');
      if (item.skillType !== undefined && !['instant','trick','persistent'].includes(String(item.skillType))) throw new Error('技能类型无效。');
      if (item.count !== undefined && (!Number.isInteger(item.count) || Number(item.count) < 0 || Number(item.count) > 1000000)) throw new Error('区域项目数量无效。');
      if (item.stamp !== undefined && !['white','black'].includes(String(item.stamp))) throw new Error('卡片阵营印记无效。');
      let piece: ZoneItem['piece'];
      if (item.piece !== undefined) {
        if (!object(item.piece) || !['white','black'].includes(String(item.piece.side))) throw new Error('区域棋子的阵营无效。');
        const type = boundedText(item.piece.type,80,true)!;
        if (project && !project.pieceTypes.some(p => p.id === type)) throw new Error('区域棋子需使用项目中已有的棋子类型。');
        piece = {type,side:item.piece.side as Side};
      }
      let offsets: Cell[] | undefined;
      if (item.offsets !== undefined) {
        if (!Array.isArray(item.offsets) || !item.offsets.length || item.offsets.length > 8 || !item.offsets.every(p => object(p) && Number.isInteger(p.row) && Number.isInteger(p.col) && Math.abs(Number(p.row)) <= 2 && Math.abs(Number(p.col)) <= 2 && (p.row !== 0 || p.col !== 0))) throw new Error('走法图需位于 5 × 5 示意图内。');
        offsets = item.offsets.map(p => ({row:p.row,col:p.col}));
      }
      return {id:itemId,label:itemLabel,piece,subtitle:boundedText(item.subtitle,40),description:boundedText(item.description,300),symbol:boundedText(item.symbol,8),caption:boundedText(item.caption,40),count:item.count as number | undefined,offsets,stamp:item.stamp as Side | undefined,action:item.action as string | undefined,interaction:item.interaction as ZoneItem['interaction'],move,disabled:item.disabled as boolean | undefined,skillType:item.skillType as ZoneItem['skillType']};
    });
    return {id,label,owner:zone.owner as GameZone['owner'],description:boundedText(zone.description,300),emptyLabel:boundedText(zone.emptyLabel,60),items,kind:zone.kind as GameZone['kind']};
  });
}

// Existing downloaded projects keep working with the former cards protocol.
export function zonesFromCards(cards: RuleCard[]): GameZone[] {
  const groups = new Map<string, GameZone>();
  for (const card of cards) {
    const key = JSON.stringify([card.tone,card.group]);
    if (!groups.has(key)) groups.set(key,{id:'legacy-'+groups.size,label:card.group,owner:card.tone,items:[]});
    const {group: _group,tone: _tone,...item} = card;
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

export function zoneSelections(zones: GameZone[], turn: Side) {
  return zones.filter(z => z.owner === turn || z.owner === 'shared').flatMap(z => z.items.filter(i => i.action && !i.disabled && i.count !== 0));
}

export function zonePlacement(owner: GameZone['owner'], flipped: boolean): 'top' | 'bottom' | 'shared' {
  return owner === 'shared' ? 'shared' : owner === (flipped ? 'black' : 'white') ? 'bottom' : 'top';
}

type TableProps = {
  zones?: GameZone[]; project: Project; turn: Side; flipped?: boolean;
  disabled: boolean; pending?: boolean; selectedAction?: string; onSelect: (action: string) => void; onMove?: (move: Move) => void; children: ReactNode;
};

const skillLabels = {instant:'瞬发',trick:'锦囊',persistent:'持续'};
function SkillEmblem({type}: {type: NonNullable<ZoneItem['skillType']>}) {
  return <svg className="zone-skill-emblem" viewBox="0 0 56 62" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M28 2 53 16.5v29L28 60 3 45.5v-29Z"/><path d="M28 7 48.5 19v24L28 55 7.5 43V19Z" opacity=".35"/>
    {type === 'instant' ? <path d="m28 14 5 12 12 5-12 5-5 12-5-12-12-5 12-5Z"/> : type === 'trick' ? <path d="M15 20h26m-7-6 7 6-7 6M41 36H15m7-6-7 6 7 6M28 26v4"/> : <><path d="M16 15h24M21 15v14M35 15v14M28 15v9M21 30l7 5 7-5M28 35v8M22 44l6-6 6 6"/><circle cx="28" cy="28" r="4"/></>}
  </svg>;
}

export function GameTable({zones = [],project,turn,flipped = false,disabled,pending = false,selectedAction,onSelect,onMove,children}: TableProps) {
  const tableId = useId();
  if (!zones.length) return <>{children}</>;
  const colors = {'--zone-white':project.ui.sideColors?.white || '#a2392d','--zone-black':project.ui.sideColors?.black || '#355f99','--piece-white':project.ui.sideColors?.white,'--piece-black':project.ui.sideColors?.black} as CSSProperties;
  const slot = (position: 'top' | 'bottom' | 'shared') => {
    const group = zones.filter(z => zonePlacement(z.owner,flipped) === position);
    return !!group.length && <div className={`game-table-${position}`} data-zone-position={position}>{group.map(zone => <section key={zone.id} className={`game-zone ${zone.owner} ${zone.owner === turn ? 'active' : ''}`} aria-label={zone.label} data-zone-id={zone.id} data-zone-owner={zone.owner} data-zone-kind={zone.kind}>
      <div className="game-zone-heading"><h3>{zone.label}</h3>{zone.owner === turn && <span>当前回合</span>}</div>
      {zone.description && <p className="game-zone-description">{zone.description}</p>}
      <div className={`game-zone-items ${zone.items.length && zone.items.every(i => i.piece) ? 'piece-items' : ''}`} tabIndex={zone.kind === 'hand' && zone.items.length ? 0 : undefined} role={zone.kind ? 'group' : undefined} aria-label={zone.kind ? `${zone.label}${zone.kind === 'hand' ? '，可横向滚动' : '，三选一'}` : undefined}>{zone.items.length ? zone.items.map((item,itemIndex) => {
        const descriptionId = item.description ? `${tableId}-description-${zones.indexOf(zone)}-${itemIndex}` : undefined;
        const typeId = item.skillType ? `${tableId}-type-${zones.indexOf(zone)}-${itemIndex}` : undefined;
        const describedBy = [typeId,descriptionId].filter(Boolean).join(' ') || undefined;
        const selected = !!item.action && item.action === selectedAction;
        const blocked = disabled || !!item.disabled || item.count === 0 || !!item.move && !onMove || zone.owner !== 'shared' && zone.owner !== turn;
        const definition = item.piece && project.pieceTypes.find(p => p.id === item.piece!.type);
        const pieceLabel = item.piece ? `${sideLabel(project,item.piece.side)}${item.label}` : undefined;
        const content = <>{item.skillType && <span className="zone-skill-top"><SkillEmblem type={item.skillType}/><span id={typeId} className="zone-skill-type">{skillLabels[item.skillType]}</span></span>}<span className="rule-card-heading"><strong>{item.label}</strong>{item.subtitle && <small>{item.subtitle}</small>}</span>
          {item.piece && definition ? <span className="zone-item-piece"><PieceIcon type={definition.id} side={definition.neutral ? 'neutral' : item.piece.side} shape={definition.shape} symbol={pieceSymbol(definition,item.piece.side)}/></span> : item.offsets ? <span className="rule-card-grid" aria-hidden="true">{Array.from({length:25},(_,i) => {
            const direction = flipped ? -1 : 1, row = (Math.floor(i/5)-2)*direction, col = (i%5-2)*direction;
            return <i key={i} className={!row && !col ? 'origin' : item.offsets!.some(p => p.row === row && p.col === col) ? 'destination' : ''}/>;
          })}</span> : item.symbol ? <span className="zone-item-symbol" aria-hidden="true">{item.symbol}</span> : null}
          {item.description && <span id={descriptionId} className="zone-item-description">{item.description}</span>}
          <span className="rule-card-footer">{!item.piece && (selected ? '已选择' : item.caption || (item.action ? item.offsets ? '选择招式' : '选择' : item.move ? '执行' : ''))}{item.count !== undefined && <span className="zone-item-count" aria-label={`数量 ${item.count}`}>×{item.count}</span>}{item.stamp && <i className={`rule-card-stamp ${item.stamp}`} title={`${sideLabel(project,item.stamp)}印记`}/>}{zone.kind === 'offer' && <span aria-hidden="true">↗</span>}</span></>;
        const className = `rule-card zone-item ${zone.owner} ${selected ? 'selected' : ''} ${item.piece ? 'with-piece' : item.offsets ? 'with-diagram' : ''} ${item.count === 0 ? 'depleted' : ''}`;
        const title = item.piece ? `${pieceLabel}${item.count !== undefined ? ' ×'+item.count : ''}${item.description ? ' · '+item.description : ''}` : undefined;
        return item.action || item.move ? <button key={item.id} type="button" className={className} data-skill-type={item.skillType} title={title} aria-describedby={describedBy} aria-label={pieceLabel ? `选择棋子：${pieceLabel}` : `${zone.kind === 'offer' ? '选择强化' : item.move ? '使用' : '选择'+(item.offsets ? '招式' : '项目')}：${item.label}${item.subtitle ? ' '+item.subtitle : ''}`} aria-pressed={item.action ? selected : undefined} disabled={blocked} onClick={() => { if (pending || blocked) return; if (item.move) onMove?.(item.move); else onSelect(item.action!); }}>{content}</button>
          : <div key={item.id} className={className} data-skill-type={item.skillType} title={title} aria-label={pieceLabel || `${item.label}${item.subtitle ? ' '+item.subtitle : ''}`}>{content}</div>;
      }) : <p className="game-zone-empty">{zone.emptyLabel || '暂无内容'}</p>}</div>
    </section>)}</div>;
  };
  return <div className={`game-table ${zones.some(z => z.owner === 'shared') ? 'with-shared-zone' : ''} ${zones.some(z => z.kind) ? 'with-skill-zones' : ''}`} style={colors} aria-label="棋盘与手牌区" aria-busy={pending} inert={pending}>
    {slot('top')}<div className="game-table-board">{children}</div>{slot('shared')}{slot('bottom')}
  </div>;
}
