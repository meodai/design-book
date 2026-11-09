import type { Scope } from '../scope';
import { FunctionError } from '../errors';
import { best, describeKind, ofKind } from './pool';
import type { Measurable } from './pool';
import type { Kind, Measure, MeasuredMember } from './pool';
import { pick } from './picks';
import type { Pick } from './picks';
import { VALID_TOKEN_KEY } from '../keys';

/**
 * Direction words and the comparisons of sizes and text styles, for the
 * functions that compare values across types (`closest`, the contrast pair,
 * `furthestFrom`, `largest` / `smallest`). The pool and its measures are in
 * `./pool`.
 */

/** The direction words and the kind each one belongs to. */
export const DIRECTION_KIND = {
  lighter: 'color',
  darker: 'color',
  larger: 'size',
  smaller: 'size',
} as const;

export type Direction = keyof typeof DIRECTION_KIND;

/** Checks a direction word at construction. */
export function assertDirection(fn: string, direction: unknown): asserts direction is Direction | undefined {
  if (direction !== undefined && !(direction as string in DIRECTION_KIND)) {
    throw new FunctionError(`${fn}: \`direction\` is 'lighter' or 'darker' for colors, 'larger' or 'smaller' for sizes and text styles, got ${String(direction)}`, fn);
  }
}

/**
 * Constructor side of `by`: the field a text style is measured by
 * (`fontWeight`, `lineHeight`, …; its font size when not given). Returns the
 * option to store. Sizes and colors are measured as themselves either way.
 */
export function byOption(fn: string, by: unknown): { by?: string } {
  if (by === undefined) return {};
  if (typeof by !== 'string' || !VALID_TOKEN_KEY.test(by)) {
    throw new FunctionError(`${fn}: \`by\` names a text style's field, such as 'fontWeight', got ${JSON.stringify(by)}`, fn);
  }
  return { by };
}

/** Checks a direction against the kind of the target it applies to. */
export function assertDirectionFits(fn: string, direction: Direction | undefined, kind: Kind): void {
  if (direction === undefined) return;
  const fits = DIRECTION_KIND[direction] === 'color' ? kind === 'color' : kind !== 'color';
  if (!fits) {
    const expected = kind === 'color' ? "'lighter' or 'darker'" : "'larger' or 'smaller'";
    throw new FunctionError(`${fn}: "${direction}" does not apply to ${describeKind(kind)}; use ${expected}`, fn);
  }
}

/** True when a candidate's OKLCH lightness lies on `direction`'s side of
 *  the target's — the side filter the color comparisons share. */
export function onLightnessSide(direction: Direction | undefined, targetL: number, candidateL: number): boolean {
  if (direction === undefined) return true;
  return direction === 'lighter' ? candidateL > targetL + 1e-9 : candidateL < targetL - 1e-9;
}

/**
 * For a function without a target (`largest` / `smallest`): the one group
 * of sizes or text styles the pool holds, narrowed by `type` when given.
 * Several groups (px and rem, sizes and text styles) are ambiguous and throw.
 */
export function onlyMeasuredGroup(fn: string, scope: Scope, members: MeasuredMember[], type?: 'size' | 'text'): MeasuredMember[] {
  const groups = new Map<string, { kind: 'size' | 'text'; unit: string }>();
  for (const m of members) if (!type || m.kind === type) groups.set(`${m.kind}:${m.unit}`, { kind: m.kind, unit: m.unit });
  if (groups.size === 1) {
    const [{ kind, unit }] = groups.values();
    return ofKind(members, kind, unit);
  }
  if (groups.size === 0) {
    throw new FunctionError(`${fn}: scope "${scope.name}" has no ${type ? describeKind(type) : 'sizes or text styles'} to compare`, fn);
  }
  const found = [...groups.values()].map((g) => describeKind(g.kind, g.unit)).join(', ');
  throw new FunctionError(
    `${fn}: scope "${scope.name}" mixes ${found}; pass { type: 'size' | 'text' } or keep one unit per scope`,
    fn,
  );
}

/**
 * Contrast between sizes or text styles: the ratio of the larger to the
 * smaller value (`2rem` against `1rem` is 2). `best` picks the highest ratio,
 * `min` the lowest that reaches `minContrast`, or the highest when none does — the
 * same rules as for colors. `direction` keeps the larger or smaller members.
 */
export function measuredContrast(
  fn: string,
  targetValue: Measurable,
  target: Measure,
  scope: Scope,
  members: MeasuredMember[],
  direction: Direction | undefined,
  mode: { pick: 'best' } | { pick: 'min'; minContrast: number },
): Pick {
  assertDirectionFits(fn, direction, target.kind);
  if (!(target.num > 0)) {
    throw new FunctionError(`${fn}: a ratio needs a positive target, got ${targetValue}`, fn);
  }
  const candidates = ofKind(members, target.kind, target.unit)
    .filter((m) => m.num > 0)
    .filter((m) => direction === undefined || (direction === 'larger' ? m.num > target.num : m.num < target.num))
    .map((m) => ({ key: m.key, value: m.value, ratio: Math.max(m.num, target.num) / Math.min(m.num, target.num) }));
  if (candidates.length === 0) {
    throw new FunctionError(
      `${fn}: scope "${scope.name}" has no ${describeKind(target.kind, target.unit)}${direction ? ` ${direction} than ${targetValue}` : ''} to compare with ${targetValue}`,
      fn,
    );
  }
  if (mode.pick === 'min') {
    const meeting = best(candidates.filter((c) => c.ratio >= mode.minContrast - 1e-9), (c) => c.ratio, 'min');
    if (meeting) return pick(scope, meeting.key);
  }
  const top = best(candidates, (c) => c.ratio, 'max')!;
  return pick(scope, top.key);
}
