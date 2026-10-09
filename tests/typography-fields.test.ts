import { describe, it, expect } from 'vitest';
import {
  DesignBook, typography, variant, ref, rem, string, composeBook, layer,
  CircularDependencyError, FunctionError, Renderer, SVGRenderer,
} from '../src/index';

function buildBook() {
  const book = new DesignBook('f');
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

const changesOf = (book: DesignBook, action: () => void) => {
  const keys: string[] = [];
  const off = book.on('tokenChanged', (e) => keys.push(e.detail.key));
  action();
  off();
  return keys;
};

describe('field refs: ref("scope.token.field")', () => {
  it('resolves one field, through refs to the typography too', () => {
    const book = buildBook();
    expect(book.resolve('type.title.fontSize')).toBe('3.2rem');
    expect(book.resolve('button.label.lineHeight')).toBe('1.5');
  });

  it('knows which fields exist', () => {
    const book = buildBook();
    expect(book.has('type.title.fontSize')).toBe(true);
    expect(book.has('type.title.lineHeight')).toBe(false);
    expect(book.has('font-size.xl.value')).toBe(false);
  });

  it('throws on an unknown field or a field of something that is not a typography', () => {
    const book = buildBook();
    expect(() => book.resolve('type.title.lineHeight')).toThrow(/no field "lineHeight"/);
    expect(() => book.resolve('font-size.xl.value')).toThrow(/not a typography/);
  });

  it('depends on the one field and follows its changes', () => {
    const book = buildBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    expect(book.inspect('type.title')!.dependents).toContain('callout.size');
    expect(book.inspect('callout.size')!.dependencies).toEqual(['type.title.fontSize']);
    const changed = changesOf(book, () => book.getScope('font-size')!.set('xl', rem(4)));
    expect(changed).toContain('callout.size');
    expect(book.resolve('callout.size')).toBe('4rem');
  });

  it('works as a field of another typography', () => {
    const book = buildBook();
    book.getScope('type')!.set('caption', typography({ fontFamily: ref('type.body.fontFamily'), fontSize: rem(1.2) }));
    expect(book.resolve('type.caption')).toBe('font-family: Inter; font-size: 1.2rem');
  });

  it('picks up a typography defined after the ref to its field', () => {
    const book = new DesignBook('fwd');
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    book.addScope('type').set('title', typography({ fontSize: rem(2) }));
    expect(book.resolve('callout.size')).toBe('2rem');
    const changed = changesOf(book, () => book.getScope('type')!.set('title', typography({ fontSize: rem(3) })));
    expect(changed).toContain('callout.size');
  });

  it('reads a field of a typography inherited through scope extends', () => {
    const book = buildBook();
    book.addScope('type-alt', { extends: 'type' });
    expect(book.resolve('type-alt.title.fontSize')).toBe('3.2rem');
    expect(book.has('type-alt.title.fontWeight')).toBe(true);
  });

  it('lets a field read another field of the same typography', () => {
    const book = buildBook();
    book.getScope('type')!.set('calc', typography({ fontSize: ref('font-size.md'), lineHeight: ref('type.calc.fontSize') }));
    expect(book.resolve('type.calc')).toBe('font-size: 1.8rem; line-height: 1.8rem');
    book.getScope('font-size')!.set('md', rem(2));
    expect(book.resolve('type.calc.lineHeight')).toBe('2rem');
  });

  it('lets two typographies read different fields of each other', () => {
    const book = buildBook();
    const type = book.getScope('type')!;
    type.set('a', typography({ fontSize: rem(1), lineHeight: 1.5 }));
    type.set('b', typography({ fontSize: ref('type.a.fontSize'), lineHeight: 1.2 }));
    type.set('a', typography({ fontSize: rem(1), lineHeight: ref('type.b.lineHeight') }));
    expect(book.resolve('type.a')).toBe('font-size: 1rem; line-height: 1.2');
    expect(book.resolve('type.b')).toBe('font-size: 1rem; line-height: 1.2');
  });

  it('rejects a real field cycle and leaves the graph as it was', () => {
    const book = buildBook();
    const nodes = book.getDependencyGraph().getAllNodes().sort();
    expect(() => book.getScope('type')!.set('loop', typography({ fontSize: rem(1), lineHeight: ref('type.loop.lineHeight') })))
      .toThrow(CircularDependencyError);
    const type = book.getScope('type')!;
    type.set('a', typography({ fontSize: ref('type.b.fontSize') }));
    expect(() => type.set('b', typography({ fontSize: ref('type.a.fontSize') }))).toThrow(CircularDependencyError);
    type.delete('a');
    expect(book.getDependencyGraph().getAllNodes().sort()).toEqual(nodes);
  });

  it('lets a base read a field its variant inherits', () => {
    const book = buildBook();
    const type = book.getScope('type')!;
    type.set('hero', variant(ref('type.title'), { fontWeight: '800' }));
    type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.xl'), fontWeight: '700', lineHeight: ref('type.hero.fontSize') }));
    expect(book.resolve('type.hero.lineHeight')).toBe('3.2rem');
  });

  it('reports only tokens in change events', () => {
    const book = buildBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    const changed = changesOf(book, () => book.getScope('font-size')!.set('xl', rem(4)));
    expect(changed.sort()).toEqual(['callout.size', 'font-size.xl', 'type.title']);
  });

  it('works the same in batch mode', () => {
    const book = buildBook();
    book.mode = 'batch';
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    book.getScope('type')!.set('calc', typography({ fontSize: rem(2), lineHeight: ref('type.calc.fontSize') }));
    expect(book.flush().errors).toEqual([]);
    book.getScope('font-size')!.set('xl', rem(4));
    const changed = changesOf(book, () => book.flush());
    expect(changed).toContain('callout.size');
    expect(changed.every((k) => k.split('.').length === 2)).toBe(true);
    expect(book.resolve('callout.size')).toBe('4rem');
  });

  it('keeps a field ref wired through deleting and re-adding the typography', () => {
    const book = buildBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    book.getScope('type')!.delete('title');
    expect(() => book.resolve('callout.size')).toThrow();
    const changed = changesOf(book, () => book.getScope('type')!.set('title', typography({ fontSize: rem(5) })));
    expect(changed).toContain('callout.size');
    book.getScope('type')!.set('title', typography({ fontSize: rem(6) }));
    expect(book.resolve('callout.size')).toBe('6rem');
  });

  it('inspects a field key', () => {
    const book = buildBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    expect(book.inspect('type.title.fontSize')).toMatchObject({
      key: 'type.title.fontSize',
      value: '3.2rem',
      tokenType: 'field',
      owner: 'type.title',
      field: 'fontSize',
      dependencies: ['font-size.xl'],
      dependents: ['callout.size'],
    });
    expect(book.inspect('type.title.nope')).toBeNull();
    expect(book.inspect('type.title')!.dependencies).toEqual(['font.sans', 'font-size.xl']);
  });

  it('draws a typography and a field ref as edges between tokens in the SVG graph', () => {
    const book = buildBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    const svg = new SVGRenderer(book, { linksOnly: false }).render();
    expect(svg).toContain('data-from="type.title" data-to="font-size.xl"');
    expect(svg).toContain('data-from="callout.size" data-to="type.title"');
  });

  it('says that only one field level exists', () => {
    expect(() => buildBook().resolve('type.title.fontSize.x')).toThrow(/one field level/);
  });

  it('renders as var() of the field variable in CSS and as the resolved value in W3', () => {
    const book = buildBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    expect(book.render('css-variables')).toContain('  --callout-size: var(--type-title-font-size);');
    const w3 = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
    expect(w3.callout.size).toEqual({ $type: 'dimension', $value: { value: 3.2, unit: 'rem' } });
  });
});

describe('live variants: variant(ref(...), overrides)', () => {
  const withHero = () => {
    const book = buildBook();
    book.getScope('type')!.set('hero', variant(ref('type.title'), { fontWeight: '800', letterSpacing: rem(-0.02) }));
    return book;
  };

  it('resolves the base fields with its own laid over, base order first', () => {
    const book = withHero();
    expect(book.resolve('type.hero'))
      .toBe('font-family: Inter; font-size: 3.2rem; font-weight: 800; letter-spacing: -0.02rem');
    expect(book.resolve('type.hero.fontSize')).toBe('3.2rem');
    expect(book.resolve('type.hero.fontWeight')).toBe('800');
  });

  it('depends on its base and follows it, new fields included', () => {
    const book = withHero();
    expect(book.inspect('type.title')!.dependents).toContain('type.hero');
    expect(changesOf(book, () => book.getScope('font-size')!.set('xl', rem(4)))).toContain('type.hero');
    book.getScope('type')!.set('title', variant(book.getTokenByKey('type.title'), { lineHeight: 1.1 }));
    expect(book.resolve('type.hero.lineHeight')).toBe('1.1');
  });

  it('can be the base of another variant and the target of a ref', () => {
    const book = withHero();
    book.getScope('type')!.set('mega', variant(ref('type.hero'), { fontSize: rem(6) }));
    book.getScope('button')!.set('cta', ref('type.mega'));
    expect(book.resolve('button.cta'))
      .toBe('font-family: Inter; font-size: 6rem; font-weight: 800; letter-spacing: -0.02rem');
  });

  it('drops a field set to null', () => {
    const book = buildBook();
    book.getScope('type')!.set('plain', variant(ref('type.title'), { fontFamily: null }));
    expect(book.resolve('type.plain')).toBe('font-size: 3.2rem; font-weight: 700');
    expect(book.has('type.plain.fontFamily')).toBe(false);
    const copy = variant(book.getTokenByKey('type.title'), { fontWeight: null });
    expect(copy.options?.fields).toEqual(['fontFamily', 'fontSize']);
  });

  it('writes inherited fields as var() of the base and its own as values', () => {
    const css = withHero().render('css-variables');
    expect(css).toContain([
      '  --type-hero-font-family: var(--type-title-font-family);',
      '  --type-hero-font-size: var(--type-title-font-size);',
      '  --type-hero-font-weight: 800;',
      '  --type-hero-letter-spacing: -0.02rem;',
    ].join('\n'));
    expect(css).toContain('.type-hero {\n  font-family: var(--type-hero-font-family);');
  });

  it('writes the resolved composite in W3', () => {
    const w3 = new Renderer(withHero(), 'w3-design-tokens').renderW3DesignTokensObject();
    expect(w3.type.hero).toEqual({
      $type: 'typography',
      $value: {
        fontFamily: 'Inter',
        fontSize: { value: 3.2, unit: 'rem' },
        fontWeight: 800,
        letterSpacing: { value: -0.02, unit: 'rem' },
      },
    });
  });

  it('adds nothing to a breakpoint book when only the scale changes', () => {
    const base = layer('base', (book) => {
      book.addScope('font-size').set('xl', rem(3.2));
      const type = book.addScope('type');
      type.set('title', typography({ fontSize: ref('font-size.xl') }));
      type.set('hero', variant(ref('type.title'), { fontWeight: '800' }));
    });
    const tablet = layer('tablet', { 'font-size': { xl: rem(2.8) } });
    const desktopBook = composeBook('desktop', [base]);
    const tabletBook = composeBook('tablet', [base, tablet]);
    expect(tabletBook.render('css-variables', { changedFrom: desktopBook }))
      .toBe(':root {\n  --font-size-xl: 2.8rem;\n}');
  });

  it('rejects a variant of itself and says how to change a style in place', () => {
    const book = buildBook();
    expect(() => book.getScope('type')!.set('title', variant(ref('type.title'), { fontWeight: '800' })))
      .toThrow(/getTokenByKey\("type\.title"\)/);
  });

  it('throws in every format once its base is gone', () => {
    const book = withHero();
    book.getScope('type')!.delete('title');
    expect(() => book.resolve('type.hero')).toThrow(/base "type.title"/);
    expect(() => book.render('css-variables')).toThrow(/base "type.title"/);
  });

  it('throws when the base is a field ref', () => {
    expect(() => variant(ref('type.title.fontSize'), {})).toThrow(FunctionError);
  });
});
