import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { mostVivid } from '../../../src/functions/color/most-vivid';

describe('mostVivid', () => {
  it('picks the highest-chroma colour in the scope', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('gray',   color('#808080')); // chroma ~ 0
    palette.set('pastel', color('#f7c8c5')); // low chroma
    palette.set('vivid',  color('#ff0000')); // high chroma red

    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(palette));

    expect(book.resolve('ui.accent')).toBe('#ff0000');
  });

  it('uses OKLCH chroma, not HSL saturation', () => {
    // #ffe4e1 (misty rose) has HSL saturation 1.0 but very low OKLCH chroma.
    // #b0c4de (steel blue) has lower HSL saturation but higher OKLCH chroma.
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('mistyRose',  color('#ffe4e1'));
    palette.set('steelBlue',  color('#b0c4de'));

    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(palette));

    expect(book.resolve('ui.accent')).toBe('#b0c4de');
  });

  it('respects a minContrast gate against a target', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('lightVivid', color('#ffff00')); // yellow: high chroma, ~1.07 contrast vs white
    palette.set('darkVivid',  color('#1d4eb8')); // navy: lower chroma, ~8.1 contrast vs white

    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(palette, {
      against: color('#ffffff'),
      minContrast: 4.5,
    }));

    // Yellow has higher chroma but fails the contrast gate; navy wins.
    expect(book.resolve('ui.accent')).toBe('#1d4eb8');
  });

  it('falls back to highest contrast when nothing meets minContrast', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('paleA', color('#ffeeee')); // ~1.05 contrast vs white
    palette.set('paleB', color('#eeeeff')); // ~1.07 contrast vs white

    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(palette, {
      against: color('#ffffff'),
      minContrast: 4.5,
    }));

    // Neither meets the threshold — falls back to the higher-contrast option.
    expect(book.resolve('ui.accent')).toBe('#eeeeff');
  });

  it('accepts a ref as the contrast target', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('surface', color('#ffffff'));
    palette.set('vivid',   color('#1d4eb8'));
    palette.set('pastel',  color('#cccccc'));

    const ui = book.addScope('ui');
    ui.set('link', mostVivid(palette, {
      against: ref('palette.surface'),
      minContrast: 4.5,
    }));

    expect(book.resolve('ui.link')).toBe('#1d4eb8');
  });
});
