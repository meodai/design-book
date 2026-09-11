import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, color, ref, relativeTo } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 3: relativeTo's modifications never parsed back — the parser
// hard-coded [null, null, null] regardless of what was serialized, so a
// relativeTo() token lost its channel modifications every time it round
// tripped through the editor. The constructor stores its config as
// `options: { colorSpace, modifications }`, which is exactly the form the
// generic serializer already emits, so the parser needs to accept that
// options-object form. It should also accept the positional convenience
// form for hand typing: relativeTo(ref, 'hsl', [null, null, '+0.1']).

describe('relativeTo modifications round-trip', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-03');
  });

  it('round-trips the options-object form the serializer produces', () => {
    const brand = book.addScope('brand-03');
    brand.set('primary', color('#0066cc'));

    const original = relativeTo(ref('brand-03.primary'), 'oklch', [null, null, '+180']);
    brand.set('complement', original);

    const serialized = getTokenDisplayValue(brand, 'complement');
    expect(serialized).toContain('modifications');

    const parsed = parseTokenInput(serialized, book, brand);
    expect(parsed).toEqual(original);
  });

  it('accepts the hand-written positional form', () => {
    const brand = book.getScope('brand-03')!;
    const parsed = parseTokenInput(
      "relativeTo(ref('brand-03.primary'), 'hsl', [null, null, '+0.1'])",
      book,
      brand,
    );
    const expected = relativeTo(ref('brand-03.primary'), 'hsl', [null, null, '+0.1']);
    expect(parsed).toEqual(expected);
  });
});
