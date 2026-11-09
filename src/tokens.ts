import { parse } from 'culori';
import { parseKey, rootScopeOf, scopeOf } from './keys';
import { TokenError } from './errors';

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
  /** A path: `scope.token`, any depth into groups (`type.title.fontSize`);
   *  relative to the reading scope with a leading dot (`.token`,
   *  `.title.fontSize`). */
  key: string;
  /** Read the path this many `extends` levels up, or at the top of the
   *  chain (`inherited`). Gone once a scope binds the reference. */
  up?: number | 'root';
  /** Read the path this many holders out, or in the top-level scope
   *  (`holder`). Gone once a scope binds the reference. */
  out?: number | 'root';
  description?: string;
}

/** The scope a selector searches: `ref('palette')` written as a selector's
 *  pool, `ref('.')` for the scope that reads it, any group by its path
 *  (`ref('card.heading')`). Its key names a scope, never a token. */
export interface PoolReference {
  type: 'pool';
  key: string;
  up?: number | 'root';
  out?: number | 'root';
}

/**
 * Names a token instead of reading its value: a `not` entry, a `sibling`
 * anchor (`from`) or target (`toward`), a variant's `base`. The function
 * gets the (bound) key, never a resolved value. `ref(...)` written in one
 * of those places is stored as one; `source` and `refersTo` build one that
 * is followed when the function reads it:
 * - `via` (`source`): follow the token's references this many hops, or to
 *   where the value is written;
 * - `referredBy` (`refersTo`): the members whose references lead to the
 *   token, down the value tree.
 */
export interface MemberReference {
  type: 'member';
  key: string;
  /** As on a reference: `inherited` and `holder`, until a scope binds it. */
  up?: number | 'root';
  out?: number | 'root';
  via?: number | 'root';
  referredBy?: true;
}

/** What binding gives for a navigation that could not be followed (past the
 *  top of the `extends` chain): reading it throws `message`; it reads
 *  nothing, so it adds no graph edge. `Scope.set` refuses a token holding
 *  one. */
export interface UnresolvableValue {
  type: 'unresolvable';
  key: string;
  message: string;
}

/** What a function argument may hold. A scope is passed as a reference to
 *  it — `ref('palette')` — so a function token stays plain data. */
export type FunctionArg =
  | TokenValue
  | ReferenceValue
  | PoolReference
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

export type AnyTokenValue = TokenValue | ReferenceValue | FunctionTokenValue | GroupValue;

/**
 * A scope held at a key: a group. The holding scope keeps this entry; the
 * members live in the group's own scope, registered under its path
 * (`type.title`), so they are ordinary keys (`type.title.fontSize`).
 *
 * Written as a plain object of members (`{ bg: …, text: … }`), with
 * `typography({ … })` (a text style) or `variant(ref, { … })` (a group
 * extending another). `members` is what was written; once set, the group's
 * scope holds them and the stored entry has none.
 */
export interface GroupValue {
  type: 'group';
  /** What the group is outside the book: `'typography'` for a text style
   *  (a CSS class, a W3 composite, `fontSize` as the member that stands for
   *  it). Inherited from `base` when unset. */
  kind?: string;
  /** The group it extends (`variant`). */
  base?: MemberReference | UnresolvableValue;
  /** Members of `base` it leaves out. */
  omit?: string[];
  members?: Record<string, GroupInput>;
  description?: string;
}

/** What may be written as a group member: a token, or a group. */
export type GroupInput = TokenValue | ReferenceValue | FunctionTokenValue | GroupValue | { [member: string]: GroupInput };

export function isGroupValue(value: unknown): value is GroupValue {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'group';
}

/** True for a plain object of members: an object whose `type` is not a
 *  string (a token's always is), so a member named `type` cannot be mistaken
 *  for one. */
export function isMemberObject(value: unknown): value is Record<string, GroupInput> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && typeof (value as { type?: unknown }).type !== 'string';
}

/** A group as written — a `GroupValue` or a plain object of members — as a
 *  `GroupValue`; `undefined` for anything else. */
