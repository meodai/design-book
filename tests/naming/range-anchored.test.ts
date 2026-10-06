import { describe, it, expect } from 'vitest';
import { scaleNames } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('scaleNames — range-anchored schemes', () => {
  it('gives the familiar eleven hundreds at count 11', () => {
    expect(scaleNames(11, 'hundreds')).toEqual(
      ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'],
    );
  });

  it('keeps both ends and spreads symmetrically', () => {
    expect(scaleNames(2, 'hundreds')).toEqual(['50', '950']);
    expect(scaleNames(3, 'hundreds')).toEqual(['50', '500', '950']);
    expect(scaleNames(5, 'hundreds')).toEqual(['50', '300', '500', '700', '950']);
    expect(scaleNames(1, 'hundreds')).toEqual(['500']);
    expect(scaleNames(0, 'hundreds')).toEqual([]);
  });

  it('moves to every 50 above eleven values and every 25 above nineteen', () => {
    const twelve = scaleNames(12, 'hundreds');
    expect(twelve).toHaveLength(12);
    expect(twelve[0]).toBe('50');
    expect(twelve.at(-1)).toBe('950');
    expect(twelve.every((n) => Number(n) % 50 === 0)).toBe(true);
    expect(scaleNames(19, 'hundreds')).toEqual(
      Array.from({ length: 19 }, (_, i) => String(50 + i * 50)),
    );
    const twenty = scaleNames(20, 'hundreds');
    expect(twenty).toHaveLength(20);
    expect(new Set(twenty).size).toBe(20);
    expect(twenty.every((n) => Number(n) % 25 === 0)).toBe(true);
    expect(scaleNames(37, 'hundreds')).toEqual(
      Array.from({ length: 37 }, (_, i) => String(50 + i * 25)),
    );
  });

  it('is strictly increasing at every count', () => {
    for (let n = 2; n <= 37; n++) {
      const names = scaleNames(n, 'hundreds').map(Number);
      for (let i = 1; i < names.length; i++) expect(names[i]).toBeGreaterThan(names[i - 1]);
    }
    for (let n = 2; n <= 21; n++) {
      const names = scaleNames(n, 'tones').map(Number);
      for (let i = 1; i < names.length; i++) expect(names[i]).toBeGreaterThan(names[i - 1]);
    }
  });

  it('spreads tones over 0–100', () => {
    expect(scaleNames(3, 'tones')).toEqual(['0', '50', '100']);
    expect(scaleNames(11, 'tones')).toEqual(['0', '10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);
    expect(scaleNames(21, 'tones').at(1)).toBe('5');
  });

  it('throws past the finest tier', () => {
    expect(() => scaleNames(38, 'hundreds')).toThrow(TokenError);
    expect(() => scaleNames(38, 'hundreds')).toThrow(/37/);
    expect(() => scaleNames(22, 'tones')).toThrow(/21/);
  });
});
