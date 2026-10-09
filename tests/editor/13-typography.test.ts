import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, ref, rem, string, typography, variant } from '../../src/index';
import { parseTokenInput, FUNCTION_NAMES } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// typography() takes an object of fields and variant() a base plus an
// object of overrides; both are printed back in the form people type.

describe('typography in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-13');
    book.addScope('fonts-13').set('serif', string('Georgia'));
    book.addScope('type-13').set('title', typography({ fontFamily: ref('fonts-13.serif'), fontSize: rem(2) }));
  });

  it.each([
    ['typography',
      () => typography({ fontFamily: ref('fonts-13.serif'), fontSize: rem(2.5), fontWeight: '700', lineHeight: 1.15 }),
      "typography({ fontFamily: ref('fonts-13.serif'), fontSize: rem(2.5), fontWeight: '700', lineHeight: 1.15 })"],
    ['variant',
      () => variant(ref('type-13.title'), { fontWeight: '800' }),
      "variant(ref('type-13.title'), { fontWeight: '800' })"],
    ['variant dropping a field',
      () => variant(ref('type-13.title'), { letterSpacing: string('-0.02em'), fontFamily: null }),
      "variant(ref('type-13.title'), { letterSpacing: string('-0.02em'), fontFamily: null })"],
  ] as const)('serializes and re-parses (%s)', (name, make, expected) => {
    const scope = book.addScope(`ui-13-${name.replace(/\s+/g, '-')}`);
    const original = make();
    scope.set('style', original);

    const serialized = getTokenDisplayValue(scope, 'style');
    expect(serialized).toBe(expected);
    expect(parseTokenInput(serialized, book, scope)).toEqual(original);
  });

  it('reads variant of a typography written inline as a copy', () => {
    const parsed = parseTokenInput("variant(typography({ fontSize: rem(2) }), { fontWeight: '700' })", book);
    expect(parsed).toEqual(typography({ fontSize: rem(2), fontWeight: '700' }));
  });

  it('offers typography and variant in autocomplete', () => {
    expect(FUNCTION_NAMES).toEqual(expect.arrayContaining(['typography', 'variant']));
  });

  it('rejects a typography without an object of fields', () => {
    expect(() => parseTokenInput("typography(ref('fonts-13.serif'))", book)).toThrow(/object of fields/);
  });
});
