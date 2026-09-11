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

describe('a handler that throws does not discard what was queued behind it', () => {
  it('still wires up and emits the queued change', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));

    const wWatcher = vi.fn();
    book.watch('s.w', wWatcher);

    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x' || fired) return;
      s.set('w', px(4));
    });
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x' || fired) return;
      fired = true;
      throw new Error('handler boom');
    });

    expect(() => s.set('x', color('#222222'))).toThrow('handler boom');

    // s.x is rolled back by Scope.set, but the queued s.w must not be orphaned
    expect(book.resolve('s.x')).toBe('#111111');
    expect(book.resolve('s.w')).toBe('4px');
    expect(book.getDependencyGraph().getAllNodes()).toContain('s.w');
    expect(wWatcher).toHaveBeenCalledTimes(1);
  });

  it('leaves the queue empty for the next change', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));

    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x' || fired) return;
      fired = true;
      s.set('w', px(4));
      throw new Error('handler boom');
    });

    expect(() => s.set('x', color('#222222'))).toThrow('handler boom');

    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));
    s.set('x', color('#333333'));

    expect(keys).toEqual(['s.x']);
  });
});

describe('a change that is announced and then rolled back is corrected', () => {
  it('re-announces the restored value so watchers do not keep a dead one', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));

    const wValues: Array<string | undefined> = [];
    book.watch('s.w', (v) => wValues.push(v));

    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x' || fired) return;
      s.set('w', ref('s.x'));
    });
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x' || fired) return;
      fired = true;
      throw new Error('handler boom');
    });

    expect(() => s.set('x', color('#222222'))).toThrow('handler boom');

    expect(book.resolve('s.x')).toBe('#111111');
    expect(book.resolve('s.w')).toBe('#111111');
    // the drain announced s.w while s.x was still #222222; the final value
    // must be announced too, or every watcher keeps a value that is gone
    expect(wValues).toContain('#222222');
    expect(wValues[wValues.length - 1]).toBe('#111111');
  });

  it('says nothing when the change was refused before it was announced', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));

    expect(() => s.set('n', ref('s.n'))).toThrow();

    expect(keys).toEqual([]);
  });
});
