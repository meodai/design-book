import { beforeAll, describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import {
  color, ref, px, rem, typography,
  closest, nextLarger, nextSmaller, nextLighter, nextDarker,
  largest, smallest, furthestFrom, bestContrastWith, minContrastWith,
  FunctionError,
} from '../src/index';
import { parseTokenInput } from '../editor/editor-input-parser';
import { loadEditorModule } from './editor/load-editor';

/** One pool holding every kind: colors, px sizes, rem sizes and text styles. */
function mixed() {
  const book = new DesignBook('t');
  const brand = book.addScope('brand');
  brand.set('blue', color('#2d60a5'));
  brand.set('sky', color('#8fb3ff'));
  brand.set('navy', color('#13254a'));
  brand.set('s', px(8));
  brand.set('m', px(16));
  brand.set('l', px(24));
  brand.set('xl', px(40));
  brand.set('wide', rem(3));
  const type = book.addScope('type');
  type.set('small', typography({ fontSize: rem(0.875), lineHeight: 1.4 }));
  type.set('body', typography({ fontSize: rem(1), lineHeight: 1.5 }));
  type.set('h4', typography({ fontSize: rem(1.125), fontWeight: '600' }));
  type.set('h3', typography({ fontSize: rem(1.5), fontWeight: '600' }));
  type.set('h2', typography({ fontSize: rem(2), fontWeight: '700' }));
  type.set('gap', rem(1.25));
  const ui = book.addScope('ui');
  return { book, brand, type, ui };
}

describe('closest compares only the target\'s kind', () => {
  it('sizes: nearest by value, same unit only', () => {
    const { book, ui } = mixed();
    ui.set('near', closest(px(20), ref('brand')));
    expect(book.resolve('ui.near')).toBe('16px');
    ui.set('rem', closest(rem(2.5), ref('brand')));
    expect(book.resolve('ui.rem')).toBe('3rem');
  });

  it('colors ignore the sizes in the same pool', () => {
    const { book, ui } = mixed();
    ui.set('pick', closest(color('#3366aa'), ref('brand')));
    expect(book.resolve('ui.pick')).toBe('#2d60a5');
  });

  it('the aliases are closest with a direction', () => {
    const { book, ui } = mixed();
    expect(nextLarger(ref('brand.m'), ref('brand'))).toEqual(closest(ref('brand.m'), ref('brand'), { direction: 'larger' }));
    ui.set('up', nextLarger(ref('brand.m'), ref('brand')));
    ui.set('down', nextSmaller(ref('brand.m'), ref('brand')));
    ui.set('far', nextLarger(ref('brand.m'), ref('brand'), { minDistance: 10 }));
    ui.set('lighter', nextLighter(ref('brand.blue'), ref('brand')));
    ui.set('darker', nextDarker(ref('brand.blue'), ref('brand')));
    expect(book.resolve('ui.up')).toBe('24px');
    expect(book.resolve('ui.down')).toBe('8px');
    expect(book.resolve('ui.far')).toBe('40px');
    expect(book.resolve('ui.lighter')).toBe('#8fb3ff');
    expect(book.resolve('ui.darker')).toBe('#13254a');
  });

  it('text styles: by font size, against text styles only', () => {
    const { book, ui } = mixed();
    ui.set('up', nextLarger(ref('type.body'), ref('type')));
    ui.set('down', nextSmaller(ref('type.body'), ref('type')));
    expect(book.resolve('ui.up')).toBe(book.resolve('type.h4'));
    expect(book.resolve('ui.down')).toBe(book.resolve('type.small'));
    // type.gap is a 1.25rem size, not a text style: never picked for a text style
    ui.set('near', closest(ref('type.h4'), ref('type'), { direction: 'larger' }));
    expect(book.resolve('ui.near')).toBe(book.resolve('type.h3'));
  });

  it('toward works on sizes', () => {
    const { book, ui } = mixed();
    ui.set('page', px(40));
    ui.set('step', closest(ref('brand.s'), ref('brand'), { toward: ref('ui.page') }));
    expect(book.resolve('ui.step')).toBe('16px');
    ui.set('page', px(8));
    ui.set('from', px(40));
    ui.set('back', closest(ref('ui.from'), ref('brand'), { toward: ref('ui.page') }));
    expect(book.resolve('ui.back')).toBe('24px');
  });

  it('refuses a direction or readableOn that does not fit the kind', () => {
    const { book, ui } = mixed();
    ui.set('bad', nextLighter(ref('brand.m'), ref('brand')));
    expect(() => book.resolve('ui.bad')).toThrow(/"lighter" does not apply to sizes; use 'larger' or 'smaller'/);
    ui.set('bad2', nextLarger(ref('brand.blue'), ref('brand')));
    expect(() => book.resolve('ui.bad2')).toThrow(/"larger" does not apply to colors/);
    ui.set('bad3', closest(ref('brand.m'), ref('brand'), { readableOn: ref('brand.navy') }));
    expect(() => book.resolve('ui.bad3')).toThrow(/readableOn` applies to colors/);
    expect(() => closest(ref('brand.m'), ref('brand'), { direction: 'up' as any })).toThrow(FunctionError);
  });

  it('says plainly when the pool has nothing of that kind', () => {
    const { book, ui } = mixed();
    ui.set('none', closest(ref('type.body'), ref('brand')));
    expect(() => book.resolve('ui.none')).toThrow(/scope "brand" has no text styles in rem/);
  });
});

describe('contrast across kinds', () => {
  it('minContrastWith on text styles is a type scale written as a rule', () => {
    const { book, ui } = mixed();
    // the smallest style at least 1.25× the body, going up
    ui.set('step', minContrastWith(ref('type.body'), ref('type'), { ratio: 1.25, direction: 'larger' }));
    expect(book.resolve('ui.step')).toBe(book.resolve('type.h3'));
  });

  it('bestContrastWith on sizes picks the largest ratio', () => {
    const { book, ui } = mixed();
    ui.set('far', bestContrastWith(px(16), ref('brand')));
    expect(book.resolve('ui.far')).toBe('40px');
    ui.set('down', bestContrastWith(px(16), ref('brand'), { direction: 'smaller' }));
    expect(book.resolve('ui.down')).toBe('8px');
  });

  it('colors take a direction too', () => {
    const { book, ui } = mixed();
    ui.set('dark', minContrastWith(color('#ffffff'), ref('brand'), { ratio: 4.5, direction: 'darker' }));
    expect(book.resolve('ui.dark')).toBe('#2d60a5');
  });
});

describe('largest / smallest / furthestFrom', () => {
  it('pick by value within one group', () => {
    const { book, ui } = mixed();
    ui.set('big', largest(ref('type'), { type: 'text' }));
    ui.set('tiny', smallest(ref('type'), { type: 'text' }));
    expect(book.resolve('ui.big')).toBe(book.resolve('type.h2'));
    expect(book.resolve('ui.tiny')).toBe(book.resolve('type.small'));
  });

  it('throw on a pool mixing groups, naming them', () => {
    const { book, ui } = mixed();
    ui.set('big', largest(ref('brand')));
    expect(() => book.resolve('ui.big')).toThrow(/mixes sizes in px, sizes in rem/);
    ui.set('big2', largest(ref('type')));
    expect(() => book.resolve('ui.big2')).toThrow(/mixes/);
  });

  it('furthestFrom compares sizes when asked, colors by default', () => {
    const { book, ui } = mixed();
    const sizes = book.addScope('sizes');
    sizes.set('a', px(8));
    sizes.set('b', px(10));
    sizes.set('c', px(12));
    sizes.set('d', px(48));
    ui.set('odd', furthestFrom(ref('sizes')));
    expect(book.resolve('ui.odd')).toBe('48px');
    ui.set('color', furthestFrom(ref('brand')));
    expect(['#2d60a5', '#8fb3ff', '#13254a']).toContain(book.resolve('ui.color'));
  });
});

describe('the editor prints the aliases', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  beforeAll(async () => {
    getTokenDisplayValue = (await loadEditorModule()).getTokenDisplayValue;
  });

  it('writes closest with a plain direction as its alias, and round-trips', () => {
    const { book, ui } = mixed();
    const cases: Array<[string, string]> = [
      ["closest(ref('brand.m'), ref('brand'), { direction: \"larger\" })", "nextLarger(ref('brand.m'), ref('brand'))"],
      ["nextDarker(ref('brand.blue'), ref('brand'))", "nextDarker(ref('brand.blue'), ref('brand'))"],
      ["nextLarger(ref('brand.m'), ref('brand'), { minDistance: 10 })", "nextLarger(ref('brand.m'), ref('brand'), { minDistance: 10 })"],
      ["largest(ref('type'), { type: \"text\" })", "largest(ref('type'), { type: \"text\" })"],
    ];
    for (const [typed, printed] of cases) {
      ui.set('probe', parseTokenInput(typed, book, ui));
      expect(getTokenDisplayValue(ui, 'probe')).toBe(printed);
      ui.set('again', parseTokenInput(printed, book, ui));
      expect(book.resolve('ui.again')).toBe(book.resolve('ui.probe'));
    }
  });
});
