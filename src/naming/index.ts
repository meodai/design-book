/**
 * Naming schemes for primitive token keys.
 *
 * Pure helpers: given how many values you have, return keys for them from a
 * convention (`50 … 950`, t-shirt sizes, an intensity ladder, …). They never
 * create, store or transform token values and never touch a DesignBook —
 * name your array, then `scope.set(name, value)` in your own loop.
 *
 * Every scheme has an anchor, which decides which names a count receives:
 * - start — names grow from the first one (ordinals, Greek letters);
 * - base  — names grow outward from a base in the middle (`m`, `mid`);
 * - range — fixed end names, values spread evenly between them (`50`–`950`).
 */
import { TokenError } from '../errors';
import { assertValidTokenKey } from '../scope';

export type NamingAnchor = 'start' | 'base' | 'range';

/** A naming scheme. Built-ins live in `schemes`; make your own with
 *  `namingScheme()`. The internals are not part of the public API. */
export interface NamingScheme {
  readonly name: string;
  readonly anchor: NamingAnchor;
}

export type BuiltinSchemeName =
  | 'ordinal' | 'roman' | 'greek' | 'paper' | 'creatures'
  | 'tshirt' | 'intensity' | 'dynamics' | 'weights'
  | 'hundreds' | 'tones';

export interface ScaleNamesOptions {
  /** Base-anchored schemes: index of the value that gets the base name. */
  base?: number;
  prefix?: string;
  suffix?: string;
  /** `ordinal` only: first number (default: the step, so 1 or 10, 20 …). */
  start?: number;
  /** `ordinal` only: distance between numbers (default 1). */
  step?: number;
  /** `roman` only (default 'lower'). */
  case?: 'lower' | 'upper';
}

// ── Internal scheme shapes ─────────────────────────────────────────────

type OptionName = 'start' | 'step' | 'case';

interface StartList extends NamingScheme { anchor: 'start'; kind: 'list'; names: readonly string[] }
interface BaseList extends NamingScheme { anchor: 'base'; kind: 'list'; names: readonly string[]; baseIndex: number }
interface Ordinal extends NamingScheme { anchor: 'start'; kind: 'ordinal' }
interface Roman extends NamingScheme { anchor: 'start'; kind: 'roman' }
interface Tshirt extends NamingScheme { anchor: 'base'; kind: 'tshirt' }
interface Range extends NamingScheme { anchor: 'range'; kind: 'range'; tiers: readonly (readonly number[])[]; min: number; max: number }
type AnyScheme = StartList | BaseList | Ordinal | Roman | Tshirt | Range;

const OPTIONS_OF: Record<AnyScheme['kind'], readonly OptionName[]> = {
  list: [], ordinal: ['start', 'step'], roman: ['case'], tshirt: [], range: [],
};

function fail(message: string): never {
  throw new TokenError(message);
}

function checkKeys(names: readonly string[], what: string): void {
  for (const n of names) {
    try { assertValidTokenKey(what, n); }
    catch { fail(`${what}: "${n}" is not a valid token key (letters, digits, "-" and "_" only)`); }
  }
}

// ── Built-in schemes ───────────────────────────────────────────────────

function list(name: string, names: string[]): StartList {
  return { name, anchor: 'start', kind: 'list', names: Object.freeze(names) };
}
function baseList(name: string, names: string[], base: string): BaseList {
  return { name, anchor: 'base', kind: 'list', names: Object.freeze(names), baseIndex: names.indexOf(base) };
}
const steps = (from: number, to: number, by: number) =>
  Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => from + i * by);

