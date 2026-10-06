import { describe, it, expect } from 'vitest';
import { scaleNames, namingScheme } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('scaleNames — base as [index, name]', () => {
  it('puts a chosen name on a chosen value of a range scheme, keeping both ends', () => {
    const names = scaleNames(7, 'hundreds', { base: [2, '500'] });
    expect(names[0]).toBe('50');
    expect(names[2]).toBe('500');
    expect(names.at(-1)).toBe('950');
    expect(names).toHaveLength(7);
    expect(names.map(Number)).toEqual([...names.map(Number)].sort((a, b) => a - b));
    expect(names).toEqual(['50', '300', '500', '600', '700', '900', '950']);
  });

  it('spreads each side of the base over its own part of the range', () => {
    expect(scaleNames(3, 'hundreds', { base: [1, '700'] })).toEqual(['50', '700', '950']);
    expect(scaleNames(5, 'tones', { base: [1, '40'] })).toEqual(['0', '40', '60', '80', '100']);
    expect(scaleNames(1, 'hundreds', { base: [0, '600'] })).toEqual(['600']);
  });

  it('lets the base be the first or last value', () => {
    expect(scaleNames(3, 'hundreds', { base: [0, '500'] })).toEqual(['500', '700', '950']);
    expect(scaleNames(3, 'hundreds', { base: [2, '500'] })).toEqual(['50', '300', '500']);
  });

  it('moves to a finer tier when a side needs more rungs, or when the name is only there', () => {
    // 150 only exists from the second tier on
    expect(scaleNames(3, 'hundreds', { base: [1, '150'] })).toEqual(['50', '150', '950']);
    // seven values below 300: the coarse tier has only 50,100,200 under it
    const names = scaleNames(9, 'hundreds', { base: [7, '300'] });
    expect(names[7]).toBe('300');
    expect(new Set(names).size).toBe(9);
  });

  it('throws when a side cannot fit, or the name is not in the range', () => {
    expect(() => scaleNames(9, 'hundreds', { base: [8, '100'] })).toThrow(TokenError);
    expect(() => scaleNames(9, 'hundreds', { base: [8, '100'] })).toThrow(/100/);
    expect(() => scaleNames(3, 'hundreds', { base: [1, '42'] })).toThrow(/42/);
    expect(() => scaleNames(3, 'hundreds', { base: [1, '1000'] })).toThrow(/1000/);
  });

  it('moves the base name of a base-anchored scheme', () => {
    expect(scaleNames(3, 'tshirt', { base: [1, 'l'] })).toEqual(['m', 'l', 'xl']);
    expect(scaleNames(4, 'tshirt', { base: [0, 'xs'] })).toEqual(['xs', 's', 'm', 'l']);
    expect(scaleNames(3, 'intensity', { base: [1, 'soft'] })).toEqual(['hint', 'soft', 'intense']);
    const ink = namingScheme(['hint', 'mid', 'bold', 'heavy'], { base: 'mid' });
    expect(scaleNames(2, ink, { base: [0, 'bold'] })).toEqual(['bold', 'heavy']);
  });

  it('rejects a base name the scheme does not have', () => {
    expect(() => scaleNames(3, 'tshirt', { base: [1, 'huge'] })).toThrow(/huge/);
    expect(() => scaleNames(3, 'intensity', { base: [1, 'loud'] })).toThrow(/loud/);
  });

  it('needs a name for roman, and centres a plain list on its middle name', () => {
    expect(() => scaleNames(3, 'roman', { base: 1 })).toThrow(/base/);
    expect(scaleNames(3, 'creatures', { base: 1 })).toEqual(['rabbit', 'cat', 'fox']);
  });

  it('validates the pair', () => {
    expect(() => scaleNames(3, 'hundreds', { base: [3, '500'] })).toThrow(/base/);
    expect(() => scaleNames(3, 'hundreds', { base: [1] as any })).toThrow(/base/);
  });
});
