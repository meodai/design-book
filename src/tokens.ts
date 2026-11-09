import { parse } from 'culori';
import { scopeOf } from './keys';

export interface TokenProcessor {
  name: string;
  instance: any;
}

export interface TokenValue {
  type: string;
  rawValue: string | number;
  description?: string;
  metadata?: { unit?: string; colorSpace?: string; validated?: boolean; [key: string]: any };
}

export interface ReferenceValue {
  type: 'reference';
  /** A path: `scope`, `scope.token` or `scope.token.field`; relative to the
   *  reading scope with a leading dot (`.`, `.token`, `.token.field`). */
  key: string;
  /** Read the path this many `extends` levels up, or at the top of the
   *  chain (`inherited`). */
  up?: number | 'root';
  /** Follow the token this path names along its references: this many
   *  hops, or to the token where the value is written (`source`). Only a
   *  member-naming slot reads it: a `sibling` anchor or `toward` target, a
   *  `not` entry. */
  via?: number | 'root';
  /** Name the members of the walked pool whose references lead to this
   *  token (`refersTo`): down the value tree, where `via` goes up. Read
   *  only where `via` is. */
  referredBy?: true;
  description?: string;
}

/** What a function argument may hold. A scope is passed as a reference to
 *  it — `ref('palette')` — so a function token stays plain data. */
export type FunctionArg =
  | TokenValue
  | ReferenceValue
  | FunctionTokenValue
  | string
  | number;

export function isReferenceValue(arg: unknown): arg is ReferenceValue {
  return typeof arg === 'object' && arg !== null && 'type' in arg && (arg as { type?: string }).type === 'reference';
}

export function isTokenValue(arg: unknown): arg is TokenValue {
  return typeof arg === 'object' && arg !== null && 'rawValue' in arg;
}

export function isFunctionTokenValue(arg: unknown): arg is FunctionTokenValue {
  return typeof arg === 'object' && arg !== null && 'type' in arg && (arg as { type?: string }).type === 'function';
}

export interface FunctionTokenValue {
  type: 'function';
  name: string;
  args: FunctionArg[];
  description?: string;
  options?: Record<string, any>;
  metadata?: {
    dependencies: string[];
    returnType?: string;
    /** Scopes the function walks without taking them as a `Scope` argument
     *  — `sibling` finds its scope from the anchor key. Indexed like a scope
     *  argument, so any change to the scope's membership re-resolves it. */
    iteratedScopes?: string[];
    [key: string]: any;
  };
}

export type AnyTokenValue = TokenValue | ReferenceValue | FunctionTokenValue;

const tokenProcessors = new WeakMap<TokenValue, TokenProcessor[]>();

export function val<T>(value: T, options?: { description?: string; [key: string]: any }): T & { description?: string } {
  if (typeof value === 'object' && value !== null && options) {
    return { ...value, ...options };
  }
  return value as T & { description?: string };
}

export function createFunctionToken(
  name: string,
  args: FunctionArg[],
  config?: {
    description?: string;
    options?: Record<string, any>;
    metadata?: FunctionTokenValue['metadata'];
    [key: string]: any;
  }
): FunctionTokenValue {
  const { options, metadata, ...rest } = config ?? {};
  return val(
    {
      type: 'function' as const,
      name,
      args,
      options,
      metadata,
    },
    rest,
  );
}

export function setTokenProcessors(token: TokenValue, processors: TokenProcessor[]): TokenValue {
  tokenProcessors.set(token, processors);
  return token;
}

export function getTokenProcessors(token: TokenValue): TokenProcessor[] | undefined {
  return tokenProcessors.get(token);
}

export function color(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  const parsed = parse(value);
  if (!parsed) {
    throw new Error(`Invalid color: ${value}`);
  }
  const token = val({
    type: 'color',
    rawValue: value,
    metadata: { colorSpace: 'srgb', validated: true },
  }, options);
  return setTokenProcessors(token, [{ name: 'culori', instance: parsed }]);
}

/**
 * A reference: a path into the book. The number of segments says what it
 * names — `ref('brand')` a scope, `ref('brand.primary')` a token,
 * `ref('type.title.fontSize')` one field of a typography. A leading dot makes
 * the path **relative** to the scope that reads it: `ref('.')` is that scope,
 * `ref('.primary')` its `primary`. A token written in `brand` and inherited
 * by `acme extends brand` reads `brand.primary` in `brand` and
 * `acme.primary` in `acme`, so overriding `acme.primary` re-flows through
 * every inherited token that uses it.
 *
 * A token reference is a value; a scope reference is a pool, the argument a
 * selector like `mostVivid(ref('palette'))` searches. Each is only accepted
 * where it fits. Wrap a reference in `inherited` to read it further up the
 * `extends` chain, in `source` to name what it refers to.
 */
