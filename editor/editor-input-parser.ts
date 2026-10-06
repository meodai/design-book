import {
  color, ref, px, rem, ms, dimension, string,
  bestContrastWith, minContrastWith, colorMix,
  lighten, darken, shade, relativeTo, ramp,
  closestColor, furthestFrom, mostVivid, leastVivid,
  lightest, darkest,
  spacingScale, typographyScale, timing,
  nextLarger, nextSmaller,
  nth, random, sibling,
} from '../src/index';
import type { AnyTokenValue, DesignBook, RandomOptions, ReferenceValue, Scope } from '../src/index';
import { parse } from 'culori';

/**
 * Parse a user-entered value string into a token value.
 *
 * Supports:
 *   #ff0000 or any CSS color         -> color(value)
 *   ref('scope.token')               -> ref('scope.token')
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

  // A plain value constructor with a trailing `{ description: "..." }`, the
  // form the serializer writes for described tokens: color('#fff', { ... }),
  // ref('a.b', { ... }), px(4, { ... }), dimension(1, 'em', { ... }), …
  const described = parseDescribedConstructor(trimmed, book, currentScope);
  if (described) return described;

  // ref('scope.token') or ref("scope.token")
  const refMatch = trimmed.match(/^ref\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (refMatch) {
    return ref(refMatch[1]);
  }

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

/** Parse a single argument — could be ref(), color(), px(), a scope name, a number, or a string */
function parseArg(
  arg: string,
  book?: DesignBook,
): { type: 'ref'; value: AnyTokenValue } | { type: 'token'; value: AnyTokenValue } | { type: 'scope'; value: Scope } | { type: 'raw'; value: string | number } {
  const trimmed = arg.trim();

  // ref('...')
  const refMatch = trimmed.match(/^ref\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (refMatch) {
    return { type: 'ref', value: ref(refMatch[1]) };
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

  // CSS named color or scope name
  if (/^[a-z]/i.test(trimmed) && book) {
    // Check scope first
    const scope = book.getScope(trimmed);
    if (scope) return { type: 'scope', value: scope };
    // Then try as CSS named color
    if (parse(trimmed)) {
      return { type: 'token', value: color(trimmed) };
    }
  }

  // Scope name (without book having named colors)
  if (book) {
    const scope = book.getScope(trimmed);
    if (scope) return { type: 'scope', value: scope };
  }

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
  throw new Error(`Expected token argument, got ${parsed.type}`);
}

function getScopeArg(parsed: ReturnType<typeof parseArg>): Scope {
  if (parsed.type === 'scope') return parsed.value;
  throw new Error(`Expected scope name (e.g. "brand"), got "${parsed.type === 'token' ? 'token value' : parsed.type}"`);
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
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return bestContrastWith(target, scope, options);
  },

  // minContrastWith(target, scope, options?)
  minContrastWith(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('minContrastWith requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return minContrastWith(target, scope, options);
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
  closestColor(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('closestColor requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return closestColor(target, scope, parseSelectorTail('closestColor', args.slice(2), book));
  },

  // furthestFrom(scope, readableOn?, options?)
  furthestFrom(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('furthestFrom requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return furthestFrom(scope, parseSelectorTail('furthestFrom', args.slice(1), book));
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

  // mostVivid(scope, readableOn?, { not?, readableOn?, minContrast? }) — same
  // tail as every colour selector, see parseSelectorTail.
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

  // nextLarger(target, scope, options?)
  nextLarger(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('nextLarger requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return nextLarger(target, scope, options);
  },

  // nextSmaller(target, scope, options?)
  nextSmaller(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('nextSmaller requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    const options = args.length > 2 ? parseOptionsArg(args.slice(2).join(',')) : undefined;
    return nextSmaller(target, scope, options);
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
      const options = parseOptionsArg(secondArg) as
        | { index?: number; not?: string[]; description?: string }
        | undefined;
      if (typeof options?.index !== 'number') {
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

  // sibling(ref('scope.token'), offset, { wrap?, not? }?)
  sibling(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('sibling requires 2 arguments: ref(...) and an offset');
    const anchor = getTokenArg(parseArg(args[0], book));
    const offsetParsed = parseArg(args[1], book);
    if (offsetParsed.type !== 'raw' || typeof offsetParsed.value !== 'number') {
      throw new Error('sibling requires a numeric offset as second argument');
    }

    const options: { wrap?: boolean; not?: Array<ReferenceValue | string>; description?: string } = {};
    for (const [key, valueStr] of optionPairs(args.slice(2).join(','))) {
      if (key === 'wrap') options.wrap = valueStr === 'true';
      else if (key === 'not') options.not = parseNotList(valueStr, book);
      else if (key === 'description') options.description = parseQuotedString(valueStr);
    }
    return sibling(anchor as ReferenceValue, offsetParsed.value as number, options);
  },

  // random(scope, { type, seed?, not? })
  random(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('random requires 2 arguments: scope and an options object with a "type"');
    const scope = getScopeArg(parseArg(args[0], book));
    const options = parseOptionsArg(args.slice(1).join(',')) as RandomOptions | undefined;
    if (!options || typeof options.type !== 'string') {
      throw new Error('random requires an options object with a "type" (e.g. { type: "color" })');
    }
    return random(scope, options);
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

/**
 * Parse a simple options-like string: `{ ratio: 0.5, step: 3 }`. Normalises
 * a few hand-written forms that aren't valid JSON — unquoted keys, single
 * quotes, and leading-dot numbers like `.5` — before parsing. Throws with a
 * clear message if the result still isn't parseable, rather than silently
 * falling back to the caller's defaults.
 */
/**
 * Everything after a colour selector's fixed arguments: an optional
 * positional `readableOn` (what the serializer writes, since the backdrop is
 * stored as a trailing function argument) followed by an optional options
 * object. Hand-parsed rather than through parseOptionsArg because `not` and
 * `readableOn` may hold `ref(...)` calls, which are not JSON.
 */
function parseSelectorTail(
  name: string,
  rest: string[],
  book?: DesignBook,
): SelectorTailOptions | undefined {
  if (rest.length === 0) return undefined;

  const options: SelectorTailOptions = {};
  let optsStr = rest.join(',').trim();
  if (!optsStr.startsWith('{')) {
    options.readableOn = getTokenArg(parseArg(rest[0].trim(), book));
    optsStr = rest.slice(1).join(',').trim();
  }

  for (const pair of splitArgs(optsStr.replace(/^\{|\}$/g, '').trim())) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim().replace(/^['"]|['"]$/g, '');
    const valueStr = pair.slice(colonIdx + 1).trim();

    if (key === 'not') {
      options.not = parseNotList(valueStr, book);
    } else if (key === 'readableOn') {
      options.readableOn = getTokenArg(parseArg(valueStr, book));
    } else if (key === 'minContrast') {
      options.minContrast = parseFloat(valueStr);
    } else if (key === 'description') {
      options.description = parseQuotedString(valueStr);
    } else if (key === 'against') {
      throw new Error(`${name}: \`against\` was renamed to \`readableOn\``);
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
  not?: Array<ReferenceValue | string>;
  readableOn?: AnyTokenValue;
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
