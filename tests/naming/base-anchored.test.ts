import { describe, it, expect } from 'vitest';
import { scaleNames } from '../../src/naming';
import { TokenError } from '../../src/errors';

describe('scaleNames — base-anchored schemes', () => {
  it('centres t-shirt sizes on m', () => {
    expect(scaleNames(1, 'tshirt')).toEqual(['m']);
    expect(scaleNames(3, 'tshirt')).toEqual(['s', 'm', 'l']);
    expect(scaleNames(5, 'tshirt')).toEqual(['xs', 's', 'm', 'l', 'xl']);
    expect(scaleNames(9, 'tshirt')).toEqual(['3xs', '2xs', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl']);
  });

  it('puts the extra step of an even count on the larger side', () => {
    expect(scaleNames(2, 'tshirt')).toEqual(['m', 'l']);
    expect(scaleNames(4, 'tshirt')).toEqual(['s', 'm', 'l', 'xl']);
  });

  it('lets base pick which value gets the base name, for lopsided scales', () => {
    expect(scaleNames(6, 'tshirt', { base: 1 })).toEqual(['s', 'm', 'l', 'xl', '2xl', '3xl']);
    expect(scaleNames(3, 'tshirt', { base: 0 })).toEqual(['m', 'l', 'xl']);
    expect(scaleNames(3, 'tshirt', { base: 2 })).toEqual(['xs', 's', 'm']);
  });

  it('rejects a base outside the values', () => {
    expect(() => scaleNames(3, 'tshirt', { base: 3 })).toThrow(/base/);
    expect(() => scaleNames(3, 'tshirt', { base: -1 })).toThrow(/base/);
    expect(() => scaleNames(3, 'tshirt', { base: 1.5 })).toThrow(/base/);
  });

  it('uses every name of a fixed list at its natural length', () => {
    expect(scaleNames(9, 'intensity')).toEqual(
      ['hint', 'faint', 'subtle', 'soft', 'mid', 'firm', 'bold', 'strong', 'intense'],
    );
    expect(scaleNames(8, 'dynamics')).toEqual(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff']);
    expect(scaleNames(9, 'weights', { base: 3 })).toEqual(
      ['thin', 'extralight', 'light', 'regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'],
    );
  });

  it('keeps the outermost names and spreads evenly towards the base', () => {
    expect(scaleNames(3, 'intensity')).toEqual(['hint', 'mid', 'intense']);
    expect(scaleNames(4, 'intensity', { base: [1, 'mid'] })).toEqual(['hint', 'mid', 'bold', 'intense']);
    expect(scaleNames(5, 'intensity')).toEqual(['hint', 'subtle', 'mid', 'bold', 'intense']);
    // three of the four names above mid: positions round(4/3)=1, round(8/3)=3, 4
    expect(scaleNames(4, 'intensity', { base: [0, 'mid'] })).toEqual(['mid', 'firm', 'strong', 'intense']);
    // a bare index steps outward from the centre instead
    expect(scaleNames(4, 'intensity', { base: 1 })).toEqual(['soft', 'mid', 'firm', 'bold']);
  });

  it('throws when one side needs more names than the list has there', () => {
    expect(() => scaleNames(10, 'intensity')).toThrow(TokenError);
    // dynamics has 4 names below mf and 3 above
    expect(() => scaleNames(5, 'dynamics', { base: [0, 'mf'] })).toThrow(/3 above/);
    expect(() => scaleNames(6, 'dynamics', { base: [5, 'mf'] })).toThrow(/4 below/);
    expect(() => scaleNames(5, 'dynamics', { base: 0 })).toThrow(/3 above/);
  });

  it('rejects base on roman, which has no middle', () => {
    expect(() => scaleNames(3, 'roman', { base: 1 })).toThrow(/base/);
  });
});
