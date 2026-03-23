import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { hex } from '../../../src/tokens';
import { closestColor } from '../../../src/functions/color/closest-color';

describe('closestColor', () => {
  it('finds perceptually closest color in scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('red', hex('#ff0000'));
    brand.set('green', hex('#00ff00'));
    brand.set('blue', hex('#0000ff'));

    const ui = book.addScope('ui');
    ui.set('match', closestColor(hex('#ff3333'), brand));

    // #ff3333 is closest to red
    expect(book.resolve('ui.match')).toBe('#ff0000');
  });
});
