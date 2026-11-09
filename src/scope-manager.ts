import { Scope } from './scope';
import { ScopeError } from './errors';
import { scopeOf } from './keys';
import { functionDependencies } from './tokens';
import type { AnyTokenValue, ReferenceValue, FunctionTokenValue } from './tokens';
import type { BookWithScope } from './scope';

export class ScopeManager {
  private scopes: Map<string, Scope> = new Map();
  /** Scope name → the scopes that extend it directly. */
  private children: Map<string, Set<string>> = new Map();
  private book: BookWithScope;

  constructor(book: BookWithScope) {
    this.book = book;
  }

  /** `name` and every scope that extends it, at any depth — the scopes
   *  that see `name`'s keys. */
  lineageBelow(name: string): string[] {
    const out = [name];
    for (let i = 0; i < out.length; i++) {
      for (const child of this.children.get(out[i]) ?? []) out.push(child);
    }
    return out;
  }

  private link(scope: Scope): void {
    const base = scope.extendsScope;
    if (base === undefined) return;
    let set = this.children.get(base);
    if (!set) this.children.set(base, (set = new Set()));
    set.add(scope.name);
  }

  private unlink(scope: Scope): void {
    const base = scope.extendsScope;
    const set = base === undefined ? undefined : this.children.get(base);
    set?.delete(scope.name);
    if (set?.size === 0) this.children.delete(base!);
  }

  addScope(
    name: string,
    options?: { extends?: string; description?: string; order?: import('./scope').ScopeOrder; metadata?: import('./scope').ScopeMetadata },
  ): Scope {
    this.validateScopeName(name);
    this.validateMetadata(name, options?.metadata);
    this.validateExtends(name, options?.extends);
    if (this.scopes.has(name)) {
      throw new ScopeError(`Scope "${name}" already exists`, name);
    }
    const scope = new Scope(name, this.book, options);
    this.scopes.set(name, scope);
    this.link(scope);
    if (options?.order !== undefined) scope.setOrder(options.order);
    return scope;
  }

  /** Token keys are `scope.token`, so a dotted scope name would produce keys
   *  nothing can address (`resolve('a.b.x')` splits at the first dot). */
  private validateScopeName(name: string): void {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new ScopeError('Scope name must be a non-empty string', name);
    }
    if (name.includes('.')) {
      throw new ScopeError(
        `Invalid scope name "${name}": "." separates scope from token and cannot appear in a scope name`,
        name,
      );
    }
  }

  private validateMetadata(name: string, metadata: unknown): void {
    if (metadata === undefined) return;
    const proto = metadata !== null && typeof metadata === 'object' ? Object.getPrototypeOf(metadata) : undefined;
    if (proto !== Object.prototype && proto !== null) {
      throw new ScopeError(`Scope "${name}": metadata must be a plain object`, name);
    }
  }

  /** An extends chain that reaches back to the new scope makes `get`, `has`
   *  and `getAllKeys` recurse forever. */
  private validateExtends(name: string, base?: string): void {
    if (base === undefined) return;
    if (base === name) {
      throw new ScopeError(`Scope "${name}" cannot extend itself`, name);
    }
    const seen = new Set<string>();
    let current: string | undefined = base;
    while (current !== undefined) {
      if (current === name) {
        throw new ScopeError(
          `Scope "${name}" cannot extend "${base}": the chain leads back to "${name}"`,
          name,
        );
      }
      if (seen.has(current)) return; // pre-existing loop elsewhere, not ours
      seen.add(current);
      current = this.scopes.get(current)?.extendsScope;
    }
  }

  /** Flatten `source`'s tokens (own and inherited) into an existing scope.
   *  The book creates the target through its own `addScope` — and so fires
   *  `scopeAdded` — before the tokens land. */
  copyTokensInto(source: string, target: Scope): void {
    const sourceScope = this.scopes.get(source);
    if (!sourceScope) {
      throw new ScopeError(`Scope "${source}" not found`, source);
    }
    // As written: a relative ref (`ref('.primary')`) stays relative and
    // reads the target's own keys.
    for (const key of sourceScope.getAllKeys()) {
      const token = sourceScope.getRaw(key);
      if (token) target.set(key, { ...token });
    }
  }

  /** Unregister a scope that was just added, silently — for an `addScope`
   *  the book refused after the fact. */
  _discard(name: string): void {
    const scope = this.scopes.get(name);
    if (!scope) return;
    scope.dispose();
    this.unlink(scope);
    this.scopes.delete(name);
  }

  /** Removes a scope; `notify` hears its keys (each with the token it
   *  held) while the scope is still registered but empty. */
  deleteScope(name: string, notify: (removed: Array<[string, AnyTokenValue | undefined]>) => void): string[] {
    const scope = this.scopes.get(name);
    if (!scope) {
      throw new ScopeError(`Scope "${name}" not found`, name);
    }
    const removed = scope.getAllKeys().map((k): [string, AnyTokenValue | undefined] => [`${name}.${k}`, scope.getRaw(k)]);
    // Release the book-level change subscription, so the listener set does
    // not keep a closure over a removed scope.
    scope.dispose();
    // Unlinked before it is emptied: emptying forgets what it extends.
    this.unlink(scope);
    // Empty the scope but keep it registered while notifying: every key
    // reads as gone (so the node is detached the way Scope.delete does it,
    // kept while dependents point at it, and the change fans out to them).
    // Unregister it only afterwards — even if a removal was refused.
    scope._detachForDeletion();
    try {
      notify(removed);
    } finally {
      this.scopes.delete(name);
    }
    return removed.map(([key]) => key);
  }

  hasScope(name: string): boolean {
    return this.scopes.has(name);
  }

  getScope(name: string): Scope | undefined {
    return this.scopes.get(name);
  }

  getAllScopes(): Scope[] {
    return Array.from(this.scopes.values());
  }

  getAllKeysForScope(name: string): string[] {
    const scope = this.scopes.get(name);
    if (!scope) {
      throw new ScopeError(`Scope "${name}" not found`, name);
    }
    return scope.getAllKeys();
  }

  getScopeDependencies(name: string): string[] {
    const scope = this.scopes.get(name);
    if (!scope) {
      throw new ScopeError(`Scope "${name}" not found`, name);
    }
    const deps: string[] = [];
    const tokens = scope.allTokens();
    for (const token of Object.values(tokens)) {
      if (token.type === 'reference') {
        const refToken = token as ReferenceValue;
        const refScope = scopeOf(refToken.key);
        if (refScope !== name) {
          deps.push(refToken.key);
        }
      } else if (token.type === 'function') {
        const fnToken = token as FunctionTokenValue;
        const fnDeps = functionDependencies(fnToken);
        for (const dep of fnDeps) {
          const depScope = scopeOf(dep);
          if (depScope !== name) {
            deps.push(dep);
          }
        }
      }
    }
    return deps;
  }
}
