import { describe, it, expect } from 'vitest';
import { colorOrderer } from '../../src/orderers/color';
import type { ComparableEntry } from '../../src/orderers';

const c = (key: string, resolved: string): ComparableEntry =>
  ({ key, type: 'color', resolved, token: { type: 'color', rawValue: resolved } as any });

describe('color orderer', () => {
  it('orders a set dark -> light (ascending)', () => {
    const out = colorOrderer([c('white', '#ffffff'), c('black', '#000000'), c('gray', '#888888')]);
    expect(out[0].key).toBe('black');
    expect(out[out.length - 1].key).toBe('white');
  });

  it('returns a single-element group unchanged without throwing', () => {
    const out = colorOrderer([c('only', '#123456')]);
    expect(out.map(e => e.key)).toEqual(['only']);
  });

  it('returns an empty group unchanged', () => {
    expect(colorOrderer([])).toEqual([]);
  });

  it('falls back to input order when a value is not parseable hex', () => {
    const input = [c('a', 'not-a-color'), c('b', 'also-bad')];
    const out = colorOrderer(input);
    expect(out.map(e => e.key)).toEqual(['a', 'b']);
  });
});
