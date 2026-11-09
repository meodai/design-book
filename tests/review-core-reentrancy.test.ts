import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('a listener write that closes a cycle', () => {
  function setup() {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));
    s.set('y', color('#222222'));
    s.set('z', ref('s.y'));

    const refusals: unknown[] = [];
    const unsub = book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x') return;
      unsub();
      try {
        s.set('y', ref('s.z')); // s.y → s.z → s.y
      } catch (error) {
        refusals.push(error);
      }
      s.set('w', px(4));
    });

    return { book, s, refusals };
  }

  it('is refused at once, to the listener; the write it heard stands', () => {
    const { book, s, refusals } = setup();

    expect(() => s.set('x', color('#333333'))).not.toThrow();

    expect(book.resolve('s.x')).toBe('#333333');
    expect(book.resolve('s.y')).toBe('#222222');
    expect(book.resolve('s.z')).toBe('#222222');
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toBeInstanceOf(CircularDependencyError);
  });

  it('does not keep the listener’s later writes from being made and announced', () => {
    const { book, s } = setup();
    const w = vi.fn();
    book.watch('s.w', w);
    s.set('x', color('#333333'));

    expect(book.resolve('s.w')).toBe('4px');
    expect(book.getDependencyGraph().getAllNodes()).toContain('s.w');
    expect(w).toHaveBeenCalledWith('4px', expect.anything());
  });

  it('leaves nothing behind for the next change', () => {
    const { book, s } = setup();
    s.set('x', color('#333333'));

    const later = vi.fn();
    book.watch('s.z', later);
    s.set('y', color('#444444'));

    expect(book.resolve('s.z')).toBe('#444444');
    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe('a listener that throws', () => {
  it('undoes nothing; the change completes and the write throws its error after', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));

    const wWatcher = vi.fn();
    book.watch('s.w', wWatcher);
    const xValues: Array<string | undefined> = [];

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
    // Registered after the one that throws: still hears the change.
    book.watch('s.x', (v) => xValues.push(v));

    expect(() => s.set('x', color('#222222'))).toThrow('handler boom');

    expect(book.resolve('s.x')).toBe('#222222');
    expect(book.resolve('s.w')).toBe('#222222');
    expect(xValues).toEqual(['#222222']);
    expect(wWatcher).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing queued for the next change', () => {
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

  it('the first error wins when several listeners throw', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#111111'));

    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 's.x' || fired) return;
      fired = true;
      s.set('w', px(4));
      throw new Error('the first error');
    });
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 's.w') throw new Error('a later one');
    });

    expect(() => s.set('x', color('#222222'))).toThrow('the first error');
    expect(book.resolve('s.w')).toBe('4px');
  });
});

describe('a refused write', () => {
  it('says nothing: it was refused before it was announced', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));

    expect(() => s.set('n', ref('s.n'))).toThrow();

    expect(keys).toEqual([]);
  });
});
