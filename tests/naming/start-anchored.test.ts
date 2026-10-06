import { describe, it, expect } from 'vitest';
import { scaleNames } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('scaleNames — start-anchored schemes', () => {
  it('counts ordinals from 1 by default', () => {
    expect(scaleNames(0, 'ordinal')).toEqual([]);
    expect(scaleNames(1, 'ordinal')).toEqual(['1']);
    expect(scaleNames(4, 'ordinal')).toEqual(['1', '2', '3', '4']);
  });

  it('takes start and step for ordinals, leaving room to grow', () => {
    expect(scaleNames(3, 'ordinal', { start: 0 })).toEqual(['0', '1', '2']);
    expect(scaleNames(4, 'ordinal', { step: 10 })).toEqual(['10', '20', '30', '40']);
    expect(scaleNames(3, 'ordinal', { start: 0, step: 100 })).toEqual(['0', '100', '200']);
  });

  it('rejects ordinal options that would not make integer keys', () => {
    expect(() => scaleNames(3, 'ordinal', { start: -1 })).toThrow(/start/);
    expect(() => scaleNames(3, 'ordinal', { start: 1.5 })).toThrow(/start/);
    expect(() => scaleNames(3, 'ordinal', { step: 0 })).toThrow(/step/);
    expect(() => scaleNames(3, 'ordinal', { step: 0.5 })).toThrow(/step/);
  });

  it('writes Roman numerals, lower case by default', () => {
    expect(scaleNames(9, 'roman')).toEqual(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix']);
    expect(scaleNames(4, 'roman', { case: 'upper' })).toEqual(['I', 'II', 'III', 'IV']);
    const big = scaleNames(49, 'roman');
    expect(big[39]).toBe('xl');
    expect(big[43]).toBe('xliv');
    expect(big[48]).toBe('xlix');
  });

  it('stops Roman numerals at 3999', () => {
    expect(scaleNames(3999, 'roman')[3998]).toBe('mmmcmxcix');
    expect(() => scaleNames(4000, 'roman')).toThrow(/3999/);
  });

  it('takes the first names of a fixed list', () => {
    expect(scaleNames(3, 'greek')).toEqual(['alpha', 'beta', 'gamma']);
    expect(scaleNames(24, 'greek').at(-1)).toBe('omega');
    expect(scaleNames(3, 'paper')).toEqual(['a10', 'a9', 'a8']);
    expect(scaleNames(11, 'paper').at(-1)).toBe('a0');
    expect(scaleNames(4, 'creatures')).toEqual(['tardigrade', 'mite', 'flea', 'ant']);
    expect(scaleNames(23, 'creatures').at(-1)).toBe('whale');
  });

  it('throws past the end of a fixed list, saying how many names it has', () => {
    expect(() => scaleNames(25, 'greek')).toThrow(TokenError);
    expect(() => scaleNames(25, 'greek')).toThrow(/greek.*24/);
    expect(() => scaleNames(12, 'paper')).toThrow(/11/);
    expect(() => scaleNames(24, 'creatures')).toThrow(/23/);
  });
});
