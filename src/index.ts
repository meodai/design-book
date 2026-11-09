// The book and everything around it; `design-book/engine` is this without
// the renderers.
export * from './engine';

// Renderers
export { Renderer } from './renderers/renderer';
export type {
  RenderFormat,
  RendererOptions,
  FunctionRenderer,
  FunctionRendererOptions,
  ResolvedTokenMap,
  W3ColorValue,
  W3DesignTokensMap,
  W3DimensionValue,
  W3TokenEntry,
  W3TokenValue,
} from './renderers/renderer';
export { SVGRenderer } from './renderers/svg-renderer';
export { TableViewRenderer } from './renderers/table-view-renderer';
export type { TableViewRenderOptions } from './renderers/table-view-renderer';
export { registerBuiltinFunctionRenderers } from './renderers/function-renderers';
export { registerBuiltinRenderers } from './renderers/builtin';

// Importing this entry makes the built-in renderers available to every book.
import { registerBuiltinRenderers } from './renderers/builtin';
registerBuiltinRenderers();
