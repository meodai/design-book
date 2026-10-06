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
  /** Which value gets the base name. A number is an index (base-anchored
   *  schemes). `[index, name]` also picks the name: any name of a
   *  base-anchored scheme, or a step of a range scheme (`[2, '500']`). */
  base?: number | readonly [number, string];
  prefix?: string;
  suffix?: string;
  /** `ordinal` only: first number (default: the step, so 1 or 10, 20 …). */
  start?: number;
  /** `ordinal` only: distance between numbers (default 1). */
  step?: number;
  /** `roman` only (default 'lower'). */
  case?: 'lower' | 'upper';
  /** What to do when a fixed list or range runs out of names. `'throw'`
   *  (default) fails; `'between'` keeps every name and adds the extra steps
   *  in the gaps as fractions of the way to the next name (`soft_5`,
   *  `62_5`). Not for `ordinal`, `roman` or `tshirt`, which never run out. */
  overflow?: 'throw' | 'between';
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
  // Smallest to largest by typical adult size, from a tardigrade to a blue whale.
  creatures: list('creatures', ['tardigrade', 'mite', 'flea', 'ant', 'fly', 'bee', 'beetle', 'mouse', 'hamster', 'rat',
    'rabbit', 'cat', 'fox', 'dog', 'wolf', 'deer', 'bear', 'horse', 'giraffe', 'hippo', 'rhino', 'elephant', 'whale']),
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

/** Keep every name of `seq` (ends included) and add `slots - seq.length`
 *  extra steps, spread evenly over the gaps. A gap after `a` with k extras
 *  gets `a_<fraction>` for 1/(k+1) … k/(k+1) of the way to the next name:
 *  one extra → `a_5`, three → `a_25 a_5 a_75`. */
function fillGaps(seq: readonly string[], slots: number): string[] {
  const gaps = seq.length - 1, extra = slots - seq.length;
  const out: string[] = [];
  for (let g = 0; g < seq.length; g++) {
    out.push(seq[g]);
    if (g === gaps) break;
    const k = Math.round(((g + 1) * extra) / gaps) - Math.round((g * extra) / gaps);
    const digits = String(k + 1).length + 1;
    for (let j = 1; j <= k; j++) {
      const frac = (j / (k + 1)).toFixed(digits).replace(/^0\./, '').replace(/0+$/, '');
      out.push(`${seq[g]}_${frac}`);
    }
  }
  return out;
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
  const overflow = options.overflow ?? 'throw';
  if (overflow !== 'throw' && overflow !== 'between') {
    fail(`scaleNames: overflow must be "throw" or "between", got ${String(overflow)}`);
  }
  if (options.overflow !== undefined && s.kind !== 'list' && s.kind !== 'range') {
    fail(`scaleNames: option "overflow" does not apply to "${s.name}", which never runs out of names`);
  }
  const fill = overflow === 'between';

  const pair = Array.isArray(options.base) ? options.base as readonly [number, string] : null;
  if (options.base !== undefined) {
    if (s.anchor === 'start') {
      fail(`scaleNames: option "base" does not apply to "${s.name}", which is start-anchored`);
    }
    if (pair && (pair.length !== 2 || typeof pair[1] !== 'string')) {
      fail('scaleNames: base must be an index or an [index, name] pair');
    }
    if (s.anchor === 'range' && !pair) {
      fail(`scaleNames: on the range scheme "${s.name}", base needs an [index, name] pair, e.g. [2, '500']`);
    }
  }
  const baseIndex = pair ? pair[0] : options.base as number | undefined;
  if (baseIndex !== undefined && count > 0 && (!Number.isInteger(baseIndex) || baseIndex < 0 || baseIndex >= count)) {
    fail(`scaleNames: base must be an integer index from 0 to ${count - 1}, got ${baseIndex}`);
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
        if (count > s.names.length) {
          if (!fill || s.names.length < 2) fail(`scaleNames: "${s.name}" has ${s.names.length} names, ${count} were asked for`);
          names = fillGaps(s.names, count);
        } else {
          names = s.names.slice(0, count);
        }
        break;
      }
      names = baseNames(count, s, baseIndex ?? defaultBase(count, s), pair?.[1], fill);
      break;
    case 'tshirt':
      names = baseNames(count, s, baseIndex ?? defaultBase(count, s), pair?.[1]);
      break;
    case 'range':
      names = pair ? rangeNamesAround(count, s, pair[0], pair[1], fill) : rangeNames(count, s, fill);
      break;
  }

  const prefix = options.prefix ?? '', suffix = options.suffix ?? '';
  const out = names.map((n) => `${prefix}${n}${suffix}`);
  if (prefix || suffix) checkKeys(out, 'scaleNames');
  return out;
}

