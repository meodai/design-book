import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { mostVivid } from '../src/functions/color/most-vivid';
import { darkest, lightest } from '../src/functions/color/lightest-darkest';
import { nth } from '../src/functions/generic/nth';
import { largest } from '../src/functions/generic/extremes';
import { sibling } from '../src/functions/generic/sibling';

/** A scale whose dark end is a reference to a brand color, as in a real
 *  brand ramp: `scale.900 = ref('brand.ink')`. */
function brandBook() {
  const book = new DesignBook('not-members');
  const brand = book.addScope('brand');
  brand.set('paper', color('#ffffff'));
  brand.set('ink', color('#0a0a40'));
  brand.set('spark', color('#2bb3ee'));
  const scale = book.addScope('scale');
  scale.set('0', ref('brand.paper'));
  scale.set('300', color('#b9d8fe'));
  scale.set('600', color('#0059df'));
  scale.set('800', color('#1a2a80'));
  scale.set('900', ref('brand.ink'));
  return book;
}

describe('`not` names members wherever the key is written', () => {
  it('still takes keys of the pool itself, existing or not', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [ref('scale.900')] }));
    ui.set('missing', bestContrastWith(ref('brand.paper'), ref('scale'), { not: ['scale.does-not-exist'] }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
    expect(book.resolve('ui.missing')).toBe('#0a0a40');
  });

  it('excludes a member that is a reference to the key: ink is scale.900', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    // The same ref works in either pool: in `brand` it is the member itself,
    // in `scale` it is the member that points at it.
    ui.set('fromScale', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [ref('brand.ink')] }));
    ui.set('fromBrand', bestContrastWith(ref('brand.paper'), ref('brand'), { not: [ref('brand.ink')] }));
    expect(book.resolve('ui.fromScale')).toBe('#1a2a80');
    expect(book.resolve('ui.fromBrand')).toBe('#2bb3ee');
  });

  it('excludes the member a reference leads to', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('surface', ref('scale.0'));
    ui.set('bright', lightest(ref('scale'), { not: [ref('ui.surface')] }));
    expect(book.resolve('ui.bright')).toBe('#b9d8fe');
  });

  it('excludes the member another selector picked, and follows it when the pick changes', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('bg', ref('brand.paper'));
    ui.set('text', bestContrastWith(ref('ui.bg'), ref('scale')));
    ui.set('link', bestContrastWith(ref('ui.bg'), ref('scale'), { not: [ref('ui.text')] }));
    expect(book.resolve('ui.text')).toBe('#0a0a40');
    expect(book.resolve('ui.link')).toBe('#1a2a80');

    // A dark background: text flips to paper, and link leaves paper out.
    ui.set('bg', ref('brand.ink'));
    expect(book.resolve('ui.text')).toBe('#ffffff');
    expect(book.resolve('ui.link')).toBe('#b9d8fe');
  });

  it('reads a relative key in the scope that reads the token', () => {
    const book = brandBook();
    const base = book.addScope('base');
    base.set('bg', ref('brand.paper'));
    base.set('text', bestContrastWith(ref('.bg'), ref('scale')));
    base.set('link', bestContrastWith(ref('.bg'), ref('scale'), { not: [ref('.text')] }));
    const dark = book.addScope('dark', { extends: 'base' });
    dark.set('bg', ref('brand.ink'));
    expect(book.resolve('base.link')).toBe('#1a2a80');
    expect(book.resolve('dark.text')).toBe('#ffffff');
    expect(book.resolve('dark.link')).toBe('#b9d8fe');
  });

  it('applies to the step-based selectors too', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('first', nth(ref('scale'), 0, { not: [ref('brand.paper')] }));
    ui.set('anchor', ref('scale.600'));
    ui.set('next', sibling(ref('ui.anchor'), 1, { not: [ref('scale.800')] }));
    expect(book.resolve('ui.first')).toBe('#b9d8fe');
    expect(book.resolve('ui.next')).toBe('#0a0a40');
  });

  it('applies to sizes', () => {
    const book = new DesignBook('sizes');
    const base = book.addScope('base');
    base.set('max', px(48));
    const space = book.addScope('space');
    space.set('s', px(8));
    space.set('m', px(16));
    space.set('xl', ref('base.max'));
    const ui = book.addScope('ui');
    ui.set('gap', largest(ref('space'), { not: [ref('base.max')] }));
    expect(book.resolve('ui.gap')).toBe('16px');
  });

  it('finds a selector\'s pick among the members it did not exclude', () => {
    // a and c share a color; the selector left a out, so its pick is c.
    const book = new DesignBook('picked');
    const scale = book.addScope('scale');
    scale.set('a', color('#111111'));
    scale.set('b', color('#222222'));
    scale.set('c', color('#111111'));
    scale.set('d', color('#333333'));
    const ui = book.addScope('ui');
    ui.set('pick', darkest(ref('scale'), { not: [ref('scale.a')] }));
    ui.set('next', sibling(ref('ui.pick'), 1));
    expect(book.resolve('ui.pick')).toBe('#111111');
    expect(book.resolve('ui.next')).toBe('#333333');
  });

  it('throws for an entry that names no member, instead of excluding nothing', () => {
    const book = brandBook();
    const other = book.addScope('other');
    other.set('red', color('#ff0000'));
    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(ref('scale'), { not: [ref('other.red')] }));
    expect(() => book.resolve('ui.accent')).toThrow(
      /`not` entry "other\.red" is not a member of "scale" and does not lead to one/,
    );
  });
});
