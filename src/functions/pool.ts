import { converter, parse } from 'culori';
import type { Color } from 'culori';
import type { Scope } from '../scope';
import { FunctionError } from '../errors';
import { parseDimension } from '../values';
import { resolvePool } from './scope-members';
import { contrastAgainst, formatColor, gamutMapSrgb } from './color/color-math';

/**
 * The candidate pool the selectors share, measured once.
 *
 * Every selector does the same steps: resolve the pool (the shared pool
 * rule, `resolvePool`), keep the members of the target's kind, narrow them
 * (`readableOn`, a side, a lightness band), and keep the member that scores
 * best. This module holds those steps; each selector is its own rule on top.
 *
 * Resolved values are strings, and a string's color forms never change, so
 * they are computed once per string (`colorForm`) — a 20-step scale read by
 * dozens of selectors is parsed and converted once, not once per selector
 * per change.
 */

const toOklch = converter('oklch');

/** A color as the selectors compare it. */
export interface ColorForm {
  /** sRGB hex (gamut-mapped in OKLCH, alpha kept): what a selector returns. */
  hex: string;
  /** `hex` parsed back, so every selector measures the value it returns. */
  color: Color;
  /** OKLCH lightness and chroma of `color`. */
  l: number;
  c: number;
}

/** A pool member that is a color. */
export interface ColorMember extends ColorForm {
  key: string;
}

/** Memo of `colorForm` and `parseColor`, by the string; values never
 *  change, so the only bound is size. */
const MEMO_LIMIT = 4096;
const forms = new Map<string, ColorForm | null>();
const parsed = new Map<string, Color | null>();

function remember<T>(memo: Map<string, T>, key: string, value: T): T {
  if (memo.size >= MEMO_LIMIT) memo.clear();
  memo.set(key, value);
  return value;
}

/** A color string parsed as written (no gamut mapping), or `undefined`. */
export function parseColor(value: string): Color | undefined {
  const hit = parsed.get(value);
  if (hit !== undefined) return hit ?? undefined;
  return remember(parsed, value, parse(value) ?? null) ?? undefined;
}

/** OKLCH lightness of a color: the axis the side filters compare. */
export function lightnessOf(color: Color): number {
  return toOklch(color)?.l ?? NaN;
}

/** The forms a resolved value is compared in, or `null` when it is not a color. */
export function colorForm(value: string): ColorForm | null {
  const hit = forms.get(value);
  if (hit !== undefined) return hit;
  const raw = parseColor(value);
  const hex = raw ? formatColor(gamutMapSrgb(raw)) : undefined;
  const color = hex ? parse(hex) : undefined;
  if (!hex || !color) return remember(forms, value, null);
  const oklch = toOklch(color);
  return remember(forms, value, { hex, color, l: oklch?.l ?? NaN, c: oklch?.c ?? NaN });
}

/**
 * The pool's colors: members resolved by the shared pool rule, the ones that
 * are colors in their compared forms, then — with `readableOn` — only those
 * that reach `readableContrast` on it. An empty pool passes through, so each
 * selector keeps its own empty-scope message; a pool that empties *because
 * of* the readability filter throws, so a selector never hands back a color
 * the caller asked to be readable but is not.
 */
export function colorPool(
  fn: string,
  scope: Scope,
  not: ReadonlyArray<string>,
  readableOn?: string | null,
  readableContrast: number = DEFAULT_READABLE_CONTRAST,
): ColorMember[] {
  const members: ColorMember[] = [];
  for (const { key, value } of resolvePool(scope, not)) {
    const form = colorForm(value);
    if (form) members.push({ key, ...form });
  }
  if (readableOn === undefined || readableOn === null) return members;
  const backdrop = parseColor(readableOn);
  if (!backdrop) {
    throw new FunctionError(`${fn}: cannot parse \`readableOn\` color "${readableOn}"`, fn);
  }
  const readable = members.filter((m) => contrastAgainst(backdrop, m.color) >= readableContrast);
  if (members.length > 0 && readable.length === 0) {
    throw new FunctionError(`${fn}: no candidate reaches ${readableContrast}:1 against ${readableOn}`, fn);
  }
  return readable;
}

/** WCAG ratio a `readableOn` candidate must reach unless told otherwise. */
export const DEFAULT_READABLE_CONTRAST = 4.5;

/** The member scoring highest (`max`) or lowest (`min`); a tie keeps the
 *  first, so ties go to the earlier member in scope order. Members scoring
 *  `NaN` are skipped. `undefined` for none. */
export function best<T>(items: Iterable<T>, score: (item: T) => number, prefer: 'max' | 'min'): T | undefined {
  let winner: T | undefined;
  let top = prefer === 'max' ? -Infinity : Infinity;
  for (const item of items) {
    const s = score(item);
    if (Number.isNaN(s)) continue;
    if (prefer === 'max' ? s > top : s < top) {
      top = s;
      winner = item;
    }
  }
  return winner;
}

/** What a value is, for the functions that compare values across types: a
 *  color, a size, or a text style measured by its font size. A comparison
 *  only ever looks at members of the target's kind (and, for sizes and text,
 *  the same unit); members of another kind are skipped. */
export type Kind = 'color' | 'size' | 'text';

/** A size, or a text style measured by its font size. */
export interface Measure {
  kind: 'size' | 'text';
  num: number;
  unit: string;
}

/** A pool member measured as a size or text style. */
export interface MeasuredMember extends Measure {
  key: string;
  value: string;
}

/** A resolved `typography()` value: CSS declarations (`font-size: 2rem; …`). */
const DECLARATIONS = /^[a-z-]+\s*:/i;
const FONT_SIZE = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i;

/** The size a resolved value stands for: a dimension, or a text style's font size. */
export function measureOf(value: string): Measure | null {
  const trimmed = value.trim();
  if (DECLARATIONS.test(trimmed)) {
    const fontSize = trimmed.match(FONT_SIZE)?.[1]?.trim();
    const dim = fontSize ? parseDimension(fontSize) : null;
    return dim ? { kind: 'text', ...dim } : null;
  }
  const dim = parseDimension(trimmed);
  return dim ? { kind: 'size', ...dim } : null;
}

/** The pool's sizes and text styles, measured. */
export function measuredPool(scope: Scope, not: ReadonlyArray<string>): MeasuredMember[] {
  const members: MeasuredMember[] = [];
  for (const { key, value } of resolvePool(scope, not)) {
    const measure = measureOf(value);
    if (measure) members.push({ key, value, ...measure });
  }
  return members;
}

/** The members of one kind and unit. */
export function ofKind(members: MeasuredMember[], kind: 'size' | 'text', unit: string): MeasuredMember[] {
  return members.filter((m) => m.kind === kind && m.unit === unit);
}

/** "sizes in px", "text styles in rem", "colors": for messages. */
export function describeKind(kind: Kind, unit?: string): string {
  if (kind === 'color') return 'colors';
  const noun = kind === 'size' ? 'sizes' : 'text styles';
  return unit ? `${noun} in ${unit}` : unit === '' ? `unitless ${noun}` : noun;
}
