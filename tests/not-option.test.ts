import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { minContrastWith } from '../src/functions/color/min-contrast';
import { closest } from '../src/functions/generic/closest';
import { furthestFrom } from '../src/functions/generic/furthest-from';
import { mostVivid, leastVivid } from '../src/functions/color/vividness';

describe('"not" option excludes keys from the candidate pool', () => {
  it('mostVivid skips excluded keys', () => {
    // values.error has the highest OKLCH chroma, but it's role-loaded
    // (semantic = error) so we want the accent picked from elsewhere.
    const book = new DesignBook('test');
    const values = book.addScope('values');
    values.set('blue',  color('#0066cc'));
    values.set('error', color('#dc3545')); // higher chroma than blue
    values.set('mute',  color('#cccccc'));

    const ui = book.addScope('ui');
    ui.set('accent',         mostVivid(ref('values')));
    ui.set('accentSkipError', mostVivid(ref('values'), { not: [ref('values.error')] }));

    expect(book.resolve('ui.accent')).toBe('#dc3545');         // error wins by chroma
    expect(book.resolve('ui.accentSkipError')).toBe('#0066cc'); // blue wins once error is excluded
  });

  it('accepts literal strings as well as refs', () => {
    const book = new DesignBook('test');
    const values = book.addScope('values');
    values.set('a', color('#dc3545'));
    values.set('b', color('#0066cc'));

    const ui = book.addScope('ui');
    ui.set('out', mostVivid(ref('values'), { not: ['values.a'] }));

    expect(book.resolve('ui.out')).toBe('#0066cc');
  });

  it('bestContrastWith skips excluded keys', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('black', color('#000000'));   // highest contrast vs white
    palette.set('darkGray', color('#404040')); // second-highest
    palette.set('light', color('#eeeeee'));

    const ui = book.addScope('ui');
    ui.set('text',         bestContrastWith(color('#ffffff'), ref('palette')));
    ui.set('textNotBlack', bestContrastWith(color('#ffffff'), ref('palette'), {
      not: [ref('palette.black')],
    }));

    expect(book.resolve('ui.text')).toBe('#000000');
    expect(book.resolve('ui.textNotBlack')).toBe('#404040');
  });

  it('minContrastWith skips excluded keys', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('justOver', color('#767676'));  // ~4.54 vs white
    palette.set('darker',   color('#5e5e5e'));  // ~6+ vs white

    const ui = book.addScope('ui');
    // Without exclusion, picks the lowest-contrast option that still
    // clears 4.5 (justOver).
    ui.set('low', minContrastWith(color('#ffffff'), ref('palette'), { minContrast: 4.5 }));
    // Excluding it forces the higher-contrast fallback.
    ui.set('lowNotJustOver', minContrastWith(color('#ffffff'), ref('palette'), {
      ratio: 4.5,
      not: [ref('palette.justOver')],
    }));

    expect(book.resolve('ui.low')).toBe('#767676');
    expect(book.resolve('ui.lowNotJustOver')).toBe('#5e5e5e');
  });

  it('closest skips excluded keys', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('exact',  color('#0066cc'));
    palette.set('near',   color('#1070d0'));
    palette.set('far',    color('#ff0000'));

    const ui = book.addScope('ui');
    ui.set('match',        closest(color('#0066cc'), ref('palette')));
    ui.set('matchNotExact', closest(color('#0066cc'), ref('palette'), {
      not: [ref('palette.exact')],
    }));

    expect(book.resolve('ui.match')).toBe('#0066cc');
    expect(book.resolve('ui.matchNotExact')).toBe('#1070d0');
  });

  it('furthestFrom skips excluded keys', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('a', color('#000000'));
    palette.set('b', color('#101010'));
    palette.set('c', color('#202020'));
    palette.set('outlier', color('#ffffff')); // by far the most distant

    const ui = book.addScope('ui');
    ui.set('out',           furthestFrom(color('#000000'), ref('palette')));
    ui.set('outNotOutlier', furthestFrom(color('#000000'), ref('palette'), { not: [ref('palette.outlier')] }));

    expect(book.resolve('ui.out')).toBe('#ffffff');
    // Without the outlier, the furthest from black is the lightest grey left.
    expect(book.resolve('ui.outNotOutlier')).toBe('#202020');
  });

  it('leastVivid skips excluded keys', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('gray',   color('#808080')); // lowest chroma (~0)
    palette.set('pastel', color('#f7c8c5')); // low chroma
    palette.set('vivid',  color('#ff0000'));

    const ui = book.addScope('ui');
    ui.set('mute',        leastVivid(ref('palette')));
    ui.set('muteNotGray', leastVivid(ref('palette'), { not: [ref('palette.gray')] }));

    expect(book.resolve('ui.mute')).toBe('#808080');         // gray wins by chroma
    expect(book.resolve('ui.muteNotGray')).toBe('#f7c8c5');  // pastel wins once gray is excluded
  });
});
