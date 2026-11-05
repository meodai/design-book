import { beforeAll, describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref, inherited, source, sibling, lightest, lighten, FunctionError, TokenError } from '../src/index';
import { parseTokenInput } from '../site/editor/editor-input-parser';
import { loadEditorModule } from './editor/load-editor';

const BLUE = {
  '50': '#eef4ff', '100': '#dbe7ff', '200': '#bcd2ff', '300': '#8fb3ff', '400': '#5c8cf5',
  '500': '#3a6ae0', '600': '#2650c2', '700': '#1d3e9c', '800': '#172f75', '900': '#101f4d',
};

function ramp(book: DesignBook, name = 'blue', values: Record<string, string> = BLUE) {
  const scope = book.addScope(name);
  for (const [key, value] of Object.entries(values)) scope.set(key, color(value));
  return scope;
}

describe('sibling walks its anchor\'s own scope unless told otherwise', () => {
  it('walks the scope the anchor is written in, even when it refers elsewhere', () => {
    const book = new DesignBook('t');
    ramp(book);
    const space = book.addScope('space');
    space.set('s', ref('blue.100'));
    space.set('m', ref('blue.400'));
    space.set('l', ref('blue.800'));
    const ui = book.addScope('ui');
    ui.set('next', sibling(ref('space.s'), 1));
    // space.m, not blue.200
    expect(book.resolve('ui.next')).toBe(BLUE['400']);
  });

  it('defaults to one step', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('next', sibling(ref('blue.100')));
    expect(book.resolve('ui.next')).toBe(BLUE['200']);
  });

  it('does not look through a reference into another scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('surface', ref('blue.100'));
    ui.set('next', sibling(ref('ui.surface'), 1));
    // walks ui: surface, next — next walks ui itself and is skipped, so it stays on surface
    expect(book.resolve('ui.next')).toBe(BLUE['100']);
  });
});

describe('sibling with a named scale', () => {
  it('follows the anchor\'s references into the scale it names', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('interaction', ref('blue.600'));
    ui.set('hover', sibling(ref('.interaction'), ref('blue'), -2));
    expect(book.resolve('ui.hover')).toBe(BLUE['400']);
  });

  it('follows several references until they land in it', () => {
    const book = new DesignBook('t');
    ramp(book);
    const brand = book.addScope('brand');
    brand.set('primary', ref('blue.500'));
    const ui = book.addScope('ui');
    ui.set('interaction', ref('brand.primary'));
    ui.set('hover', sibling(ref('ui.interaction'), ref('blue'), 1));
    expect(book.resolve('ui.hover')).toBe(BLUE['600']);
  });

  it('refuses an anchor whose references never reach it', () => {
    const book = new DesignBook('t');
    ramp(book);
    ramp(book, 'gray', { '50': '#fafafa', '900': '#111111' });
    const ui = book.addScope('ui');
    ui.set('interaction', ref('gray.50'));
    ui.set('hover', sibling(ref('ui.interaction'), ref('blue'), 1));
    expect(() => book.resolve('ui.hover')).toThrow(/"ui.interaction" is not in "blue" and its references do not lead into it/);
  });

  it('steps from the member a selector picked in it', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('page', lightest(ref('blue')));
    ui.set('next', sibling(ref('ui.page'), ref('blue'), 1));
    expect(book.resolve('ui.next')).toBe(BLUE['100']);
  });

  it('refuses a selector that picked from another scope', () => {
    const book = new DesignBook('t');
    ramp(book);
    ramp(book, 'gray', { '50': '#fafafa', '900': '#111111' });
    const ui = book.addScope('ui');
    ui.set('page', lightest(ref('gray')));
    ui.set('next', sibling(ref('ui.page'), ref('blue'), 1));
    expect(() => book.resolve('ui.next')).toThrow(/"ui.page" is not in "blue"/);
  });

  it('without a named scale, does not ask the selector', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('page', lightest(ref('blue')));
    ui.set('next', sibling(ref('ui.page'), 1));
    // walks ui: page is its only member (next walks ui itself), so it stays
    expect(book.resolve('ui.next')).toBe(BLUE['50']);
  });

  it('a border two steps from whatever the text picked, toward the surface', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ctx = book.addScope('ctx');
    ctx.set('surface', ref('blue.50'));
    ctx.set('text', lightest(ref('blue'), { not: ['blue.50', 'blue.100', 'blue.200'] }));
    ctx.set('border', sibling(ref('.text'), ref('blue'), 2, { toward: ref('.surface') }));
    expect(book.resolve('ctx.text')).toBe(BLUE['300']);
    expect(book.resolve('ctx.border')).toBe(BLUE['100']);
  });

  it('re-steps when the scale changes', () => {
    const book = new DesignBook('t');
    const blue = ramp(book);
    const ui = book.addScope('ui');
    ui.set('interaction', ref('blue.500'));
    ui.set('hover', sibling(ref('.interaction'), ref('blue'), 1));
    const watcher = vi.fn();
    book.watch('ui.hover', watcher);
    blue.set('600', color('#123456'));
    expect(watcher).toHaveBeenCalledWith('#123456', expect.anything());
  });
});

