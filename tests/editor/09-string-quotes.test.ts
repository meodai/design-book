import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, string } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 9: string()'s quote regexes required at least one character between
// the quotes ([^'"]+) and didn't backreference the opening quote, so an
// empty string() fell through to a fallback that kept the literal quote
// characters as the value, and a value containing an apostrophe couldn't
// match at all. A matching-quote regex (backreferenced, `*` not `+`) fixes
// both.

describe('string() quote handling', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-09');
  });

  it('round-trips an empty string()', () => {
    const scope = book.addScope('fonts-09');
    const original = string('');
    scope.set('empty', original);

    const serialized = getTokenDisplayValue(scope, 'empty');
    expect(serialized).toBe("string('')");

    const parsed = parseTokenInput(serialized, book, scope);
    expect(parsed).toEqual(original);
    expect((parsed as any).rawValue).toBe('');
  });

  it('round-trips a string() value containing an apostrophe', () => {
    const scope = book.getScope('fonts-09')!;
    const original = string("it's");
    scope.set('quoted', original);

    const serialized = getTokenDisplayValue(scope, 'quoted');
    const parsed = parseTokenInput(serialized, book, scope);
    expect(parsed).toEqual(original);
    expect((parsed as any).rawValue).toBe("it's");
  });
});