export const schemes: Readonly<Record<BuiltinSchemeName, NamingScheme>> = Object.freeze({
  ordinal: { name: 'ordinal', anchor: 'start', kind: 'ordinal' } as Ordinal,
  roman: { name: 'roman', anchor: 'start', kind: 'roman' } as Roman,
  greek: list('greek', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega']),
  paper: list('paper', ['a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1', 'a0']),
  creatures: list('creatures', ['flea', 'ant', 'bee', 'mouse', 'rabbit', 'cat', 'fox', 'dog', 'wolf',
    'deer', 'horse', 'elephant', 'whale']),
  tshirt: { name: 'tshirt', anchor: 'base', kind: 'tshirt' } as Tshirt,
  intensity: baseList('intensity',
    ['hint', 'faint', 'subtle', 'soft', 'mid', 'firm', 'bold', 'strong', 'intense'], 'mid'),
  dynamics: baseList('dynamics', ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'], 'mf'),
  weights: baseList('weights',
    ['thin', 'extralight', 'light', 'regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'], 'regular'),
  hundreds: {
    name: 'hundreds', anchor: 'range', kind: 'range', min: 50, max: 950,
    tiers: [[50, ...steps(100, 900, 100), 950], steps(50, 950, 50), steps(50, 950, 25)],
  } as Range,
  tones: {
    name: 'tones', anchor: 'range', kind: 'range', min: 0, max: 100,
    tiers: [steps(0, 100, 10), steps(0, 100, 5)],
  } as Range,
});

/** Define a scheme from a list of names, smallest first. With `base` it is
 *  base-anchored on that name; otherwise start-anchored. */
export function namingScheme(names: readonly string[], options: { base?: string } = {}): NamingScheme {
  if (!Array.isArray(names) || names.length === 0) fail('namingScheme: needs at least one name');
  if (new Set(names).size !== names.length) {
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    fail(`namingScheme: duplicate name "${dup}"`);
  }
  checkKeys(names, 'namingScheme');
  if (options.base === undefined) return list('custom', [...names]);
  if (!names.includes(options.base)) fail(`namingScheme: base "${options.base}" is not in the list`);
  return baseList('custom', [...names], options.base);
}

function resolveScheme(scheme: BuiltinSchemeName | NamingScheme): AnyScheme {
  if (typeof scheme === 'string') {
    const s = (schemes as Record<string, NamingScheme>)[scheme];
    if (!s) fail(`Unknown naming scheme "${scheme}" (built-ins: ${Object.keys(schemes).join(', ')})`);
    return s as AnyScheme;
  }
  if (!scheme || !('kind' in scheme)) fail('Not a naming scheme — use a built-in name or namingScheme()');
  return scheme as AnyScheme;
}

// ── Generators ─────────────────────────────────────────────────────────

const ROMAN: [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];
function toRoman(n: number): string {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}
function fromRoman(s: string): number | null {
  if (!/^[ivxlcdm]+$/.test(s)) return null;
  let n = 0, rest = s;
  for (const [v, sym] of ROMAN) while (rest.startsWith(sym)) { n += v; rest = rest.slice(sym.length); }
  return rest === '' && n > 0 && n <= 3999 && toRoman(n) === s ? n : null;
}

/** t-shirt name for an offset from `m`. */
function tshirtAt(d: number): string {
  if (d === 0) return 'm';
  const k = Math.abs(d);
  const core = d < 0 ? 's' : 'l';
  if (k === 1) return core;
  const x = d < 0 ? 'xs' : 'xl';
  return k === 2 ? x : `${k - 1}${x}`;
}
function tshirtOffset(name: string): number | null {
  if (name === 'm') return 0;
  if (name === 's') return -1;
  if (name === 'l') return 1;
  const m = /^(?:([2-9]|[1-9]\d+))?x([sl])$/.exec(name);
  if (!m) return null;
  const k = m[1] ? Number(m[1]) + 1 : 2;
  return m[2] === 's' ? -k : k;
}

// ── Selection ──────────────────────────────────────────────────────────

/** `k` of `m` positions (1…m, outward from the base): the outermost always,
 *  the rest spread evenly towards the base. */
function spread(k: number, m: number): number[] {
  return Array.from({ length: k }, (_, j) => Math.round(((j + 1) * m) / k));
}

/** Round `x`, sending an exact .5 towards `mid` so picks stay symmetric. */
function roundTowards(x: number, mid: number): number {
  const f = Math.floor(x);
  if (x - f !== 0.5) return Math.round(x);
  return x < mid ? f + 1 : f;
}

function defaultBase(count: number, s: AnyScheme): number {
  if (s.kind === 'list' && s.anchor === 'base') {
    // Keep the list's own proportions; an exact .5 leans to the larger side.
    const x = ((count - 1) * s.baseIndex) / (s.names.length - 1);
    return Math.ceil(x - 0.5);
  }
  return Math.floor((count - 1) / 2);
}

export function scaleNames(
  count: number,
  scheme: BuiltinSchemeName | NamingScheme,
  options: ScaleNamesOptions = {},
): string[] {
  const s = resolveScheme(scheme);
  if (!Number.isInteger(count) || count < 0) fail(`scaleNames: count must be a non-negative integer, got ${count}`);

  for (const opt of ['start', 'step', 'case'] as const) {
    if (options[opt] !== undefined && !OPTIONS_OF[s.kind].includes(opt)) {
      fail(`scaleNames: option "${opt}" does not apply to the "${s.name}" scheme`);
    }
  }
  if (options.base !== undefined && s.anchor !== 'base') {
    fail(`scaleNames: option "base" only applies to base-anchored schemes; "${s.name}" is ${s.anchor}-anchored`);
  }

  let names: string[];
  if (count === 0) names = [];
  else switch (s.kind) {
    case 'ordinal': {
      // Counting in steps starts at the first step: step 10 → 10, 20, 30.
      const step = options.step ?? 1, start = options.start ?? step;
      if (!Number.isInteger(step) || step < 1) fail(`scaleNames: ordinal step must be a positive integer, got ${step}`);
      if (!Number.isInteger(start) || start < 0) fail(`scaleNames: ordinal start must be a non-negative integer, got ${start}`);
      names = Array.from({ length: count }, (_, i) => String(start + i * step));
      break;
    }
    case 'roman': {
      if (count > 3999) fail(`scaleNames: "roman" goes up to 3999, ${count} values were asked for`);
      names = Array.from({ length: count }, (_, i) => toRoman(i + 1));
      if (options.case === 'upper') names = names.map((n) => n.toUpperCase());
      else if (options.case !== undefined && options.case !== 'lower') fail(`scaleNames: case must be "lower" or "upper"`);
      break;
    }
    case 'list':
      if (s.anchor === 'start') {
        if (count > s.names.length) fail(`scaleNames: "${s.name}" has ${s.names.length} names, ${count} were asked for`);
        names = s.names.slice(0, count);
        break;
      }
      names = baseNames(count, s, options.base ?? defaultBase(count, s));
      break;
    case 'tshirt':
      names = baseNames(count, s, options.base ?? defaultBase(count, s));
      break;
    case 'range':
      names = rangeNames(count, s);
      break;
  }

  const prefix = options.prefix ?? '', suffix = options.suffix ?? '';
  const out = names.map((n) => `${prefix}${n}${suffix}`);
  if (prefix || suffix) checkKeys(out, 'scaleNames');
  return out;
}

function baseNames(count: number, s: BaseList | Tshirt, base: number): string[] {
  if (!Number.isInteger(base) || base < 0 || base >= count) {
    fail(`scaleNames: base must be an integer index from 0 to ${count - 1}, got ${base}`);
  }
  const below = base, above = count - 1 - base;
  if (s.kind === 'tshirt') {
    return Array.from({ length: count }, (_, i) => tshirtAt(i - base));
  }
  const haveBelow = s.baseIndex, haveAbove = s.names.length - 1 - s.baseIndex;
  if (below > haveBelow || above > haveAbove) {
    fail(`scaleNames: "${s.name}" has ${haveBelow} below its base "${s.names[s.baseIndex]}" and ` +
      `${haveAbove} above; ${below} below and ${above} above were asked for`);
  }
  const lower = spread(below, haveBelow).map((p) => s.names[s.baseIndex - p]).reverse();
  const upper = spread(above, haveAbove).map((p) => s.names[s.baseIndex + p]);
  return [...lower, s.names[s.baseIndex], ...upper];
}

function rangeNames(count: number, s: Range): string[] {
  const tier = s.tiers.find((t) => t.length >= count);
  if (!tier) {
    const max = s.tiers[s.tiers.length - 1].length;
    fail(`scaleNames: "${s.name}" fits up to ${max} values, ${count} were asked for`);
  }
  const R = tier.length - 1;
  if (count === 1) return [String(tier[roundTowards(R / 2, R / 2)])];
  return Array.from({ length: count }, (_, i) => String(tier[roundTowards((i * R) / (count - 1), R / 2)]));
}

// ── Room to grow ───────────────────────────────────────────────────────

/** Position of `name` in the scheme's order, or null if it is not a member. */
function positionOf(name: string, s: AnyScheme): number | null {
  switch (s.kind) {
    case 'ordinal': return /^\d+$/.test(name) ? Number(name) : null;
    case 'range': {
      if (!/^\d+$/.test(name)) return null;
      const n = Number(name);
      return n >= s.min && n <= s.max ? n : null;
    }
    case 'roman': {
      const lower = name.toLowerCase();
      if (name !== lower && name !== name.toUpperCase()) return null;
      return fromRoman(lower);
    }
    case 'tshirt': return tshirtOffset(name);
    case 'list': { const i = s.names.indexOf(name); return i < 0 ? null : i; }
  }
}

export function nameBetween(lower: string, upper: string, scheme: BuiltinSchemeName | NamingScheme): string {
  const s = resolveScheme(scheme);
  const range = s.kind === 'range' ? ` (${s.min}–${s.max})` : '';
  const a = positionOf(lower, s), b = positionOf(upper, s);
  if (a === null) fail(`nameBetween: "${lower}" is not a name of the "${s.name}" scheme${range}`);
  if (b === null) fail(`nameBetween: "${upper}" is not a name of the "${s.name}" scheme${range}`);
  if (s.kind === 'roman' && (lower === lower.toLowerCase()) !== (upper === upper.toLowerCase())) {
    fail('nameBetween: Roman names must use the same case');
  }
  if (!(a < b)) fail(`nameBetween: "${lower}" must come before "${upper}" in the "${s.name}" scheme`);

  if (s.kind === 'ordinal' || s.kind === 'range') {
    return String((a + b) / 2).replace('.', '_');
  }
  return `${lower}-${upper}`;
}
