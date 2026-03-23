import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { hex } from '../../../src/tokens';
import { darken } from '../../../src/functions/color/darken';

describe('darken', () => {
  it('darkens a color', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');

    const ui = book.addScope('ui');
    ui.set('darker', darken(hex('#cccccc'), { amount: 0.2 }));

    const result = book.resolve('ui.darker');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#cccccc');
  });

  it('clamps at black', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('dark', darken(hex('#000000'), { amount: 0.5 }));

    expect(book.resolve('ui.dark')).toBe('#000000');
  });
});
