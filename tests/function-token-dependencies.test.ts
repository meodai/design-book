import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, createFunctionToken, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('a function token built without metadata.dependencies', () => {
  function setup() {
    const book = new DesignBook('test');
    book.registerFunction('ident', (v: unknown) => String(v));
    const a = book.addScope('a');
    a.set('x', color('#111111'));
    a.set('y', createFunctionToken('ident', [ref('a.x')]));
    return { book, a };
  }

  it('depends on the references in its args', () => {
    const { book, a } = setup();
    expect(book.getDependencyGraph().getIncoming('a.y')).toEqual(['a.x']);

    const watcher = vi.fn();
    book.watch('a.y', watcher);
    a.set('x', color('#222222'));
    expect(watcher).toHaveBeenCalledWith('#222222', expect.anything());
  });

  it('is part of cycle detection', () => {
    const { a } = setup();
    expect(() => a.set('x', ref('a.y'))).toThrow(CircularDependencyError);
  });

  it('counts towards getScopeDependencies', () => {
    const { book } = setup();
    const o = book.addScope('o');
    o.set('z', createFunctionToken('ident', [ref('a.x')]));
    expect(book.getScopeDependencies('o')).toEqual(['a.x']);
  });

  it('keeps declared dependencies that are not in its args', () => {
    const { book, a } = setup();
    a.set('w', color('#333333'));
    a.set('v', createFunctionToken('ident', [ref('a.x')], {
      metadata: { dependencies: ['a.w'], visualDependencies: [] },
    }));
    expect(book.getDependencyGraph().getIncoming('a.v').sort()).toEqual(['a.w', 'a.x']);
  });
});
