import { describe, it, expect } from 'vitest';
import { dimensionOrderer } from '../../src/orderers/dimension';
import { stringOrderer } from '../../src/orderers/string';
import type { ComparableEntry } from '../../src/orderers';

const entry = (key: string, resolved: string, type = 'dimension'): ComparableEntry =>
  ({ key, type, resolved, token: { type, rawValue: resolved } as any });

describe('built-in orderers', () => {
  it('dimension orderer sorts by numeric magnitude ascending', () => {
    const out = dimensionOrderer([entry('lg', '16px'), entry('sm', '4px'), entry('md', '8px')]);
    expect(out.map(e => e.key)).toEqual(['sm', 'md', 'lg']);
  });

  it('dimension orderer is pure (does not mutate input array)', () => {
    const input = [entry('lg', '16px'), entry('sm', '4px')];
    dimensionOrderer(input);
    expect(input.map(e => e.key)).toEqual(['lg', 'sm']);
  });

  it('string orderer sorts lexically ascending', () => {
    const out = stringOrderer([
      entry('b', 'banana', 'string'),
      entry('a', 'apple', 'string'),
      entry('c', 'cherry', 'string'),
    ]);
    expect(out.map(e => e.key)).toEqual(['a', 'b', 'c']);
  });
});
