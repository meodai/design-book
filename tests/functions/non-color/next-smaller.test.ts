import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { px, rem, ms, ref } from '../../../src/tokens';
import { nextSmaller } from '../../../src/functions/non-color/next-smaller';

describe('nextSmaller', () => {
  it('picks the next-smaller member of the scope', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('xs', px(4));
    space.set('s',  px(8));
    space.set('m',  px(12));
    space.set('l',  px(16));
    space.set('xl', px(24));

    const ui = book.addScope('ui');
    ui.set('breath', nextSmaller(ref('space.l'), space));

    expect(book.resolve('ui.breath')).toBe('12px');
  });

  it('respects minDistance', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('xs', px(4));
    space.set('s',  px(8));
    space.set('m',  px(12));
    space.set('l',  px(16));
    space.set('xl', px(24));

    const ui = book.addScope('ui');
    // m = 12 is only 4 below l = 16; minDistance of 6 forces s = 8.
    ui.set('breath', nextSmaller(ref('space.l'), space, { minDistance: 6 }));

    expect(book.resolve('ui.breath')).toBe('8px');
  });

  it('works with rem units', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', rem(0.5));
    space.set('m', rem(1));
    space.set('l', rem(1.5));

    const ui = book.addScope('ui');
    ui.set('breath', nextSmaller(ref('space.l'), space));

    expect(book.resolve('ui.breath')).toBe('1rem');
  });

  it('works with timing units (ms)', () => {
    const book = new DesignBook('test');
    const motion = book.addScope('motion');
    motion.set('fast',   ms(100));
    motion.set('normal', ms(200));
    motion.set('slow',   ms(400));

    const ui = book.addScope('ui');
    ui.set('exit', nextSmaller(ref('motion.slow'), motion));

    expect(book.resolve('ui.exit')).toBe('200ms');
  });

  it('throws when no smaller member exists', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', px(4));
    space.set('m', px(8));

    const ui = book.addScope('ui');
    ui.set('breath', nextSmaller(ref('space.s'), space));

    expect(() => book.resolve('ui.breath')).toThrow(/no member of scope "space" is smaller/);
  });

  it('respects the not option', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('xs', px(4));
    space.set('s',  px(8));
    space.set('m',  px(12));
    space.set('l',  px(16));

    const ui = book.addScope('ui');
    ui.set('breath', nextSmaller(ref('space.l'), space, { not: ['space.m'] }));

    expect(book.resolve('ui.breath')).toBe('8px');
  });
});
