import type { Cell, Project } from './model.ts';

type Board = Pick<Project['board'], 'rows' | 'cols' | 'pattern' | 'hexLayout'>;
export type Point = { x: number; y: number };

// Self-contained: this exact factory is also serialized into isolated rule workers.
// Pointy-top hexes retain row/col coordinates: odd-r by default, axial r/q
// for rhombi. This mapping is shared by rendering, input and rule workers.
export function createBoardTopology(board: Board) {
  const { rows, cols, pattern } = board, hex = pattern === 'hex', rhombus = board.hexLayout === 'rhombus';
  const directions = hex ? [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]] : [[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1]];
  const contains = (c: Cell) => !!c && Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;
  const toAxial = (c: Cell) => ({ q: c.col - (rhombus ? 0 : Math.floor(c.row / 2)), r: c.row });
  const fromAxial = (c: { q: number; r: number }): Cell => ({ row: c.r + 0, col: c.q + (rhombus ? 0 : Math.floor(c.r / 2)) + 0 });
  function step(cell: Cell, direction: number, steps = 1): Cell {
    if (!Number.isInteger(direction) || direction < 0 || direction >= directions.length || !Number.isInteger(steps)) throw new Error('无效的棋盘方向或步数。');
    const [dq, dr] = directions[direction];
    if (!hex) return { row: cell.row + dr * steps, col: cell.col + dq * steps };
    const a = toAxial(cell);
    return fromAxial({ q: a.q + dq * steps, r: a.r + dr * steps });
  }
  function distance(a: Cell, b: Cell) {
    if (!hex) return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
    const x = toAxial(a), y = toAxial(b), dq = x.q - y.q, dr = x.r - y.r;
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  }
  function neighbors(cell: Cell) { return directions.map((_, i) => step(cell, i)).filter(contains); }
  function ray(cell: Cell, direction: number) {
    const cells: Cell[] = [];
    for (let next = step(cell, direction); contains(next); next = step(next, direction)) cells.push(next);
    return cells;
  }
  return Object.freeze({ kind: hex ? 'hex' : 'square', directionCount: directions.length, axisCount: directions.length / 2, contains, toAxial, fromAxial, step, distance, neighbors, ray });
}
export type BoardTopology = ReturnType<typeof createBoardTopology>;

export function boardMetrics(board: Board) {
  const hex = board.pattern === 'hex', cellWidth = 100, cellHeight = hex ? 200 / Math.sqrt(3) : 100;
  return { cellWidth, cellHeight, width: board.cols * 100 + (hex ? (board.hexLayout === 'rhombus' ? board.rows - 1 : Number(board.rows > 1)) * 50 : 0), height: hex ? (board.rows - 1) * cellHeight * .75 + cellHeight : board.rows * 100 };
}

export function cellCenter(board: Board, cell: Cell, flipped = false): Point {
  const m = boardMetrics(board), hex = board.pattern === 'hex';
  const x = (cell.col + .5 + (hex ? (board.hexLayout === 'rhombus' ? cell.row : cell.row & 1) * .5 : 0)) * 100;
  const y = (cell.row * (hex ? .75 : 1) + .5) * m.cellHeight;
  // Rotate the actual geometry, not offset coordinates (which changes parity).
  return flipped ? { x: m.width - x, y: m.height - y } : { x, y };
}

