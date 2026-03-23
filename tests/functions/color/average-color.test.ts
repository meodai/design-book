import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { averageColor } from '../../../src/functions/color/average-color';

describe('averageColor', () => {
  it('averages colors in scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('black', color('#000000'));
    brand.set('white', color('#ffffff'));

    const ui = book.addScope('ui');
    ui.set('avg', averageColor(brand));

    const result = book.resolve('ui.avg');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns valid hex with single color', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('red', color('#ff0000'));

    const ui = book.addScope('ui');
    ui.set('avg', averageColor(brand));

    expect(book.resolve('ui.avg')).toBe('#ff0000');
  });
});
