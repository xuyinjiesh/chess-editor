import { describe, expect, it } from 'vitest';
import { regionGeometry } from './terrain';

const edges = (path: string) => (path.match(/M/g) || []).length;

describe('continuous terrain geometry', () => {
  it('removes internal borders and duplicate cells without moving intersections', () => {
    const geometry = regionGeometry([{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 2 }], 7, 6);
    expect(geometry.fill).toBe('M200 0h100v100h-100ZM300 0h100v100h-100Z');
    expect(edges(geometry.outline)).toBe(6);
    expect(geometry.outline).not.toContain('M300 0v100');
  });

  it('preserves disconnected islands and the boundary of a hole', () => {
    expect(edges(regionGeometry([{ row: 0, col: 0 }, { row: 2, col: 2 }], 3, 3).outline)).toBe(8);
    const ring = Array.from({ length: 9 }, (_, n) => ({ row: Math.floor(n / 3), col: n % 3 })).filter(c => c.row !== 1 || c.col !== 1);
    expect(edges(regionGeometry(ring, 3, 3).outline)).toBe(16);
  });

  it('rotates asymmetric regions with the board and discards out-of-board cells', () => {
    const cells = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: -1, col: 2 }];
    expect(regionGeometry(cells, 7, 6, true).fill).toBe('M400 600h100v100h-100ZM300 600h100v100h-100Z');
    expect(regionGeometry([], 7, 6)).toEqual({ fill: '', outline: '' });
    const river = Array.from({ length: 6 }, (_, col) => ({ row: 3, col }));
    expect(edges(regionGeometry(river, 7, 6).outline)).toBe(14);
  });
});
