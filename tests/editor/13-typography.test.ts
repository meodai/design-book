import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, ref, rem, string, typography, variant } from '../../src/index';
import { parseTokenInput, FUNCTION_NAMES } from '../../site/editor/editor-input-parser';
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
      "variant(ref('type-13.title'), { letterSpacing: '-0.02em', fontFamily: null })"],
  ] as const)('serializes and re-parses (%s)', (name, make, expected) => {
    const scope = book.addScope(`ui-13-${name.replace(/\s+/g, '-')}`);
    const original = make();
    scope.set('style', original);

    const serialized = getTokenDisplayValue(scope, 'style');
    expect(serialized).toBe(expected);
    expect(parseTokenInput(serialized, book, scope)).toEqual(original);
  });

  it('refuses a variant of a style written inline: a variant extends a group by reference', () => {
    expect(() => parseTokenInput("variant(typography({ fontSize: rem(2) }), { fontWeight: '700' })", book)).toThrow(/set its members/);
  });

  it('reads and prints a plain object as a group, nested objects nested', () => {
    const scope = book.addScope('ui-13-group');
    const written = "{ bg: color('#0055aa'), hover: { bg: color('#003366') } }";
    scope.set('button', parseTokenInput(written, book, scope));
    expect(book.resolve('ui-13-group.button.hover.bg')).toBe('#003366');
    expect(getTokenDisplayValue(scope, 'button')).toBe(written);
  });

  it('offers typography and variant in autocomplete', () => {
    expect(FUNCTION_NAMES).toEqual(expect.arrayContaining(['typography', 'variant']));
  });

  it('rejects a typography without an object of fields', () => {
    expect(() => parseTokenInput("typography(ref('fonts-13.serif'))", book)).toThrow(/object of fields/);
  });
});
