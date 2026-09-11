import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, px, nth } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 4: `parseArg`'s bare-number pattern had no sign, so a hand-typed
// `nth(space, -1)` fell through to the string branch and the function
// parser rejected it with "nth requires a numeric index".

describe('negative nth index typed by hand', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;
  let space: any;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-10');
    space = book.addScope('space-10');
    space.set('xs', px(4));
    space.set('s', px(8));
    space.set('m', px(12));
  });

  it('parses a negative positional index', () => {
    const parsed = parseTokenInput('nth(space-10, -1)', book, space);
    expect(parsed).toEqual(nth(space, -1));
  });

  it('round-trips a negative index through the serializer', () => {
    const ui = book.addScope('ui-10');
    const original = nth(space, -2);
    ui.set('last-but-one', original);

    const serialized = getTokenDisplayValue(ui, 'last-but-one');
    expect(parseTokenInput(serialized, book, ui)).toEqual(original);
  });

  it('resolves the negative index to the last member', () => {
    const ui = book.getScope('ui-10') ?? book.addScope('ui-10');
    ui.set('last', parseTokenInput('nth(space-10, -1)', book, ui) as any);
    expect(book.resolve('ui-10.last')).toBe('12px');
  });
});
