/** Contrast between two colors, by the method the book is set to: WCAG 2
 *  luminance ratios (1 to 21) or APCA lightness contrast (Lc, 0 to about
 *  106). A threshold is a number in the method's own scale, or a text style
 *  (a group with `fontSize` / `fontWeight`, or `{ fontSize, fontWeight }`)
 *  that the method turns into its minimum for text of that size and weight. */
import { converter, wcagContrast } from 'culori';
import type { Color } from 'culori';
import { FunctionError } from '../../errors';
import type { Scope } from '../../scope';
import { isFunctionTokenValue, isReferenceValue, isTokenValue } from '../../tokens';
import { compositeOver, gamutMapSrgb } from './color-math';

export type ContrastMethod = 'wcag' | 'apca';
export const CONTRAST_METHODS: readonly ContrastMethod[] = ['wcag', 'apca'];

/** A text size and weight, as a threshold. */
export interface TextSpec {
  /** `16px`, `1rem`, `12pt`, or a number of px. */
  fontSize: string | number;
  /** `400`, `700`, `'bold'`, … Default 400. */
  fontWeight?: string | number;
}

/** What a threshold option may be written as: a number in the book's scale,
 *  a text style (a reference to one, or `{ fontSize, fontWeight }`), or a
 *  reference to a number. */
export type ContrastThreshold = number | TextSpec | object;

/** The threshold when none is given: AA body text in WCAG, Lc 60 in APCA
 *  (the usual counterpart of 4.5:1). */
export const DEFAULT_CONTRAST: Record<ContrastMethod, number> = { wcag: 4.5, apca: 60 };

export function assertContrastMethod(where: string, method: unknown): ContrastMethod {
  if (method === undefined) return 'wcag';
  if (!CONTRAST_METHODS.includes(method as ContrastMethod)) {
    throw new FunctionError(`${where}: \`contrast\` must be 'wcag' or 'apca', got ${JSON.stringify(method)}`, where);
  }
  return method as ContrastMethod;
}

const toRgb = converter('rgb');
const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** APCA 0.0.98G screen luminance: sRGB with a plain 2.4 exponent. */
function apcaY(color: Color): number {
  const { r, g, b } = toRgb(gamutMapSrgb(color));
  const lin = (v: number) => clamp01(v) ** 2.4;
  return lin(r) * 0.2126729 + lin(g) * 0.7151522 + lin(b) * 0.072175;
}

/**
 * APCA lightness contrast (0.0.98G) of `text` on `background`: positive for
 * dark text on a light background, negative for light on dark. Not
 * symmetric — swapping the two changes the score.
 */
export function apcaContrast(text: Color, background: Color): number {
  const clampBlack = (y: number) => (y >= 0.022 ? y : y + (0.022 - y) ** 1.414);
  const txt = clampBlack(apcaY(text));
  const bg = clampBlack(apcaY(background));
  if (Math.abs(bg - txt) < 0.0005) return 0;
  const c = bg > txt
    ? (bg ** 0.56 - txt ** 0.57) * 1.14
    : (bg ** 0.65 - txt ** 0.62) * 1.14;
  if (Math.abs(c) < 0.1) return 0;
  return (c > 0 ? c - 0.027 : c + 0.027) * 100;
}

/** Which side of a contrast the fixed color (a target, a backdrop) is. */
export type ContrastRole = 'background' | 'text';
export const CONTRAST_ROLES: readonly ContrastRole[] = ['background', 'text'];

/**
 * Contrast between a fixed color and a candidate, in the method's scale:
 * the WCAG ratio, or APCA's |Lc|. APCA is asymmetric, so `fixedIs` says
 * which is which: `'background'` (default) reads the candidate as text on
 * it, `'text'` reads the fixed color as text on the candidate. WCAG gives
 * the same either way. A translucent candidate is composited over the fixed
 * color first — a 5% black hairline is not opaque black.
 */
export function contrastOn(method: ContrastMethod, fixed: Color, candidate: Color, fixedIs: ContrastRole = 'background'): number {
  const seen = compositeOver(candidate, fixed);
  if (method === 'wcag') return wcagContrast(fixed, seen);
  return Math.abs(fixedIs === 'text' ? apcaContrast(fixed, seen) : apcaContrast(seen, fixed));
}

/** Constructor side: `targetIs` checked. */
export function targetIsOption(fn: string, value: unknown): { targetIs?: ContrastRole } {
  if (value === undefined) return {};
  if (!CONTRAST_ROLES.includes(value as ContrastRole)) {
    throw new FunctionError(`${fn}: \`targetIs\` must be 'background' or 'text', got ${JSON.stringify(value)}`, fn);
  }
  return value === 'background' ? {} : { targetIs: value as ContrastRole };
}

