import { describe, it, expect } from 'vitest';
import { scaleNames } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('ordinal with a base', () => {
  it('centres on 0 and counts into negatives', () => {
    expect(scaleNames(5, 'ordinal', { base: 2 })).toEqual(['-2', '-1', '0', '1', '2']);
    expect(scaleNames(3, 'ordinal', { base: 0 })).toEqual(['0', '1', '2']);
    expect(scaleNames(4, 'ordinal', { base: 3 })).toEqual(['-3', '-2', '-1', '0']);
  });

  it('takes a step and another base number', () => {
    expect(scaleNames(5, 'ordinal', { base: 2, step: 100 })).toEqual(['-200', '-100', '0', '100', '200']);
    expect(scaleNames(3, 'ordinal', { base: [1, '10'] })).toEqual(['9', '10', '11']);
    expect(scaleNames(3, 'ordinal', { base: [0, '-5'], step: 5 })).toEqual(['-5', '0', '5']);
  });

  it('rejects start with a base, and a base name that is not a whole number', () => {
    expect(() => scaleNames(3, 'ordinal', { base: 1, from: 4 })).toThrow(/from/);
    expect(() => scaleNames(3, 'ordinal', { base: [1, 'x'] })).toThrow(/integer/);
    expect(() => scaleNames(3, 'ordinal', { base: [1, '1_5'] })).toThrow(/integer/);
  });
});

describe('plain lists with a base name', () => {
  it('spread smaller creatures below the base and bigger ones above', () => {
    expect(scaleNames(3, 'creatures', { base: [1, 'cat'] })).toEqual(['tardigrade', 'cat', 'whale']);
    const names = scaleNames(7, 'creatures', { base: [3, 'cat'] });
    expect(names[3]).toBe('cat');
    expect(names[0]).toBe('tardigrade');
    expect(names.at(-1)).toBe('whale');
  });

  it('work on greek and paper too, and with overflow', () => {
    expect(scaleNames(3, 'greek', { base: [0, 'mu'] })).toEqual(['mu', 'sigma', 'omega']);
    expect(scaleNames(3, 'paper', { base: [1, 'a4'] })).toEqual(['a10', 'a4', 'a0']);
    const big = scaleNames(10, 'creatures', { base: [8, 'mite'], overflow: 'between' });
    expect(big[8]).toBe('mite');
    expect(big[0]).toBe('tardigrade');
  });

  it('reject a base name not in the list', () => {
    expect(() => scaleNames(3, 'creatures', { base: [1, 'dragon'] })).toThrow(/dragon/);
  });
});

describe('range schemes centred on 0', () => {
  it('count hundreds outward from 0', () => {
    expect(scaleNames(5, 'hundreds', { base: 2 })).toEqual(['-200', '-100', '0', '100', '200']);
    expect(scaleNames(6, 'hundreds', { base: 1 })).toEqual(['-100', '0', '100', '200', '300', '400']);
    expect(scaleNames(3, 'tones', { base: 1 })).toEqual(['-10', '0', '10']);
    expect(scaleNames(3, 'signed', { base: 1 })).toEqual(['-0_5', '0', '0_5']);
  });

  it('reject from / to in centred mode', () => {
    expect(() => scaleNames(3, 'hundreds', { base: 1, from: 0 })).toThrow(/from/);
  });
});

describe('range schemes with your own ends', () => {
  it('spread over from … to, negatives included', () => {
    expect(scaleNames(5, 'hundreds', { from: -500, to: 500 })).toEqual(['-500', '-200', '0', '200', '500']);
    expect(scaleNames(3, 'hundreds', { from: 0, to: 1000 })).toEqual(['0', '500', '1000']);
    expect(scaleNames(7, 'hundreds', { from: -500, to: 500, base: [3, '0'] })[3]).toBe('0');
  });

  it('reject ends in the wrong order', () => {
    expect(() => scaleNames(3, 'hundreds', { from: 500, to: -500 })).toThrow(TokenError);
    expect(() => scaleNames(3, 'tshirt', { from: 0 })).toThrow(/from/);
  });
});

describe('unit and signed', () => {
  it('spread 0 … 1 in quarters, then tenths, then twentieths', () => {
    expect(scaleNames(3, 'unit')).toEqual(['0', '0_5', '1']);
    expect(scaleNames(5, 'unit')).toEqual(['0', '0_25', '0_5', '0_75', '1']);
    expect(scaleNames(6, 'unit')).toEqual(['0', '0_2', '0_4', '0_6', '0_8', '1']);
    expect(scaleNames(11, 'unit')).toEqual(['0', '0_1', '0_2', '0_3', '0_4', '0_5', '0_6', '0_7', '0_8', '0_9', '1']);
    expect(scaleNames(21, 'unit')[1]).toBe('0_05');
    expect(() => scaleNames(22, 'unit')).toThrow(/21/);
  });

  it('spread -1 … 1 with 0 in the middle', () => {
    expect(scaleNames(3, 'signed')).toEqual(['-1', '0', '1']);
    expect(scaleNames(5, 'signed')).toEqual(['-1', '-0_5', '0', '0_5', '1']);
    expect(scaleNames(9, 'signed')).toEqual(['-1', '-0_75', '-0_5', '-0_25', '0', '0_25', '0_5', '0_75', '1']);
  });

  it('pin a step, and keep halving with overflow', () => {
    expect(scaleNames(4, 'unit', { base: [1, '0_5'] })).toEqual(['0', '0_5', '0_75', '1']);
    expect(scaleNames(3, 'signed', { base: [0, '0'] })).toEqual(['0', '0_5', '1']);
    const fine = scaleNames(30, 'unit', { overflow: 'between' });
    expect(fine).toHaveLength(30);
    expect(new Set(fine).size).toBe(30);
  });
});
