import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, ref } from '../../src/tokens';
import { darken } from '../../src/functions/color/darken';
import { SVGRenderer } from '../../src/renderers/svg-renderer';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', color('#0066cc'));
  brand.set('white', color('#ffffff'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('brand.primary'));
  return book;
}

/** Includes a function-derived token so labels for that family are exercised. */
function createBookWithFunctionEdge() {
  const book = new DesignBook('test-fn');
  const brand = book.addScope('brand');
  brand.set('primary', color('#0066cc'));
  const ui = book.addScope('ui');
  ui.set('hover', darken(ref('brand.primary'), { amount: 0.1 }));
  return book;
}

describe('SVGRenderer', () => {
  it('outputs valid SVG string', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book);
    const svg = renderer.render();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('contains circles for color tokens', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book);
    const svg = renderer.render();
    expect(svg).toContain('<circle');
  });

  it('contains text labels for tokens', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book);
    const svg = renderer.render();
    expect(svg).toContain('primary');
  });

  it('contains path elements for connections when showConnections is true', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book, { showConnections: true });
    const svg = renderer.render();
    expect(svg).toContain('<path');
  });

  it('omits connection paths when showConnections is false', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book, { showConnections: false });
    const svg = renderer.render();
    expect(svg).not.toContain('<path');
  });

  describe('interactive mode', () => {
    it('does not add interactive markers by default', () => {
      const book = createTestBook();
      const svg = new SVGRenderer(book).render();
      expect(svg).not.toContain('class="interactive"');
      expect(svg).not.toContain('data-token-key');
      expect(svg).not.toContain(':has(');
    });

    it('marks the SVG root as interactive when enabled', () => {
      const book = createTestBook();
      const svg = new SVGRenderer(book, { interactive: true }).render();
      expect(svg).toMatch(/<svg[^>]*class="interactive"/);
    });

    it('tags row hit-areas with their fully-qualified token key', () => {
      const book = createTestBook();
      const svg = new SVGRenderer(book, { interactive: true }).render();
      expect(svg).toContain('data-token-key="brand.primary"');
      expect(svg).toContain('data-token-key="ui.bg"');
      // Header rows are also hover targets so inheritance edges can be probed.
      expect(svg).toContain('data-token-key="__header__brand"');
    });

    it('wraps each connection with data-from and data-to for the hovered token', () => {
      const book = createTestBook();
      const svg = new SVGRenderer(book, { interactive: true }).render();
      expect(svg).toContain('<g class="connection"');
      expect(svg).toContain('data-from="ui.bg"');
      expect(svg).toContain('data-to="brand.primary"');
    });

    it('labels reference edges as "ref"', () => {
      const book = createTestBook();
      const svg = new SVGRenderer(book, { interactive: true }).render();
      expect(svg).toMatch(/<text class="conn-label"[^>]*>ref<\/text>/);
    });

    it('labels function edges with the function name', () => {
      const book = createBookWithFunctionEdge();
      const svg = new SVGRenderer(book, { interactive: true, linksOnly: false }).render();
      expect(svg).toMatch(/<text class="conn-label"[^>]*>darken<\/text>/);
    });

    it('emits per-key :has() rules that highlight related connections on hover', () => {
      const book = createTestBook();
      const svg = new SVGRenderer(book, { interactive: true }).render();
      expect(svg).toContain('svg.interactive:has([data-token-key="brand.primary"]:hover)');
      // Default rule dims every connection so per-key rules can restore it.
      expect(svg).toContain('svg.interactive:has([data-token-key]:hover) .connection { opacity: 0.08; }');
    });
  });
});
