import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { hex, ref } from '../../src/tokens';
import { SVGRenderer } from '../../src/renderers/svg-renderer';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', hex('#0066cc'));
  brand.set('white', hex('#ffffff'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('brand.primary'));
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
});
