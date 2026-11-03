import { beforeAll, describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref, inParent, sibling, lightest, lighten, FunctionError } from '../src/index';
import { parseTokenInput } from '../editor/editor-input-parser';
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

describe('sibling steps along the scale its anchor lives on', () => {
  it('follows the anchor through a reference to its scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('surface', ref('blue.100'));
    ui.set('next', sibling(ref('ui.surface'), 1));
    expect(book.resolve('ui.next')).toBe(BLUE['200']);
  });

  it('defaults to one step', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('surface', ref('blue.100'));
    ui.set('next', sibling(ref('ui.surface')));
    expect(book.resolve('ui.next')).toBe(BLUE['200']);
  });

  it('follows a selector to the member it picked', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('page', lightest(ref('blue')));
    ui.set('next', sibling(ref('ui.page'), 1));
    expect(book.resolve('ui.next')).toBe(BLUE['100']);
  });

  it('chains: a sibling of a sibling steps along the same scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('surface', ref('blue.100'));
    ui.set('hover', sibling(ref('ui.surface'), 1));
    ui.set('active', sibling(ref('ui.hover'), 1));
    expect(book.resolve('ui.active')).toBe(BLUE['300']);
  });

  it('throws when the anchor is computed and lives on no scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    const ui = book.addScope('ui');
    ui.set('tint', lighten(ref('blue.500'), { amount: 0.1 }));
    ui.set('next', sibling(ref('ui.tint'), 1));
    expect(() => book.resolve('ui.next')).toThrow(/not a member of any scope/);
  });

  it('re-steps when the anchor moves to another scale and that scale changes', () => {
    const book = new DesignBook('t');
    ramp(book);
    const warm = ramp(book, 'warm', { '100': '#fff1e6', '200': '#ffd9bf', '300': '#ffb98a' });
    const ui = book.addScope('ui');
    ui.set('surface', ref('blue.100'));
    ui.set('next', sibling(ref('ui.surface'), 1));
    ui.set('surface', ref('warm.100'));
    expect(book.resolve('ui.next')).toBe('#ffd9bf');
    const watcher = vi.fn();
    book.watch('ui.next', watcher);
    warm.set('200', color('#ffcc99'));
    expect(watcher).toHaveBeenCalledWith('#ffcc99', expect.anything());
  });
});

describe('sibling toward', () => {
  it('steps from the parent\'s interaction toward the parent\'s background', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('background', ref('blue.50'));
    base.set('interaction', ref('blue.600'));
    const hover = book.addScope('base-hover', { extends: 'base' });
    hover.set('interaction', sibling(inParent(ref('.interaction')), { toward: inParent(ref('.background')) }));
    expect(book.resolve('base-hover.interaction')).toBe(BLUE['500']);

    // a dark background flips the direction
    base.set('background', ref('blue.900'));
    expect(book.resolve('base-hover.interaction')).toBe(BLUE['700']);
  });

  it('is one rule for a light and a dark context', () => {
    const book = new DesignBook('t');
    ramp(book);
    const light = book.addScope('light');
    light.set('page', ref('blue.50'));
    light.set('button', ref('blue.700'));
    light.set('hover', sibling(ref('.button'), 2, { toward: ref('.page') }));
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
    ui.set('far', sibling(ref('ui.button'), 10, { toward: ref('ui.page') }));
    ui.set('away', sibling(ref('ui.button'), -2, { toward: ref('ui.page') }));
    ui.set('beyond', sibling(ref('ui.button'), -10, { toward: ref('ui.page') }));
    ui.set('same', sibling(ref('ui.page'), 3, { toward: ref('ui.page') }));
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
    ui.set('hover', sibling(ref('ui.button'), 1, { toward: ref('ui.page') }));
    const watcher = vi.fn();
    book.watch('ui.hover', watcher);
    ui.set('page', ref('blue.900'));
    expect(watcher).toHaveBeenCalledWith(BLUE['600'], expect.anything());
  });

  it('throws when the target lives on another scale', () => {
    const book = new DesignBook('t');
    ramp(book);
    ramp(book, 'gray', { '50': '#fafafa', '900': '#111111' });
    const ui = book.addScope('ui');
    ui.set('page', ref('gray.50'));
    ui.set('button', ref('blue.500'));
    ui.set('hover', sibling(ref('ui.button'), 1, { toward: ref('ui.page') }));
    expect(() => book.resolve('ui.hover')).toThrow(/"ui.page" is in "gray", but "ui.button" steps along "blue"/);
  });

  it('does not combine with wrap, and needs a token', () => {
    expect(() => sibling(ref('ui.a'), 1, { toward: ref('ui.b'), wrap: true })).toThrow(FunctionError);
    expect(() => sibling(ref('ui.a'), 1, { toward: ref('ui') })).toThrow(FunctionError);
  });

  it('reads toward like any reference: no implicit parent', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('page', ref('blue.50'));
    base.set('button', ref('blue.500'));
    base.set('hover', sibling(ref('.button'), 1, { toward: ref('.page') }));
    const dark = book.addScope('dark', { extends: 'base' });
    dark.set('page', ref('blue.900'));
    // dark's own page, not base's
    expect(book.resolve('dark.hover')).toBe(BLUE['600']);
  });
});

describe('sibling toward in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  beforeAll(async () => {
    getTokenDisplayValue = (await loadEditorModule()).getTokenDisplayValue;
  });

  it('parses the short form and prints it with the step count', () => {
    const book = new DesignBook('t');
    ramp(book);
    const base = book.addScope('base');
    base.set('background', ref('blue.50'));
    base.set('interaction', ref('blue.600'));
    const hover = book.addScope('base-hover', { extends: 'base' });
    const typed = "sibling(inParent(ref('.interaction')), { toward: inParent(ref('.background')) })";
    hover.set('interaction', parseTokenInput(typed, book, hover));
    expect(book.resolve('base-hover.interaction')).toBe(BLUE['500']);
    const printed = getTokenDisplayValue(hover, 'interaction');
    expect(printed).toBe("sibling(inParent(ref('.interaction')), 1, { toward: inParent(ref('.background')) })");
    hover.set('again', parseTokenInput(printed, book, hover));
    expect(book.resolve('base-hover.again')).toBe(BLUE['500']);
  });
});
