/**
 * `design-book/engine`: the book without the built-in renderers. Everything
 * the `design-book` entry has except `Renderer`, `SVGRenderer`,
 * `TableViewRenderer` and their registration, for code that keeps a book
 * but never renders it (an embedded tool, a server computing values). A
 * book from here renders only what is registered on it (`registerRenderer`)
 * or for every book (`useRenderer`).
 */
export { DesignBook, useRenderer } from './design-book';
export type {
  BatchCompleteDetail,
  BatchFailedDetail,
  FlushResult,
  ChangeDetail,
  DesignBookEvent,
  DesignBookEventMap,
  FunctionImplementation,
  FunctionTraits,
  RendererFn,
  ScopeAddedDetail,
  ScopeRemovedDetail,
  TokenChangedDetail,
  TokenInspection,
} from './design-book';
export { Scope } from './scope';
export type { ScopeOrder, SortCriterion, SortDirection, ScopeMetadata } from './scope';
export type { ComparableEntry, TokenOrderer } from './orderers';
export type { RampSet, RampSetSource, FurthestFromOptions, LightnessRange } from './functions';

// Tokens
export {
  val,
  color,
  ref,
  inherited,
  source,
  refersTo,
  isMemberReference,
  toMember,
  px,
  rem,
  ms,
  dimension,
  string,
  createFunctionToken,
  isReferenceValue,
  isTokenValue,
  isScopeReference,
} from './tokens';
export type {
  AnyTokenValue,
  FunctionArg,
  MemberReference,
  UnresolvableValue,
  FunctionTokenValue,
  ReferenceValue,
  TokenValue,
} from './tokens';

// Errors
export { TokenError, ScopeError, CircularDependencyError, FunctionError, LayerError, NamingError } from './errors';

// Comparing books — brands, contexts, breakpoints built as variations
export { diffBooks } from './diff-books';
export type { BookDiff } from './diff-books';

// Themes — a whole-book variation as a stack of sparse layers
export { layer, composeBook, layerOf, keysFromLayer } from './layers';
export type { Layer, LayerData } from './layers';

// Naming schemes for primitive token keys
export { scaleNames, nameValues, nameBetween, namingScheme, schemes } from './naming';
export type { NamingScheme, NamingAnchor, BuiltinSchemeName, ScaleNamesOptions } from './naming';

// Functions
export {
  bestContrastWith, minContrastWith,
  colorMix, lighten, darken, shade, relativeTo, withAlpha,
  closest, furthestFrom, mostVivid, leastVivid,
  lightest, darkest,
  largest, smallest,
  ramp, rampStops, rampSet,
  spacingScale, typographyScale, timing,
  typography, variant, isTypographyToken, typographyFields, typographyFieldNames, typographyBase,
  nextLarger, nextSmaller, nextLighter, nextDarker,
  random,
  nth,
  sibling,
  pick,
} from './functions';
export type { RandomOptions, RandomType } from './functions';
export type { NthOptions, SiblingOptions } from './functions';
export type { TypographyField, TypographyFields, TypographyOverrides } from './functions';
export type { LightnessSelectorOptions, ReadableOnOptions, ClosestOptions, NextOptions, ExtremeOptions } from './functions';
