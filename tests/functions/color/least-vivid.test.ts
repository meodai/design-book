import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { leastVivid } from '../../../src/functions/color/least-vivid';

describe('leastVivid', () => {
  it('picks the lowest-chroma colour in the scope', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('gray',   color('#808080')); // chroma ~ 0
    palette.set('pastel', color('#f7c8c5')); // low chroma
    palette.set('vivid',  color('#ff0000')); // high chroma red

    const ui = book.addScope('ui');
    ui.set('surface', leastVivid(palette));

    expect(book.resolve('ui.surface')).toBe('#808080');
  });

  it('uses OKLCH chroma, not HSL saturation', () => {
    // #ffe4e1 (misty rose) has HSL saturation 1.0 but very low OKLCH chroma.
    // #b0c4de (steel blue) has lower HSL saturation but higher OKLCH chroma.
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('mistyRose', color('#ffe4e1'));
    palette.set('steelBlue', color('#b0c4de'));

    const ui = book.addScope('ui');
    ui.set('surface', leastVivid(palette));

    expect(book.resolve('ui.surface')).toBe('#ffe4e1');
  });

  it('respects a minContrast gate against a target', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    // Both are muted; only one clears 4.5 contrast vs white.
    palette.set('paleGray', color('#dddddd')); // very low chroma, ~1.3 contrast vs white
    palette.set('midGray',  color('#666666')); // low chroma, ~5.7 contrast vs white
    palette.set('navy',     color('#1d4eb8')); // higher chroma, ~8.1 contrast vs white

    const ui = book.addScope('ui');
    ui.set('caption', leastVivid(palette, {
      against: color('#ffffff'),
      minContrast: 4.5,
    }));

    // paleGray is the most muted but fails the gate; midGray is the most
    // muted candidate that clears 4.5.
    expect(book.resolve('ui.caption')).toBe('#666666');
  });

  it('falls back to highest contrast when nothing meets minContrast', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('paleA', color('#ffeeee')); // ~1.05 contrast vs white
    palette.set('paleB', color('#eeeeff')); // ~1.07 contrast vs white

    const ui = book.addScope('ui');
    ui.set('caption', leastVivid(palette, {
      against: color('#ffffff'),
      minContrast: 4.5,
    }));

    expect(book.resolve('ui.caption')).toBe('#eeeeff');
  });

  it('accepts a ref as the contrast target', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('surface', color('#ffffff'));
    palette.set('mute',    color('#666666'));
    palette.set('vivid',   color('#1d4eb8'));

    const ui = book.addScope('ui');
    ui.set('caption', leastVivid(palette, {
      against: ref('palette.surface'),
      minContrast: 4.5,
    }));

    // mute is more muted than vivid and clears 4.5.
    expect(book.resolve('ui.caption')).toBe('#666666');
  });
});
