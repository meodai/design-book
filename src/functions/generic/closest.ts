import { poolArg, valueArg, assertOptions, READABLE_OPTIONS } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, MemberReference, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { visibleDistance } from '../color/color-math';
import { readableOnOptions } from '../color/readable';
import type { ReadableOn, ReadableOnOptions } from '../color/readable';
import { DIRECTION_KIND, assertDirection, assertDirectionFits, byOption } from '../kinds';
import type { Direction } from '../kinds';
import { best, colorForm, colorPool, describeKind, lightnessOf, measureOf, measuredPool, ofKind, parseColor, colorValueOf, colorTarget } from '../pool';
import type { Measurable } from '../pool';
import type { Measure } from '../pool';
import { pick } from '../picks';
import type { Pick } from '../picks';

/** `closest`'s options as the implementation receives them. */
export interface ClosestInputs extends ReadableOn {
  /** Qualified member keys left out (the registry has read `not`). */
  not: string[];
  /** Only candidates on that side of the target: lighter / darker for
   *  colors, larger / smaller for sizes and text styles. */
  direction?: Direction;
  /** The side another value lies on, and no further than it (resolved). */
  upTo?: string;
  /** Gap a candidate must clear past the target. */
  minDistance?: number;
  /** The field text styles are measured by. */
  by?: string;
}

/** The side filter of a directional pick: a sign (+1 / -1, 0 for any side)
 *  and how far past the target a candidate may lie. */
function sideOf(sign: number, limit: number, minDistance: number | undefined) {
  const minGap = (minDistance ?? 0) + 1e-9;
  return (gap: number) => sign === 0 || (sign * gap > minGap && sign * gap <= limit);
}

/** The "no member is …" message of a directional pick that found none. */
function noneOnSide(scope: Scope, targetValue: Measurable, options: ClosestInputs, gapUnit: string): FunctionError {
  const where = options.upTo !== undefined
    ? `between ${targetValue} and ${options.upTo}`
    : `${options.direction} than ${targetValue}`;
  return new FunctionError(
    `closest: no member of scope "${scope.name}" is ${where}`
      + (options.minDistance ? ` by at least ${options.minDistance}${gapUnit}` : ''),
    'closest',
  );
}

/**
 * The member of `scope` closest to the target, among the members of the
 * target's kind: colors by OKLab distance, sizes by value (same unit), text
 * styles by font size. See `closest`.
 */
export function closestImpl(targetValue: Measurable, scope: Scope, options: ClosestInputs): Pick {
  const measure = measureOf(targetValue, options.by);
  if (measure) return closestMeasured(targetValue, measure, scope, options);
  assertDirectionFits('closest', options.direction, 'color');
  if (options.minDistance !== undefined && options.minDistance >= 1) {
    throw new FunctionError(`closest: \`minDistance\` for colors is a lightness gap between 0 and 1, got ${options.minDistance}`, 'closest');
  }
  return closestColor(targetValue, scope, options);
}

/** Sizes and text styles: by value, in the target's unit. */
function closestMeasured(targetValue: Measurable, target: Measure, scope: Scope, options: ClosestInputs): Pick {
  assertDirectionFits('closest', options.direction, target.kind);
  if (options.readableOn !== undefined) {
    throw new FunctionError(`closest: \`readableOn\` applies to colors, not ${describeKind(target.kind)}`, 'closest');
  }
  const members = ofKind(measuredPool(scope, options.not, options.by), target.kind, target.unit);
  if (members.length === 0) {
    throw new FunctionError(`closest: scope "${scope.name}" has no ${describeKind(target.kind, target.unit)} to compare with ${targetValue}`, 'closest');
  }
  let sign = options.direction === 'larger' ? 1 : options.direction === 'smaller' ? -1 : 0;
  let limit = Infinity;
  if (options.upTo !== undefined) {
    const upTo = measureOf(options.upTo, options.by);
    if (!upTo || upTo.kind !== target.kind || upTo.unit !== target.unit) {
      throw new FunctionError(`closest: \`upTo\` ${options.upTo} is not one of the ${describeKind(target.kind, target.unit)} the target is`, 'closest');
    }
    sign = Math.sign(upTo.num - target.num);
    limit = Math.abs(upTo.num - target.num) + 1e-9;
  }
  const onSide = sideOf(sign, limit, options.minDistance);
  const choice = best(members.filter((m) => onSide(m.num - target.num)), (m) => Math.abs(m.num - target.num), 'min');
  if (!choice) throw noneOnSide(scope, targetValue, options, target.unit);
  return pick(scope, choice.key);
}

/** Colors: by OKLab distance, compared in gamut-mapped sRGB as the
 *  candidates are (a wide-gamut token measured against its own hex is at
 *  distance zero). A direction keeps the members on one side of the
 *  target's OKLCH lightness, strictly past it by `minDistance`; `upTo` no
 *  further than the other color's lightness. */
