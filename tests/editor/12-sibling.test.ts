import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, color, ref, sibling, lighten } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// sibling stores its anchor key in fn.options (it needs the key's position,
// not its value), so the generic serializer would print an options object.
// It is serialized back to the form people type instead.

describe('sibling in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-12');
    const ramp = book.addScope('ramp-12');
    ramp.set('a', color('#eeeeee'));
    ramp.set('b', color('#999999'));
    ramp.set('c', color('#333333'));
  });

  it.each([
    ['plain',  () => sibling(ref('ramp-12.b'), 1), "sibling(ref('ramp-12.b'), 1)"],
    ['down',   () => sibling(ref('ramp-12.b'), -1), "sibling(ref('ramp-12.b'), -1)"],
    ['wrap',   () => sibling(ref('ramp-12.c'), 1, { wrap: true }), "sibling(ref('ramp-12.c'), 1, { wrap: true })"],
    ['not',    () => sibling(ref('ramp-12.a'), 1, { not: ['ramp-12.b'] }), "sibling(ref('ramp-12.a'), 1, { not: [\"ramp-12.b\"] })"],
  ] as const)('serializes and re-parses (%s)', (name, make, expected) => {
    const ui = book.addScope(`ui-12-${name}`);
    const original = make();
    ui.set('pick', original);

    const serialized = getTokenDisplayValue(ui, 'pick');
    expect(serialized).toBe(expected);
    expect(parseTokenInput(serialized, book, ui)).toEqual(original);
  });

  it('round-trips when nested in another function', () => {
    const ui = book.addScope('ui-12-nested');
    const original = lighten(sibling(ref('ramp-12.a'), 2), { amount: 0.1 });
    ui.set('soft', original);
    const serialized = getTokenDisplayValue(ui, 'soft');
    expect(serialized).toContain("sibling(ref('ramp-12.a'), 2)");
    expect(parseTokenInput(serialized, book, ui)).toEqual(original);
  });

  it('accepts not: [ref(...)] typed by hand', () => {
    const ui = book.addScope('ui-12-typed');
    expect(parseTokenInput("sibling(ref('ramp-12.a'), 1, { wrap: true, not: [ref('ramp-12.b')] })", book, ui))
      .toEqual(sibling(ref('ramp-12.a'), 1, { wrap: true, not: ['ramp-12.b'] }));
  });

  it('requires a ref anchor and a numeric offset', () => {
    const ui = book.addScope('ui-12-bad');
    expect(() => parseTokenInput("sibling(ref('ramp-12.a'))", book, ui)).toThrow(/2 arguments/);
    expect(() => parseTokenInput("sibling(ref('ramp-12.a'), up)", book, ui)).toThrow(/offset/);
  });
});
