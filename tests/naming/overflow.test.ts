import { describe, it, expect } from 'vitest';
import { scaleNames, namingScheme } from '../../src/naming';
import { TokenError } from '../../src/errors';

const between = { overflow: 'between' } as const;

describe("scaleNames — overflow: 'between'", () => {
  it('changes nothing while the list still has enough names', () => {
    expect(scaleNames(5, 'paper', between)).toEqual(scaleNames(5, 'paper'));
    expect(scaleNames(9, 'intensity', between)).toEqual(scaleNames(9, 'intensity'));
    expect(scaleNames(11, 'hundreds', between)).toEqual(scaleNames(11, 'hundreds'));
  });

  it('keeps every name and puts one extra step in the middle gap as a half', () => {
    expect(scaleNames(12, 'paper', between)).toEqual(
      ['a10', 'a9', 'a8', 'a7', 'a6', 'a6_5', 'a5', 'a4', 'a3', 'a2', 'a1', 'a0'],
    );
  });

  it('names several extras in one gap as fractions of the way to the next name', () => {
    const two = namingScheme(['low', 'high']);
    expect(scaleNames(3, two, between)).toEqual(['low', 'low_5', 'high']);
    expect(scaleNames(4, two, between)).toEqual(['low', 'low_33', 'low_67', 'high']);
    expect(scaleNames(5, two, between)).toEqual(['low', 'low_25', 'low_5', 'low_75', 'high']);
  });

  it('spreads extras evenly over the gaps', () => {
    const names = scaleNames(47, 'greek', between);
    expect(names).toHaveLength(47);
    expect(names[0]).toBe('alpha');
    expect(names.at(-1)).toBe('omega');
    expect(new Set(names).size).toBe(47);
    // 23 extras over 23 gaps: one after each name but the last
    expect(names.filter((n) => n.endsWith('_5'))).toHaveLength(23);
  });

  it('fills each side of a base-anchored list on its own', () => {
    expect(scaleNames(13, 'intensity', between)).toEqual([
      'hint', 'hint_5', 'faint', 'subtle', 'subtle_5', 'soft', 'mid',
      'mid_5', 'firm', 'bold', 'bold_5', 'strong', 'intense',
    ]);
    // dynamics has 3 names above mf; ask for 5 above
    const d = scaleNames(6, 'dynamics', { base: [0, 'mf'], overflow: 'between' });
    expect(d[0]).toBe('mf');
    expect(d.at(-1)).toBe('fff');
    expect(d).toHaveLength(6);
  });

  it('works with a base pair', () => {
    const names = scaleNames(12, 'intensity', { base: [2, 'soft'], overflow: 'between' });
    expect(names[2]).toBe('soft');
    expect(names[0]).toBe('hint');
    expect(names.at(-1)).toBe('intense');
    expect(names).toHaveLength(12);
  });

  it('keeps halving the step of a range scheme past its finest tier', () => {
    const names = scaleNames(40, 'hundreds', between);
    expect(names).toHaveLength(40);
    expect(names[0]).toBe('50');
    expect(names.at(-1)).toBe('950');
    expect(new Set(names).size).toBe(40);
    expect(names.some((n) => n.includes('_'))).toBe(true);
    const values = names.map((n) => Number(n.replace('_', '.')));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
    expect(scaleNames(30, 'tones', between)).toHaveLength(30);
  });

  it('halves around a base pair on a range scheme too', () => {
    const names = scaleNames(20, 'tones', { base: [18, '50'], overflow: 'between' });
    expect(names[18]).toBe('50');
    expect(names[0]).toBe('0');
    expect(names.at(-1)).toBe('100');
    expect(new Set(names).size).toBe(20);
  });

  it('only accepts throw or between, and only where a list can run out', () => {
    expect(() => scaleNames(30, 'greek', { overflow: 'throw' })).toThrow(TokenError);
    expect(() => scaleNames(3, 'greek', { overflow: 'more' as any })).toThrow(/overflow/);
    expect(() => scaleNames(3, 'tshirt', between)).toThrow(/overflow/);
    expect(() => scaleNames(3, 'ordinal', between)).toThrow(/overflow/);
  });
});
