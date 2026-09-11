import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('a set() rejected for closing a cycle leaves nothing behind', () => {
  it('auto mode leaves no dangling graph node', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');

    expect(() => s.set('n', ref('s.n'))).toThrow(CircularDependencyError);

    expect(book.has('s.n')).toBe(false);
    expect(book.getDependencyGraph().getAllNodes()).not.toContain('s.n');
  });

  it('auto mode keeps a node that already existed', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('a', ref('s.b')); // dangling forward ref creates the s.b node

    expect(() => s.set('b', ref('s.a'))).toThrow(CircularDependencyError);

    expect(s.hasOwn('b')).toBe(false);
    expect(book.getDependencyGraph().getIncoming('s.a')).toContain('s.b');
  });

  it('batch mode drains the rejected key instead of re-reporting it forever', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('n', ref('s.n'));

    const first = book.flush();

    expect(first.errors).toHaveLength(1);
    expect(first.errors[0]).toBeInstanceOf(CircularDependencyError);
    expect(book.batchQueueSize).toBe(0);
    expect(s.hasOwn('n')).toBe(false);
    expect(book.getDependencyGraph().getAllNodes()).not.toContain('s.n');

    const second = book.flush();
    expect(second.errors).toHaveLength(0);
  });

  it('batch mode restores the previous value of a rejected overwrite', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('a', color('#111111'));
    s.set('b', ref('s.a'));
    expect(book.flush().errors).toHaveLength(0);

    s.set('a', ref('s.b')); // would close s.a → s.b → s.a
    const result = book.flush();

    expect(result.errors).toHaveLength(1);
    expect(book.resolve('s.a')).toBe('#111111');
    expect(book.resolve('s.b')).toBe('#111111');
    expect(book.batchQueueSize).toBe(0);
  });
});
