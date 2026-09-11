import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color } from '../src/tokens';

describe('every way of creating a scope fires scopeAdded', () => {
  it('extendScope fires scopeAdded', () => {
    const book = new DesignBook('test');
    book.addScope('light');
    const handler = vi.fn();
    book.on('scopeAdded', handler);

    const dark = book.extendScope('dark', 'light', 'dark theme');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.scope).toBe('dark');
    expect(dark.extendsScope).toBe('light');
    expect(dark.description).toBe('dark theme');
  });

  it('copyScope fires scopeAdded', () => {
    const book = new DesignBook('test');
    const source = book.addScope('source');
    source.set('primary', color('#0066cc'));
    const handler = vi.fn();
    book.on('scopeAdded', handler);

    const copy = book.copyScope('source', 'copy');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.scope).toBe('copy');
    expect(copy.hasOwn('primary')).toBe(true);
    expect(book.resolve('copy.primary')).toBe('#0066cc');
  });

  it('extendScope validates like addScope', () => {
    const book = new DesignBook('test');
    expect(() => book.extendScope('a', 'a')).toThrow();
  });
});
