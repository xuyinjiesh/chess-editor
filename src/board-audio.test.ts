import { describe, expect, it } from 'vitest';
import { moveSound } from './board-audio';
import type { GameState, Piece } from './model';

const piece = (id: string, side: Piece['side'], row: number, col: number, type = 'p'): Piece => ({ id, side, row, col, type });
const state = (pieces: Piece[]): GameState => ({ pieces, turn: 'white', winner: null, history: [], data: {} });

describe('board sound classification', () => {
  it('keeps passes, skill choices and regenerated IDs silent', () => {
    const before = state([piece('a', 'white', 2, 0), piece('b', 'black', 1, 1)]);
    expect(moveSound(before, { ...before, turn: 'black', data: { skill: 'chosen' } })).toBeNull();
    expect(moveSound(before, state(before.pieces.map(p => ({ ...p, id: p.id + '-new' })).reverse()))).toBeNull();
  });
  it('recognizes placement, ordinary movement and promotion', () => {
    const pawn = piece('a', 'white', 2, 0);
    expect(moveSound(state([]), state([pawn]))).toBe('place');
    expect(moveSound(state([pawn]), state([{ ...pawn, row: 1 }]))).toBe('place');
    expect(moveSound(state([pawn]), state([{ ...pawn, type: 'q' }]))).toBe('place');
  });
  it('recognizes off-destination and multiple captures', () => {
    const pawn = piece('a', 'white', 3, 4), enemy = piece('b', 'black', 3, 3);
    expect(moveSound(state([pawn, enemy]), state([{ ...pawn, row: 2, col: 3 }]))).toBe('capture');
    expect(moveSound(state([pawn, enemy, piece('c', 'black', 4, 3)]), state([{ ...pawn, row: 2 }]))).toBe('capture');
  });
  it('recognizes flips even when placement increases the total piece count', () => {
    const enemy = piece('b', 'black', 1, 1);
    expect(moveSound(state([enemy]), state([{ ...enemy, side: 'white' }, piece('a', 'white', 1, 0)]))).toBe('capture');
  });
});
