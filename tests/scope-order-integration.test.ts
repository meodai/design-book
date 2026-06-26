// tests/scope-order-integration.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px } from '../src/tokens';
import { nth } from '../src/functions/generic/nth';

describe('self-ordering integration', () => {
  it('addScope({ order }) applies the order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space', { order: [{ by: 'value' }] });
    s.set('lg', px(16)); s.set('sm', px(4));
    expect(s.getAllKeys()).toEqual(['sm', 'lg']);
  });

  it('nth honors the canonical order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space', { order: [{ by: 'value' }] });
    s.set('lg', px(16)); s.set('sm', px(4)); s.set('md', px(8));
    s.set('first', nth(s, 0)); // smallest = sm = 4px
    expect(book.resolve('space.first')).toBe('4px');
  });

  it('CSS renderer emits variables in canonical order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space', { order: [{ by: 'value' }] });
    s.set('lg', px(16)); s.set('sm', px(4));
    const css = book.render('css-variables');
    expect(css.indexOf('--space-sm')).toBeLessThan(css.indexOf('--space-lg'));
  });
});
