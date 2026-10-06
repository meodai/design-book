import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, px, ref } from '../../src/tokens';
import { nth } from '../../src/functions/generic/nth';
import { sibling } from '../../src/functions/generic/sibling';
import { random } from '../../src/functions/generic/random';
import { nextLarger } from '../../src/functions/non-color/next-larger';
import { nextSmaller } from '../../src/functions/non-color/next-smaller';
import { lighten } from '../../src/functions/color/lighten';
import { poolKeys } from '../../src/functions/scope-members';

function grayWithSibling() {
  const book = new DesignBook('test');
  const gray = book.addScope('gray');
  gray.set('a', color('#111111'));
  gray.set('hover', sibling(ref('gray.a'), 1));
  gray.set('b', color('#222222'));
  gray.set('c', color('#333333'));
  return { book, gray };
}

function inheritedDims() {
  const book = new DesignBook('test');
  const base = book.addScope('base');
  base.set('a', px(4));
  base.set('b', px(8));
  base.set('c', px(16));
  const kid = book.addScope('kid', { extends: 'base' });
  return { book, base, kid };
}

describe('poolKeys', () => {
  it('skips members that walk the scope, including a sibling', () => {
    const { gray } = grayWithSibling();
    expect(poolKeys(gray)).toEqual(['a', 'b', 'c']);
  });

  it('skips a member that walks the scope only through a nested function', () => {
    const { book, gray } = grayWithSibling();
    gray.set('tint', lighten(nth(gray, 0)));
    expect(poolKeys(gray)).toEqual(['a', 'b', 'c']);
    expect(book.resolve('gray.tint')).toBeTruthy();
  });

  it('honours `not` by local key and by an inherited member’s source key', () => {
    const { kid } = inheritedDims();
    expect(poolKeys(kid, ['kid.a', 'base.b'])).toEqual(['c']);
  });
});

describe('scope-member pools agree across selectors', () => {
  it('nth and sibling count the same positions when a sibling lives in the scope', () => {
    const { book } = grayWithSibling();
    const ui = book.addScope('ui');
    ui.set('second', nth(book.getScope('gray')!, 1));
    ui.set('third', nth(book.getScope('gray')!, 2));
    expect(book.resolve('gray.hover')).toBe('#222222');
    expect(book.resolve('ui.second')).toBe('#222222');
    expect(book.resolve('ui.third')).toBe('#333333');
  });

  it('nextLarger skips a sibling member instead of resolving it', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('a', px(4));
    s.set('next', sibling(ref('s.a'), 1));
    s.set('b', px(8));
    const ui = book.addScope('ui');
    ui.set('up', nextLarger(px(4), s));
    ui.set('down', nextSmaller(px(8), s));
    expect(book.resolve('ui.up')).toBe('8px');
    expect(book.resolve('ui.down')).toBe('4px');
  });

  it('nextLarger honours `not` given as an inherited member’s source key', () => {
    const { book, kid } = inheritedDims();
    const ui = book.addScope('ui');
    ui.set('up', nextLarger(px(4), kid, { not: [ref('base.b')] }));
    expect(book.resolve('ui.up')).toBe('16px');
  });

  it('nextSmaller honours `not` given as an inherited member’s source key', () => {
    const { book, kid } = inheritedDims();
    const ui = book.addScope('ui');
    ui.set('down', nextSmaller(px(16), kid, { not: [ref('base.b')] }));
    expect(book.resolve('ui.down')).toBe('4px');
  });

  it('nth honours `not` given as an inherited member’s source key', () => {
    const { book, kid } = inheritedDims();
    const ui = book.addScope('ui');
    ui.set('second', nth(kid, 1, { not: [ref('base.b')] }));
    expect(book.resolve('ui.second')).toBe('16px');
  });

  it('random honours `not` given as an inherited member’s source key', () => {
    const { book, kid } = inheritedDims();
    const ui = book.addScope('ui');
    for (let seed = 0; seed < 20; seed++) {
      ui.set(`r${seed}`, random(kid, { type: 'dimension', seed, not: [ref('base.a'), ref('base.b')] }));
      expect(book.resolve(`ui.r${seed}`)).toBe('16px');
    }
  });
});
