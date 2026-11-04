import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, px, ref } from '../../../src/tokens';
import { bestContrastWith } from '../../../src/functions/color/best-contrast';
import { minContrastWith } from '../../../src/functions/color/min-contrast';

/** A light page with a pale band on it, and a ramp from pale to deep blue. */
function twoBackgrounds() {
  const book = new DesignBook('two-backgrounds');
  const ramp = book.addScope('ramp');
  ramp.set('100', color('#d2e6fe'));
  ramp.set('300', color('#79a9e7'));
  ramp.set('500', color('#3d87f5'));
  ramp.set('700', color('#004abd'));
  ramp.set('900', color('#080f5e'));
  const ui = book.addScope('ui');
  ui.set('page', color('#ffffff'));
  ui.set('band', color('#d2e6fe'));
  return { book, ramp, ui };
}

describe('readableOn on the contrast selectors', () => {
  it('minContrastWith: a ratio on one background, readable on a second', () => {
    const { book, ui } = twoBackgrounds();
    // 3:1 on the page alone picks the mid blue…
    ui.set('border', minContrastWith(ref('ui.page'), ref('ramp'), { minContrast: 3 }));
    // …which is under 3:1 on the band; readableOn keeps only members that pass there too.
    ui.set('both', minContrastWith(ref('ui.page'), ref('ramp'), {
      minContrast: 3, readableOn: ref('ui.band'), readableContrast: 3,
    }));
    expect(book.resolve('ui.border')).toBe('#3d87f5');
    expect(book.resolve('ui.both')).toBe('#004abd');
  });

  it('bestContrastWith ranks only the members readable on the backdrop', () => {
    const { book, ui } = twoBackgrounds();
    ui.set('dark', color('#080f5e'));
    // Best contrast with the pale band is navy; readable on the navy panel too rules out the dark end.
    ui.set('pick', bestContrastWith(ref('ui.band'), ref('ramp'), { readableOn: ref('ui.dark'), readableContrast: 3 }));
    expect(book.resolve('ui.pick')).toBe('#3d87f5');
  });

  it('follows the backdrop when it changes', () => {
    const { book, ui } = twoBackgrounds();
    ui.set('both', minContrastWith(ref('ui.page'), ref('ramp'), {
      minContrast: 3, readableOn: ref('ui.band'), readableContrast: 3,
    }));
    expect(book.resolve('ui.both')).toBe('#004abd');
    ui.set('band', color('#ffffff'));
    expect(book.resolve('ui.both')).toBe('#3d87f5');
  });

  it('throws when nothing is readable on the backdrop, and for a size target', () => {
    const { book, ui } = twoBackgrounds();
    ui.set('none', bestContrastWith(ref('ui.page'), ref('ramp'), { readableOn: ref('ui.band'), readableContrast: 21 }));
    expect(() => book.resolve('ui.none')).toThrow(/no candidate reaches 21:1/);

    const space = book.addScope('space');
    space.set('s', px(8));
    ui.set('gap', px(4));
    ui.set('size', minContrastWith(ref('ui.gap'), ref('space'), { readableOn: ref('ui.band') }));
    expect(() => book.resolve('ui.size')).toThrow(/`readableOn` is for colors/);
  });

  it('keeps the two thresholds apart', () => {
    expect(() => minContrastWith(color('#ffffff'), ref('ramp'), { readableContrast: 3 })).toThrow(/needs `readableOn`/);
    const token = minContrastWith(color('#ffffff'), ref('ramp'), { minContrast: 3, readableOn: color('#000000'), readableContrast: 4.5 });
    expect(token.options).toMatchObject({ minContrast: 3, readableContrast: 4.5 });
  });
});
