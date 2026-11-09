import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import type { TokenChangedDetail } from '../src/design-book';
import { color, px, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('several writes to one key from a listener', () => {
  function setup() {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('y', color('#111111'));
    const c222 = color('#222222');
    const selfRef = ref('a.y');

    const refusals: unknown[] = [];
    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 'a.t' || fired) return;
      fired = true;
      a.set('y', c222);
      try {
        a.set('y', selfRef); // closes a cycle
      } catch (error) {
        refusals.push(error);
      }
    });

    const yEvents: TokenChangedDetail[] = [];
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.y') yEvents.push(e.detail);
    });

    return { book, a, c222, selfRef, yEvents, refusals };
  }

  it('a refused one throws to the listener that wrote it, at once', () => {
    const { book, a, c222, refusals } = setup();
    a.set('t', px(1));

    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toBeInstanceOf(CircularDependencyError);
    // The valid write stands.
    expect(a.get('y')).toBe(c222);
    expect(book.resolve('a.y')).toBe('#222222');
    expect(book.getDependencyGraph().getIncoming('a.y')).toEqual([]);
  });

  it('a refused value is never announced', () => {
    const { a, c222, selfRef, yEvents } = setup();
    a.set('t', px(1));

    expect(yEvents.some((d) => d.newValue === selfRef)).toBe(false);
    expect(yEvents.map((d) => d.newValue)).toEqual([c222]);
  });

  it('a listener that does not catch the refusal makes the outer write throw it, once done', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('y', color('#111111'));
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.t') a.set('y', ref('a.y'));
    });
    expect(() => a.set('t', px(1))).toThrow(CircularDependencyError);
    // The outer write was not refused: it stands.
    expect(book.resolve('a.t')).toBe('1px');
    expect(book.resolve('a.y')).toBe('#111111');
  });

  it('each announcement carries the value before it as oldValue', () => {
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
      try { a.set('y', ref('a.y')); } catch { /* refused */ }
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
