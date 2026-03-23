import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { closestColor } from '../../../src/functions/color/closest-color';

describe('closestColor', () => {
  it('finds perceptually closest color in scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('red', color('#ff0000'));
    brand.set('green', color('#00ff00'));
    brand.set('blue', color('#0000ff'));

    const ui = book.addScope('ui');
    ui.set('match', closestColor(color('#ff3333'), brand));

    // #ff3333 is closest to red
    expect(book.resolve('ui.match')).toBe('#ff0000');
  });
});
