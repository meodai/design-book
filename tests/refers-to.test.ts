import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref, source, inherited, refersTo } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { lightest } from '../src/functions/color/lightest-darkest';
import { lighten } from '../src/functions/color/lighten-darken';
import { sibling } from '../src/functions/generic/sibling';

/** A scale whose dark end refers to a brand role: `scale.900 = ref('brand.ink')`,
 *  and `brand.ink` itself refers to a palette color. */
function brandBook() {
  const book = new DesignBook('refers-to');
  const palette = book.addScope('palette');
  palette.set('navy', color('#0a0a40'));
  palette.set('white', color('#ffffff'));
  const brand = book.addScope('brand');
  brand.set('paper', ref('palette.white'));
  brand.set('ink', ref('palette.navy'));
  const scale = book.addScope('scale');
  scale.set('0', ref('brand.paper'));
  scale.set('300', color('#b9d8fe'));
  scale.set('600', color('#0059df'));
  scale.set('800', color('#1a2a80'));
  scale.set('900', ref('brand.ink'));
  return book;
}

describe('refersTo(…): the members that refer to a token', () => {
  it('stores a marker and refuses scopes', () => {
    expect(refersTo(ref('brand.ink'))).toEqual({ type: 'member', key: 'brand.ink', referredBy: true });
    expect(refersTo(refersTo(ref('brand.ink')))).toEqual(refersTo(ref('brand.ink')));
    expect(() => refersTo(ref('brand'))).toThrow(/is a scope/);
    expect(() => source(refersTo(ref('brand.ink')))).toThrow(/refersTo\(source/);
  });

  it('as a `not` entry, leaves out the member that refers to it', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(ref('brand.ink'))] }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
  });

  it('follows references through several hops', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    // scale.900 → brand.ink → palette.navy
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(ref('palette.navy'))] }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
  });

  it('leaves out every member that refers to it', () => {
    const book = brandBook();
    book.getScope('scale')!.set('950', ref('brand.ink'));
    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(ref('brand.ink'))] }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
  });

  it('throws when nothing in the pool refers to it', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(ref('scale.600'))] }));
    expect(() => book.resolve('ui.text')).toThrow(/nothing in "scale" refers to "scale\.600", so it would exclude nothing/);
  });

  it('does not look through selectors', () => {
    const book = brandBook();
    book.getScope('scale')!.set('pick', lightest(ref('brand')));
    const ui = book.addScope('ui');
    ui.set('x', lightest(ref('scale'), { not: [refersTo(ref('brand.paper')), ref('scale.300')] }));
    // only scale.0 is left out: scale.pick picked brand.paper, but a pick is no reference
    expect(book.resolve('scale.pick')).toBe('#ffffff');
    expect(book.resolve('ui.x')).toBe('#ffffff');
  });

  it('follows the pool when a member is re-pointed', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(ref('brand.ink'))] }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
    book.getScope('scale')!.set('900', color('#000000'));
    book.getScope('scale')!.set('800', ref('brand.ink'));
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('composes with source: every member ending where the value is written', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('accent', ref('palette.navy'));
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), {
      not: [refersTo(source(ref('.accent'), 'root'))],
    }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
    // the editor's order: source inside refersTo
    expect(refersTo(source(ref('.accent'), 'root'))).toEqual({ type: 'member', key: '.accent', via: 'root', referredBy: true });
  });

  it('composes with inherited and re-binds in each scope', () => {
    const book = brandBook();
    const base = book.addScope('base');
    base.set('ink', ref('brand.ink'));
    base.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(ref('brand.ink'))] }));
    const kid = book.addScope('kid', { extends: 'base' });
    kid.set('other', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [refersTo(inherited(ref('.ink')))] }));
    // kid.other leaves out what refers to base.ink: nothing in scale does
    expect(() => book.resolve('kid.other')).toThrow(/nothing in "scale" refers to "base\.ink"/);
    expect(book.resolve('kid.text')).toBe('#1a2a80');
  });

  it('is refused as a value', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    expect(() => ui.set('x', refersTo(ref('brand.ink')))).toThrow(/is not a value/);
    expect(() => ui.set('y', lighten(refersTo(ref('brand.ink')) as any))).toThrow();
  });
});

describe('sibling with refersTo(…)', () => {
  it('steps from the one member that refers to the anchor', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('hover', sibling(refersTo(ref('brand.ink')), ref('scale'), -1));
    expect(book.resolve('ui.hover')).toBe('#1a2a80');
  });

  it('needs the scale named', () => {
    expect(() => sibling(refersTo(ref('brand.ink')), -1)).toThrow(/needs the scale named/);
  });

  it('throws when several members refer to it, naming them', () => {
    const book = brandBook();
    book.getScope('scale')!.set('950', ref('brand.ink'));
    const ui = book.addScope('ui');
    ui.set('hover', sibling(refersTo(ref('brand.ink')), ref('scale'), -1));
    expect(() => book.resolve('ui.hover')).toThrow(/scale\.900, scale\.950 in "scale" all refer to "brand\.ink"; name one/);
  });

  it('takes it as `toward`', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('step', sibling(ref('scale.300'), ref('scale'), 1, { toward: refersTo(ref('brand.paper')) }));
    expect(book.resolve('ui.step')).toBe('#ffffff');
  });

  it('follows the scale when the referring member moves', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('hover', sibling(refersTo(ref('brand.ink')), ref('scale'), -1));
    expect(book.resolve('ui.hover')).toBe('#1a2a80');
    book.getScope('scale')!.set('900', color('#000000'));
    book.getScope('scale')!.set('600', ref('brand.ink'));
    expect(book.resolve('ui.hover')).toBe('#b9d8fe');
  });
});
