import { beforeAll, describe, expect, it } from 'vitest';
import {
  DesignBook, color, ref,
  bestContrastWith, colorMix, lighten, spacingScale,
} from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 8: a function token nested inside another function's args (e.g.
// spacingScale(lighten(...))) couldn't round-trip. The serializer's arg
// loop had no branch for `arg.type === 'function'`, so a nested function
// arg was silently dropped entirely (not even rendered as
// "[object Object]" — just missing), and the parser never attempted to
// recurse into parseTokenInput for a nested `name(...)` call.

describe('nested function args round-trip', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-08');
  });

  it('round-trips a function nested as another function\'s base argument', () => {
    const brand = book.addScope('brand-08');
    brand.set('primary', color('#0066cc'));

    const ui = book.addScope('ui-08');
    const original = spacingScale(lighten(ref('brand-08.primary'), { amount: 0.3 }), { multiplier: 2 });
    ui.set('scaled', original);

    const serialized = getTokenDisplayValue(ui, 'scaled');
    expect(serialized).toContain('lighten(');
    expect(serialized).not.toContain('[object Object]');

    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });

  it('round-trips a function nested as a target-color argument', () => {
    const brand = book.getScope('brand-08')!;
    brand.set('secondary', color('#ff8800'));

    const ui = book.getScope('ui-08')!;
    const original = bestContrastWith(
      colorMix(color('#ffffff'), color('#000000'), { ratio: 0.5 }),
      brand,
    );
    ui.set('text', original);

    const serialized = getTokenDisplayValue(ui, 'text');
    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });
});