function baseNames(count: number, s: BaseList | Tshirt, base: number, baseName?: string, fill = false): string[] {
  const below = base, above = count - 1 - base;
  if (s.kind === 'tshirt') {
    const shift = baseName === undefined ? 0 : tshirtOffset(baseName);
    if (shift === null) fail(`scaleNames: "${baseName}" is not a t-shirt size`);
    return Array.from({ length: count }, (_, i) => tshirtAt(i - base + shift));
  }
  const at = baseName === undefined ? s.baseIndex : s.names.indexOf(baseName);
  if (at < 0) fail(`scaleNames: "${baseName}" is not a name of the "${s.name}" scheme`);
  const haveBelow = at, haveAbove = s.names.length - 1 - at;
  const fits = (need: number, have: number) => need <= have || (fill && have > 0);
  if (!fits(below, haveBelow) || !fits(above, haveAbove)) {
    fail(`scaleNames: "${s.name}" has ${haveBelow} below its base "${s.names[at]}" and ` +
      `${haveAbove} above; ${below} below and ${above} above were asked for`);
  }
  // A side with too few names keeps them all (base included) and fills the gaps.
  const lower = below <= haveBelow
    ? spread(below, haveBelow).map((p) => s.names[at - p]).reverse()
    : fillGaps(s.names.slice(0, at + 1), below + 1).slice(0, -1);
  const upper = above <= haveAbove
    ? spread(above, haveAbove).map((p) => s.names[at + p])
    : fillGaps(s.names.slice(at), above + 1).slice(1);
  return [...lower, s.names[at], ...upper];
}

/** A range step as a key: `62.5` → `62_5`. */
const stepName = (v: number) => String(v).replace('.', '_');

/** The scheme's tiers, plus ever finer halvings of the last when filling. */
function tiersOf(s: Range, fill: boolean): readonly (readonly number[])[] {
  if (!fill) return s.tiers;
  const out = [...s.tiers];
  for (let i = 0; i < 10; i++) {
    const last = out[out.length - 1];
    out.push(steps(s.min, s.max, (last[1] - last[0]) / 2));
  }
  return out;
}

function rangeNames(count: number, s: Range, fill = false): string[] {
  const tier = tiersOf(s, fill).find((t) => t.length >= count);
  if (!tier) {
    const max = s.tiers[s.tiers.length - 1].length;
    fail(`scaleNames: "${s.name}" fits up to ${max} values, ${count} were asked for`);
  }
  const R = tier.length - 1;
  if (count === 1) return [stepName(tier[roundTowards(R / 2, R / 2)])];
  return Array.from({ length: count }, (_, i) => stepName(tier[roundTowards((i * R) / (count - 1), R / 2)]));
}

/** Range names with `name` on value `index`: the values below spread over
 *  the rungs from the low end up to `name`, the ones above from `name` to
 *  the high end, using the coarsest tier where both sides fit. An exact .5
 *  rounds towards the base, so both sides stay symmetric. */
function rangeNamesAround(count: number, s: Range, index: number, name: string, fill = false): string[] {
  const value = /^\d+$/.test(name) ? Number(name) : NaN;
  const below = index, above = count - 1 - index;
  let inAnyTier = false;
  for (const tier of tiersOf(s, fill)) {
    const b = tier.indexOf(value);
    if (b < 0) continue;
    inAnyTier = true;
    const R = tier.length - 1;
    if (b < below || R - b < above) continue;
    const lower = Array.from({ length: below }, (_, j) => {
      const x = (j * b) / below;
      return tier[x % 1 === 0.5 ? Math.ceil(x) : Math.round(x)];
    });
    const upper = Array.from({ length: above }, (_, j) => {
      const x = ((j + 1) * (R - b)) / above;
      return tier[b + (x % 1 === 0.5 ? Math.floor(x) : Math.round(x))];
    });
    return [...lower, value, ...upper].map(stepName);
  }
  if (!inAnyTier) {
    fail(`scaleNames: "${name}" is not a step of the "${s.name}" scheme (${s.min}–${s.max})`);
  }
  fail(`scaleNames: "${s.name}" cannot fit ${below} below and ${above} above "${name}"`);
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
