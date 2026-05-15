import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, ref, px } from '../../src/tokens';
import { darken } from '../../src/functions/color/darken';
import { TableViewRenderer } from '../../src/renderers/table-view-renderer';

describe('TableViewRenderer', () => {
  it('renders one row per token across all scopes', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));
    palette.set('white', color('#ffffff'));

    const space = book.addScope('space');
    space.set('base', px(16));

    const html = new TableViewRenderer(book).render();
    expect(html).toContain('<table');
    expect(html).toContain('palette.brand');
    expect(html).toContain('palette.white');
    expect(html).toContain('space.base');
    expect(html).toContain('#0066cc');
    expect(html).toContain('16px');
  });

  it('emits a swatch span before hex values by default', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const html = new TableViewRenderer(book).render();
    expect(html).toContain('design-book-table__swatch');
    expect(html).toContain('background:#0066cc');
  });

  it('omits the swatch when inlineColorSwatches is false', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const html = new TableViewRenderer(book, { inlineColorSwatches: false }).render();
    expect(html).not.toContain('design-book-table__swatch');
    expect(html).toContain('#0066cc');
  });

  it('shows the function name and dependencies for function tokens', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const ui = book.addScope('ui');
    ui.set('hover', darken(ref('palette.brand'), { amount: 0.15 }));

    const html = new TableViewRenderer(book).render();
    expect(html).toContain('function: darken');
    // The hover row should mention its dependency.
    const hoverRow = html.split('<tr>').find((r) => r.includes('ui.hover'))!;
    expect(hoverRow).toContain('palette.brand');
  });

  it('marks inherited tokens with the source key', () => {
    const book = new DesignBook('test');
    const light = book.addScope('light');
    light.set('bg', color('#ffffff'));

    book.addScope('dark', { extends: 'light' });

    const html = new TableViewRenderer(book).render();
    const darkRow = html.split('<tr>').find((r) => r.includes('dark.bg'))!;
    expect(darkRow).toContain('inherited from');
    expect(darkRow).toContain('light.bg');
  });

  it('respects a custom className on the root table', () => {
    const book = new DesignBook('test');
    book.addScope('palette').set('brand', color('#0066cc'));

    const html = new TableViewRenderer(book, { className: 'my-tokens' }).render();
    expect(html).toContain('<table class="my-tokens">');
  });

  it('escapes HTML in token values', () => {
    const book = new DesignBook('test');
    // string-typed token with HTML-ish content
    const strings = book.addScope('strings');
    strings.set('greeting', { type: 'string', rawValue: '<b>hi</b>' } as any);

    const html = new TableViewRenderer(book).render();
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).not.toContain('<b>hi</b>');
  });
});
