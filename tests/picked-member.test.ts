import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { nth } from '../src/functions/generic/nth';

/** A scale where a and c share a value. */
function duplicateScale() {
  const book = new DesignBook('picked');
  const scale = book.addScope('scale');
  scale.set('a', color('#111111'));
  scale.set('b', color('#eeeeee'));
  scale.set('c', color('#111111'));
  scale.set('d', color('#333333'));
  return { book, scale, ui: book.addScope('ui') };
}

// A selector reports the member it picked while it resolves. Nothing in the
// book reads a pick to decide anything any more (a `sibling` anchor or a
// `not` entry is never looked through); the SVG renderer reads it to draw a
// selector's edge from the member it picked.
describe('a selector reports the member it picked', () => {
  it('reports the member, not the first one with its value', () => {
    const { book, ui } = duplicateScale();
    ui.set('pick', nth(ref('scale'), 2));
    expect(book.pickOf('ui.pick')).toBe('scale.c');
  });

  it('reports the outer selector, not a selector among its pool members', () => {
    const { book, scale, ui } = duplicateScale();
    const other = book.addScope('other');
    other.set('q', color('#abcdef'));
    // A member that is itself a selector over another scope.
    scale.set('dyn', nth(ref('other'), 0));
    ui.set('pick', nth(ref('scale'), -1));
    expect(book.resolve('ui.pick')).toBe('#abcdef');
    expect(book.pickOf('ui.pick')).toBe('scale.dyn');
  });

  it('reports what a contrast selector chose', () => {
    const { book, ui } = duplicateScale();
    ui.set('text', bestContrastWith(ref('scale.b'), ref('scale')));
    expect(book.pickOf('ui.text')).toBe('scale.a');
  });

  it('reports nothing for a plain reference', () => {
    const { book, ui } = duplicateScale();
    ui.set('alias', ref('scale.d'));
    expect(book.pickOf('ui.alias')).toBeUndefined();
  });
});
