import { DesignBook } from '../design-book';
import { evaluateArg, evaluateFunction } from '../evaluate';
import { isFunctionTokenValue, isGroupValue, isReferenceValue, isTokenValue } from '../tokens';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue, FunctionArg } from '../tokens';
import { registerBuiltinFunctionRenderers, argToCssValue } from './function-renderers';
import { FunctionError } from '../errors';
import { parse, formatHex, converter } from 'culori';
import { gamutMapSrgb } from '../functions/color/color-math';
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

/** One custom property: its name, its value, and the key it stands for. */
interface CssDeclaration { prop: string; value: string; owner?: string; unresolved?: string }

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
    return evaluateFunction(this.book, fn).value;
  }

  /** Two different `scope.token` pairs can mangle to the same CSS custom
   *  property name (`a.b-c` and `a-b.c` both become `--a-b-c`; `fontSize`,
   *  `font_size` and `font-size` collide inside one scope). Silently
   *  emitting both means the last declaration wins, so fail loudly instead. */
  private assertNoVarNameCollisions(): void {
    const seen = new Map<string, string[]>();
    for (const { prop, owner } of this.cssDeclarations(this.renderable())) {
      const owners = seen.get(prop);
      if (owners) owners.push(owner ?? prop);
      else seen.set(prop, [owner ?? prop]);
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

  /** The group a key's value is — the key holds one, refers to one or picked
   *  one — or `undefined`. */
  private groupOf(path: string): Scope | undefined {
    try {
      const group = this.book._resolution(path).group;
      return group === undefined ? undefined : this.book.getScope(group);
    } catch {
      return undefined;
    }
  }

  /** A group's members as paths relative to it, nested groups' members
   *  included (`fontSize`, `hover.bg`). */
  private leafMembers(group: Scope, prefix = '', seen: ReadonlySet<string> = new Set()): string[] {
    const out: string[] = [];
    const inside = new Set([...seen, group.name]);
    for (const key of group.getAllKeys()) {
      const nested = this.groupOf(`${group.name}.${key}`);
      if (nested && !inside.has(nested.name)) out.push(...this.leafMembers(nested, `${prefix}${key}.`, inside));
      else if (!nested) out.push(`${prefix}${key}`);
    }
    return out;
  }

  /** The scopes to render: all, or the `scopes` option (unknown names throw). */
  /** The top-level scopes that have output: templates are only
   *  definitions, rendered where they are placed. */
  private renderable(): Scope[] {
    // Groups are written through the keys holding them.
    return this.book.getAllScopes().filter((scope) => !scope.template && scope.holderName === undefined);
  }

  private scopesToRender() {
    const all = this.renderable();
    const wanted = this.options.scopes;
    if (!wanted) return all;
    for (const name of wanted) {
      if (!this.book.getScope(name)) throw new Error(`Renderer: unknown scope "${name}" in the scopes option`);
    }
    return all.filter((scope) => wanted.includes(scope.name));
  }

  /** One `--path: value` declaration per token, in book order: a group's
   *  members at their paths, at any depth. */
  private cssDeclarations(scopes: Scope[] = this.scopesToRender()): CssDeclaration[] {
    const out: CssDeclaration[] = [];
    for (const scope of scopes) this.declareScope(scope, out, new Set([scope.name]));
    return out;
  }

  private declareScope(scope: Scope, out: CssDeclaration[], inside: ReadonlySet<string>): void {
    for (const key of scope.getAllKeys()) {
      const token = scope.get(key);
      if (!token) continue;
      const path = `${scope.name}.${key}`;
      const prop = `--${keyToHyphen(path)}`;

      // A group held here: its members, at their paths.
      if (isGroupValue(token)) {
        const group = this.book.getScope(path);
        if (group && !inside.has(path)) this.declareScope(group, out, new Set([...inside, path]));
        continue;
      }
      // A group referred to or picked: each member points at the original's.
      const group = this.groupOf(path);
      if (group) {
        for (const member of this.leafMembers(group)) {
          out.push({
            prop: `${prop}-${keyToHyphen(member)}`,
            value: `var(--${keyToHyphen(`${group.name}.${member}`)})`,
            owner: `${path}.${member}`,
          });
        }
        continue;
      }

      // Inherited as is: it is the key it comes from, so it points at it.
      const source = scope.getSourceKey(key);
      if (source !== undefined && source !== path && !this.book.isRebound(path)) {
        out.push({ prop, value: `var(--${keyToHyphen(source)})`, owner: path });
        continue;
      }

      let value: string;
      try {
        if (token.type === 'reference') {
          value = `var(--${keyToHyphen((token as ReferenceValue).key)})`;
        } else if (token.type === 'function') {
          const fn = token as FunctionTokenValue;
          const funcRenderer = this.functionRenderers.get(fn.name);
          value = funcRenderer ? funcRenderer(fn.args, fn.options) : resolveTokenValue(this.book, scope.name, key);
        } else {
          value = resolveTokenValue(this.book, scope.name, key);
        }
      } catch (e) {
        // A key that does not resolve here (a group defined to be placed
        // elsewhere, reading a holder it does not have yet) is reported in
        // place rather than aborting the whole output.
        out.push({ prop, value: '', owner: path, unresolved: (e as Error).message });
        continue;
      }
      out.push({ prop, value, owner: path });
    }
  }

  /** A class per text style — held, referred to or picked — each property
   *  pointing back at its member variable, so a variation (`changedFrom`)
   *  never repeats them. */
  private textStyleClasses(scope: Scope, blocks: string[][], inside: ReadonlySet<string>): void {
    for (const key of scope.getAllKeys()) {
      const path = `${scope.name}.${key}`;
      const group = this.groupOf(path);
      if (!group) continue;
      if (group.getKind() === 'typography') {
        const name = keyToHyphen(path);
        blocks.push([
          `.${this.options.classPrefix}${name} {`,
          ...this.leafMembers(group).map((m) => `  ${camelToKebab(m)}: var(--${name}-${keyToHyphen(m)});`),
          '}',
        ]);
      }
      if (isGroupValue(scope.get(key)) && !inside.has(path)) {
        this.textStyleClasses(group, blocks, new Set([...inside, path]));
      }
    }
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
          ...declarations.map((d) => (d.unresolved !== undefined
            ? `  /* ${d.prop}: ${d.unresolved.replace(/\*\//g, '* /')} */`
            : `  ${d.prop}: ${d.value};`)),
          '}',
        ]);
      }

      // A class per typography token (or ref to one). Each property points
      // back at its field variable, so a variation (changedFrom) never needs
      // to repeat them.
      if (!base) {
        for (const scope of scopes) this.textStyleClasses(scope, blocks, new Set([scope.name]));
      }

      if (blocks.length === 0) continue;
      const body = blocks.map((b) => b.join('\n')).join('\n\n');
      sections.push(media === undefined ? body : wrapMedia(media, body));
    }

    const body = sections.join('\n\n');
    return this.options.media ? wrapMedia(this.options.media, body) : body;
  }

  /** Resolved values by key; a group's members at their paths. */
  private jsonScope(scope: Scope, result: ResolvedTokenMap): void {
    for (const key of scope.getAllKeys()) {
      const path = `${scope.name}.${key}`;
      const group = this.groupOf(path);
      if (!group) {
        result[path] = resolveTokenValue(this.book, scope.name, key);
      } else if (isGroupValue(scope.get(key))) {
        this.jsonScope(group, result);
      } else {
        for (const member of this.leafMembers(group)) result[`${path}.${member}`] = this.book.resolve(`${group.name}.${member}`);
      }
    }
  }

  private renderJson(): string {
    return JSON.stringify(this.renderJsonObject(), null, 2);
  }

  renderJsonObject(): ResolvedTokenMap {
    const result: ResolvedTokenMap = {};

    for (const scope of this.scopesToRender()) this.jsonScope(scope, result);

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
    for (const scope of this.renderable()) {
      result[scope.name] = this.w3Scope(scope, new Set([scope.name]));
    }
    return result;
  }

  /** A scope as a W3 group: its tokens, and its groups nested — a text
   *  style as the native `typography` composite. */
  private w3Scope(scope: Scope, inside: ReadonlySet<string>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const key of scope.getAllKeys()) {
      const token = scope.get(key);
      if (!token) continue;
      const path = `${scope.name}.${key}`;
      const group = this.groupOf(path);
      if (group) {
        out[key] = isGroupValue(token)
          ? this.w3Group(path, group, token.description, inside)
          : this.w3GroupAlias(group);
        continue;
      }
      out[key] = this.w3Token(scope, key, token);
    }
    return out;
  }

  /** A group held at `path`: a text style as a composite token, any other
   *  group as a nested W3 group. */
  private w3Group(path: string, group: Scope, description: string | undefined, inside: ReadonlySet<string>): Record<string, any> {
    const entry = group.getKind() === 'typography'
      ? { $type: 'typography', $value: this.w3TextStyle(path, group) }
      : inside.has(path) ? {} : this.w3Scope(group, new Set([...inside, path]));
    return description ? { ...entry, $description: description } : entry;
  }

  /** A group referred to or picked: a text style is a composite token, and a
   *  composite may be aliased; any other group has no alias in W3, so each
   *  member aliases the original's. */
  private w3GroupAlias(group: Scope): Record<string, any> {
    if (group.getKind() === 'typography') return { $type: 'typography', $value: `{${group.name}}` };
    const out: Record<string, any> = {};
    for (const key of group.getAllKeys()) {
      const nested = this.groupOf(`${group.name}.${key}`);
      out[key] = nested ? this.w3GroupAlias(nested) : { $value: `{${group.name}.${key}}` };
    }
    return out;
  }

  /** The W3 `typography` composite of a text style: its members resolved. */
  private w3TextStyle(path: string, group: Scope): W3TypographyValue {
    const composite: W3TypographyValue = {};
    for (const member of this.leafMembers(group)) {
      composite[member] = formatW3TypographyProperty(member, this.book.resolve(`${path}.${member}`)).value;
    }
    return composite;
  }

  /** One token entry. */
  private w3Token(scope: Scope, key: string, token: AnyTokenValue): W3TokenEntry {
    const resolved = resolveTokenValue(this.book, scope.name, key);
    // A function with no fixed return type (nth, random, sibling) is typed
    // by what it resolved to, so it still gets a W3 type and a structured
    // value instead of `"$type": "unknown"`.
    const declaredType = getTokenType(token, this.book);
    const internalType = declaredType === 'unknown' ? detectValueType(resolved) : declaredType;
    const plain = token.type === 'reference' || token.type === 'function' ? undefined : token as TokenValue;

    const entry: W3TokenEntry = { $value: '' };
    // A member of a text style only exists inside its composite, so an
    // alias would point at nothing: the resolved member, typed by its name.
    const textStyleMember = token.type === 'reference' ? this.textStyleMemberOf((token as ReferenceValue).key) : undefined;

    if (textStyleMember !== undefined) {
      const formatted = formatW3TypographyProperty(textStyleMember, resolved);
      entry.$value = formatted.value;
      if (formatted.type) entry.$type = formatted.type;
    } else if (token.type === 'reference') {
      entry.$value = `{${(token as ReferenceValue).key}}`;
    } else if (token.type === 'function' && (token as FunctionTokenValue).name === 'timing') {
      entry.$value = this.formatW3Transition(token as FunctionTokenValue);
    } else {
      entry.$value = this.formatW3Value(internalType, resolved, plain);
    }

    if (textStyleMember === undefined) {
      const w3Type = this.w3TypeFor(internalType, resolved, plain);
      if (w3Type) entry.$type = w3Type;
    }
    if (token.description) entry.$description = token.description;
    return entry;
  }

  /** The member's name when `path` is a member of a text style. */
  private textStyleMemberOf(path: string): string | undefined {
    const dot = path.lastIndexOf('.');
    if (dot === -1) return undefined;
    const owner = this.book.getScope(path.slice(0, dot)) ?? this.groupOf(path.slice(0, dot));
    return owner?.getKind() === 'typography' ? path.slice(dot + 1) : undefined;
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

  /** Build the W3 `transition` composite from a `timing()` token. The
   *  duration and delay come from the call rather than the joined
   *  shorthand, which is ambiguous once the easing contains spaces. */
  private formatW3Transition(fn: FunctionTokenValue): W3TransitionValue {
    const durationArg = fn.args[0];
    const durationStr = durationArg === undefined
      ? ''
      : String(evaluateArg(this.book, durationArg));
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
}
