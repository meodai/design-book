import { parse } from 'culori';

export interface TokenProcessor {
  name: string;
  instance: any;
}

export interface ReferenceResolution {
  resolvedType?: string;
  isResolvable?: boolean;
  lastResolvedAt?: number;
  errorMessage?: string;
}

export interface TokenValue {
  type: string;
  rawValue: string | number;
  description?: string;
  metadata?: { unit?: string; colorSpace?: string; validated?: boolean; [key: string]: any };
}

export interface ReferenceValue {
  type: 'reference';
  key: string;
  description?: string;
}

export interface ScopeFunctionArg {
  name: string;
  getAllKeys(): string[];
}

export type FunctionArg =
  | TokenValue
  | ReferenceValue
  | FunctionTokenValue
  | ScopeFunctionArg
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
    visualDependencies: string[];
    acceptedTypes?: string[][];
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
const referenceResolutions = new WeakMap<ReferenceValue, ReferenceResolution>();

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

export function setReferenceResolution(ref: ReferenceValue, resolution: ReferenceResolution): void {
  referenceResolutions.set(ref, resolution);
}

export function clearReferenceResolution(ref: ReferenceValue): void {
  referenceResolutions.delete(ref);
}

export function getReferenceResolution(ref: ReferenceValue): ReferenceResolution | undefined {
  return referenceResolutions.get(ref);
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
 * A reference to another token. `ref('brand.primary')` names a key in a
 * given scope. `ref('.primary')` — a leading dot, no scope — is **relative**:
 * it reads `primary` in whichever scope reads the token. A token written in
 * `brand` and inherited by `acme extends brand` reads `brand.primary` in
 * `brand` and `acme.primary` in `acme`, so overriding `acme.primary` re-flows
 * through every inherited token that uses it. A field works the same way:
 * `ref('.title.fontSize')`.
 */
export function ref(key: string, options?: { description?: string; [key: string]: any }): ReferenceValue {
  if (typeof key === 'string' && key.startsWith('.') && (key.length === 1 || key[1] === '.')) {
    throw new Error(`Invalid relative reference "${key}": expected ".token" or ".token.field"`);
  }
  return val({
    type: 'reference' as const,
    key,
  }, options);
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

// --- Relative keys ---
//
// A key with a leading dot (`.primary`, `.title.fontSize`) is relative: it
// names a token in the scope that reads it. Tokens keep the relative form —
// they are shared data, and an inherited token is the same object in every
// scope that inherits it — and are *bound* to a scope whenever a scope hands
// them out (`Scope.get`): the bound copy carries fully-qualified keys, so
// resolution, the graph and the renderers never see a relative key. A scope
// argument or `metadata.iteratedScopes` entry of `''` (what `sibling`
// records for a relative anchor) is the reading scope.

/** `.token` or `.token.field` — a key relative to the reading scope. */
export function isRelativeKey(key: unknown): boolean {
  return typeof key === 'string' && key.length > 1 && key[0] === '.' && key[1] !== '.';
}

/** A relative key qualified against `scope`; any other key unchanged. */
export function qualifyKey(key: string, scope: string): string {
  return isRelativeKey(key) ? `${scope}${key}` : key;
}

const relativeTokens = new WeakMap<object, boolean>();

/** True when the token (or anything nested in it) holds a relative key. */
export function hasRelativeKeys(token: unknown): boolean {
  if (typeof token !== 'object' || token === null) return false;
  const cached = relativeTokens.get(token);
  if (cached !== undefined) return cached;
  let result = false;
  if (isReferenceValue(token)) {
    result = isRelativeKey(token.key);
  } else if (isFunctionTokenValue(token)) {
    const options = token.options ?? {};
    const metadata = token.metadata;
    result = token.args.some(hasRelativeKeys)
      || isRelativeKey(options.from)
      || isRelativeKey(options.base)
      || (Array.isArray(options.not) && options.not.some((n: unknown) =>
        isRelativeKey(typeof n === 'string' ? n : (n as ReferenceValue | null)?.key)))
      || (metadata?.dependencies ?? []).some(isRelativeKey)
      || (metadata?.visualDependencies ?? []).some(isRelativeKey)
      || (metadata?.iteratedScopes ?? []).includes('');
  }
  relativeTokens.set(token, result);
  return result;
}

const boundTokens = new WeakMap<object, Map<string, unknown>>();

/** The token as `scope` reads it: relative keys qualified against `scope`.
 *  A token without relative keys comes back as is; a bound copy is cached,
 *  so binding the same token to the same scope always gives the same
 *  object. */
export function bindToken<T>(token: T, scope: string): T {
  if (!hasRelativeKeys(token)) return token;
  const raw = token as unknown as object;
  let perScope = boundTokens.get(raw);
  if (!perScope) {
    perScope = new Map();
    boundTokens.set(raw, perScope);
  }
  const cached = perScope.get(scope);
  if (cached) return cached as T;

  const q = (key: string) => qualifyKey(key, scope);
  let bound: unknown;
  if (isReferenceValue(token)) {
    bound = { ...token, key: q(token.key) };
  } else {
    const fn = token as unknown as FunctionTokenValue;
    let options = fn.options;
    if (options) {
      options = { ...options };
      if (typeof options.from === 'string') options.from = q(options.from);
      if (typeof options.base === 'string') options.base = q(options.base);
      if (Array.isArray(options.not)) {
        options.not = options.not.map((n: unknown) => (typeof n === 'string' ? q(n) : bindToken(n, scope)));
      }
    }
    let metadata = fn.metadata;
    if (metadata) {
      metadata = { ...metadata };
      if (metadata.dependencies) metadata.dependencies = metadata.dependencies.map(q);
      if (metadata.visualDependencies) metadata.visualDependencies = metadata.visualDependencies.map(q);
      if (metadata.iteratedScopes) metadata.iteratedScopes = metadata.iteratedScopes.map((n) => (n === '' ? scope : n));
    }
    bound = { ...fn, args: fn.args.map((arg) => bindToken(arg, scope)), options, metadata };
  }
  perScope.set(scope, bound);
  return bound as T;
}

/** Keys the args read as values, each listed once in first-seen order. */
export function extractDependencies(args: FunctionArg[]): string[] {
  const deps = new Set<string>();
  for (const arg of args) {
    if (isReferenceValue(arg)) {
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
  return [...new Set([...extractDependencies(fn.args), ...(fn.metadata?.dependencies ?? [])])];
}

/** Normalises a `not` option into an array of fully-qualified token keys.
 *  Accepts strings (already qualified keys) or `ReferenceValue` objects
 *  produced by `ref('scope.token')`. Used by scope-iterating analysis
 *  functions (bestContrastWith, mostVivid, …) to exclude candidates from
 *  the search pool. */
export function normalizeNotKeys(not?: ReadonlyArray<string | ReferenceValue>): string[] {
  if (!not || not.length === 0) return [];
  return not.map((n) => (typeof n === 'string' ? n : (n as ReferenceValue).key));
}

/** Names of the scopes a function token iterates — the scope arguments of
 *  the call itself plus those of any nested function-token arguments
 *  (including the ones a nested token declares in `metadata.iteratedScopes`).
 *  Unlike `extractVisualDependencies` this does not enumerate the scope's
 *  members, so it stays valid as the scope gains and loses keys: it is what
 *  the book indexes selectors by. */
export function extractIteratedScopes(args: FunctionArg[]): string[] {
  const names: string[] = [];
  for (const arg of args) {
    if (isFunctionTokenValue(arg)) {
      for (const name of iteratedScopesOf(arg)) names.push(name);
    } else if (typeof arg === 'object' && arg !== null && typeof (arg as ScopeFunctionArg).getAllKeys === 'function') {
      names.push((arg as ScopeFunctionArg).name);
    }
  }
  return names;
}

/** Every scope a function token iterates: its scope arguments, nested
 *  tokens' scopes, and the scopes it declares in `metadata.iteratedScopes`. */
export function iteratedScopesOf(fn: FunctionTokenValue): string[] {
  return [...extractIteratedScopes(fn.args), ...(fn.metadata?.iteratedScopes ?? [])];
}

export function extractVisualDependencies(args: FunctionArg[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (isFunctionTokenValue(arg)) {
      // Nested function tokens can themselves iterate scopes (e.g. a
      // mostVivid call nested inside another function). Pull their visual
      // dependencies up too.
      for (const dep of extractVisualDependencies(arg.args)) deps.push(dep);
    } else if (typeof arg === 'object' && arg !== null && typeof (arg as ScopeFunctionArg).getAllKeys === 'function') {
      const scopeArg = arg as ScopeFunctionArg;
      for (const key of scopeArg.getAllKeys()) {
        deps.push(`${scopeArg.name}.${key}`);
      }
    }
  }
  return deps;
}
