import { ScopeManager } from './scope-manager';
import { DependencyGraph } from './dependency-graph';
import { Scope } from './scope';
import { TokenError } from './errors';
import { registerBuiltinFunctions } from './functions';
import type { AnyTokenValue, FunctionArg, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { Ramp } from 'dittotones';
import { RampEngine } from './functions/color/ramp';
import { getTailwindRamps } from './data/tailwind-ramps';

export interface DesignBookOptions {
  mode?: 'auto' | 'batch';
  description?: string;
  /** Reference ramps for the dittotones engine. Defaults to bundled Tailwind. */
  colorRamps?: Map<string, Ramp>;
  /** Pass-through to dittotones. Default: true. */
  preserveHueOffsets?: boolean;
  /** Pass-through to dittotones. Default: true. */
  gamutMap?: boolean;
}

export interface TokenChangedDetail {
  key: string;
  newValue: any;
  oldValue: any;
}

export interface ChangeDetail {
  changedKeys: string[];
  scopes: string[];
}

export interface ScopeAddedDetail {
  scope: string;
}

export interface ScopeRemovedDetail {
  scope: string;
  removedKeys: string[];
}

export interface BatchFailedDetail {
  processed: string[];
  errors: Error[];
}

export interface BatchCompleteDetail {
  processed: string[];
}

export interface DesignBookEventMap {
  tokenChanged: TokenChangedDetail;
  change: ChangeDetail;
  scopeAdded: ScopeAddedDetail;
  scopeRemoved: ScopeRemovedDetail;
  'batch-failed': BatchFailedDetail;
  'batch-complete': BatchCompleteDetail;
}

export type DesignBookEvent<K extends keyof DesignBookEventMap> = {
  detail: DesignBookEventMap[K];
};

export type FunctionImplementation<Args extends unknown[] = unknown[]> = (...args: Args) => string;

/** Bundled info about a token returned by `book.inspect(key)`. */
export interface TokenInspection {
  /** Fully-qualified key, e.g. `"color.brand"`. */
  key: string;
  /** Resolved string value (`#hex`, `16px`, …). Undefined if resolution fails. */
  value: string | undefined;
  /** The underlying token type — `"color"`, `"dimension"`, `"reference"`, `"function"`, etc. */
  tokenType: string;
  /** Graph prerequisites of this token. */
  dependencies: string[];
  /** Graph dependents of this token. */
  dependents: string[];
  /** True when the active value comes from a parent scope via inheritance. */
  isInherited: boolean;
  /** Fully-qualified key of the source token when the value is inherited. */
  source?: string;
  /** Free-text description, when one was set on the token. */
  description?: string;

  // Reference-token specifics
  /** Target key when the token is a reference. */
  refKey?: string;

  // Function-token specifics
  /** Function name when the token is a function. */
  function?: string;
  /** Function args (refs / tokens / scopes) when the token is a function. */
  args?: FunctionArg[];
  /** Function options when the token is a function. */
  options?: Record<string, unknown>;
  /** Declared return type when the token is a function (e.g. `"color"`). */
  returnType?: string;

  // Value-token specifics
  /** Raw stored value for value tokens (number for dimensions, hex for colors, …). */
  rawValue?: unknown;
  /** Unit (e.g. `"px"`) when the value token is a dimension. */
  unit?: string;
}

type EventCallback<K extends keyof DesignBookEventMap> = (event: DesignBookEvent<K>) => void;

export class DesignBook {
  readonly name: string;
  readonly description?: string;

  private _mode: 'auto' | 'batch';
  private scopeManager: ScopeManager;
  private graph: DependencyGraph;
  private listeners: Map<string, Set<Function>> = new Map();
  private functions: Map<string, FunctionImplementation> = new Map();
  private batchQueue: Map<string, { newValue: any; oldValue: any }> = new Map();

  private _propagating = false;
  private _reentrantQueue: Array<{ key: string; newValue: any; oldValue: any }> = [];

  private _rampEngine?: RampEngine;
  private _rampOptions: {
    colorRamps?: Map<string, Ramp>;
    preserveHueOffsets?: boolean;
    gamutMap?: boolean;
  };

  constructor(name: string, options?: DesignBookOptions) {
    this.name = name;
    this.description = options?.description;
    this._mode = options?.mode ?? 'auto';
    this._rampOptions = {
      colorRamps: options?.colorRamps,
      preserveHueOffsets: options?.preserveHueOffsets,
      gamutMap: options?.gamutMap,
    };
    this.scopeManager = new ScopeManager(this);
    this.graph = new DependencyGraph();
    registerBuiltinFunctions(this);
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

  getSourceKey(key: string): string | undefined {
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) return undefined;

    const scopeName = key.substring(0, dotIndex);
    const tokenName = key.substring(dotIndex + 1);
    const scope = this.scopeManager.getScope(scopeName);
    return scope?.getSourceKey(tokenName);
  }

  isInherited(key: string): boolean {
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) return false;

    const scopeName = key.substring(0, dotIndex);
    const tokenName = key.substring(dotIndex + 1);
    const scope = this.scopeManager.getScope(scopeName);
    return scope?.isInherited(tokenName) ?? false;
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

  /** Inspect a token in one call — bundle the resolved value, the underlying
   *  token shape, and the dependency-graph context around it. Replaces the
   *  three-step pattern of `resolve` + `getTokenByKey` + `graph.getIncoming`.
   *  Returns null when the key isn't registered. */
  inspect(key: string): TokenInspection | null {
    const token = this.getTokenByKey(key);
    if (!token) return null;

    let value: string | undefined;
    try {
      value = this.resolve(key);
    } catch {
      value = undefined;
    }

    const dotIndex = key.indexOf('.');
    const scopeName = dotIndex === -1 ? '' : key.substring(0, dotIndex);
    const tokenName = dotIndex === -1 ? key : key.substring(dotIndex + 1);
    const scope = scopeName ? this.scopeManager.getScope(scopeName) : undefined;
    const source = scope?.getSourceKey(tokenName);

    const inspection: TokenInspection = {
      key,
      value,
      tokenType: token.type,
      dependencies: this.graph.getIncoming(key),
      dependents: this.graph.getOutgoing(key),
      isInherited: source !== undefined && source !== key,
      source,
    };

    if (token.type === 'reference') {
      inspection.refKey = (token as ReferenceValue).key;
    } else if (token.type === 'function') {
      const fn = token as FunctionTokenValue;
      inspection.function = fn.name;
      inspection.args = fn.args;
      inspection.options = fn.options;
      inspection.returnType = fn.metadata?.returnType;
    } else {
      const tv = token as TokenValue;
      inspection.rawValue = tv.rawValue;
      if (tv.metadata?.unit) inspection.unit = tv.metadata.unit as string;
    }

    const description = (token as { description?: string }).description;
    if (description) inspection.description = description;

    return inspection;
  }

  // --- Function registry ---

  registerFunction<Args extends unknown[]>(name: string, impl: FunctionImplementation<Args>): void {
    this.functions.set(name, impl as FunctionImplementation);
  }

  getFunction(name: string): FunctionImplementation | undefined {
    const fn = this.functions.get(name);
    return typeof fn === 'function' ? fn : undefined;
  }

  getRampEngine(): RampEngine {
    if (!this._rampEngine) {
      this._rampEngine = new RampEngine({
        ramps: this._rampOptions.colorRamps ?? getTailwindRamps(),
        preserveHueOffsets: this._rampOptions.preserveHueOffsets,
        gamutMap: this._rampOptions.gamutMap,
      });
    }
    return this._rampEngine;
  }

  // --- Events ---

  on<K extends keyof DesignBookEventMap>(event: K, callback: EventCallback<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off<K extends keyof DesignBookEventMap>(event: K, callback: EventCallback<K>): void {
    this.listeners.get(event)?.delete(callback);
  }

  watch(
    key: string,
    callback: (newValue: string | undefined, detail: TokenChangedDetail) => void,
  ): () => void {
    return this.on('tokenChanged', (event) => {
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

  private emit<K extends keyof DesignBookEventMap>(event: K, detail: DesignBookEventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        (cb as EventCallback<K>)({ detail });
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
    const previousDependents = this.graph.getDependentsOf(qualifiedKey);
    const currentValue = this.getTokenByKey(qualifiedKey);

    if (currentValue) {
      const deps = this._getEffectiveDepsForKey(qualifiedKey, currentValue);
      this.graph.addNode(qualifiedKey);
      this.graph.updateEdges(qualifiedKey, deps);
      this._updateReferenceCaches(qualifiedKey);
    } else {
      this._updateReferenceCaches(qualifiedKey, previousDependents);
      this.graph.removeNode(qualifiedKey);
    }

    const changedKeys: string[] = [qualifiedKey];
    const scopeSet = new Set<string>();
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex !== -1) {
      scopeSet.add(qualifiedKey.substring(0, dotIndex));
    }

    // Fire tokenChanged for this key
    this.emit('tokenChanged', { key: qualifiedKey, newValue, oldValue });

    // Fire tokenChanged for all dependents with their actual resolved values
    const dependents = this.graph.dfsTraversal(qualifiedKey).slice(1);
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

  private _getEffectiveDepsForKey(qualifiedKey: string, value: AnyTokenValue): string[] {
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex === -1) {
      return this._extractDepsFromValue(value);
    }

    const scopeName = qualifiedKey.substring(0, dotIndex);
    const tokenName = qualifiedKey.substring(dotIndex + 1);
    const scope = this.scopeManager.getScope(scopeName);
    const sourceKey = scope?.getSourceKey(tokenName);

    if (sourceKey && sourceKey !== qualifiedKey) {
      return [sourceKey];
    }

    return this._extractDepsFromValue(value);
  }

  private _updateReferenceCaches(qualifiedKey: string, dependentKeys?: string[]): void {
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex === -1) return;

    const scopeName = qualifiedKey.substring(0, dotIndex);
    const scope = this.scopeManager.getScope(scopeName);
    scope?.updateReferenceCaches(qualifiedKey, dependentKeys);
  }

  // --- Batch ---

  flush(): { processed: string[]; errors: Error[] } {
    const processed: string[] = [];
    const errors: Error[] = [];
    const failedKeys = new Set<string>();
    const deletedKeys = new Set<string>();
    const previousDependents = new Map<string, string[]>();

    const keys = Array.from(this.batchQueue.keys());

    // Add all keys as nodes and update edges
    for (const key of keys) {
      previousDependents.set(key, this.graph.getDependentsOf(key));
      const currentValue = this.getTokenByKey(key);

      if (!currentValue) {
        deletedKeys.add(key);
        this.graph.removeNode(key);
        continue;
      }

      this.graph.addNode(key);
      const deps = this._getEffectiveDepsForKey(key, currentValue);
      try {
        this.graph.updateEdges(key, deps);
      } catch (e) {
        // Collect circular dependency errors instead of ignoring them
        errors.push(e instanceof Error ? e : new Error(String(e)));
        failedKeys.add(key);
      }
    }

    for (const key of keys) {
      if (failedKeys.has(key)) continue;
      if (deletedKeys.has(key)) {
        this._updateReferenceCaches(key, previousDependents.get(key));
      } else {
        this._updateReferenceCaches(key);
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
      if (deletedKeys.has(key)) {
        processed.push(key);
        continue;
      }

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
        if (deletedKeys.has(key)) {
          processed.push(key);
          continue;
        }

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
