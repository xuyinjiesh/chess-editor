import type { CSSProperties, ReactNode } from 'react';
import { sideLabel, type Cell, type Project, type Side } from './model';
import type { RuleCard } from './custom-cards';

export type ZoneItem = {
  id: string; label: string; subtitle?: string; description?: string; symbol?: string;
  count?: number; offsets?: Cell[]; stamp?: Side; caption?: string;
  action?: string; interaction?: 'move' | 'place'; disabled?: boolean;
};
export type GameZone = {
  id: string; label: string; owner: Side | 'shared';
  description?: string; emptyLabel?: string; items: ZoneItem[];
};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function boundedText(value: unknown, limit: number, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || value.length > limit || required && !value.trim()) throw new Error('对局区域需要有效的简短文本。');
  return value;
}

// All content crossing the rule sandbox boundary is data, never HTML or CSS.
export function validateGameZones(input: unknown): GameZone[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 8) throw new Error('最多显示 8 个对局区域。');
  const ids = new Set<string>(), actions = new Set<string>();
  let total = 0;
  return input.map(zone => {
    if (!object(zone)) throw new Error('对局区域无效。');
    const id = boundedText(zone.id,64,true)!, label = boundedText(zone.label,60,true)!;
    if (ids.has(id) || !['white','black','shared'].includes(String(zone.owner))) throw new Error('对局区域标识重复或归属无效。');
    ids.add(id);
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
      if (item.disabled !== undefined && typeof item.disabled !== 'boolean') throw new Error('区域项目的禁用标记无效。');
      if (item.count !== undefined && (!Number.isInteger(item.count) || Number(item.count) < 0 || Number(item.count) > 1000000)) throw new Error('区域项目数量无效。');
      if (item.stamp !== undefined && !['white','black'].includes(String(item.stamp))) throw new Error('卡片阵营印记无效。');
      let offsets: Cell[] | undefined;
      if (item.offsets !== undefined) {
        if (!Array.isArray(item.offsets) || !item.offsets.length || item.offsets.length > 8 || !item.offsets.every(p => object(p) && Number.isInteger(p.row) && Number.isInteger(p.col) && Math.abs(Number(p.row)) <= 2 && Math.abs(Number(p.col)) <= 2 && (p.row !== 0 || p.col !== 0))) throw new Error('走法图需位于 5 × 5 示意图内。');
        offsets = item.offsets.map(p => ({row:p.row,col:p.col}));
      }
      return {id:itemId,label:itemLabel,subtitle:boundedText(item.subtitle,40),description:boundedText(item.description,300),symbol:boundedText(item.symbol,8),caption:boundedText(item.caption,40),count:item.count as number | undefined,offsets,stamp:item.stamp as Side | undefined,action:item.action as string | undefined,interaction:item.interaction as ZoneItem['interaction'],disabled:item.disabled as boolean | undefined};
    });
    return {id,label,owner:zone.owner as GameZone['owner'],description:boundedText(zone.description,300),emptyLabel:boundedText(zone.emptyLabel,60),items};
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
  disabled: boolean; selectedAction?: string; onSelect: (action: string) => void; children: ReactNode;
};

export function GameTable({zones = [],project,turn,flipped = false,disabled,selectedAction,onSelect,children}: TableProps) {
  if (!zones.length) return <>{children}</>;
  const colors = {'--zone-white':project.ui.sideColors?.white || '#a2392d','--zone-black':project.ui.sideColors?.black || '#355f99'} as CSSProperties;
  const slot = (position: 'top' | 'bottom' | 'shared') => {
    const group = zones.filter(z => zonePlacement(z.owner,flipped) === position);
    return !!group.length && <div className={`game-table-${position}`} data-zone-position={position}>{group.map(zone => <section key={zone.id} className={`game-zone ${zone.owner} ${zone.owner === turn ? 'active' : ''}`} aria-label={zone.label} data-zone-id={zone.id} data-zone-owner={zone.owner}>
      <div className="game-zone-heading"><h3>{zone.label}</h3>{zone.owner === turn && <span>当前回合</span>}</div>
      {zone.description && <p className="game-zone-description">{zone.description}</p>}
      <div className="game-zone-items">{zone.items.length ? zone.items.map(item => {
        const selected = !!item.action && item.action === selectedAction;
        const blocked = disabled || !!item.disabled || item.count === 0 || zone.owner !== 'shared' && zone.owner !== turn;
        const content = <><span className="rule-card-heading"><strong>{item.label}</strong>{item.subtitle && <small>{item.subtitle}</small>}</span>
          {item.offsets ? <span className="rule-card-grid" aria-hidden="true">{Array.from({length:25},(_,i) => {
            const direction = flipped ? -1 : 1, row = (Math.floor(i/5)-2)*direction, col = (i%5-2)*direction;
            return <i key={i} className={!row && !col ? 'origin' : item.offsets!.some(p => p.row === row && p.col === col) ? 'destination' : ''}/>;
          })}</span> : item.symbol ? <span className="zone-item-symbol" aria-hidden="true">{item.symbol}</span> : null}
          {item.description && <span className="zone-item-description">{item.description}</span>}
          <span className="rule-card-footer">{selected ? '已选择' : item.caption || (item.action ? item.offsets ? '选择招式' : '选择' : '')}{item.count !== undefined && <span className="zone-item-count" aria-label={`数量 ${item.count}`}>×{item.count}</span>}{item.stamp && <i className={`rule-card-stamp ${item.stamp}`} title={`${sideLabel(project,item.stamp)}印记`}/>}</span></>;
        const className = `rule-card zone-item ${zone.owner} ${selected ? 'selected' : ''} ${item.offsets ? 'with-diagram' : ''}`;
        return item.action ? <button key={item.id} type="button" className={className} aria-label={`选择${item.offsets ? '招式' : '项目'}：${item.label}${item.subtitle ? ' '+item.subtitle : ''}`} aria-pressed={selected} disabled={blocked} onClick={() => onSelect(item.action!)}>{content}</button>
          : <div key={item.id} className={className} aria-label={`${item.label}${item.subtitle ? ' '+item.subtitle : ''}`}>{content}</div>;
      }) : <p className="game-zone-empty">{zone.emptyLabel || '暂无内容'}</p>}</div>
    </section>)}</div>;
  };
  return <div className={`game-table ${zones.some(z => z.owner === 'shared') ? 'with-shared-zone' : ''}`} style={colors} aria-label="棋盘与手牌区">
    {slot('top')}<div className="game-table-board">{children}</div>{slot('shared')}{slot('bottom')}
  </div>;
}
