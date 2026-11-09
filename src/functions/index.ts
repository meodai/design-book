import { bestContrastWithImpl } from './color/best-contrast';
import { minContrastWithImpl } from './color/min-contrast';
import { closestImpl } from './generic/closest';
import { furthestFromImpl } from './generic/furthest-from';
import { largestImpl, smallestImpl } from './generic/extremes';
import { colorMixImpl } from './color/color-mix';
import { lightenImpl, darkenImpl } from './color/lighten-darken';
import { mostVividImpl, leastVividImpl } from './color/vividness';
import { lightestImpl, darkestImpl } from './color/lightest-darkest';
import { relativeToImpl } from './color/relative-to';
import { shadeImpl } from './color/shade';
import { rampImpl } from './color/ramp';
import type { RampEngine } from './color/ramp';
import { spacingScaleImpl } from './non-color/spacing-scale';
import { timingImpl } from './non-color/timing';
import { typographyScaleImpl } from './non-color/typography-scale';
import { typographyImpl } from './non-color/typography';
import { randomImpl } from './generic/random';
import { nthImpl } from './generic/nth';
import { siblingImpl, scopeOfKey } from './generic/sibling';
import { excludedMembers, memberStart, oneMember } from './members';
import type { Scope } from '../scope';
import type { AnyTokenValue } from '../tokens';
import { isMemberReference, isUnresolvable } from '../tokens';
import { FunctionError } from '../errors';

export { bestContrastWith } from './color/best-contrast';
export { minContrastWith } from './color/min-contrast';
export { colorMix } from './color/color-mix';
export { lighten, darken } from './color/lighten-darken';
export { relativeTo } from './color/relative-to';
export type { Modification } from './color/relative-to';
export { closest, nextLarger, nextSmaller, nextLighter, nextDarker } from './generic/closest';
export type { ClosestOptions, NextOptions } from './generic/closest';
export { largest, smallest } from './generic/extremes';
export type { ExtremeOptions } from './generic/extremes';
export { furthestFrom } from './generic/furthest-from';
export type { FurthestFromOptions } from './generic/furthest-from';
export { mostVivid, leastVivid } from './color/vividness';
export type { VividnessOptions } from './color/vividness';
export type { LightnessRange } from './color/lightness-range';
export { lightest, darkest } from './color/lightest-darkest';
export type { LightnessSelectorOptions } from './color/lightest-darkest';
export type { ReadableOnOptions } from './color/readable';
export { shade } from './color/shade';
export { ramp, rampStops, rampSet } from './color/ramp';
export type { RampSet, RampSetSource } from './color/ramp';
export { spacingScale } from './non-color/spacing-scale';
export { typographyScale } from './non-color/typography-scale';
export { typography, variant, isTypographyToken, typographyFields, typographyFieldNames, typographyBase } from './non-color/typography';
export type { TypographyField, TypographyFields, TypographyOverrides } from './non-color/typography';
export { timing } from './non-color/timing';
export { random } from './generic/random';
export type { RandomOptions, RandomType } from './generic/random';
export { nth } from './generic/nth';
export type { NthOptions } from './generic/nth';
export { sibling } from './generic/sibling';
export { picked } from './picks';
export type { SiblingOptions } from './generic/sibling';

/** What the built-in functions need from a book. */
export interface BuiltinHost {
  registerFunction<Args extends unknown[]>(name: string, impl: (...args: Args) => string): void;
  /** `sibling` looks up the scope its anchor key lives in. */
  getScope(name: string): Scope | undefined;
  /** A typography variant reads its base's fields. */
  resolve(key: string): string;
  getTokenByKey(key: string): AnyTokenValue | undefined;
  /** `ramp` copies the masters of a ramp set the book keeps. */
  getRampEngine(name?: string): RampEngine;
}

/**
 * Registers the built-in functions on a book (the constructor does).
 *
 * One contract for every built-in: the implementation receives its resolved
 * arguments, then its options with every input resolved (`upTo`,
 * `readableOn`) and every member slot as written. A selector's `not` names
 * members of its pool, which only the book can read (`excludedMembers`):
 * the registry hands the implementation the qualified keys it names.
 */
