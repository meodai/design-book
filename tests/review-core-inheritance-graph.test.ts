import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('inherited keys participate in the dependency graph', () => {
  it('a change to the parent reaches a dependent of the inherited key', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    book.addScope('child', { extends: 'parent' });
    const other = book.addScope('other');

    parent.set('a', color('#ff0000'));
    other.set('x', ref('child.a'));

    expect(book.getDependencyGraph().getIncoming('child.a')).toContain('parent.a');

    const watcher = vi.fn();
    book.watch('other.x', watcher);

    parent.set('a', color('#00ff00'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('other.x')).toBe('#00ff00');
  });

  it('rejects a cycle that closes through inheritance', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    const child = book.addScope('child', { extends: 'parent' });

    parent.set('a', ref('child.b'));

    expect(() => child.set('b', ref('child.a'))).toThrow(CircularDependencyError);
    expect(child.hasOwn('b')).toBe(false);
    expect(book.getDependencyGraph().getIncoming('child.b')).toEqual([]);
  });

  it('addScope({extends}) links parent keys that already have dependents', () => {
    const book = new DesignBook('test');
    const other = book.addScope('other');
    other.set('x', ref('child.a')); // dangling forward reference

    const parent = book.addScope('parent');
    parent.set('a', color('#ff0000'));

    book.addScope('child', { extends: 'parent' });

    expect(book.getDependencyGraph().getIncoming('child.a')).toContain('parent.a');

    const watcher = vi.fn();
    book.watch('other.x', watcher);
    parent.set('a', color('#00ff00'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('other.x')).toBe('#00ff00');
  });
});