export function ref(key: string, options?: { description?: string; [key: string]: any }): ReferenceValue {
  if (typeof key !== 'string' || key === '' || key.startsWith('..')) {
    throw new Error(`Invalid reference "${String(key)}": expected "scope", "scope.token" or a relative ".", ".token"`);
  }
  return val({
    type: 'reference' as const,
    key,
  }, options);
}

/**
 * The same path, read up the **`extends` chain**: what the scope would have
 * inherited, had it not written its own. `inherited(ref('.surface'))` is the
 * parent scope's `surface` (for a relative path, the parent of the scope
 * that reads it); `inherited(ref('.surface'), 2)` two scopes up;
 * `inherited(ref('.surface'), 'root')` the top of the chain (on a scope that
 * extends nothing, the scope itself). `inherited(ref('.'))` is the parent
 * scope, as a pool. Reading past the top of the chain is refused.
 *
 * It is how a scope overrides a key in terms of the value it replaces: a
 * scope cannot read its own `.surface` to work out its own `.surface`.
 * Its counterpart along references is `source`.
 */
export function inherited(reference: ReferenceValue, levels: number | 'root' = 1): ReferenceValue {
  if (!isReferenceValue(reference)) {
    throw new Error('inherited: expects a ref(...)');
  }
  if (levels === 'root') return { ...reference, up: 'root' };
  if (!Number.isInteger(levels) || levels < 1) {
    throw new Error(`inherited: levels must be a whole number of 1 or more, or 'root', got ${String(levels)}`);
  }
  if (reference.up === 'root') return reference;
  return { ...reference, up: (reference.up ?? 0) + levels };
}

/**
 * The token a reference refers to, followed along its **references**:
 * `card.interaction = ref('blue.600')`, so `source(ref('card.interaction'))`
 * names `blue.600`. `source(ref, 2)` follows two references;
 * `source(ref, 'root')` follows them to the token where the value is written
 * (the first one that is not a reference — a color, a size, or a function
 * such as a selector, which is not looked through). Following more
 * references than there are is refused.
 *
 * It names a member, so it is read where a member is named: a `sibling`
 * anchor (`sibling(source(ref('.interaction'), 'root'), -2)` steps along
 * `blue`) or `toward` target, and a `not` entry. As a value, or as a pool, it
 * is refused: write the ref itself. Combined with `inherited`, inheritance is
 * read first: `source(inherited(ref('.x')), 'root')`.
 */
export function source(reference: ReferenceValue, hops: number | 'root' = 1): ReferenceValue {
  if (!isReferenceValue(reference)) {
    throw new Error('source: expects a ref(...)');
  }
  if (isScopeKey(reference.key)) {
    throw new Error(`source: "${reference.key}" is a scope; source follows a token's references`);
  }
  if (reference.referredBy) {
    throw new Error(`source: follow the references first, then come back down: refersTo(source(ref('${reference.key}')))`);
  }
  if (hops === 'root') return { ...reference, via: 'root' };
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(`source: hops must be a whole number of 1 or more, or 'root', got ${String(hops)}`);
  }
  if (reference.via === 'root') return reference;
  return { ...reference, via: (reference.via ?? 0) + hops };
}

/** True for a reference that `source` marked to be followed. */
export function isSourceReference(arg: unknown): arg is ReferenceValue & { via: number | 'root' } {
  return isReferenceValue(arg) && arg.via !== undefined;
}

/**
 * The members that refer to a token, **down** the value tree — `source`'s
 * opposite: with `brand-scale.2000 = ref('brand-base.ink')`,
 * `refersTo(ref('brand-base.ink'))` read against `brand-scale` names
 * `brand-scale.2000`. A member counts when its references lead to the token,
 * directly or through other references (selectors are not looked through).
 *
 * It is read where a member is named, against the scale walked there: a
 * `not` entry leaves out every member it finds; a `sibling` anchor (with the
 * scale named: `sibling(refersTo(ref('brand-base.ink')), ref('brand-scale'),
 * -2)`) and a `toward` target need exactly one. Finding none throws. As a
 * value it is refused. With `source`, the references are followed first:
 * `refersTo(source(ref('.accent'), 'root'))` is every member that ends where
 * the accent's value is written.
 */
