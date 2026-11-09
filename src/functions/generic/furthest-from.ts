import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { parse } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { collectScopeColors, formatColor, gamutMapSrgb, visibleDistance } from '../color/scope-colors';
import { filterReadable, readableOnParts } from '../color/readable';
import type { ReadableOnOptions } from '../color/readable';
import { describeKind, measureOf, measuredMembers } from '../kinds';
import { picked } from '../picks';

/**
 * The member of `scope` furthest from the target, among the members of the
 * target's kind: colors by OKLab distance, sizes by value (same unit), text
 * styles by font size. `maxDistance` keeps only the members no further than
 * that. See `furthestFrom`.
 */
export function furthestFromImpl(
  targetValue: string,
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  readableContrast?: number,
  maxDistance?: number,
): string {
  const limit = maxDistance === undefined ? Infinity : maxDistance + 1e-9;
  const measure = measureOf(targetValue);

  if (measure) {
    if (readableOn !== null) {
      throw new FunctionError(`furthestFrom: \`readableOn\` applies to colors, not ${describeKind(measure.kind)}`, 'furthestFrom');
    }
    const members = measuredMembers(scope, measure.kind, measure.unit, not);
    if (members.length === 0) {
      throw new FunctionError(`furthestFrom: scope "${scope.name}" has no ${describeKind(measure.kind, measure.unit)} to compare with ${targetValue}`, 'furthestFrom');
    }
    let best: { key: string; value: string } | null = null;
    let bestDistance = -1;
    for (const member of members) {
      const distance = Math.abs(member.num - measure.num);
      if (distance <= limit && distance > bestDistance) {
        bestDistance = distance;
        best = member;
      }
    }
    if (best === null) {
      throw new FunctionError(`furthestFrom: no member of scope "${scope.name}" is within ${maxDistance}${measure.unit} of ${targetValue}`, 'furthestFrom');
    }
    return picked(scope, best.key, best.value);
  }

  const targetRaw = parse(targetValue);
  if (!targetRaw) {
    throw new FunctionError(`furthestFrom: cannot parse target "${targetValue}"`, 'furthestFrom');
  }
  // Compared in gamut-mapped sRGB, as the candidates are (see `closest`).
  const target = parse(formatColor(gamutMapSrgb(targetRaw)) ?? '');
  if (!target) {
    throw new FunctionError(`furthestFrom: cannot format target color "${targetValue}"`, 'furthestFrom');
  }
  const pool = filterReadable('furthestFrom', collectScopeColors(scope, not), readableOn, readableContrast);
  if (pool.length === 0) {
    throw new FunctionError(`furthestFrom: scope "${scope.name}" has no colors to compare with ${targetValue}`, 'furthestFrom');
  }
  // Translucent colors are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = readableOn === null ? null : parse(readableOn) ?? null;
  let best: { key: string; hex: string } | null = null;
  let bestDistance = -1;
  for (const candidate of pool) {
    const distance = visibleDistance(target, candidate.parsed, backdrop);
    if (distance <= limit && distance > bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  if (best === null) {
    throw new FunctionError(`furthestFrom: no member of scope "${scope.name}" is within ${maxDistance} (OKLab) of ${targetValue}`, 'furthestFrom');
  }
  return picked(scope, best.key, best.hex);
}

export interface FurthestFromOptions extends ReadableOnOptions {
  /** Only members no further from the target than this: OKLab distance for
   *  colors (0 to about 1), the target's unit for sizes and text styles. */
  maxDistance?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

/**
 * The member of `pool` furthest from the target, among the members of the
 * target's kind — the pool may mix kinds, they are never compared:
 *
 * - **colors**: perceptual distance (Euclidean in OKLab), so the pick is the
 *   color that looks least like the target — an accent apart from a surface.
 * - **sizes**: by value, same unit only.
 * - **text styles** (`typography()`): by their font size.
 *
 * `maxDistance` caps how far the pick may be: the furthest member that is
 * still no further than that. The mirror of `closest`.
 */
export function furthestFrom(
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: FurthestFromOptions,
): FunctionTokenValue {
  const scope = poolArg('furthestFrom', pool);
  valueArg('furthestFrom', target);
  const maxDistance = options?.maxDistance;
  if (maxDistance !== undefined && (typeof maxDistance !== 'number' || !(maxDistance >= 0))) {
    throw new FunctionError(`furthestFrom: \`maxDistance\` is a distance of 0 or more, got ${String(maxDistance)}`, 'furthestFrom');
  }
  const readable = readableOnParts('furthestFrom', options);
  return createFunctionToken(
    'furthestFrom',
    [target, scope, ...readable.args],
    {
      description: options?.description,
      options: {
        not: normalizeNotKeys(options?.not),
        ...(maxDistance !== undefined ? { maxDistance } : {}),
        ...readable.options,
      },
      metadata: {
        dependencies: [...extractDependencies([target]), ...readable.dependencies],
        // A color, a size or a text style, as the target is.
        returnType: undefined,
      },
    },
  );
}
