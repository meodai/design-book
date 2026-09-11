import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { ScopeError } from '../src/errors';

describe('addScope validates names and extends chains', () => {
  it('rejects a scope that extends itself', () => {
    const book = new DesignBook('test');
    expect(() => book.addScope('a', { extends: 'a' })).toThrow(ScopeError);
    expect(book.hasScope('a')).toBe(false);
  });

  it('rejects an extends chain that loops back to the new scope', () => {
    const book = new DesignBook('test');
    book.addScope('a', { extends: 'b' });
    expect(() => book.addScope('b', { extends: 'a' })).toThrow(ScopeError);
    expect(book.hasScope('b')).toBe(false);
  });

  it('rejects a dotted scope name', () => {
    const book = new DesignBook('test');
    expect(() => book.addScope('a.b')).toThrow(ScopeError);
    expect(book.hasScope('a.b')).toBe(false);
  });

  it('rejects an empty or blank scope name', () => {
    const book = new DesignBook('test');
    expect(() => book.addScope('')).toThrow(ScopeError);
    expect(() => book.addScope('   ')).toThrow(ScopeError);
  });

  it('still allows a normal extends chain', () => {
    const book = new DesignBook('test');
    book.addScope('base');
    book.addScope('mid', { extends: 'base' });
    expect(() => book.addScope('leaf', { extends: 'mid' })).not.toThrow();
  });
});
