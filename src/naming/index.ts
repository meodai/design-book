/**
 * Naming schemes for primitive token keys.
 *
 * Pure helpers: given how many values you have, return keys for them from a
 * convention (`50 … 950`, t-shirt sizes, an intensity ladder, …). They never
 * create, store or transform token values and never touch a DesignBook —
 * name your array, then `scope.set(name, value)` in your own loop.
 *
 * A scheme is a vocabulary (its names, in order) plus a default strategy —
 * its anchor — for picking `count` of them:
 * - start — consecutive steps up from a first name (`1 2 3`, `alpha beta`);
 * - base  — consecutive steps both ways from a centre name (`s m l`);
 * - range — both ends fixed, spread evenly between (`50 … 950`).
 * Any scheme can use any strategy: pass `anchor` to override the default.
 *
 * This module must stay dependency-free (it is published on its own as
 * `design-book/naming`): import only `../errors` and `../keys`.
 */
import { TokenError } from '../errors';
import { assertValidTokenKey } from '../keys';

export type NamingAnchor = 'start' | 'base' | 'range';

/** A naming scheme: a vocabulary and its default `anchor`. Built-ins live
 *  in `schemes`; make your own with `namingScheme()`. The internals are not
 *  part of the public API. */
export interface NamingScheme {
  readonly name: string;
  readonly anchor: NamingAnchor;
}

export type BuiltinSchemeName =
  | 'ordinal' | 'roman' | 'greek' | 'paper' | 'creatures' | 'objects' | 'things' | 'value'
  | 'tshirt' | 'intensity' | 'dynamics' | 'weights'
  | 'hundreds' | 'tones' | 'unit' | 'signed';

export interface ScaleNamesOptions {
  /** The strategy, overriding the scheme's default. */
  anchor?: NamingAnchor;
  /** Which value gets the centre or a chosen name.
   *  - A number is an index: that value gets the scheme's centre (`m`,
   *    `mid`, `regular`, the middle of a list, `0` for numbers) and the rest
   *    step outward both ways — the `base` strategy.
   *  - `[index, name]` puts that name on that value. Vocabularies with ends
   *    (lists, ranges) spread the rest to their ends; open-ended ones
   *    (`ordinal`, `roman`, `tshirt`) step outward. */
  base?: number | readonly [number, string];
  /** `start`: the first name or number. `range`: the low end, with `to` as
   *  the high end. Names for lists (`'cat'`), numbers for number schemes. */
  from?: number | string;
  to?: number | string;
  /** `start` / `base`: distance between steps (in names for lists, in units
   *  for numbers). */
  step?: number;
  /** `roman` only (default 'lower'). */
  case?: 'lower' | 'upper';
  /** `range` (and `start` on a list): what to do when there are more values
   *  than names. `'throw'` (default) fails; `'between'` keeps every name and
   *  adds the missing steps in the gaps as fractions (`soft_5`, `62_5`).
   *  Prefer a scheme with enough names; fractional names are a fallback. */
  overflow?: 'throw' | 'between';
  prefix?: string;
  suffix?: string;
}

// ── Internal scheme shapes ─────────────────────────────────────────────

interface List extends NamingScheme {
  kind: 'list';
  names: readonly string[];
  /** Index of the scheme's own centre name, or -1 (use the middle). */
  centre: number;
  /** The default range strategy pins the centre name (`hint … mid … intense`). */
  pinCentre: boolean;
}
interface Ordinal extends NamingScheme { kind: 'ordinal' }
/** Names each value by its own number — only through `nameValues`. */
interface ValueScheme extends NamingScheme { kind: 'value' }
interface Roman extends NamingScheme { kind: 'roman' }
interface Tshirt extends NamingScheme { kind: 'tshirt' }
/** Fixed ends and step sizes from coarse to fine. Each step gives a tier:
 *  the two ends plus every multiple of the step between them. */
interface Range extends NamingScheme { kind: 'range'; from: number; to: number; steps: readonly number[] }
type AnyScheme = List | Ordinal | ValueScheme | Roman | Tshirt | Range;

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

