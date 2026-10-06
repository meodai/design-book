import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import type { TokenChangedDetail } from '../src/design-book';
import { color, px, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('several re-entrant writes to one key', () => {
  function setup() {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('y', color('#111111'));
    const c222 = color('#222222');
    const selfRef = ref('a.y');

    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 'a.t' || fired) return;
      fired = true;
      a.set('y', c222);
      a.set('y', selfRef); // closes a cycle, rejected when drained
    });

    const yEvents: TokenChangedDetail[] = [];
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.y') yEvents.push(e.detail);
    });
    const errors: Array<{ key: string; error: Error }> = [];
    book.on('error', (e) => errors.push(e.detail));

    return { book, a, c222, selfRef, yEvents, errors };
  }

  it('are replayed in order, each against its own value', () => {
    const { book, a, c222, errors } = setup();
    a.set('t', px(1));

    // The valid write survives; only the cyclic one is refused.
    expect(a.get('y')).toBe(c222);
    expect(book.resolve('a.y')).toBe('#222222');
    expect(book.getDependencyGraph().getIncoming('a.y')).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].key).toBe('a.y');
    expect(errors[0].error).toBeInstanceOf(CircularDependencyError);
  });

  it('never announce a value that was refused, so listeners end on the stored one', () => {
    const { a, c222, selfRef, yEvents } = setup();
    a.set('t', px(1));

    expect(yEvents.some((d) => d.newValue === selfRef)).toBe(false);
    expect(yEvents[yEvents.length - 1].newValue).toBe(c222);
    expect(a.get('y')).toBe(c222);
  });

  it('report the last accepted value as oldValue', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const c111 = color('#111111');
    const c222 = color('#222222');
    const c333 = color('#333333');
    a.set('y', c111);
    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 'a.t' || fired) return;
      fired = true;
      a.set('y', c222);
      a.set('y', ref('a.y')); // rejected
      a.set('y', c333);
    });
    const yEvents: TokenChangedDetail[] = [];
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.y') yEvents.push(e.detail);
    });
    a.set('t', px(1));

    expect(yEvents.map((d) => [d.oldValue, d.newValue])).toEqual([
      [c111, c222],
      [c222, c333],
    ]);
    expect(a.get('y')).toBe(c333);
  });
});
