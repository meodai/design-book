import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, px, rem, ref } from '../../../src/tokens';
import { furthestFrom } from '../../../src/functions/generic/furthest-from';
import { typography } from '../../../src/functions/non-color/typography';

describe('furthestFrom(target, scope)', () => {
  it('picks the color that looks least like the target', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('red', color('#ff0000'));
    brand.set('orange', color('#ff8800'));
    brand.set('blue', color('#0000ff'));
    const ui = book.addScope('ui');
    ui.set('surface', color('#ee1100'));
    ui.set('accent', furthestFrom(ref('ui.surface'), ref('brand')));
    expect(book.resolve('ui.accent')).toBe('#0000ff');
    // a new target re-routes the pick
    ui.set('surface', color('#0011ee'));
    expect(['#ff8800', '#ff0000']).toContain(book.resolve('ui.accent'));
  });

  it('measures distance in OKLab, not CIE Lab', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    pool.set('lime', color('#34e411'));
    pool.set('rust', color('#cd2506'));
    const ui = book.addScope('ui');
    // CIE Lab puts the lime further from this mist; OKLab the rust.
    ui.set('far', furthestFrom(color('#b7bddc'), ref('pool')));
    expect(book.resolve('ui.far')).toBe('#cd2506');
  });

  it('compares sizes by value, in the target unit only', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', px(4));
    space.set('m', px(16));
    space.set('l', px(40));
    space.set('huge', rem(10)); // another unit: never compared
    space.set('ink', color('#000000')); // another kind: never compared
    const ui = book.addScope('ui');
    ui.set('far', furthestFrom(px(12), ref('space')));
    ui.set('farFromBig', furthestFrom(px(36), ref('space')));
    expect(book.resolve('ui.far')).toBe('40px');
    expect(book.resolve('ui.farFromBig')).toBe('4px');
  });

  it('compares text styles by font size', () => {
    const book = new DesignBook('test');
    const text = book.addScope('text');
    text.set('body', typography({ fontSize: rem(1), lineHeight: 1.5 }));
    text.set('lead', typography({ fontSize: rem(1.25), lineHeight: 1.4 }));
    text.set('display', typography({ fontSize: rem(3), lineHeight: 1.1 }));
    const ui = book.addScope('ui');
    ui.set('apart', furthestFrom(ref('text.body'), ref('text')));
    expect(book.resolve('ui.apart')).toBe(book.resolve('text.display'));
  });

  it('maxDistance takes the furthest member still within it', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    for (const [k, n] of [['a', 4], ['b', 8], ['c', 16], ['d', 32]] as const) space.set(k, px(n));
    const ui = book.addScope('ui');
    ui.set('near', furthestFrom(px(8), ref('space'), { maxDistance: 10 }));
    ui.set('none', furthestFrom(px(100), ref('space'), { maxDistance: 10 }));
    expect(book.resolve('ui.near')).toBe('16px');
    expect(() => book.resolve('ui.none')).toThrow(/no member of scope "space" is within 10px of 100px/);

    const pal = book.addScope('pal');
    pal.set('white', color('#ffffff'));
    pal.set('grey', color('#808080'));
    pal.set('black', color('#000000'));
    ui.set('greyish', furthestFrom(color('#ffffff'), ref('pal'), { maxDistance: 0.5 }));
    expect(book.resolve('ui.greyish')).toBe('#808080');
  });

  it('refuses a negative maxDistance and readableOn on sizes', () => {
    const book = new DesignBook('test');
    book.addScope('space').set('a', px(4));
    expect(() => furthestFrom(px(1), ref('space'), { maxDistance: -1 })).toThrow(/maxDistance/);
    const ui = book.addScope('ui');
    ui.set('x', furthestFrom(px(1), ref('space'), { readableOn: color('#fff') }));
    expect(() => book.resolve('ui.x')).toThrow(/readableOn` applies to colors/);
  });

  it('skips members named in not', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('black', color('#000000'));
    p.set('grey', color('#555555'));
    p.set('white', color('#ffffff'));
    const ui = book.addScope('ui');
    ui.set('far', furthestFrom(color('#ffffff'), ref('p'), { not: [ref('p.black')] }));
    expect(book.resolve('ui.far')).toBe('#555555');
  });
});
