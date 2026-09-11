import { DesignBook } from '../design-book';
import { isFunctionTokenValue, isReferenceValue, isTokenValue } from '../tokens';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue, FunctionArg } from '../tokens';
import { registerBuiltinFunctionRenderers } from './function-renderers';
import { parse, formatHex, converter } from 'culori';

export type RenderFormat = 'css-variables' | 'json' | 'w3-design-tokens';
export type FunctionRendererOptions = Record<string, unknown>;
export type FunctionRenderer = (args: FunctionArg[], options?: FunctionRendererOptions) => string;

export interface RendererOptions {
  /** Prefix added in front of CSS class names emitted for typography
   *  (or other composed) scopes. Defaults to an empty string, so a
   *  `heading-lg` scope renders as `.heading-lg { … }`. */
  classPrefix?: string;
}

export interface W3ColorValue {
  colorSpace: string;
  components: number[];
  alpha: number;
  hex: string;
}

export interface W3DimensionValue {
  value: number;
  unit: string;
}

export interface W3TransitionValue {
  duration: W3DimensionValue;
  delay: W3DimensionValue;
  timingFunction: number[] | string;
}

export type W3TypographyValue = Record<string, string | number | W3DimensionValue>;

export type W3TokenValue =
  | string
  | number
  | W3ColorValue
  | W3DimensionValue
  | W3TransitionValue
  | W3TypographyValue;

export interface W3TokenEntry {
  $value: W3TokenValue;
  $type?: string;
  $description?: string;
}

export type ResolvedTokenMap = Record<string, string>;
export type W3DesignTokensMap = Record<string, Record<string, W3TokenEntry>>;

const toRgb = converter('rgb');

/** CSS units that make a numeric token a W3 `duration` rather than a
 *  `dimension`. */
const DURATION_UNITS = new Set(['ms', 's']);

/** The five CSS easing keywords, as the cubic-bezier control points the W3
 *  `transition` composite expects for its `timingFunction`. */
const CSS_EASING_KEYWORDS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** Sub-properties of the W3 `typography` composite that carry a dimension
 *  and a plain number respectively; anything else stays a string. */
const TYPOGRAPHY_DIMENSION_KEYS = new Set(['fontSize', 'letterSpacing']);
const TYPOGRAPHY_NUMBER_KEYS = new Set(['fontWeight', 'lineHeight']);

/** Split a resolved value such as `16px`, `-0.02em`, `200ms` or `1.5` into
 *  its number and its (possibly empty) unit. */
function parseDimensionString(value: string): W3DimensionValue | null {
  const match = value.trim().match(/^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i);
  if (!match) return null;
  return { value: parseFloat(match[1]), unit: match[2] };
}

function toCubicBezier(easing: string): number[] | string {
  const trimmed = easing.trim();
  const keyword = CSS_EASING_KEYWORDS[trimmed];
  if (keyword) return [...keyword];
  const match = trimmed.match(/^cubic-bezier\(([^)]*)\)$/);
  if (match) {
    const points = match[1].split(',').map((part) => Number(part.trim()));
    if (points.length === 4 && points.every((n) => Number.isFinite(n))) return points;
  }
  return trimmed;
}

/** Normalise a token key for use in CSS identifiers. Replaces `.` and
 *  `_` with `-`, splits camelCase boundaries (`fontFamily` →
 *  `font-family`), and lowercases the result. */
export function keyToHyphen(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[._]/g, '-')
    .toLowerCase();
}

/** Alias for keyToHyphen — readability when emitting CSS property names
 *  (where the camelCase → kebab conversion is the main point). */
const camelToKebab = keyToHyphen;

function resolveTokenValue(book: DesignBook, scopeName: string, tokenName: string): string {
  return book.resolve(`${scopeName}.${tokenName}`);
}

function getTokenType(token: AnyTokenValue, book: DesignBook): string {
  if (token.type === 'reference') {
    const ref = token as ReferenceValue;
    const resolved = book.getTokenByKey(ref.key);
    if (resolved) return getTokenType(resolved, book);
    return 'unknown';
  }
  if (token.type === 'function') {
    const fn = token as FunctionTokenValue;
    return fn.metadata?.returnType ?? 'unknown';
  }
  return (token as TokenValue).type;
}

