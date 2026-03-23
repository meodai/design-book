import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { hex } from '../../../src/tokens';
import { furthestFrom } from '../../../src/functions/color/furthest-from';

describe('furthestFrom', () => {
  it('finds color most distant from others in scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('red1', hex('#ff0000'));
    brand.set('red2', hex('#ee0000'));
    brand.set('red3', hex('#dd0000'));
    brand.set('blue', hex('#0000ff'));

    const ui = book.addScope('ui');
    ui.set('outlier', furthestFrom(brand));

    // blue is most different from the reds
    expect(book.resolve('ui.outlier')).toBe('#0000ff');
  });
});
