import type { Cell, Move, Project } from './model';

// Shared by panel buttons and hand cards at the rule sandbox boundary.
export function validateRuleViewMove(input: unknown, project: Pick<Project, 'board'>): Move {
  const m = input as Move | null;
  const cell = (c: Cell) => c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.col >= 0 && c.row < project.board.rows && c.col < project.board.cols;
  if (!m || !cell(m.to) || (m.from !== undefined && !cell(m.from)) || (m.action !== undefined && (typeof m.action !== 'string' || !/^[a-z0-9-]{1,64}$/.test(m.action))) || (m.promotion !== undefined && !['q','r','b','n'].includes(m.promotion))) throw new Error('规则界面返回了无效走法。');
  return { to: { row: m.to.row, col: m.to.col }, ...(m.from ? { from: { row: m.from.row, col: m.from.col } } : {}), ...(m.action ? { action: m.action } : {}), ...(m.promotion ? { promotion: m.promotion } : {}) };
}
