import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { converter, parse } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { collectScopeColors, formatColor, gamutMapSrgb, visibleDistance } from '../color/scope-colors';
import { filterReadable, readableOnParts } from '../color/readable';
import type { ReadableOnOptions } from '../color/readable';
import { DIRECTION_KIND, assertDirection, assertDirectionFits, describeKind, measureOf, measuredMembers } from '../kinds';
import type { Direction, Measure } from '../kinds';

const toOklch = converter('oklch');

/** Which side of the target a directional pick may come from. */
export interface ClosestDirection {
  /** Only candidates on that side of the target: lighter / darker for
   *  colors, larger / smaller for sizes and text styles. */
  direction?: Direction;
  /** The side another value lies on, and no further than its lightness. */
  upTo?: string;
  /** Gap in OKLCH lightness (0–1) a candidate must clear past the target. */
  minDistance?: number;
}

/**
 * The member of `scope` closest to the target, among the members of the
 * target's kind: colors by OKLab distance, sizes by value (same unit), text
 * styles by font size. See `closest`.
 */
export function closestImpl(
  targetValue: string,
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  readableContrast?: number,
  side: ClosestDirection = {},
): string {
  const measure = measureOf(targetValue);
  if (measure) return closestMeasured(targetValue, measure, scope, not, readableOn, side);
  assertDirectionFits('closest', side.direction, 'color');
  if (side.minDistance !== undefined && side.minDistance >= 1) {
    throw new FunctionError(`closest: \`minDistance\` for colors is a lightness gap between 0 and 1, got ${side.minDistance}`, 'closest');
  }
  return closestColorImpl(targetValue, scope, not, readableOn, readableContrast, side);
}

/** Sizes and text styles: by value, in the target's unit. */
function closestMeasured(
  targetValue: string,
  target: Measure,
  scope: Scope,
  not: string[],
  readableOn: string | null,
  side: ClosestDirection,
): string {
  assertDirectionFits('closest', side.direction, target.kind);
  if (readableOn !== null) {
    throw new FunctionError(`closest: \`readableOn\` applies to colors, not ${describeKind(target.kind)}`, 'closest');
  }
  const members = measuredMembers(scope, target.kind, target.unit, not);
  if (members.length === 0) {
    throw new FunctionError(`closest: scope "${scope.name}" has no ${describeKind(target.kind, target.unit)} to compare with ${targetValue}`, 'closest');
  }

  let sign = side.direction === 'larger' ? 1 : side.direction === 'smaller' ? -1 : 0;
  let limit = Infinity;
  if (side.upTo !== undefined) {
    const upTo = measureOf(side.upTo);
    if (!upTo || upTo.kind !== target.kind || upTo.unit !== target.unit) {
      throw new FunctionError(`closest: \`upTo\` ${side.upTo} is not one of the ${describeKind(target.kind, target.unit)} the target is`, 'closest');
    }
    sign = Math.sign(upTo.num - target.num);
    limit = Math.abs(upTo.num - target.num) + 1e-9;
  }
  const minGap = (side.minDistance ?? 0) + 1e-9;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const member of members) {
    const gap = member.num - target.num;
    if (sign !== 0 && !(sign * gap > minGap && sign * gap <= limit)) continue;
    if (Math.abs(gap) < bestDistance) {
      bestDistance = Math.abs(gap);
      best = member.value;
    }
  }
  if (best === null) {
    const where = side.upTo !== undefined
      ? `between ${targetValue} and ${side.upTo}`
      : `${side.direction} than ${targetValue}`;
    throw new FunctionError(
      `closest: no member of scope "${scope.name}" is ${where}`
        + (side.minDistance ? ` by at least ${side.minDistance}${target.unit}` : ''),
      'closest',
    );
  }
  return best;
}

