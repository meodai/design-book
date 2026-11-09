import { parse } from 'culori';
import { bindToken, isFunctionTokenValue, isReferenceValue, isScopeKey, isTokenValue, isUnresolvable, MEMBER_SLOTS, misplacedSource, unresolvableIn } from './tokens';
import type { AnyTokenValue, BindingContext, FunctionArg, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { FunctionImplementation } from './design-book';
import { CircularDependencyError, TokenError } from './errors';
import { inFrame } from './functions/picks';
import type { ComparableEntry, TokenOrderer } from './orderers';

export type SortDirection = 'asc' | 'desc';
export type SortCriterion =
  | { by: 'name'; direction?: SortDirection }
  | { by: 'value'; direction?: SortDirection }
  | { by: 'type'; priority?: string[] };
export type ScopeOrder = SortCriterion[];

/** What a scope needs from its book. */
export type BookWithScope = {
  resolve(key: string): string;
  getTokenByKey(key: string): AnyTokenValue | undefined;
  getDependencyGraph(): { getDependentsOf(key: string): string[] };
  /** The fully-qualified key a key actually reads (through `extends`). */
  getSourceKey?(key: string): string | undefined;
  /** True for an inherited key that re-binds relative refs to its own scope. */
  isRebound?(key: string): boolean;
  /** The book's memo of resolved values. */
  _cache: ResolveCache;
  getScope(name: string): Scope | undefined;
  getFunction(name: string): FunctionImplementation | undefined;
  _accept(key: string, newValue: AnyTokenValue | undefined, oldValue: AnyTokenValue | undefined): void;
  _settle(): void;
  _restoreRejectedDelete(key: string, restored: AnyTokenValue): void;
  /** How this book's `extends` chains are read while binding a token. */
  _bindingContext?(): BindingContext;
  getOrderer(type: string): TokenOrderer | undefined;
  getOrdererTypes(): string[];
  on(event: 'change', callback: (e: { detail: { changedKeys: string[] } }) => void): () => void;
};

// The key check lives in ./keys so design-book/naming can use it alone.
export { assertValidTokenKey } from './keys';
import { assertValidTokenKey, splitKey } from './keys';
import type { ResolveCache } from './resolve-cache';
import { isTypographyToken, typographyBase, typographyFieldNames } from './functions/non-color/typography';

/** See `Scope.metadata`. */
export type ScopeMetadata = Record<string, unknown>;

export class Scope {
  readonly name: string;
  readonly description?: string;
  /** Free-form data the user attaches to the scope. The book never reads it
   *  and it is not inherited through `extends`; the css-variables renderer
   *  reads one key, `media` (a breakpoint name or a media query). */
  readonly metadata: ScopeMetadata;
  private extendsName?: string;
  private tokens: Map<string, AnyTokenValue>;
  private book: BookWithScope;
  /** Local order config. `undefined` = inherit from extends chain;
   *  `[]` = explicit insertion order (overrides an inherited order). */
  private _order?: ScopeOrder;
  /** Memoized sorted keys. Invalidated on any token set/delete/setOrder/clearOrder. */
  /** The sorted keys, valid while no value has changed since they were
   *  sorted: an order reads the key set, the order config and resolved
   *  values, and every change to any of them clears the book's resolve
   *  cache, so its generation is the stamp. */
  private orderedKeysCache: { keys: string[]; generation: number } | null = null;
  /** Unsubscribe handle for the book-level `change` event (subscribed lazily). */
  /** Re-entrancy guard: while computing the ordered keys, getAllKeys returns
   *  insertion order to let scope-iterating functions resolve safely. */
  private _ordering = false;
  /** Keys currently mid-resolution, guarding against re-entrant resolution.
   *  Scope-iterating functions (bestContrastWith, minContrastWith, …) walk
   *  every key in their own scope, including the token that holds the
   *  function itself — resolving that key would recurse infinitely. */
  private resolving: Set<string> = new Set();

  constructor(
    name: string,
    book: BookWithScope,
    options?: { extends?: string; description?: string; metadata?: ScopeMetadata }
  ) {
    this.name = name;
    this.book = book;
    this.description = options?.description;
    this.metadata = { ...options?.metadata };
    this.extendsName = options?.extends;
    this.tokens = new Map();
  }

  /** Name of the scope this one extends, or `undefined` if it doesn't
   *  inherit from another scope. */
  get extendsScope(): string | undefined {
    return this.extendsName;
  }

  /** The token `name` holds as this scope reads it: own or inherited, with
   *  relative keys (`ref('.primary')`) qualified against this scope — an
   *  inherited `ref('.primary')` comes back as `ref('<this scope>.primary')`.
   *  Use `getRaw` for the token as it was written. */
  get(name: string): AnyTokenValue | undefined {
    const token = this.getRaw(name);
    return token === undefined ? undefined : bindToken(token, this.name, this.book._bindingContext?.());
  }

  /** The token `name` holds, own or inherited, exactly as it was written —
   *  relative keys left relative. What copies and serializers want. */
  getRaw(name: string): AnyTokenValue | undefined {
    if (this.tokens.has(name)) {
      return this.tokens.get(name);
    }
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.getRaw(name);
    }
    return undefined;
  }

  getSourceKey(name: string): string | undefined {
    if (this.tokens.has(name)) {
      return `${this.name}.${name}`;
    }
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.getSourceKey(name);
    }
    return undefined;
  }

  isInherited(name: string): boolean {
    return this.has(name) && !this.hasOwn(name);
  }

  set(name: string, value: AnyTokenValue): void {
    assertValidTokenKey(this.name, name);
    const qualified = `${this.name}.${name}`;
    const bound = bindToken(value, this.name, this.book._bindingContext?.());
    // A scope is a pool for a selector, never a value of its own.
    if (isReferenceValue(bound) && isScopeKey(bound.key)) {
      throw new TokenError(
        `${qualified}: ref('${(value as ReferenceValue).key}') names a scope; a token needs 'scope.token'`,
        qualified,
      );
    }
    // inherited(...) past the top of the chain, as this scope reads it.
    const unresolvable = unresolvableIn(bound);
    if (unresolvable) throw new TokenError(`${qualified}: ${unresolvable}`, qualified);
    // source(...) names a member; it is no value.
    const misplaced = misplacedSource(value);
    if (misplaced) throw new TokenError(`${qualified}: ${misplaced}`, qualified);
    if (isTypographyToken(value) && typographyBase(bound as FunctionTokenValue) === qualified) {
      const error = new CircularDependencyError([qualified, qualified]);
      error.message += ` — a variant cannot extend the token it replaces; to change "${qualified}" in place, ` +
        `pass the token instead: variant(book.getTokenByKey("${qualified}"), …)`;
      throw error;
    }
    const oldValue = this.tokens.get(name);
    const existed = this.tokens.has(name);
    this.tokens.set(name, value);
    this.changed();
    try {
      this.book._accept(qualified, value, oldValue);
    } catch (e) {
      // Refused (it would close a dependency cycle) before anyone heard of
      // it: put the old token back, and the book holds nothing it refused.
      if (existed) this.tokens.set(name, oldValue as AnyTokenValue);
      else this.tokens.delete(name);
      this.changed();
      throw e;
    }
    this.book._settle();
  }

  has(name: string): boolean {
    if (this.tokens.has(name)) return true;
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.has(name) ?? false;
    }
    return false;
  }

  /** Check if a key is defined locally (not inherited) */
  hasOwn(name: string): boolean {
    return this.tokens.has(name);
  }

  /** Delete a local token, reverting to inherited value if available */
  delete(name: string): boolean {
    const old = this.tokens.get(name);
    const had = this.tokens.delete(name);
    if (had) {
      this.changed();
      try {
        this.book._accept(`${this.name}.${name}`, undefined, old);
      } catch (e) {
        // Refused: with the own token gone the key inherits one whose
        // relative refs close a cycle in this scope. Put it back.
        this.tokens.set(name, old as AnyTokenValue);
        this.changed();
        this.book._restoreRejectedDelete(`${this.name}.${name}`, old as AnyTokenValue);
        throw e;
      }
      this.book._settle();
    }
    return had;
  }

  /** Put a token back after the book rejected the change that set it —
   *  restoring `undefined` removes the entry. Deliberately silent: the
   *  caller is already mid-propagation and must not start a new change. */
  _rollback(name: string, oldValue: AnyTokenValue | undefined): void {
    if (oldValue === undefined) this.tokens.delete(name);
    else this.tokens.set(name, oldValue);
    this.changed();
  }


  /** Resolve any fully-qualified token key (in this scope or another) by
   *  delegating to the owning book. Useful for selectors that need to
   *  cross-resolve `not` references during candidate iteration. */
  resolveKey(qualifiedKey: string): string {
    return this.book.resolve(qualifiedKey);
  }

  /** Keys stored directly on this scope, in insertion order and without
   *  the sorting pass `getAllKeys()` performs. Inherited keys are excluded. */
  ownKeys(): string[] {
    return Array.from(this.tokens.keys());
  }

  /** Keys in insertion / parent-first order (the pre-ordering behavior). */
  private baseKeys(): string[] {
    const localKeys = Array.from(this.tokens.keys());
    if (!this.extendsName) return localKeys;

    const parentKeys = this.book.getScope(this.extendsName)?.getAllKeys() ?? [];
    const combined = new Set([...parentKeys, ...localKeys]);
    return Array.from(combined);
  }

  getAllKeys(): string[] {
    const order = this.getEffectiveOrder();
    const base = this.baseKeys();
    // No ordering, empty criteria, or a re-entrant call during ordering:
    // hand back insertion order.
    if (!order || order.length === 0 || this._ordering) return base;
    const generation = this.book._cache.generation;
    if (this.orderedKeysCache?.generation === generation) return this.orderedKeysCache.keys;
    const keys = this.computeOrderedKeys(base, order);
    // Sorting resolves members without the cache; it must not have moved.
    this.orderedKeysCache = { keys, generation: this.book._cache.generation };
    return keys;
  }

  /** Something in this scope changed (a token, its order): every resolved
   *  value may be stale, and with them every scope's sorted keys. */
  private changed(): void {
    this.book._cache.clear();
  }

  /** Prepare for removal: drop the local tokens *and* the inheritance link,
   *  so every one of this scope's keys reads as gone while the scope itself
   *  stays reachable. `ScopeManager.deleteScope` needs that window — the
   *  book refreshes a key's dependents' reference caches through the scope
   *  that owns the key, so unregistering the scope first made the whole
   *  notification a no-op. Silent by design; the manager notifies per key. */
  _detachForDeletion(): void {
    this.tokens.clear();
    this.extendsName = undefined;
    this.changed();
  }

  setOrder(order: ScopeOrder): void {
    this._order = order;
    this.changed();
  }

  clearOrder(): void {
    this._order = undefined;
    this.changed();
  }

  /** This scope's *local* order config (undefined if unset). */
  getOrder(): ScopeOrder | undefined {
    return this._order;
  }

  /** Local order if set, else the nearest ancestor's via `extends`, else
   *  undefined. */
  getEffectiveOrder(): ScopeOrder | undefined {
    if (this._order !== undefined) return this._order;
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.getEffectiveOrder();
    }
    return undefined;
  }

  allTokens(): Record<string, AnyTokenValue> {
    const result: Record<string, AnyTokenValue> = {};
    for (const key of this.getAllKeys()) {
      const token = this.get(key);
      if (token) result[key] = token;
    }
    return result;
  }

  private computeOrderedKeys(keys: string[], order: ScopeOrder): string[] {
    // Pools see insertion order while this runs: nothing computed now is
    // the value the key has outside it, so none of it is cached.
    return this.book._cache.without(() => this.sortKeys(keys, order));
  }

  private sortKeys(keys: string[], order: ScopeOrder): string[] {
    this._ordering = true;
    try {
      type Entry = { key: string; index: number; type: string; resolved: string | null; token: AnyTokenValue };
      const entries: Entry[] = keys.map((key, index) => {
        const token = this.get(key)!;
        let resolved: string | null = null;
        try { resolved = this.resolve(key); } catch { resolved = null; }
        const type = this.effectiveType(token, resolved);
        return { key, index, type, resolved, token };
      });

      const ranks = this.computeValueRanks(entries, order);

      const resolvable = entries.filter(e => e.resolved !== null);
      const unresolvable = entries.filter(e => e.resolved === null);

      resolvable.sort((a, b) => {
        for (const c of order) {
          let r = 0;
          if (c.by === 'name') {
            r = a.key.localeCompare(b.key);
            if (c.direction === 'desc') r = -r;
          } else if (c.by === 'type') {
            r = this.typeRank(a.type, c.priority) - this.typeRank(b.type, c.priority);
          } else if (c.by === 'value') {
            if (a.type === b.type) {
              const ra = ranks.get(a.key);
              const rb = ranks.get(b.key);
              if (ra !== undefined && rb !== undefined) {
                r = ra - rb;
                if (c.direction === 'desc') r = -r;
              }
            }
          }
          if (r !== 0) return r;
        }
        return a.index - b.index; // stable tiebreak
      });

      return [...resolvable.map(e => e.key), ...unresolvable.map(e => e.key)];
    } finally {
      this._ordering = false;
    }
  }

  /** For any `value` criterion: group resolvable entries by effective type,
   *  run that type's orderer once, and record each entry's rank (index). */
  private computeValueRanks(
    entries: Array<{ key: string; type: string; resolved: string | null; token: AnyTokenValue }>,
    order: ScopeOrder,
  ): Map<string, number> {
    const ranks = new Map<string, number>();
    if (!order.some(c => c.by === 'value')) return ranks;

    const byType = new Map<string, ComparableEntry[]>();
    for (const e of entries) {
      if (e.resolved === null) continue;
      const list = byType.get(e.type) ?? [];
      list.push({ key: e.key, type: e.type, resolved: e.resolved, token: e.token });
      byType.set(e.type, list);
    }

    for (const [type, group] of byType) {
      const orderer = this.book.getOrderer(type);
      if (!orderer) {
        warnMissingOrderer(type);
        continue; // no ranks for this type -> value criterion falls through
      }
      orderer(group).forEach((entry, i) => ranks.set(entry.key, i));
    }
    return ranks;
  }

  /** Rank of a type for the `type` criterion: listed types by priority index,
   *  then unlisted types in orderer-registration order, then unknown last. */
  private typeRank(type: string, priority?: string[]): number {
    if (priority) {
      const i = priority.indexOf(type);
      if (i >= 0) return i;
    }
    const base = priority?.length ?? 0;
    const reg = this.book.getOrdererTypes().indexOf(type);
    return reg >= 0 ? base + reg : base + 1000;
  }

  /** Effective type for grouping/value: declared type, or a function's
   *  returnType, falling back to detecting from the resolved value. */
  private effectiveType(token: AnyTokenValue, resolved: string | null): string {
    if (token.type === 'function') {
      const rt = (token as FunctionTokenValue).metadata?.returnType;
      if (rt) return rt;
    }
    if (token.type === 'reference' || token.type === 'function') {
      if (resolved !== null) return detectValueType(resolved);
    }
    return token.type;
  }

  resolve(name: string): string {
    return this.book._cache.resolve(`${this.name}.${name}`, () => this.compute(name));
  }

  /** `resolve` without the cache. */
  private compute(name: string): string {
    const field = splitKey(name);
    if (field) return this.resolveField(field[0], field[1]);
    const token = this.get(name);
    if (!token) {
      throw new Error(`Token "${name}" not found in scope "${this.name}"`);
    }

    const qualified = `${this.name}.${name}`;
    // inherited(...) that no longer leads anywhere (a scope above was removed).
    if (isUnresolvable(token)) throw new TokenError(`${qualified}: ${token.message}`, qualified);
    if (this.resolving.has(name)) {
      // Turned away mid-resolution: whatever is being computed around this
      // depends on the order things were asked in, not on the book alone.
      this.book._cache.trip();
      throw new CircularDependencyError([qualified, qualified]);
    }
    this.resolving.add(name);
    try {
      if (token.type === 'reference') {
        return this.book.resolve(this.valueKey(token as ReferenceValue, qualified));
      }

      if (token.type === 'function') {
        return this.resolveFunctionToken(token as FunctionTokenValue);
      }

      const tv = token as TokenValue;
      if (tv.metadata?.unit) {
        return `${tv.rawValue}${tv.metadata.unit}`;
      }

      return String(tv.rawValue);
    } finally {
      this.resolving.delete(name);
    }
  }

  /** One field of the typography `name` holds (`ref('type.title.fontSize')`):
   *  follows a ref to the typography, and a variant's base for the fields
   *  it doesn't set. */
  private resolveField(name: string, field: string): string {
    const token = this.get(name);
    const qualified = `${this.name}.${name}`;
    if (!token) throw new Error(`Token "${name}" not found in scope "${this.name}"`);
    if (field.includes('.')) {
      throw new TokenError(
        `"${qualified}.${field}": a key has at most one field level — "scope.token.field"`,
        `${qualified}.${field}`,
      );
    }
    if (token.type === 'reference') {
      return this.book.resolve(`${this.valueKey(token as ReferenceValue, qualified)}.${field}`);
    }
    if (!isTypographyToken(token)) {
      throw new TokenError(`"${qualified}" is not a typography, so "${qualified}.${field}" names no field`, `${qualified}.${field}`);
    }
    if (!typographyFieldNames(this.book, token)?.includes(field)) {
      throw new TokenError(`"${qualified}" has no field "${field}"`, `${qualified}.${field}`);
    }
    const own = (token.options?.fields as string[]).indexOf(field);
    if (own === -1) return this.book.resolve(`${typographyBase(token)}.${field}`);

    const guard = `${name}.${field}`;
    if (this.resolving.has(guard)) throw new CircularDependencyError([`${qualified}.${field}`, `${qualified}.${field}`]);
    this.resolving.add(guard);
    try {
      return String(this.resolveArg(token.args[own]));
    } finally {
      this.resolving.delete(guard);
    }
  }

  /** The key a bound reference reads as a value. Refuses a navigation that
   *  could not be followed and a scope, which has no value of its own. */
  private valueKey(reference: ReferenceValue, where: string): string {
    if (isScopeKey(reference.key)) {
      throw new TokenError(`${where}: ref('${reference.key}') names a scope; a value needs 'scope.token'`, where);
    }
    return reference.key;
  }

  /** Resolve a function token, recursing into any nested function-token
   *  arguments. Function tokens don't live in a scope as named entries —
   *  they're inlined as args — so they're invoked directly through the
   *  book's function registry rather than via `book.resolve`. */
  private resolveFunctionToken(fn: FunctionTokenValue): string {
    // Its own frame, so the member a selector picks is reported for this
    // call and not for the call that is resolving it (./functions/picks).
    return inFrame(() => {
      const resolvedArgs = fn.args.map((arg: FunctionArg) => this.resolveArg(arg));
      const implementation = this.book.getFunction(fn.name);
      if (!implementation) {
        throw new Error(`Function "${fn.name}" is not registered`);
      }
      return implementation(...resolvedArgs, this.resolveInputs(fn.options));
    });
  }

  /** A function argument's value: refs and nested functions resolved, a
   *  scope argument looked up by name, anything else as is. */
  /** The options a function receives: every input — a reference, a token
   *  or a function token at the top level, outside the member slots —
   *  resolved like an argument (`closest`'s `upTo`, a selector's
   *  `readableOn`). Member references and plain values pass as they are. */
  private resolveInputs(options: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!options) return options;
    let resolved: Record<string, unknown> | undefined;
    for (const [name, value] of Object.entries(options)) {
      if (MEMBER_SLOTS.has(name)) continue;
      if (isReferenceValue(value) || isFunctionTokenValue(value) || isTokenValue(value) || isUnresolvable(value)) {
        resolved ??= { ...options };
        resolved[name] = this.resolveArg(value as FunctionArg);
      }
    }
    return resolved ?? options;
  }

  private resolveArg(arg: FunctionArg): unknown {
    if (isUnresolvable(arg)) throw new TokenError(`${arg.key}: ${arg.message}`, arg.key);
    if (isReferenceValue(arg)) {
      // A scope reference is a pool: hand the function the scope itself.
      if (isScopeKey(arg.key)) {
        const scope = this.book.getScope(arg.key);
        if (!scope) throw new TokenError(`Scope "${arg.key}" not found`, arg.key);
        return scope;
      }
      return this.book.resolve(this.valueKey(arg, this.name));
    }
    if (isFunctionTokenValue(arg)) {
      return this.resolveFunctionToken(arg);
    }
    if (isTokenValue(arg)) {
      const tv = arg as TokenValue;
      if (tv.metadata?.unit) return `${tv.rawValue}${tv.metadata.unit}`;
      return String(tv.rawValue);
    }
    return arg;
  }
}

import { detectValueType } from './values';
export { DIMENSION_VALUE_PATTERN, detectValueType } from './values';


const warnedOrdererTypes = new Set<string>();
function warnMissingOrderer(type: string): void {
  if (warnedOrdererTypes.has(type)) return;
  warnedOrdererTypes.add(type);
  // eslint-disable-next-line no-console
  console.warn(`[design-book] no orderer registered for type "${type}"; value ordering falls through`);
}
