import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, color, ref, mostVivid } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 1: splitArgs ignored `[` / `{` depth, so an option object containing
// an array (e.g. `not: [...]`) got chopped into multiple bogus top-level
// "args" wherever a comma appeared inside the brackets — silently losing
// every `not` entry after the first.

describe('splitArgs tracks [ ] and { } depth', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-01');
  });

  it('round-trips a mostVivid `not` list with more than one entry', () => {
    // Token pool the selector iterates — kept separate from the scope the
    // token itself lives in, so setting the token doesn't change the pool's
    // key set (which would shift the expected visualDependencies metadata).
    const brand = book.addScope('brand-01');
    brand.set('a', color('#ff0000'));
    brand.set('b', color('#00ff00'));
    brand.set('c', color('#0000ff'));
    brand.set('surface', color('#ffffff'));

    const ui = book.addScope('ui-01');

    const original = mostVivid(brand, {
      against: ref('brand-01.surface'),
      minContrast: 2,
      not: [ref('brand-01.a'), 'brand-01.b'],
    });
    ui.set('accent', original);

    const serialized = getTokenDisplayValue(ui, 'accent');
    const parsed = parseTokenInput(serialized, book, ui);

    expect(parsed).toEqual(original);
    // Guard against the regression collapsing to a single-entry array.
    expect((parsed as any).options.not).toEqual(['brand-01.a', 'brand-01.b']);
  });
});
