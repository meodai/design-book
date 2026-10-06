import { describe, it, expect } from 'vitest';
import {
  DesignBook, color, ref, rem, bestContrastWith, diffBooks,
} from '../../src/index';

/** The same setup function, called once per variation. */
function buildBook() {
  const book = new DesignBook('v');
  const brand = book.addScope('brand');
  brand.set('ink', color('#111111'));
  brand.set('paper', color('#ffffff'));
  brand.set('shade', color('#1d2b5c'));
  const surface = book.addScope('surface');
  surface.set('normal', ref('brand.paper'));
  const ui = book.addScope('ui');
  ui.set('background', ref('surface.normal'));
  ui.set('text', bestContrastWith(ref('surface.normal'), brand));
  const type = book.addScope('type');
  type.set('body', rem(1.8));
  type.set('small', rem(1.4));
  book.addTypography('lead', { fontSize: ref('type.body'), fontWeight: '400' });
  return book;
}

const css = (book: DesignBook, options?: unknown) => book.render('css-variables', options);

describe('css-variables: selector and media', () => {
  it('still writes :root by default', () => {
    expect(css(buildBook())).toMatch(/^:root \{/);
  });

  it('writes into a selector', () => {
    const out = css(buildBook(), { selector: '.inverted' });
    expect(out).toMatch(/^\.inverted \{/);
    expect(out).not.toContain(':root');
  });

  it('wraps in a media query, with or without a selector', () => {
    expect(css(buildBook(), { media: '(max-width: 620px)' }))
      .toMatch(/^@media \(max-width: 620px\) \{\n  :root \{\n    --brand-ink: #111111;/);
    const nested = css(buildBook(), { media: '(max-width: 620px)', selector: '.inverted' });
    expect(nested).toMatch(/^@media \(max-width: 620px\) \{\n  \.inverted \{/);
    expect(nested.trimEnd().endsWith('}\n}')).toBe(true);
  });
});

describe('css-variables: scopes', () => {
  it('renders only the listed scopes', () => {
    const out = css(buildBook(), { scopes: ['surface'] });
    expect(out).toContain('--surface-normal');
    expect(out).not.toContain('--brand-ink');
    expect(out).not.toContain('--ui-text');
  });

  it('rejects an unknown scope', () => {
    expect(() => css(buildBook(), { scopes: ['nope'] })).toThrow(/nope/);
  });
});

describe('css-variables: changedFrom', () => {
  it('emits the override and the computed tokens it changed, not var() references', () => {
    const base = buildBook();
    const inverted = buildBook();
    inverted.getScope('surface')!.set('normal', ref('brand.shade'));

    const out = css(inverted, { selector: '.inverted', changedFrom: base });
    expect(out).toContain('--surface-normal: var(--brand-shade);');
    expect(out).toContain('--ui-text: #ffffff;');        // recomputed for the dark surface
    expect(out).not.toContain('--ui-background');        // var(--surface-normal) follows on its own
    expect(out).not.toContain('--brand-ink');            // unchanged
    expect(out).not.toContain('.lead');                  // typography blocks only hold var()s
  });

  it('emits keys only the variation has', () => {
    const base = buildBook();
    const brand = buildBook();
    brand.getScope('brand')!.set('accent', color('#ff3300'));
    expect(css(brand, { changedFrom: base })).toContain('--brand-accent: #ff3300;');
  });

  it('renders an empty rule when nothing differs', () => {
    expect(css(buildBook(), { selector: '.same', changedFrom: buildBook() })).toBe('.same {\n}');
  });

  it('works for breakpoints the same way', () => {
    const base = buildBook();
    const phone = buildBook();
    phone.getScope('type')!.set('body', rem(1.6));
    expect(css(phone, { media: '(max-width: 620px)', changedFrom: base }))
      .toBe('@media (max-width: 620px) {\n  :root {\n    --type-body: 1.6rem;\n  }\n}');
  });
});

describe('json: scopes and changedFrom', () => {
  it('filters and diffs resolved values', () => {
    const base = buildBook();
    const inverted = buildBook();
    inverted.getScope('surface')!.set('normal', ref('brand.shade'));
    const out = JSON.parse(inverted.render('json', { changedFrom: base }) );
    expect(out).toEqual({
      'surface.normal': '#1d2b5c',
      'ui.background': '#1d2b5c',
      'ui.text': '#ffffff',
    });
    expect(Object.keys(JSON.parse(base.render('json', { scopes: ['brand'] })))).toEqual(
      ['brand.ink', 'brand.paper', 'brand.shade'],
    );
  });
});

describe('diffBooks', () => {
  it('reports changed, added and removed tokens by resolved value', () => {
    const a = buildBook();
    const b = buildBook();
    b.getScope('surface')!.set('normal', ref('brand.shade'));
    b.getScope('brand')!.set('accent', color('#ff3300'));
    b.getScope('type')!.delete('small');

    const diff = diffBooks(a, b);
    expect(diff.changed).toEqual([
      { key: 'surface.normal', from: '#ffffff', to: '#1d2b5c' },
      { key: 'ui.background', from: '#ffffff', to: '#1d2b5c' },
      { key: 'ui.text', from: '#111111', to: '#ffffff' },
    ]);
    expect(diff.added).toEqual([{ key: 'brand.accent', value: '#ff3300' }]);
    expect(diff.removed).toEqual([{ key: 'type.small', value: '1.4rem' }]);
  });

  it('is empty for identical books', () => {
    expect(diffBooks(buildBook(), buildBook())).toEqual({ changed: [], added: [], removed: [] });
  });
});
