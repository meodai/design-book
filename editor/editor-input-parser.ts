import {
  color, ref, px, rem, ms, dimension, string,
  bestContrastWith, minContrastWith, colorMix,
  lighten, darken, relativeTo,
  closestColor, furthestFrom, averageColor,
  spacingScale, typographyScale, timing,
} from '../src/index';
import type { AnyTokenValue, DesignBook, Scope } from '../src/index';
import { parse } from 'culori';

/**
 * Parse a user-entered value string into a token value.
 *
 * Supports:
 *   #ff0000 or any CSS color         -> hex(value)
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

  // ref('scope.token') or ref("scope.token")
  const refMatch = trimmed.match(/^ref\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (refMatch) {
    return ref(refMatch[1]);
  }

  // px(number)
  const pxMatch = trimmed.match(/^px\(\s*([\d.]+)\s*\)$/);
  if (pxMatch) {
    return px(parseFloat(pxMatch[1]));
  }

  // rem(number)
  const remMatch = trimmed.match(/^rem\(\s*([\d.]+)\s*\)$/);
  if (remMatch) {
    return rem(parseFloat(remMatch[1]));
  }

  // ms(number)
  const msMatch = trimmed.match(/^ms\(\s*([\d.]+)\s*\)$/);
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
  }

  throw new Error(`Unknown value: ${trimmed}. Wrap colors in color(), dimensions in px()/rem()/ms()/dimension(), strings in string().`);
}

// --- Argument parsing helpers ---

/** Split top-level arguments respecting nested parens and quotes */
function splitArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inQuote: string | null = null;
  let current = '';

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];

    if (inQuote) {
      current += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }

    if (ch === "'" || ch === '"') {
      inQuote = ch;
      current += ch;
    } else if (ch === '(') {
      depth++;
      current += ch;
    } else if (ch === ')') {
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
): { type: 'ref'; value: AnyTokenValue } | { type: 'hex'; value: AnyTokenValue } | { type: 'scope'; value: Scope } | { type: 'raw'; value: string | number } {
  const trimmed = arg.trim();

  // ref('...')
  const refMatch = trimmed.match(/^ref\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (refMatch) {
    return { type: 'ref', value: ref(refMatch[1]) };
  }

  // color('...') or hex('...')
  const colorMatch = trimmed.match(/^(?:color|hex)\(\s*['"]?([^'")\s]+)['"]?\s*\)$/);
  if (colorMatch) {
    return { type: 'hex', value: color(colorMatch[1]) };
  }

  // px(number), rem(number), ms(number)
  const dimMatch = trimmed.match(/^(px|rem|ms)\(\s*([\d.]+)\s*\)$/);
  if (dimMatch) {
    const unit = dimMatch[1];
    const val = parseFloat(dimMatch[2]);
    if (unit === 'px') return { type: 'hex', value: px(val) };
    if (unit === 'rem') return { type: 'hex', value: rem(val) };
    if (unit === 'ms') return { type: 'hex', value: ms(val) };
  }

  // dimension(number, 'unit')
  const dimensionMatch = trimmed.match(/^dimension\(\s*([\d.]+)\s*,\s*['"]([^'"]+)['"]\s*\)$/);
  if (dimensionMatch) {
    return { type: 'hex', value: dimension(parseFloat(dimensionMatch[1]), dimensionMatch[2]) };
  }

  // string('...')
  const stringMatch = trimmed.match(/^string\(\s*['"]([^'"]*)['"]\s*\)$/);
  if (stringMatch) {
    return { type: 'hex', value: string(stringMatch[1]) };
  }

  // #hex color (bare, inside function args)
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return { type: 'hex', value: color(trimmed) };
  }

  // CSS named color or scope name
  if (/^[a-z]/i.test(trimmed) && book) {
    // Check scope first
    const scope = book.getScope(trimmed);
    if (scope) return { type: 'scope', value: scope };
    // Then try as CSS named color
    if (parse(trimmed)) {
      return { type: 'hex', value: color(trimmed) };
    }
  }

  // Scope name (without book having named colors)
  if (book) {
    const scope = book.getScope(trimmed);
    if (scope) return { type: 'scope', value: scope };
  }

  // Number
  if (/^[\d.]+$/.test(trimmed)) {
    return { type: 'raw', value: parseFloat(trimmed) };
  }

  // String (could be a color space name like 'oklch')
  return { type: 'raw', value: trimmed };
}

function getTokenArg(parsed: ReturnType<typeof parseArg>): AnyTokenValue {
  if (parsed.type === 'ref' || parsed.type === 'hex') return parsed.value;
  throw new Error(`Expected token argument, got ${parsed.type}`);
}

function getScopeArg(parsed: ReturnType<typeof parseArg>): Scope {
  if (parsed.type === 'scope') return parsed.value;
  throw new Error(`Expected scope name (e.g. "brand"), got "${parsed.type === 'hex' ? 'color' : parsed.type}"`);
}

// --- Function parsers ---

type FuncParser = (argsStr: string, book?: DesignBook, currentScope?: Scope) => AnyTokenValue;

const FUNCTION_PARSERS: Record<string, FuncParser> = {
  // bestContrastWith(target, scope)
  bestContrastWith(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('bestContrastWith requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return bestContrastWith(target, scope);
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

  // relativeTo(color, colorSpace, modifications, options?)
  relativeTo(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('relativeTo requires at least 1 argument');
    const color = getTokenArg(parseArg(args[0], book));
    // Default: oklch, [null, null, null]
    let colorSpace = 'oklch';
    let modifications: (null | number | string)[] = [null, null, null];
    if (args.length > 1) {
      if (/^[a-z]+$/i.test(args[1].trim())) {
        colorSpace = args[1].trim();
      }
      // TODO: parse modifications from text if needed
    }
    return relativeTo(color, colorSpace, modifications);
  },

  // closestColor(target, scope)
  closestColor(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 2) throw new Error('closestColor requires 2 arguments');
    const target = getTokenArg(parseArg(args[0], book));
    const scope = getScopeArg(parseArg(args[1], book));
    return closestColor(target, scope);
  },

  // furthestFrom(scope)
  furthestFrom(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('furthestFrom requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return furthestFrom(scope);
  },

  // averageColor(scope, options?)
  averageColor(argsStr, book, currentScope) {
    const args = splitArgs(argsStr);
    if (args.length < 1) throw new Error('averageColor requires 1 argument');
    const scope = getScopeArg(parseArg(args[0], book));
    return averageColor(scope);
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

  // color('...') as an explicit constructor
  color(argsStr) {
    const match = argsStr.trim().match(/^['"]([^'"]+)['"]$/);
    if (match) return color(match[1]);
    return color(argsStr.trim());
  },

  // hex('...') as deprecated alias for color
  hex(argsStr) {
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
    const match = argsStr.trim().match(/^['"]([^'"]+)['"]$/);
    if (match) return string(match[1]);
    return string(argsStr.trim());
  },
};

/** Try to parse a simple options-like string: { ratio: 0.5, step: 3 } or just key=value pairs */
function parseOptionsArg(str: string): Record<string, any> | undefined {
  const trimmed = str.trim();
  if (!trimmed) return undefined;

  // Try JSON-like: { ratio: 0.5 } — fix unquoted keys
  const jsonLike = trimmed.replace(/^\{?\s*/, '{').replace(/\s*\}?$/, '}');
  const withQuotedKeys = jsonLike.replace(/(\w+)\s*:/g, '"$1":');
  try {
    return JSON.parse(withQuotedKeys);
  } catch {
    // ignore
  }

  return undefined;
}
