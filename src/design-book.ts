import { ScopeManager } from './scope-manager';
import { DependencyGraph } from './dependency-graph';
import { Scope } from './scope';
import { TokenError } from './errors';
import type { AnyTokenValue, ReferenceValue, FunctionTokenValue } from './tokens';

export interface DesignBookOptions {
  mode?: 'auto' | 'batch';
  description?: string;
}

export class DesignBook {
  readonly name: string;
  readonly description?: string;

  private _mode: 'auto' | 'batch';
  private scopeManager: ScopeManager;
  private graph: DependencyGraph;
  private listeners: Map<string, Set<Function>> = new Map();
  private functions: Map<string, Function> = new Map();
  private batchQueue: Map<string, { newValue: any; oldValue: any }> = new Map();

  private _propagating = false;
  private _reentrantQueue: Array<{ key: string; newValue: any; oldValue: any }> = [];

  constructor(name: string, options?: DesignBookOptions) {
    this.name = name;
    this.description = options?.description;
    this._mode = options?.mode ?? 'auto';
    this.scopeManager = new ScopeManager(this);
    this.graph = new DependencyGraph();
  }

  // --- Mode ---

  get mode(): 'auto' | 'batch' {
    return this._mode;
  }

  set mode(value: 'auto' | 'batch') {
    this._mode = value;
  }

  get batchQueueSize(): number {
    return this.batchQueue.size;
  }

  // --- Scope delegation ---

  addScope(name: string, options?: { extends?: string; description?: string }): Scope {
    const scope = this.scopeManager.addScope(name, options);
    this.emit('scopeAdded', { scope: name });
    return scope;
  }

  extendScope(name: string, base: string, description?: string): Scope {
    return this.scopeManager.extendScope(name, base, description);
  }

  copyScope(source: string, target: string): Scope {
    return this.scopeManager.copyScope(source, target);
  }

  deleteScope(name: string): string[] {
    const keys = this.scopeManager.deleteScope(name);
    this.emit('scopeRemoved', { scope: name, removedKeys: keys });
    return keys;
  }

  getScope(name: string): Scope | undefined {
    return this.scopeManager.getScope(name);
  }

  hasScope(name: string): boolean {
    return this.scopeManager.hasScope(name);
  }

  getAllScopes(): Scope[] {
    return this.scopeManager.getAllScopes();
  }

  getAllKeysForScope(name: string): string[] {
    return this.scopeManager.getAllKeysForScope(name);
  }

  getScopeDependencies(name: string): string[] {
    return this.scopeManager.getScopeDependencies(name);
  }

  // --- Token operations ---