function list(name: string, names: string[], anchor: NamingAnchor, centre?: string): List {
  return {
    name, anchor, kind: 'list', names: Object.freeze(names),
    centre: centre === undefined ? -1 : names.indexOf(centre),
    pinCentre: centre !== undefined && anchor === 'range',
  };
}
const range = (name: string, from: number, to: number, steps: number[]): Range =>
  ({ name, anchor: 'range', kind: 'range', from, to, steps: Object.freeze(steps) });

export const schemes: Readonly<Record<BuiltinSchemeName, NamingScheme>> = Object.freeze({
  ordinal: { name: 'ordinal', anchor: 'start', kind: 'ordinal' } as Ordinal,
  roman: { name: 'roman', anchor: 'start', kind: 'roman' } as Roman,
  greek: list('greek', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
    'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'], 'start'),
  paper: list('paper', ['a10', 'a9', 'a8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1', 'a0'], 'start'),
  // Smallest to largest by typical adult size, from a tardigrade to a blue
  // whale. The order is the meaning, so the default spreads over all of it.
  creatures: list('creatures', ['tardigrade', 'mite', 'flea', 'ant', 'fly', 'bee', 'beetle', 'mouse', 'hamster',
    'rat', 'rabbit', 'cat', 'fox', 'dog', 'wolf', 'deer', 'bear', 'horse', 'giraffe', 'hippo', 'rhino', 'elephant',
    'whale'], 'range'),
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
    'localgroup', 'supercluster', 'void', 'universe'], 'range'),
  // A hand-picked ladder for UI sizes: memorable, each step clearly bigger,
  // dense in the everyday middle — not proportional to real size. Starts at
  // nothing, a name for 0.
  things: list('things', ['nothing', 'electron', 'atom', 'glitter', 'dust', 'snowflake', 'ant', 'pinhead',
    'key-cap', 'lipstick', 'poker-card', 'cup', 'wine-glass', 'champagne-bottle', 'umbrella', 'chair', 'ottoman',
    'table', 'kitchen-island', 'car', 'camper-van', 'godzilla', 'eiffel-tower', 'matterhorn', 'switzerland',
    'europe', 'moon', 'earth'], 'range'),
  // Each value named by its own number (`1 2 3 4 6 8 9` for an irregular
  // hairline scale). Needs the values, so it works through nameValues.
  value: { name: 'value', anchor: 'start', kind: 'value' } as ValueScheme,
  tshirt: { name: 'tshirt', anchor: 'base', kind: 'tshirt' } as Tshirt,
  // Ladders with a named middle: by default both ends are kept and the
  // centre name stays on its value (`hint … mid … intense`).
  intensity: list('intensity',
    ['hint', 'faint', 'subtle', 'soft', 'mid', 'firm', 'bold', 'strong', 'intense'], 'range', 'mid'),
  dynamics: list('dynamics', ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'], 'range', 'mf'),
  weights: list('weights',
    ['thin', 'extralight', 'light', 'regular', 'medium', 'semibold', 'bold', 'extrabold', 'black'], 'range', 'regular'),
  hundreds: range('hundreds', 50, 950, [100, 50, 25]),
  tones: range('tones', 0, 100, [10, 5]),
  unit: range('unit', 0, 1, [0.25, 0.1, 0.05]),
  signed: range('signed', -1, 1, [0.5, 0.25, 0.1, 0.05]),
});

/** Define a scheme from a list of names, smallest first. `base` names its
 *  centre — the default then keeps both ends with the centre on its value,
 *  like `intensity`. Without it the default is `start`. `anchor` sets a
 *  different default strategy. */
export function namingScheme(
  names: readonly string[],
  options: { base?: string; anchor?: NamingAnchor } = {},
): NamingScheme {
  if (!Array.isArray(names) || names.length === 0) fail('namingScheme: needs at least one name');
  if (new Set(names).size !== names.length) {
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    fail(`namingScheme: duplicate name "${dup}"`);
  }
  checkKeys(names, 'namingScheme');
  if (options.base !== undefined && !names.includes(options.base)) fail(`namingScheme: base "${options.base}" is not in the list`);
  if (options.anchor !== undefined && !ANCHORS.includes(options.anchor)) fail(`namingScheme: anchor must be one of ${ANCHORS.join(', ')}`);
  const anchor = options.anchor ?? (options.base !== undefined ? 'range' : 'start');
  return list('custom', [...names], anchor, options.base);
}

