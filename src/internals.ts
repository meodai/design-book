/**
 * `design-book/internals`: the engine's own helpers, for tools built on the
 * book (the editor, renderers, inspectors) rather than for writing tokens.
 * They follow the engine, not a stable contract.
 */
export {
  bindToken,
  needsBinding,
  hasRelativeKeys,
  isRelativeKey,
  qualifyKey,
  isScopePath,
  extractDependencies,
  functionDependencies,
  extractIteratedScopes,
  iteratedScopesOf,
  getTokenProcessors,
} from './tokens';
export type { BindingContext, TokenProcessor } from './tokens';
export { DependencyGraph } from './dependency-graph';
export { registerBuiltinFunctions } from './functions';
export type { BuiltinHost } from './functions';