export function refersTo(reference: ReferenceValue): ReferenceValue {
  if (!isReferenceValue(reference)) {
    throw new Error('refersTo: expects a ref(...)');
  }
  if (isScopeKey(reference.key)) {
    throw new Error(`refersTo: "${reference.key}" is a scope; refersTo names the members that refer to a token`);
  }
  return reference.referredBy ? reference : { ...reference, referredBy: true };
}

/** True for a reference that `refersTo` marked. */
export function isRefersToReference(arg: unknown): arg is ReferenceValue & { referredBy: true } {
  return isReferenceValue(arg) && arg.referredBy === true;
}

/** A reference that names members (`source` / `refersTo`): stays a
 *  reference until a function reads it against its pool. */
export function isMemberReference(arg: unknown): boolean {
  return isReferenceValue(arg) && (arg.via !== undefined || arg.referredBy === true);
}

/** The stored form of a member-naming reference: key plus its markers. */
export function memberReference(r: ReferenceValue): ReferenceValue {
  return {
    type: 'reference',
    key: r.key,
    ...(r.via !== undefined ? { via: r.via } : {}),
    ...(r.referredBy ? { referredBy: true as const } : {}),
  };
}

export function dimension(value: number, unit: string, options?: { description?: string; [key: string]: any }): TokenValue {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid dimension value: ${value}`);
  }
  return val({ type: 'dimension', rawValue: value, metadata: { unit, validated: true } }, options);
}

export function px(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return dimension(value, 'px', options);
}

export function rem(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return dimension(value, 'rem', options);
}

export function ms(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return dimension(value, 'ms', options);
}

export function string(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  if (typeof value !== 'string') {
    throw new Error(`Expected string, got ${typeof value}`);
  }
  return val({ type: 'string', rawValue: value }, options);
}

/** The `scope.token` part of a key — the token a field key
 *  (`type.title.fontSize`) belongs to; a token key comes back unchanged. */
export function tokenKeyOf(key: string): string {
  const first = key.indexOf('.');
  const second = first === -1 ? -1 : key.indexOf('.', first + 1);
  return second === -1 ? key : key.slice(0, second);
}

/** `scope.token.field`: one field of a typography token. The graph keeps a
 *  node per field, so field refs depend on the field, not the whole token. */
export function isFieldKey(key: string): boolean {
  return key.split('.').length === 3;
}

// --- Paths and binding ---
//
// A reference key is a path: `scope`, `scope.token`, `scope.token.field`.
// A leading dot makes it relative to the scope that reads it (`.`,
// `.token`), and `up` (`inherited`) moves it up the `extends` chain; `via`
// (`source`) is kept as it is and followed where a member is named. Tokens keep both as written — they are shared data, and an
// inherited token is the same object in every scope that inherits it — and
// are *bound* whenever a scope hands them out (`Scope.get`): the bound copy
// holds plain, fully-qualified paths, so resolution, the graph and the
// renderers never see a relative key or a navigation. A
// `metadata.iteratedScopes` entry of `''` (what `sibling` records for a
// relative anchor) is the reading scope.

/** True for a path that names a scope: `brand`, or `.` for the reading scope. */
export function isScopeKey(key: unknown): boolean {
  return typeof key === 'string' && (key === '.' || (key.length > 0 && !key.includes('.')));
}

/** A reference to a scope — a pool argument. */
export function isScopeReference(arg: unknown): arg is ReferenceValue {
  return isReferenceValue(arg) && isScopeKey(arg.key);
}

/** `.`, `.token` or `.token.field` — a path relative to the reading scope. */
export function isRelativeKey(key: unknown): boolean {
  return typeof key === 'string' && (key === '.' || (key.length > 1 && key[0] === '.' && key[1] !== '.'));
}

/** A relative path qualified against `scope`; any other path unchanged. */
export function qualifyKey(key: string, scope: string): string {
  if (key === '.') return scope;
  return isRelativeKey(key) ? `${scope}${key}` : key;
}

/** How a scope's `extends` chain is read while binding. */
export interface BindingContext {
  /** The scope `name` extends, or `undefined` for a root. */
  parentOf(name: string): string | undefined;
  /** Changes whenever scopes are added or removed, so a cached binding of a
   *  navigating reference is never reused across a different chain. */
  version: number;
}

type TokenTraits = { relative: boolean; navigates: boolean };
const tokenTraits = new WeakMap<object, TokenTraits>();

function traitsOf(token: unknown): TokenTraits {
  if (typeof token !== 'object' || token === null) return { relative: false, navigates: false };
  const cached = tokenTraits.get(token);
  if (cached) return cached;
  let traits: TokenTraits = { relative: false, navigates: false };
  const merge = (other: TokenTraits) => {
    traits = { relative: traits.relative || other.relative, navigates: traits.navigates || other.navigates };
  };
  if (isReferenceValue(token)) {
    traits = { relative: isRelativeKey(token.key), navigates: token.up !== undefined };
  } else if (isFunctionTokenValue(token)) {
    const options = token.options ?? {};
    const metadata = token.metadata;
    for (const arg of token.args) merge(traitsOf(arg));
    if (Array.isArray(options.not)) {
      for (const n of options.not) merge(typeof n === 'string' ? { relative: isRelativeKey(n), navigates: false } : traitsOf(n));
    }
    // sibling's anchor and target / a variant's base: a key, or a navigated reference.
    for (const key of [options.from, options.base, options.toward]) {
      if (isReferenceValue(key)) merge(traitsOf(key));
    }
    if (isRelativeKey(options.from)
      || isRelativeKey(options.base)
      || isRelativeKey(options.toward)
      || (metadata?.dependencies ?? []).some(isRelativeKey)
      || (metadata?.iteratedScopes ?? []).includes('')) {
      merge({ relative: true, navigates: false });
    }
  }
  tokenTraits.set(token, traits);
  return traits;
}

/** True when the token (or anything nested in it) holds a relative path —
 *  so what it reads depends on the scope that reads it. */
export function hasRelativeKeys(token: unknown): boolean {
  return traitsOf(token).relative;
}

/** True when the token holds a relative path or an `inherited`
 *  navigation — anything a scope has to bind before it can be read. */
export function needsBinding(token: unknown): boolean {
  const traits = traitsOf(token);
  return traits.relative || traits.navigates;
}

/** A reference whose navigation could not be followed (past the top of the
 *  chain). Resolving it throws `unresolvable`; it adds no graph edge. */
export interface UnresolvableReference extends ReferenceValue {
  unresolvable: string;
}

export function isUnresolvableReference(arg: unknown): arg is UnresolvableReference {
  return isReferenceValue(arg) && typeof (arg as Partial<UnresolvableReference>).unresolvable === 'string';
}

/** Follow `up` from the scope a qualified path starts in. */
function navigate(path: string, up: number | 'root', context: BindingContext): string | { error: string } {
  const dot = path.indexOf('.');
  const start = dot === -1 ? path : path.slice(0, dot);
  const rest = dot === -1 ? '' : path.slice(dot);
  let scope = start;
  if (up === 'root') {
    const seen = new Set<string>();
    for (let parent = context.parentOf(scope); parent !== undefined && !seen.has(parent); parent = context.parentOf(scope)) {
      seen.add(scope);
      scope = parent;
    }
    return scope + rest;
  }
  for (let level = 0; level < up; level++) {
    const parent = context.parentOf(scope);
    if (parent === undefined) {
      return {
        error: level === 0
          ? `"${start}" has no parent: it extends no scope, so inherited(...) cannot read "${path}" there`
          : `"${start}" has only ${level} level${level === 1 ? '' : 's'} above it, so inherited(...) cannot go ${up} up`,
      };
    }
    scope = parent;
  }
  return scope + rest;
}

/** A reference as `scope` reads it: qualified, then navigated. */
function bindReference(reference: ReferenceValue, scope: string, context: BindingContext | undefined): ReferenceValue {
  const qualified = qualifyKey(reference.key, scope);
  const { up, ...plain } = reference;
  if (up === undefined) return { ...plain, key: qualified };
  if (!context) {
    return { ...plain, key: qualified, unresolvable: `"${reference.key}" needs a book to read inherited(...)` } as UnresolvableReference;
  }
  const navigated = navigate(qualified, up, context);
  if (typeof navigated !== 'string') {
    return { ...plain, key: qualified, unresolvable: navigated.error } as UnresolvableReference;
  }
  return { ...plain, key: navigated };
}

const boundTokens = new WeakMap<object, { version: number; byScope: Map<string, unknown> }>();

/** The token as `scope` reads it: relative paths qualified against `scope`
 *  and `inherited` followed through `context`. A token that needs
 *  neither comes back as is; a bound copy is cached, so binding the same
 *  token to the same scope gives the same object until the scopes change. */
export function bindToken<T>(token: T, scope: string, context?: BindingContext): T {
  if (!needsBinding(token)) return token;
  const raw = token as unknown as object;
  const version = traitsOf(token).navigates ? context?.version ?? -1 : 0;
  let cache = boundTokens.get(raw);
  if (!cache || cache.version !== version) {
    cache = { version, byScope: new Map() };
    boundTokens.set(raw, cache);
  }
  const cached = cache.byScope.get(scope);
  if (cached) return cached as T;

  const q = (key: string) => qualifyKey(key, scope);
  let bound: unknown;
  if (isReferenceValue(token)) {
    bound = bindReference(token, scope, context);
  } else {
    const fn = token as unknown as FunctionTokenValue;
    let options = fn.options;
    // Keys a navigated anchor / base lands on: they become the token's
    // dependencies (and, for an anchor, the scope it walks) once known.
    const landed: { from?: string; base?: string; toward?: string } = {};
    if (options) {
      options = { ...options };
      for (const name of ['from', 'base', 'toward'] as const) {
        const key = options[name];
        if (typeof key === 'string') options[name] = q(key);
        else if (isReferenceValue(key)) {
          const bound = bindReference(key, scope, context);
          if (isUnresolvableReference(bound)) options[name] = bound;
          else if (isMemberReference(bound)) {
            // a `source` / `refersTo` anchor: stays a reference, read against
            // the pool when resolved; a `source` one reads its start key (a
            // dependency the constructor already declared, unless
            // `inherited` named it only now)
            options[name] = memberReference(bound);
            if (key.up !== undefined && bound.via !== undefined) landed[name] = bound.key;
          } else {
            options[name] = bound.key;
            landed[name] = bound.key;
          }
        }
      }
      if (Array.isArray(options.not)) {
        options.not = options.not.map((n: unknown) => {
          if (typeof n === 'string') return q(n);
          const r = bindToken(n, scope, context);
          if (isReferenceValue(r) && !isUnresolvableReference(r)) {
            return isMemberReference(r) ? memberReference(r) : r.key;
          }
          return r;
        });
      }
    }
    let metadata = fn.metadata;
    if (metadata) {
      metadata = { ...metadata };
      if (metadata.dependencies) metadata.dependencies = metadata.dependencies.map(q);
      if (metadata.iteratedScopes) metadata.iteratedScopes = metadata.iteratedScopes.map((n) => (n === '' ? scope : n));
      for (const key of [landed.from, landed.base, landed.toward]) {
        if (key === undefined) continue;
        metadata.dependencies = [...(metadata.dependencies ?? []), key];
      }
      // the scope an anchor walks, once it is known; a `source` anchor's is
      // only known when it is followed (the book indexes it then)
      if (landed.from !== undefined && typeof options?.from === 'string') {
        metadata.iteratedScopes = [...(metadata.iteratedScopes ?? []), landed.from.slice(0, landed.from.indexOf('.'))];
      }
    }
    bound = { ...fn, args: fn.args.map((arg) => bindToken(arg, scope, context)), options, metadata };
  }
  cache.byScope.set(scope, bound);
  return bound as T;
}

/** Where a `source` reference sits outside a member-naming slot (a value,
 *  or a value argument of a function), a message saying so; else
 *  `undefined`. `Scope.set` refuses such a token. */
export function misplacedSource(token: unknown): string | undefined {
  if (isRefersToReference(token)) {
    return `refersTo(ref('${token.key}')) names members, for a sibling anchor, a toward target or a not entry; it is not a value`;
  }
  if (isSourceReference(token)) {
    return `source(ref('${token.key}')) names a member, for a sibling anchor, a toward target or a not entry; as a value, write ref('${token.key}')`;
  }
  if (isFunctionTokenValue(token)) {
    for (const arg of token.args) {
      const error = misplacedSource(arg);
      if (error) return error;
    }
  }
  return undefined;
}

/** The first navigation in a bound token that could not be followed, or
 *  `undefined`. `Scope.set` uses it to refuse such a token up front. */
export function unresolvableIn(token: unknown): string | undefined {
  if (isUnresolvableReference(token)) return token.unresolvable;
  if (isFunctionTokenValue(token)) {
    for (const arg of token.args) {
      const error = unresolvableIn(arg);
      if (error) return error;
    }
    for (const n of [...((token.options?.not ?? []) as unknown[]), token.options?.from, token.options?.base, token.options?.toward]) {
      const error = unresolvableIn(n);
      if (error) return error;
    }
  }
  return undefined;
}

/** Keys the args read as values, each listed once in first-seen order. */
export function extractDependencies(args: FunctionArg[]): string[] {
  const deps = new Set<string>();
  for (const arg of args) {
    if (isReferenceValue(arg)) {
      // A scope reference is a pool, read through the selector index — not
      // a value. A navigation that failed reads nothing, and one not yet
      // followed (`inherited` before a scope binds it) names no key yet: the
      // bound argument carries its dependency.
      if (isScopeKey(arg.key) || isUnresolvableReference(arg) || arg.up !== undefined) continue;
      deps.add(arg.key);
    } else if (isFunctionTokenValue(arg)) {
      // Nested function token — its dependencies are transitively this
      // function's dependencies, so the graph propagates correctly. Include
      // the ones it declares outside its args too (`sibling`'s anchor).
      for (const dep of extractDependencies(arg.args)) deps.add(dep);
      for (const dep of arg.metadata?.dependencies ?? []) deps.add(dep);
    }
  }
  return [...deps];
}

/** Every key a function token reads as a value: the references in its args
 *  (nested function tokens included) plus whatever it declares in
 *  `metadata.dependencies` (a key held in options, like `sibling`'s anchor).
 *  A token built with `createFunctionToken` and no metadata still gets the
 *  edges its args imply. Deduplicated, first-seen order. */
export function functionDependencies(fn: FunctionTokenValue): string[] {
  return [...new Set([...extractDependencies(fn.args), ...(fn.metadata?.dependencies ?? []), ...notDependencies(fn)])];
}

/** `not` entries outside the scopes a token iterates are read for their
 *  value: `not: [ref('.text')]` leaves out whichever member `.text` picked,
 *  so the token must follow `.text`. Entries inside an iterated scope are
 *  pool members — the selector index already follows those, and an edge to
 *  one could close a false cycle with a member derived from the token. */
function notDependencies(fn: FunctionTokenValue): string[] {
  const not = fn.options?.not;
  if (!Array.isArray(not) || not.length === 0) return [];
  const iterated = new Set(iteratedScopesOf(fn));
  const deps: string[] = [];
  for (const n of not) {
    // a `source` entry is followed from its start key, so it reads it; a
    // bare `refersTo` reads only the pool, which the selector index covers
    if (isRefersToReference(n) && n.via === undefined) continue;
    if (isSourceReference(n)) {
      if (!isRelativeKey(n.key)) deps.push(tokenKeyOf(n.key));
      continue;
    }
    if (typeof n === 'string' && !isRelativeKey(n) && n.includes('.') && !iterated.has(scopeOf(n))) deps.push(n);
  }
  return deps;
}

/** Normalises a `not` option into an array of fully-qualified token keys.
 *  Accepts strings (already qualified keys) or `ReferenceValue` objects
 *  produced by `ref('scope.token')`. Used by scope-iterating analysis
 *  functions (bestContrastWith, mostVivid, …) to exclude candidates from
 *  the search pool. */
export function normalizeNotKeys(not?: ReadonlyArray<string | ReferenceValue>): Array<string | ReferenceValue> {
  if (!not || not.length === 0) return [];
  // A navigated reference (`inherited(ref('.x'))`) stays a reference until a
  // scope binds it, a `source` one until it is followed; a plain one is
  // stored as its key.
  return not.map((n) => (typeof n === 'string' ? n : n.up !== undefined || isMemberReference(n) ? n : n.key));
}

/** Names of the scopes a function token iterates — the scope arguments of
 *  the call itself plus those of any nested function-token arguments
 *  (including the ones a nested token declares in `metadata.iteratedScopes`).
 *  It does not enumerate the scope's members, so it stays valid as the
 *  scope gains and loses keys: it is what the book indexes selectors by. */
export function extractIteratedScopes(args: FunctionArg[]): string[] {
  const names: string[] = [];
  for (const arg of args) {
    if (isFunctionTokenValue(arg)) {
      for (const name of iteratedScopesOf(arg)) names.push(name);
    } else if (isScopeReference(arg) && !isUnresolvableReference(arg)) {
      // Bound, this is the scope's name; `.` before binding means the reading scope.
      names.push(arg.key === '.' ? '' : arg.key);
    }
  }
  return names;
}

/** Every scope a function token iterates: its scope arguments, nested
 *  tokens' scopes, and the scopes it declares in `metadata.iteratedScopes`. */
export function iteratedScopesOf(fn: FunctionTokenValue): string[] {
  return [...extractIteratedScopes(fn.args), ...(fn.metadata?.iteratedScopes ?? [])];
}

