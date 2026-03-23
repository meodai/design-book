import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { px, rem } from '../../../src/tokens';
import { spacingScale } from '../../../src/functions/non-color/spacing-scale';

describe('spacingScale', () => {
  it('multiplies spacing value', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('large', spacingScale(px(8), ui, { multiplier: 2 }));

    expect(book.resolve('ui.large')).toBe('16px');
  });

  it('preserves unit', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('large', spacingScale(rem(1), ui, { multiplier: 3 }));

    expect(book.resolve('ui.large')).toBe('3rem');
  });
});
