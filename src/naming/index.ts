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
import { assertValidTokenKey } from '../keys';

export type NamingAnchor = 'start' | 'base' | 'range';

/** A naming scheme. Built-ins live in `schemes`; make your own with
 *  `namingScheme()`. The internals are not part of the public API. */
export interface NamingScheme {
  readonly name: string;
  readonly anchor: NamingAnchor;
}

export type BuiltinSchemeName =
  | 'ordinal' | 'roman' | 'greek' | 'paper' | 'creatures' | 'objects'
  | 'tshirt' | 'intensity' | 'dynamics' | 'weights'
  | 'hundreds' | 'tones' | 'unit' | 'signed';

export interface ScaleNamesOptions {
  /** Which value gets the base name.
   *  - A number is an index. Base-anchored schemes keep their base name;
   *    `ordinal` and range schemes centre on 0 and count outward
   *    (`base: 2` → `-2 -1 0 1 2`, on `hundreds` `-200 … 200`).
   *  - `[index, name]` also picks the name: any name of a list scheme, a
   *    number for `ordinal`, or a step inside a range scheme (`[2, '500']`). */
  base?: number | readonly [number, string];
  /** Number schemes. `ordinal`: the first number (default: the step, so
   *  1 — or 10 with `step: 10`; may be negative). Range schemes: the low
   *  end, with `to` as the high end (`hundreds` from -500 to 500). */
  from?: number;
  to?: number;
  prefix?: string;
  suffix?: string;
  /** `ordinal` only: distance between numbers (default 1). */
  step?: number;
  /** `roman` only (default 'lower'). */
  case?: 'lower' | 'upper';
  /** What to do when a fixed list or range runs out of names. `'throw'`
   *  (default) fails; `'between'` keeps every name and adds the extra steps
   *  in the gaps as fractions of the way to the next name (`soft_5`,
   *  `62_5`). Not for `ordinal`, `roman` or `tshirt`, which never run out.
   *  Prefer a scheme with enough names; fractional names are a fallback. */
  overflow?: 'throw' | 'between';
}

// ── Internal scheme shapes ─────────────────────────────────────────────

type OptionName = 'step' | 'case' | 'from' | 'to';

interface StartList extends NamingScheme { anchor: 'start'; kind: 'list'; names: readonly string[] }
interface BaseList extends NamingScheme { anchor: 'base'; kind: 'list'; names: readonly string[]; baseIndex: number }
interface Ordinal extends NamingScheme { anchor: 'start'; kind: 'ordinal' }
interface Roman extends NamingScheme { anchor: 'start'; kind: 'roman' }
interface Tshirt extends NamingScheme { anchor: 'base'; kind: 'tshirt' }
/** Fixed ends and step sizes from coarse to fine. Each step gives a tier:
 *  the two ends plus every multiple of the step between them. */
interface Range extends NamingScheme { anchor: 'range'; kind: 'range'; from: number; to: number; steps: readonly number[] }
type AnyScheme = StartList | BaseList | Ordinal | Roman | Tshirt | Range;

