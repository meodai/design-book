import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import type { TokenChangedDetail } from '../src/design-book';
import { color, px, ref } from '../src/tokens';

describe('a listener that throws while hearing a write made by another listener', () => {
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

  it('undoes nothing: the write and its graph edge stand', () => {
    const { book, a } = setup();
    expect(() => a.set('t', px(1))).toThrow('listener boom');

    expect(book.resolve('a.y')).toBe('#111111');
    expect(book.getDependencyGraph().getDependentsOf('a.z')).toEqual(['a.y']);
    // The edge is real, so this is a cycle.
    expect(() => a.set('z', ref('a.y'))).toThrow();
  });

  it('does not keep the other listeners from hearing it', () => {
    const { a, yEvents } = setup();
    expect(() => a.set('t', px(1))).toThrow('listener boom');
    expect(yEvents.map((d) => d.value)).toEqual(['#111111']);
  });
});