export class Renderer {
  protected book: DesignBook;
  protected format: RenderFormat;
  protected options: Required<RendererOptions>;
  private functionRenderers: Map<string, FunctionRenderer> = new Map();

  constructor(book: DesignBook, format: RenderFormat = 'css-variables', options?: RendererOptions) {
    this.book = book;
    this.format = format;
    this.options = {
      classPrefix: options?.classPrefix ?? '',
    };
    registerBuiltinFunctionRenderers(this);
  }

  render(): string {
    switch (this.format) {
      case 'css-variables':
        return this.renderCssVariables();
      case 'json':
        return this.renderJson();
      case 'w3-design-tokens':
        return this.renderW3DesignTokens();
      default:
        throw new Error(`Unknown render format: ${this.format}`);
    }
  }

  registerFunctionRenderer(name: string, renderer: FunctionRenderer): void {
    this.functionRenderers.set(name, renderer);
  }

  /** Render a function token to a CSS expression. Nested function tokens
   *  reach this through `argToCssValue`, so a `darken(lighten(…))` nests
   *  its `color-mix()` calls instead of stringifying to `[object Object]`.
   *  Functions with no registered renderer fall back to their resolved
   *  value, which is the only thing CSS can express for them. */
  renderFunctionToken(fn: FunctionTokenValue): string {
    const funcRenderer = this.functionRenderers.get(fn.name);
    if (funcRenderer) return funcRenderer(fn.args, fn.options);
    return this.resolveFunctionToken(fn);
  }

  /** Evaluate a function token through the book's function registry.
   *  Inline (nested) function tokens have no scope entry of their own, so
   *  they can't go through `book.resolve`; this mirrors what
   *  `Scope.resolveFunctionToken` does for named ones. */
  private resolveFunctionToken(fn: FunctionTokenValue): string {
    const resolvedArgs = fn.args.map((arg: FunctionArg) => this.resolveFunctionArg(arg));
    const implementation = this.book.getFunction(fn.name);
    if (!implementation) {
      throw new Error(`Function "${fn.name}" is not registered`);
    }
    return implementation(...resolvedArgs, fn.options);
  }

  /** Two different `scope.token` pairs can mangle to the same CSS custom
   *  property name (`a.b-c` and `a-b.c` both become `--a-b-c`; `fontSize`,
   *  `font_size` and `font-size` collide inside one scope). Silently
   *  emitting both means the last declaration wins, so fail loudly instead. */
  private assertNoVarNameCollisions(): void {
    const seen = new Map<string, string[]>();

    for (const scope of this.book.getAllScopes()) {
      for (const key of scope.getAllKeys()) {
        if (!scope.get(key)) continue;
        const varName = `--${keyToHyphen(scope.name)}-${keyToHyphen(key)}`;
        const owners = seen.get(varName);
        if (owners) owners.push(`${scope.name}.${key}`);
        else seen.set(varName, [`${scope.name}.${key}`]);
      }
    }

    const collisions = [...seen.entries()].filter(([, owners]) => owners.length > 1);
    if (collisions.length === 0) return;

    const detail = collisions
      .map(([varName, owners]) => `${varName} <- ${owners.join(', ')}`)
      .join('; ');
    throw new Error(
      `CSS variable name collision: ${detail}. ` +
      'Rename the tokens or scopes so each maps to a unique custom property.'
    );
  }

