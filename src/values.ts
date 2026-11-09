import { parse } from 'culori';

/** A single number with an optional unit: `16px`, `-0.02em`, `.5rem`,
 *  `50%`, `200ms`, `1.5`. Group 1 is the number, group 2 the unit. */
export const DIMENSION_VALUE_PATTERN = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i;

/** A dimension's number and unit (empty when unitless). */
export interface Dimension {
  num: number;
  unit: string;
}

/** The number and unit of a resolved value, or `null` when it is not a
 *  single number with an optional unit. The one rule for dimensions:
 *  everything that reads a size goes through here. */
export function parseDimension(value: string): Dimension | null {
  const match = value.trim().match(DIMENSION_VALUE_PATTERN);
  return match ? { num: parseFloat(match[1]), unit: match[2] } : null;
}

/** Best-effort type of a resolved value string, shared by Scope (ordering
 *  of references and untyped functions), the functions and the renderers.
 *  A unitless number is a `dimension` with an empty unit — the same as
 *  `dimension(1.5, '')`; anything with more than one part (`16px solid`)
 *  is a `string`. */
export function detectValueType(resolved: string): 'color' | 'dimension' | 'string' {
  if (parse(resolved)) return 'color';
  if (parseDimension(resolved)) return 'dimension';
  return 'string';
}

/** The field a text style stands for when it is compared or sorted, unless
 *  a function's `by` or an order's `field` names another. */
export const DEFAULT_MEASURE_FIELD = 'fontSize';
