import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { rem } from '../../../src/tokens';
import { typographyScale } from '../../../src/functions/non-color/typography-scale';

describe('typographyScale', () => {
  it('scales up with positive step', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('lg', typographyScale(rem(1), ui, { ratio: 1.25, step: 1 }));

    expect(book.resolve('ui.lg')).toBe('1.25rem');
  });

  it('scales down with negative step', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('sm', typographyScale(rem(1), ui, { ratio: 1.25, step: -1 }));

    expect(book.resolve('ui.sm')).toBe('0.8rem');
  });

  it('step 0 returns base size', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('base', typographyScale(rem(1), ui, { ratio: 1.25, step: 0 }));

    expect(book.resolve('ui.base')).toBe('1rem');
  });
});
