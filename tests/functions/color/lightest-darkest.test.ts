import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { lightest, darkest } from '../../../src/functions/color/lightest-darkest';

describe('lightest / darkest', () => {
  function palette() {
    const book = new DesignBook('test');
    const p = book.addScope('palette');
    p.set('ink',   color('#111111'));
    p.set('mid',   color('#777777'));
    p.set('paper', color('#fafafa'));
    p.set('red',   color('#ff0000'));
    return { book, p, ui: book.addScope('ui') };
  }

  it('picks the highest and lowest OKLCH lightness in the scope', () => {
    const { book, p, ui } = palette();
    ui.set('bg', lightest(p));
    ui.set('fg', darkest(p));

    expect(book.resolve('ui.bg')).toBe('#fafafa');
    expect(book.resolve('ui.fg')).toBe('#111111');
  });

  it('uses OKLCH lightness, not HSL lightness', () => {
    // #8080ff has HSL lightness 75%, #ffff00 only 50% — but yellow is far
    // lighter to the eye, and its OKLCH L (~0.97) says so.
    const book = new DesignBook('test');
    const p = book.addScope('palette');
    p.set('periwinkle', color('#8080ff'));
    p.set('yellow',     color('#ffff00'));

    const ui = book.addScope('ui');
    ui.set('bg', lightest(p));
    expect(book.resolve('ui.bg')).toBe('#ffff00');
  });

  it('uses OKLCH lightness, not WCAG luminance', () => {
    // WCAG luminance ranks #00a0a0 (0.277) above #8080ff (0.273);
    // OKLCH L ranks #8080ff (0.661) above #00a0a0 (0.639).
    const book = new DesignBook('test');
    const p = book.addScope('palette');
    p.set('teal',       color('#00a0a0'));
    p.set('periwinkle', color('#8080ff'));

    const ui = book.addScope('ui');
    ui.set('bg', lightest(p));
    ui.set('fg', darkest(p));
    expect(book.resolve('ui.bg')).toBe('#8080ff');
    expect(book.resolve('ui.fg')).toBe('#00a0a0');
  });

  it('skips keys listed in `not`', () => {
    const { book, p, ui } = palette();
    ui.set('bg', lightest(p, { not: [ref('palette.paper')] }));
    ui.set('fg', darkest(p, { not: ['palette.ink'] }));

    expect(book.resolve('ui.bg')).toBe('#ff0000'); // red L 0.63 > mid L 0.57
    expect(book.resolve('ui.fg')).toBe('#777777');
  });

  it('follows changes to the scope it iterates', () => {
    const { book, p, ui } = palette();
    ui.set('bg', lightest(p));
    p.set('white', color('#ffffff'));
    expect(book.resolve('ui.bg')).toBe('#ffffff');
  });

  it('keeps alpha on a translucent winner', () => {
    const book = new DesignBook('test');
    const p = book.addScope('palette');
    p.set('veil', color('rgba(255, 255, 255, 0.5)'));
    p.set('gray', color('#808080'));

    const ui = book.addScope('ui');
    ui.set('bg', lightest(p));
    expect(book.resolve('ui.bg')).toBe('#ffffff80');
  });

  it('throws when the scope has no colors', () => {
    const book = new DesignBook('test');
    const empty = book.addScope('empty');
    const ui = book.addScope('ui');
    ui.set('bg', lightest(empty));
    expect(() => book.resolve('ui.bg')).toThrow(/lightest: no valid color candidates/);
  });
});
