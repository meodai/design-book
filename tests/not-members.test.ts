import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, ref, source, inherited } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { mostVivid } from '../src/functions/color/vividness';
import { lightest } from '../src/functions/color/lightest-darkest';
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

describe('`not` names a member of the pool, or what leads into it', () => {
  it('takes keys of the pool itself, existing or not', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [ref('scale.900')] }));
    ui.set('missing', bestContrastWith(ref('brand.paper'), ref('scale'), { not: ['scale.does-not-exist'] }));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
    expect(book.resolve('ui.missing')).toBe('#0a0a40');
  });

  it('excludes the member a reference leads to, over several hops', () => {
    const book = brandBook();
    const brand2 = book.addScope('alias');
    brand2.set('light', ref('scale.0'));
    const ui = book.addScope('ui');
    ui.set('surface', ref('alias.light'));
    ui.set('bright', lightest(ref('scale'), { not: [ref('ui.surface')] }));
    expect(book.resolve('ui.bright')).toBe('#b9d8fe');
  });

  it('follows the reference when it is re-pointed', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('accent', ref('scale.800'));
    ui.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [ref('ui.accent'), ref('scale.900')] }));
    expect(book.resolve('ui.text')).toBe('#0059df');
    ui.set('accent', ref('scale.600'));
    expect(book.resolve('ui.text')).toBe('#1a2a80');
  });

  it('does not match a member that refers to the entry (ink is no key of scale)', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('fromScale', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [ref('brand.ink')] }));
    ui.set('fromBrand', bestContrastWith(ref('brand.paper'), ref('brand'), { not: [ref('brand.ink')] }));
    expect(() => book.resolve('ui.fromScale')).toThrow(/"brand\.ink" is not a member of "scale"/);
    expect(book.resolve('ui.fromBrand')).toBe('#2bb3ee');
  });

  it('excludes the member another selector picked from the same pool, and follows it', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('bg', ref('brand.paper'));
    ui.set('text', bestContrastWith(ref('ui.bg'), ref('scale')));
    ui.set('link', bestContrastWith(ref('ui.bg'), ref('scale'), { not: [ref('ui.text')] }));
    expect(book.resolve('ui.text')).toBe('#0a0a40');
    expect(book.resolve('ui.link')).toBe('#1a2a80');
    // a dark background: text flips to paper, and link leaves paper out
    ui.set('bg', ref('brand.ink'));
    expect(book.resolve('ui.text')).toBe('#ffffff');
    expect(book.resolve('ui.link')).toBe('#b9d8fe');
  });

  it('refuses a selector that picked from another scope', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('mark', bestContrastWith(ref('brand.paper'), ref('brand')));
    ui.set('link', bestContrastWith(ref('brand.paper'), ref('scale'), { not: [ref('ui.mark')] }));
    expect(() => book.resolve('ui.link')).toThrow(/"ui\.mark" is not a member of "scale"/);
  });

  it('reads a relative key in the scope that reads the token', () => {
    const book = brandBook();
    const base = book.addScope('base');
    base.set('bg', ref('brand.paper'));
    base.set('accent', ref('scale.800'));
    base.set('link', bestContrastWith(ref('.bg'), ref('scale'), { not: [ref('.accent'), ref('scale.900')] }));
    const dark = book.addScope('dark', { extends: 'base' });
    dark.set('accent', ref('scale.600'));
    expect(book.resolve('base.link')).toBe('#0059df');
    expect(book.resolve('dark.link')).toBe('#1a2a80');
  });

  it('takes source(…) and inherited(…) entries', () => {
    const book = brandBook();
    const base = book.addScope('base');
    base.set('accent', ref('scale.800'));
    const kid = book.addScope('kid', { extends: 'base' });
    kid.set('accent', ref('scale.600'));
    kid.set('text', bestContrastWith(ref('brand.paper'), ref('scale'), {
      not: [source(ref('.accent'), 'root'), inherited(ref('.accent')), ref('scale.900')],
    }));
    // leaves out 600 (its own accent) and 800 (the one it inherited)
    expect(book.resolve('kid.text')).toBe('#b9d8fe');
  });

  it('applies to the step-based selectors too', () => {
    const book = brandBook();
    const ui = book.addScope('ui');
    ui.set('first', nth(ref('scale'), 0, { not: [ref('scale.0')] }));
    ui.set('anchor', ref('scale.600'));
    ui.set('next', sibling(ref('ui.anchor'), ref('scale'), 1, { not: [ref('scale.800')] }));
    expect(book.resolve('ui.first')).toBe('#b9d8fe');
    expect(book.resolve('ui.next')).toBe('#0a0a40');
  });

  it('applies to sizes', () => {
    const book = new DesignBook('sizes');
    const space = book.addScope('space');
    space.set('s', px(8));
    space.set('m', px(16));
    space.set('xl', px(48));
    const ui = book.addScope('ui');
    ui.set('top', ref('space.xl'));
    ui.set('gap', largest(ref('space'), { not: [ref('ui.top')] }));
    expect(book.resolve('ui.gap')).toBe('16px');
  });

  it('throws for an entry that names no member, instead of excluding nothing', () => {
    const book = brandBook();
    const other = book.addScope('other');
    other.set('red', color('#ff0000'));
    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(ref('scale'), { not: [ref('other.red')] }));
    expect(() => book.resolve('ui.accent')).toThrow(
      /`not` entry "other\.red" is not a member of "scale" and its references do not lead into it/,
    );
  });
});
