import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, createFunctionToken, ref } from '../src/tokens';
import type { Scope } from '../src/scope';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { lighten } from '../src/functions/color/lighten';
import { nth } from '../src/functions/generic/nth';
import { sibling } from '../src/functions/generic/sibling';

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

describe('a selector reports the member it picked', () => {
  it('a sibling steps from the member picked, not the first one with its value', () => {
    const { book, ui } = duplicateScale();
    ui.set('pick', nth(ref('scale'), 2));             // c
    ui.set('next', sibling(ref('ui.pick'), 1));       // d — matching by value would start at a
    expect(book.resolve('ui.pick')).toBe('#111111');
    expect(book.resolve('ui.next')).toBe('#333333');
  });

  it('not leaves out the member picked, and keeps another with the same value', () => {
    const { book, ui } = duplicateScale();
    ui.set('text', nth(ref('scale'), 2));              // c
    ui.set('link', bestContrastWith(color('#ffffff'), ref('scale'), { not: [ref('ui.text')] }));
    // c is out; a has the same color and is still a candidate.
    expect(book.resolve('ui.link')).toBe('#111111');
    ui.set('next', sibling(ref('ui.link'), 1));        // the link is a: next is b
    expect(book.resolve('ui.next')).toBe('#eeeeee');
  });

  it('reports the outer selector, not a selector among its pool members', () => {
    const { book, scale, ui } = duplicateScale();
    const other = book.addScope('other');
    other.set('q', color('#abcdef'));
    // A member that is itself a selector over another scope.
    scale.set('dyn', nth(ref('other'), 0));
    ui.set('pick', nth(ref('scale'), -1));             // scale.dyn, the last member
    ui.set('back', sibling(ref('ui.pick'), -1));       // steps along scale, from dyn to d
    expect(book.resolve('ui.pick')).toBe('#abcdef');
    expect(book.resolve('ui.back')).toBe('#333333');
  });

  it('a sibling of a sibling keeps walking the same scale', () => {
    const { book, ui } = duplicateScale();
    ui.set('start', nth(ref('scale'), 0));             // a
    ui.set('one', sibling(ref('ui.start'), 1));        // b
    ui.set('two', sibling(ref('ui.one'), 2));          // d
    expect(book.resolve('ui.two')).toBe('#333333');
  });

  it('falls back to matching by value for a custom function that reports nothing', () => {
    const { book, ui } = duplicateScale();
    book.registerFunction('secondOf', (scope: Scope) => scope.resolve(scope.getAllKeys()[1]));
    ui.set('pick', createFunctionToken('secondOf', [ref('scale')]));
    ui.set('next', sibling(ref('ui.pick'), 1));
    expect(book.resolve('ui.pick')).toBe('#eeeeee');
    expect(book.resolve('ui.next')).toBe('#111111');   // b → c
  });

  it('a computed value is still on no scale', () => {
    const { book, ui } = duplicateScale();
    ui.set('tint', lighten(ref('scale.d')));
    ui.set('next', sibling(ref('ui.tint'), 1));
    expect(() => book.resolve('ui.next')).toThrow(/not a member of any scope/);
  });
});
