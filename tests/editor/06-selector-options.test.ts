import { beforeAll, describe, expect, it } from 'vitest';
import {
  DesignBook, color, ref,
  bestContrastWith, closestColor, furthestFrom,
} from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 6: bestContrastWith, closestColor and furthestFrom already serialize
// their `not` option (it's set generically via fn.options), but their
// parsers threw away everything past the required positional arguments —
// so the exclusion list silently vanished on every round trip.

describe('bestContrastWith / closestColor / furthestFrom options round-trip', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;
  let brand: any;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-06');
    brand = book.addScope('brand-06');
    brand.set('a', color('#ff0000'));
    brand.set('b', color('#00ff00'));
    brand.set('surface', color('#ffffff'));
  });

  it('round-trips bestContrastWith with a not-list', () => {
    const ui = book.addScope('ui-06a');
    const original = bestContrastWith(ref('brand-06.surface'), brand, { not: ['brand-06.a'] });
    ui.set('text', original);

    const serialized = getTokenDisplayValue(ui, 'text');
    expect(serialized).toContain('not');

    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });

  it('round-trips closestColor with a not-list', () => {
    const ui = book.addScope('ui-06b');
    const original = closestColor(ref('brand-06.surface'), brand, { not: ['brand-06.b'] });
    ui.set('match', original);

    const serialized = getTokenDisplayValue(ui, 'match');
    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });

  it('round-trips furthestFrom with a not-list', () => {
    const ui = book.addScope('ui-06c');
    const original = furthestFrom(brand, { not: ['brand-06.a', 'brand-06.b'] });
    ui.set('outlier', original);

    const serialized = getTokenDisplayValue(ui, 'outlier');
    const parsed = parseTokenInput(serialized, book, ui);
    expect(parsed).toEqual(original);
  });
});
