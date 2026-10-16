import { BOARD_THEMES, type BoardTheme } from './appearance.ts';
export type Side = 'white' | 'black';
export type Engine = 'chess' | 'xiangqi' | 'gomoku' | 'reversi' | 'custom';
export type Cell = { row: number; col: number };
export type Piece = Cell & { id: string; type: string; side: Side };
export type PieceType = { id: string; name: string; symbol: string; blackSymbol?: string; neutral?: boolean; shape: 'chess' | 'xiangqi' | 'stone' | 'token' };
export type Region = { id: string; name: string; color: string; cells: Cell[]; tag: string };
export interface Project {
  version: 1;
  id: string;
  name: string;
  description: string;
  board: { rows: number; cols: number; pattern: 'checker' | 'grid' | 'cells' | 'xiangqi' | 'hex'; light: string; dark: string; coordinates: boolean; hexLayout?: 'offset' | 'rhombus'; theme?: BoardTheme };
  pieceTypes: PieceType[];
  pieces: Piece[];
  regions: Region[];
  rules: { engine: Engine; code: string; winLength: number; firstTurn: Side };
  ui: { accent: string; showHints: boolean; showHistory: boolean; sideLabels?: Record<Side, string>; sideColors?: Record<Side, string> };
}
export type Move = { from?: Cell; to: Cell; promotion?: 'q' | 'r' | 'b' | 'n'; action?: string };
export type MoveRecord = { text: string; side: Side; from?: Cell; to: Cell };
export interface GameState {
  pieces: Piece[];
  turn: Side;
  winner: Side | 'draw' | null;
  history: MoveRecord[];
  fen?: string;
  fenHistory?: string[];
  data: Record<string, unknown>;
}
export type RuleResult = { valid: boolean; message?: string; pieces?: Piece[]; turn?: Side; winner?: Side | 'draw' | null; data?: Record<string, unknown> };
export const otherSide = (side: Side): Side => side === 'white' ? 'black' : 'white';
export const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.col === b.col;
export const coord = (cell: Cell, rows: number) => `${String.fromCharCode(97 + cell.col)}${rows - cell.row}`;
export const uid = () => crypto.randomUUID();
export const clone = <T,>(value: T): T => structuredClone(value);
export const usesRedSide = (project: Project) => project.rules.engine === 'xiangqi' || project.pieceTypes.some(p => p.shape === 'xiangqi');
export const sideLabel = (project: Project, side: string) => (side === 'white' || side === 'black') && project.ui.sideLabels?.[side] ? project.ui.sideLabels[side] : side === 'white' ? usesRedSide(project) ? '红方' : '白方' : side === 'black' ? '黑方' : '观战';
export const pieceSymbol = (piece: PieceType, side: Side) => side === 'black' ? piece.blackSymbol || piece.symbol : piece.symbol;

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const shortString = (x: unknown, max = 120): x is string => typeof x === 'string' && x.length <= max;
const color = (x: unknown) => typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
export function validateProject(input: unknown): Project {
  if (!isObject(input) || input.version !== 1) throw new Error('不是有效的棋局工坊 v2项目，请导入 version: 1 的 JSON 文件。');
  const p = input;
  if (!shortString(p.name, 60) || !p.name.trim() || !shortString(p.description, 2000)) throw new Error('请提供项目名称和简介。');
  if (!isObject(p.board)) throw new Error('缺少棋盘配置。');
  const b = p.board;
  if (![b.rows, b.cols].every(n => Number.isInteger(n) && Number(n) >= 3 && Number(n) <= 24)) throw new Error('棋盘行列数需要在 3–24 之间。');
  if (!['checker', 'grid', 'cells', 'xiangqi', 'hex'].includes(String(b.pattern)) || !color(b.light) || !color(b.dark) || typeof b.coordinates !== 'boolean') throw new Error('棋盘样式无效。');
  if (b.pattern === 'xiangqi' && (b.rows !== 10 || b.cols !== 9)) throw new Error('中国象棋棋盘样式需要 9 列 × 10 行。');
  if (b.hexLayout !== undefined && !['offset','rhombus'].includes(String(b.hexLayout))) throw new Error('六边形布局无效。');
  if (b.theme !== undefined && b.theme !== 'custom' && !BOARD_THEMES.some(t=>t.id===b.theme)) throw new Error('棋盘主题无效。');
  if (!Array.isArray(p.pieceTypes) || !p.pieceTypes.length || p.pieceTypes.length > 64) throw new Error('需要 1–64 种棋子。');
  const types = new Set<string>();
  for (const t of p.pieceTypes) {
    if (!isObject(t) || !shortString(t.id, 30) || !t.id || types.has(t.id) || !shortString(t.name, 30) || !shortString(t.symbol, 8) || (t.blackSymbol !== undefined && !shortString(t.blackSymbol, 8)) || !['chess','xiangqi','stone','token'].includes(String(t.shape))) throw new Error('棋子定义无效或 ID 重复。');
    if (t.neutral !== undefined && typeof t.neutral !== 'boolean') throw new Error('中立棋子标记无效。');
    types.add(t.id);
  }
  const cellValid = (c: unknown) => isObject(c) && Number.isInteger(c.row) && Number(c.row) >= 0 && Number(c.row) < Number(b.rows) && Number.isInteger(c.col) && Number(c.col) >= 0 && Number(c.col) < Number(b.cols);
  const occupied = new Set<string>(), ids = new Set<string>();
  if (!Array.isArray(p.pieces) || p.pieces.length > Number(b.rows) * Number(b.cols)) throw new Error('初始棋子列表无效。');
  for (const pc of p.pieces) {
    if (!isObject(pc) || !cellValid(pc) || !shortString(pc.id) || !pc.id || ids.has(pc.id) || !types.has(String(pc.type)) || !['white', 'black'].includes(String(pc.side))) throw new Error('存在无效棋子或越界位置。');
    const key = `${pc.row},${pc.col}`;
    if (occupied.has(key)) throw new Error('同一个格子不能放置两枚棋子。');
    occupied.add(key); ids.add(pc.id);
  }
  if (!Array.isArray(p.regions) || p.regions.length > 32) throw new Error('区域列表无效。');
  const regionIds = new Set<string>();
  for (const r of p.regions) {
    if (!isObject(r) || !shortString(r.id) || regionIds.has(String(r.id)) || !shortString(r.name, 40) || !shortString(r.tag, 40) || !color(r.color) || !Array.isArray(r.cells) || r.cells.length > 576 || !r.cells.every(cellValid)) throw new Error('区域配置无效。');
    regionIds.add(r.id);
  }
  if (!isObject(p.rules) || !['chess', 'xiangqi', 'gomoku', 'reversi', 'custom'].includes(String(p.rules.engine)) || !shortString(p.rules.code, 200000) || !['white','black'].includes(String(p.rules.firstTurn)) || !Number.isInteger(p.rules.winLength) || Number(p.rules.winLength) < 3 || Number(p.rules.winLength) > 24) throw new Error('规则配置无效。');
  if (p.rules.engine === 'chess' && (b.rows !== 8 || b.cols !== 8)) throw new Error('标准国际象棋需要 8 × 8 棋盘；变体请使用自定义规则。');
  if (p.rules.engine === 'xiangqi' && (b.rows !== 10 || b.cols !== 9)) throw new Error('中国象棋规则需要 9 列 × 10 行；变体请使用自定义规则。');
  if (!isObject(p.ui) || !color(p.ui.accent) || typeof p.ui.showHints !== 'boolean' || typeof p.ui.showHistory !== 'boolean') throw new Error('界面配置无效。');
  for (const key of ['sideLabels','sideColors'] as const) {
    const value = p.ui[key];
    if (value !== undefined && (!isObject(value) || !['white','black'].every(side => key === 'sideColors' ? color(value[side]) : shortString(value[side],16) && String(value[side]).trim()))) throw new Error('阵营名称或配色无效。');
  }
  // Reconstruct only known fields. Imported files cannot inject arbitrary UI markup.
  return {
    version: 1, id: shortString(p.id) ? p.id : uid(), name: p.name, description: p.description,
    board: {rows: Number(b.rows), cols: Number(b.cols), pattern: b.pattern as Project['board']['pattern'], light: String(b.light), dark: String(b.dark), coordinates: b.coordinates,...(b.hexLayout!==undefined?{hexLayout:b.hexLayout as Project['board']['hexLayout']} : {}),...(b.theme!==undefined?{theme:b.theme as BoardTheme}:{})},
    pieceTypes: p.pieceTypes.map(t => ({id:t.id, name:t.name, symbol:t.symbol, ...(t.blackSymbol !== undefined ? {blackSymbol:t.blackSymbol} : {}), shape:t.shape,...(t.neutral !== undefined ? {neutral:t.neutral} : {})})),
    pieces: p.pieces.map(pc => ({id:pc.id, type:pc.type, side:pc.side, row:pc.row, col:pc.col})),
    regions: p.regions.map(r => ({id:r.id,name:r.name,color:r.color,tag:r.tag,cells:r.cells.map((c: Cell)=>({row:c.row,col:c.col}))})),
    rules: {engine:p.rules.engine as Engine,code:p.rules.code,winLength:Number(p.rules.winLength),firstTurn:p.rules.firstTurn as Side},
    ui: {accent:String(p.ui.accent),showHints:p.ui.showHints,showHistory:p.ui.showHistory,...(p.ui.sideLabels ? {sideLabels:{white:String((p.ui.sideLabels as Record<string,unknown>).white),black:String((p.ui.sideLabels as Record<string,unknown>).black)}} : {}),...(p.ui.sideColors ? {sideColors:{white:String((p.ui.sideColors as Record<string,unknown>).white),black:String((p.ui.sideColors as Record<string,unknown>).black)}} : {})},
  };
}
