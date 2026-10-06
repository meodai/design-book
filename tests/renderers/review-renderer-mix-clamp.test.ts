import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, createFunctionToken } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';

// Tokens built with createFunctionToken skip the constructors' validation,
// so the renderer must clamp the same way the JS implementations do —
// otherwise `color-mix()` gets a negative or >100% percentage.
describe('css color-mix percentages are clamped like the JS side', () => {
  function cssFor(name: string, options: Record<string, unknown>, args = [color('#ff0000'), color('#0000ff')]) {
    const book = new DesignBook('test');
    book.addScope('ui').set('x', createFunctionToken(name, args, { options }));
    return { css: new Renderer(book, 'css-variables').render(), js: book.resolve('ui.x') };
  }

  it('colorMix ratio above 1 renders as 0% of the first colour', () => {
    const { css, js } = cssFor('colorMix', { ratio: 1.2 });
    expect(css).toContain('color-mix(in lab, #ff0000 0%, #0000ff)');
    expect(js).toBe('#0000ff');
  });

  it('colorMix ratio below 0 renders as 100% of the first colour', () => {
    const { css, js } = cssFor('colorMix', { ratio: -1 });
    expect(css).toContain('color-mix(in lab, #ff0000 100%, #0000ff)');
    expect(js).toBe('#ff0000');
  });

  it('lighten amount above 1 renders as pure white', () => {
    const { css, js } = cssFor('lighten', { amount: 1.5 }, [color('#ff0000')]);
    expect(css).toContain('color-mix(in oklch, #ff0000 0%, white)');
    expect(js).toBe('#ffffff');
  });

  it('darken amount below 0 leaves the colour unchanged', () => {
    const { css, js } = cssFor('darken', { amount: -0.5 }, [color('#ff0000')]);
    expect(css).toContain('color-mix(in oklch, #ff0000 100%, black)');
    expect(js).toBe('#ff0000');
  });
});
