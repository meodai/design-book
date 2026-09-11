import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { bestContrastWith } from '../../../src/functions/color/best-contrast';
import { closestColor } from '../../../src/functions/color/closest-color';

describe('`not` exclusion on inherited candidate pools', () => {
  it('excludes an inherited token named by its source key', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('black', color('#000000'));
    palette.set('grey', color('#767676'));

    // `dark` inherits palette.black, so the candidate's local key is
    // `dark.black` while the author naturally writes `ref('palette.black')`.
    const dark = book.addScope('dark', { extends: 'palette' });

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(color('#ffffff'), dark, { not: [ref('palette.black')] }));

    expect(book.resolve('ui.text')).toBe('#767676');
  });

  it('still excludes by the iterated scope\'s own key', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('black', color('#000000'));
    palette.set('grey', color('#767676'));

    const dark = book.addScope('dark', { extends: 'palette' });

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(color('#ffffff'), dark, { not: [ref('dark.black')] }));

    expect(book.resolve('ui.text')).toBe('#767676');
  });

  it('applies to every scope selector, not just bestContrastWith', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('black', color('#000000'));
    palette.set('white', color('#ffffff'));

    const dark = book.addScope('dark', { extends: 'palette' });

    const ui = book.addScope('ui');
    ui.set('near', closestColor(color('#111111'), dark, { not: [ref('palette.black')] }));

    expect(book.resolve('ui.near')).toBe('#ffffff');
  });
});
