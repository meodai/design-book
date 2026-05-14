import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { shade } from '../../../src/functions/color/shade';
import { parse, converter } from 'culori';

const toOklch = converter('oklch');

function lightnessOf(hex: string): number {
  const lch = toOklch(parse(hex));
  return lch?.l ?? 0;
}

describe('shade', () => {
  it('darkens a light input', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('surface', color('#fafafa'));

    const ui = book.addScope('ui');
    ui.set('surfaceDim', shade(palette.get('surface') as any, { amount: 0.1 }));

    const result = book.resolve('ui.surfaceDim');
    expect(lightnessOf(result)).toBeLessThan(lightnessOf('#fafafa'));
  });

  it('lightens a dark input', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('surface', color('#1a1a1a'));

    const ui = book.addScope('ui');
    ui.set('surfaceDim', shade(palette.get('surface') as any, { amount: 0.1 }));

    const result = book.resolve('ui.surfaceDim');
    expect(lightnessOf(result)).toBeGreaterThan(lightnessOf('#1a1a1a'));
  });

  it('respects the amount option', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('white', color('#ffffff'));

    const ui = book.addScope('ui');
    ui.set('small', shade(palette.get('white') as any, { amount: 0.05 }));
    ui.set('big',   shade(palette.get('white') as any, { amount: 0.25 }));

    const small = lightnessOf(book.resolve('ui.small'));
    const big   = lightnessOf(book.resolve('ui.big'));

    // Bigger amount darkens further when input is light.
    expect(big).toBeLessThan(small);
  });

  it('flips direction live when the source token changes', () => {
    // Mirrors how the article wires `color.surfaceDim = shade(color.surface)`
    // — re-pointing the surface from light to dark must re-evaluate shade
    // and pull the lightness in the opposite direction.
    const book = new DesignBook('test');
    const values = book.addScope('values');
    values.set('light', color('#fafafa'));
    values.set('dark',  color('#1a1a1a'));

    const colorScope = book.addScope('color');
    // Use a ref so we can re-point it later, mimicking the article.
    colorScope.set('surface', { type: 'reference', key: 'values.light' } as any);
    colorScope.set('surfaceDim', shade(
      { type: 'reference', key: 'color.surface' } as any,
      { amount: 0.10 },
    ));

    const lightSourceL = lightnessOf(book.resolve('color.surface'));
    const lightDimL    = lightnessOf(book.resolve('color.surfaceDim'));
    expect(lightDimL).toBeLessThan(lightSourceL); // darkened

    // Re-point surface to the dark value.
    colorScope.set('surface', { type: 'reference', key: 'values.dark' } as any);

    const darkSourceL = lightnessOf(book.resolve('color.surface'));
    const darkDimL    = lightnessOf(book.resolve('color.surfaceDim'));
    expect(darkDimL).toBeGreaterThan(darkSourceL); // lightened
  });

  it('clamps near the lightness boundary', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('black', color('#000000'));

    const ui = book.addScope('ui');
    // amount well past 1 — internal lightness is clamped to [0, 1] before
    // formatting, so the result should be pure white.
    ui.set('big', shade(palette.get('black') as any, { amount: 2 }));

    expect(book.resolve('ui.big')).toBe('#ffffff');
  });
});
