import { DesignBook } from '../design-book';
import { isFunctionTokenValue, isReferenceValue, isTokenValue } from '../tokens';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue, FunctionArg } from '../tokens';
import { registerBuiltinFunctionRenderers, argToCssValue } from './function-renderers';
import { isTypographyToken, typographyBase, typographyFieldNames } from '../functions/non-color/typography';
import { parse, formatHex, converter } from 'culori';
import { gamutMapSrgb } from '../functions/color/scope-colors';
import { DIMENSION_VALUE_PATTERN, detectValueType } from '../scope';
import type { Scope } from '../scope';

export type RenderFormat = 'css-variables' | 'json' | 'w3-design-tokens';
export type FunctionRendererOptions = Record<string, unknown>;
export type FunctionRenderer = (args: FunctionArg[], options?: FunctionRendererOptions) => string;

export interface RendererOptions {
  /** Prefix added in front of the CSS class emitted for each typography
   *  token. Defaults to an empty string, so `type.heading` renders as
   *  `.type-heading { … }`. */
  classPrefix?: string;
  /** css-variables: the rule the declarations go into (default `:root`) —
   *  `.inverted`, `[data-theme=dark]`, a brand class. */
  selector?: string;
  /** css-variables: wrap the output in `@media <media> { … }`. */
  media?: string;
  /** css-variables: breakpoint names a scope's `metadata.media` can use,
   *  name → media query. A scope with a `media` renders in its own
   *  `@media` block; blocks follow this table's order, then raw queries in
   *  scope order. */
  breakpoints?: Readonly<Record<string, string>>;
  /** css-variables / json: only these scopes. */
  scopes?: readonly string[];
  /** css-variables / json: only what differs from another book — the way a
   *  variation (built as its own book) is written as overrides. CSS compares
   *  the rendered declaration, so `var()` references that follow on their
   *  own are skipped and recomputed values are kept; JSON compares
   *  resolved values. */
  changedFrom?: DesignBook;
}

interface CssDeclaration { prop: string; value: string }

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

/** Media types a scope's `metadata.media` may name without a breakpoint. */
const MEDIA_TYPES = new Set(['all', 'print', 'screen']);

function wrapMedia(media: string, body: string): string {
  return `@media ${media} {\n${body.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n')}\n}`;
}

/** CSS units that make a numeric token a W3 `duration` rather than a
 *  `dimension`. */
const DURATION_UNITS = new Set(['ms', 's']);

/** The only units the W3 `dimension` type allows. Other CSS units (`em`,
 *  `%`, `vw`, …) have no W3 type, so such a token is emitted like a plain
 *  string: its CSS text as `$value` and no `$type`. */
const W3_DIMENSION_UNITS = new Set(['px', 'rem']);

/** A parsed dimension W3 can express structurally: a `dimension` (px/rem)
 *  or a `duration` (ms/s). */
function isW3Dimension(dim: W3DimensionValue): boolean {
  return W3_DIMENSION_UNITS.has(dim.unit) || DURATION_UNITS.has(dim.unit);
}

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
  const match = value.trim().match(DIMENSION_VALUE_PATTERN);
  if (!match) return null;
  return { value: parseFloat(match[1]), unit: match[2] };
}

/** Format one sub-property of a W3 `typography` composite, along with the
 *  W3 `$type` it would carry as a standalone token. */
