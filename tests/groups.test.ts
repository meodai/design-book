import { describe, it, expect, vi } from 'vitest';
import {
  DesignBook, typography, ref, rem, px, color, string, inherited, composeBook, layer,
  CircularDependencyError, FunctionError, TokenError, Renderer, SVGRenderer, bestContrastWith, largest,
} from '../src/index';
import { isGroupValue } from '../src/tokens';

/** Text styles: the demo case. */
function typeBook() {
  const book = new DesignBook('t');
  book.addScope('font').set('sans', string('Inter'));
  const size = book.addScope('font-size');
  size.set('md', rem(1.8));
  size.set('xl', rem(3.2));
  const type = book.addScope('type');
  type.set('body', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.md'), lineHeight: 1.5 }));
  type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.xl'), fontWeight: '700' }));
  book.addScope('button').set('label', ref('type.body'));
  return { book, type, size };
}

const changesOf = (book: DesignBook, action: () => void) => {
  const keys: string[] = [];
  const off = book.on('tokenChanged', (e) => keys.push(e.detail.key));
  action();
  off();
  return keys;
};

describe('a key holds a group', () => {
  it('written as a plain object; its members are ordinary keys at its path', () => {
    const book = new DesignBook('g');
    const button = book.addScope('button');
    button.set('hover', { bg: color('#0055aa'), text: color('#ffffff') });
    expect(isGroupValue(button.getRaw('hover'))).toBe(true);
    expect(book.getScope('button.hover')!.getAllKeys()).toEqual(['bg', 'text']);
    expect(book.resolve('button.hover.bg')).toBe('#0055aa');
    expect(button.resolve('hover.text')).toBe('#ffffff');
  });

  it('nests: a plain object inside is a group inside', () => {
    const book = new DesignBook('g');
    book.addScope('button').set('major', { hover: { bg: color('#0055aa') }, active: { bg: color('#003366') } });
    expect(book.resolve('button.major.hover.bg')).toBe('#0055aa');
    expect(book.resolve('button.major.active.bg')).toBe('#003366');
  });

  it('has no single value: resolving it says to read a member', () => {
    const { book } = typeBook();
    expect(() => book.resolve('type.title')).toThrow(TokenError);
    expect(() => book.resolve('type.title')).toThrow(/"type.title" is a group; read one of its members, e.g. type.title.fontFamily/);
  });

  it('a member may be set, replaced and deleted on its own', () => {
    const { book } = typeBook();
    const title = book.getScope('type.title')!;
    title.set('letterSpacing', rem(-0.02));
    expect(book.resolve('type.title.letterSpacing')).toBe('-0.02rem');
    title.set('fontWeight', string('800'));
    expect(book.resolve('type.title.fontWeight')).toBe('800');
    title.delete('letterSpacing');
    expect(book.has('type.title.letterSpacing')).toBe(false);
  });

  it('replacing the group replaces its members; a token in its place removes it', () => {
    const { book, type } = typeBook();
    type.set('title', typography({ fontSize: rem(4) }));
    expect(book.getScope('type.title')!.getAllKeys()).toEqual(['fontSize']);
    type.set('title', rem(4));
    expect(book.getScope('type.title')).toBeUndefined();
    expect(book.resolve('type.title')).toBe('4rem');
  });

  it('deleting the key or the scope removes the group with it', () => {
    const { book, type } = typeBook();
    type.delete('title');
    expect(book.getScope('type.title')).toBeUndefined();
    book.deleteScope('type');
    expect(book.getScope('type.body')).toBeUndefined();
  });

  it('is a scope like any other: listed, with its holder', () => {
    const { book } = typeBook();
    expect(book.getAllScopes().map((s) => s.name)).toEqual(['font', 'font-size', 'type', 'type.body', 'type.title', 'button']);
    expect(book.getScope('type.title')!.holderName).toBe('type');
    expect(book.getScope('type')!.holderName).toBeUndefined();
  });

  it('refuses a member name that cannot be a key', () => {
    const book = new DesignBook('g');
    expect(() => book.addScope('x').set('g', { 'a b': color('#000') })).toThrow(TokenError);
    expect(() => typography({})).toThrow(FunctionError);
  });
});

describe('members in the graph', () => {
  it('a member depends on what it reads; the group key on its members', () => {
    const { book } = typeBook();
    const graph = book.getDependencyGraph();
    expect(graph.getPrerequisitesFor('type.title.fontSize')).toEqual(['font-size.xl']);
    expect(graph.getPrerequisitesFor('type.title').sort()).toEqual(['type.title.fontFamily', 'type.title.fontSize', 'type.title.fontWeight']);
  });

  it('a change reaches readers of the member and of the group', () => {
    const { book, size } = typeBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    const keys = changesOf(book, () => size.set('xl', rem(4)));
    expect(keys).toContain('type.title.fontSize');
    expect(keys).toContain('type.title');
    expect(keys).toContain('callout.size');
    expect(book.resolve('callout.size')).toBe('4rem');
  });

  it('a member may read another member of its group, or of another group', () => {
    const book = new DesignBook('g');
    const type = book.addScope('type');
    type.set('a', typography({ fontSize: rem(1), lineHeight: ref('.fontSize') }));
    type.set('b', typography({ fontSize: ref('type.a.fontSize'), lineHeight: 1.2 }));
    type.set('a', typography({ fontSize: rem(1), lineHeight: ref('type.b.lineHeight') }));
    expect(book.resolve('type.a.lineHeight')).toBe('1.2');
    expect(book.resolve('type.b.fontSize')).toBe('1rem');
  });

  it('refuses a real cycle between members and leaves the group as it was', () => {
    const book = new DesignBook('g');
    const type = book.addScope('type');
    type.set('a', typography({ fontSize: rem(1) }));
    expect(() => book.getScope('type.a')!.set('lineHeight', ref('.lineHeight'))).toThrow(CircularDependencyError);
    expect(book.getScope('type.a')!.getAllKeys()).toEqual(['fontSize']);
  });

  it('picks up a group written after a reference to its member', () => {
    const book = new DesignBook('g');
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    book.addScope('type').set('title', typography({ fontSize: rem(2) }));
    expect(book.resolve('callout.size')).toBe('2rem');
    const watch = vi.fn();
    book.watch('callout.size', watch);
    book.getScope('type.title')!.set('fontSize', rem(3));
    expect(watch).toHaveBeenCalledWith('3rem', expect.anything());
  });

  it('works the same in batch mode', () => {
    const { book, size } = typeBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    book.mode = 'batch';
    size.set('xl', rem(5));
    book.flush();
    book.mode = 'auto';
    expect(book.resolve('callout.size')).toBe('5rem');
  });

  it('inspect describes a member like any key', () => {
    const { book } = typeBook();
    expect(book.inspect('type.title.fontSize')).toMatchObject({ value: '3.2rem', dependencies: ['font-size.xl'] });
    expect(book.inspect('type.title.nope')).toBeNull();
  });
});

describe('ref with changes: a group extending a scope', () => {
  function withHero() {
    const { book, type } = typeBook();
    type.set('hero', ref('.title', { fontWeight: '800', letterSpacing: rem(-0.02) }));
    return { book, type };
  }

  it('reads the base for the members it does not set, live', () => {
    const { book, type } = withHero();
    expect(book.resolve('type.hero.fontSize')).toBe('3.2rem');
    expect(book.resolve('type.hero.fontWeight')).toBe('800');
    expect(book.getScope('type.hero')!.getAllKeys()).toEqual(['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing']);
    book.getScope('type.title')!.set('lineHeight', string('1.1'));
    expect(book.resolve('type.hero.lineHeight')).toBe('1.1');
    void type;
  });

  it('is of its base kind: a text style changed is a text style', () => {
    const { book } = withHero();
    expect(book.getScope('type.hero')!.getKind()).toBe('typography');
  });

  it('null leaves a member of the base out', () => {
    const { book, type } = typeBook();
    type.set('plain', ref('.title', { fontWeight: null }));
    expect(book.getScope('type.plain')!.getAllKeys()).toEqual(['fontFamily', 'fontSize']);
    expect(book.has('type.plain.fontWeight')).toBe(false);
  });

  it('can extend one that extends another', () => {
    const { book, type } = withHero();
    type.set('mega', ref('.hero', { fontSize: rem(6) }));
    expect(book.resolve('type.mega.fontWeight')).toBe('800');
    expect(book.resolve('type.mega.fontSize')).toBe('6rem');
  });

  it('cannot extend the group it replaces, and says how to change it in place', () => {
    const { type } = typeBook();
    expect(() => type.set('title', ref('.title', { fontWeight: '900' }))).toThrow(/set its members/);
  });

  it('needs a scope to change', () => {
    const { type } = typeBook();
    expect(() => type.set('x', ref('font-size.md', { fontSize: rem(1) }))).toThrow(/changes the members of a scope/);
    expect(() => ref('type.title', 'bold' as never)).toThrow(/members to change, as an object/);
  });

  it('a plain ref to a scope is still a reference, not a copy', () => {
    const { book, type } = typeBook();
    type.set('same', ref('.title'));
    expect(book.getScope('type.same')).toBeUndefined();
    expect(book.resolve('type.same.fontSize')).toBe('3.2rem');
  });
});

describe('groups and extends', () => {
  it('a scope extending one that holds a group reads that same group', () => {
    const { book } = typeBook();
    book.addScope('type-tablet', { extends: 'type' });
    expect(book.getScope('type-tablet.title')).toBeUndefined();
    expect(book.resolve('type-tablet.title.fontSize')).toBe('3.2rem');
    book.getScope('type.title')!.set('fontWeight', string('800'));
    expect(book.resolve('type-tablet.title.fontWeight')).toBe('800');
    expect(book.render('css-variables')).toContain('--type-tablet-title-font-size: var(--type-title-font-size);');
  });

  it('a breakpoint scope refines a style one level up without naming it', () => {
    const { book } = typeBook();
    const tablet = book.addScope('type-tablet', { extends: 'type' });
    tablet.set('title', inherited(ref('.title', { fontSize: rem(2.4) })));
    expect(book.resolve('type-tablet.title.fontSize')).toBe('2.4rem');
    expect(book.resolve('type-tablet.title.fontWeight')).toBe('700');
    const phone = book.addScope('type-phone', { extends: 'type-tablet' });
    phone.set('title', inherited(ref('.title', { fontSize: rem(2) })));
    expect(book.resolve('type-phone.title.fontSize')).toBe('2rem');
    expect(book.resolve('type-phone.title.fontWeight')).toBe('700');
  });
});

describe('reading a group through a key', () => {
  it('a reference to a group holds it: its members are read through the key', () => {
    const { book, size } = typeBook();
    expect(book.resolve('button.label.fontSize')).toBe('1.8rem');
    size.set('md', rem(2));
    expect(book.resolve('button.label.fontSize')).toBe('2rem');
  });

  it('follows the reference when it is re-pointed', () => {
    const { book } = typeBook();
    book.addScope('callout').set('size', ref('button.label.fontSize'));
    const watch = vi.fn();
    book.watch('callout.size', watch);
    book.getScope('button')!.set('label', ref('type.title'));
    expect(book.resolve('callout.size')).toBe('3.2rem');
    expect(watch).toHaveBeenCalledWith('3.2rem', expect.anything());
  });

  it('a selector that picks a group holds it, and follows the pick', () => {
    const { book, size } = typeBook();
    const ui = book.addScope('ui');
    ui.set('big', largest(ref('type')));
    expect(book.pickOf('ui.big')).toBe('type.title');
    expect(book.resolve('ui.big.fontSize')).toBe('3.2rem');
    size.set('md', rem(5));
    expect(book.pickOf('ui.big')).toBe('type.body');
    expect(book.resolve('ui.big.fontSize')).toBe('5rem');
  });

  it('a group as a pool: its members are the candidates', () => {
    const book = new DesignBook('g');
    book.addScope('card').set('colors', { ink: color('#111111'), mist: color('#eeeeee') });
    book.addScope('ui').set('text', bestContrastWith(color('#ffffff'), ref('card.colors')));
    expect(book.pickOf('ui.text')).toBe('card.colors.ink');
  });
});

describe('holding a top-level scope', () => {
  it('a key may hold any scope by reference, and its members are read through it', () => {
    const book = new DesignBook('t');
    const major = book.addScope('button-major');
    major.set('bg', color('#1f4fd6'));
    book.addScope('card').set('action', ref('button-major'));
    expect(book.resolve('card.action.bg')).toBe('#1f4fd6');
    book.addScope('callout').set('bg', ref('card.action.bg'));
    const watch = vi.fn();
    book.watch('callout.bg', watch);
    major.set('bg', color('#12307f'));
    expect(watch).toHaveBeenCalledWith('#12307f', expect.anything());
    expect(book.render('css-variables')).toContain('--card-action-bg: var(--button-major-bg);');
  });

  it('a scope cannot come to hold itself', () => {
    const book = new DesignBook('t');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', ref('b'));
    expect(() => b.set('y', ref('a'))).toThrow(CircularDependencyError);
    expect(() => a.set('self', ref('a'))).toThrow(/cannot hold itself/);
  });
});

describe('changes and watching through', () => {
  it('changing a nested group replaces it whole', () => {
    const book = new DesignBook('t');
    const b = book.addScope('button');
    b.set('major', { hover: { bg: color('#12307f'), text: color('#ffffff') } });
    b.set('minor', ref('.major', { hover: { bg: color('#d6e2ff') } }));
    expect(book.getScope('button.minor.hover')!.getAllKeys()).toEqual(['bg']);
    expect(book.has('button.minor.hover.text')).toBe(false);
  });

  it('watch follows a path read through a reference, and lets go', () => {
    const book = new DesignBook('t');
    const major = book.addScope('button-major');
    major.set('bg', color('#1f4fd6'));
    const card = book.addScope('card');
    card.set('action', ref('button-major'));
    const seen: Array<string | undefined> = [];
    const stop = book.watch('card.action.bg', (value) => seen.push(value));
    major.set('bg', color('#12307f'));
    card.set('action', ref('button-minor-missing'));
    expect(seen[0]).toBe('#12307f');
    stop();
    expect(book.getDependencyGraph().hasNode('card.action.bg')).toBe(false);
  });
});

describe('inherited inside groups, and groupAt', () => {
  it('a relative path navigates from the scope reading it', () => {
    const { book } = typeBook();
    const tablet = book.addScope('type-tablet', { extends: 'type' });
    tablet.set('title-size', inherited(ref('.title.fontSize')));
    expect(book.resolve('type-tablet.title-size')).toBe('3.2rem');
  });

  it('in a changed group, inherited reads the scope it changes; in a plain one it is an error', () => {
    const { book, type } = typeBook();
    type.set('hero', ref('.title', { fontWeight: '800' }));
    book.getScope('type.hero')!.set('baseWeight', inherited(ref('.fontWeight')));
    expect(book.resolve('type.hero.baseWeight')).toBe('700');
    expect(() => book.getScope('type.title')!.set('x', inherited(ref('.fontWeight'))))
      .toThrow(/"type.title" has no parent.*name the scope instead/);
  });

  it('groupAt names the group a key holds: own, inherited, referred to, picked', () => {
    const { book } = typeBook();
    book.addScope('type-tablet', { extends: 'type' });
    book.addScope('ui').set('big', largest(ref('type')));
    book.getScope('ui')!.set('also', ref('.big'));
    expect(book.groupAt('type.title')).toBe('type.title');
    expect(book.groupAt('type-tablet.title')).toBe('type.title');
    expect(book.groupAt('button.label')).toBe('type.body');
    expect(book.groupAt('ui.also')).toBe('type.title');
    expect(book.groupAt('type.title.fontSize')).toBeUndefined();
    expect(book.groupAt('nope.nothing')).toBeUndefined();
  });
});

describe('watching a path before it leads anywhere', () => {
  it('starts reporting once the reference it is read through is written', () => {
    const book = new DesignBook('t');
    book.addScope('button-major').set('bg', color('#1f4fd6'));
    book.addScope('button-minor').set('bg', color('#d6e2ff'));
    const card = book.addScope('card');
    const seen: Array<string | undefined> = [];
    const stop = book.watch('card.action.bg', (value) => seen.push(value));
    card.set('action', ref('button-major'));
    book.getScope('button-major')!.set('bg', color('#12307f'));
    card.set('action', ref('button-minor'));
    card.delete('action');
    card.set('action', ref('button-major'));
    expect(seen).toEqual(['#1f4fd6', '#12307f', '#d6e2ff', undefined, '#12307f']);
    stop();
    expect(book.getDependencyGraph().hasNode('card.action.bg')).toBe(false);
    expect(book.getDependencyGraph().hasNode('card.action')).toBe(true);
  });

  it('waits for a scope that does not exist yet, and leaves nothing behind', () => {
    const book = new DesignBook('t');
    book.addScope('type').set('title', typography({ fontSize: rem(2) }));
    const seen: Array<string | undefined> = [];
    const stop = book.watch('card.heading.fontSize', (value) => seen.push(value));
    book.addScope('card').set('heading', ref('type.title'));
    book.getScope('type.title')!.set('fontSize', rem(3));
    expect(seen).toEqual(['2rem', '3rem']);
    stop();
    book.deleteScope('card');
    expect(book.getDependencyGraph().hasNode('card.heading.fontSize')).toBe(false);
    expect(book.getDependencyGraph().hasNode('card.heading')).toBe(false);
  });

  it('a key of its own or a top-level key is watched as before', () => {
    const book = new DesignBook('t');
    const seen: Array<string | undefined> = [];
    book.watch('brand.primary', (value) => seen.push(value));
    book.addScope('brand').set('primary', color('#ff0000'));
    expect(seen).toEqual(['#ff0000']);
    expect(book.getDependencyGraph().hasNode('brand.primary')).toBe(true);
  });
});

describe('named tables listed in a table', () => {
  function named() {
    const book = new DesignBook('n');
    const title = book.addScope('typography-title', { kind: 'typography' });
    title.set('fontSize', rem(2.4));
    title.set('fontWeight', string('700'));
    const typography = book.addScope('typography');
    typography.set('title', ref('typography-title'));
    book.addScope('card').set('heading', ref('typography.title'));
    book.addScope('modal').set('heading', ref('typography-title'));
    return book;
  }

  it('an entry points at a table; it is reused through the list or directly', () => {
    const book = named();
    expect(book.resolve('card.heading.fontSize')).toBe('2.4rem');
    expect(book.resolve('modal.heading.fontWeight')).toBe('700');
    book.getScope('typography-title')!.set('fontSize', rem(3));
    expect(book.resolve('card.heading.fontSize')).toBe('3rem');
  });

  it('css: a text style by kind; a list entry named like its table is that table', () => {
    const css = named().render('css-variables');
    expect(css).toContain('--typography-title-font-size: 2.4rem;');
    expect(css).toContain('--card-heading-font-size: var(--typography-title-font-size);');
    expect(css).toContain('.modal-heading {');
    expect(css.match(/--typography-title-font-size:/g)).toHaveLength(1);
  });

  it('svg: an entry pointing at a table is a line to its header', () => {
    const svg = new SVGRenderer(named(), { linksOnly: false }).render();
    expect(svg).toContain('data-from="typography.title" data-to="__header__typography-title"');
  });
});

describe('rendering groups', () => {
  it('css: a variable per member at its path, a class per text style', () => {
    const css = typeBook().book.render('css-variables');
    expect(css).toContain('  --type-title-font-family: var(--font-sans);\n  --type-title-font-size: var(--font-size-xl);\n  --type-title-font-weight: 700;');
    expect(css).not.toMatch(/--type-title:/);
    expect(css).toContain('.type-title {\n  font-family: var(--type-title-font-family);\n  font-size: var(--type-title-font-size);\n  font-weight: var(--type-title-font-weight);\n}');
  });

  it('css: a group held by reference points at the original, with its own class', () => {
    const css = typeBook().book.render('css-variables');
    expect(css).toContain('  --button-label-font-family: var(--type-body-font-family);\n  --button-label-font-size: var(--type-body-font-size);\n  --button-label-line-height: var(--type-body-line-height);');
    expect(css).toContain('.button-label {\n  font-family: var(--button-label-font-family);');
  });

  it('css: a changed scope points its other members at the original', () => {
    const { book, type } = typeBook();
    type.set('hero', ref('.title', { fontWeight: '800' }));
    const css = book.render('css-variables');
    expect(css).toContain('  --type-hero-font-family: var(--type-title-font-family);\n  --type-hero-font-size: var(--type-title-font-size);\n  --type-hero-font-weight: 800;');
  });

  it('css: any depth, and a member variable colliding with a key throws', () => {
    const book = new DesignBook('g');
    book.addScope('button').set('major', { hover: { bg: color('#0055aa') } });
    expect(book.render('css-variables')).toContain('--button-major-hover-bg: #0055aa;');
    const { book: typed } = typeBook();
    typed.getScope('type')!.set('title-font-size', rem(1));
    expect(() => typed.render('css-variables')).toThrow(/collision/);
  });

  it('css: classPrefix, and camelCase members as kebab-case properties', () => {
    const book = new DesignBook('c');
    book.addScope('type').set('caps', typography({ textTransform: 'uppercase', fontFeatureSettings: '"smcp"' }));
    expect(book.render('css-variables', { classPrefix: 't-' })).toContain('.t-type-caps {\n  text-transform: var(--type-caps-text-transform);\n  font-feature-settings: var(--type-caps-font-feature-settings);\n}');
  });

  it('css: a breakpoint book writes only the member that changed', () => {
    const base = layer('base', (book) => {
      book.addScope('font-size').set('xl', rem(3.2));
      book.addScope('type').set('title', typography({ fontSize: ref('font-size.xl'), lineHeight: 1.1 }));
    });
    const tablet = layer('tablet', { 'font-size': { xl: rem(2.8) } });
    const phone = layer('phone', (book) => {
      book.getScope('type.title')!.set('lineHeight', string('1.2'));
    });
    const desktopBook = composeBook('desktop', [base]);
    const tabletBook = composeBook('tablet', [base, tablet]);
    const phoneBook = composeBook('phone', [base, tablet, phone]);
    expect(tabletBook.render('css-variables', { media: '(max-width: 1024px)', changedFrom: desktopBook }))
      .toBe('@media (max-width: 1024px) {\n  :root {\n    --font-size-xl: 2.8rem;\n  }\n}');
    expect(phoneBook.render('css-variables', { media: '(max-width: 620px)', changedFrom: tabletBook }))
      .toBe('@media (max-width: 620px) {\n  :root {\n    --type-title-line-height: 1.2;\n  }\n}');
  });

  it('w3: a text style is the native composite, a reference to one an alias', () => {
    const { book, type } = typeBook();
    type.set('lead', typography({ fontSize: rem(2) }, { description: 'Running text' }));
    const w3 = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
    expect(w3.type.title).toEqual({
      $type: 'typography',
      $value: { fontFamily: 'Inter', fontSize: { value: 3.2, unit: 'rem' }, fontWeight: 700 },
    });
    expect(w3.type.lead.$description).toBe('Running text');
    expect(w3.button.label).toEqual({ $type: 'typography', $value: '{type.body}' });
  });

  it('w3: any other group is a nested W3 group; a member of a text style is written resolved', () => {
    const { book } = typeBook();
    book.getScope('button')!.set('hover', { bg: color('#0055aa') });
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    const w3 = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
    expect(w3.button.hover.bg.$type).toBe('color');
    expect(w3.callout.size).toEqual({ $type: 'dimension', $value: { value: 3.2, unit: 'rem' } });
  });

  it('json: members at their paths', () => {
    const json = JSON.parse(typeBook().book.render('json'));
    expect(json['type.body.fontSize']).toBe('1.8rem');
    expect(json['button.label.lineHeight']).toBe('1.5');
    expect(json['type.body']).toBeUndefined();
  });

  it('svg: a group is a table; the key holding it a line to it; a member reference a line to the member', () => {
    const { book } = typeBook();
    book.addScope('callout').set('size', ref('type.title.fontSize'));
    const svg = new SVGRenderer(book, { linksOnly: false }).render();
    expect(svg).toContain('>type.title</text>');
    expect(svg).toContain('data-from="type.title" data-to="__header__type.title"');
    expect(svg).toContain('data-from="callout.size" data-to="type.title.fontSize"');
  });
});

describe('a text style in comparisons', () => {
  it('is measured by its font size, or the member named by `by`', () => {
    const { book } = typeBook();
    const ui = book.addScope('ui');
    ui.set('big', largest(ref('type')));
    ui.set('bold', largest(ref('type'), { by: 'fontWeight' }));
    expect(book.pickOf('ui.big')).toBe('type.title');
    expect(book.pickOf('ui.bold')).toBe('type.title');
    void px;
  });
});
