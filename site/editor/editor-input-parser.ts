import {
  color, ref, inherited, source, refersTo, px, rem, ms, dimension, string,
  bestContrastWith, minContrastWith, colorMix,
  lighten, darken, shade, relativeTo, withAlpha, ramp,
  closest, nextLighter, nextDarker, furthestFrom, mostVivid, leastVivid,
  lightest, darkest, largest, smallest,
  spacingScale, typographyScale, timing,
  nextLarger, nextSmaller,
  nth, random, sibling,
  typography,
} from '../../src/index';
import type { AnyTokenValue, DesignBook, RandomOptions, ReferenceValue, Scope } from '../../src/index';
import { isScopePath } from '../../src/internals';
import { parse } from 'culori';

/**
 * Parse a user-entered value string into a token value.
 *
 * Supports:
 *   #ff0000 or any CSS color         -> color(value)
 *   ref('scope.token')               -> ref('scope.token')
 *   ref('scope'), ref('.')           -> a scope, where a function takes one
 *   inherited(ref('.x'), 2 | 'root') -> the reference, further up the extends chain
 *   source(ref('.x'), 2 | 'root')    -> the token it refers to, along its references
 *   refersTo(ref('.x'))              -> the pool members that refer to it
 *   px(16), rem(1.5), ms(200)        -> dimension tokens
 *   bestContrastWith(arg, scope)      -> function tokens
 *   colorMix(arg1, arg2, ...)        -> function tokens
 *   ... and all other built-in functions
 *
 * When book/scope are provided, function calls can resolve scope names
 * and build proper FunctionTokenValues. Without them, function calls
 * are recognized as valid syntax but cannot be constructed.
 */
export function parseTokenInput(
  input: string,
  book?: DesignBook,
  currentScope?: Scope,
): AnyTokenValue {
  const trimmed = input.trim();

  // ref('scope', { … }) and inherited(ref('scope', { … }), n?): the scope
  // with some members changed.
  const changed = parseChangedRef(trimmed, book);
  if (changed) return changed;

  // { member: value, … }: a group of members (nested objects nest).
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return { type: 'group', members: groupMembers(parseFieldObject(trimmed, book, false)) } as AnyTokenValue;
  }

  // A plain value constructor with a trailing `{ description: "..." }`, the
  // form the serializer writes for described tokens: color('#fff', { ... }),
  // ref('a.b', { ... }), px(4, { ... }), dimension(1, 'em', { ... }), …
  const described = parseDescribedConstructor(trimmed, book, currentScope);
  if (described) return described;

  // ref('scope.token'), and the same inside inherited(…) / source(…)
  const reference = parseReference(trimmed);
  if (reference) return reference;

  // px(number)
  const pxMatch = trimmed.match(/^px\(\s*(-?[\d.]+)\s*\)$/);
  if (pxMatch) {
    return px(parseFloat(pxMatch[1]));
  }

  // rem(number)
  const remMatch = trimmed.match(/^rem\(\s*(-?[\d.]+)\s*\)$/);
  if (remMatch) {
    return rem(parseFloat(remMatch[1]));
  }

  // ms(number)
  const msMatch = trimmed.match(/^ms\(\s*(-?[\d.]+)\s*\)$/);
  if (msMatch) {
    return ms(parseFloat(msMatch[1]));
  }

  // Function calls: functionName(args...)
  const funcMatch = trimmed.match(/^(\w+)\((.+)\)$/s);
  if (funcMatch) {
    const funcName = funcMatch[1];
    const argsStr = funcMatch[2];

    if (FUNCTION_PARSERS[funcName]) {
      return FUNCTION_PARSERS[funcName](argsStr, book, currentScope);
    }

    // Generic dimension shorthand: <unit>(number), e.g. em(2), vh(50).
    // dimension(n, 'unit') itself is already handled above via
    // FUNCTION_PARSERS.dimension.
    // Only real CSS units qualify, so a mistyped function name such as
    // lightn(0.5) is a parse error instead of a dimension in unit "lightn".
    const genericUnitMatch = argsStr.trim().match(/^-?[\d.]+$/);
    if (genericUnitMatch && isCssUnit(funcName)) {
      return dimension(parseFloat(argsStr.trim()), funcName);
    }
    throw new Error(`Unknown function or unit: ${funcName}()`);
  }

  throw new Error(`Unknown value: ${trimmed}. Wrap colors in color(), dimensions in px()/rem()/ms()/dimension(), strings in string().`);
}

// --- CSS units accepted by the `<unit>(n)` shorthand ---

/** CSS units (lengths, angles, times, frequencies, resolutions, flex).
 *  Anything else written as `name(n)` is a parse error. The explicit
 *  dimension(n, 'unit') form still accepts any unit. */
