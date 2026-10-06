import { describe, it, expect } from 'vitest';
import { scaleNames, namingScheme, schemes } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('every scheme has a default strategy', () => {
  it('reports it as anchor', () => {
    const anchors = Object.fromEntries(Object.entries(schemes).map(([k, s]) => [k, s.anchor]));
    expect(anchors).toEqual({
      ordinal: 'start', roman: 'start', greek: 'start', paper: 'start',
      creatures: 'range', objects: 'range', things: 'range', value: 'start',
      tshirt: 'base',
      intensity: 'range', dynamics: 'range', weights: 'range',
      hundreds: 'range', tones: 'range', unit: 'range', signed: 'range',
    });
  });

  it('spreads creatures and objects from smallest to largest by default', () => {
    expect(scaleNames(5, 'creatures')).toEqual(['tardigrade', 'beetle', 'cat', 'bear', 'whale']);
    const five = scaleNames(5, 'objects');
    expect(five[0]).toBe('atom');
    expect(five.at(-1)).toBe('universe');
  });
});

describe("anchor: 'start'", () => {
  it('takes consecutive names from a chosen first one', () => {
    expect(scaleNames(3, 'creatures', { anchor: 'start', from: 'cat' })).toEqual(['cat', 'fox', 'dog']);
    expect(scaleNames(3, 'intensity', { anchor: 'start' })).toEqual(['hint', 'faint', 'subtle']);
    expect(scaleNames(3, 'greek', { from: 'gamma', step: 2 })).toEqual(['gamma', 'epsilon', 'eta']);
  });

  it('counts t-shirt sizes up from xs, or a chosen size', () => {
    expect(scaleNames(4, 'tshirt', { anchor: 'start' })).toEqual(['xs', 's', 'm', 'l']);
    expect(scaleNames(3, 'tshirt', { anchor: 'start', from: 'm' })).toEqual(['m', 'l', 'xl']);
  });

  it('counts number ranges in their coarsest step', () => {
    expect(scaleNames(4, 'hundreds', { anchor: 'start' })).toEqual(['100', '200', '300', '400']);
    expect(scaleNames(3, 'unit', { anchor: 'start', from: 0 })).toEqual(['0', '0_25', '0_5']);
    expect(scaleNames(3, 'tones', { anchor: 'start', from: 5, step: 5 })).toEqual(['5', '10', '15']);
  });

  it('throws past the end of a list, unless overflow fills from the start', () => {
    expect(() => scaleNames(5, 'creatures', { anchor: 'start', from: 'elephant' })).toThrow(TokenError);
    expect(scaleNames(12, 'paper', { overflow: 'between' })).toHaveLength(12);
  });
});

describe("anchor: 'base'", () => {
  it('steps outward from the centre of any vocabulary', () => {
    expect(scaleNames(3, 'intensity', { anchor: 'base' })).toEqual(['soft', 'mid', 'firm']);
    expect(scaleNames(3, 'creatures', { anchor: 'base' })).toEqual(['rabbit', 'cat', 'fox']);
    expect(scaleNames(5, 'hundreds', { anchor: 'base' })).toEqual(['-200', '-100', '0', '100', '200']);
    expect(scaleNames(3, 'ordinal', { anchor: 'base' })).toEqual(['-1', '0', '1']);
  });

  it('takes a step and a chosen centre', () => {
    expect(scaleNames(3, 'intensity', { anchor: 'base', step: 2 })).toEqual(['subtle', 'mid', 'bold']);
    expect(scaleNames(3, 'creatures', { anchor: 'base', base: [1, 'dog'] })).toEqual(['fox', 'dog', 'wolf']);
    expect(scaleNames(3, 'roman', { anchor: 'base', base: [1, 'v'] })).toEqual(['iv', 'v', 'vi']);
  });

  it('throws when a list runs out on one side', () => {
    expect(() => scaleNames(3, 'creatures', { anchor: 'base', base: [1, 'tardigrade'] })).toThrow(/0 below/);
  });
});

describe("anchor: 'range'", () => {
  it('spreads a ladder over its ends without pinning the centre', () => {
    expect(scaleNames(4, 'intensity', { anchor: 'range' })).toEqual(['hint', 'soft', 'firm', 'intense']);
    // the default for intensity pins mid instead
    expect(scaleNames(4, 'intensity')[1]).toBe('mid');
  });

  it('spreads between chosen names of a list', () => {
    expect(scaleNames(3, 'creatures', { from: 'mouse', to: 'horse' })).toEqual(['mouse', 'fox', 'horse']);
  });

  it('spreads open-ended vocabularies between explicit ends', () => {
    expect(scaleNames(3, 'tshirt', { anchor: 'range', from: 'xs', to: 'xl' })).toEqual(['xs', 'm', 'xl']);
    expect(scaleNames(5, 'ordinal', { anchor: 'range', from: 1, to: 100 })).toEqual(['1', '26', '50', '75', '100']);
    expect(scaleNames(3, 'roman', { anchor: 'range', from: 1, to: 9 })).toEqual(['i', 'v', 'ix']);
    expect(() => scaleNames(3, 'tshirt', { anchor: 'range' })).toThrow(/from and to/);
  });
});

describe('custom schemes pick a default strategy', () => {
  it('start without a centre, pinned range with one, or whatever anchor says', () => {
    expect(namingScheme(['a', 'b', 'c']).anchor).toBe('start');
    expect(namingScheme(['a', 'b', 'c'], { base: 'b' }).anchor).toBe('range');
    const sizes = namingScheme(['tiny', 'small', 'big', 'huge'], { anchor: 'range' });
    expect(scaleNames(2, sizes)).toEqual(['tiny', 'huge']);
  });
});

describe('strategy options are checked', () => {
  it('rejects options that do not fit the strategy', () => {
    expect(() => scaleNames(3, 'hundreds', { step: 50 })).toThrow(/step/);
    expect(() => scaleNames(3, 'tshirt', { from: 'xs' })).toThrow(/from/);
    expect(() => scaleNames(3, 'creatures', { anchor: 'start', to: 'cat' })).toThrow(/to/);
    expect(() => scaleNames(3, 'greek', { anchor: 'start', base: 1 })).toThrow(/base/);
    expect(() => scaleNames(3, 'tshirt', { anchor: 'base', overflow: 'between' })).toThrow(/overflow/);
    expect(() => scaleNames(3, 'tshirt', { anchor: 'sideways' as any })).toThrow(/anchor/);
  });
});
