import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';
import { gamutMapSrgb } from '../../src/functions/color/scope-colors';
import { parse, formatHex } from 'culori';

describe('w3 colors outside sRGB', () => {
  function w3Color(value: string) {
    const book = new DesignBook('test');
    book.addScope('brand').set('c', color(value));
    return (new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any).brand.c.$value;
  }

  it('gamut-maps display-p3 red so every srgb component is within [0, 1]', () => {
    const v = w3Color('color(display-p3 1 0 0)');
    expect(v.colorSpace).toBe('srgb');
    for (const c of v.components) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('keeps hex consistent with the gamut-mapped components', () => {
    const v = w3Color('oklch(0.7 0.4 150)');
    expect(v.hex).toBe(formatHex(gamutMapSrgb(parse('oklch(0.7 0.4 150)')!)));
    const fromComponents = formatHex({ mode: 'rgb', r: v.components[0], g: v.components[1], b: v.components[2] });
    expect(fromComponents).toBe(v.hex);
  });

  it('leaves in-gamut colors untouched', () => {
    expect(w3Color('#0066cc')).toEqual({
      colorSpace: 'srgb',
      components: [0, 0.4, 0.8],
      alpha: 1,
      hex: '#0066cc',
    });
  });
});