function formatW3TypographyProperty(
  key: string,
  resolved: string,
): { value: string | number | W3DimensionValue; type?: string } {
  if (TYPOGRAPHY_DIMENSION_KEYS.has(key)) {
    const dim = parseDimensionString(resolved);
    return dim && W3_DIMENSION_UNITS.has(dim.unit)
      ? { value: dim, type: 'dimension' }
      : { value: resolved };
  }
  if (TYPOGRAPHY_NUMBER_KEYS.has(key)) {
    const num = Number(resolved);
    const isNum = resolved.trim() !== '' && Number.isFinite(num);
    if (key === 'fontWeight') return { value: isNum ? num : resolved, type: 'fontWeight' };
    return isNum ? { value: num, type: 'number' } : { value: resolved };
  }
  if (key === 'fontFamily') return { value: resolved, type: 'fontFamily' };
  return { value: resolved };
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
  protected options: RendererOptions & { classPrefix: string };
  private functionRenderers: Map<string, FunctionRenderer> = new Map();

  constructor(book: DesignBook, format: RenderFormat = 'css-variables', options?: RendererOptions) {
    this.book = book;
    this.format = format;
    this.options = { ...options, classPrefix: options?.classPrefix ?? '' };
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
        const fields = this.typographyFieldsOf(scope.get(key)!);
        const names = fields
          ? fields.map((field) => [`${varName}-${keyToHyphen(field)}`, `${scope.name}.${key} (${field})`])
          : [[varName, `${scope.name}.${key}`]];
        for (const [name, owner] of names) {
          const owners = seen.get(name);
          if (owners) owners.push(owner);
          else seen.set(name, [owner]);
        }
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

  /** The field names when `token` is a `typography()` token or a ref (chain)
   *  that ends at one; `undefined` otherwise. */
  private typographyFieldsOf(token: AnyTokenValue | undefined): string[] | undefined {
    return typographyFieldNames(this.book, token);
  }

  /** The scopes to render: all, or the `scopes` option (unknown names throw). */
  private scopesToRender() {
    const all = this.book.getAllScopes();
    const wanted = this.options.scopes;
    if (!wanted) return all;
    for (const name of wanted) {
      if (!this.book.getScope(name)) throw new Error(`Renderer: unknown scope "${name}" in the scopes option`);
    }
    return all.filter((scope) => wanted.includes(scope.name));
  }

  /** One `--scope-key: value` declaration per token, in book order. */
  private cssDeclarations(scopes = this.scopesToRender()): CssDeclaration[] {
    const out: CssDeclaration[] = [];
    for (const scope of scopes) {
      for (const key of scope.getAllKeys()) {
        const token = scope.get(key);
        if (!token) continue;

        const prop = `--${keyToHyphen(scope.name)}-${keyToHyphen(key)}`;

        // A typography has no single CSS value: one variable per field. A
        // ref to one points each field at the target's field variable.
        // A variant's inherited fields point at its base's variables.
        const typo = isTypographyToken(token) ? token : undefined;
        if (typo) {
          const own: string[] = typo.options?.fields ?? [];
          const base = typographyBase(typo);
          for (const field of this.typographyFieldsOf(typo) ?? []) {
            const i = own.indexOf(field);
            const value = i === -1
              ? `var(--${keyToHyphen(base!)}-${keyToHyphen(field)})`
              : argToCssValue(this, typo.args[i]);
            out.push({ prop: `${prop}-${keyToHyphen(field)}`, value });
          }
          continue;
        }
        const refFields = token.type === 'reference' ? this.typographyFieldsOf(token) : undefined;
        if (refFields) {
          const target = `--${keyToHyphen((token as ReferenceValue).key)}`;
          for (const field of refFields) {
            out.push({ prop: `${prop}-${keyToHyphen(field)}`, value: `var(${target}-${keyToHyphen(field)})` });
          }
          continue;
        }

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

        out.push({ prop, value });
      }
    }
    return out;
  }

  /** A renderer for another book with this one's function renderers, so
   *  both sides of a `changedFrom` comparison render the same way. */
  private rendererFor(other: DesignBook): Renderer {
    const r = new Renderer(other, this.format, { classPrefix: this.options.classPrefix });
    for (const [name, fn] of this.functionRenderers) r.registerFunctionRenderer(name, fn);
    return r;
  }

  /** The media query a scope's `metadata.media` names: a key of the
   *  `breakpoints` option, a media type, or a query used as is. */
  private scopeMedia(scope: Scope): string | undefined {
    const media = scope.metadata.media;
    if (media === undefined) return undefined;
    if (typeof media !== 'string' || media.trim() === '') {
      throw new Error(`Renderer: scope "${scope.name}" metadata.media must be a non-empty string`);
    }
    const table = this.options.breakpoints;
    if (table && Object.prototype.hasOwnProperty.call(table, media)) return table[media];
    // A bare word that is not a media type reads as a breakpoint name, so a
    // typo throws instead of writing `@media lgg`.
    if (/^[A-Za-z_][\w-]*$/.test(media) && !MEDIA_TYPES.has(media)) {
      throw new Error(`Renderer: unknown breakpoint "${media}" on scope "${scope.name}" — add it to the breakpoints option`);
    }
    return media;
  }

  /** Rendered scopes grouped by media query: no media first, then the
   *  `breakpoints` table's order, then raw queries in scope order. */
  private scopesByMedia(): [string | undefined, Scope[]][] {
    const groups = new Map<string | undefined, Scope[]>([[undefined, []]]);
    for (const scope of this.scopesToRender()) {
      const media = this.scopeMedia(scope);
      if (!groups.has(media)) groups.set(media, []);
      groups.get(media)!.push(scope);
    }
    const tableOrder = Object.values(this.options.breakpoints ?? {});
    const rank = (media: string | undefined) => {
      if (media === undefined) return -1;
      const i = tableOrder.indexOf(media);
      return i === -1 ? tableOrder.length : i;
    };
    return [...groups].sort(([a], [b]) => rank(a) - rank(b));
  }

  private renderCssVariables(): string {
    this.assertNoVarNameCollisions();

    const base = this.options.changedFrom;
    const before = base
      ? new Map(this.rendererFor(base).cssDeclarations().map((d) => [d.prop, d.value]))
      : undefined;

    const groups = this.scopesByMedia();
    const hasMediaGroups = groups.length > 1;
    const sections: string[] = [];

    for (const [media, scopes] of groups) {
      let declarations = this.cssDeclarations(scopes);
      if (before) declarations = declarations.filter((d) => before.get(d.prop) !== d.value);

      const blocks: string[][] = [];
      // The plain `:root` block stays even when empty, as before media
      // groups existed — unless every rendered scope has a media.
      if (declarations.length > 0 || (media === undefined && (scopes.length > 0 || !hasMediaGroups))) {
        blocks.push([
          `${this.options.selector ?? ':root'} {`,
          ...declarations.map((d) => `  ${d.prop}: ${d.value};`),
          '}',
        ]);
      }

      // A class per typography token (or ref to one). Each property points
      // back at its field variable, so a variation (changedFrom) never needs
      // to repeat them.
      if (!base) {
        for (const scope of scopes) {
          for (const key of scope.getAllKeys()) {
            const fields = this.typographyFieldsOf(scope.get(key)!);
            if (!fields) continue;
            const name = `${keyToHyphen(scope.name)}-${keyToHyphen(key)}`;
            blocks.push([
              `.${this.options.classPrefix}${name} {`,
              ...fields.map((field) => `  ${camelToKebab(field)}: var(--${name}-${keyToHyphen(field)});`),
              '}',
            ]);
          }
        }
      }

      if (blocks.length === 0) continue;
      const body = blocks.map((b) => b.join('\n')).join('\n\n');
      sections.push(media === undefined ? body : wrapMedia(media, body));
    }

    const body = sections.join('\n\n');
    return this.options.media ? wrapMedia(this.options.media, body) : body;
  }

  private renderJson(): string {
    return JSON.stringify(this.renderJsonObject(), null, 2);
  }

  renderJsonObject(): ResolvedTokenMap {
    const result: ResolvedTokenMap = {};

    for (const scope of this.scopesToRender()) {
      for (const key of scope.getAllKeys()) {
        const qualifiedKey = `${scope.name}.${key}`;
        result[qualifiedKey] = resolveTokenValue(this.book, scope.name, key);
      }
    }

    const base = this.options.changedFrom;
    if (base) {
      const before = this.rendererFor(base).renderJsonObject();
      for (const key of Object.keys(result)) if (before[key] === result[key]) delete result[key];
    }

    return result;
  }

  private renderW3DesignTokens(): string {
    return JSON.stringify(this.renderW3DesignTokensObject(), null, 2);
  }

  renderW3DesignTokensObject(): W3DesignTokensMap {
    const result: W3DesignTokensMap = {};

    for (const scope of this.book.getAllScopes()) {
      if (!result[scope.name]) {
        result[scope.name] = {};
      }

      for (const key of scope.getAllKeys()) {
        const token = scope.get(key);
        if (!token) continue;

        const resolved = resolveTokenValue(this.book, scope.name, key);
        // A function with no fixed return type (nth, random, sibling) is
        // typed by what it resolved to, so it still gets a W3 type and a
        // structured value instead of `"$type": "unknown"`.
        const declaredType = getTokenType(token, this.book);
        const internalType = declaredType === 'unknown' ? detectValueType(resolved) : declaredType;
        const plain = token.type === 'reference' || token.type === 'function'
          ? undefined
          : token as TokenValue;

        const entry: W3TokenEntry = { $value: '' };
        const typographyTarget = token.type === 'reference'
          ? this.typographyPropertyOf((token as ReferenceValue).key)
          : undefined;

        if (typographyTarget !== undefined) {
          // A typography field only exists inside its composite, so an
          // alias would point at nothing. Emit the resolved field instead.
          const formatted = formatW3TypographyProperty(typographyTarget, resolved);
          entry.$value = formatted.value;
          if (formatted.type) entry.$type = formatted.type;
        } else if (token.type === 'reference') {
          entry.$value = `{${(token as ReferenceValue).key}}`;
        } else if (isTypographyToken(token as unknown)) {
          entry.$value = this.formatW3TypographyToken(`${scope.name}.${key}`, this.typographyFieldsOf(token) ?? []);
        } else if (token.type === 'function' && (token as FunctionTokenValue).name === 'timing') {
          entry.$value = this.formatW3Transition(token as FunctionTokenValue);
        } else {
          entry.$value = this.formatW3Value(internalType, resolved, plain);
        }

        if (typographyTarget === undefined) {
          const w3Type = this.w3TypeFor(internalType, resolved, plain);
          if (w3Type) entry.$type = w3Type;
        }

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
      return W3_DIMENSION_UNITS.has(unit) ? 'dimension' : undefined;
    }

    // W3 has no `string` type. `fontFamily` is only correct when the token
    // says so (via `metadata.w3Type`), so leave `$type` off otherwise.
    if (internalType === 'string') return undefined;

    return internalType; // pass through for custom types
  }

  /** The field name when `qualifiedKey` is `scope.token.field`: a field of
   *  a typography() token only exists inside its composite, and W3 has no
   *  alias syntax for that. */
  private typographyPropertyOf(qualifiedKey: string): string | undefined {
    const dot = qualifiedKey.indexOf('.');
    const fieldDot = dot === -1 ? -1 : qualifiedKey.indexOf('.', dot + 1);
    return fieldDot === -1 ? undefined : qualifiedKey.slice(fieldDot + 1);
  }

  /** Build the W3 `typography` composite from a `typography()` token. */
  private formatW3TypographyToken(qualifiedKey: string, fields: string[]): W3TypographyValue {
    const composite: W3TypographyValue = {};
    for (const field of fields) {
      composite[field] = formatW3TypographyProperty(field, this.book.resolve(`${qualifiedKey}.${field}`)).value;
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
      // `srgb` components must lie in [0, 1], so a wide-gamut color is
      // gamut-mapped (chroma reduction in OKLCH) before its channels are
      // read; the hex comes from the same mapped color.
      const parsed = parse(resolvedStr);
      const rgb = parsed ? toRgb(gamutMapSrgb(parsed)) : null;
      if (parsed && rgb) {
        const hex = formatHex(rgb) ?? resolvedStr;
        const component = (c: number | undefined) =>
          Math.round(Math.min(1, Math.max(0, c ?? 0)) * 1000) / 1000;
        return {
          colorSpace: 'srgb',
          components: [component(rgb.r), component(rgb.g), component(rgb.b)],
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
      if (dim.unit === '') return dim.value;
      return isW3Dimension(dim) ? dim : resolvedStr;
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
