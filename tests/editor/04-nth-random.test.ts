import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, color, px, nth, random } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 4: nth's fn.args is just [scope] — its index and `not` list live in
// fn.options, which is exactly the form the generic serializer emits
// (`nth(scope, { index, not })`). The parser only accepted a positional
// index, so it threw "nth requires a numeric index" on every round trip.
// `random` had no parser entry at all.

describe('nth and random round-trip', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-04');
  });

  it('round-trips nth (options-object form the serializer emits)', () => {
    const space = book.addScope('space-04');
    space.set('xs', px(4));
    space.set('s', px(8));
    space.set('m', px(12));

    const ui = book.addScope('ui-04');
    const original = nth(space, 1, { not: ['space-04.xs'] });
    ui.set('picked', original);

    const serialized = getTokenDisplayValue(ui, 'picked');
    expect(serialized).toContain('index');

    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });

  it('still accepts the positional index form', () => {
    const space = book.getScope('space-04')!;
    const parsed = parseTokenInput('nth(space-04, 2)', book, space);
    expect(parsed).toEqual(nth(space, 2));
  });

  it('round-trips random', () => {
    const brand = book.addScope('brand-04');
    brand.set('primary', color('#0066cc'));
    brand.set('secondary', color('#ff8800'));

    const ui = book.getScope('ui-04')!;
    const original = random(brand, { type: 'color', seed: 42, not: ['brand-04.secondary'] });
    ui.set('accent', original);

    const serialized = getTokenDisplayValue(ui, 'accent');
    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });
});
