import { describe, it, expect } from 'vitest';
import { nameBetween } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('nameBetween', () => {
  it('returns the midpoint for numeric schemes', () => {
    expect(nameBetween('100', '200', 'hundreds')).toBe('150');
    expect(nameBetween('50', '100', 'hundreds')).toBe('75');
    expect(nameBetween('10', '20', 'ordinal')).toBe('15');
    expect(nameBetween('40', '50', 'tones')).toBe('45');
  });

  it('writes a fractional midpoint with an underscore', () => {
    expect(nameBetween('1', '2', 'ordinal')).toBe('1_5');
    expect(nameBetween('25', '50', 'tones')).toBe('37_5');
  });

  it('joins word and Roman names with a hyphen', () => {
    expect(nameBetween('m', 'l', 'tshirt')).toBe('m-l');
    expect(nameBetween('2xs', 'xs', 'tshirt')).toBe('2xs-xs');
    expect(nameBetween('soft', 'mid', 'intensity')).toBe('soft-mid');
    expect(nameBetween('ii', 'iii', 'roman')).toBe('ii-iii');
    expect(nameBetween('IV', 'V', 'roman')).toBe('IV-V');
    expect(nameBetween('alpha', 'beta', 'greek')).toBe('alpha-beta');
  });

  it('rejects names that are not part of the scheme', () => {
    expect(() => nameBetween('100', 'huge', 'hundreds')).toThrow(TokenError);
    expect(() => nameBetween('0', '100', 'hundreds')).toThrow(/50.*950/);
    expect(() => nameBetween('m', 'huge', 'tshirt')).toThrow(/huge/);
    expect(() => nameBetween('iiii', 'v', 'roman')).toThrow(/iiii/);
    expect(() => nameBetween('ii', 'IV', 'roman')).toThrow();
    expect(() => nameBetween('m-l', 'l', 'tshirt')).toThrow(/m-l/);
    expect(() => nameBetween('1_5', '2', 'ordinal')).toThrow(/1_5/);
  });

  it('rejects names in the wrong order', () => {
    expect(() => nameBetween('200', '100', 'hundreds')).toThrow(/before/);
    expect(() => nameBetween('l', 'm', 'tshirt')).toThrow(/before/);
    expect(() => nameBetween('m', 'm', 'tshirt')).toThrow(/before/);
  });
});
