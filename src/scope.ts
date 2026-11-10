import { parse } from 'culori';
import { bindToken, isGroupValue, isReferenceValue, isUnresolvable, misplacedSource, toGroupValue, unresolvableIn } from './tokens';
import type { AnyTokenValue, BindingContext, GroupValue, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { FunctionImplementation } from './design-book';
import { CircularDependencyError, TokenError } from './errors';
import { evaluateFunction, valueKey, valueOf } from './evaluate';
import type { Resolution } from './functions/picks';
import type { ComparableEntry, TokenOrderer } from './orderers';

export type SortDirection = 'asc' | 'desc';
export type SortCriterion =
  | { by: 'name'; direction?: SortDirection }
  /** `field`: the field a text style is sorted by (`fontSize` unless
   *  given); other values sort as themselves. */
  | { by: 'value'; direction?: SortDirection; field?: string }
  | { by: 'type'; priority?: string[] };
export type ScopeOrder = SortCriterion[];

/** An entry's place in one ordered group of a `value` criterion. */
type Rank = { group: string; index: number };

/** A key being sorted: its value, or the group it holds. */
type SortEntry = { key: string; index: number; type: string; resolved: string | null; token: AnyTokenValue; group?: string };

/** What a scope needs from its book. */
export type BookWithScope = {
  resolve(key: string): string;
  /** A key's value and the member it is, when it is one. @internal */
  _resolution(key: string): Resolution;
  getTokenByKey(key: string): AnyTokenValue | undefined;
  getDependencyGraph(): { getDependentsOf(key: string): string[] };
  /** The fully-qualified key a key actually reads (through `extends`). */
  getSourceKey?(key: string): string | undefined;
  /** True for an inherited key that re-binds relative refs to its own scope. */
  isRebound?(key: string): boolean;
  /** The book's memo of resolved values. @internal */
  _cache: ResolveCache;
  getScope(name: string): Scope | undefined;
  getFunction(name: string): FunctionImplementation | undefined;
  /** @internal */
  _accept(key: string, newValue: AnyTokenValue | undefined, oldValue: AnyTokenValue | undefined): void;
  /** Writes a group at `name` of `scope`: its entry, its scope, its members. @internal */
  _setGroup(scope: Scope, name: string, group: GroupValue): void;
  /** Removes the group at `name` of `scope`, its scope and everything in it. @internal */
  _deleteGroup(scope: Scope, name: string): void;
  /** @internal */
  _settle(): void;
  /** @internal */
  _restoreRejectedDelete(key: string, restored: AnyTokenValue): void;
  /** How this book's `extends` chains are read while binding a token. @internal */
  _bindingContext?(): BindingContext;
  getOrderer(type: string): TokenOrderer | undefined;
  getOrdererTypes(): string[];
  on(event: 'change', callback: (e: { detail: { changedKeys: string[] } }) => void): () => void;
};

// The key check lives in ./keys so design-book/naming can use it alone.
export { assertValidTokenKey } from './keys';
import { assertValidTokenKey, splitKey } from './keys';
import type { ResolveCache } from './resolve-cache';

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
  /** What the scope is outside the book when it is a group (`'typography'`
   *  for a text style); read through `getKind`, which follows `extends`. */
  readonly kind?: string;
  /** Inherited keys the scope leaves out (`null` in `ref(scope, { … })`). */
  private readonly omitted: ReadonlySet<string>;
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
    options?: { extends?: string; description?: string; metadata?: ScopeMetadata; kind?: string; omit?: readonly string[] }
  ) {
    this.name = name;
    this.book = book;
    this.description = options?.description;
    this.metadata = { ...options?.metadata };
    this.extendsName = options?.extends;
    this.kind = options?.kind;
    this.omitted = new Set(options?.omit ?? []);
    this.tokens = new Map();
  }

  /** The scope that holds this one when it is a group (`type` for
   *  `type.title`); `undefined` for a top-level scope. */
  get holderName(): string | undefined {
    const dot = this.name.lastIndexOf('.');
    return dot === -1 ? undefined : this.name.slice(0, dot);
  }

  /** What the scope is outside the book — its own kind, or the kind of the
   *  scope it extends (a text style changed is a text style). */
  getKind(): string | undefined {
    if (this.kind !== undefined) return this.kind;
    return this.extendsName ? this.book.getScope(this.extendsName)?.getKind() : undefined;
  }

  /** Its path, so a group in a message reads as `type.title`. */
  toString(): string {
    return this.name;
  }

  /** Something built from this scope's resolved values (its pool of
   *  candidates), kept until the book next changes — see `ResolveCache.memo`.
   *  @internal */
  memo<T>(name: string, build: () => T): T {
    return this.book._cache.memo(this, name, build);
  }

  /** Runs `build` and says whether its result may be kept — see
   *  `ResolveCache.settle`. @internal */
  settle<T>(build: () => T): { value: T; settled: boolean } {
    return this.book._cache.settle(build);
  }

  /** Any scope of the same book by path (a group: `type.title`). */
  scopeAt(path: string): Scope | undefined {
    return this.book.getScope(path);
  }

  /** Inherited keys this scope leaves out. */
  get omit(): string[] {
    return [...this.omitted];
  }

  /** The scope keys are inherited from, unless this one leaves `name` out. */
  private parentFor(name: string): Scope | undefined {
    if (!this.extendsName || this.omitted.has(name)) return undefined;
    return this.book.getScope(this.extendsName);
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
    return this.parentFor(name)?.getRaw(name);
  }

  getSourceKey(name: string): string | undefined {
    if (this.tokens.has(name)) {
      return `${this.name}.${name}`;
    }
    return this.parentFor(name)?.getSourceKey(name);
  }

  isInherited(name: string): boolean {
    return this.has(name) && !this.hasOwn(name);
  }

  /**
   * Writes a token, or a group, at `name`. A group is written as a plain
   * object of members (`{ bg: …, text: … }`), `typography({ … })` or
   * `ref(scope, { …changes })`; nested objects are nested groups.
   */
  set(name: string, value: AnyTokenValue | Record<string, unknown>): void {
    assertValidTokenKey(this.name, name);
    const group = toGroupValue(value);
    if (group) {
      this.book._setGroup(this, name, group);
      return;
    }
    const token = value as AnyTokenValue;
    const qualified = `${this.name}.${name}`;
    const bound = bindToken(token, this.name, this.book._bindingContext?.());
    // A top-level scope is a pool for a selector, never a value of its own.
    // Holding the scope that holds this key would hold itself.
    if (isReferenceValue(bound) && bound.key === this.name) {
      throw new TokenError(`${qualified}: ref('${(token as ReferenceValue).key}') is the scope this key is in; a scope cannot hold itself`, qualified);
    }
    // inherited(...) past the top of the chain, as this scope reads it.
    const unresolvable = unresolvableIn(bound);
    if (unresolvable) throw new TokenError(`${qualified}: ${unresolvable}`, qualified);
    // source(...) names a member; it is no value.
    const misplaced = misplacedSource(token);
    if (misplaced) throw new TokenError(`${qualified}: ${misplaced}`, qualified);
    // A token replacing a group: the group goes first, with its scope.
    if (isGroupValue(this.tokens.get(name))) this.book._deleteGroup(this, name);
    const oldValue = this.tokens.get(name);
    const existed = this.tokens.has(name);
    this.tokens.set(name, token);
    this.changed();
    try {
      this.book._accept(qualified, token, oldValue);
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
    return this.parentFor(name)?.has(name) ?? false;
  }

  /** Check if a key is defined locally (not inherited) */
  hasOwn(name: string): boolean {
    return this.tokens.has(name);
  }

  /** Delete a local token, reverting to inherited value if available */
  delete(name: string): boolean {
    if (isGroupValue(this.tokens.get(name))) {
      this.book._deleteGroup(this, name);
      return true;
    }
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
   *  caller is already mid-propagation and must not start a new change.
   *  @internal */
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

    const parentKeys = (this.book.getScope(this.extendsName)?.getAllKeys() ?? []).filter((k) => !this.omitted.has(k));
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
   *  notification a no-op. Silent by design; the manager notifies per key.
   *  @internal */
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
      const entries: SortEntry[] = keys.map((key, index) => {
        const token = this.get(key)!;
        let resolved: string | null = null;
        let group: string | undefined;
        try {
          ({ value: resolved, group } = this.resolution(key));
        } catch {
          resolved = null;
        }
        const type = group !== undefined ? 'group' : this.effectiveType(token, resolved);
        return { key, index, type, resolved, token, group };
      });

      // One ranking per value criterion: they may sort text styles by
      // different fields.
      const ranks = new Map<SortCriterion, Map<string, Rank>>();
      for (const c of order) if (c.by === 'value') ranks.set(c, this.valueRanks(entries, c.field));

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
            const ra = ranks.get(c)!.get(a.key);
            const rb = ranks.get(c)!.get(b.key);
            if (ra && rb && ra.group === rb.group) {
              r = ra.index - rb.index;
              if (c.direction === 'desc') r = -r;
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

  /**
   * Ranks for a `value` criterion: entries grouped by effective type, each
   * group put in order by that type's orderer. A key holding a group is
   * ranked by one of its members — `field`, or the group's default member
   * (`fontSize` for a text style) — among the other groups, with the orderer
   * of that member's kind: text styles sort like the sizes they stand for.
   * Entries of different groups are not compared.
   */
  private valueRanks(entries: SortEntry[], field?: string): Map<string, Rank> {
    const groups = new Map<string, { type: string; list: ComparableEntry[] }>();
    for (const e of entries) {
      if (e.resolved === null) continue;
      let type = e.type;
      let resolved = e.resolved;
      let rankGroup = type;
      if (e.group !== undefined) {
        const member = field ?? this.book.getScope(e.group)?.defaultMember();
        if (member === undefined) continue; // nothing stands for it: no rank
        try {
          resolved = this.book.resolve(`${e.group}.${member}`);
        } catch {
          continue; // a group without the member has no rank
        }
        type = detectValueType(resolved);
        rankGroup = `group:${type}`;
      }
      const g = groups.get(rankGroup) ?? { type, list: [] };
      g.list.push({ key: e.key, type, resolved, token: e.token });
      groups.set(rankGroup, g);
    }

    const ranks = new Map<string, Rank>();
    for (const [group, { type, list }] of groups) {
      const orderer = this.book.getOrderer(type);
      if (!orderer) {
        warnMissingOrderer(type);
        continue; // no ranks for this type -> value criterion falls through
      }
      orderer(list).forEach((entry, index) => ranks.set(entry.key, { group, index }));
    }
    return ranks;
  }

  /** The member that stands for this scope as a group when one value is
   *  needed (a comparison without `by`, a sort without `field`): `fontSize`
   *  for a text style, none for other groups. */
  defaultMember(): string | undefined {
    return this.getKind() === 'typography' ? DEFAULT_MEASURE_FIELD : undefined;
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

  /** The value of `name`; for a key whose value is a group, the book's
   *  error (see `DesignBook.resolve`). */
  resolve(name: string): string {
    const { value, group } = this.resolution(name);
    if (group !== undefined) return this.book.resolve(`${this.name}.${name}`);
    return value;
  }

  /** The value of `name` and, when it is a member a selector picked (also
   *  through references to that selector), which member. */
  resolution(name: string): Resolution {
    return this.book._cache.resolve(`${this.name}.${name}`, () => this.compute(name));
  }

  /** `resolution` without the cache. */
  private compute(name: string): Resolution {
    // A path into a group (`title.fontSize`) is the book's to walk.
    if (name.includes('.')) return this.book._resolution(`${this.name}.${name}`);
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
    // A group's value is the group: the scope at its path — the source's
    // when the key inherits it.
    if (isGroupValue(token)) return { value: '', group: this.getSourceKey(name) ?? qualified };
    this.resolving.add(name);
    try {
      // A reference passes on what it refers to, a pick included.
      if (token.type === 'reference') {
        return this.book._resolution(valueKey(token as ReferenceValue, qualified));
      }

      if (token.type === 'function') {
        return evaluateFunction(this.book, token as FunctionTokenValue);
      }

      return { value: valueOf(token as TokenValue) };
    } finally {
      this.resolving.delete(name);
    }
  }

}

import { DEFAULT_MEASURE_FIELD, detectValueType } from './values';
export { DIMENSION_VALUE_PATTERN, detectValueType } from './values';


const warnedOrdererTypes = new Set<string>();
function warnMissingOrderer(type: string): void {
  if (warnedOrdererTypes.has(type)) return;
  warnedOrdererTypes.add(type);
  // eslint-disable-next-line no-console
  console.warn(`[design-book] no orderer registered for type "${type}"; value ordering falls through`);
}
