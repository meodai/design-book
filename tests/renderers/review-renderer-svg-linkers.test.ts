import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, ref } from '../../src/tokens';
import { colorMix, mostVivid, sibling } from '../../src/functions';
import { SVGRenderer } from '../../src/renderers/svg-renderer';

function edges(svg: string): string[] {
  return [...svg.matchAll(/<g class="connection" data-from="([^"]+)" data-to="([^"]+)"/g)].map((m) => `${m[1]}->${m[2]}`);
}

describe('SVGRenderer palette-linker classification', () => {
  it('keeps the graph edges of a value-deriving function that nests a selector', () => {
    const book = new DesignBook('nested');
    const brand = book.addScope('brand');
    brand.set('red', color('#ff0000'));
    brand.set('grey', color('#888888'));
    const u = book.addScope('u');
    u.set('base', color('#0066cc'));
    u.set('mix', colorMix(ref('u.base'), mostVivid(brand)));

    const svg = new SVGRenderer(book, { linksOnly: false }).render();

    expect(edges(svg)).toContain('u.mix->u.base');
  });

  it('does not draw a self-loop for a selector iterating its own scope', () => {
    const book = new DesignBook('self');
    const ui = book.addScope('ui');
    // The selector comes first in key order, so it is the first candidate
    // whose value matches its own output.
    ui.set('vivid', mostVivid(ui));
    ui.set('red', color('#ff0000'));
    ui.set('grey', color('#888888'));
    expect(ui.getAllKeys()[0]).toBe('vivid');
    const svg = new SVGRenderer(book).render();

    expect(edges(svg)).not.toContain('ui.vivid->ui.vivid');
    expect(edges(svg)).toContain('ui.red->ui.vivid');
  });

  it('links a sibling to the member it picked, not its anchor', () => {
    const book = new DesignBook('sib');
    const ramp = book.addScope('ramp');
    ramp.set('s100', color('#eeeeee'));
    ramp.set('s200', color('#aaaaaa'));
    ramp.set('s300', color('#555555'));
    const ui = book.addScope('ui');
    ui.set('next', sibling(ref('ramp.s100'), 1));
    expect(book.resolve('ui.next')).toBe('#aaaaaa');

    const svg = new SVGRenderer(book).render();

    expect(edges(svg)).toContain('ramp.s200->ui.next');
    expect(edges(svg).filter((e) => e.endsWith('->ui.next') || e.startsWith('ui.next->'))).toEqual([
      'ramp.s200->ui.next',
    ]);
  });
});