describe('sibling with a source(…) anchor', () => {
  it('walks the scale the value is written in', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('interaction', ref('blue.600'));
    ui.set('hover', sibling(source(ref('.interaction'), 'root'), -2));
    expect(book.resolve('ui.hover')).toBe(BLUE['400']);
  });

  it('is one rule across themes whose values come from different ramps', () => {
    const book = new DesignBook('t');
    ramp(book);
    ramp(book, 'green', { '100': '#e6f7ec', '200': '#bfe9cd', '300': '#8fd9aa', '400': '#5cc584' });
    const button = book.addScope('button');
    button.set('interaction', ref('blue.300'));
    button.set('hover', sibling(source(ref('.interaction'), 'root'), 1));
    const green = book.addScope('green-button', { extends: 'button' });
    green.set('interaction', ref('green.300'));
    expect(book.resolve('button.hover')).toBe(BLUE['400']);
    expect(book.resolve('green-button.hover')).toBe('#5cc584');
  });

  it('follows exactly as many references as asked, and refuses more', () => {
    const book = new DesignBook('t');
    ramp(book);
    const brand = book.addScope('brand');
    brand.set('primary', ref('blue.500'));
    const ui = book.addScope('ui');
    ui.set('interaction', ref('brand.primary'));
    // one hop lands on brand.primary: brand is walked (one member, so it stays)
    ui.set('one', sibling(source(ref('.interaction')), 1));
    ui.set('two', sibling(source(ref('.interaction'), 2), 1));
    ui.set('three', sibling(source(ref('.interaction'), 3), 1));
    expect(book.resolve('ui.one')).toBe(BLUE['500']);
    expect(book.resolve('ui.two')).toBe(BLUE['600']);
    expect(() => book.resolve('ui.three')).toThrow(/follows 3 references/);
  });

  it('re-steps when a reference on the way is re-pointed', () => {
    const book = new DesignBook('t');
    ramp(book);
    ramp(book, 'warm', { '100': '#fff1e6', '200': '#ffd9bf', '300': '#ffb98a' });
    const ui = book.addScope('ui');
    ui.set('surface', ref('blue.100'));
    ui.set('next', sibling(source(ref('ui.surface'), 'root'), 1));
    expect(book.resolve('ui.next')).toBe(BLUE['200']);
    ui.set('surface', ref('warm.100'));
    expect(book.resolve('ui.next')).toBe('#ffd9bf');
    const watcher = vi.fn();
    book.watch('ui.next', watcher);
    book.getScope('warm')!.set('200', color('#ffcc99'));
    expect(watcher).toHaveBeenCalledWith('#ffcc99', expect.anything());
  });

  it('refuses a computed value: it is written in no scale\'s list', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('tint', lighten(ref('blue.500'), { amount: 0.1 }));
    ui.set('next', sibling(source(ref('ui.tint'), 'root'), ref('blue'), 1));
    expect(() => book.resolve('ui.next')).toThrow(/not in "blue"/);
  });

  it('is refused as a value and as a pool', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    expect(() => ui.set('x', source(ref('blue.100')))).toThrow(TokenError);
    expect(() => ui.set('y', lighten(source(ref('blue.100')), { amount: 0.1 }))).toThrow(TokenError);
    expect(() => source(ref('blue'))).toThrow(/is a scope/);
  });
});

describe('sibling with inherited(…)', () => {
  it('changes an inherited key in terms of the value it replaces', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('interaction', ref('blue.600'));
    const hover = book.addScope('base-hover', { extends: 'base' });
    hover.set('interaction', sibling(inherited(ref('.interaction')), ref('blue'), -2));
    expect(book.resolve('base-hover.interaction')).toBe(BLUE['400']);
  });

  it('cannot read the key it is defining', () => {
    const book = new DesignBook('t');
    ramp(book);
    book.addScope('base').set('interaction', ref('blue.600'));
    const hover = book.addScope('base-hover', { extends: 'base' });
    expect(() => hover.set('interaction', sibling(ref('.interaction'), ref('blue'), -2))).toThrow(/Circular/);
  });

  it('combines with source: the inherited value, followed to its scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    book.addScope('base').set('interaction', ref('blue.600'));
    const hover = book.addScope('base-hover', { extends: 'base' });
    hover.set('interaction', sibling(source(inherited(ref('.interaction')), 'root'), -2));
    expect(book.resolve('base-hover.interaction')).toBe(BLUE['400']);
  });
});