const ANCHORS: readonly NamingAnchor[] = ['start', 'base', 'range'];

function resolveScheme(scheme: BuiltinSchemeName | NamingScheme): AnyScheme {
  if (typeof scheme === 'string') {
    const s = (schemes as Record<string, NamingScheme>)[scheme];
    if (!s) fail(`Unknown naming scheme "${scheme}" (built-ins: ${Object.keys(schemes).join(', ')})`);
    return s as AnyScheme;
  }
  if (!scheme || !('kind' in scheme)) fail('Not a naming scheme — use a built-in name or namingScheme()');
  return scheme as AnyScheme;
}

/** A number option, or a number written as a key (`'0_5'`, `'-1'`). */
function asNumber(v: number | string, what: string): number {
  const n = typeof v === 'number' ? v : stepValue(v);
  if (!Number.isFinite(n)) fail(`scaleNames: "${what}" must be a number here, got ${String(v)}`);
  return n;
}

/** Drop floating-point noise from arithmetic on decimal steps. */
const clean = (v: number) => Number(v.toFixed(10));

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


// ── scaleNames ─────────────────────────────────────────────────────────

export function scaleNames(
  count: number,
  scheme: BuiltinSchemeName | NamingScheme,
  options: ScaleNamesOptions = {},
): string[] {
  const s = resolveScheme(scheme);
  if (!Number.isInteger(count) || count < 0) fail(`scaleNames: count must be a non-negative integer, got ${count}`);
  if (s.kind === 'value') fail('scaleNames: the "value" scheme names values by their own number — use nameValues(values, \'value\')');

  const pair = Array.isArray(options.base) ? options.base as readonly [number, string] : null;
  if (pair && (pair.length !== 2 || typeof pair[1] !== 'string')) {
    fail('scaleNames: base must be an index or an [index, name] pair');
  }
  const baseIndex = pair ? pair[0] : options.base as number | undefined;
  if (baseIndex !== undefined && count > 0 && (!Number.isInteger(baseIndex) || baseIndex < 0 || baseIndex >= count)) {
    fail(`scaleNames: base must be an integer index from 0 to ${count - 1}, got ${baseIndex}`);
  }

  // The strategy: explicit, else implied by base, else the scheme's default.
  // A bare index always steps outward from the centre; a pinned name spreads
  // to the ends where the vocabulary has ends, and steps outward where not.
  if (options.anchor !== undefined && !ANCHORS.includes(options.anchor)) {
    fail(`scaleNames: anchor must be one of ${ANCHORS.join(', ')}, got ${String(options.anchor)}`);
  }
  const bounded = s.kind === 'list' || s.kind === 'range';
  const anchor: NamingAnchor = options.anchor
    ?? (baseIndex !== undefined && !pair ? 'base'
      : pair ? (bounded ? 'range' : 'base')
      : s.anchor);
  const isDefault = options.anchor === undefined && baseIndex === undefined;

  checkOptions(s, anchor, options);
  const fill = options.overflow === 'between';

  let names: string[] = [];
  if (count > 0) {
    if (anchor === 'start') names = startNames(count, s, options, fill);
    else if (anchor === 'base') names = centredNames(count, s, options, baseIndex ?? Math.floor((count - 1) / 2), pair?.[1]);
    else names = spreadNames(count, s, options, pair, isDefault, fill);
  }
  if (s.kind === 'roman' && options.case === 'upper') names = names.map((n) => n.toUpperCase());

  const prefix = options.prefix ?? '', suffix = options.suffix ?? '';
  const out = names.map((n) => `${prefix}${n}${suffix}`);
  if (prefix || suffix) checkKeys(out, 'scaleNames');
  return out;
}

/** Name every value of an array: `[name, value]` pairs, smallest first,
 *  ready for `scope.set(name, …)`. Takes the same options as `scaleNames`. */
export function nameValues<T>(
  values: readonly T[],
  scheme: BuiltinSchemeName | NamingScheme,
  options: ScaleNamesOptions = {},
): [string, T][] {
  if (!Array.isArray(values)) fail('nameValues: values must be an array');
  const s = resolveScheme(scheme);
  if (s.kind === 'value') return valueNames(values, options);
  return scaleNames(values.length, scheme, options).map((name, i) => [name, values[i]]);
}

