import { beforeAll, describe, expect, it } from 'vitest';
import {
  DesignBook, color, ref,
  closestColor, furthestFrom, mostVivid, leastVivid,
} from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// `readableOn` is stored as a trailing positional argument, so the
// serializer writes `mostVivid(pool, ref('ui.bg'), { minContrast: 4.5 })`.
// The parser must accept that form as well as the hand-written
// `{ readableOn: ref('ui.bg') }` one.

describe('readableOn in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;
  let pool: any;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-10');
    pool = book.addScope('pool-10');
    pool.set('yellow', color('#ffff00'));
    pool.set('navy', color('#1d4eb8'));
    pool.set('gray', color('#767676'));
    const bg = book.addScope('bg-10');
    bg.set('white', color('#ffffff'));
  });

  const cases: Array<[string, () => any]> = [
    ['mostVivid',    () => mostVivid(pool, { readableOn: ref('bg-10.white'), minContrast: 5, not: ['pool-10.gray'] })],
    ['leastVivid',   () => leastVivid(pool, { readableOn: ref('bg-10.white') })],
    ['closestColor', () => closestColor(color('#ffff66'), pool, { readableOn: ref('bg-10.white') })],
    ['furthestFrom', () => furthestFrom(pool, { readableOn: ref('bg-10.white') })],
  ];

  it.each(cases)('round-trips %s with readableOn', (name, make) => {
    const ui = book.addScope(`ui-10-${name}`);
    const original = make();
    ui.set('pick', original);

    const serialized = getTokenDisplayValue(ui, 'pick');
    expect(serialized).toContain("ref('bg-10.white')");
    expect(parseTokenInput(serialized, book, ui)).toEqual(original);
  });

  it('accepts readableOn written inside the options object', () => {
    const ui = book.addScope('ui-10-typed');
    const parsed = parseTokenInput(
      "mostVivid(pool-10, { readableOn: ref('bg-10.white'), minContrast: 5, not: [ref('pool-10.gray')] })",
      book, ui,
    );
    expect(parsed).toEqual(
      mostVivid(pool, { readableOn: ref('bg-10.white'), minContrast: 5, not: ['pool-10.gray'] }),
    );
  });

  it('points the old `against` option at its new name', () => {
    const ui = book.addScope('ui-10-against');
    expect(() => parseTokenInput("mostVivid(pool-10, { against: ref('bg-10.white') })", book, ui))
      .toThrow(/readableOn/);
  });
});
