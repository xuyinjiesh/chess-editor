import type { Cell, Project, Region } from './model.ts';

// Opt-in by region tag so field markings also survive copying and importing.
export const hasFootballPitch = (project: Project) => project.board.rows === 23 && project.board.cols === 15 && project.regions.some(r => r.tag === 'football-pitch');
export const footballPitchPath = 'M0 100H500M1000 100H1500V2200H1000M500 2200H0V100M0 1150H1500M600 1150a150 150 0 1 0 300 0a150 150 0 1 0 -300 0M400 100V400H1100V100M400 2200V1900H1100V2200M500 100V0H1000V100M500 2200V2300H1000V2200';

// Regions use whole logical cells, while pieces sit on their centers. Shared
// edges are omitted so a painted area has one perimeter, including its holes.
export function regionGeometry(cells: Cell[], rows: number, cols: number, flipped = false) {
  const occupied = new Map<string, Cell>();
  for (const cell of cells) {
    if (cell.row < 0 || cell.row >= rows || cell.col < 0 || cell.col >= cols) continue;
    const row = flipped ? rows - 1 - cell.row : cell.row;
    const col = flipped ? cols - 1 - cell.col : cell.col;
    occupied.set(`${row},${col}`, { row, col });
  }
  let fill = '', outline = '';
  for (const { row, col } of occupied.values()) {
    const x = col * 100, y = row * 100;
    fill += `M${x} ${y}h100v100h-100Z`;
    if (!occupied.has(`${row - 1},${col}`)) outline += `M${x} ${y}h100`;
    if (!occupied.has(`${row},${col + 1}`)) outline += `M${x + 100} ${y}v100`;
    if (!occupied.has(`${row + 1},${col}`)) outline += `M${x + 100} ${y + 100}h-100`;
    if (!occupied.has(`${row},${col - 1}`)) outline += `M${x} ${y + 100}v-100`;
  }
  return { fill, outline };
}

export function terrainKind(region: Pick<Region, 'tag' | 'name'>) {
  if (/river|河|水域/i.test(region.tag + ' ' + region.name)) return 'river';
  if (/forbidden|禁区/i.test(region.tag + ' ' + region.name)) return 'forbidden';
  return 'region';
}