/** A threshold as it reads in messages: `4.5:1`, `Lc 60`. */
export function formatContrast(method: ContrastMethod, value: number): string {
  return method === 'apca' ? `Lc ${round(value)}` : `${round(value)}:1`;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Constructor side: a threshold option checked and kept as written — a
 * positive number, a reference / token (resolved like an argument: a text
 * style or a number), or `{ fontSize, fontWeight? }`. Its meaning waits for
 * the book's method, so no default is stored.
 */
export function contrastOption(fn: string, name: string, value: unknown): ContrastThreshold | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') {
    if (!(value > 0)) throw new FunctionError(`${fn}: \`${name}\` must be a positive number, got ${value}`, fn);
    return value;
  }
  if (isReferenceValue(value) || isTokenValue(value) || isFunctionTokenValue(value)) return value;
  if (isTextSpec(value)) {
    fontSizePx(fn, name, value.fontSize);
    fontWeightOf(fn, name, value.fontWeight);
    return { fontSize: value.fontSize, ...(value.fontWeight !== undefined ? { fontWeight: value.fontWeight } : {}) };
  }
  throw new FunctionError(
    `${fn}: \`${name}\` must be a number, a text style (ref('type.body')) or { fontSize, fontWeight }, got ${JSON.stringify(value)}`,
    fn,
  );
}

function isTextSpec(value: unknown): value is TextSpec {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'fontSize' in value
    && Object.keys(value).every((k) => k === 'fontSize' || k === 'fontWeight');
}

function isGroup(value: unknown): value is Scope {
  return typeof value === 'object' && value !== null && 'getAllKeys' in value && 'resolve' in value;
}

/**
 * Resolve side: the threshold as a number in the method's scale. A number
 * (or a reference to one) is taken as is — refused when it cannot be meant
 * for this method (a ratio above 21, an Lc below 15, which usually means the
 * other method's number). A text style gives the method's minimum for its
 * size and weight.
 */
export function contrastThreshold(fn: string, name: string, value: unknown, method: ContrastMethod): number {
  if (value === undefined || value === null) return DEFAULT_CONTRAST[method];
  let spec: TextSpec | undefined;
  if (isGroup(value)) spec = textSpecOf(fn, name, value);
  else if (isTextSpec(value)) spec = value;
  if (spec) {
    const px = fontSizePx(fn, name, spec.fontSize);
    const weight = fontWeightOf(fn, name, spec.fontWeight);
    return method === 'apca' ? apcaMinimumLc(px, weight) : wcagMinimumRatio(px, weight);
  }
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!(n > 0)) throw new FunctionError(`${fn}: \`${name}\` must be a positive number or a text style, got ${String(value)}`, fn);
  if (method === 'wcag' && n > 21) {
    throw new FunctionError(`${fn}: \`${name}\` ${n} is above 21, the highest WCAG ratio; this book measures WCAG (an APCA Lc needs { contrast: 'apca' } on the book)`, fn);
  }
  if (method === 'apca' && n < 15) {
    throw new FunctionError(`${fn}: \`${name}\` Lc ${n} is below 15, APCA's floor for anything visible; this book measures APCA Lc (60 for content text), not a WCAG ratio`, fn);
  }
  return n;
}

function textSpecOf(fn: string, name: string, group: Scope): TextSpec {
  const read = (member: string) => {
    if (!group.has(member)) return undefined;
    return group.resolve(member);
  };
  const fontSize = read('fontSize');
  if (fontSize === undefined) {
    throw new FunctionError(`${fn}: \`${name}\` is a group without a fontSize; a threshold needs a text style or a number`, fn);
  }
  return { fontSize, fontWeight: read('fontWeight') };
}

const WEIGHT_WORDS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 700 };

function fontWeightOf(fn: string, name: string, weight: string | number | undefined): number {
  if (weight === undefined) return 400;
  const n = typeof weight === 'number' ? weight : WEIGHT_WORDS[weight.trim()] ?? Number(weight);
  if (!(n >= 1 && n <= 1000)) throw new FunctionError(`${fn}: \`${name}\` has a font weight "${weight}" that is no number from 1 to 1000`, fn);
  return n;
}

/** A font size in CSS px: px or a bare number as is, `rem` at 16px, `pt` at 4/3. */
function fontSizePx(fn: string, name: string, size: string | number): number {
  if (typeof size === 'number') {
    if (size > 0) return size;
  } else {
    const m = /^(-?\d*\.?\d+)\s*(px|rem|pt)?$/.exec(size.trim());
    if (m && Number(m[1]) > 0) {
      const n = Number(m[1]);
      return m[2] === 'rem' ? n * 16 : m[2] === 'pt' ? (n * 4) / 3 : n;
    }
  }
  throw new FunctionError(`${fn}: \`${name}\` needs a font size in px, rem or pt to set a contrast for, got "${size}"`, fn);
}

/** WCAG 2: 3:1 for large text (18pt, or 14pt bold), 4.5:1 otherwise. */
export function wcagMinimumRatio(px: number, weight: number): number {
  const large = px >= 24 || (px >= 18.66 && weight >= 700);
  return large ? 3 : 4.5;
}

/**
 * APCA's minimum Lc for text of a size and weight, by the simple (Bronze)
 * levels: Lc 45 from 36px (24px bold), Lc 60 from 24px (16px bold), Lc 75
 * from 18px (14px bold), Lc 90 below. Bold is 700 and up.
 */
export function apcaMinimumLc(px: number, weight: number): number {
  const bold = weight >= 700;
  const tiers: Array<[lc: number, normal: number, bold: number]> = [[45, 36, 24], [60, 24, 16], [75, 18, 14]];
  for (const [lc, normal, boldPx] of tiers) {
    if (px >= (bold ? boldPx : normal)) return lc;
  }
  return 90;
}
