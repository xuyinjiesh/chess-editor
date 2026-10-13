import type { Cell } from './model';

export type RuleCard = {
  id: string; label: string; subtitle: string; group: string;
  tone: 'white' | 'black' | 'shared'; stamp?: 'white' | 'black';
  offsets: Cell[]; action?: string;
};

// Only bounded text and grid offsets cross the sandbox boundary; no rule markup.
export function validateRuleCards(input: unknown): RuleCard[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 16) throw new Error('最多显示 16 张招式卡。');
  const ids = new Set<string>();
  const text = (v: unknown, max: number) => typeof v === 'string' && !!v.trim() && v.length <= max;
  return input.map(c => {
    if (!c || !text(c.id, 64) || ids.has(c.id) || !text(c.label, 30) || !text(c.subtitle, 40) || !text(c.group, 60) || !['white','black','shared'].includes(c.tone) || c.stamp !== undefined && !['white','black'].includes(c.stamp) || c.action !== undefined && (typeof c.action !== 'string' || !/^[a-z0-9-]{1,64}$/.test(c.action))) throw new Error('招式卡名称、分组或操作无效。');
    if (!Array.isArray(c.offsets) || c.offsets.length < 1 || c.offsets.length > 8 || !c.offsets.every((p: Cell) => p && Number.isInteger(p.row) && Number.isInteger(p.col) && Math.abs(p.row) <= 2 && Math.abs(p.col) <= 2 && (p.row !== 0 || p.col !== 0))) throw new Error('招式卡走法需位于 5 × 5 示意图内。');
    ids.add(c.id);
    return {id:c.id,label:c.label,subtitle:c.subtitle,group:c.group,tone:c.tone,offsets:c.offsets.map((p: Cell) => ({row:p.row,col:p.col})),...(c.stamp ? {stamp:c.stamp} : {}),...(c.action ? {action:c.action} : {})};
  });
}

export function RuleCards({ cards, selectedAction, disabled, onSelect, flipped = false }: { cards: RuleCard[]; selectedAction?: string; disabled: boolean; onSelect?: (action: string) => void; flipped?: boolean }) {
  return <div className="rule-cards" aria-label="招式卡">
    {[...new Set(cards.map(c => c.group))].map(group => <div className="rule-card-group" key={group}>
      <h3>{group}</h3>
      <div className="rule-card-row">{cards.filter(c => c.group === group).map(card => {
        const selected = !!card.action && card.action === selectedAction;
        const content = <><span className="rule-card-heading"><strong>{card.label}</strong><small>{card.subtitle}</small></span>
          <span className="rule-card-grid" aria-hidden="true">{Array.from({length:25},(_,i) => {
            const direction = flipped ? -1 : 1, row = (Math.floor(i/5)-2)*direction, col = (i%5-2)*direction;
            return <i key={i} className={row === 0 && col === 0 ? 'origin' : card.offsets.some(p => p.row === row && p.col === col) ? 'destination' : ''}/>;
          })}</span>
          <span className="rule-card-footer">{selected ? '已选择' : card.action ? '选择招式' : card.tone === 'shared' ? '下次换入' : '对手持有'}{card.stamp && <i className={`rule-card-stamp ${card.stamp}`} title={`${card.stamp === 'white' ? '红' : '蓝'}方先手印记`}/>}</span></>;
        return card.action ? <button key={card.id} type="button" className={`rule-card ${card.tone} ${selected ? 'selected' : ''}`} aria-label={`选择招式：${card.label} ${card.subtitle}`} aria-pressed={selected} disabled={disabled || !onSelect} onClick={() => onSelect?.(card.action!)}>{content}</button>
          : <div key={card.id} className={`rule-card ${card.tone}`} aria-label={`${card.label} ${card.subtitle}`}>{content}</div>;
      })}</div>
    </div>)}
    <div className="rule-card-key"><i/> 起点 <i/> 可达位置 · 走法与棋盘方向一致</div>
  </div>;
}
