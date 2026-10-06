import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { leastVivid } from '../../../src/functions/color/least-vivid';

describe('leastVivid', () => {
  it('picks the lowest-chroma color in the scope', () => {
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
});
