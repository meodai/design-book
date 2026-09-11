import { Scope } from './scope';
import { ScopeError } from './errors';
import type { ReferenceValue, FunctionTokenValue } from './tokens';

export class ScopeManager {
  private scopes: Map<string, Scope> = new Map();
  private book: any;

  constructor(book: any) {
    this.book = book;
  }

  addScope(
    name: string,
    options?: { extends?: string; description?: string; compose?: string; order?: import('./scope').ScopeOrder },
  ): Scope {
    this.validateScopeName(name);
    this.validateExtends(name, options?.extends);
    if (this.scopes.has(name)) {
      throw new ScopeError(`Scope "${name}" already exists`, name);
    }
    const scope = new Scope(name, this.book, options);
    this.scopes.set(name, scope);
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

  extendScope(name: string, base: string, description?: string): Scope {
    return this.addScope(name, { extends: base, description });
  }

  copyScope(source: string, target: string): Scope {
    if (!this.scopes.has(source)) {
      throw new ScopeError(`Scope "${source}" not found`, source);
    }
    const targetScope = this.addScope(target);
    this.copyTokensInto(source, targetScope);
    return targetScope;
  }

  /** Flatten `source`'s tokens (own and inherited) into an existing scope.
   *  Split out of `copyScope` so the book can create the target through its
   *  own `addScope` — and so fire `scopeAdded` — before the tokens land. */
  copyTokensInto(source: string, target: Scope): void {
    const sourceScope = this.scopes.get(source);
    if (!sourceScope) {
      throw new ScopeError(`Scope "${source}" not found`, source);
    }
    for (const [key, token] of Object.entries(sourceScope.allTokens())) {
      target.set(key, { ...token });
    }
  }

  deleteScope(name: string): string[] {
    const scope = this.scopes.get(name);
    if (!scope) {
      throw new ScopeError(`Scope "${name}" not found`, name);
    }
    const keys = scope.getAllKeys().map(k => `${name}.${k}`);
    // I2 fix: release the book-level change subscription before removing the
    // scope so the listener Set doesn't retain a stale closure forever.
    scope.dispose();
    // Empty the scope but keep it registered while notifying: that makes
    // every key read as gone (so the node is detached the way Scope.delete
    // does it, keeping it while dependents point at it, and the change fans
    // out to them) while the book can still reach the scope to refresh those
    // dependents' reference caches. Unregister it only afterwards.
    scope._detachForDeletion();
    for (const key of keys) {
      this.book._notifyTokenChange(key, undefined, undefined);
    }
    this.scopes.delete(name);
    return keys;
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
        const refScope = refToken.key.split('.')[0];
        if (refScope !== name) {
          deps.push(refToken.key);
        }
      } else if (token.type === 'function') {
        const fnToken = token as FunctionTokenValue;
        const fnDeps = fnToken.metadata?.dependencies ?? [];
        for (const dep of fnDeps) {
          const depScope = dep.split('.')[0];
          if (depScope !== name) {
            deps.push(dep);
          }
        }
      }
    }
    return deps;
  }
}
