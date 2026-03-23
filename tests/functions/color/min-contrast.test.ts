import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { minContrastWith } from '../../../src/functions/color/min-contrast';

describe('minContrastWith', () => {
  it('finds color closest to minimum ratio threshold', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('dark', color('#000000'));    // ~21:1 against white
    brand.set('mid', color('#767676'));     // ~4.54:1 against white (just meets AA)
    brand.set('light', color('#cccccc'));   // ~1.6:1 against white (fails AA)

    const ui = book.addScope('ui');
    ui.set('text', minContrastWith(color('#ffffff'), brand, { ratio: 4.5 }));

    // Should pick #767676 — meets 4.5 but closest to threshold
    expect(book.resolve('ui.text')).toBe('#767676');
  });

  it('falls back to highest contrast when none meet minimum', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('light1', color('#eeeeee'));
    brand.set('light2', color('#dddddd'));

    const ui = book.addScope('ui');
    ui.set('text', minContrastWith(color('#ffffff'), brand, { ratio: 4.5 }));

    // Neither meets 4.5, so fallback to highest contrast
    expect(book.resolve('ui.text')).toBe('#dddddd');
  });
});
