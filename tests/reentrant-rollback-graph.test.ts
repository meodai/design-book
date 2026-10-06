import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import type { TokenChangedDetail } from '../src/design-book';
import { color, px, ref } from '../src/tokens';

describe('a re-entrant write rolled back because a listener threw', () => {
  function setup() {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('z', color('#111111'));

    let fired = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 'a.t' || fired) return;
      fired = true;
      a.set('y', ref('a.z'));
    });
    let thrown = false;
    book.on('tokenChanged', (e) => {
      if (e.detail.key !== 'a.y' || thrown) return;
      thrown = true;
      throw new Error('listener boom');
    });
    const yEvents: TokenChangedDetail[] = [];
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.y') yEvents.push(e.detail);
    });
    return { book, a, yEvents };
  }

  it('leaves no graph edge or live key behind', () => {
    const { book, a } = setup();
    a.set('t', px(1));

    expect(a.has('y')).toBe(false);
    expect(book.getDependencyGraph().getDependentsOf('a.z')).toEqual([]);
    // The stale edge a.z → a.y used to make this read as a cycle.
    expect(() => a.set('z', ref('a.y'))).not.toThrow();
  });

  it('announces the restored state', () => {
    const { a, yEvents } = setup();
    a.set('t', px(1));
    expect(yEvents.length).toBeGreaterThan(0);
    expect(yEvents[yEvents.length - 1].newValue).toBeUndefined();
  });
});