  resolve(key: string): string {
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) {
      throw new TokenError(`Invalid key format "${key}": expected "scope.token"`, key);
    }
    const scopeName = key.substring(0, dotIndex);
    const tokenName = key.substring(dotIndex + 1);
    const scope = this.scopeManager.getScope(scopeName);
    if (!scope) {
      throw new TokenError(`Scope "${scopeName}" not found`, key);
    }
    return scope.resolve(tokenName);
  }

  has(key: string): boolean {
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) return false;
    const scopeName = key.substring(0, dotIndex);
    const tokenName = key.substring(dotIndex + 1);
    const scope = this.scopeManager.getScope(scopeName);
    if (!scope) return false;
    return scope.has(tokenName);
  }

  getTokenByKey(key: string): AnyTokenValue | undefined {
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) return undefined;
    const scopeName = key.substring(0, dotIndex);
    const tokenName = key.substring(dotIndex + 1);
    const scope = this.scopeManager.getScope(scopeName);
    if (!scope) return undefined;
    return scope.get(tokenName);
  }

  getDependencyGraph(): DependencyGraph {
    return this.graph;
  }

  // --- Function registry ---

  registerFunction(name: string, impl: Function): void {
    this.functions.set(name, impl);
  }

  getFunction(name: string): Function | undefined {
    return this.functions.get(name);
  }

  // --- Events ---

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  watch(key: string, callback: (newValue: string | undefined, oldDetail: any) => void): void {
    this.on('tokenChanged', (event: { detail: any }) => {
      if (event.detail.key === key) {
        let newValue: string | undefined;
        try {
          newValue = this.resolve(key);
        } catch {
          newValue = undefined;
        }
        callback(newValue, event.detail);
      }
    });
  }

  private emit(event: string, detail: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        cb({ detail });
      }
    }
  }

  // --- Token change notification (called by Scope.set) ---

  _notifyTokenChange(qualifiedKey: string, newValue: any, oldValue: any): void {
    if (this._mode === 'batch') {
      this.batchQueue.set(qualifiedKey, { newValue, oldValue });
      return;
    }

    // Auto mode
    if (this._propagating) {
      this._reentrantQueue.push({ key: qualifiedKey, newValue, oldValue });
      return;
    }

    this._propagating = true;
    try {
      this._processAutoChange(qualifiedKey, newValue, oldValue);

      // Process any re-entrant changes
      while (this._reentrantQueue.length > 0) {
        const queued = this._reentrantQueue.shift()!;
        this._processAutoChange(queued.key, queued.newValue, queued.oldValue);
      }
    } finally {
      this._propagating = false;
    }
  }

  private _processAutoChange(qualifiedKey: string, newValue: any, oldValue: any): void {
    // Update dependency graph
    const deps = this._extractDepsFromValue(newValue);
    this.graph.addNode(qualifiedKey);
    // Always update edges (even when empty) to clear stale edges on deletion
    this.graph.updateEdges(qualifiedKey, deps);

    const changedKeys: string[] = [qualifiedKey];
    const scopeSet = new Set<string>();
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex !== -1) {
      scopeSet.add(qualifiedKey.substring(0, dotIndex));
    }

    // Fire tokenChanged for this key
    this.emit('tokenChanged', { key: qualifiedKey, newValue, oldValue });

    // Fire tokenChanged for all dependents with their actual resolved values
    const dependents = this.graph.getDependentsOf(qualifiedKey);
    for (const dep of dependents) {
      changedKeys.push(dep);
      const depDotIndex = dep.indexOf('.');
      if (depDotIndex !== -1) {
        scopeSet.add(dep.substring(0, depDotIndex));
      }
      // Bug 4 fix: try to resolve the dependent's new value
      let depNewValue: any;
      try {
        depNewValue = this.resolve(dep);
      } catch {
        depNewValue = undefined;
      }
      this.emit('tokenChanged', { key: dep, newValue: depNewValue, oldValue: undefined });
    }

    // If the token was deleted (newValue is undefined), remove the node from the graph
    if (newValue === undefined) {
      this.graph.removeNode(qualifiedKey);
    }

    // Fire change event with summary
    this.emit('change', {
      changedKeys,
      scopes: Array.from(scopeSet),
    });
  }

  private _extractDepsFromValue(value: any): string[] {
    if (!value || typeof value !== 'object') return [];
    if (value.type === 'reference') {
      return [(value as ReferenceValue).key];
    }
    if (value.type === 'function') {
      const fn = value as FunctionTokenValue;
      return fn.metadata?.dependencies ?? [];
    }
    return [];
  }

  // --- Batch ---

  flush(): { processed: string[]; errors: Error[] } {
    const processed: string[] = [];
    const errors: Error[] = [];
    const failedKeys = new Set<string>();

    const keys = Array.from(this.batchQueue.keys());

    // Add all keys as nodes and update edges
    for (const key of keys) {
      this.graph.addNode(key);
      const entry = this.batchQueue.get(key)!;
      const deps = this._extractDepsFromValue(entry.newValue);
      try {
        this.graph.updateEdges(key, deps);
      } catch (e) {
        // Collect circular dependency errors instead of ignoring them
        errors.push(e instanceof Error ? e : new Error(String(e)));
        failedKeys.add(key);
      }
    }

    // Filter out failed keys before sorting
    const validKeys = keys.filter(k => !failedKeys.has(k));

    // Try topological sort — don't fall back to original order on failure
    let sortedKeys: string[];
    try {
      sortedKeys = this.graph.topologicalSort(validKeys);
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
      sortedKeys = [];
    }

    // Process each key
    for (const key of sortedKeys) {
      try {
        this.resolve(key);
        processed.push(key);
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
        failedKeys.add(key);
      }
    }

    // Also check valid keys not in sorted output (e.g. those with unresolvable refs)
    for (const key of validKeys) {
      if (!processed.includes(key) && !failedKeys.has(key)) {
        try {
          this.resolve(key);
          processed.push(key);
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)));
          failedKeys.add(key);
        }
      }
    }

    // Only clear processed keys from the queue, not failed ones
    for (const key of processed) {
      this.batchQueue.delete(key);
    }

    if (errors.length > 0) {
      this.emit('batch-failed', { processed, errors });
    } else {
      this.emit('batch-complete', { processed });
    }

    return { processed, errors };
  }
}
