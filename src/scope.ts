import { parse } from 'culori';
import { isFunctionTokenValue, isReferenceValue, isTokenValue } from './tokens';
import type { AnyTokenValue, FunctionArg, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { FunctionImplementation } from './design-book';
import { ReferenceResolver, BookLike } from './reference-resolver';
import { CircularDependencyError } from './errors';
import type { ComparableEntry, TokenOrderer } from './orderers';

export type SortDirection = 'asc' | 'desc';
export type SortCriterion =
  | { by: 'name'; direction?: SortDirection }
  | { by: 'value'; direction?: SortDirection }
  | { by: 'type'; priority?: string[] };
export type ScopeOrder = SortCriterion[];

type BookWithScope = BookLike & {
  getScope(name: string): Scope | undefined;
  getFunction(name: string): FunctionImplementation | undefined;
  _notifyTokenChange(key: string, newValue: any, oldValue: any): void;
  getOrderer(type: string): TokenOrderer | undefined;
  getOrdererTypes(): string[];
  on(event: 'change', callback: (e: { detail: { changedKeys: string[] } }) => void): () => void;
  invalidateDescendantOrderCaches(name: string): void;
};

export class Scope {
  readonly name: string;
  readonly description?: string;
  /** Stored compose marker; the public getter walks the extends chain. */
  private _compose?: string;
  private extendsName?: string;
  private tokens: Map<string, AnyTokenValue>;
  private referenceResolver: ReferenceResolver;
  private book: BookWithScope;
  /** Local order config. `undefined` = inherit from extends chain;
   *  `[]` = explicit insertion order (overrides an inherited order). */
  private _order?: ScopeOrder;
  /** Memoized sorted keys. Invalidated on any token set/delete/setOrder/clearOrder. */
  private orderedKeysCache: string[] | null = null;
  /** Unsubscribe handle for the book-level `change` event (subscribed lazily). */
  private _changeUnsub?: () => void;
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
    options?: { extends?: string; description?: string; compose?: string }
  ) {
    this.name = name;
    this.book = book;
    this.description = options?.description;
    this.extendsName = options?.extends;
    this._compose = options?.compose;
    this.tokens = new Map();
    this.referenceResolver = new ReferenceResolver(book);
  }

  /** Name of the scope this one extends, or `undefined` if it doesn't
   *  inherit from another scope. */
  get extendsScope(): string | undefined {
    return this.extendsName;
  }

  /** Optional marker that lets renderers re-aggregate the scope's tokens
   *  into a composite output (e.g. a CSS class for a typography style or
   *  a W3 `$type: 'typography'` token). Inherits through `extends` unless
   *  the scope sets its own marker. Returns `undefined` if no scope in
   *  the chain is composed. */
  get compose(): string | undefined {
    if (this._compose) return this._compose;
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.compose;
    }
    return undefined;
  }

  get(name: string): AnyTokenValue | undefined {
    if (this.tokens.has(name)) {
      return this.tokens.get(name);
    }
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.get(name);
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
    const oldValue = this.tokens.get(name);
    const existed = this.tokens.has(name);
    this.tokens.set(name, value);
    this.invalidateOrderCache();
    this.book.invalidateDescendantOrderCaches(this.name);
    try {
      this.book._notifyTokenChange(`${this.name}.${name}`, value, oldValue);
    } catch (e) {
      // change was rejected (e.g. it would close a dependency cycle) —
      // roll the token back so the book never holds a value the graph refused;
      // the order caches stay invalidated and recompute from the restored map
      if (existed) this.tokens.set(name, oldValue as AnyTokenValue);
      else this.tokens.delete(name);
      throw e;
    }
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
    const had = this.tokens.delete(name);
    if (had) {
      this.invalidateOrderCache();
      this.book.invalidateDescendantOrderCaches(this.name);
      this.book._notifyTokenChange(`${this.name}.${name}`, undefined, undefined);
    }
    return had;
  }

  updateReferenceCaches(key: string, dependentKeys?: string[]): void {
    this.referenceResolver.updateAllReferencesTo(key, dependentKeys);
  }

  /** Resolve any fully-qualified token key (in this scope or another) by
   *  delegating to the owning book. Useful for selectors that need to
   *  cross-resolve `not` references during candidate iteration. */
  resolveKey(qualifiedKey: string): string {
    return this.book.resolve(qualifiedKey);
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
    // I1-A fix: subscribe lazily so cross-scope ref changes in inherited-order
    // scopes (which never call setOrder()) still invalidate the cache.
    this.subscribeToChanges();
    if (this.orderedKeysCache) return this.orderedKeysCache;
    const sorted = this.computeOrderedKeys(base, order);
    this.orderedKeysCache = sorted;
    return sorted;
  }

  invalidateOrderCache(): void {
    this.orderedKeysCache = null;
  }

  private subscribeToChanges(): void {
    if (this._changeUnsub) return;
    const prefix = `${this.name}.`;
    this._changeUnsub = this.book.on('change', (e: { detail: { changedKeys: string[] } }) => {
      if (e.detail.changedKeys.some(k => k.startsWith(prefix))) {
        this.invalidateOrderCache();
        // I1-B fix: a change to one of this scope's keys (e.g. a cross-scope ref
        // whose target changed) must also invalidate descendant ordered caches that
        // merge or inherit this scope's keys.
        this.book.invalidateDescendantOrderCaches(this.name);
      }
    });
  }

  /** Release the book-level change subscription. Call before discarding the
   *  scope (e.g. in ScopeManager.deleteScope) to prevent memory leaks. */
  dispose(): void {
    this._changeUnsub?.();
    this._changeUnsub = undefined;
  }

  setOrder(order: ScopeOrder): void {
    this._order = order;
    this.invalidateOrderCache();
    this.subscribeToChanges();
    this.book.invalidateDescendantOrderCaches(this.name);
  }

  clearOrder(): void {
    this._order = undefined;
    this.invalidateOrderCache();
    this.book.invalidateDescendantOrderCaches(this.name);
  }

  /** This scope's *local* order config (undefined if unset). */
  getOrder(): ScopeOrder | undefined {
    return this._order;
  }

  /** Local order if set, else the nearest ancestor's via `extends`, else
   *  undefined. Mirrors how `compose` walks the chain. */
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
      if (resolved !== null) return detectType(resolved);
    }
    return token.type;
  }

  resolve(name: string): string {
    const token = this.get(name);
    if (!token) {
      throw new Error(`Token "${name}" not found in scope "${this.name}"`);
    }

    const qualified = `${this.name}.${name}`;
    if (this.resolving.has(name)) {
      throw new CircularDependencyError([qualified, qualified]);
    }
    this.resolving.add(name);
    try {
      if (token.type === 'reference') {
        const ref = token as ReferenceValue;
        return this.book.resolve(ref.key);
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

  /** Resolve a function token, recursing into any nested function-token
   *  arguments. Function tokens don't live in a scope as named entries —
   *  they're inlined as args — so they're invoked directly through the
   *  book's function registry rather than via `book.resolve`. */
  private resolveFunctionToken(fn: FunctionTokenValue): string {
    const resolvedArgs = fn.args.map((arg: FunctionArg) => {
      if (isReferenceValue(arg)) {
        return this.book.resolve((arg as ReferenceValue).key);
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
    });
    const implementation = this.book.getFunction(fn.name);
    if (!implementation) {
      throw new Error(`Function "${fn.name}" is not registered`);
    }
    return implementation(...resolvedArgs, fn.options);
  }
}

/** Best-effort type detection from a resolved value string. */
function detectType(resolved: string): string {
  if (parse(resolved)) return 'color';
  if (/^-?\d/.test(resolved) && /[a-z%]/i.test(resolved)) return 'dimension';
  return 'string';
}

const warnedOrdererTypes = new Set<string>();
function warnMissingOrderer(type: string): void {
  if (warnedOrdererTypes.has(type)) return;
  warnedOrdererTypes.add(type);
  // eslint-disable-next-line no-console
  console.warn(`[design-book] no orderer registered for type "${type}"; value ordering falls through`);
}