  private renderCssVariables(): string {
    this.assertNoVarNameCollisions();

    const lines: string[] = [':root {'];

    for (const scope of this.book.getAllScopes()) {
      for (const key of scope.getAllKeys()) {
        const token = scope.get(key);
        if (!token) continue;

        const cssPropName = `--${keyToHyphen(scope.name)}-${keyToHyphen(key)}`;
        let value: string;

        if (token.type === 'reference') {
          const ref = token as ReferenceValue;
          value = `var(--${keyToHyphen(ref.key)})`;
        } else if (token.type === 'function') {
          const fn = token as FunctionTokenValue;
          const funcRenderer = this.functionRenderers.get(fn.name);
          if (funcRenderer) {
            value = funcRenderer(fn.args, fn.options);
          } else {
            value = resolveTokenValue(this.book, scope.name, key);
          }
        } else {
          value = resolveTokenValue(this.book, scope.name, key);
        }

        lines.push(`  ${cssPropName}: ${value};`);
      }
    }

    lines.push('}');

    // For each composed-as-typography scope, emit a class block that
    // re-aggregates the scope's tokens into CSS properties. Each property
    // points back at the corresponding `--scope-key` custom property.
    for (const scope of this.book.getAllScopes()) {
      if (scope.compose !== 'typography') continue;
      const keys = scope.getAllKeys();
      if (keys.length === 0) continue;

      lines.push('');
      lines.push(`.${this.options.classPrefix}${scope.name} {`);
      for (const key of keys) {
        const cssProp = camelToKebab(key);
        const varName = `--${keyToHyphen(scope.name)}-${keyToHyphen(key)}`;
        lines.push(`  ${cssProp}: var(${varName});`);
      }
      lines.push('}');
    }

    return lines.join('\n');
  }

  private renderJson(): string {
    return JSON.stringify(this.renderJsonObject(), null, 2);
  }

  renderJsonObject(): ResolvedTokenMap {
    const result: ResolvedTokenMap = {};

    for (const scope of this.book.getAllScopes()) {
      for (const key of scope.getAllKeys()) {
        const qualifiedKey = `${scope.name}.${key}`;
        result[qualifiedKey] = resolveTokenValue(this.book, scope.name, key);
      }
    }

    return result;
  }

  private renderW3DesignTokens(): string {
    return JSON.stringify(this.renderW3DesignTokensObject(), null, 2);
  }

  renderW3DesignTokensObject(): W3DesignTokensMap {
    const result: W3DesignTokensMap = {};

    for (const scope of this.book.getAllScopes()) {
      // Typography-composed scopes collapse to a single composite entry
      // under a shared `typography` group, matching the W3 spec example
      // of `typography.heading-1`.
      if (scope.compose === 'typography') {
        if (!result['typography']) {
          result['typography'] = {};
        }
        const entry: W3TokenEntry = {
          $value: this.formatW3Typography(scope.name, scope.getAllKeys()),
          $type: 'typography',
        };
        if (scope.description) entry.$description = scope.description;
        result['typography'][scope.name] = entry;
        continue;
      }

      if (!result[scope.name]) {
        result[scope.name] = {};
      }

      for (const key of scope.getAllKeys()) {
        const token = scope.get(key);
        if (!token) continue;

        const resolved = resolveTokenValue(this.book, scope.name, key);
        const internalType = getTokenType(token, this.book);
        const plain = token.type === 'reference' || token.type === 'function'
          ? undefined
          : token as TokenValue;

        const entry: W3TokenEntry = { $value: '' };

        if (token.type === 'reference') {
          entry.$value = `{${(token as ReferenceValue).key}}`;
        } else if (token.type === 'function' && (token as FunctionTokenValue).name === 'timing') {
          entry.$value = this.formatW3Transition(token as FunctionTokenValue);
        } else {
          entry.$value = this.formatW3Value(internalType, resolved, plain);
        }

        const w3Type = this.w3TypeFor(internalType, resolved, plain);
        if (w3Type) entry.$type = w3Type;

        if (token.description) {
          entry.$description = token.description;
        }

        result[scope.name][key] = entry;
      }
    }

    return result;
  }

  /** Pick the W3 `$type` for a token. The internal type alone is not
   *  enough: `dimension` covers durations (`ms`/`s`) and unitless numbers,
   *  and the unit is only visible on the resolved value once references
   *  and functions are followed. Returns `undefined` where W3 has no type
   *  to name (a plain string), so `$type` can be omitted. */
  private w3TypeFor(
    internalType: string,
    resolved: string,
    token?: TokenValue,
  ): string | undefined {
    const declared = token?.metadata?.w3Type;
    if (typeof declared === 'string') return declared;

    if (internalType === 'color') return 'color';
    if (internalType === 'number') return 'number';
    if (internalType === 'timing') return 'transition';

    if (internalType === 'dimension') {
      const unit = token?.metadata?.unit ?? parseDimensionString(resolved)?.unit;
      if (unit && DURATION_UNITS.has(unit)) return 'duration';
      if (!unit) return 'number';
      return 'dimension';
    }

    // W3 has no `string` type. `fontFamily` is only correct when the token
    // says so (via `metadata.w3Type`), so leave `$type` off otherwise.
    if (internalType === 'string') return undefined;

    return internalType; // pass through for custom types
  }