const OPTIONS_OF: Record<AnyScheme['kind'], readonly OptionName[]> = {
  list: [], ordinal: ['from', 'step'], roman: ['case'], tshirt: [], range: ['from', 'to'],
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
const range = (name: string, from: number, to: number, steps: number[]): Range =>
  ({ name, anchor: 'range', kind: 'range', from, to, steps: Object.freeze(steps) });

export const schemes: Readonly<Record<BuiltinSchemeName, NamingScheme>> = Object.freeze({
  ordinal: { name: 'ordinal', anchor: 'start', kind: 'ordinal' } as Ordinal,
  roman: { name: 'roman', anchor: 'start', kind: 'roman' } as Roman,
  greek: list('greek', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega']),
  paper: list('paper', ['a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1', 'a0']),
  // Smallest to largest by typical adult size, from a tardigrade to a blue whale.
  creatures: list('creatures', ['tardigrade', 'mite', 'flea', 'ant', 'fly', 'bee', 'beetle', 'mouse', 'hamster', 'rat',
    'rabbit', 'cat', 'fox', 'dog', 'wolf', 'deer', 'bear', 'horse', 'giraffe', 'hippo', 'rhino', 'elephant', 'whale']),
  // 100 things everyone has a sense of the size of, each at least 15% bigger
  // than the one before (typical largest dimension), from an atom to the
  // observable universe.
  objects: list('objects', ['atom', 'molecule', 'protein', 'virus', 'bacterium', 'bloodcell', 'cell', 'pollen',
    'dust', 'flour', 'salt', 'sand', 'pinhead', 'sesame', 'lentil', 'rice', 'pea', 'bead', 'button', 'dice',
    'marble', 'coin', 'grape', 'walnut', 'golfball', 'egg', 'tennisball', 'card', 'mug', 'can', 'phone', 'banana',
    'football', 'plate', 'ruler', 'laptop', 'keyboard', 'pillow', 'suitcase', 'skateboard', 'chair', 'desk',
    'bicycle', 'door', 'ladder', 'car', 'van', 'limousine', 'truck', 'bus', 'house', 'barn', 'tree', 'lighthouse',
    'plane', 'pool', 'church', 'castle', 'field', 'cathedral', 'stadium', 'ship', 'skyscraper', 'dam', 'harbor',
    'bridge', 'runway', 'airport', 'town', 'forest', 'city', 'metropolis', 'lake', 'valley', 'island', 'canyon',
    'peninsula', 'country', 'sea', 'moon', 'mercury', 'continent', 'earth', 'neptune', 'saturn', 'jupiter', 'sun',
    'bluegiant', 'redgiant', 'orbit', 'supergiant', 'solarsystem', 'nebula', 'cluster', 'dwarfgalaxy', 'galaxy',
    'localgroup', 'supercluster', 'void', 'universe']),
  tshirt: { name: 'tshirt', anchor: 'base', kind: 'tshirt' } as Tshirt,
  intensity: baseList('intensity',
    ['hint', 'faint', 'subtle', 'soft', 'mid', 'firm', 'bold', 'strong', 'intense'], 'mid'),
  dynamics: baseList('dynamics', ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'], 'mf'),
  weights: baseList('weights',
    ['thin', 'extralight', 'light', 'regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'], 'regular'),
  hundreds: range('hundreds', 50, 950, [100, 50, 25]),
  tones: range('tones', 0, 100, [10, 5]),
  unit: range('unit', 0, 1, [0.25, 0.1, 0.05]),
  signed: range('signed', -1, 1, [0.5, 0.25, 0.1, 0.05]),
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

  for (const opt of ['step', 'case', 'from', 'to'] as const) {
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
    if (s.kind === 'roman') fail('scaleNames: option "base" does not apply to "roman"');
    if (pair && (pair.length !== 2 || typeof pair[1] !== 'string')) {
      fail('scaleNames: base must be an index or an [index, name] pair');
    }
    if (s.kind === 'list' && s.anchor === 'start' && !pair) {
      fail(`scaleNames: "${s.name}" has no base name of its own; give one with [index, name], e.g. [3, '${s.names[Math.floor(s.names.length / 2)]}']`);
    }
    if (s.kind === 'ordinal' && options.from !== undefined) {
      fail('scaleNames: ordinal "from" and "base" cannot be combined — the base value is the anchor');
    }
    if (s.kind === 'range' && !pair && (options.from !== undefined || options.to !== undefined)) {
      fail('scaleNames: a bare base index centres the scale on 0, so "from" / "to" do not apply');
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
      const step = options.step ?? 1;
      if (!Number.isInteger(step) || step < 1) fail(`scaleNames: ordinal step must be a positive integer, got ${step}`);
      if (baseIndex !== undefined) {
        // Centred: the base value (0 unless named) and whole steps both ways.
        const at = pair ? Number(pair[1]) : 0;
        if (!Number.isInteger(at) || !/^-?\d+$/.test(pair?.[1] ?? '0')) fail(`scaleNames: ordinal base name must be an integer, got "${pair?.[1]}"`);
        names = Array.from({ length: count }, (_, i) => String(at + (i - baseIndex) * step));
        break;
      }
      // Counting in steps starts at the first step: step 10 → 10, 20, 30.
      const first = options.from ?? step;
      if (!Number.isInteger(first)) fail(`scaleNames: ordinal "from" must be an integer, got ${first}`);
      names = Array.from({ length: count }, (_, i) => String(first + i * step));
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
      if (s.anchor === 'start' && pair) {
        // A plain list with a chosen base name behaves like a base-anchored one.
        names = baseNames(count, { ...s, anchor: 'base', baseIndex: 0 }, pair[0], pair[1], fill);
        break;
      }
      if (s.anchor === 'start') {
        if (count > s.names.length) {
          if (!fill || s.names.length < 2) fail(`scaleNames: "${s.name}" has ${s.names.length} names, ${count} were asked for`);
          names = fillGaps(s.names, count);
        } else {
          names = s.names.slice(0, count);
        }
        break;
      }
      names = baseNames(count, s as BaseList, baseIndex ?? defaultBase(count, s), pair?.[1], fill);
      break;
    case 'tshirt':
      names = baseNames(count, s, baseIndex ?? defaultBase(count, s), pair?.[1]);
      break;
    case 'range':
      if (baseIndex !== undefined && !pair) {
        // Centred on 0, counting outward in the coarsest step, both ways.
        names = Array.from({ length: count }, (_, i) => stepName((i - baseIndex) * s.steps[0]));
        break;
      }
      names = pair
        ? rangeNamesAround(count, s, rangeEnds(s, options), pair[0], pair[1], fill)
        : rangeNames(count, s, rangeEnds(s, options), fill);
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

/** A number as a key: `62.5` → `62_5`, `-0.5` → `-0_5`. */
const stepName = (v: number) => String(Object.is(v, -0) ? 0 : v).replace('.', '_');

/** A key as a number, or NaN: `62_5` → 62.5, `-1` → -1. */
const stepValue = (name: string) => (/^-?\d+(?:_\d+)?$/.test(name) ? Number(name.replace('_', '.')) : NaN);

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;

interface Ends { from: number; to: number }

function rangeEnds(s: Range, o: ScaleNamesOptions): Ends {
  const from = o.from ?? s.from, to = o.to ?? s.to;
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(from < to)) {
    fail(`scaleNames: "${s.name}" needs from < to, got from ${from} and to ${to}`);
  }
  return { from, to };
}

/** The two ends plus every multiple of `step` strictly between them,
 *  computed on integers so decimal steps stay exact. */
function tier({ from, to }: Ends, step: number): number[] {
  const scale = 10 ** Math.max(decimals(step), decimals(from), decimals(to));
  const F = Math.round(from * scale), T = Math.round(to * scale), st = Math.round(step * scale);
  const out = [from];
  for (let m = Math.floor(F / st) + 1; m * st < T; m++) out.push((m * st) / scale);
  out.push(to);
  return out;
}

/** Tiers from coarse to fine; when filling, the finest step keeps halving. */
function tiersOf(s: Range, ends: Ends, fill: boolean): number[][] {
  const stepsUsed = [...s.steps];
  if (fill) for (let i = 0; i < 10; i++) stepsUsed.push(stepsUsed[stepsUsed.length - 1] / 2);
  return stepsUsed.map((st) => tier(ends, st));
}

function rangeNames(count: number, s: Range, ends: Ends, fill = false): string[] {
  const all = tiersOf(s, ends, fill);
  const t = all.find((x) => x.length >= count);
  if (!t) {
    fail(`scaleNames: "${s.name}" fits up to ${all[all.length - 1].length} values from ${ends.from} to ${ends.to}, ` +
      `${count} were asked for`);
  }
  const R = t.length - 1;
  if (count === 1) return [stepName(t[roundTowards(R / 2, R / 2)])];
  return Array.from({ length: count }, (_, i) => stepName(t[roundTowards((i * R) / (count - 1), R / 2)]));
}

/** Range names with `name` on value `index`: the values below spread over
 *  the rungs from the low end up to `name`, the ones above from `name` to
 *  the high end, using the coarsest tier where both sides fit. An exact .5
 *  rounds towards the base, so both sides stay symmetric. */
function rangeNamesAround(count: number, s: Range, ends: Ends, index: number, name: string, fill = false): string[] {
  const value = stepValue(name);
  const below = index, above = count - 1 - index;
  let inAnyTier = false;
  for (const t of tiersOf(s, ends, fill)) {
    const b = t.indexOf(value);
    if (b < 0) continue;
    inAnyTier = true;
    const R = t.length - 1;
    if (b < below || R - b < above) continue;
    const lower = Array.from({ length: below }, (_, j) => {
      const x = (j * b) / below;
      return t[x % 1 === 0.5 ? Math.ceil(x) : Math.round(x)];
    });
    const upper = Array.from({ length: above }, (_, j) => {
      const x = ((j + 1) * (R - b)) / above;
      return t[b + (x % 1 === 0.5 ? Math.floor(x) : Math.round(x))];
    });
    return [...lower, value, ...upper].map(stepName);
  }
  if (!inAnyTier) {
    fail(`scaleNames: "${name}" is not a step of the "${s.name}" scheme (${ends.from}–${ends.to})`);
  }
  fail(`scaleNames: "${s.name}" cannot fit ${below} below and ${above} above "${name}"`);
}

// ── Room to grow ───────────────────────────────────────────────────────
//
// Every scheme maps its names to positions on a number line: list index,
// t-shirt offset from `m`, Roman value, or the number itself. A step between
// two names is the name at the midpoint. When the midpoint falls on a real
// name, that name is returned (`hint`…`mid` → `subtle`); otherwise it is the
// name below plus the fraction of the way to the next one (`soft_5`), the same
// notation `overflow: 'between'` uses. Numbers are simply written as keys
// (`162_5`, `-0_5`). Every name this returns can be split again.

/** `0.5` → `5`, `0.375` → `375`. */
const fractionDigits = (f: number) => String(Number(f.toFixed(6))).replace(/^0\./, '');

/** Position of an exact scheme name, or null. */
function exactPosition(name: string, s: AnyScheme): number | null {
  switch (s.kind) {
    case 'ordinal':
    case 'range': { const n = stepValue(name); return Number.isNaN(n) ? null : n; }
    case 'roman': {
      const lower = name.toLowerCase();
      if (name !== lower && name !== name.toUpperCase()) return null;
      return fromRoman(lower);
    }
    case 'tshirt': return tshirtOffset(name);
    case 'list': { const i = s.names.indexOf(name); return i < 0 ? null : i; }
  }
}

/** Position of a name, including in-between names like `soft_5`. */
function positionOf(name: string, s: AnyScheme): number | null {
  const exact = exactPosition(name, s);
  if (exact !== null || s.kind === 'ordinal' || s.kind === 'range') return exact;
  const m = /^(.+)_(\d+)$/.exec(name);
  if (!m) return null;
  const whole = exactPosition(m[1], s);
  return whole === null ? null : whole + Number(`0.${m[2]}`);
}

/** The name at a position. `upper` keeps Roman names in capitals. */
function nameAt(p: number, s: AnyScheme, upper = false): string {
  if (s.kind === 'ordinal' || s.kind === 'range') return stepName(p);
  const whole = Math.floor(p), frac = p - whole;
  let base: string;
  if (s.kind === 'list') base = s.names[whole];
  else if (s.kind === 'tshirt') base = tshirtAt(whole);
  else base = upper ? toRoman(whole).toUpperCase() : toRoman(whole);
  return frac === 0 ? base : `${base}_${fractionDigits(frac)}`;
}

/**
 * A name for a step inserted between two existing keys.
 *
 * Only reach for this when names must stay stable — keys other code, CSS or
 * a published token set already depends on. Otherwise re-run `scaleNames`
 * with the new count: it gives the whole scale clean, evenly spread names,
 * where inserted steps pile up fractions (`soft_5`, `soft_75`).
 */
export function nameBetween(lower: string, upper: string, scheme: BuiltinSchemeName | NamingScheme): string {
  const s = resolveScheme(scheme);
  const a = positionOf(lower, s), b = positionOf(upper, s);
  if (a === null) fail(`nameBetween: "${lower}" is not a name of the "${s.name}" scheme`);
  if (b === null) fail(`nameBetween: "${upper}" is not a name of the "${s.name}" scheme`);
  const isUpper = (n: string) => n !== n.toLowerCase();
  if (s.kind === 'roman' && isUpper(lower) !== isUpper(upper)) {
    fail('nameBetween: Roman names must use the same case');
  }
  if (!(a < b)) fail(`nameBetween: "${lower}" must come before "${upper}" in the "${s.name}" scheme`);
  return nameAt((a + b) / 2, s, s.kind === 'roman' && isUpper(lower));
}

/** Name every value of an array: `[name, value]` pairs, smallest first,
 *  ready for `scope.set(name, …)`. Takes the same options as `scaleNames`. */
export function nameValues<T>(
  values: readonly T[],
  scheme: BuiltinSchemeName | NamingScheme,
  options: ScaleNamesOptions = {},
): [string, T][] {
  if (!Array.isArray(values)) fail('nameValues: values must be an array');
  return scaleNames(values.length, scheme, options).map((name, i) => [name, values[i]]);
}
