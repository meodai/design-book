import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { furthestFrom } from '../../../src/functions/color/furthest-from';

describe('furthestFrom', () => {
  it('finds color most distant from others in scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('red1', color('#ff0000'));
    brand.set('red2', color('#ee0000'));
    brand.set('red3', color('#dd0000'));
    brand.set('blue', color('#0000ff'));

    const ui = book.addScope('ui');
    ui.set('outlier', furthestFrom(brand));

    // blue is most different from the reds
    expect(book.resolve('ui.outlier')).toBe('#0000ff');
  });

  it('measures distance in OKLab, not CIE Lab', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    pool.set('lime', color('#34e411'));
    pool.set('rust', color('#cd2506'));
    pool.set('mist', color('#b7bddc'));
    pool.set('sand', color('#d1d5be'));

    const ui = book.addScope('ui');
    ui.set('outlier', furthestFrom(pool));

    // CIE Lab picks the lime; OKLab picks the rust.
    expect(book.resolve('ui.outlier')).toBe('#cd2506');
  });
});
