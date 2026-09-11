import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { relativeTo } from '../../../src/functions/color/relative-to';

describe('relativeTo', () => {
  it('rotates hue by +180 in oklch', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('complement', relativeTo(color('#0066cc'), 'oklch', [null, null, '+180']));

    const result = book.resolve('ui.complement');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#0066cc');
  });

  it('sets absolute lightness value', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('dark', relativeTo(color('#0066cc'), 'oklch', [0.3, null, null]));

    const result = book.resolve('ui.dark');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('multiplies chroma by 0.5 (desaturate)', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('muted', relativeTo(color('#0066cc'), 'oklch', [null, '*0.5', null]));

    const result = book.resolve('ui.muted');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('null preserves original channel value', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('same', relativeTo(color('#0066cc'), 'oklch', [null, null, null]));

    expect(book.resolve('ui.same')).toBe('#0066cc');
  });

  it('subtracts from a channel', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('darker', relativeTo(color('#0066cc'), 'oklch', ['-0.2', null, null]));

    const result = book.resolve('ui.darker');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#0066cc');
  });

  it('divides a channel', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('halved', relativeTo(color('#0066cc'), 'oklch', ['/2', null, null]));

    const result = book.resolve('ui.halved');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
  describe('channel table', () => {
    it('treats the first hsl channel as hue, not saturation', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      // Culori omits `h` for achromatic colours, so the channel order has
      // to come from a table, not from Object.keys(converted).
      ui.set('rotated', relativeTo(color('#808080'), 'hsl', ['+30', null, null]));

      // Rotating the hue of a grey is a no-op; the old code wrote 30 into
      // saturation and produced #ff0000.
      expect(book.resolve('ui.rotated')).toBe('#808080');
    });

    it('maps hsl channels in h, s, l order', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('red', relativeTo(color('#808080'), 'hsl', [0, 1, null]));

      expect(book.resolve('ui.red')).toBe('#ff0101');
    });

    it('maps rgb channels in r, g, b order', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('red', relativeTo(color('#000000'), 'rgb', [1, null, null]));

      expect(book.resolve('ui.red')).toBe('#ff0000');
    });

    it('maps oklch channels in l, c, h order', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('complement', relativeTo(color('#0066cc'), 'oklch', [null, null, '+180']));

      expect(book.resolve('ui.complement')).toBe('#935c00');
    });

    it('gamut-maps an out-of-sRGB oklch result instead of clipping it', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('darker', relativeTo(color('#0066cc'), 'oklch', ['-0.2', null, null]));

      // Naive clipping via formatHex gives #00278a.
      expect(book.resolve('ui.darker')).toBe('#002a82');
    });

    it('leaves an in-gamut rgb result untouched', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('shifted', relativeTo(color('#0066cc'), 'rgb', ['+0.5', null, null]));

      expect(book.resolve('ui.shifted')).toBe('#8066cc');
    });

    it('throws for an unsupported color space', () => {
      const book = new DesignBook('test');
      const ui = book.addScope('ui');
      ui.set('bad', relativeTo(color('#0066cc'), 'hwb', [null, null, null]));

      expect(() => book.resolve('ui.bad')).toThrow(/unsupported color space/i);
    });
  });
});