function closestColor(styleOrColor: Measurable, scope: Scope, options: ClosestInputs): Pick {
  // A text style is compared by its color field `by`.
  const targetValue = colorTarget('closest', styleOrColor, options.by);
  if (!parseColor(targetValue)) {
    throw new FunctionError(`closest: cannot parse target color "${targetValue}"`, 'closest');
  }
  const target = colorForm(targetValue);
  if (!target) throw new FunctionError(`closest: cannot format target color "${targetValue}"`, 'closest');

  let sign = options.direction === 'lighter' ? 1 : options.direction === 'darker' ? -1 : 0;
  let limit = Infinity;
  if (options.upTo !== undefined) {
    const upTo = parseColor(colorTarget('closest', options.upTo, options.by));
    if (!upTo) throw new FunctionError(`closest: cannot parse \`upTo\` color "${options.upTo}"`, 'closest');
    const upToL = lightnessOf(upTo);
    sign = Math.sign(upToL - target.l);
    limit = Math.abs(upToL - target.l) + 1e-9;
  }
  const onSide = sideOf(sign, limit, options.minDistance);

  // Translucent colors are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = options.readableOn === undefined ? null : parseColor(options.readableOn) ?? null;
  const choice = best(
    colorPool('closest', scope, options).filter((c) => onSide(c.l - target.l)),
    (c) => visibleDistance(target.color, c.color, backdrop),
    'min',
  );
  if (!choice) {
    if (sign !== 0) throw noneOnSide(scope, targetValue, options, ' in OKLCH lightness');
    throw new FunctionError('closest: no valid color candidates found in scope', 'closest');
  }
  return pick(scope, choice.key);
}

export interface ClosestOptions extends ReadableOnOptions {
  /** Only consider candidates on that side of the target: 'lighter' /
   *  'darker' for colors (OKLCH lightness), 'larger' / 'smaller' for sizes
   *  and text styles. */
  direction?: Direction;
  /** Only consider candidates on this value's side of the target, and no
   *  further than it: one rule that goes lighter on a light page and darker
   *  on a dark one. */
  upTo?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** With a direction: the gap the pick must clear past the target — OKLCH
   *  lightness (0–1) for colors, the target's unit for sizes. */
  minDistance?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue | MemberReference>;
  /** The field a text style is measured by: its font size unless given
   *  (`'fontWeight'`, `'lineHeight'`, …). Sizes and colors are measured as
   *  themselves. */
  by?: string;
  description?: string;
}

/**
 * The member of `pool` closest to the target, among the members of the
 * target's kind — the pool may mix kinds, they are never compared:
 *
 * - **colors**: perceptual distance (Euclidean in OKLab); `direction:
 *   'lighter' | 'darker'` keeps the members on that side of the target's
 *   OKLCH lightness, so the pick is the nearest lighter look-alike.
 * - **sizes**: by value, same unit only; `direction: 'larger' | 'smaller'`.
 * - **text styles** (`typography()`): by their font size.
 *
 * `upTo: ref('.page')` takes the side from where another value lies and
 * stops there. `minDistance` is the gap the pick must clear. Aliases:
 * `nextLarger`, `nextSmaller`, `nextLighter`, `nextDarker`.
 */
export function closest(
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: ClosestOptions,
): FunctionTokenValue {
  assertOptions('closest', options, ['direction', 'upTo', 'minDistance', 'not', 'by', ...READABLE_OPTIONS]);
  const scope = poolArg('closest', pool);
  valueArg('closest', target);
  const { direction, upTo, minDistance } = options ?? {};
  assertDirection('closest', direction);
  if (direction !== undefined && upTo !== undefined) {
    throw new FunctionError('closest: pass `direction` or `upTo`, not both', 'closest');
  }
  if (minDistance !== undefined) {
    if (direction === undefined && upTo === undefined) {
      throw new FunctionError('closest: `minDistance` needs a `direction` or `upTo`', 'closest');
    }
    if (typeof minDistance !== 'number' || !(minDistance >= 0)) {
      throw new FunctionError(`closest: \`minDistance\` is a gap of 0 or more, got ${String(minDistance)}`, 'closest');
    }
    if (direction !== undefined && DIRECTION_KIND[direction] === 'color' && minDistance >= 1) {
      throw new FunctionError(`closest: \`minDistance\` for colors is a lightness gap between 0 and 1, got ${minDistance}`, 'closest');
    }
  }
  if (upTo !== undefined) valueArg('closest', upTo);
  return createFunctionToken('closest', [target, scope], {
    description: options?.description,
    options: {
      not: toMembers(options?.not),
      ...(direction ? { direction } : {}),
      // An input: it resolves like an argument and is a dependency.
      ...(upTo !== undefined ? { upTo } : {}),
      ...(minDistance ? { minDistance } : {}),
      ...byOption('closest', options?.by),
      ...readableOnOptions('closest', options),
    },
    // A color, a size or a text style, as the target is.
    metadata: { dependencies: [], returnType: undefined },
  });
}

/** Options of the direction aliases: `closest`'s, without the direction. */
export type NextOptions = Omit<ClosestOptions, 'direction' | 'upTo'>;
const NEXT_OPTIONS = ['minDistance', 'not', 'by', ...READABLE_OPTIONS];

/** The next larger size (or text style) in `pool`: `closest` with `direction: 'larger'`. */
export function nextLarger(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  assertOptions('nextLarger', options, NEXT_OPTIONS);
  return closest(target, pool, { ...options, direction: 'larger' });
}

/** The next smaller size (or text style) in `pool`: `closest` with `direction: 'smaller'`. */
export function nextSmaller(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  assertOptions('nextSmaller', options, NEXT_OPTIONS);
  return closest(target, pool, { ...options, direction: 'smaller' });
}

/** The nearest lighter color in `pool`: `closest` with `direction: 'lighter'`. */
export function nextLighter(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  assertOptions('nextLighter', options, NEXT_OPTIONS);
  return closest(target, pool, { ...options, direction: 'lighter' });
}

/** The nearest darker color in `pool`: `closest` with `direction: 'darker'`. */
export function nextDarker(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  assertOptions('nextDarker', options, NEXT_OPTIONS);
  return closest(target, pool, { ...options, direction: 'darker' });
}
