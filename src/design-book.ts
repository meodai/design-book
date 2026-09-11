import { ScopeManager } from './scope-manager';
import { DependencyGraph } from './dependency-graph';
import { Scope } from './scope';
import { ScopeError, TokenError } from './errors';
import { registerBuiltinFunctions } from './functions';
import { registerBuiltinOrderers } from './orderers';
import type { AnyTokenValue, FunctionArg, ReferenceValue, FunctionTokenValue, ScopeFunctionArg, TokenValue } from './tokens';
import type { TokenOrderer } from './orderers';
import { extractVisualDependencies, isFunctionTokenValue, isReferenceValue, isTokenValue, string as stringToken } from './tokens';
import type { Ramp } from 'dittotones';
import { RampEngine, rampImpl } from './functions/color/ramp';
import { FunctionError } from './errors';
import { getTailwindRamps } from './data/tailwind-ramps';
import { registerBuiltinRenderers } from './renderers/builtin';

/** A renderer is any function from a book (and optional options) to a
 *  string. Register one with `book.registerRenderer(name, fn)` and invoke
 *  it with `book.render(name, options?)`. */
export type RendererFn = (book: DesignBook, options?: unknown) => string;

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

export interface ErrorDetail {
  /** Key whose change was rejected. */
  key: string;
  error: Error;
  /** Where the rejection happened. `reentrant`: the change was made from an
   *  event handler while a previous change was still propagating, so it was
   *  queued; by the time it ran, the outer `set()` had already returned and
   *  there was nobody left to throw at. */
  phase: 'reentrant';
}

export interface DesignBookEventMap {
  tokenChanged: TokenChangedDetail;
  change: ChangeDetail;
  scopeAdded: ScopeAddedDetail;
  scopeRemoved: ScopeRemovedDetail;
  'batch-failed': BatchFailedDetail;
  'batch-complete': BatchCompleteDetail;
  error: ErrorDetail;
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
  private renderers: Map<string, RendererFn> = new Map();
  private orderers: Map<string, TokenOrderer> = new Map();
  private batchQueue: Map<string, { newValue: any; oldValue: any }> = new Map();

  private _propagating = false;
  private _reentrantQueue: Array<{ key: string; newValue: any; oldValue: any }> = [];

