import { Scope } from './scope';
import { ScopeError } from './errors';
import type { ReferenceValue, FunctionTokenValue } from './tokens';

export class ScopeManager {
  private scopes: Map<string, Scope> = new Map();
  private book: any;

  constructor(book: any) {
    this.book = book;
  }

  addScope(name: string, options?: { extends?: string; description?: string; compose?: string }): Scope {
    if (this.scopes.has(name)) {
      throw new ScopeError(`Scope "${name}" already exists`, name);
    }
    const scope = new Scope(name, this.book, options);
    this.scopes.set(name, scope);
    return scope;
  }

  extendScope(name: string, base: string, description?: string): Scope {
    return this.addScope(name, { extends: base, description });
  }

  copyScope(source: string, target: string): Scope {
    const sourceScope = this.scopes.get(source);
    if (!sourceScope) {
      throw new ScopeError(`Scope "${source}" not found`, source);
    }
    const targetScope = this.addScope(target);
    const tokens = sourceScope.allTokens();
    for (const [key, token] of Object.entries(tokens)) {
      targetScope.set(key, { ...token });
    }
    return targetScope;
  }

  deleteScope(name: string): string[] {
    const scope = this.scopes.get(name);
    if (!scope) {
      throw new ScopeError(`Scope "${name}" not found`, name);
    }
    const keys = scope.getAllKeys().map(k => `${name}.${k}`);
    const graph = this.book.getDependencyGraph();
    for (const key of keys) {
      graph.removeNode(key);
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