/** The `value` scheme: each value's own number as its key (`0.5rem` → `0_5`). */
function valueNames<T>(values: readonly T[], o: ScaleNamesOptions): [string, T][] {
  for (const opt of ['anchor', 'base', 'from', 'to', 'step', 'case', 'overflow'] as const) {
    if (o[opt] !== undefined) fail(`nameValues: option "${opt}" does not apply to the "value" scheme — the values are the names`);
  }
  const prefix = o.prefix ?? '', suffix = o.suffix ?? '';
  const seen = new Set<string>();
  const out = values.map((v): [string, T] => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
    if (!Number.isFinite(n)) fail(`nameValues: "${String(v)}" has no number to name it by`);
    const name = `${prefix}${stepName(clean(n))}${suffix}`;
    if (seen.has(name)) fail(`nameValues: the name "${name}" would be used twice — the "value" scheme needs distinct numbers`);
    seen.add(name);
    return [name, v];
  });
  checkKeys(out.map(([n]) => n), 'nameValues');
  return out;
}

/** Options that do not apply to this scheme and strategy throw. */
function checkOptions(s: AnyScheme, anchor: NamingAnchor, o: ScaleNamesOptions): void {
  const reject = (opt: string, why: string) => fail(`scaleNames: option "${opt}" ${why}`);
  if (o.step !== undefined && anchor === 'range') reject('step', 'does not apply to the range strategy — use from / to');
  if (o.from !== undefined && anchor === 'base') reject('from', 'does not apply to the base strategy — the centre is the anchor');
  if (o.to !== undefined && anchor !== 'range') reject('to', `only applies to the range strategy, not ${anchor}`);
  if (o.case !== undefined && s.kind !== 'roman') reject('case', `does not apply to the "${s.name}" scheme`);
  if (o.case !== undefined && o.case !== 'lower' && o.case !== 'upper') fail('scaleNames: case must be "lower" or "upper"');
  if (o.overflow !== undefined) {
    if (o.overflow !== 'throw' && o.overflow !== 'between') fail(`scaleNames: overflow must be "throw" or "between", got ${String(o.overflow)}`);
    const canFill = (anchor === 'range' && s.kind !== 'tshirt' && s.kind !== 'ordinal' && s.kind !== 'roman')
      || (anchor === 'start' && s.kind === 'list');
    if (!canFill) reject('overflow', `does not apply to "${s.name}" with the ${anchor} strategy`);
  }
  if (o.base !== undefined && anchor === 'start') reject('base', 'does not apply to the start strategy — use from');
  if (o.step !== undefined) {
    const ok = s.kind === 'range' ? o.step > 0 && Number.isFinite(o.step) : Number.isInteger(o.step) && o.step >= 1;
    if (!ok) fail(`scaleNames: step must be a positive ${s.kind === 'range' ? 'number' : 'integer'}, got ${o.step}`);
  }
}

/** Integer position of a name in an open-ended or list vocabulary. */
function positionIn(s: AnyScheme, v: number | string, what: string): number {
  if (s.kind === 'list') {
    const i = typeof v === 'string' ? s.names.indexOf(v) : -1;
    if (i < 0) fail(`scaleNames: "${v}" is not a name of the "${s.name}" scheme`);
    return i;
  }
  if (s.kind === 'tshirt') {
    const d = typeof v === 'string' ? tshirtOffset(v) : null;
    if (d === null) fail(`scaleNames: "${v}" is not a t-shirt size`);
    return d;
  }
  if (s.kind === 'roman') {
    const n = typeof v === 'number' ? v : fromRoman(v.toLowerCase()) ?? stepValue(v);
    if (!Number.isInteger(n) || n < 1 || n > 3999) fail(`scaleNames: "${v}" is not a Roman numeral from i to mmmcmxcix`);
    return n;
  }
  if (s.kind === 'ordinal') {
    const n = typeof v === 'number' ? v : stepValue(v);
    if (!Number.isInteger(n)) fail(`scaleNames: ordinal ${what} must be an integer, got "${v}"`);
    return n;
  }
  return asNumber(v, what);
}

