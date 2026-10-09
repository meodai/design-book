import { describe, it, expect } from 'vitest';
import {
  DesignBook, typography, withFields, ref, rem, string, composeBook, layer,
  FunctionError, Renderer,
} from '../src/index';

function buildBook() {
  const book = new DesignBook('t');
  book.addScope('font').set('sans', string('Inter'));
  const size = book.addScope('font-size');
  size.set('md', rem(1.8));
  size.set('xl', rem(3.2));
  const type = book.addScope('type');
  type.set('body', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.md'), lineHeight: 1.5 }));
  type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.xl'), fontWeight: '700' }));
  book.addScope('button').set('label', ref('type.body'));
  return book;
}

describe('typography()', () => {
  it('is a function token whose fields are its args', () => {
    const token = typography({ fontSize: ref('font-size.md'), fontWeight: '700', lineHeight: 1.5 });
    expect(token.type).toBe('function');
    expect(token.name).toBe('typography');
    expect(token.options?.fields).toEqual(['fontSize', 'fontWeight', 'lineHeight']);
    expect(token.metadata?.returnType).toBe('typography');
    expect(token.metadata?.dependencies).toEqual(['font-size.md']);
  });

  it('throws on no fields or a field name that cannot be a key', () => {
    expect(() => typography({})).toThrow(FunctionError);
    expect(() => typography({ 'font size': rem(1) })).toThrow(FunctionError);
  });

  it('resolves to CSS declarations, refs followed', () => {
    expect(buildBook().resolve('type.title'))
      .toBe('font-family: Inter; font-size: 3.2rem; font-weight: 700');
  });

  it('resolves through a ref to it', () => {
    const book = buildBook();
    expect(book.resolve('button.label')).toBe(book.resolve('type.body'));
  });
});

describe('typography in the graph', () => {
  it('lists the typography as a dependent of what its fields use', () => {
    const book = buildBook();
    expect(book.inspect('font-size.xl')!.dependents).toContain('type.title.fontSize');
    expect(book.inspect('type.title')!.dependencies).toEqual(['font.sans', 'font-size.xl']);
    expect(book.inspect('type.body')!.dependents).toContain('button.label');
  });

  it('propagates a change to a field through refs to it', () => {
    const book = buildBook();
    const changed: string[] = [];
    book.on('tokenChanged', (e) => changed.push(e.detail.key));
    book.getScope('font-size')!.set('md', rem(1.6));
    expect(changed).toEqual(expect.arrayContaining(['type.body', 'button.label']));
    expect(book.resolve('button.label')).toContain('font-size: 1.6rem');
  });
});

describe('withFields()', () => {
  it('copies a typography with some fields replaced or added', () => {
    const base = typography({ fontSize: rem(2), fontWeight: '400' });
    const next = withFields(base, { fontWeight: '700', letterSpacing: rem(0.1) });
    expect(next.options?.fields).toEqual(['fontSize', 'fontWeight', 'letterSpacing']);
    const book = new DesignBook('w');
    book.addScope('type').set('a', next);
    expect(book.resolve('type.a')).toBe('font-size: 2rem; font-weight: 700; letter-spacing: 0.1rem');
    expect(base.options?.fields).toEqual(['fontSize', 'fontWeight']);
  });

  it('throws on anything that is not a typography token', () => {
    expect(() => withFields(rem(1), {})).toThrow(FunctionError);
    expect(() => withFields(undefined, {})).toThrow(FunctionError);
  });
});

describe('typography: css-variables', () => {
  it('writes one variable per field and a class', () => {
    const css = buildBook().render('css-variables');
    expect(css).toContain('  --type-title-font-family: var(--font-sans);\n  --type-title-font-size: var(--font-size-xl);\n  --type-title-font-weight: 700;');
    expect(css).not.toMatch(/--type-title:/);
    expect(css).toContain('.type-title {\n  font-family: var(--type-title-font-family);\n  font-size: var(--type-title-font-size);\n  font-weight: var(--type-title-font-weight);\n}');
  });

  it('writes a ref to a typography field by field, with its own class', () => {
    const css = buildBook().render('css-variables');
    expect(css).toContain('  --button-label-font-family: var(--type-body-font-family);\n  --button-label-font-size: var(--type-body-font-size);\n  --button-label-line-height: var(--type-body-line-height);');
    expect(css).toContain('.button-label {\n  font-family: var(--button-label-font-family);');
  });

  it('throws when a field variable collides with another token', () => {
    const book = buildBook();
    book.getScope('type')!.set('title-font-size', rem(1));
    expect(() => book.render('css-variables')).toThrow(/collision/);
  });

  it('writes only the changed field of a breakpoint book', () => {
    const base = layer('base', (book) => {
      book.addScope('font-size').set('xl', rem(3.2));
      book.addScope('type').set('title', typography({ fontSize: ref('font-size.xl'), lineHeight: 1.1 }));
    });
    const tablet = layer('tablet', { 'font-size': { xl: rem(2.8) } });
    const phone = layer('phone', (book) => {
      book.getScope('type')!.set('title', withFields(book.getTokenByKey('type.title'), { lineHeight: 1.2 }));
    });
    const desktopBook = composeBook('desktop', [base]);
    const tabletBook = composeBook('tablet', [base, tablet]);
    const phoneBook = composeBook('phone', [base, tablet, phone]);

    expect(tabletBook.render('css-variables', { media: '(max-width: 1024px)', changedFrom: desktopBook }))
      .toBe('@media (max-width: 1024px) {\n  :root {\n    --font-size-xl: 2.8rem;\n  }\n}');
    expect(phoneBook.render('css-variables', { media: '(max-width: 620px)', changedFrom: tabletBook }))
      .toBe('@media (max-width: 620px) {\n  :root {\n    --type-title-line-height: 1.2;\n  }\n}');
  });
});

describe('typography: class names and fields', () => {
  it('respects the classPrefix option', () => {
    expect(buildBook().render('css-variables', { classPrefix: 't-' })).toContain('.t-type-title {');
  });

  it('writes any camelCase field as a kebab-case property', () => {
    const book = new DesignBook('c');
    book.addScope('type').set('caps', typography({ textTransform: 'uppercase', fontFeatureSettings: '"smcp"' }));
    expect(book.render('css-variables')).toContain('.type-caps {\n  text-transform: var(--type-caps-text-transform);\n  font-feature-settings: var(--type-caps-font-feature-settings);\n}');
  });
});

describe('typography: w3-design-tokens', () => {
  it('carries the description as $description', () => {
    const book = new DesignBook('d');
    book.addScope('type').set('body', typography({ fontSize: rem(1) }, { description: 'Running text' }));
    const w3 = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
    expect(w3.type.body.$description).toBe('Running text');
  });

  it('writes a native typography composite and aliases refs to it', () => {
    const w3 = new Renderer(buildBook(), 'w3-design-tokens').renderW3DesignTokensObject();
    expect(w3.type.title).toEqual({
      $type: 'typography',
      $value: { fontFamily: 'Inter', fontSize: { value: 3.2, unit: 'rem' }, fontWeight: 700 },
    });
    expect(w3.button.label).toEqual({ $type: 'typography', $value: '{type.body}' });
  });
});

describe('typography: json', () => {
  it('writes the resolved declarations', () => {
    const json = JSON.parse(buildBook().render('json'));
    expect(json['type.body']).toBe('font-family: Inter; font-size: 1.8rem; line-height: 1.5');
  });
});