const CSS_UNITS = new Set([
  // absolute lengths
  'px', 'cm', 'mm', 'q', 'in', 'pt', 'pc',
  // font-relative lengths
  'em', 'rem', 'ex', 'rex', 'ch', 'rch', 'cap', 'rcap', 'ic', 'ric', 'lh', 'rlh',
  // viewport lengths
  'vw', 'vh', 'vi', 'vb', 'vmin', 'vmax',
  'svw', 'svh', 'svi', 'svb', 'svmin', 'svmax',
  'lvw', 'lvh', 'lvi', 'lvb', 'lvmin', 'lvmax',
  'dvw', 'dvh', 'dvi', 'dvb', 'dvmin', 'dvmax',
  // container query lengths
  'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax',
  // angles, times, frequencies, resolutions, flex
  'deg', 'grad', 'rad', 'turn',
  's', 'ms',
  'hz', 'khz',
  'dpi', 'dpcm', 'dppx', 'x',
  'fr',
]);

function isCssUnit(name: string): boolean {
  return CSS_UNITS.has(name.toLowerCase());
}

// --- Described plain tokens ---

/** Constructors whose call takes a trailing `{ description }` object. */
const PLAIN_CONSTRUCTORS = new Set(['color', 'ref', 'px', 'rem', 'ms', 'dimension', 'string']);

function parseDescribedConstructor(
  trimmed: string,
  book?: DesignBook,
  currentScope?: Scope,
): AnyTokenValue | undefined {
  const m = trimmed.match(/^(\w+)\((.+)\)$/s);
  if (!m || !PLAIN_CONSTRUCTORS.has(m[1])) return undefined;
  const args = splitArgs(m[2]);
  const last = args[args.length - 1];
  if (args.length < 2 || !last.startsWith('{')) return undefined;

  let description: string | undefined;
  for (const [key, valueStr] of optionPairs(last)) {
    if (key !== 'description') {
      throw new Error(`${m[1]}: unknown option \`${key}\` (only \`description\` is allowed)`);
    }
    description = parseQuotedString(valueStr);
  }
  const token = parseTokenInput(`${m[1]}(${args.slice(0, -1).join(', ')})`, book, currentScope);
  if (description !== undefined) token.description = description;
  return token;
}

/** Split `{ a: 1, b: 'x' }` into `[key, rawValue]` pairs; a pair without a
 *  colon is an error rather than something to skip silently. */
function optionPairs(objStr: string): Array<[string, string]> {
  const inner = objStr.trim().replace(/^\{|\}$/g, '').trim();
  if (!inner) return [];
  return splitArgs(inner).map((pair) => {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) throw new Error(`Expected \`key: value\` in options, got "${pair}"`);
    const key = pair.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
    return [key, pair.slice(colonIdx + 1).trim()];
  });
}

/** A quoted string literal: "..." is read as JSON (so escapes round-trip
 *  with JSON.stringify), '...' verbatim. */