export function registerBuiltinFunctions(book: BuiltinHost): void {
  /** A selector over `scope`: its `not` read against the pool. */
  const pooled = <O extends { not?: unknown }>(fn: string, scope: Scope, options: O | undefined) =>
    ({ ...options, not: excludedMembers(book, fn, scope, (options?.not as unknown[] | undefined) ?? []) }) as O & { not: string[] };

  // Selectors with a target: (target, pool, options).
  const targeted: Record<string, (target: string, scope: Scope, options: never) => string> = {
    bestContrastWith: bestContrastWithImpl,
    minContrastWith: minContrastWithImpl,
    closest: closestImpl,
    furthestFrom: furthestFromImpl,
  };
  for (const [fn, impl] of Object.entries(targeted)) {
    book.registerFunction(fn, (target: string, scope: Scope, options?: { not?: unknown }) =>
      impl(target, scope, pooled(fn, scope, options) as never));
  }

  // Selectors over a pool alone: (pool, options).
  const pools: Record<string, (scope: Scope, options: never) => string> = {
    mostVivid: mostVividImpl,
    leastVivid: leastVividImpl,
    lightest: lightestImpl,
    darkest: darkestImpl,
    largest: largestImpl,
    smallest: smallestImpl,
    nth: nthImpl,
    random: randomImpl,
  };
  for (const [fn, impl] of Object.entries(pools)) {
    book.registerFunction(fn, (scope: Scope, options?: { not?: unknown }) => impl(scope, pooled(fn, scope, options) as never));
  }

  // Transforms: (values…, options).
  book.registerFunction('colorMix', colorMixImpl);
  book.registerFunction('lighten', lightenImpl);
  book.registerFunction('darken', darkenImpl);
  book.registerFunction('shade', shadeImpl);
  book.registerFunction('relativeTo', relativeToImpl);
  book.registerFunction('spacingScale', spacingScaleImpl);
  book.registerFunction('typographyScale', typographyScaleImpl);
  book.registerFunction('timing', timingImpl);
  book.registerFunction('typography', (...args: unknown[]) => typographyImpl(book, ...args));
  book.registerFunction('ramp', (seed: string, options?: { shade?: string; from?: string }) => {
    if (!options?.shade) throw new FunctionError('ramp: missing required "shade" option', 'ramp');
    return rampImpl(seed, options.shade, book.getRampEngine(options.from));
  });

  // sibling: (scope?, options). The anchor and `toward` are members, read
  // against the scale the way a `not` entry is.
  book.registerFunction('sibling', (...args: unknown[]) => {
    type SiblingInputs = { from?: unknown; offset?: number; wrap?: boolean; not?: unknown[]; toward?: unknown };
    const options = (args[args.length - 1] ?? {}) as SiblingInputs;
    const pool = args.length > 1 ? (args[0] as Scope | undefined) : undefined;
    const { from, offset, toward } = options;
    if (isUnresolvable(from)) throw new FunctionError(`sibling: ${from.message}`, 'sibling');
    if (!isMemberReference(from)) throw new FunctionError('sibling: a fully-qualified `from` key is required', 'sibling');
    if (!Number.isInteger(offset)) throw new FunctionError(`sibling: offset must be an integer, got ${offset}`, 'sibling');
    // The anchor as written, a `source` followed.
    const start = memberStart(book, 'sibling', from);
    if (start === undefined || !start.includes('.')) {
      throw new FunctionError('sibling: a fully-qualified `from` key is required', 'sibling');
    }
    if (from.referredBy && !pool) {
      throw new FunctionError(`sibling: refersTo(ref('${start}')) needs the scale named: sibling(refersTo(ref('${start}')), ref('scale'), n)`, 'sibling');
    }
    // The scale: the scope argument (the anchor's references followed into
    // it), or the anchor's own scope.
    const scope = pool ?? book.getScope(scopeOfKey(start));
    if (!scope) throw new FunctionError(`sibling: unknown scope "${scopeOfKey(start)}"`, 'sibling');
    const anchor = oneMember(book, 'sibling', 'the anchor', from, scope);
    if (isUnresolvable(toward)) throw new FunctionError(`sibling: \`toward\` could not be read: ${toward.message}`, 'sibling');
    const target = toward !== undefined ? oneMember(book, 'sibling', '`toward`', toward, scope) : undefined;
    const not = excludedMembers(book, 'sibling', scope, options.not ?? []);
    return siblingImpl(scope, anchor, offset as number, options.wrap ?? false, not, target);
  });
}
