import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { colorMix } from '../../../src/functions/color/color-mix';

describe('colorMix', () => {
  it('mixes two colors at default 0.5 ratio', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('a', color('#000000'));
    brand.set('b', color('#ffffff'));

    const ui = book.addScope('ui');
    ui.set('mixed', colorMix(color('#000000'), color('#ffffff')));

    const result = book.resolve('ui.mixed');
    // Should be a mid-gray (not exact due to color space)
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('mixes with custom ratio', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');

    const ui = book.addScope('ui');
    ui.set('mixed', colorMix(color('#000000'), color('#ffffff'), { ratio: 0 }));

    // ratio 0 = 100% color1
    expect(book.resolve('ui.mixed')).toBe('#000000');
  });

  it('works with references', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('dark', color('#000000'));
    brand.set('light', color('#ffffff'));

    const ui = book.addScope('ui');
    ui.set('mixed', colorMix(ref('brand.dark'), ref('brand.light')));

    const result = book.resolve('ui.mixed');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
  describe('colorSpace names', () => {
    function mixIn(space: string): string {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('mixed', colorMix(color('#0066cc'), color('#ffcc00'), { colorSpace: space }));
      return book.resolve('ui.mixed');
    }

    it('accepts CSS names as aliases of the Culori mode names', () => {
      expect(mixIn('srgb')).toBe(mixIn('rgb'));
      expect(mixIn('srgb-linear')).toBe(mixIn('lrgb'));
      expect(mixIn('display-p3')).toBe(mixIn('p3'));
      expect(mixIn('xyz-d65')).toBe(mixIn('xyz65'));
      expect(mixIn('xyz-d50')).toBe(mixIn('xyz50'));
    });

    it('still accepts names that are spelled the same in both', () => {
      expect(mixIn('oklch')).toMatch(/^#[0-9a-f]{6}$/);
      expect(mixIn('lab')).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
