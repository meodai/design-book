import type { DesignBook } from '../design-book';
import { Renderer, type RenderFormat, type RendererOptions } from './renderer';
import { SVGRenderer, type SVGRenderOptions } from './svg-renderer';

/** Registers the built-in named renderers ('css-variables', 'json',
 *  'w3-design-tokens', 'svg') on the given book. Called from the
 *  DesignBook constructor; users don't need to invoke it directly. */
export function registerBuiltinRenderers(book: DesignBook): void {
  const formats: RenderFormat[] = ['css-variables', 'json', 'w3-design-tokens'];
  for (const format of formats) {
    book.registerRenderer(format, (b, options) =>
      new Renderer(b, format, options as RendererOptions | undefined).render(),
    );
  }
  book.registerRenderer('svg', (b, options) =>
    new SVGRenderer(b, options as SVGRenderOptions | undefined).render(),
  );
}
