import { describe, it, expect } from 'vitest';
import { scaleNames, nameValues, nameBetween, schemes } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('things — a hand-picked ladder for UI sizes', () => {
  const ALL = ['nothing', 'glitter', 'pinhead', 'key-cap', 'lipstick', 'poker-card', 'cup', 'wine-glass',
    'champagne-bottle', 'umbrella', 'chair', 'table', 'car', 'camper-van', 'godzilla', 'eiffel-tower',
    'matterhorn', 'switzerland', 'europe', 'moon', 'earth'];

  it('has 21 steps, nothing (zero) first', () => {
    expect(scaleNames(21, 'things')).toEqual(ALL);
    expect(schemes.things.anchor).toBe('range');
  });

  it('spreads over the ladder by default, or starts where you say', () => {
    expect(scaleNames(3, 'things')).toEqual(['nothing', 'chair', 'earth']);
    expect(scaleNames(4, 'things', { anchor: 'start', from: 'glitter' })).toEqual(['glitter', 'pinhead', 'key-cap', 'lipstick']);
    expect(scaleNames(3, 'things', { from: 'glitter', to: 'table' })).toEqual(['glitter', 'cup', 'table']);
  });

  it('splits two-word names like any other', () => {
    expect(nameBetween('key-cap', 'lipstick', 'things')).toBe('key-cap_5');
    expect(nameBetween('cup', 'champagne-bottle', 'things')).toBe('wine-glass');
  });
});

describe("value — each value named by its own number", () => {
  it('names irregular number scales by value', () => {
    expect(nameValues([1, 2, 3, 4, 6, 8, 9], 'value').map(([n]) => n)).toEqual(['1', '2', '3', '4', '6', '8', '9']);
    expect(nameValues([0.5, 1.25, -2], 'value').map(([n]) => n)).toEqual(['0_5', '1_25', '-2']);
  });

  it('reads the number of a dimension string', () => {
    expect(nameValues(['1px', '2px', '0.5rem'], 'value')).toEqual([['1', '1px'], ['2', '2px'], ['0_5', '0.5rem']]);
  });

  it('takes a prefix and suffix', () => {
    expect(nameValues([1, 2], 'value', { prefix: 'line-' }).map(([n]) => n)).toEqual(['line-1', 'line-2']);
  });

  it('rejects values without a number, duplicates, and other options', () => {
    expect(() => nameValues(['red'], 'value')).toThrow(/red/);
    expect(() => nameValues([1, 1], 'value')).toThrow(/twice|duplicate/);
    expect(() => nameValues([1, 2], 'value', { anchor: 'range' })).toThrow(/anchor/);
  });

  it('needs values, so scaleNames points to nameValues', () => {
    expect(() => scaleNames(3, 'value')).toThrow(/nameValues/);
    expect(() => scaleNames(3, 'value')).toThrow(TokenError);
  });

  it('splits like a number scheme', () => {
    expect(nameBetween('4', '6', 'value')).toBe('5');
    expect(nameBetween('8', '9', 'value')).toBe('8_5');
  });
});
