import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, MemberReference, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { visibleDistance } from '../color/color-math';
import { readableOnOptions } from '../color/readable';
import type { ReadableOn, ReadableOnOptions } from '../color/readable';
import { best, colorForm, colorPool, describeKind, measureOf, measuredPool, ofKind, parseColor } from '../pool';
import { picked } from '../picks';

/** `furthestFrom`'s options as the implementation receives them. */
export interface FurthestFromInputs extends ReadableOn {
  /** Qualified member keys left out (the registry has read `not`). */
  not: string[];
  maxDistance?: number;
}

/**
 * The member of `scope` furthest from the target, among the members of the
 * target's kind: colors by OKLab distance, sizes by value (same unit), text
 * styles by font size. `maxDistance` keeps only the members no further than
 * that. See `furthestFrom`.
 */
export function furthestFromImpl(targetValue: string, scope: Scope, options: FurthestFromInputs): string {
  const fn = 'furthestFrom';
  const { not, readableOn, readableContrast, maxDistance } = options;
  const limit = maxDistance === undefined ? Infinity : maxDistance + 1e-9;
  const measure = measureOf(targetValue);

  if (measure) {
    if (readableOn !== undefined) {
      throw new FunctionError(`${fn}: \`readableOn\` applies to colors, not ${describeKind(measure.kind)}`, fn);
    }
    const members = ofKind(measuredPool(scope, not), measure.kind, measure.unit);
    if (members.length === 0) {
      throw new FunctionError(`${fn}: scope "${scope.name}" has no ${describeKind(measure.kind, measure.unit)} to compare with ${targetValue}`, fn);
    }
    const pick = best(
      members.filter((m) => Math.abs(m.num - measure.num) <= limit),
      (m) => Math.abs(m.num - measure.num),
      'max',
    );
    if (!pick) {
      throw new FunctionError(`${fn}: no member of scope "${scope.name}" is within ${maxDistance}${measure.unit} of ${targetValue}`, fn);
    }
    return picked(scope, pick.key, pick.value);
  }

  if (!parseColor(targetValue)) throw new FunctionError(`${fn}: cannot parse target "${targetValue}"`, fn);
  // Compared in gamut-mapped sRGB, as the candidates are (see `closest`).
  const target = colorForm(targetValue);
  if (!target) throw new FunctionError(`${fn}: cannot format target color "${targetValue}"`, fn);
  const pool = colorPool(fn, scope, not, readableOn, readableContrast);
  if (pool.length === 0) {
    throw new FunctionError(`${fn}: scope "${scope.name}" has no colors to compare with ${targetValue}`, fn);
  }
  // Translucent colors are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = readableOn === undefined ? null : parseColor(readableOn) ?? null;
  const distance = (c: (typeof pool)[number]) => visibleDistance(target.color, c.color, backdrop);
  const pick = best(pool.filter((c) => distance(c) <= limit), distance, 'max');
  if (!pick) {
    throw new FunctionError(`${fn}: no member of scope "${scope.name}" is within ${maxDistance} (OKLab) of ${targetValue}`, fn);
  }
  return picked(scope, pick.key, pick.hex);
}

export interface FurthestFromOptions extends ReadableOnOptions {
  /** Only members no further from the target than this: OKLab distance for
   *  colors (0 to about 1), the target's unit for sizes and text styles. */
  maxDistance?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue | MemberReference>;
  description?: string;
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
  const fn = 'furthestFrom';
  const scope = poolArg(fn, pool);
  valueArg(fn, target);
  const maxDistance = options?.maxDistance;
  if (maxDistance !== undefined && (typeof maxDistance !== 'number' || !(maxDistance >= 0))) {
    throw new FunctionError(`${fn}: \`maxDistance\` is a distance of 0 or more, got ${String(maxDistance)}`, fn);
  }
  return createFunctionToken(fn, [target, scope], {
    description: options?.description,
    options: {
      not: toMembers(options?.not),
      ...(maxDistance !== undefined ? { maxDistance } : {}),
      ...readableOnOptions(fn, options),
    },
    // A color, a size or a text style, as the target is.
    metadata: { dependencies: [], returnType: undefined },
  });
}
