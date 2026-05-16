import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { px, rem, ms, ref } from '../../../src/tokens';
import { nextLarger } from '../../../src/functions/non-color/next-larger';

describe('nextLarger', () => {
  it('picks the next-larger member of the scope', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('xs', px(4));
    space.set('s',  px(8));
    space.set('m',  px(12));
    space.set('l',  px(16));
    space.set('xl', px(24));

    const ui = book.addScope('ui');
    ui.set('gap', nextLarger(ref('space.m'), space));

    expect(book.resolve('ui.gap')).toBe('16px');
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
    // l = 16 is only 4 away from m = 12, so a minDistance of 6 should skip
    // to xl = 24.
    ui.set('gap', nextLarger(ref('space.m'), space, { minDistance: 6 }));

    expect(book.resolve('ui.gap')).toBe('24px');
  });

  it('works with rem units', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', rem(0.5));
    space.set('m', rem(1));
    space.set('l', rem(1.5));

    const ui = book.addScope('ui');
    ui.set('gap', nextLarger(ref('space.s'), space));

    expect(book.resolve('ui.gap')).toBe('1rem');
  });

  it('works with timing units (ms)', () => {
    const book = new DesignBook('test');
    const motion = book.addScope('motion');
    motion.set('fast',   ms(100));
    motion.set('normal', ms(200));
    motion.set('slow',   ms(400));

    const ui = book.addScope('ui');
    ui.set('enter', nextLarger(ref('motion.fast'), motion));

    expect(book.resolve('ui.enter')).toBe('200ms');
  });

  it('throws when no larger member exists', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', px(4));
    space.set('m', px(8));

    const ui = book.addScope('ui');
    ui.set('gap', nextLarger(ref('space.m'), space));

    expect(() => book.resolve('ui.gap')).toThrow(/no member of scope "space" is larger/);
  });

  it('throws when units do not match', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', px(8));
    space.set('m', rem(1));

    const ui = book.addScope('ui');
    ui.set('gap', nextLarger(ref('space.s'), space));

    expect(() => book.resolve('ui.gap')).toThrow(/unit mismatch/);
  });

  it('respects the not option', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('xs', px(4));
    space.set('s',  px(8));
    space.set('m',  px(12));
    space.set('l',  px(16));

    const ui = book.addScope('ui');
    ui.set('gap', nextLarger(ref('space.s'), space, { not: ['space.m'] }));

    expect(book.resolve('ui.gap')).toBe('16px');
  });
});
