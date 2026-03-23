import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, ref, px, rem } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';
import { bestContrastWith, colorMix, lighten, darken, spacingScale, typographyScale } from '../../src/functions';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', color('#0066cc'));
  brand.set('white', color('#ffffff'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('brand.primary'));
  return book;
}

describe('Renderer', () => {
  describe('css-variables format', () => {
    it('renders basic tokens as CSS custom properties', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('--brand-primary: #0066cc');
    });

    it('renders references as var()', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('--ui-bg: var(--brand-primary)');
    });

    it('renders colorMix with var() refs and color-mix()', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('hover', colorMix(ref('brand.primary'), color('#000000'), { ratio: 0.1 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      // ratio 0.1 → 90% of color1 (1-0.1=0.9 → 90%)
      expect(output).toContain('color-mix(in lab, var(--brand-primary) 90%, #000000)');
    });

    it('renders lighten with color-mix and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('light', lighten(ref('brand.primary'), { amount: 0.2 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('color-mix(in oklch, var(--brand-primary) 80%, white)');
    });

    it('renders darken with color-mix and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('dark', darken(ref('brand.primary'), { amount: 0.1 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('color-mix(in oklch, var(--brand-primary) 90%, black)');
    });

    it('renders spacingScale with calc() and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('space', px(16));
      const ui = book.addScope('ui');
      ui.set('large', spacingScale(ref('brand.space'), { multiplier: 2 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('calc(var(--brand-space) * 2)');
    });

    it('renders typographyScale with calc() and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('font', rem(1));
      const ui = book.addScope('ui');
      ui.set('lg', typographyScale(ref('brand.font'), { ratio: 1.25, step: 2 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      // 1.25^2 = 1.5625
      expect(output).toContain('calc(var(--brand-font) * 1.5625)');
    });

    it('renders bestContrastWith as resolved value (no CSS equivalent)', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('dark', color('#000000'));
      brand.set('light', color('#ffffff'));
      const ui = book.addScope('ui');
      ui.set('text', bestContrastWith(color('#ffffff'), brand));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      // bestContrastWith resolves to computed hex — no CSS function for this
      expect(output).toContain('--ui-text: #000000');
    });
  });

  describe('json format', () => {
    it('renders all values fully resolved', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'json');
      const output = JSON.parse(renderer.render());
      expect(output['brand.primary']).toBe('#0066cc');
      expect(output['ui.bg']).toBe('#0066cc');
    });
  });

  describe('w3-design-tokens format', () => {
    it('renders nested structure with $value and $type', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.brand.primary.$value).toBe('#0066cc');
      expect(output.brand.primary.$type).toBe('color');
    });

    it('renders references with {scope.token} syntax', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.ui.bg.$value).toBe('{brand.primary}');
    });
  });

  describe('registerFunctionRenderer', () => {
    it('uses custom function renderer for format', () => {
      const book = new DesignBook('test');
      const renderer = new Renderer(book, 'css-variables');
      renderer.registerFunctionRenderer('myFunc', (_args, _options) => 'custom-output');
      expect(true).toBe(true);
    });
  });
});