/** The name at an integer position of an open-ended or list vocabulary. */
function nameOf(s: AnyScheme, p: number): string {
  if (s.kind === 'list') return s.names[p];
  if (s.kind === 'tshirt') return tshirtAt(p);
  if (s.kind === 'roman') {
    if (p < 1 || p > 3999) fail(`scaleNames: "roman" goes from 1 to 3999, position ${p} was asked for`);
    return toRoman(p);
  }
  return stepName(clean(p));
}

/** start — consecutive steps up from `from`. */
function startNames(count: number, s: AnyScheme, o: ScaleNamesOptions, fill: boolean): string[] {
  if (s.kind === 'list') {
    const first = o.from === undefined ? 0 : positionIn(s, o.from, 'from');
    const step = o.step ?? 1;
    const last = first + (count - 1) * step;
    if (last > s.names.length - 1) {
      if (fill && first === 0 && step === 1 && s.names.length > 1) return fillGaps(s.names, count);
      fail(`scaleNames: "${s.name}" has ${s.names.length} names, ${count} were asked for` +
        (first || step !== 1 ? ` from "${s.names[first]}" in steps of ${step}` : ''));
    }
    return Array.from({ length: count }, (_, i) => s.names[first + i * step]);
  }
  // Counting in steps starts at the first step: step 10 → 10, 20, 30.
  const step = o.step ?? (s.kind === 'range' ? s.steps[0] : 1);
  const first = o.from !== undefined ? positionIn(s, o.from, 'from')
    : s.kind === 'tshirt' ? -2
    : s.kind === 'roman' ? 1
    : step;
  if (s.kind === 'roman' && first + (count - 1) * step > 3999) {
    fail(`scaleNames: "roman" goes up to 3999, ${count} values were asked for`);
  }
  return Array.from({ length: count }, (_, i) => nameOf(s, first + i * step));
}

/** base — the centre (or a chosen name) on value `base`, consecutive steps
 *  both ways. */
function centredNames(count: number, s: AnyScheme, o: ScaleNamesOptions, base: number, name?: string): string[] {
  let centre: number;
  if (name !== undefined) centre = positionIn(s, name, 'base');
  else if (s.kind === 'list') centre = s.centre >= 0 ? s.centre : Math.floor((s.names.length - 1) / 2);
  else if (s.kind === 'roman') fail('scaleNames: "roman" has no centre (no zero); give the base a name with [index, name], e.g. base: [2, "v"]');
  else centre = 0;
  const step = o.step ?? (s.kind === 'range' ? s.steps[0] : 1);
  if (s.kind === 'list') {
    const below = Math.floor(centre / step), above = Math.floor((s.names.length - 1 - centre) / step);
    if (base > below || count - 1 - base > above) {
      fail(`scaleNames: "${s.name}" has ${below} below "${s.names[centre]}" and ${above} above` +
        `${step !== 1 ? ` in steps of ${step}` : ''}; ${base} below and ${count - 1 - base} above were asked for`);
    }
  }
  return Array.from({ length: count }, (_, i) => nameOf(s, centre + (i - base) * step));
}

/** range — both ends fixed, the values spread evenly between them; with a
 *  pinned name each side spreads to its own end. */
