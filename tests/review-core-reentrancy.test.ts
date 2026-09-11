import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('a re-entrant change that closes a cycle', () => {
  function setup() {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));
    s.set('y', color('#222222'));
    s.set('z', ref('s.y'));

    const errors: Array<{ key: string; error: Error }> = [];
    book.on('error', (e) => errors.push(e.detail));

    const unsub = book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x') return;
      unsub();
      s.set('y', ref('s.z')); // s.y → s.z → s.y
      s.set('w', px(4));
    });

    return { book, s, errors };
  }

  it('rolls back the offending key, not the key that triggered propagation', () => {
    const { book, s, errors } = setup();

    expect(() => s.set('x', color('#333333'))).not.toThrow();

    expect(book.resolve('s.x')).toBe('#333333');
    expect(book.resolve('s.y')).toBe('#222222');
    expect(book.resolve('s.z')).toBe('#222222');
    expect(errors).toHaveLength(1);
    expect(errors[0].key).toBe('s.y');
    expect(errors[0].error).toBeInstanceOf(CircularDependencyError);
  });

  it('still processes the queued changes that follow the failed one', () => {
    const { book, s } = setup();
    s.set('x', color('#333333'));

    expect(book.resolve('s.w')).toBe('4px');
    expect(book.getDependencyGraph().getAllNodes()).toContain('s.w');
  });

  it('does not replay the stale queue on the next unrelated change', () => {
    const { book, s, errors } = setup();
    s.set('x', color('#333333'));
    expect(errors).toHaveLength(1);

    const later = vi.fn();
    book.watch('s.z', later);
    s.set('y', color('#444444'));

    expect(errors).toHaveLength(1);
    expect(book.resolve('s.z')).toBe('#444444');
    expect(later).toHaveBeenCalledTimes(1);
  });
});
