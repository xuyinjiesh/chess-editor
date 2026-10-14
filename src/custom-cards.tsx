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
