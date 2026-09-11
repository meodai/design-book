import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { px, rem } from '../../../src/tokens';
import { spacingScale } from '../../../src/functions/non-color/spacing-scale';

describe('spacingScale', () => {
  it('multiplies spacing value', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('large', spacingScale(px(8), { multiplier: 2 }));

    expect(book.resolve('ui.large')).toBe('16px');
  });

  it('preserves unit', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('large', spacingScale(rem(1), { multiplier: 3 }));

    expect(book.resolve('ui.large')).toBe('3rem');
  });

  it('avoids floating point noise', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('tiny', spacingScale(px(0.1), { multiplier: 3 }));

    expect(book.resolve('ui.tiny')).toBe('0.3px');
  });

  it('supports negative bases', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('negative', spacingScale(px(-4), { multiplier: 2 }));

    expect(book.resolve('ui.negative')).toBe('-8px');
  });
});