describe('sibling toward', () => {
  it('reads its target against the scale walked, following it into that scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('background', ref('blue.50'));
    base.set('interaction', ref('blue.600'));
    base.set('hover', sibling(ref('.interaction'), ref('blue'), { toward: ref('.background') }));
    expect(book.resolve('base.hover')).toBe(BLUE['500']);
    // a dark background flips the direction
    base.set('background', ref('blue.900'));
    expect(book.resolve('base.hover')).toBe(BLUE['700']);
  });

  it('is one rule for a light and a dark context', () => {
    const book = new DesignBook('t');
    ramp(book);
    const light = book.addScope('light');
    light.set('page', ref('blue.50'));
    light.set('button', ref('blue.700'));
    light.set('hover', sibling(ref('.button'), ref('blue'), 2, { toward: ref('.page') }));
    const dark = book.addScope('dark', { extends: 'light' });
    dark.set('page', ref('blue.900'));
    dark.set('button', ref('blue.200'));
    expect(book.resolve('light.hover')).toBe(BLUE['500']);  // lighter
    expect(book.resolve('dark.hover')).toBe(BLUE['400']);   // darker
  });

  it('stops at the target, walks away from it with a negative count, and stays put on it', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('page', ref('blue.300'));
    ui.set('button', ref('blue.700'));
    ui.set('far', sibling(ref('ui.button'), ref('blue'), 10, { toward: ref('ui.page') }));
    ui.set('away', sibling(ref('ui.button'), ref('blue'), -2, { toward: ref('ui.page') }));
    ui.set('beyond', sibling(ref('ui.button'), ref('blue'), -10, { toward: ref('ui.page') }));
    ui.set('same', sibling(ref('ui.page'), ref('blue'), 3, { toward: ref('ui.page') }));
    expect(book.resolve('ui.far')).toBe(BLUE['300']);
    expect(book.resolve('ui.away')).toBe(BLUE['900']);
    expect(book.resolve('ui.beyond')).toBe(BLUE['900']);
    expect(book.resolve('ui.same')).toBe(BLUE['300']);
  });

  it('follows the target when it changes', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('page', ref('blue.50'));
    ui.set('button', ref('blue.500'));
    ui.set('hover', sibling(ref('ui.button'), ref('blue'), 1, { toward: ref('ui.page') }));
    const watcher = vi.fn();
    book.watch('ui.hover', watcher);
    ui.set('page', ref('blue.900'));
    expect(watcher).toHaveBeenCalledWith(BLUE['600'], expect.anything());
  });

  it('throws when the target does not lead into the scale walked', () => {
    const book = new DesignBook('t');
    ramp(book);
    ramp(book, 'gray', { '50': '#fafafa', '900': '#111111' });
    const ui = book.addScope('ui');
    ui.set('page', ref('gray.50'));
    ui.set('button', ref('blue.500'));
    ui.set('hover', sibling(ref('ui.button'), ref('blue'), 1, { toward: ref('ui.page') }));
    expect(() => book.resolve('ui.hover')).toThrow(/`toward` "ui.page" is not in "blue"/);
  });

  it('does not combine with wrap, and needs a token', () => {
    expect(() => sibling(ref('ui.a'), 1, { toward: ref('ui.b'), wrap: true })).toThrow(FunctionError);
    expect(() => sibling(ref('ui.a'), 1, { toward: ref('ui') })).toThrow(FunctionError);
  });

  it('reads a relative target in the scope that reads the token', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('page', ref('blue.50'));
    base.set('button', ref('blue.500'));
    base.set('hover', sibling(ref('.button'), ref('blue'), 1, { toward: ref('.page') }));
    const dark = book.addScope('dark', { extends: 'base' });
    dark.set('page', ref('blue.900'));
    // dark's own page, not base's
    expect(book.resolve('dark.hover')).toBe(BLUE['600']);
  });
});

describe('sibling in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  beforeAll(async () => {
    getTokenDisplayValue = (await loadEditorModule()).getTokenDisplayValue;
  });

  it('parses and prints a named scale, a source anchor and an inherited one', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('background', ref('blue.50'));
    base.set('interaction', ref('blue.600'));
    const hover = book.addScope('base-hover', { extends: 'base' });
    const cases: Array<[string, string, string]> = [
      ['a', "sibling(ref('.background'), ref('blue'), 2)", "sibling(ref('.background'), ref('blue'), 2)"],
      ['b', "sibling(source(ref('.background'), 'root'))", "sibling(source(ref('.background'), 'root'), 1)"],
      ['interaction', "sibling(inherited(ref('.interaction')), ref('blue'), -2, { toward: ref('.background') })",
        "sibling(inherited(ref('.interaction')), ref('blue'), -2, { toward: ref('.background') })"],
    ];
    for (const [key, typed, printed] of cases) {
      hover.set(key, parseTokenInput(typed, book, hover));
      expect(getTokenDisplayValue(hover, key)).toBe(printed);
      hover.set(`${key}-again`, parseTokenInput(printed, book, hover));
      expect(book.resolve(`base-hover.${key}-again`)).toBe(book.resolve(`base-hover.${key}`));
    }
    expect(book.resolve('base-hover.a')).toBe(BLUE['200']);
    expect(book.resolve('base-hover.b')).toBe(BLUE['100']);
    expect(book.resolve('base-hover.interaction')).toBe(BLUE['800']); // away from the background
  });
});
