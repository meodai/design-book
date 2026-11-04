import { converter, parse } from 'culori';
import type { Color } from 'culori';
import type { Scope } from '../scope';
import { FunctionError } from '../errors';
import { resolvePool } from './scope-members';

/**
 * What a value is, for the functions that compare values across types
 * (`closest`, the contrast pair, `furthestFrom`, `largest` / `smallest`).
 * A comparison only ever looks at members of the target's kind: colors with
 * colors, sizes with sizes in the same unit, text styles with text styles
 * by their `font-size`. Members of another kind are skipped.
 */
export type Kind = 'color' | 'size' | 'text';

/** A size, or a text style measured by its font size. */
export interface Measure {
  kind: 'size' | 'text';
  num: number;
  unit: string;
}

const DIMENSION = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;
/** A resolved `typography()` value: CSS declarations (`font-size: 2rem; …`). */
const DECLARATIONS = /^[a-z-]+\s*:/i;
const FONT_SIZE = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i;

/** The size a resolved value stands for: a dimension, or a text style's font size. */
export function measureOf(value: string): Measure | null {
  const trimmed = value.trim();
  if (DECLARATIONS.test(trimmed)) {
    const fontSize = trimmed.match(FONT_SIZE)?.[1]?.trim();
    const dim = fontSize?.match(DIMENSION);
    return dim ? { kind: 'text', num: parseFloat(dim[1]), unit: dim[2] } : null;
  }
  const dim = trimmed.match(DIMENSION);
  return dim ? { kind: 'size', num: parseFloat(dim[1]), unit: dim[2] } : null;
}

/** The kind of a resolved value, or `null` when it is none of them. */
export function kindOf(value: string): Kind | null {
  const measure = measureOf(value);
  if (measure) return measure.kind;
  return parse(value) ? 'color' : null;
}

/** "sizes in px", "text styles in rem", "colors": for messages. */
export function describeKind(kind: Kind, unit?: string): string {
  if (kind === 'color') return 'colors';
  const noun = kind === 'size' ? 'sizes' : 'text styles';
  return unit ? `${noun} in ${unit}` : unit === '' ? `unitless ${noun}` : noun;
}

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

/** Checks a direction against the kind of the target it applies to. */
export function assertDirectionFits(fn: string, direction: Direction | undefined, kind: Kind): void {
  if (direction === undefined) return;
  const fits = DIRECTION_KIND[direction] === 'color' ? kind === 'color' : kind !== 'color';
  if (!fits) {
    const expected = kind === 'color' ? "'lighter' or 'darker'" : "'larger' or 'smaller'";
    throw new FunctionError(`${fn}: "${direction}" does not apply to ${describeKind(kind)}; use ${expected}`, fn);
  }
}

/** A member measured as a size or text style. */
export interface MeasuredMember {
  key: string;
  value: string;
  num: number;
}

/** The pool's members of one kind and unit, with their measure. */
export function measuredMembers(scope: Scope, kind: 'size' | 'text', unit: string, not: ReadonlyArray<string> = []): MeasuredMember[] {
  const members: MeasuredMember[] = [];
  for (const { key, value } of resolvePool(scope, not)) {
    const measure = measureOf(value);
    if (measure && measure.kind === kind && measure.unit === unit) members.push({ key, value, num: measure.num });
  }
  return members;
}

/** The size and text-style groups a pool holds, as `kind:unit` with counts. */
export function measuredGroups(scope: Scope, not: ReadonlyArray<string> = []): Map<string, { kind: 'size' | 'text'; unit: string }> {
  const groups = new Map<string, { kind: 'size' | 'text'; unit: string }>();
  for (const { value } of resolvePool(scope, not)) {
    const measure = measureOf(value);
    if (measure) groups.set(`${measure.kind}:${measure.unit}`, { kind: measure.kind, unit: measure.unit });
  }
  return groups;
}

/**
 * For a function without a target (`largest`, `furthestFrom`): the one group
 * of sizes or text styles the pool holds, narrowed by `type` when given.
 * Several groups (px and rem, sizes and text styles) are ambiguous and throw.
 */
export function onlyMeasuredGroup(fn: string, scope: Scope, not: ReadonlyArray<string>, type?: 'size' | 'text'): { kind: 'size' | 'text'; unit: string } {
  const groups = [...measuredGroups(scope, not).values()].filter((g) => !type || g.kind === type);
  if (groups.length === 1) return groups[0];
  if (groups.length === 0) {
    throw new FunctionError(`${fn}: scope "${scope.name}" has no ${type ? describeKind(type) : 'sizes or text styles'} to compare`, fn);
  }
  const found = groups.map((g) => describeKind(g.kind, g.unit)).join(', ');
  throw new FunctionError(
    `${fn}: scope "${scope.name}" mixes ${found}; pass { type: 'size' | 'text' } or keep one unit per scope`,
    fn,
  );
}

const toOklch = converter('oklch');

/** True when `candidate` lies on `direction`'s side of `target` in OKLCH
 *  lightness — the side filter the color comparisons share. */
export function onLightnessSide(direction: Direction | undefined, target: Color, candidate: Color): boolean {
  if (direction === undefined) return true;
  const t = toOklch(target)?.l ?? NaN;
  const c = toOklch(candidate)?.l ?? NaN;
  return direction === 'lighter' ? c > t + 1e-9 : c < t - 1e-9;
}

/**
 * Contrast between sizes or text styles: the ratio of the larger to the
 * smaller value (`2rem` against `1rem` is 2). `best` picks the highest ratio,
 * `min` the lowest that reaches `minContrast`, or the highest when none does — the
 * same rules as for colors. `direction` keeps the larger or smaller members.
 */
export function measuredContrast(
  fn: string,
  targetValue: string,
  target: Measure,
  scope: Scope,
  not: ReadonlyArray<string>,
  direction: Direction | undefined,
  mode: { pick: 'best' } | { pick: 'min'; minContrast: number },
): string {
  assertDirectionFits(fn, direction, target.kind);
  if (!(target.num > 0)) {
    throw new FunctionError(`${fn}: a ratio needs a positive target, got ${targetValue}`, fn);
  }
  const candidates = measuredMembers(scope, target.kind, target.unit, not)
    .filter((m) => m.num > 0)
    .filter((m) => direction === undefined || (direction === 'larger' ? m.num > target.num : m.num < target.num))
    .map((m) => ({ value: m.value, ratio: Math.max(m.num, target.num) / Math.min(m.num, target.num) }));
  if (candidates.length === 0) {
    throw new FunctionError(
      `${fn}: scope "${scope.name}" has no ${describeKind(target.kind, target.unit)}${direction ? ` ${direction} than ${targetValue}` : ''} to compare with ${targetValue}`,
      fn,
    );
  }
  if (mode.pick === 'min') {
    const meeting = candidates.filter((c) => c.ratio >= mode.minContrast - 1e-9);
    if (meeting.length > 0) return meeting.reduce((a, b) => (b.ratio < a.ratio ? b : a)).value;
  }
  return candidates.reduce((a, b) => (b.ratio > a.ratio ? b : a)).value;
}