  /** Keys currently backed by a stored token, as far as the graph knows.
   *  Used to spot the moment a scope gains or loses a member so that
   *  scope-iterating function tokens can refresh their candidate-pool edges. */
  private _liveKeys: Set<string> = new Set();

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
    registerBuiltinOrderers(this);
    this.registerFunction('ramp', (seedValue: string, options?: { shade: string }) => {
      if (!options?.shade) {
        throw new FunctionError('ramp: missing required "shade" option', 'ramp');
      }
      return rampImpl(seedValue, options.shade, this.getRampEngine());
    });
    registerBuiltinRenderers(this);
  }

  // --- Mode ---

  get mode(): 'auto' | 'batch' {
    return this._mode;
  }

  set mode(value: 'auto' | 'batch') {
    const wasBatching = this._mode === 'batch';
    this._mode = value;
    // Leaving batch mode: anything still queued would otherwise sit
    // unpropagated until some later, unrelated flush.
    if (wasBatching && value !== 'batch' && this.batchQueue.size > 0) {
      this.flush();
    }
  }

  get batchQueueSize(): number {
    return this.batchQueue.size;
  }

  // --- Scope delegation ---

  addScope(
    name: string,
    options?: { extends?: string; description?: string; compose?: string; order?: import('./scope').ScopeOrder },
  ): Scope {
    const scope = this.scopeManager.addScope(name, options);
    this._linkInheritedKeysOf(name);
    this.emit('scopeAdded', { scope: name });
    return scope;
  }

  extendScope(name: string, base: string, description?: string): Scope {
    return this.addScope(name, { extends: base, description });
  }

  /** Convenience for creating a typography scope. Equivalent to
   *  `addScope(name, { compose: 'typography' })` plus `.set()` for each
   *  property. Plain string values are auto-wrapped with `string(...)`;
   *  refs and token values pass through unchanged. Any keys are allowed
   *  — renderers consult the canonical typography keys (`fontFamily`,
   *  `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`) for the
   *  W3 composite output. */
  addTypography(
    name: string,
    properties: Record<string, AnyTokenValue | string>,
    options?: { extends?: string; description?: string },
  ): Scope {
    const scope = this.addScope(name, { ...options, compose: 'typography' });
    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'string') {
        scope.set(key, stringToken(value));
      } else if (isReferenceValue(value) || isTokenValue(value) || (value as { type?: string }).type === 'function') {
        scope.set(key, value as AnyTokenValue);
      } else {
        throw new TokenError(
          `addTypography "${name}.${key}": value must be a token, reference, or string — got ${typeof value}`,
          `${name}.${key}`,
        );
      }
    }
    return scope;
  }

  copyScope(source: string, target: string): Scope {
    if (!this.scopeManager.hasScope(source)) {
      throw new ScopeError(`Scope "${source}" not found`, source);
    }
    // Create the target through addScope so it validates the name and fires
    // scopeAdded before the copied tokens start emitting tokenChanged.
    const scope = this.addScope(target);
    this.scopeManager.copyTokensInto(source, scope);
    return scope;
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

  /** Invalidate the ordered-keys cache of every scope that (transitively)
   *  extends `name`, because they merge `name`'s keys / may inherit its order. */
  invalidateDescendantOrderCaches(name: string): void {
    for (const scope of this.scopeManager.getAllScopes()) {
      if (scope.name === name) continue;
      let cur: string | undefined = scope.extendsScope;
      while (cur) {
        if (cur === name) { scope.invalidateOrderCache(); break; }
        cur = this.scopeManager.getScope(cur)?.extendsScope;
      }
    }
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

  // --- Orderer registry ---

  registerOrderer(type: string, orderer: TokenOrderer): void {
    this.orderers.set(type, orderer);
  }

  getOrderer(type: string): TokenOrderer | undefined {
    return this.orderers.get(type);
  }

  /** Registered orderer types in registration order. */
  getOrdererTypes(): string[] {
    return Array.from(this.orderers.keys());
  }

  // --- Renderer registry ---

  /** Register a named renderer. A renderer is any function from
   *  `(book, options?)` to a string. Built-in names ('css-variables',
   *  'json', 'w3-design-tokens', 'svg') are pre-registered; registering
   *  the same name again replaces the previous renderer. */
  registerRenderer(name: string, renderer: RendererFn): void {
    this.renderers.set(name, renderer);
  }

  /** Invoke a registered renderer by name. Throws if no renderer is
   *  registered under that name. */
  render(name: string, options?: unknown): string {
    const renderer = this.renderers.get(name);
    if (!renderer) {
      throw new TokenError(`Renderer "${name}" is not registered`, name);
    }
    return renderer(this, options);
  }

  /** Names of all currently registered renderers. */
  getRendererNames(): string[] {
    return Array.from(this.renderers.keys());
  }

  /** Look up a registered renderer function by name. */
  getRenderer(name: string): RendererFn | undefined {
    return this.renderers.get(name);
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

      // Process any re-entrant changes. Each one gets its own try/catch: the
      // outer set() has already been accepted, so a failure here must roll
      // back *that* key rather than surface as an exception from an unrelated
      // set(), and it must not abandon the changes queued behind it.
      while (this._reentrantQueue.length > 0) {
        const queued = this._reentrantQueue.shift()!;
        try {
          this._processAutoChange(queued.key, queued.newValue, queued.oldValue);
        } catch (e) {
          this._rollbackKey(queued.key, queued.oldValue);
          this.emit('error', {
            key: queued.key,
            error: e instanceof Error ? e : new Error(String(e)),
            phase: 'reentrant',
          });
        }
      }
    } finally {
      this._propagating = false;
      this._reentrantQueue.length = 0;
    }
  }

  private _rollbackKey(qualifiedKey: string, oldValue: AnyTokenValue | undefined): void {
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex === -1) return;
    const scope = this.scopeManager.getScope(qualifiedKey.substring(0, dotIndex));
    scope?._rollback(qualifiedKey.substring(dotIndex + 1), oldValue);
  }

  private _processAutoChange(qualifiedKey: string, newValue: any, oldValue: any): void {
    const previousDependents = this.graph.getDependentsOf(qualifiedKey);
    const currentValue = this.getTokenByKey(qualifiedKey);

    if (currentValue) {
      const deps = this._getEffectiveDepsForKey(qualifiedKey, currentValue);
      const pool = this._getPoolDepsForKey(qualifiedKey, currentValue);
      const previousDeps = this.graph.getPrerequisitesFor(qualifiedKey);
      const hadNode = this.graph.hasNode(qualifiedKey);
      this.graph.addNode(qualifiedKey);
      try {
        this.graph.updateEdges(qualifiedKey, deps, pool);
        this._linkInheritedDependencies(deps, pool);
      } catch (e) {
        this.graph.updateEdges(qualifiedKey, previousDeps);
        // The caller will drop the token; don't leave a node behind for a key
        // the graph never accepted in the first place.
        if (!hadNode) this.graph.removeNode(qualifiedKey);
        throw e;
      }
      this._updateReferenceCaches(qualifiedKey);
      this._updateOwnReferenceCaches(qualifiedKey);
      if (!this._liveKeys.has(qualifiedKey)) {
        this._liveKeys.add(qualifiedKey);
        this._refreshPoolEdges(qualifiedKey);
      }
    } else {
      this._updateReferenceCaches(qualifiedKey, previousDependents);
      this._detachNode(qualifiedKey);
      if (this._liveKeys.delete(qualifiedKey)) {
        this._refreshPoolEdges(qualifiedKey);
      }
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
    const dependents = this._collectDependents(qualifiedKey, previousDependents);
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

  /** Live candidate pool of a function token: every key of the scope(s) it
   *  iterates, read fresh from the scope rather than from the
   *  construction-time `metadata.visualDependencies` snapshot. The token's
   *  own key is excluded so `s.text = bestContrastWith(ref('s.bg'), s)`
   *  doesn't depend on itself. */
  private _getPoolDepsForKey(qualifiedKey: string, value: AnyTokenValue): string[] {
    if (value.type !== 'function') return [];
    const source = this.getSourceKey(qualifiedKey);
    // An inherited token's pool edges belong to the token it inherits from.
    if (source && source !== qualifiedKey) return [];
    return extractVisualDependencies((value as FunctionTokenValue).args)
      .filter(key => key !== qualifiedKey);
  }

  /** A scope-iterating function's pool is its scope's live key list, so a
   *  scope gaining or losing a member changes the dependencies of every
   *  function token that iterates it (or iterates a scope that inherits
   *  from it). Re-register those edges. */
  private _refreshPoolEdges(changedKey: string): void {
    const dotIndex = changedKey.indexOf('.');
    if (dotIndex === -1) return;
    const affected = this._scopeAndDescendants(changedKey.substring(0, dotIndex));

    for (const scope of this.scopeManager.getAllScopes()) {
      for (const name of scope.ownKeys()) {
        const token = scope.get(name);
        if (!token || token.type !== 'function') continue;
        if (!this._iteratesAnyScope(token as FunctionTokenValue, affected)) continue;
        const key = `${scope.name}.${name}`;
        if (key === changedKey) continue;
        this.graph.addNode(key);
        try {
          this.graph.updateEdges(
            key,
            this._getEffectiveDepsForKey(key, token),
            this._getPoolDepsForKey(key, token),
          );
        } catch {
          // A hard-dependency cycle here pre-dates this refresh; leave the
          // token's existing edges in place rather than failing the change
          // that merely grew the pool.
        }
      }
    }
  }

  /** `name` plus every scope that (transitively) extends it — their
   *  `getAllKeys()` all include `name`'s keys. */
  private _scopeAndDescendants(name: string): Set<string> {
    const names = new Set([name]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const scope of this.scopeManager.getAllScopes()) {
        if (names.has(scope.name)) continue;
        if (scope.extendsScope && names.has(scope.extendsScope)) {
          names.add(scope.name);
          grew = true;
        }
      }
    }
    return names;
  }

  private _iteratesAnyScope(fn: FunctionTokenValue, scopeNames: Set<string>): boolean {
    for (const arg of fn.args) {
      if (isFunctionTokenValue(arg)) {
        if (this._iteratesAnyScope(arg, scopeNames)) return true;
        continue;
      }
      if (typeof arg !== 'object' || arg === null) continue;
      const scopeArg = arg as ScopeFunctionArg;
      if (typeof scopeArg.getAllKeys === 'function' && scopeNames.has(scopeArg.name)) return true;
    }
    return false;
  }

  /** A key that resolves through `extends` owns no token of its own, so
   *  nothing ever gave it an edge from the parent key it reads. Register
   *  that edge so changes to the source propagate to whatever depends on
   *  the inherited key — and so cycle detection can see through
   *  inheritance. Pool members are linked optionally: a soft edge there
   *  must never reject an otherwise-legal change. */
  private _linkInheritedDependencies(dependencies: string[], poolDependencies: string[] = []): void {
    for (const dep of dependencies) {
      this._linkInheritedDependency(dep, false);
    }
    const hard = new Set(dependencies);
    for (const dep of poolDependencies) {
      if (!hard.has(dep)) this._linkInheritedDependency(dep, true);
    }
  }

  private _linkInheritedDependency(dep: string, optional: boolean): void {
    const source = this.getSourceKey(dep);
    if (!source || source === dep) return;
    this.graph.addNode(dep);
    if (optional) this.graph.updateEdges(dep, [], [source]);
    else this.graph.updateEdges(dep, [source]);
  }

  /** After a scope starts extending another, any of its inherited keys that
   *  already have dependents (e.g. a forward `ref('child.a')` written before
   *  the scope existed) need the edge from their new source. */
  private _linkInheritedKeysOf(scopeName: string): void {
    const scope = this.scopeManager.getScope(scopeName);
    if (!scope?.extendsScope) return;
    for (const name of scope.getAllKeys()) {
      const key = `${scopeName}.${name}`;
      if (!this.graph.hasNode(key)) continue;
      if (this.graph.getDependentsOf(key).length === 0) continue;
      this._linkInheritedDependency(key, false);
    }
  }

  /** Transitive dependents of `key`, seeded with keys that depended on it
   *  before the graph was re-wired. A scope-iterating function loses its edge
   *  to a pool member the moment that member disappears, so by fan-out time
   *  the traversal alone can no longer find it — yet it is exactly the token
   *  that needs to hear about the change. */
  private _collectDependents(key: string, alsoFrom: string[] = []): string[] {
    const seen = new Set<string>([key]);
    const dependents: string[] = [];
    const walk = (start: string): void => {
      for (const node of this.graph.dfsTraversal(start)) {
        if (seen.has(node)) continue;
        seen.add(node);
        dependents.push(node);
      }
    };
    walk(key);
    for (const previous of alsoFrom) walk(previous);
    return dependents;
  }

  /** Drop a deleted token from the graph without cutting the tokens that
   *  depend on it: `removeNode` would strip their incoming edge, so a later
   *  re-`set` of the same key would never reach them again. Keep the node as
   *  a dangling prerequisite while anything still points at it. */
  private _detachNode(qualifiedKey: string): void {
    if (this.graph.getDependentsOf(qualifiedKey).length > 0) {
      this.graph.updateEdges(qualifiedKey, []);
      return;
    }
    this.graph.removeNode(qualifiedKey);
  }

  private _updateReferenceCaches(qualifiedKey: string, dependentKeys?: string[]): void {
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex === -1) return;

    const scopeName = qualifiedKey.substring(0, dotIndex);
    const scope = this.scopeManager.getScope(scopeName);
    scope?.updateReferenceCaches(qualifiedKey, dependentKeys);
  }

  private _updateOwnReferenceCaches(qualifiedKey: string): void {
    const dotIndex = qualifiedKey.indexOf('.');
    if (dotIndex === -1) return;

    const scope = this.scopeManager.getScope(qualifiedKey.substring(0, dotIndex));
    scope?.updateOwnReferenceCaches(qualifiedKey.substring(dotIndex + 1));
  }

  // --- Batch ---

  flush(): { processed: string[]; errors: Error[] } {
    const processed: string[] = [];
    const errors: Error[] = [];
    const failedKeys = new Set<string>();
    /** Keys whose stored token was rolled back because the graph refused it;
     *  they leave the queue even though they were never processed. */
    const rejectedKeys = new Set<string>();
    const deletedKeys = new Set<string>();
    const previousDependents = new Map<string, string[]>();

    const keys = Array.from(this.batchQueue.keys());
    const queued = new Map(this.batchQueue);

    // Add all keys as nodes and update edges
    for (const key of keys) {
      previousDependents.set(key, this.graph.getDependentsOf(key));
      const currentValue = this.getTokenByKey(key);

      if (!currentValue) {
        deletedKeys.add(key);
        this._detachNode(key);
        continue;
      }

      const hadNode = this.graph.hasNode(key);
      this.graph.addNode(key);
      const deps = this._getEffectiveDepsForKey(key, currentValue);
      const pool = this._getPoolDepsForKey(key, currentValue);
      try {
        this.graph.updateEdges(key, deps, pool);
        this._linkInheritedDependencies(deps, pool);
      } catch (e) {
        // Collect circular dependency errors instead of ignoring them
        errors.push(e instanceof Error ? e : new Error(String(e)));
        failedKeys.add(key);
        // Undo the write the graph refused. Leaving it in place kept the
        // cyclic token in the scope and the key in the queue, so every later
        // flush re-reported the same error.
        rejectedKeys.add(key);
        this._rollbackKey(key, queued.get(key)?.oldValue);
        if (!hadNode) this.graph.removeNode(key);
      }
    }

    // Scopes that gained or lost a member need every function token that
    // iterates them re-wired before the topological pass.
    for (const key of keys) {
      if (failedKeys.has(key)) continue;
      if (deletedKeys.has(key)) {
        if (this._liveKeys.delete(key)) this._refreshPoolEdges(key);
      } else if (!this._liveKeys.has(key)) {
        this._liveKeys.add(key);
        this._refreshPoolEdges(key);
      }
    }

    for (const key of keys) {
      if (failedKeys.has(key)) continue;
      if (deletedKeys.has(key)) {
        this._updateReferenceCaches(key, previousDependents.get(key));
      } else {
        this._updateReferenceCaches(key);
        this._updateOwnReferenceCaches(key);
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

    // Only clear processed keys from the queue, not failed ones — except the
    // rejected ones, which no longer have a token to retry.
    for (const key of processed) {
      this.batchQueue.delete(key);
    }
    for (const key of rejectedKeys) {
      this.batchQueue.delete(key);
    }

    this._emitBatchChanges(processed, queued, previousDependents);

    if (errors.length > 0) {
      this.emit('batch-failed', { processed, errors });
    } else {
      this.emit('batch-complete', { processed });
    }

    return { processed, errors };
  }

  /** Batch counterpart of `_processAutoChange`'s notification half: one
   *  `tokenChanged` per processed key (with the queued new/old value), one
   *  per transitive dependent (with its freshly resolved value), and a
   *  single aggregate `change`. Every key is reported at most once. */
  private _emitBatchChanges(
    processed: string[],
    queued: Map<string, { newValue: any; oldValue: any }>,
    previousDependents: Map<string, string[]>,
  ): void {
    if (processed.length === 0) return;

    const changedKeys = [...new Set(processed)];
    const seen = new Set(changedKeys);
    for (const key of processed) {
      for (const dep of this._collectDependents(key, previousDependents.get(key))) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        changedKeys.push(dep);
      }
    }

    const scopes = new Set<string>();
    for (const key of changedKeys) {
      const dotIndex = key.indexOf('.');
      if (dotIndex !== -1) scopes.add(key.substring(0, dotIndex));

      const entry = queued.get(key);
      let newValue = entry?.newValue;
      if (!entry) {
        try {
          newValue = this.resolve(key);
        } catch {
          newValue = undefined;
        }
      }
      this.emit('tokenChanged', { key, newValue, oldValue: entry?.oldValue });
    }

    this.emit('change', { changedKeys, scopes: Array.from(scopes) });
  }
}
