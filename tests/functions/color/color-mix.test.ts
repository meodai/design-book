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

describe('colorMix gamut mapping and alpha', () => {
  function mix(a: string, b: string, options?: Record<string, unknown>): string {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('mixed', colorMix(color(a), color(b), options as any));
    return book.resolve('ui.mixed');
  }

  it('gamut-maps an out-of-sRGB mix instead of clipping it', () => {
    // Clipping the channels gives #f99500 and skews the hue; the browser
    // (and a proper OKLCH gamut map) lands on #dda200.
    expect(mix('#ff0000', '#00ff00', { colorSpace: 'oklch' })).toBe('#dda200');
  });

  it('keeps a translucent input translucent, as 8-digit hex', () => {
    expect(mix('#ff000080', '#00ff00', { colorSpace: 'oklch' })).toBe('#ecae00c0');
    // Premultiplied srgb puts r and b at exactly 0.5 with alpha 0.5, which
    // is what `color-mix(in srgb, …)` returns.
    expect(mix('#ff000080', '#0000ff80', { colorSpace: 'srgb' })).toBe('#80008080');
  });

  it('premultiplies alpha the way CSS color-mix does', () => {
    // Mixing an invisible colour in must not drag the result towards it:
    // 50% of transparent red over blue is blue at half alpha, not purple.
    expect(mix('#ff000000', '#0000ff', { colorSpace: 'srgb' })).toBe('#0000ff80');
  });

  it('leaves an opaque mix opaque', () => {
    expect(mix('#000000', '#ffffff', { colorSpace: 'srgb' })).toBe('#808080');
  });

  it('does not touch a mix that is already inside sRGB', () => {
    // toGamut round-trips through OKLCH even for a displayable colour, and a
    // channel sitting exactly at 0 or 1 comes back marginally out of range,
    // so the chroma reduction kicks in and costs 1/255. The browser computes
    // #008080 here.
    expect(mix('#000000', '#00ffff', { colorSpace: 'srgb' })).toBe('#008080');
  });

  it('mixing a colour with itself is the identity', () => {
    // Unguarded gamut mapping turned this into #01bd91. (In a polar mode the
    // interpolation itself round-trips through OKLCH, so a channel pinned at
    // 0 or 1 can still land epsilon outside sRGB there — that is inherent to
    // mixing in OKLCH, not to the gamut map.)
    expect(mix('#00bd91', '#00bd91', { colorSpace: 'srgb' })).toBe('#00bd91');
  });
});