export function toGroupValue(value: unknown): GroupValue | undefined {
  if (isGroupValue(value)) return value;
  if (isMemberObject(value)) return { type: 'group', members: value };
  return undefined;
}

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
  if (parseKey(key) === null) {
    throw new TokenError(
      `Invalid reference "${String(key)}": expected a path such as "scope.token" or "type.title.fontSize", or a relative ".", ".token", ".title.fontSize"`,
      typeof key === 'string' ? key : undefined,
    );
  }
  return val({
    type: 'reference' as const,
    key,
  }, options);
}

/**
 * A scope, as a function's pool — what a selector searches:
 * `pool('palette')`, a group's path (`pool('card.heading')`), `pool('.')`
 * for the scope that reads it, or a navigated reference
 * (`pool(inherited(ref('.')))`). The built-in selectors take `ref('palette')`
 * and make it one; a custom function's token is built with it
 * (`createFunctionToken('secondOf', [pool('palette')])`), so its
 * implementation receives the live scope.
 */
export function pool(target: string | ReferenceValue | PoolReference): PoolReference {
  if (isPoolReference(target)) return target;
  const reference = typeof target === 'string' ? ref(target) : target;
  if (!isReferenceValue(reference)) throw new Error('pool: expects a scope path or a ref(...)');
  const { type: _type, description: _description, ...rest } = reference;
  return { ...rest, type: 'pool' };
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
export function inherited<R extends ReferenceValue | MemberReference>(reference: R, levels: number | 'root' = 1): R {
  if (!isReferenceValue(reference) && !isMemberReference(reference)) {
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
 * The same path, read in the scope that **holds** the reading one: a group
 * placed in a context reads that context. `holder(ref('.surface'))` in the
 * group `context-normal.major` is `context-normal.surface`;
 * `holder(ref('.surface'), 2)` two holders out; `holder(ref('.surface'),
 * 'root')` in the top-level scope. A top-level scope has no holder: reading
 * past it is refused. Its counterparts: `inherited` along `extends`, `source`
 * along references.
 */
export function holder<R extends ReferenceValue | MemberReference>(reference: R, levels: number | 'root' = 1): R {
  if (!isReferenceValue(reference) && !isMemberReference(reference)) {
    throw new Error('holder: expects a ref(...)');
  }
  if (levels === 'root') return { ...reference, out: 'root' };
  if (!Number.isInteger(levels) || levels < 1) {
    throw new Error(`holder: levels must be a whole number of 1 or more, or 'root', got ${String(levels)}`);
  }
  if (reference.out === 'root') return reference;
  return { ...reference, out: (reference.out ?? 0) + levels };
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
export function source(reference: ReferenceValue | MemberReference, hops: number | 'root' = 1): MemberReference {
  if (!isReferenceValue(reference) && !isMemberReference(reference)) {
    throw new Error('source: expects a ref(...)');
  }
  if (isScopePath(reference.key)) {
    throw new Error(`source: "${reference.key}" is a scope; source follows a token's references`);
  }
  if (isMemberReference(reference) && reference.referredBy) {
    throw new Error(`source: follow the references first, then come back down: refersTo(source(ref('${reference.key}')))`);
  }
  const member = toMember(reference);
  if (hops === 'root') return { ...member, via: 'root' };
  if (!Number.isInteger(hops) || hops < 1) {
    throw new Error(`source: hops must be a whole number of 1 or more, or 'root', got ${String(hops)}`);
  }
  if (member.via === 'root') return member;
  return { ...member, via: (member.via ?? 0) + hops };
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
export function refersTo(reference: ReferenceValue | MemberReference): MemberReference {
  if (!isReferenceValue(reference) && !isMemberReference(reference)) {
    throw new Error('refersTo: expects a ref(...)');
  }
  if (isScopePath(reference.key)) {
    throw new Error(`refersTo: "${reference.key}" is a scope; refersTo names the members that refer to a token`);
  }
  const member = toMember(reference);
  return member.referredBy ? member : { ...member, referredBy: true };
}

/** True for a reference that names a token (see `MemberReference`). */
export function isMemberReference(arg: unknown): arg is MemberReference {
  return typeof arg === 'object' && arg !== null && (arg as { type?: string }).type === 'member';
}

/** True for a navigation binding could not follow (see `UnresolvableValue`). */
export function isUnresolvable(arg: unknown): arg is UnresolvableValue {
  return typeof arg === 'object' && arg !== null && (arg as { type?: string }).type === 'unresolvable';
}

/** What a member slot stores, from what an author may write there: a key
 *  (`'palette.red'`), a `ref(...)` (navigation kept), or a `source` /
 *  `refersTo` reference as is. */
export function toMember(entry: string | ReferenceValue | MemberReference): MemberReference {
  if (typeof entry === 'string') return { type: 'member', key: entry };
  if (isMemberReference(entry)) return entry;
  if (isReferenceValue(entry)) return { type: 'member', key: entry.key, ...(entry.up !== undefined ? { up: entry.up } : {}) };
  throw new Error(`Expected a key, ref(...), source(...) or refersTo(...), got ${JSON.stringify(entry)}`);
}

/** `toMember` for a list (a `not` option); `[]` for none. */
export function toMembers(entries?: ReadonlyArray<string | ReferenceValue | MemberReference>): MemberReference[] {
  return entries ? entries.map(toMember) : [];
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

/** True for a path that certainly names a scope: `.` (the reading scope)
 *  or a single segment (a top-level scope). A dotted path may name a group
 *  too; only the book can tell. */
export function isScopePath(key: unknown): boolean {
  return typeof key === 'string' && (key === '.' || (key.length > 0 && !key.includes('.')));
}

/** A pool: the scope a selector searches. */
export function isPoolReference(arg: unknown): arg is PoolReference {
  return typeof arg === 'object' && arg !== null && (arg as { type?: unknown }).type === 'pool';
}

/** `.`, `.token` or `.title.fontSize` — a path relative to the reading scope. */
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

/** Option names whose values name tokens (`MemberReference`s); every
 *  other option holding a reference, token or function is an input,
 *  resolved like an argument. */
export const MEMBER_SLOTS: ReadonlySet<string> = new Set(['not', 'from', 'toward', 'base']);

/** A reference-like node of a token, and where it sits. */
type RefNode = ReferenceValue | PoolReference | MemberReference | UnresolvableValue;
/** `value`: an argument or input option; `pool`: a selector's pool;
 *  `member`: a member slot. */
type Place = 'value' | 'pool' | 'member';

function isRefNode(arg: unknown): arg is RefNode {
  return isReferenceValue(arg) || isPoolReference(arg) || isMemberReference(arg) || isUnresolvable(arg);
}

/**
 * Visits every reference in a token, nested function tokens included, and
 * says where it sits: the one walk the binding, the traits, the
 * dependencies and the checks below share, so they cannot disagree about
 * where references live.
 */
function walkRefs(token: unknown, visit: (node: RefNode, place: Place, slot?: string) => void): void {
  if (isRefNode(token)) {
    visit(token, isPoolReference(token) ? 'pool' : 'value');
    return;
  }
  if (!isFunctionTokenValue(token)) return;
  for (const arg of token.args) {
    if (isRefNode(arg)) visit(arg, isPoolReference(arg) ? 'pool' : 'value');
    else if (isFunctionTokenValue(arg)) walkRefs(arg, visit);
  }
  for (const [name, value] of Object.entries(token.options ?? {})) {
    if (MEMBER_SLOTS.has(name)) {
      for (const entry of Array.isArray(value) ? value : [value]) if (isRefNode(entry)) visit(entry, 'member', name);
    } else if (isRefNode(value)) visit(value, 'value', name);
    else if (isFunctionTokenValue(value)) walkRefs(value, visit);
  }
}

type TokenTraits = { relative: boolean; navigates: boolean };
const tokenTraits = new WeakMap<object, TokenTraits>();

function traitsOf(token: unknown): TokenTraits {
  if (typeof token !== 'object' || token === null) return { relative: false, navigates: false };
  const cached = tokenTraits.get(token);
  if (cached) return cached;
  const traits: TokenTraits = { relative: false, navigates: false };
  walkRefs(token, (node) => {
    if (isRelativeKey(node.key)) traits.relative = true;
    if (!isUnresolvable(node) && (node.up !== undefined || node.out !== undefined)) traits.navigates = true;
  });
  if (isFunctionTokenValue(token)) {
    const metadata = token.metadata;
    if ((metadata?.dependencies ?? []).some(isRelativeKey) || (metadata?.iteratedScopes ?? []).includes('')) {
      traits.relative = true;
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

/**
 * Follows `holder` (`out`) and `inherited` (`up`) from the scope a qualified
 * path belongs to — the path itself for a pool, everything before its last
 * dot for a token — and puts the rest of the path back. Holders first:
 * `holder(inherited(ref('.x')))` is the holder's parent's `x`.
 */
function navigate(
  path: string,
  isScope: boolean,
  move: { up?: number | 'root'; out?: number | 'root' },
  context: BindingContext,
): string | { error: string } {
  const start = isScope ? path : scopeOf(path);
  const rest = path.slice(start.length);
  let scope = start;
  const { up, out } = move;
  if (out === 'root') scope = rootScopeOf(scope);
  else if (out !== undefined) {
    for (let level = 0; level < out; level++) {
      if (!scope.includes('.')) {
        return {
          error: level === 0
            ? `"${scope}" is a top-level scope: no scope holds it, so holder(...) cannot read "${path}" there`
            : `"${start}" is held only ${level} level${level === 1 ? '' : 's'} deep, so holder(...) cannot go ${out} out`,
        };
      }
      scope = scopeOf(scope);
    }
  }
  if (up === 'root') {
    const seen = new Set<string>();
    for (let parent = context.parentOf(scope); parent !== undefined && !seen.has(parent); parent = context.parentOf(scope)) {
      seen.add(scope);
      scope = parent;
    }
  } else if (up !== undefined) {
    const from = scope;
    for (let level = 0; level < up; level++) {
      const parent = context.parentOf(scope);
      if (parent === undefined) {
        return {
          error: level === 0
            ? `"${from}" has no parent: it extends no scope, so inherited(...) cannot read "${path}" there`
            : `"${from}" has only ${level} level${level === 1 ? '' : 's'} above it, so inherited(...) cannot go ${up} up`,
        };
      }
      scope = parent;
    }
  }
  return scope + rest;
}

/** A reference as `scope` reads it: qualified, then navigated — or, past
 *  the top of a chain, unresolvable. */
function bindNode(node: RefNode, scope: string, context: BindingContext | undefined): RefNode {
  if (isUnresolvable(node)) return node;
  const qualified = qualifyKey(node.key, scope);
  const { up, out, ...plain } = node;
  if (up === undefined && out === undefined) return { ...plain, key: qualified };
  const navigated = context
    ? navigate(qualified, isPoolReference(node), { up, out }, context)
    : { error: `"${node.key}" needs a book to read inherited(...) or holder(...)` };
  if (typeof navigated !== 'string') return { type: 'unresolvable', key: qualified, message: navigated.error };
  return { ...plain, key: navigated } as RefNode;
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

  let bound: unknown;
  if (isRefNode(token)) {
    bound = bindNode(token, scope, context);
  } else {
    const fn = token as unknown as FunctionTokenValue;
    const bindValue = (v: unknown): unknown => (isRefNode(v) ? bindNode(v, scope, context) : bindToken(v, scope, context));
    let options = fn.options;
    if (options) {
      options = { ...options };
      for (const [name, value] of Object.entries(options)) {
        if (MEMBER_SLOTS.has(name) && Array.isArray(value)) options[name] = value.map(bindValue);
        else if (isRefNode(value) || isFunctionTokenValue(value)) options[name] = bindValue(value);
      }
    }
    let metadata = fn.metadata;
    if (metadata) {
      metadata = { ...metadata };
      if (metadata.dependencies) metadata.dependencies = metadata.dependencies.map((key) => qualifyKey(key, scope));
      if (metadata.iteratedScopes) metadata.iteratedScopes = metadata.iteratedScopes.map((n) => (n === '' ? scope : qualifyKey(n, scope)));
    }
    bound = { ...fn, args: fn.args.map(bindValue), options, metadata };
  }
  cache.byScope.set(scope, bound);
  return bound as T;
}

/** Where a member reference (`source`, `refersTo`) sits outside a member
 *  slot — as a value, an argument or an input — a message saying so; else
 *  `undefined`. `Scope.set` refuses such a token. */
export function misplacedSource(token: unknown): string | undefined {
  let error: string | undefined;
  walkRefs(token, (node, place) => {
    if (error || place === 'member' || !isMemberReference(node)) return;
    error = node.referredBy
      ? `refersTo(ref('${node.key}')) names members, for a sibling anchor, a toward target or a not entry; it is not a value`
      : `source(ref('${node.key}')) names a member, for a sibling anchor, a toward target or a not entry; as a value, write ref('${node.key}')`;
  });
  return error;
}

/** The first navigation in a bound token that could not be followed, or
 *  `undefined`. `Scope.set` uses it to refuse such a token up front. */
export function unresolvableIn(token: unknown): string | undefined {
  let error: string | undefined;
  walkRefs(token, (node) => {
    if (!error && isUnresolvable(node)) error = node.message;
  });
  return error;
}

/** The key a value reference reads, or `undefined`: a scope is a pool (read
 *  through the selector index, not as a value), an unresolvable navigation
 *  reads nothing, and one not yet followed names no key yet. */
function valueKey(node: RefNode): string | undefined {
  if (!isReferenceValue(node) || node.up !== undefined || node.out !== undefined) return undefined;
  return node.key;
}

/** The key a member reference reads to name its member, or `undefined`: a
 *  `source` reads its start key; a bare `refersTo` only the pool. */
function memberReadKey(node: RefNode): string | undefined {
  if (!isMemberReference(node) || node.up !== undefined || node.out !== undefined) return undefined;
  if (node.referredBy && node.via === undefined) return undefined;
  return node.key;
}

/** Keys the args read as values, each listed once in first-seen order;
 *  nested function tokens contribute everything they read. */
export function extractDependencies(args: FunctionArg[]): string[] {
  const deps = new Set<string>();
  for (const arg of args) {
    if (isRefNode(arg)) {
      const key = valueKey(arg);
      if (key !== undefined) deps.add(key);
    } else if (isFunctionTokenValue(arg)) {
      for (const dep of functionDependencies(arg)) deps.add(dep);
    }
  }
  return [...deps];
}

/**
 * Every key a function token reads — its graph edges: the references among
 * its arguments and inputs (nested function tokens included), the token a
 * `from` / `toward` / `base` names, the `not` entries outside the scopes it
 * iterates, and whatever it declares in `metadata.dependencies` (a custom
 * function reading keys it holds some other way). Deduplicated, first-seen
 * order.
 *
 * A `not` entry inside an iterated scope is a pool member: the selector
 * index already follows it, and an edge to one could close a false cycle
 * with a member derived from the token.
 */
export function functionDependencies(fn: FunctionTokenValue): string[] {
  const deps = new Set<string>();
  const iterated = new Set(iteratedScopesOf(fn));
  walkRefs(fn, (node, place, slot) => {
    if (place === 'value') {
      const key = valueKey(node);
      if (key !== undefined) deps.add(key);
      return;
    }
    const key = memberReadKey(node);
    if (key === undefined || isRelativeKey(key)) return;
    if (slot === 'not' && isMemberReference(node) && node.via === undefined && (!key.includes('.') || iterated.has(scopeOf(key)))) return;
    deps.add(key);
  });
  for (const dep of fn.metadata?.dependencies ?? []) deps.add(dep);
  return [...deps];
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
    } else if (isPoolReference(arg)) {
      // Bound, this is the scope's path; `.` before binding means the reading scope.
      names.push(arg.key === '.' ? '' : arg.key);
    }
  }
  return names;
}

/** Every scope a function token iterates: its scope arguments, nested
 *  tokens' scopes, the scopes it declares in `metadata.iteratedScopes`, and
 *  — for a function that names an anchor (`from`) and no scope — the
 *  anchor's own scope (`''` for a relative one: the reading scope). A
 *  `source` or `refersTo` anchor's scope is only known when it is followed. */
export function iteratedScopesOf(fn: FunctionTokenValue): string[] {
  return [...extractIteratedScopes(fn.args), ...(fn.metadata?.iteratedScopes ?? []), ...anchorScopeOf(fn)];
}

/** The scope a function walks from its `from` anchor (`sibling`) when it
 *  takes no scope argument: the anchor's own scope, `''` for a relative
 *  anchor (the reading scope). Empty when it names a scope, has no plain
 *  anchor, or the anchor's scope is only known once it is followed
 *  (`source`, `refersTo`) or navigated (`inherited`, before binding). */
export function anchorScopeOf(fn: FunctionTokenValue): string[] {
  const from = fn.options?.from;
  if (fn.args.some(isPoolReference) || !isMemberReference(from)) return [];
  if (from.up !== undefined || from.out !== undefined || from.via !== undefined || from.referredBy) return [];
  return [scopeOf(from.key)];
}
