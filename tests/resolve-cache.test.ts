import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { nth } from '../src/functions/generic/nth';
import { lighten } from '../src/functions/color/lighten-darken';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { mostVivid } from '../src/functions/color/vividness';

function paletteBook() {
  const book = new DesignBook('t');
  const palette = book.addScope('palette');
  palette.set('light', color('#ffffff'));
  palette.set('mid', color('#888888'));
  palette.set('dark', color('#111111'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('palette.light'));
  ui.set('text', bestContrastWith(ref('ui.bg'), ref('palette')));
  ui.set('alias', ref('ui.text'));
  return book;
}

describe('the resolve cache', () => {
  it('answers pickOf from a cached value, through references too', () => {
    const book = paletteBook();
    expect(book.resolve('ui.text')).toBe('#111111');           // computed, cached
    expect(book.pickOf('ui.text')).toBe('palette.dark');
    expect(book.pickOf('ui.alias')).toBe('palette.dark');
    expect(book.pickOf('ui.alias')).toBe('palette.dark'); // both cached now
    expect(book.pickOf('palette.mid')).toBeUndefined();
  });

  it('is cleared by a write, a delete, a new order and a new function', () => {
    const book = paletteBook();
    expect(book.resolve('ui.text')).toBe('#111111');
    book.getScope('palette')!.set('dark', color('#000000'));
    expect(book.resolve('ui.text')).toBe('#000000');
    book.getScope('palette')!.delete('dark');
    expect(book.resolve('ui.text')).toBe('#888888');

    const ui = book.getScope('ui')!;
    ui.set('first', nth(ref('palette'), 0));
    expect(book.resolve('ui.first')).toBe('#ffffff');
    book.getScope('palette')!.setOrder([{ by: 'name', direction: 'asc' }]);
    expect(book.resolve('ui.first')).toBe('#ffffff'); // light < mid by name
    book.getScope('palette')!.setOrder([{ by: 'name', direction: 'desc' }]);
    expect(book.resolve('ui.first')).toBe('#888888'); // mid > light

    book.registerFunction('lighten', () => '#123456');
    ui.set('soft', lighten(ref('palette.mid'), { amount: 0.1 }));
    expect(book.resolve('ui.soft')).toBe('#123456');
    book.registerFunction('lighten', () => '#654321');
    expect(book.resolve('ui.soft')).toBe('#654321');
  });

  it('is cleared when a scope comes or goes', () => {
    const book = new DesignBook('t');
    book.addScope('a').set('x', ref('b.y'));
    expect(() => book.resolve('a.x')).toThrow();
    book.addScope('b').set('y', color('#abcdef'));
    expect(book.resolve('a.x')).toBe('#abcdef');
    book.deleteScope('b');
    expect(() => book.resolve('a.x')).toThrow();
  });

  it('does not keep a pool computed while one of its members was mid-resolution', () => {
    // c.k picks from a, which holds a.p; a.p picks from b, which holds
    // b.m = c.k. Resolving c.k first computes a.p with b.m turned away
    // (c.k is mid-resolution); a.p alone counts b.m, the vivid red.
    const build = () => {
      const book = new DesignBook('t');
      book.addScope('a').set('p', mostVivid(ref('b')));
      book.getScope('a')!.set('red', color('#ff0000'));
      book.addScope('b').set('m', ref('c.k'));
      book.getScope('b')!.set('dull', color('#777766'));
      book.addScope('c').set('k', mostVivid(ref('a')));
      return book;
    };
    const alone = build().resolve('a.p');
    expect(alone).toBe('#ff0000');
    const book = build();
    book.resolve('c.k');
    expect(book.resolve('a.p')).toBe(alone);
  });

  it('does not keep what is computed while a scope sorts its keys', () => {
    // Sorting s resolves s.x = t.first = nth(s, 0) while s still lists its
    // keys in insertion order; t.first must not keep that answer.
    const build = () => {
      const book = new DesignBook('t');
      const s = book.addScope('s', { order: [{ by: 'value', direction: 'desc' }] });
      s.set('dark', color('#000000'));
      s.set('light', color('#ffffff'));
      s.set('x', ref('t.first'));
      // `not` keeps x out of the pool, so no guard is involved.
      book.addScope('t').set('first', nth(ref('s'), 0, { not: [ref('s.x')] }));
      return book;
    };
    const fresh = build();
    const alone = fresh.resolve('t.first');
    expect(alone).toBe('#ffffff'); // sorted by value, descending
    const book = build();
    book.getScope('s')!.getAllKeys();
    expect(book.resolve('t.first')).toBe(alone);
  });
});