function parseQuotedString(valueStr: string): string {
  const v = valueStr.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

// --- Argument parsing helpers ---

/** Split top-level arguments respecting nested parens, brackets, braces and quotes */
function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let current = '';

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];

    if (inQuote) {
      current += ch;
      if (ch === '\\' && i + 1 < argsStr.length) {
        current += argsStr[++i];
      } else if (ch === inQuote) {
        inQuote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      inQuote = ch;
      current += ch;
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

/** `ref('path')`, or one wrapped in `inherited(…, n | 'root')` /
 *  `source(…, n | 'root')` / `refersTo(…)`; `undefined` for anything else. */
function parseReference(text: string): ReferenceValue | undefined {
  const trimmed = text.trim();
  const plain = trimmed.match(/^ref\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (plain) return ref(plain[1]);
  const down = trimmed.match(/^refersTo\(\s*(.+?)\s*\)$/s);
  if (down) {
    const inner = parseReference(down[1]);
    return inner ? refersTo(inner) : undefined;
  }
  const wrapped = trimmed.match(/^(inherited|source)\(\s*(.+?)\s*(?:,\s*(\d+|['"]root['"])\s*)?\)$/s);
  if (wrapped) {
    const inner = parseReference(wrapped[2]);
    if (!inner) return undefined;
    const distance = wrapped[3] === undefined ? 1 : /root/.test(wrapped[3]) ? 'root' as const : Number(wrapped[3]);
    return wrapped[1] === 'inherited' ? inherited(inner, distance) : source(inner, distance);
  }
  return undefined;
}

/** Parse a single argument — could be ref(), color(), px(), a scope name, a number, or a string */
function parseArg(
  arg: string,
  book?: DesignBook,
): { type: 'ref'; value: ReferenceValue } | { type: 'token'; value: AnyTokenValue } | { type: 'scope'; value: ReferenceValue } | { type: 'raw'; value: string | number } {
  const trimmed = arg.trim();

  // ref('...'), inherited(ref('...')), source(ref('...'))
  const reference = parseReference(trimmed);
  if (reference) {
    return isScopePath(reference.key) ? { type: 'scope', value: reference } : { type: 'ref', value: reference };
  }

  // color('...') — matching-quote form first, so values containing spaces,
  // commas or parens (rgb(0, 0, 0), hsl(200 50% 50%)) parse correctly.
  const colorQuotedMatch = trimmed.match(/^color\(\s*(['"])(.*)\1\s*\)$/);
  if (colorQuotedMatch) {
    return { type: 'token', value: color(colorQuotedMatch[2]) };
  }

  // color(...) — bare/unquoted form (e.g. color(#fff), color(red))
  const colorMatch = trimmed.match(/^color\(\s*['"]?([^'")\s]+)['"]?\s*\)$/);
  if (colorMatch) {
    return { type: 'token', value: color(colorMatch[1]) };
  }

  // px(number), rem(number), ms(number)
  const dimMatch = trimmed.match(/^(px|rem|ms)\(\s*(-?[\d.]+)\s*\)$/);
  if (dimMatch) {
    const unit = dimMatch[1];
    const val = parseFloat(dimMatch[2]);
    if (unit === 'px') return { type: 'token', value: px(val) };
    if (unit === 'rem') return { type: 'token', value: rem(val) };
    if (unit === 'ms') return { type: 'token', value: ms(val) };
  }

  // dimension(number, 'unit')
  const dimensionMatch = trimmed.match(/^dimension\(\s*(-?[\d.]+)\s*,\s*['"]([^'"]+)['"]\s*\)$/);
  if (dimensionMatch) {
    return { type: 'token', value: dimension(parseFloat(dimensionMatch[1]), dimensionMatch[2]) };
  }

  // Generic dimension shorthand: <unit>(number), e.g. em(2), vh(50) —
  // for units without a dedicated constructor. px/rem/ms above take
  // precedence, and dimension(...) is handled explicitly too.
  const genericUnitMatch = trimmed.match(/^([a-zA-Z]+)\(\s*(-?[\d.]+)\s*\)$/);
  if (genericUnitMatch && isCssUnit(genericUnitMatch[1]) && !['px', 'rem', 'ms'].includes(genericUnitMatch[1])) {
    return { type: 'token', value: dimension(parseFloat(genericUnitMatch[2]), genericUnitMatch[1]) };
  }

  // string('...') — matching-quote regex, backreferenced so an embedded
  // opposite quote (string("it's")) still matches, and allowing empty
  // content (string('')).
  const stringMatch = trimmed.match(/^string\(\s*(['"])(.*)\1\s*\)$/);
  if (stringMatch) {
    return { type: 'token', value: string(stringMatch[2]) };
  }

  // Nested function call: name(...) where name is a known function, e.g.
  // spacingScale(lighten(ref('brand.primary'), { amount: 0.3 })). Recurse
  // into parseTokenInput so nested calls build proper FunctionTokenValues.
  const nestedFuncMatch = trimmed.match(/^(\w+)\((.+)\)$/s);
  if (nestedFuncMatch && FUNCTION_PARSERS[nestedFuncMatch[1]]) {
    return { type: 'token', value: parseTokenInput(trimmed, book) };
  }

  // #hex color (bare, inside function args)
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return { type: 'token', value: color(trimmed) };
  }

  // CSS named color or scope name. A bare scope name is a shorthand the
  // editor accepts for ref('name'); it is always written back as ref('name').
  if (/^[a-z]/i.test(trimmed) && book) {
    // Check scope first
    if (book.getScope(trimmed)) return { type: 'scope', value: ref(trimmed) };
    // Then try as CSS named color
    if (parse(trimmed)) {
      return { type: 'token', value: color(trimmed) };
    }
  }

  // Scope name (without book having named colors)
  if (book && book.getScope(trimmed)) return { type: 'scope', value: ref(trimmed) };

  // Number — signed, so a hand-typed `nth(brand, -1)` reads as an index
  // rather than falling through to the string branch.
  if (/^[+-]?[\d.]+$/.test(trimmed)) {
    return { type: 'raw', value: parseFloat(trimmed) };
  }

  // String (could be a color space name like 'oklch')
  return { type: 'raw', value: trimmed };
}

function getTokenArg(parsed: ReturnType<typeof parseArg>): AnyTokenValue {
  if (parsed.type === 'ref' || parsed.type === 'token') return parsed.value;
  if (parsed.type === 'scope') throw new Error(`Expected a value, got the scope ref('${parsed.value.key}')`);
  throw new Error(`Expected token argument, got ${parsed.type}`);
}

/** A pool: a scope, or any reference — a group's path names one too. */
function getScopeArg(parsed: ReturnType<typeof parseArg>): ReferenceValue {
  if (parsed.type === 'scope' || parsed.type === 'ref') return parsed.value;
  throw new Error(`Expected a scope (e.g. ref('brand')), got "${parsed.type === 'token' ? 'token value' : parsed.type}"`);
}

/** An object literal of typography fields: `{ name: value, … }`. A value is
 *  a token or ref (as in any argument), a quoted string, a number, or — for
 *  the changes in `ref('…', { … })` — `null` to leave a member out. */
function parseFieldObject(str: string, book: DesignBook | undefined, allowNull: boolean): Record<string, any> {
  const body = str.trim().replace(/^\{/, '').replace(/\}$/, '');
  const fields: Record<string, any> = {};
  for (const entry of splitArgs(body)) {
    const colon = entry.indexOf(':');
    if (colon === -1) throw new Error(`Expected "name: value", got "${entry}"`);
    const name = entry.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
    const value = entry.slice(colon + 1).trim();
    if (value === 'null') {
      if (!allowNull) throw new Error(`Field "${name}" needs a value`);
      fields[name] = null;
    } else if (value.startsWith('{') && value.endsWith('}')) {
      fields[name] = { type: 'group', members: groupMembers(parseFieldObject(value, book, allowNull)) };
    } else if (/^(['"]).*\1$/s.test(value)) {
      fields[name] = parseQuotedString(value);
    } else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) {
      fields[name] = parseFloat(value);
    } else {
      fields[name] = getTokenArg(parseArg(value, book));
    }
  }
  return fields;
}

/** `ref('scope', { … })`, possibly inside `inherited(…, n?)`, or undefined. */
function parseChangedRef(text: string, book?: DesignBook): AnyTokenValue | undefined {
  const wrapped = text.match(/^inherited\(\s*(ref\(.+\))\s*(?:,\s*(\d+|['"]root['"])\s*)?\)$/s);
  const inner = wrapped ? wrapped[1] : text;
  const call = inner.match(/^ref\(([\s\S]*)\)$/);
  if (!call) return undefined;
  const args = splitArgs(call[1]);
  if (args.length !== 2 || !args[1].trim().startsWith('{')) return undefined;
  const key = parseQuotedString(args[0].trim());
  const group = ref(key, groupMembers(parseFieldObject(args[1], book, true)) as never);
  if (!wrapped) return group as AnyTokenValue;
  const levels = wrapped[2] === undefined ? 1 : /root/.test(wrapped[2]) ? 'root' as const : Number(wrapped[2]);
  return inherited(group, levels) as AnyTokenValue;
}

/** Members as a group takes them: a quoted string is a string token, a bare
 *  number a unitless dimension (as `typography` reads them), the rest as
 *  parsed. */
function groupMembers(fields: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [
    name,
    value === null ? null : typeof value === 'number' ? dimension(value, '') : typeof value === 'string' ? string(value) : value,
  ]));
}

// --- Function parsers ---

type FuncParser = (argsStr: string, book?: DesignBook, currentScope?: Scope) => AnyTokenValue;

const FUNCTION_PARSERS: Record<string, FuncParser> = {
  // bestContrastWith(target, scope, options?)
  bestContrastWith(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('bestContrastWith requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return bestContrastWith(target, scope, parseSelectorTail('bestContrastWith', args.slice(2), book));
  },

  // minContrastWith(target, scope, options?)
  minContrastWith(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('minContrastWith requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return minContrastWith(target, scope, parseSelectorTail('minContrastWith', args.slice(2), book));
  },

  // colorMix(color1, color2, options?)
  colorMix(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('colorMix requires 2 arguments');
    const color1 = getTokenArg(parseArg(args[0], book));
    const color2 = getTokenArg(parseArg(args[1], book));
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return colorMix(color1, color2, options);
  },

  // lighten(color, options?)
  lighten(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('lighten requires 1 argument');
    const color = getTokenArg(parseArg(args[0], book));
    const options = args.length > 1 ? parseOptionsArg(args.slice(1).join(',')) : undefined;
    return lighten(color, options);
  },

  // darken(color, options?)
  darken(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('darken requires 1 argument');
    const color = getTokenArg(parseArg(args[0], book));
    const options = args.length > 1 ? parseOptionsArg(args.slice(1).join(',')) : undefined;
    return darken(color, options);
  },

  // shade(color, options?)
  shade(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('shade requires 1 argument');
    const color = getTokenArg(parseArg(args[0], book));
    const options = args.length > 1 ? parseOptionsArg(args.slice(1).join(',')) : undefined;
    return shade(color, options);
  },

  // withAlpha(color, alpha, { description }?)
  withAlpha(argsStr, book) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('withAlpha requires a color and an alpha: withAlpha(ref(\'brand.ink\'), 0.5)');
    const color = getTokenArg(parseArg(args[0], book));
    const alpha = parseArg(args[1], book);
    if (alpha.type !== 'raw' || typeof alpha.value !== 'number') {
      throw new Error('withAlpha: the alpha is a number between 0 and 1');
    }
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) as { description?: string } : undefined;
    return withAlpha(color, alpha.value, options);
  },

  // typography({ fontFamily: ref('fonts.sans'), fontSize: rem(2), lineHeight: 1.5 }, { description }?)
  typography(argsStr, book) {
    const args = splitArgs(argsStr);
    if (args.length < 1 || !args[0].startsWith('{')) {
      throw new Error("typography requires an object of fields: typography({ fontSize: rem(2) })");
    }
    const fields = parseFieldObject(args[0], book, false) as Record<string, any>;
    const description = args.length > 1 ? parseOptionsArg(args.slice(1).join(','))?.description : undefined;
    return typography(fields, description ? { description } : undefined);
  },


  // ramp(seed, { shade: '500' })
  ramp(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error("ramp requires a seed and a { shade: '...' } option");
    const seed = getTokenArg(parseArg(args[0], book));
    const options = parseOptionsArg(args.slice(1).join(','));
    if (!options || typeof (options as any).shade !== 'string') {
      throw new Error("ramp requires a { shade: '...' } option");
    }
    return ramp(seed, options as { shade: string });
  },

  // relativeTo(color, colorSpace, modifications) — positional form, or
  // relativeTo(color, { colorSpace, modifications }) — the options-object
  // form the serializer emits (fn.options is { colorSpace, modifications }).
  relativeTo(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('relativeTo requires at least 1 argument');
    const colorArg = getTokenArg(parseArg(args[0], book));

    // Defaults match the relativeTo() constructor's own defaults.
    let colorSpace = 'oklch';
    let modifications: (null | number | string)[] = [null, null, null];

    if (args.length === 2 && args[1].trim().startsWith('{')) {
      const options = parseOptionsArg(args[1]) as
        | { colorSpace?: string; modifications?: (null | number | string)[] }
        | undefined;
      if (options?.colorSpace) colorSpace = options.colorSpace;
      if (options?.modifications) modifications = options.modifications;
    } else if (args.length > 1) {
      const csArg = args[1].trim().replace(/^['"]|['"]$/g, '');
      if (csArg) colorSpace = csArg;
      if (args.length > 2) {
        modifications = parseModificationsArray(args[2]);
      }
    }

    return relativeTo(colorArg, colorSpace, modifications);
  },

  // closestColor(target, scope, readableOn?, options?)
  // closest(target, scope, readableOn?, options?) and its direction aliases
  closest(argsStr, book) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('closest requires 2 arguments: a target and a scope');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return closest(target, scope, parseSelectorTail('closest', args.slice(2), book));
  },
  nextLarger: aliasParser('nextLarger', nextLarger),
  nextSmaller: aliasParser('nextSmaller', nextSmaller),
  nextLighter: aliasParser('nextLighter', nextLighter),
  nextDarker: aliasParser('nextDarker', nextDarker),
  // largest(scope, options?) / smallest(scope, options?)
  largest(argsStr, book) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('largest requires a scope');
    return largest(getScopeArg(parseArg(args[0], book)), parseSelectorTail('largest', args.slice(1), book) as any);
  },
  smallest(argsStr, book) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('smallest requires a scope');
    return smallest(getScopeArg(parseArg(args[0], book)), parseSelectorTail('smallest', args.slice(1), book) as any);
  },

  // furthestFrom(target, scope, readableOn?, options?)
  furthestFrom(argsStr, book) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('furthestFrom requires 2 arguments: a target and a scope');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return furthestFrom(target, scope, parseSelectorTail('furthestFrom', args.slice(2), book));
  },

  // lightest(scope, readableOn?, options?) / darkest(scope, readableOn?, options?)
  lightest(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('lightest requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return lightest(scope, parseSelectorTail('lightest', args.slice(1), book));
  },

  darkest(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('darkest requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return darkest(scope, parseSelectorTail('darkest', args.slice(1), book));
  },

  // mostVivid(scope, readableOn?, { not?, readableOn?, readableContrast? }) — same
  // tail as every color selector, see parseSelectorTail.
  mostVivid(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('mostVivid requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return mostVivid(scope, parseSelectorTail('mostVivid', args.slice(1), book));
  },

  leastVivid(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('leastVivid requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return leastVivid(scope, parseSelectorTail('leastVivid', args.slice(1), book));
  },

  // spacingScale(base, options?)
  spacingScale(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('spacingScale requires 1 argument');
    const base = getTokenArg(parseArg(args[0], book));
    const options = args.length > 1 ? parseOptionsArg(args.slice(1).join(',')) : undefined;
    return spacingScale(base, options);
  },

  // typographyScale(base, options?)
  typographyScale(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('typographyScale requires 1 argument');
    const base = getTokenArg(parseArg(args[0], book));
    const options = args.length > 1 ? parseOptionsArg(args.slice(1).join(',')) : undefined;
    return typographyScale(base, options);
  },



  // timing(duration, easing, options?)
  timing(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('timing requires 2 arguments');
    const duration = getTokenArg(parseArg(args[0], book));
    const easing = args[1].trim().replace(/^['"]|['"]$/g, '');
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return timing(duration, easing, options);
  },

  // nth(scope, { index, not }) — the options-object form the serializer
  // emits (fn.args is just [scope]; index/not live in fn.options) — or
  // nth(scope, index, options?) — the positional convenience form.
  nth(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('nth requires 2 arguments: scope and index');
    const scope = getScopeArg(parseArg(args[0], book));

    const secondArg = args[1].trim();
    if (secondArg.startsWith('{')) {
      const options: { index?: number; not?: Array<ReferenceValue | string>; description?: string } = {};
      for (const [key, valueStr] of optionPairs(secondArg)) {
        if (key === 'index') options.index = parseFloat(valueStr);
        else if (key === 'not') options.not = parseNotList(valueStr, book);
        else if (key === 'description') options.description = parseQuotedString(valueStr);
        else throw new Error(`nth: unknown option \`${key}\` (expected index, not or description)`);
      }
      if (typeof options.index !== 'number' || Number.isNaN(options.index)) {
        throw new Error('nth requires a numeric "index" in its options object');
      }
      return nth(scope, options.index, { not: options.not, description: options.description });
    }

    const indexParsed = parseArg(secondArg, book);
    if (indexParsed.type !== 'raw' || typeof indexParsed.value !== 'number') {
      throw new Error('nth requires a numeric index as second argument');
    }
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return nth(scope, indexParsed.value as number, options);
  },

  // sibling(ref('scope.token'), ref('scale')?, steps?, { toward?, wrap?, not? }?)
  sibling(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('sibling requires an anchor: sibling(ref(...), ref(scale)?, steps?, { toward? })');
    const anchor = getTokenArg(parseArg(args[0], book));
    // The scale and the step count are optional (the anchor's own scope, 1);
    // the options object may follow the anchor directly.
    let rest = args.slice(1);
    let scale: ReferenceValue | undefined;
    if (rest.length > 0) {
      const first = parseArg(rest[0], book);
      if (first.type === 'scope') {
        scale = first.value;
        rest = rest.slice(1);
      }
    }
    let steps = 1;
    if (rest.length > 0 && !rest[0].trim().startsWith('{')) {
      const offsetParsed = parseArg(rest[0], book);
      if (offsetParsed.type !== 'raw' || typeof offsetParsed.value !== 'number') {
        throw new Error('sibling: the step count must be a number');
      }
      steps = offsetParsed.value;
      rest = rest.slice(1);
    }

    const options: { toward?: ReferenceValue; wrap?: boolean; not?: Array<ReferenceValue | string>; description?: string } = {};
    for (const [key, valueStr] of optionPairs(rest.join(','))) {
      if (key === 'toward') {
        const target = parseReference(valueStr);
        if (!target) throw new Error("sibling: `toward` must be a ref(...), e.g. toward: ref('.surface')");
        options.toward = target;
      } else if (key === 'wrap') options.wrap = valueStr === 'true';
      else if (key === 'not') options.not = parseNotList(valueStr, book);
      else if (key === 'description') options.description = parseQuotedString(valueStr);
      else throw new Error(`sibling: unknown option \`${key}\` (expected toward, wrap, not or description)`);
    }
    return scale
      ? sibling(anchor as ReferenceValue, scale, steps, options)
      : sibling(anchor as ReferenceValue, steps, options);
  },

  // random(scope, { type, seed?, not? })
  random(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('random requires 2 arguments: scope and an options object with a "type"');
    const scope = getScopeArg(parseArg(args[0], book));
    const options: Partial<RandomOptions> = {};
    for (const [key, valueStr] of optionPairs(args.slice(1).join(','))) {
      const v = valueStr.trim();
      if (key === 'type') options.type = parseQuotedString(v) as RandomOptions['type'];
      else if (key === 'seed') options.seed = /^['"]/.test(v) ? parseQuotedString(v) : parseFloat(v);
      else if (key === 'not') options.not = parseNotList(v, book);
      else if (key === 'description') options.description = parseQuotedString(v);
      else throw new Error(`random: unknown option \`${key}\` (expected type, seed, not or description)`);
    }
    if (typeof options.type !== 'string') {
      throw new Error('random requires an options object with a "type" (e.g. { type: "color" })');
    }
    return random(scope, options as RandomOptions);
  },

  // color('...') as an explicit constructor
  color(argsStr) {
    const match = argsStr.trim().match(/^['"]([^'"]+)['"]$/);
    if (match) return color(match[1]);
    return color(argsStr.trim());
  },

  // dimension(number, 'unit')
  dimension(argsStr) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('dimension requires 2 arguments: value and unit');
    const value = parseFloat(args[0].trim());
    const unit = args[1].trim().replace(/^['"]|['"]$/g, '');
    return dimension(value, unit);
  },

  // string('...')
  string(argsStr) {
    // Matching-quote regex: backreferences the opening quote (so a value
    // containing the other quote character, e.g. "it's", still matches)
    // and allows zero-length content (so string('') parses to "").
    const match = argsStr.trim().match(/^(['"])(.*)\1$/);
    if (match) return string(match[2]);
    return string(argsStr.trim());
  },
};

/** Function names the input column accepts (value constructors excluded),
 *  read off the parser table so autocomplete cannot drift from it. */
export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTION_PARSERS)
  .filter((name) => !PLAIN_CONSTRUCTORS.has(name));

/** Functions that take a scope argument — autocomplete offers scope names
 *  inside their calls. Kept beside the parser table; every entry must be
 *  one of its keys. */
export const SCOPE_ARG_FUNCTIONS: ReadonlySet<string> = new Set([
  'bestContrastWith', 'minContrastWith', 'closest', 'furthestFrom',
  'mostVivid', 'leastVivid', 'lightest', 'darkest', 'largest', 'smallest',
  'nextLarger', 'nextSmaller', 'nextLighter', 'nextDarker', 'nth', 'random',
]);
for (const name of SCOPE_ARG_FUNCTIONS) {
  if (!FUNCTION_PARSERS[name]) throw new Error(`SCOPE_ARG_FUNCTIONS: no parser for "${name}"`);
}

/**
 * Parse a simple options-like string: `{ ratio: 0.5, step: 3 }`. Normalises
 * a few hand-written forms that aren't valid JSON — unquoted keys, single
 * quotes, and leading-dot numbers like `.5` — before parsing. Throws with a
 * clear message if the result still isn't parseable, rather than silently
 * falling back to the caller's defaults.
 */
/** Parser for a direction alias of `closest`: `nextLarger(target, scope, readableOn?, options?)`. */
function aliasParser(
  name: string,
  make: (target: AnyTokenValue, pool: ReferenceValue, options?: any) => AnyTokenValue,
): (argsStr: string, book?: DesignBook) => AnyTokenValue {
  return (argsStr, book) => {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error(`${name} requires 2 arguments: a target and a scope`);
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return make(target, scope, parseSelectorTail(name, args.slice(2), book));
  };
}

/**
 * Everything after a selector's fixed arguments: an optional options
 * object. Hand-parsed rather than through parseOptionsArg because `not`,
 * `readableOn` and `upTo` may hold `ref(...)` calls, which are not JSON.
 */
function parseSelectorTail(
  name: string,
  rest: string[],
  book?: DesignBook,
): SelectorTailOptions | undefined {
  if (rest.length === 0) return undefined;

  const options: SelectorTailOptions = {};
  const tail = rest.map((a) => a.trim());
  // At most one options object may follow — anything else is a typo that
  // would otherwise be dropped silently.
  if (tail.length > 1 || (tail.length === 1 && !(tail[0].startsWith('{') && tail[0].endsWith('}')))) {
    throw new Error(`${name}: unexpected extra argument "${tail.join(', ')}"`);
  }

  for (const [key, valueStr] of optionPairs(tail[0] ?? '')) {
    if (key === 'not') {
      options.not = parseNotList(valueStr, book);
    } else if (key === 'readableOn') {
      options.readableOn = getTokenArg(parseArg(valueStr, book));
    } else if (key === 'readableContrast') {
      options.readableContrast = parseFloat(valueStr);
    } else if (key === 'minContrast' && name === 'minContrastWith') {
      options.minContrast = parseFloat(valueStr);
    } else if (key === 'by') {
      options.by = parseQuotedString(valueStr);
    } else if (key === 'minDistance') {
      options.minDistance = parseFloat(valueStr);
    } else if (key === 'lightness' && (name === 'mostVivid' || name === 'leastVivid')) {
      const parts = valueStr.trim().replace(/^\[|\]$/g, '').split(',').map((x) => parseFloat(x));
      options.lightness = parts as [number, number];
    } else if (key === 'maxDistance' && name === 'furthestFrom') {
      options.maxDistance = parseFloat(valueStr);
    } else if (key === 'type') {
      options.type = parseQuotedString(valueStr) as 'color' | 'size' | 'text';
    } else if (key === 'direction') {
      options.direction = parseQuotedString(valueStr) as SelectorTailOptions['direction'];
    } else if (key === 'upTo') {
      options.upTo = getTokenArg(parseArg(valueStr, book));
    } else if (key === 'description') {
      options.description = parseQuotedString(valueStr);
    } else {
      throw new Error(`${name}: unknown option \`${key}\` (expected not, readableOn, readableContrast${name === 'minContrastWith' ? ', minContrast' : ''} or description)`);
    }
  }
  return options;
}

/** A `not: [...]` list: `ref('scope.token')` calls and quoted key strings. */
function parseNotList(valueStr: string, book?: DesignBook): Array<ReferenceValue | string> {
  const arrStr = valueStr.trim().replace(/^\[|\]$/g, '').trim();
  if (!arrStr) return [];
  return splitArgs(arrStr).map((item) => {
    const trimmed = item.trim();
    const strMatch = trimmed.match(/^['"]([^'"]+)['"]$/);
    if (strMatch) return strMatch[1];
    return getTokenArg(parseArg(trimmed, book)) as ReferenceValue;
  });
}

type SelectorTailOptions = {
  /** The field text styles are measured by. */
  by?: string;
  type?: 'color' | 'size' | 'text';
  minDistance?: number;
  /** furthestFrom only: how far the pick may be. */
  maxDistance?: number;
  /** mostVivid / leastVivid only: an OKLCH lightness band. */
  lightness?: [number, number];
  direction?: 'lighter' | 'darker' | 'larger' | 'smaller';
  upTo?: AnyTokenValue;
  not?: Array<ReferenceValue | string>;
  readableOn?: AnyTokenValue;
  readableContrast?: number;
  /** minContrastWith only: the contrast against the target. */
  minContrast?: number;
  description?: string;
};

function parseOptionsArg(str: string): Record<string, any> | undefined {
  const trimmed = str.trim();
  if (!trimmed) return undefined;

  // Wrap in braces if missing, quote unquoted keys, normalise single-quoted
  // string values to double quotes, and add a leading zero to bare-dot
  // numbers (.5 -> 0.5, -.5 -> -0.5) so JSON.parse can handle them.
  const jsonLike = toJsonLike(trimmed.replace(/^\{?\s*/, '{').replace(/\s*\}?$/, '}'));

  try {
    return JSON.parse(jsonLike);
  } catch (err) {
    throw new Error(`Cannot parse options "${str}": ${(err as Error).message}`);
  }
}

/** Rewrite a hand-written object literal into JSON, leaving the inside of
 *  string literals alone (a description may hold `:` or apostrophes):
 *  quotes bare keys, turns '…' strings into "…", and adds the leading zero
 *  to `.5` / `-.5`. */
function toJsonLike(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (ch === "'") {
      let j = i + 1;
      let content = '';
      while (j < src.length && src[j] !== "'") {
        if (src[j] === '\\' && j + 1 < src.length) {
          content += src[j + 1];
          j += 2;
        } else {
          content += src[j++];
        }
      }
      out += JSON.stringify(content);
      i = j;
    } else if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      const ident = src.slice(i, j);
      let k = j;
      while (k < src.length && /\s/.test(src[k])) k++;
      out += src[k] === ':' ? `"${ident}"` : ident;
      i = j - 1;
    } else if (ch === '.' && /\d/.test(src[i + 1] ?? '') && !/\d/.test(out[out.length - 1] ?? '')) {
      out += '0.';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Parse relativeTo's positional modifications array: `[null, null, '+0.1']`. */
function parseModificationsArray(str: string): (null | number | string)[] {
  const trimmed = str.trim();
  let jsonLike = trimmed.replace(/'([^']*)'/g, '"$1"');
  jsonLike = jsonLike.replace(/([[,\s])(-?)\.(\d)/g, '$1$20.$3');

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLike);
  } catch (err) {
    throw new Error(`Cannot parse modifications "${str}": ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array for modifications, got "${str}"`);
  }
  return parsed as (null | number | string)[];
}
