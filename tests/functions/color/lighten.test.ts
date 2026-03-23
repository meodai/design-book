import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { lighten } from '../../../src/functions/color/lighten';

describe('lighten', () => {
  it('lightens a color', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('dark', color('#333333'));

    const ui = book.addScope('ui');
    ui.set('lighter', lighten(color('#333333'), { amount: 0.2 }));

    const result = book.resolve('ui.lighter');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    // Should be lighter than #333333
    expect(result).not.toBe('#333333');
  });
});
