import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { bestContrastWith } from '../../../src/functions/color/best-contrast';

describe('bestContrastWith', () => {
  it('finds highest contrast color from scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('dark', color('#000000'));
    brand.set('light', color('#ffffff'));
    brand.set('mid', color('#808080'));

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(color('#ffffff'), brand));

    // Against white, black has highest contrast
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('works with reference as target', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('bg', color('#ffffff'));
    brand.set('dark', color('#000000'));
    brand.set('light', color('#eeeeee'));

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.bg'), brand));

    expect(book.resolve('ui.text')).toBe('#000000');
  });
});