  /** Build the W3 `typography` composite for a composed scope. */
  private formatW3Typography(scopeName: string, keys: string[]): W3TypographyValue {
    const composite: W3TypographyValue = {};
    for (const key of keys) {
      const resolved = resolveTokenValue(this.book, scopeName, key);
      if (TYPOGRAPHY_DIMENSION_KEYS.has(key)) {
        composite[key] = parseDimensionString(resolved) ?? resolved;
      } else if (TYPOGRAPHY_NUMBER_KEYS.has(key)) {
        const num = Number(resolved);
        composite[key] = resolved.trim() !== '' && Number.isFinite(num) ? num : resolved;
      } else {
        composite[key] = resolved;
      }
    }
    return composite;
  }

  /** Build the W3 `transition` composite from a `timing()` token. The
   *  duration and delay come from the call rather than the joined
   *  shorthand, which is ambiguous once the easing contains spaces. */
  private formatW3Transition(fn: FunctionTokenValue): W3TransitionValue {
    const durationArg = fn.args[0];
    const durationStr = durationArg === undefined
      ? ''
      : String(this.resolveFunctionArg(durationArg));
    const duration = parseDimensionString(durationStr) ?? { value: 0, unit: 'ms' };
    const delay = Number(fn.options?.delay ?? 0);
    const easing = fn.args[1] === undefined ? '' : String(fn.args[1]);
    return {
      duration,
      delay: { value: Number.isFinite(delay) ? delay : 0, unit: 'ms' },
      timingFunction: toCubicBezier(easing),
    };
  }

  /** Format a resolved value into the W3 structured format */
  private formatW3Value(internalType: string, resolvedStr: string, token?: TokenValue): W3TokenValue {
    if (internalType === 'color') {
      // W3 color: { colorSpace, components, alpha, hex }
      const parsed = parse(resolvedStr);
      const rgb = parsed ? toRgb(parsed) : null;
      if (parsed && rgb) {
        const hex = formatHex(rgb) ?? resolvedStr;
        return {
          colorSpace: 'srgb',
          components: [
            Math.round((rgb.r ?? 0) * 1000) / 1000,
            Math.round((rgb.g ?? 0) * 1000) / 1000,
            Math.round((rgb.b ?? 0) * 1000) / 1000,
          ],
          alpha: rgb.alpha ?? 1,
          hex,
        };
      }
      return resolvedStr;
    }

    if (internalType === 'dimension') {
      const dim = token
        ? { value: Number(token.rawValue), unit: token.metadata?.unit ?? '' }
        : parseDimensionString(resolvedStr);
      if (!dim) return resolvedStr;
      // A dimension with no unit is a plain W3 `number`.
      return dim.unit === '' ? dim.value : dim;
    }

    if (internalType === 'number') {
      const num = Number(token ? token.rawValue : resolvedStr);
      return Number.isFinite(num) ? num : resolvedStr;
    }

    if (internalType === 'string') {
      return token ? String(token.rawValue) : resolvedStr;
    }

    return resolvedStr;
  }

  /** Resolve one function argument to the string the implementation would
   *  see. Shared by the CSS fallback path and the W3 transition composite. */
  private resolveFunctionArg(arg: FunctionArg): string | FunctionArg {
    if (isReferenceValue(arg)) return this.book.resolve(arg.key);
    if (isFunctionTokenValue(arg)) return this.resolveFunctionToken(arg);
    if (isTokenValue(arg)) {
      if (arg.metadata?.unit) return `${arg.rawValue}${arg.metadata.unit}`;
      return String(arg.rawValue);
    }
    return arg;
  }
}
