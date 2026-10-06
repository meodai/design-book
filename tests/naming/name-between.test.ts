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

  it('names a step between neighbours as a fraction, like overflow does', () => {
    expect(nameBetween('m', 'l', 'tshirt')).toBe('m_5');
    expect(nameBetween('2xs', 'xs', 'tshirt')).toBe('2xs_5');
    expect(nameBetween('soft', 'mid', 'intensity')).toBe('soft_5');
    expect(nameBetween('ii', 'iii', 'roman')).toBe('ii_5');
    expect(nameBetween('IV', 'V', 'roman')).toBe('IV_5');
    expect(nameBetween('alpha', 'beta', 'greek')).toBe('alpha_5');
  });

  it('returns the real name in the middle when there is one', () => {
    expect(nameBetween('hint', 'mid', 'intensity')).toBe('subtle');
    expect(nameBetween('s', 'l', 'tshirt')).toBe('m');
    expect(nameBetween('ii', 'iv', 'roman')).toBe('iii');
    expect(nameBetween('tardigrade', 'flea', 'creatures')).toBe('mite');
  });

  it('splits its own in-between names again', () => {
    expect(nameBetween('soft', 'soft_5', 'intensity')).toBe('soft_25');
    expect(nameBetween('soft_5', 'mid', 'intensity')).toBe('soft_75');
    expect(nameBetween('m', 'm_5', 'tshirt')).toBe('m_25');
    expect(nameBetween('xs_5', 's', 'tshirt')).toBe('xs_75');
  });

  it('rejects names that are not part of the scheme', () => {
    expect(() => nameBetween('100', 'huge', 'hundreds')).toThrow(TokenError);
    expect(() => nameBetween('m', 'huge', 'tshirt')).toThrow(/huge/);
    expect(() => nameBetween('iiii', 'v', 'roman')).toThrow(/iiii/);
    expect(() => nameBetween('ii', 'IV', 'roman')).toThrow();
    expect(() => nameBetween('m-l', 'l', 'tshirt')).toThrow(/m-l/);
    expect(() => nameBetween('huge_5', 'l', 'tshirt')).toThrow(/huge_5/);
  });

  it('keeps splitting numeric names, including its own and negative ones', () => {
    expect(nameBetween('125', '162_5', 'hundreds')).toBe('143_75');
    expect(nameBetween('1_5', '2', 'ordinal')).toBe('1_75');
    expect(nameBetween('-100', '0', 'hundreds')).toBe('-50');
    expect(nameBetween('-1', '0', 'ordinal')).toBe('-0_5');
    expect(nameBetween('0', '0_25', 'unit')).toBe('0_125');
    expect(nameBetween('-0_5', '0', 'signed')).toBe('-0_25');
  });

  it('rejects names in the wrong order', () => {
    expect(() => nameBetween('200', '100', 'hundreds')).toThrow(/before/);
    expect(() => nameBetween('l', 'm', 'tshirt')).toThrow(/before/);
    expect(() => nameBetween('m', 'm', 'tshirt')).toThrow(/before/);
  });
});