function spreadNames(
  count: number, s: AnyScheme, o: ScaleNamesOptions,
  pair: readonly [number, string] | null, isDefault: boolean, fill: boolean,
): string[] {
  if (s.kind === 'range') {
    const ends = rangeEnds(s, o);
    return pair ? rangeNamesAround(count, s, ends, pair[0], pair[1], fill) : rangeNames(count, s, ends, fill);
  }

  // Lists, and open-ended vocabularies between explicit ends, are spread as
  // a list of the names from `from` to `to`.
  let names: readonly string[];
  if (s.kind === 'list') {
    const lo = o.from === undefined ? 0 : positionIn(s, o.from, 'from');
    const hi = o.to === undefined ? s.names.length - 1 : positionIn(s, o.to, 'to');
    if (!(lo < hi)) fail(`scaleNames: "from" must come before "to" in the "${s.name}" scheme`);
    names = s.names.slice(lo, hi + 1);
  } else {
    if (o.from === undefined || o.to === undefined) {
      fail(`scaleNames: the range strategy on "${s.name}" needs from and to, e.g. { from: ${
        s.kind === 'tshirt' ? "'xs', to: '2xl'" : s.kind === 'roman' ? "1, to: 20" : '1, to: 100'} }`);
    }
    const lo = positionIn(s, o.from, 'from'), hi = positionIn(s, o.to, 'to');
    if (!(lo < hi)) fail('scaleNames: "from" must be less than "to"');
    if (hi - lo > 100_000) fail('scaleNames: from … to spans too many names');
    names = Array.from({ length: hi - lo + 1 }, (_, i) => nameOf(s, lo + i));
  }

  // The scheme's own centre stays on its value by default (intensity & co).
  const pin = pair
    ?? (isDefault && s.kind === 'list' && s.pinCentre ? [proportionalBase(count, s), s.names[s.centre]] as const : null);
  if (pin) return pinnedSpread(count, names, s.name, pin[0], pin[1], fill);

  const last = names.length - 1;
  if (count > names.length) {
    if (fill && names.length > 1) return fillGaps(names, count);
    fail(`scaleNames: "${s.name}" has ${names.length} names${o.from !== undefined || o.to !== undefined ? ' between from and to' : ''}, ${count} were asked for`);
  }
  if (count === 1) return [names[roundTowards(last / 2, last / 2)]];
  return Array.from({ length: count }, (_, i) => names[roundTowards((i * last) / (count - 1), last / 2)]);
}

/** Where a list's centre name lands by default: in proportion to the list,
 *  an exact .5 leaning to the larger side. */
function proportionalBase(count: number, s: List): number {
  return Math.ceil(((count - 1) * s.centre) / (s.names.length - 1) - 0.5);
}

/** `name` on value `base`; each side keeps its outermost name and spreads
 *  evenly towards the base, or fills its gaps when it runs out. */
function pinnedSpread(count: number, names: readonly string[], scheme: string, base: number, name: string, fill: boolean): string[] {
  const at = names.indexOf(name);
  if (at < 0) fail(`scaleNames: "${name}" is not a name of the "${scheme}" scheme${names.length ? '' : ''}`);
  const below = base, above = count - 1 - base;
  const haveBelow = at, haveAbove = names.length - 1 - at;
  const fits = (need: number, have: number) => need <= have || (fill && have > 0);
  if (!fits(below, haveBelow) || !fits(above, haveAbove)) {
    fail(`scaleNames: "${scheme}" has ${haveBelow} below "${name}" and ${haveAbove} above; ` +
      `${below} below and ${above} above were asked for`);
  }
  const lower = below <= haveBelow
    ? spread(below, haveBelow).map((p) => names[at - p]).reverse()
    : fillGaps(names.slice(0, at + 1), below + 1).slice(0, -1);
  const upper = above <= haveAbove
    ? spread(above, haveAbove).map((p) => names[at + p])
    : fillGaps(names.slice(at), above + 1).slice(1);
  return [...lower, names[at], ...upper];
}

/** A number as a key: `62.5` → `62_5`, `-0.5` → `-0_5`. */
const stepName = (v: number) => String(Object.is(v, -0) ? 0 : v).replace('.', '_');

/** A key as a number, or NaN: `62_5` → 62.5, `-1` → -1. */
const stepValue = (name: string) => (/^-?\d+(?:_\d+)?$/.test(name) ? Number(name.replace('_', '.')) : NaN);

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;

interface Ends { from: number; to: number }

function rangeEnds(s: Range, o: ScaleNamesOptions): Ends {
  const from = o.from === undefined ? s.from : asNumber(o.from, 'from');
  const to = o.to === undefined ? s.to : asNumber(o.to, 'to');
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
    case 'value':
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
  if (exact !== null || s.kind === 'ordinal' || s.kind === 'value' || s.kind === 'range') return exact;
  const m = /^(.+)_(\d+)$/.exec(name);
  if (!m) return null;
  const whole = exactPosition(m[1], s);
  return whole === null ? null : whole + Number(`0.${m[2]}`);
}

/** The name at a position. `upper` keeps Roman names in capitals. */
function nameAt(p: number, s: AnyScheme, upper = false): string {
  if (s.kind === 'ordinal' || s.kind === 'value' || s.kind === 'range') return stepName(p);
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

