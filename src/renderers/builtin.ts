import { useRenderer } from '../design-book';
import { Renderer, type RenderFormat, type RendererOptions } from './renderer';
import { SVGRenderer, type SVGRenderOptions } from './svg-renderer';

/** Makes the built-in renderers ('css-variables', 'json',
 *  'w3-design-tokens', 'svg') available to every book. The `design-book`
 *  entry calls it when it is imported; with `design-book/engine`, call it
 *  (or `useRenderer` for the ones you need) yourself. */
export function registerBuiltinRenderers(): void {
  const formats: RenderFormat[] = ['css-variables', 'json', 'w3-design-tokens'];
  for (const format of formats) {
    useRenderer(format, (b, options) => new Renderer(b, format, options as RendererOptions | undefined).render());
  }
  useRenderer('svg', (b, options) => new SVGRenderer(b, options as SVGRenderOptions | undefined).render());
}