function closestColorImpl(
  targetValue: string,
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  readableContrast?: number,
  side: ClosestDirection = {},
): string {
  const targetRaw = parse(targetValue);
  if (!targetRaw) {
    throw new FunctionError(`closest: cannot parse target color "${targetValue}"`, 'closest');
  }
  // Candidates are compared in their gamut-mapped sRGB hex form (that is what
  // the function returns), so map the target the same way. Otherwise a
  // wide-gamut token measured against its own hex would not be at distance zero.
  const targetParsed = parse(formatColor(gamutMapSrgb(targetRaw)) ?? '');
  if (!targetParsed) {
    throw new FunctionError(`closest: cannot format target color "${targetValue}"`, 'closest');
  }

  // A direction keeps only the candidates on one side of the target's OKLCH
  // lightness — strictly past it by minDistance — and `upTo` no further
  // than the other color's lightness.
  const lightness = (c: Parameters<typeof toOklch>[0]) => toOklch(c)?.l ?? NaN;
  const targetL = lightness(targetParsed);
  let sign = side.direction === 'lighter' ? 1 : side.direction === 'darker' ? -1 : 0;
  let limit = Infinity;
  if (side.upTo !== undefined) {
    const upToParsed = parse(side.upTo);
    if (!upToParsed) {
      throw new FunctionError(`closest: cannot parse \`upTo\` color "${side.upTo}"`, 'closest');
    }
    const upToL = lightness(upToParsed);
    sign = Math.sign(upToL - targetL);
    limit = Math.abs(upToL - targetL) + 1e-9;
  }
  const minGap = (side.minDistance ?? 0) + 1e-9;
  const onSide = (l: number) => {
    if (sign === 0) return true;
    const gap = sign * (l - targetL);
    return gap > minGap && gap <= limit;
  };

  let closestHex: string | null = null;
  let closestDistance = Infinity;

  const pool = filterReadable('closest', collectScopeColors(scope, not), readableOn, readableContrast);
  // Translucent colors are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = readableOn === null ? null : parse(readableOn) ?? null;
  for (const candidate of pool) {
    if (!onSide(lightness(candidate.parsed))) continue;
    const distance = visibleDistance(targetParsed, candidate.parsed, backdrop);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestHex = candidate.hex;
    }
  }

  if (!closestHex) {
    if (sign !== 0) {
      const where = side.upTo !== undefined
        ? `between ${targetValue} and ${side.upTo}`
        : `${side.direction} than ${targetValue}`;
      throw new FunctionError(
        `closest: no member of scope "${scope.name}" is ${where}`
          + (side.minDistance ? ` by at least ${side.minDistance} in OKLCH lightness` : ''),
        'closest',
      );
    }
    throw new FunctionError('closest: no valid color candidates found in scope', 'closest');
  }
  return closestHex;
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
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
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
  const readable = readableOnParts('closest', options);
  // `upTo` is an argument, so it resolves like one and is a dependency;
  // it sits before the optional readableOn backdrop, marked in the options.
  const upToArgs = upTo !== undefined ? [upTo] : [];
  return createFunctionToken(
    'closest',
    [target, scope, ...upToArgs, ...readable.args],
    {
      description: options?.description,
      options: {
        not: normalizeNotKeys(options?.not),
        ...(direction ? { direction } : {}),
        ...(upTo !== undefined ? { upTo: true } : {}),
        ...(minDistance ? { minDistance } : {}),
        ...readable.options,
      },
      metadata: {
        dependencies: [...extractDependencies([target, ...upToArgs]), ...readable.dependencies],
        visualDependencies: extractVisualDependencies([target, scope, ...upToArgs, ...readable.args]),
        // A color, a size or a text style, as the target is.
        returnType: undefined,
      },
    },
  );
}

/** Options of the direction aliases: `closest`'s, without the direction. */
export type NextOptions = Omit<ClosestOptions, 'direction' | 'upTo'>;

/** The next larger size (or text style) in `pool`: `closest` with `direction: 'larger'`. */
export function nextLarger(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  return closest(target, pool, { ...options, direction: 'larger' });
}

/** The next smaller size (or text style) in `pool`: `closest` with `direction: 'smaller'`. */
export function nextSmaller(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  return closest(target, pool, { ...options, direction: 'smaller' });
}

/** The nearest lighter color in `pool`: `closest` with `direction: 'lighter'`. */
export function nextLighter(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  return closest(target, pool, { ...options, direction: 'lighter' });
}

/** The nearest darker color in `pool`: `closest` with `direction: 'darker'`. */
export function nextDarker(target: TokenValue | ReferenceValue | FunctionTokenValue, pool: PoolArg, options?: NextOptions): FunctionTokenValue {
  return closest(target, pool, { ...options, direction: 'darker' });
}