export function cellVertices(board: Board, cell: Cell, flipped = false): Point[] {
  const { x, y } = cellCenter(board, cell), { cellWidth: w, cellHeight: h, width, height } = boardMetrics(board);
  const offsets = board.pattern === 'hex' ? [[0,-h/2],[w/2,-h/4],[w/2,h/4],[0,h/2],[-w/2,h/4],[-w/2,-h/4]] : [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
  return offsets.map(([dx,dy]) => flipped ? { x: width-x-dx, y: height-y-dy } : { x: x+dx, y: y+dy });
}

export function polygonPath(points: Point[]) { return points.map((p,i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('') + 'Z'; }

export function cellAtPoint(board: Board, point: Point, flipped = false): Cell | undefined {
  const { width, height, cellHeight } = boardMetrics(board);
  const x = flipped ? width-point.x : point.x, y = flipped ? height-point.y : point.y;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height) return;
  const topology = createBoardTopology(board);
  if (board.pattern !== 'hex') {
    const cell = { row: Math.floor(y/100), col: Math.floor(x/100) };
    return topology.contains(cell) ? cell : undefined;
  }
  const r = (y-cellHeight/2)/(cellHeight*.75), q = (x-50)/100-r/2, s = -q-r;
  let rq = Math.round(q), rr = Math.round(r); const rs = Math.round(s);
  const dq = Math.abs(rq-q), dr = Math.abs(rr-r), ds = Math.abs(rs-s);
  if (dq > dr && dq > ds) rq = -rr-rs; else if (dr > ds) rr = -rq-rs;
  const cell = topology.fromAxial({ q: rq, r: rr });
  return topology.contains(cell) ? cell : undefined;
}

export function hexRegionGeometry(cells: Cell[], board: Board, flipped = false) {
  const topology = createBoardTopology(board), occupied = new Map<string, Cell>();
  for (const cell of cells) if (topology.contains(cell)) occupied.set(`${cell.row},${cell.col}`, cell);
  let fill = '', outline = '';
  for (const cell of occupied.values()) {
    const vertices = cellVertices(board, cell, flipped);
    fill += polygonPath(vertices);
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = topology.step(cell, [1,0,5,4,3,2][edge]);
      if (occupied.has(`${neighbor.row},${neighbor.col}`)) continue;
      const a = vertices[edge], b = vertices[(edge+1)%6];
      outline += `M${a.x} ${a.y}L${b.x} ${b.y}`;
    }
  }
  return { fill, outline };
}

export function hexGridPath(board: Board, flipped = false) {
  const topology = createBoardTopology(board);
  let path = '';
  for (let row = 0; row < board.rows; row++) for (let col = 0; col < board.cols; col++) {
    const cell = { row, col }, vertices = cellVertices(board, cell, flipped);
    for (let edge = 0; edge < 6; edge++) {
      const neighbor = topology.step(cell, [1,0,5,4,3,2][edge]);
      if (topology.contains(neighbor) && (neighbor.row < row || neighbor.row === row && neighbor.col < col)) continue;
      const a = vertices[edge], b = vertices[(edge+1)%6];
      path += `M${a.x} ${a.y}L${b.x} ${b.y}`;
    }
  }
  return path;
}

// Four independently colored boundaries, including both goals at each corner.
// Region tags hex-edge-{top,bottom,left,right} opt into these portable markings.
export function hexBoundaryCells(board: Board, side: string): Cell[] {
  if (side === 'top' || side === 'bottom') return Array.from({length:board.cols},(_,col)=>({row:side==='top'?0:board.rows-1,col}));
  if (side === 'left' || side === 'right') return Array.from({length:board.rows},(_,row)=>({row,col:side==='left'?0:board.cols-1}));
  return [];
}

export function hexBoundaryPath(board: Board, side: string, flipped = false) {
  if (board.pattern !== 'hex') return '';
  const topology = createBoardTopology(board);
  let path = '';
  for (let row = 0; row < board.rows; row++) for (let col = 0; col < board.cols; col++) {
    const cell = { row, col }, vertices = cellVertices(board, cell, flipped);
    for (let edge = 0; edge < 6; edge++) {
      const n = topology.step(cell, [1,0,5,4,3,2][edge]);
      const boundary = n.row < 0 ? 'top' : n.row >= board.rows ? 'bottom' : n.col < 0 ? 'left' : n.col >= board.cols ? 'right' : '';
      if (boundary !== side) continue;
      const a = vertices[edge], b = vertices[(edge+1)%6];
      path += `M${a.x} ${a.y}L${b.x} ${b.y}`;
    }
  }
  return path;
}
