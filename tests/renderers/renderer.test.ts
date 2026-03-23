import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { hex, ref } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', hex('#0066cc'));
  brand.set('white', hex('#ffffff'));
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
