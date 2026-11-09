import { ScopeManager } from './scope-manager';
import { DependencyGraph } from './dependency-graph';
import { Scope } from './scope';
import { ScopeError, TokenError } from './errors';
import { scopeOf, splitKey } from './keys';
import { registerBuiltinFunctions } from './functions';
import { registerBuiltinOrderers } from './orderers';
import type { AnyTokenValue, BindingContext, FunctionArg, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { TokenOrderer } from './orderers';
import { functionDependencies, hasRelativeKeys, isRelativeKey, iteratedScopesOf, isFieldKey, isScopeReference, tokenKeyOf } from './tokens';
import { isTypographyToken, typographyBase, typographyFieldDependencies, typographyFieldNames } from './functions/non-color/typography';
import type { Ramp } from 'dittotones';
import { RampEngine, rampImpl, rampSet } from './functions/color/ramp';
import type { RampSet, RampSetSource } from './functions/color/ramp';
import { tailwindV3Ramps } from 'dittotones/ramps/tailwind-v3';
import { followSource } from './functions/members';
import { FunctionError } from './errors';
import { registerBuiltinRenderers } from './renderers/builtin';

/** A renderer is any function from a book (and optional options) to a
 *  string. Register one with `book.registerRenderer(name, fn)` and invoke
 *  it with `book.render(name, options?)`. */
export type RendererFn = (book: DesignBook, options?: unknown) => string;

export interface DesignBookOptions {
  mode?: 'auto' | 'batch';
  description?: string;
  /** Master ramps for `ramp()`: one set (registered as `default`) or named
   *  sets, the first the default. Without it, Tailwind v3 (`tailwind-v3`).
   *  More can be added later with `book.registerRamps(name, set)`. */
  colorRamps?: RampSetSource | Record<string, RampSetSource>;
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
  /** Keys whose queued write or delete was refused and undone. */
  rejected: string[];
}

/** What `flush()` did: the keys it processed, the errors it collected
 *  (refusals, and keys that cannot resolve yet, such as a reference to a
 *  token not written yet), and the keys whose change it refused and undid. */
export interface FlushResult {
  processed: string[];
  errors: Error[];
  rejected: string[];
}

export interface BatchCompleteDetail {
  processed: string[];
}

export interface ErrorDetail {
  /** Key whose change was rejected. */
  key: string;
  error: Error;
  /** Where the rejection happened.
   *  `reentrant`: the change was made from an event handler while a previous
   *  change was still propagating, so it was queued; by the time it ran, the
   *  outer `set()` had already returned and there was nobody left to throw at.
   *  `rollback`: announcing that an already-announced change had been undone
   *  itself failed. */
  phase: 'reentrant' | 'rollback';
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

  // Field-key specifics (`type.title.fontSize`, tokenType `field`)
  /** The typography the field belongs to. */
  owner?: string;
  /** The field name. */
  field?: string;

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
  /** Queue entries already reported by a previous `flush()`. A key that
   *  fails to resolve stays queued, and re-announcing the identical pending
   *  write on every later flush is noise. Entry objects are replaced by each
   *  `_notifyTokenChange`, so identity is the "is this write new" stamp. */
  private reportedBatchEntries: WeakSet<object> = new WeakSet();

  private _propagating = false;
  /** `correction` marks an entry that re-announces a rolled-back key; if
   *  that fails too it is not corrected again. */
  private _reentrantQueue: Array<{ key: string; newValue: any; oldValue: any; correction?: boolean }> = [];

  /** True once the current top-level propagation has announced a change.
   *  `_notifyRollback` consults it: a change that was announced and then
   *  undone needs a corrective announcement, while one the graph refused
   *  before saying anything needs none. */
  private _announced = false;

  /** Keys currently backed by a stored token, as far as the graph knows.
   *  Used to spot the moment a key first appears, so that keys inheriting
   *  scopes were already pointing at can be linked to their new source. */
  private _liveKeys: Set<string> = new Set();

  /** Scope name → keys of the selectors that iterate it. A selector is a
   *  function token with a scope argument (bestContrastWith, nth, …); its
   *  candidate pool is the scope's live membership, which is not a value
   *  dependency — a pool member may legitimately be derived from the
   *  selector itself. Keeping the relation in an index rather than in the
   *  graph means such a pair no longer reads as a cycle, while a change to
   *  any pool member still fans out to the selector (see
   *  `_collectDependents`). */
  private _selectorsByScope: Map<string, Set<string>> = new Map();

  /** Reverse of `_selectorsByScope`, so a selector can be re-indexed
   *  without scanning every scope. */
  private _scopesBySelector: Map<string, Set<string>> = new Map();

  /** Master ramp sets by name: a fixed set, or the names of scopes whose
   *  tokens are the masters (one scope a ramp, its keys the shades), read
   *  live. Engines are made on first use; a scope set's engine is rebuilt
   *  when its colors change (`fingerprint`). */
  private _rampSets: Map<string, RampSet | { scopes: string[] }> = new Map();
  private _rampEngines: Map<string, { engine: RampEngine; fingerprint: string }> = new Map();
  private _buildingRampSets = new Set<string>();
  private _defaultRampSet = 'tailwind-v3';
  private _rampOptions: {
    preserveHueOffsets?: boolean;
    gamutMap?: boolean;
  };

  constructor(name: string, options?: DesignBookOptions) {
    this.name = name;
    this.description = options?.description;
    this._mode = options?.mode ?? 'auto';
    this._rampOptions = {
      preserveHueOffsets: options?.preserveHueOffsets,
      gamutMap: options?.gamutMap,
    };
    this._rampSets.set('tailwind-v3', tailwindV3Ramps);
    this.scopeManager = new ScopeManager(this);
    this.graph = new DependencyGraph();
    registerBuiltinFunctions(this);
    registerBuiltinOrderers(this);
    this.registerFunction('ramp', (seedValue: string, options?: { shade: string; from?: string }) => {
      if (!options?.shade) {
        throw new FunctionError('ramp: missing required "shade" option', 'ramp');
      }
      return rampImpl(seedValue, options.shade, this.getRampEngine(options.from));
    });
    registerBuiltinRenderers(this);
    const ramps = options?.colorRamps;
    if (ramps) {
      const named = isRampSetSource(ramps) ? { default: ramps } : (ramps as Record<string, RampSetSource>);
      Object.entries(named).forEach(([name, set], i) => this.registerRamps(name, set, { default: i === 0 }));
    }
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
    options?: { extends?: string; description?: string; order?: import('./scope').ScopeOrder; metadata?: import('./scope').ScopeMetadata },
  ): Scope {
    const scope = this.scopeManager.addScope(name, options);
    this._binding.version++;
    try {
      this._bindInheritedKeysOf(name);
    } catch (e) {
      this._discardScope(name);
      throw e;
    }
    this._linkInheritedKeysOf(name);
    this.emit('scopeAdded', { scope: name });
    return scope;
  }

  extendScope(name: string, base: string, description?: string): Scope {
    return this.addScope(name, { extends: base, description });
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
    this._binding.version++;
    const keys = this.scopeManager.deleteScope(name);
    this._binding.version++;
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

  /** The scope a key lives in and the name within it (`title.fontSize`
   *  for a field key), or `undefined` for a key without a scope part or
   *  whose scope does not exist. */
  private _locate(key: string): { scope: Scope; name: string } | undefined {
    const parts = splitKey(key);
    if (!parts) return undefined;
    const scope = this.scopeManager.getScope(parts[0]);
    return scope ? { scope, name: parts[1] } : undefined;
  }

  getSourceKey(key: string): string | undefined {
    const at = this._locate(key);
    return at?.scope.getSourceKey(at.name);
  }

  isInherited(key: string): boolean {
    const at = this._locate(key);
    return at?.scope.isInherited(at.name) ?? false;
  }

  /** True when `key` inherits a token that holds relative refs
   *  (`ref('.primary')`): the token is re-bound to the key's own scope, so
   *  it reads that scope's keys and gets graph edges of its own instead of
   *  one to its source. */
  isRebound(key: string): boolean {
    const at = this._locate(key);
    if (!at || at.name.includes('.') || at.scope.hasOwn(at.name)) return false;
    return hasRelativeKeys(at.scope.getRaw(at.name));
  }

  /** True when `key` reads the token of another key through `extends` and
   *  so is a plain hop to it in the graph: inherited, and not re-bound. */
  private _readsSource(key: string): boolean {
    const source = this.getSourceKey(key);
    return source !== undefined && source !== key && !this.isRebound(key);
  }

  /** How tokens read this book's `extends` chains while they are bound
   *  (`inherited`). The version moves with every scope added or
   *  removed, so a cached binding never outlives the chain it followed. */
  private readonly _binding: BindingContext = {
    parentOf: (name: string) => this.scopeManager.getScope(name)?.extendsScope,
    version: 0,
  };

  _bindingContext(): BindingContext {
    return this._binding;
  }

  // --- Token operations ---

  resolve(key: string): string {
    if (isRelativeKey(key)) {
      throw new TokenError(
        `"${key}" is relative to the scope that reads it; resolve it through a scope (scope.resolve("${key.slice(1)}")) or qualify it`,
        key,
      );
    }
    const parts = splitKey(key);
    if (!parts) {
      throw new TokenError(`Invalid key format "${key}": expected "scope.token"`, key);
    }
    const scope = this.scopeManager.getScope(parts[0]);
    if (!scope) {
      throw new TokenError(`Scope "${parts[0]}" not found`, key);
    }
    return scope.resolve(parts[1]);
  }

  has(key: string): boolean {
    const at = this._locate(key);
    if (!at) return false;
    const field = splitKey(at.name);
    if (field) {
      // `scope.token.field`: a field of the typography the token holds
      const names = typographyFieldNames(this, at.scope.get(field[0]));
      return names?.includes(field[1]) ?? false;
    }
    return at.scope.has(at.name);
  }

  getTokenByKey(key: string): AnyTokenValue | undefined {
    const at = this._locate(key);
    return at?.scope.get(at.name);
  }

  /** A field key (`type.title.fontSize`) seen through `inspect`: its value,
   *  what the field reads and who reads it. */
  private _inspectField(key: string): TokenInspection | null {
    if (!this.has(key)) return null;
    const owner = tokenKeyOf(key);
    let value: string | undefined;
    try {
      value = this.resolve(key);
    } catch {
      value = undefined;
    }
    const dependencies = this.graph.hasNode(key) ? this.graph.getIncoming(key) : this._fieldNodeDeps(key);
    return {
      key,
      value,
      tokenType: 'field',
      owner,
      field: key.slice(owner.length + 1),
      dependencies,
      dependents: this.graph.getOutgoing(key).filter((k) => k !== owner),
      isInherited: false,
    };
  }

  /** A token's prerequisites with its own field nodes looked through: a
   *  typography lists what its fields read, not the fields themselves. */
  private _visiblePrerequisites(key: string): string[] {
    const out = new Set<string>();
    for (const p of this.graph.getIncoming(key)) {
      if (isFieldKey(p) && tokenKeyOf(p) === key) {
        for (const q of this.graph.getIncoming(p)) out.add(q);
      } else {
        out.add(p);
      }
    }
    return [...out];
  }

  /** A token's dependents plus whatever reads one of its fields. */
  private _visibleDependents(key: string): string[] {
    const out = new Set(this.graph.getOutgoing(key));
    for (const fk of this._fieldNodesOf(key)) {
      for (const d of this.graph.getOutgoing(fk)) if (d !== key) out.add(d);
    }
    return [...out];
  }

  getDependencyGraph(): DependencyGraph {
    return this.graph;
  }

  /** Inspect a token in one call — bundle the resolved value, the underlying
   *  token shape, and the dependency-graph context around it. Replaces the
   *  three-step pattern of `resolve` + `getTokenByKey` + `graph.getIncoming`.
   *  Returns null when the key isn't registered. */
  inspect(key: string): TokenInspection | null {
    if (isFieldKey(key)) return this._inspectField(key);
    const token = this.getTokenByKey(key);
    if (!token) return null;

    let value: string | undefined;
    try {
      value = this.resolve(key);
    } catch {
      value = undefined;
    }

    const parts = splitKey(key);
    const scopeName = parts ? parts[0] : '';
    const tokenName = parts ? parts[1] : key;
    const scope = scopeName ? this.scopeManager.getScope(scopeName) : undefined;
    const source = scope?.getSourceKey(tokenName);

    const inspection: TokenInspection = {
      key,
      value,
      tokenType: token.type,
      dependencies: this._visiblePrerequisites(key),
      dependents: this._visibleDependents(key),
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

  /**
   * Adds a set of master ramps for `ramp()` to copy, under a name its
   * tokens refer to (`ramp(seed, { shade, from: name })`): a framework's
   * from dittotones, or your own built with `rampSet()`. Can be called any
   * time; registering a name again replaces the set, and the `ramp` tokens
   * reading it are announced as changed. `{ default: true }` makes it the
   * set a `ramp` without `from` copies.
   */
  registerRamps(
    name: string,
    set: RampSetSource | ReadonlyArray<Scope | ReferenceValue | string>,
    options?: { default?: boolean },
  ): this {
    if (typeof name !== 'string' || name.length === 0) {
      throw new FunctionError('registerRamps: a ramp set needs a name', 'ramp');
    }
    if (Array.isArray(set)) {
      // Scopes as masters: kept by name, read when a ramp resolves.
      const scopes = set.map((s) => {
        const scopeName = typeof s === 'string' ? s
          : s instanceof Scope ? s.name
          : isScopeReference(s) ? s.key
          : null;
        if (!scopeName || scopeName.includes('.')) {
          throw new FunctionError(`registerRamps: "${name}" takes scopes (a Scope, ref('scope') or its name), got ${JSON.stringify(s)}`, 'ramp');
        }
        return scopeName;
      });
      if (scopes.length < 2) throw new FunctionError(`registerRamps: "${name}" needs at least two scopes (one ramp each), got ${scopes.length}`, 'ramp');
      this._rampSets.set(name, { scopes });
    } else {
      this._rampSets.set(name, rampSet(set as RampSetSource));
    }
    this._rampEngines.delete(name);
    const wasDefault = this._defaultRampSet;
    if (options?.default) this._defaultRampSet = name;
    this._announceRampSet(name, wasDefault);
    return this;
  }

  /** The names of the registered ramp sets, the default first. */
  get rampSetNames(): string[] {
    return [this._defaultRampSet, ...[...this._rampSets.keys()].filter((n) => n !== this._defaultRampSet)];
  }

  /** The dittotones engine for a ramp set: the default one without a name. */
  getRampEngine(from?: string): RampEngine {
    const name = from ?? this._defaultRampSet;
    const source = this._rampSets.get(name);
    if (!source) {
      throw new FunctionError(`ramp: no ramp set "${name}"; registered: ${this.rampSetNames.join(', ')}`, 'ramp');
    }
    let set: RampSet;
    let fingerprint = '';
    if (source instanceof Map) {
      set = source;
    } else {
      const hexes = this._masterRamps(name, source.scopes);
      fingerprint = JSON.stringify(hexes);
      const cached = this._rampEngines.get(name);
      if (cached && cached.fingerprint === fingerprint) return cached.engine;
      set = rampSet(hexes);
    }
    const cached = this._rampEngines.get(name);
    if (cached && cached.fingerprint === fingerprint) return cached.engine;
    const engine = new RampEngine({
      ramps: set,
      preserveHueOffsets: this._rampOptions.preserveHueOffsets,
      gamutMap: this._rampOptions.gamutMap,
    });
    this._rampEngines.set(name, { engine, fingerprint });
    return engine;
  }

  /** The masters a scope set holds right now: scope → key → resolved color. */
  private _masterRamps(name: string, scopes: string[]): Record<string, Record<string, string>> {
    if (this._buildingRampSets.has(name)) {
      throw new FunctionError(`ramp: the ramp set "${name}" reads itself (a master is a ramp() of its own set)`, 'ramp');
    }
    this._buildingRampSets.add(name);
    try {
      const out: Record<string, Record<string, string>> = {};
      for (const scopeName of scopes) {
        const scope = this.getScope(scopeName);
        if (!scope) throw new FunctionError(`ramp: the ramp set "${name}" names the scope "${scopeName}", which does not exist`, 'ramp');
        const ramp: Record<string, string> = {};
        for (const key of scope.getAllKeys()) ramp[key] = String(scope.resolve(key));
        out[scopeName] = ramp;
      }
      return out;
    } finally {
      this._buildingRampSets.delete(name);
    }
  }

  /** The `ramp` tokens that copy a set whose masters include `node`'s scope. */
  private _rampsReadingMastersOf(node: string): string[] {
    const scopeName = scopeOf(node);
    const sets: string[] = [];
    for (const [name, source] of this._rampSets) {
      if (!(source instanceof Map) && source.scopes.includes(scopeName)) sets.push(name);
    }
    if (sets.length === 0) return [];
    return this._rampTokensReading((from) => sets.includes((from as string | undefined) ?? this._defaultRampSet));
  }

  /** Every `ramp` token whose `from` passes the test. */
  private _rampTokensReading(test: (from: unknown) => boolean): string[] {
    const keys: string[] = [];
    for (const scope of this.scopeManager.getAllScopes()) {
      for (const key of scope.ownKeys()) {
        const token = scope.getRaw(key) as FunctionTokenValue | undefined;
        if (token?.type === 'function' && token.name === 'ramp' && test(token.options?.from)) {
          keys.push(`${scope.name}.${key}`);
        }
      }
    }
    return keys;
  }

  /** The `ramp` tokens that read a set (or, when the default moved, the
   *  ones without `from`) and what follows from them, as one change. */
  private _announceRampSet(name: string, previousDefault: string): void {
    const keys = this._rampTokensReading((from) => (from ?? this._defaultRampSet) === name
      || (from === undefined && previousDefault !== this._defaultRampSet));
    if (keys.length === 0) return;
    const changed = new Set(keys);
    for (const key of keys) for (const dep of this._collectDependents(key)) changed.add(dep);
    const changedKeys = [...changed];
    const scopes = new Set(changedKeys.map(scopeOf));
    this.emit('change', { changedKeys, scopes: Array.from(scopes) });
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
      // Several writes to one key merge into one entry, which must keep the
      // value from before the first of them: it is what a rejected write
      // rolls back to and what listeners last heard about. An entry that has
      // already been through a flush (accepted, still failing to resolve)
      // was announced, so the new write starts from its value instead.
      const pending = this.batchQueue.get(qualifiedKey);
      const firstOld = pending && !this.reportedBatchEntries.has(pending) ? pending.oldValue : oldValue;
      this.batchQueue.set(qualifiedKey, { newValue, oldValue: firstOld });
      return;
    }

    // Auto mode
    if (this._propagating) {
      this._reentrantQueue.push({ key: qualifiedKey, newValue, oldValue });
      return;
    }

    this._propagating = true;
    this._announced = false;
    try {
      this._processAutoChange(qualifiedKey, newValue, oldValue);

      this._drainReentrantQueue();
    } finally {
      // The outer change may have bailed out — an event handler throwing, a
      // rejected write — with entries still queued. Their tokens are already
      // stored, so discarding them would leave orphans with no graph node
      // that nothing ever retries. Drain them through the same path instead.
      try {
        this._drainReentrantQueue();
      } catch (e) {
        // An exception may already be in flight towards the caller; letting
        // this one out of the finally would replace it and hide the cause.
        this._reportSuppressed(qualifiedKey, e, 'reentrant');
      } finally {
        // Backstop: a listener throwing out of the drain must not leave a
        // poisoned queue behind to replay on the next change.
        this._reentrantQueue.length = 0;
        this._propagating = false;
      }
    }
  }

  /** Apply the changes that were made while a previous one was propagating.
   *  Each gets its own try/catch: the outer `set()` has already been
   *  accepted, so a failure here must roll back *that* key rather than
   *  surface as an exception from an unrelated `set()`, and it must not
   *  abandon the changes queued behind it. */
  private _drainReentrantQueue(): void {
    /** Per key, the value last accepted by the graph during this drain —
     *  what a refused write rolls back to and what listeners last heard. A
     *  queued entry's own `oldValue` may be a value that was itself refused. */
    const accepted = new Map<string, AnyTokenValue | undefined>();
    while (this._reentrantQueue.length > 0) {
      const queued = this._reentrantQueue.shift()!;
      const oldValue = accepted.has(queued.key) ? accepted.get(queued.key) : queued.oldValue;
      // Writes queued behind this one have already replaced the stored
      // token; replay them one at a time, as auto mode would have, so this
      // entry is judged — and announced — with its own value.
      if (this._ownToken(queued.key) !== queued.newValue) {
        this._putToken(queued.key, queued.newValue);
      }
      // Whether *this* entry got announced; the outer change's flag is
      // restored afterwards so `_notifyRollback` still answers for it alone.
      const outerAnnounced = this._announced;
      this._announced = false;
      try {
        this._processAutoChange(queued.key, queued.newValue, oldValue);
        accepted.set(queued.key, queued.newValue);
      } catch (e) {
        const announced = this._announced;
        // Reporting must not throw either: the drain also runs from a
        // `finally`, where an escaping error would replace the caller's.
        try {
          this._rollbackKey(queued.key, oldValue);
        } catch { /* the token is already unusable; the report matters more */ }
        accepted.set(queued.key, oldValue);
        this._reportSuppressed(queued.key, e, queued.correction ? 'rollback' : 'reentrant');
        // A listener threw after the write was announced: listeners and
        // dependents were told about a value that is gone. Announce the
        // restored one next, through the same path.
        if (announced && !queued.correction) {
          this._reentrantQueue.unshift({
            key: queued.key,
            newValue: oldValue,
            oldValue: queued.newValue,
            correction: true,
          });
        }
      } finally {
        this._announced = outerAnnounced;
      }
    }
  }

  /** The token stored on the key's own scope, ignoring inheritance. */
  private _ownToken(qualifiedKey: string): AnyTokenValue | undefined {
    const at = this._locate(qualifiedKey);
    return at?.scope.hasOwn(at.name) ? at.scope.getRaw(at.name) : undefined;
  }

  /** Store (or, for `undefined`, remove) a key's own token without
   *  notifying anyone. */
  private _putToken(qualifiedKey: string, value: AnyTokenValue | undefined): void {
    const at = this._locate(qualifiedKey);
    at?.scope._rollback(at.name, value);
  }

  /** Announce that an already-announced change has been undone.
   *
   *  `Scope.set` rolls its token back only after `_notifyTokenChange` has
   *  returned — and handlers have by then been told the new value, and may
   *  have made further changes off the back of it. Without a second
   *  announcement every watcher and renderer keeps a value that no longer
   *  exists. A change the graph refused before saying anything needs no
   *  correction, hence the `_announced` guard.
   *
   *  Never throws: the caller is already on its way out with the original
   *  error, and replacing it would hide the real cause. */
  _notifyRollback(qualifiedKey: string, restoredValue: any, rejectedValue: any): void {
    if (!this._announced) return;
    try {
      this._notifyTokenChange(qualifiedKey, restoredValue, rejectedValue);
    } catch (e) {
      this._reportSuppressed(qualifiedKey, e, 'rollback');
    }
  }

  /** Report an error raised while another one is already in flight. */
  private _reportSuppressed(key: string, e: unknown, phase: ErrorDetail['phase']): void {
    try {
      this.emit('error', { key, error: e instanceof Error ? e : new Error(String(e)), phase });
    } catch {
      // An error listener that throws is not worth masking the original for.
    }
  }

  private _rollbackKey(qualifiedKey: string, oldValue: AnyTokenValue | undefined): void {
    if (!splitKey(qualifiedKey)) return;
    this._putToken(qualifiedKey, oldValue);
    // The write may already have been indexed and wired into the graph (a
    // listener can throw after both); the index, the graph edges and the
    // live-key set must describe the token that is actually stored now.
    const restored = this.getTokenByKey(qualifiedKey);
    this._indexSelector(qualifiedKey, restored);
    if (restored) {
      const rejectedDeps = this.graph.getPrerequisitesFor(qualifiedKey);
      this.graph.addNode(qualifiedKey);
      try {
        this._setEdges(qualifiedKey, this._getEffectiveDepsForKey(qualifiedKey, restored), restored);
      } catch { /* keep the edges it has; the restored value was accepted before */ }
      this._liveKeys.add(qualifiedKey);
      this._pruneOrphans(rejectedDeps);
    } else {
      this._detachNode(qualifiedKey);
      this._rewireFieldNodesOf(qualifiedKey);
      this._liveKeys.delete(qualifiedKey);
    }
    try {
      this._rebindShadows(qualifiedKey);
    } catch { /* the restored state was accepted before */ }
  }

  /** `Scope.delete` was refused (see `_rebindShadows`): the token is back
   *  in the scope; put the graph, index and caches back with it. */
  _restoreRejectedDelete(qualifiedKey: string, restored: AnyTokenValue): void {
    this._rollbackKey(qualifiedKey, restored);
  }

  private _processAutoChange(qualifiedKey: string, newValue: any, oldValue: any): void {
    const previousDependents = this.graph.getDependentsOf(qualifiedKey);
    const currentValue = this.getTokenByKey(qualifiedKey);
    /** Re-bound copies of this key in scopes that inherit it: their token
     *  is this one, so they change with it. */
    let shadows: string[] = [];

    if (currentValue) {
      const deps = this._getEffectiveDepsForKey(qualifiedKey, currentValue);
      const previousDeps = this.graph.getPrerequisitesFor(qualifiedKey);
      const hadNode = this.graph.hasNode(qualifiedKey);
      const isNewKey = !this._liveKeys.has(qualifiedKey);
      this.graph.addNode(qualifiedKey);
      let undoEdges = () => {};
      try {
        undoEdges = this._setEdges(qualifiedKey, deps, currentValue);
        this._linkInheritedDependencies(deps);
        if (isNewKey) this._linkInheritedShadowsOf(qualifiedKey);
        shadows = this._rebindShadows(qualifiedKey);
      } catch (e) {
        undoEdges();
        this.graph.updateEdges(qualifiedKey, previousDeps);
        // The caller will drop the token; don't leave a node behind for a key
        // the graph never accepted in the first place.
        if (!hadNode) this.graph.removeNode(qualifiedKey);
        this._pruneOrphans(deps);
        throw e;
      }
      this._pruneOrphans(previousDeps);
      this._indexSelector(qualifiedKey, currentValue);
      if (isNewKey) this._liveKeys.add(qualifiedKey);
    } else {
      this._indexSelector(qualifiedKey, undefined);
      this._detachNode(qualifiedKey);
      this._rewireFieldNodesOf(qualifiedKey);
      this._liveKeys.delete(qualifiedKey);
      shadows = this._rebindShadows(qualifiedKey);
    }

    const changedKeys: string[] = [qualifiedKey];
    const scopeSet = new Set<string>();
    if (splitKey(qualifiedKey)) scopeSet.add(scopeOf(qualifiedKey));

    // Fire tokenChanged for this key
    this._announced = true;
    this.emit('tokenChanged', { key: qualifiedKey, newValue, oldValue });

    // Fire tokenChanged for all dependents with their actual resolved values
    const dependents = this._collectDependents(qualifiedKey, [...previousDependents, ...shadows]);
    for (const dep of dependents) {
      this._reindexDynamic(dep);
      changedKeys.push(dep);
      if (splitKey(dep)) scopeSet.add(scopeOf(dep));
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
      return functionDependencies(value as FunctionTokenValue);
    }
    return [];
  }

  private _getEffectiveDepsForKey(qualifiedKey: string, value: AnyTokenValue): string[] {
    if (!splitKey(qualifiedKey)) {
      return this._extractDepsFromValue(value);
    }

    if (this._readsSource(qualifiedKey)) {
      return [this.getSourceKey(qualifiedKey)!];
    }

    // A typography depends on one node per field, so a ref to one field
    // is not tied to the others (see `_setEdges`); a variant also on its base.
    if (isTypographyToken(value)) {
      const base = typographyBase(value);
      return [...this._ownFieldKeys(qualifiedKey, value), ...(base ? [base] : [])];
    }

    return this._extractDepsFromValue(value);
  }

  // --- Field nodes ---
  //
  // `scope.token.field` nodes give typography fields their own place in the
  // graph. A typography's node depends on its own field nodes; each field
  // node depends on what that field reads (`typographyFieldDependencies`);
  // a field the token does not own — a variant's inherited field, a field
  // read through a ref, a field of an inherited shadow — points at the
  // field it actually reads, or at the token as a last resort. Field nodes
  // are never tokens: no events, no `_liveKeys`, pruned once unread.

  /** Field nodes in the graph, by owning token key. */
  private _fieldNodes: Map<string, Set<string>> = new Map();

  private _fieldNodesOf(key: string): string[] {
    const nodes = this._fieldNodes.get(key);
    if (!nodes) return [];
    for (const fk of nodes) if (!this.graph.hasNode(fk)) nodes.delete(fk);
    if (nodes.size === 0) this._fieldNodes.delete(key);
    return [...nodes];
  }

  private _ownFieldKeys(key: string, token: AnyTokenValue | undefined): string[] {
    if (!isTypographyToken(token)) return [];
    if (this._readsSource(key)) return [];
    return ((token.options?.fields ?? []) as string[]).map((f) => `${key}.${f}`);
  }

  private _fieldNodeDeps(fieldKey: string): string[] {
    const owner = tokenKeyOf(fieldKey);
    const field = fieldKey.slice(owner.length + 1);
    if (this._readsSource(owner)) return [`${this.getSourceKey(owner)}.${field}`];
    return typographyFieldDependencies(this.getTokenByKey(owner), field) ?? [owner];
  }

  /** Set the edges of `key` and of its field nodes as one step — clearing
   *  the field nodes first, so a field that changes between owned and
   *  inherited never forms a passing cycle — then wire every field node
   *  the new edges reach that nobody has wired yet. A cycle anywhere puts
   *  everything back and rethrows; the returned function does the same for
   *  a caller whose later step fails. */
  private _setEdges(key: string, deps: string[], token: AnyTokenValue | undefined): () => void {
    const graph = this.graph;
    // Nodes this call may create — the key, its field nodes, everything an
    // edge points from — so `undo` can drop the new ones without copying
    // the whole graph.
    const created = new Set<string>();
    const track = (keys: Iterable<string>) => {
      for (const k of keys) if (!graph.hasNode(k)) created.add(k);
    };
    const snapshots = new Map<string, string[] | null>();
    const snap = (k: string) => {
      if (!snapshots.has(k)) snapshots.set(k, graph.hasNode(k) ? graph.getPrerequisitesFor(k) : null);
    };
    const isWired = (fk: string) => graph.hasNode(fk) && (this._fieldNodes.get(tokenKeyOf(fk))?.has(fk) ?? false);
    const undo = () => {
      for (const k of snapshots.keys()) if (graph.hasNode(k)) graph.updateEdges(k, []);
      for (const [k, prev] of snapshots) {
        if (prev === null) continue;
        try { graph.updateEdges(k, prev); } catch { /* it was acyclic before */ }
      }
      for (const node of created) if (graph.hasNode(node)) graph.removeNode(node);
    };

    const fields = [...new Set([...this._ownFieldKeys(key, token), ...this._fieldNodesOf(key)])];
    snap(key);
    fields.forEach(snap);
    const pending = [...fields];
    for (const d of deps) {
      if (isFieldKey(d) && !isWired(d)) { snap(d); pending.push(d); }
    }

    try {
      for (const fk of fields) if (graph.hasNode(fk)) graph.updateEdges(fk, []);
      track([key, ...deps]);
      graph.addNode(key);
      graph.updateEdges(key, deps);
      const done = new Set<string>();
      while (pending.length > 0) {
        const fk = pending.shift()!;
        if (done.has(fk)) continue;
        done.add(fk);
        const fieldDeps = this._fieldNodeDeps(fk);
        for (const d of fieldDeps) {
          if (isFieldKey(d) && !done.has(d) && !isWired(d)) { snap(d); pending.push(d); }
        }
        track([fk, ...fieldDeps]);
        graph.addNode(fk);
        graph.updateEdges(fk, fieldDeps);
        const owner = tokenKeyOf(fk);
        if (!this._fieldNodes.has(owner)) this._fieldNodes.set(owner, new Set());
        this._fieldNodes.get(owner)!.add(fk);
        const inherited = fieldDeps.filter((d) => !isFieldKey(d));
        track(inherited.flatMap((d) => [d, this.getSourceKey(d) ?? d]));
        this._linkInheritedAll(inherited);
      }
    } catch (e) {
      undo();
      throw e;
    }
    return undo;
  }

  /** After a token is deleted, its remaining field nodes (still read by
   *  someone) fall back to the key, so re-adding it reaches their readers. */
  private _rewireFieldNodesOf(key: string): void {
    for (const fk of this._fieldNodesOf(key)) {
      try {
        this.graph.updateEdges(fk, this._fieldNodeDeps(fk));
      } catch { /* the key has no edges of its own any more */ }
    }
  }

  /** Record (or forget) `qualifiedKey` as a selector over the scopes its
   *  function token iterates. Called for every write and every delete, so
   *  the index always mirrors the stored tokens. */
  private _indexSelector(qualifiedKey: string, value: AnyTokenValue | undefined): void {
    const previous = this._scopesBySelector.get(qualifiedKey);
    if (previous) {
      for (const scopeName of previous) {
        const selectors = this._selectorsByScope.get(scopeName);
        selectors?.delete(qualifiedKey);
        if (selectors && selectors.size === 0) this._selectorsByScope.delete(scopeName);
      }
      this._scopesBySelector.delete(qualifiedKey);
    }

    if (!value || value.type !== 'function') return;
    // An inherited key carries the parent's token; the parent's own entry
    // already covers the pool, and the inheritance edge carries the change
    // down to the shadow.
    // A re-bound key is the exception: it reads its own scope's keys.
    if (this._readsSource(qualifiedKey)) return;

    const scopeNames = new Set(iteratedScopesOf(value as FunctionTokenValue));
    // `sibling` steps along the scale its anchor's color lives on, which can
    // be another scope than the anchor's — and can change when the anchor is
    // re-pointed (`_reindexDynamic` re-runs this on every notification).
    for (const name of this._walkedScopes(value as FunctionTokenValue)) scopeNames.add(name);
    if (scopeNames.size === 0) return;
    this._scopesBySelector.set(qualifiedKey, scopeNames);
    for (const scopeName of scopeNames) {
      let selectors = this._selectorsByScope.get(scopeName);
      if (!selectors) {
        selectors = new Set();
        this._selectorsByScope.set(scopeName, selectors);
      }
      selectors.add(qualifiedKey);
    }
  }

  /** The scope a `sibling` with a `source(…)` anchor currently steps along:
   *  where the anchor's references lead, which only following them tells
   *  (every other sibling declares its scope up front). Empty for any other
   *  token. */
  private _walkedScopes(token: FunctionTokenValue): string[] {
    if (token.name !== 'sibling' || token.args.length > 0) return [];
    const from = token.options?.from as { key?: unknown; via?: unknown } | undefined;
    if (!from || typeof from.key !== 'string' || (from.via !== 'root' && typeof from.via !== 'number')) return [];
    try {
      const key = followSource(this, 'sibling', from.key, from.via as number | 'root');
      return [scopeOf(key)];
    } catch {
      return []; // not followable yet; the next notification indexes it
    }
  }

  /** Re-index a notified `sibling`: where a `source` anchor leads can change
   *  with the tokens on the way, which notify it but are not its own write. */
  private _reindexDynamic(key: string): void {
    const token = this.getTokenByKey(key);
    if (token?.type === 'function' && (token as FunctionTokenValue).name === 'sibling') {
      this._indexSelector(key, token);
    }
  }

  /** Selectors whose candidate pool contains `changedKey` — those iterating
   *  the key's own scope, and those iterating a scope that inherits it
   *  through `extends` (a `dark extends palette` pool sees palette's keys).
   *  A selector never reports its own key back to itself. */
  private _selectorsIterating(changedKey: string): string[] {
    if (this._selectorsByScope.size === 0) return [];
    const parts = splitKey(changedKey);
    if (!parts) return [];
    const changedScope = parts[0];

    const selectors: string[] = [];
    for (const [iterated, keys] of this._selectorsByScope) {
      if (!this._scopeInheritsFrom(iterated, changedScope)) continue;
      for (const key of keys) {
        if (key !== changedKey) selectors.push(key);
      }
    }
    return selectors;
  }

  /** True when `scopeName` is `ancestor` or reaches it through `extends`. */
  private _scopeInheritsFrom(scopeName: string, ancestor: string): boolean {
    const seen = new Set<string>();
    let current: string | undefined = scopeName;
    while (current !== undefined && !seen.has(current)) {
      if (current === ancestor) return true;
      seen.add(current);
      current = this.scopeManager.getScope(current)?.extendsScope;
    }
    return false;
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

  /** A key that resolves through `extends` owns no token of its own, so
   *  nothing ever gave it an edge from the parent key it reads. Register
   *  that edge so changes to the source propagate to whatever depends on
   *  the inherited key — and so cycle detection can see through
   *  inheritance. */
  private _linkInheritedDependencies(dependencies: string[]): void {
    this._linkInheritedAll(dependencies);
  }

  private _linkInheritedDependency(dep: string): void {
    if (!this._readsSource(dep)) return;
    const source = this.getSourceKey(dep)!;
    this.graph.addNode(dep);
    this.graph.updateEdges(dep, [source]);
  }

  /** Link several inherited keys as one step: if any of them would close a
   *  cycle, the ones already re-pointed get their previous edges back
   *  before the error propagates. Otherwise the caller's cleanup (dropping
   *  the rejected key's node) took the earlier links down with it and left
   *  those keys with no edge at all. */
  private _linkInheritedAll(keys: Iterable<string>): void {
    const relinked: Array<{ key: string; hadNode: boolean; previous: string[] }> = [];
    try {
      for (const key of keys) {
        relinked.push({
          key,
          hadNode: this.graph.hasNode(key),
          previous: this.graph.getPrerequisitesFor(key),
        });
        this._linkInheritedDependency(key);
      }
    } catch (e) {
      for (const { key, hadNode, previous } of relinked.reverse()) {
        if (!hadNode) {
          this.graph.removeNode(key);
          continue;
        }
        try {
          this.graph.updateEdges(key, previous);
        } catch { /* they were acyclic a moment ago */ }
      }
      throw e;
    }
  }

  /** A brand-new key may be the source that inheriting scopes were waiting
   *  for: `other.x = ref('child.a')` written before `parent.a` existed left
   *  `child.a` as an orphan node. Link every descendant scope's shadow of
   *  this key that already has dependents. (Descendants that define the key
   *  themselves are skipped — `_linkInheritedDependency` only acts when the
   *  source differs from the key.) */
  private _linkInheritedShadowsOf(qualifiedKey: string): void {
    const parts = splitKey(qualifiedKey);
    if (!parts) return;
    const [scopeName, tokenName] = parts;

    const shadows: string[] = [];
    for (const name of this._scopeAndDescendants(scopeName)) {
      if (name === scopeName) continue;
      const key = `${name}.${tokenName}`;
      if (!this.graph.hasNode(key)) continue;
      if (this.graph.getDependentsOf(key).length === 0) continue;
      shadows.push(key);
    }
    this._linkInheritedAll(shadows);
  }

  // --- Re-bound shadows ---
  //
  // An inherited key normally reads its source's value, so the graph gives
  // it one edge, to the source, and only when something reads it. A token
  // with relative refs (`ref('.primary')`) is different: in `acme extends
  // brand`, `acme.button` reads `acme.primary`, not whatever `brand.button`
  // reads. Such a key is *re-bound* — wired like an own token, with the
  // token's dependencies qualified against its scope — and wired eagerly,
  // because its value changes with its own scope's keys even when nothing
  // reads it. The set below records which shadows are wired that way.

  private _boundShadows: Set<string> = new Set();

  /** Bring the inherited copies of `key` in scopes extending its scope in
   *  line with the token they now inherit: wire the re-bound ones, return
   *  the ones that stopped being re-bound to a plain hop. Returns every
   *  shadow whose wiring it touched — they change along with `key`'s token.
   *  A re-bound shadow can close a cycle that exists only in its own scope
   *  (`acme.primary = ref('acme.button')` against `button = ref('.primary')`
   *  written in `brand`): then nothing is changed and the error is thrown,
   *  so the write that caused it is refused. */
  private _rebindShadows(key: string): string[] {
    const parts = splitKey(key);
    if (!parts) return [];
    const [scopeName, tokenName] = parts;
    if (tokenName.includes('.')) return [];

    const bind: string[] = [];
    const unbind: string[] = [];
    for (const name of this._scopeAndDescendants(scopeName)) {
      const k = `${name}.${tokenName}`;
      const rebound = this.isRebound(k);
      // The key itself was just wired by the write that got us here.
      if (name === scopeName) {
        if (rebound) this._boundShadows.add(k);
        else this._boundShadows.delete(k);
        continue;
      }
      if (rebound) bind.push(k);
      else if (this._boundShadows.has(k)) unbind.push(k);
    }
    return [...this._bindShadows(bind), ...this._unbindShadows(unbind)];
  }

  /** Wire `keys` (re-bound shadows) as one step: a cycle undoes them all. */
  private _bindShadows(keys: string[]): string[] {
    const undos: Array<() => void> = [];
    const previous: string[] = [];
    try {
      for (const k of keys) {
        const token = this.getTokenByKey(k)!;
        const deps = this._getEffectiveDepsForKey(k, token);
        previous.push(...this.graph.getPrerequisitesFor(k));
        undos.push(this._setEdges(k, deps, token));
        this._linkInheritedAll(deps);
      }
    } catch (e) {
      for (const undo of undos.reverse()) undo();
      throw e;
    }
    for (const k of keys) {
      this._boundShadows.add(k);
      this._indexSelector(k, this.getTokenByKey(k));
    }
    this._pruneOrphans(previous);
    return keys;
  }

  /** Turn shadows that no longer inherit a relative token back into plain
   *  hops to their source — or drop them, when nothing reads them. */
  private _unbindShadows(keys: string[]): string[] {
    for (const k of keys) {
      this._boundShadows.delete(k);
      this._indexSelector(k, undefined);
      if (!this.graph.hasNode(k)) continue;
      const previous = this.graph.getPrerequisitesFor(k);
      this.graph.updateEdges(k, []);
      this._rewireFieldNodesOf(k);
      if (this.graph.getDependentsOf(k).length > 0) this._linkInheritedDependency(k);
      this._pruneOrphans([k, ...previous]);
    }
    return keys;
  }

  /** A scope that starts out extending another inherits every re-bound
   *  token at once. Wired as one step; a cycle throws and `addScope` drops
   *  the scope again. */
  private _bindInheritedKeysOf(scopeName: string): void {
    const scope = this.scopeManager.getScope(scopeName);
    if (!scope?.extendsScope) return;
    this._bindShadows(
      scope.getAllKeys().map((name) => `${scopeName}.${name}`).filter((k) => this.isRebound(k)),
    );
  }

  /** Undo an `addScope` whose inherited tokens were refused. */
  private _discardScope(name: string): void {
    this.scopeManager._discard(name);
    this._binding.version++;
    const prefix = `${name}.`;
    for (const node of this.graph.getAllNodes()) {
      if (!node.startsWith(prefix) || !this.graph.hasNode(node)) continue;
      this._boundShadows.delete(node);
      this._indexSelector(node, undefined);
      // Forward refs to the scope (`ref('acme.x')` written before it
      // existed) keep their target node; anything else goes.
      const previous = this.graph.getPrerequisitesFor(node);
      this.graph.updateEdges(node, []);
      this._pruneOrphans([node, ...previous]);
    }
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
      this._linkInheritedDependency(key);
    }
  }

  /** Transitive dependents of `key`, seeded with keys that depended on it
   *  before the graph was re-wired, and widened by the selector index: a
   *  selector has no graph edge to its candidate pool, yet any key of the
   *  scope it iterates changing (or appearing, or going away) changes what
   *  it picks. Every key reached that way is itself fanned out from, so a
   *  selector feeding another selector's pool still propagates; `seen`
   *  keeps mutual pools from recursing. */
  private _collectDependents(key: string, alsoFrom: string[] = []): string[] {
    const seen = new Set<string>([key]);
    const dependents: string[] = [];
    const pending: string[] = [key];

    const walk = (start: string): void => {
      for (const node of this.graph.dfsTraversal(start)) {
        if (seen.has(node)) continue;
        seen.add(node);
        // A field node is a hop to its readers, never a token to report.
        if (isFieldKey(node)) continue;
        dependents.push(node);
        pending.push(node);
      }
    };

    walk(key);
    for (const previous of alsoFrom) walk(previous);
    // A typography's fields are upstream of it: whoever reads one of them
    // must hear that the token changed.
    for (const fk of this._fieldNodesOf(key)) walk(fk);

    while (pending.length > 0) {
      const node = pending.shift()!;
      // A ramp copying master scopes changes when a master does, though it
      // has no graph edge to them (like a selector's pool).
      for (const rampKey of this._rampsReadingMastersOf(node)) {
        if (seen.has(rampKey)) continue;
        seen.add(rampKey);
        dependents.push(rampKey);
        pending.push(rampKey);
        walk(rampKey);
      }
      for (const selector of this._selectorsIterating(node)) {
        if (seen.has(selector)) continue;
        seen.add(selector);
        dependents.push(selector);
        pending.push(selector);
        walk(selector);
      }
    }

    return dependents;
  }

  /** Drop a deleted token from the graph without cutting the tokens that
   *  depend on it: `removeNode` would strip their incoming edge, so a later
   *  re-`set` of the same key would never reach them again. Keep the node as
   *  a dangling prerequisite while anything still points at it. */
  private _detachNode(qualifiedKey: string): void {
    const prerequisites = this.graph.getPrerequisitesFor(qualifiedKey);
    if (this.graph.getDependentsOf(qualifiedKey).length > 0) {
      this.graph.updateEdges(qualifiedKey, []);
    } else {
      this.graph.removeNode(qualifiedKey);
    }
    this._pruneOrphans(prerequisites);
  }

  /** Drop the nodes among `candidates` that nothing depends on any more and
   *  that stand for no token of their own: a key that was only ever
   *  referenced (or was deleted while referenced), or an inherited shadow
   *  linked for a reader that has since gone. Called with a key's former
   *  prerequisites whenever its edges change, so such nodes do not pile up
   *  in the graph. Keys still backed by a token keep their node. */
  private _pruneOrphans(candidates: Iterable<string>): void {
    for (const key of candidates) {
      if (!this.graph.hasNode(key)) continue;
      if (this.graph.getDependentsOf(key).length > 0) continue;
      if (isFieldKey(key)) {
        const prerequisites = this.graph.getPrerequisitesFor(key);
        this.graph.removeNode(key);
        this._fieldNodes.get(tokenKeyOf(key))?.delete(key);
        this._pruneOrphans(prerequisites);
        continue;
      }
      if (this._liveKeys.has(key)) continue;
      if (this.has(key) && !this.isInherited(key)) continue;
      if (this._boundShadows.has(key) && this.isRebound(key)) continue;
      this.graph.removeNode(key);
    }
  }

  // --- Batch ---

  flush(): FlushResult {
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
    const shadowsOf = (key: string, shadows: string[]) => {
      if (shadows.length > 0) previousDependents.set(key, [...(previousDependents.get(key) ?? []), ...shadows]);
    };

    // Add all keys as nodes and update edges
    for (const key of keys) {
      previousDependents.set(key, this.graph.getDependentsOf(key));
      const currentValue = this.getTokenByKey(key);

      if (!currentValue) {
        deletedKeys.add(key);
        this._indexSelector(key, undefined);
        this._detachNode(key);
        this._rewireFieldNodesOf(key);
        try {
          shadowsOf(key, this._rebindShadows(key));
        } catch (e) {
          errors.push(e instanceof Error ? e : new Error(String(e)));
          rejectedKeys.add(key);
        }
        continue;
      }

      const hadNode = this.graph.hasNode(key);
      this.graph.addNode(key);
      const deps = this._getEffectiveDepsForKey(key, currentValue);
      const previousDeps = this.graph.getPrerequisitesFor(key);
      let undoEdges = () => {};
      try {
        undoEdges = this._setEdges(key, deps, currentValue);
        this._linkInheritedDependencies(deps);
        if (!this._liveKeys.has(key)) this._linkInheritedShadowsOf(key);
        shadowsOf(key, this._rebindShadows(key));
        this._indexSelector(key, currentValue);
        this._pruneOrphans(previousDeps);
      } catch (e) {
        undoEdges();
        // Collect circular dependency errors instead of ignoring them
        errors.push(e instanceof Error ? e : new Error(String(e)));
        failedKeys.add(key);
        // Undo the write the graph refused. Leaving it in place kept the
        // cyclic token in the scope and the key in the queue, so every later
        // flush re-reported the same error.
        rejectedKeys.add(key);
        this._rollbackKey(key, queued.get(key)?.oldValue);
        if (!hadNode) this.graph.removeNode(key);
        this._pruneOrphans(deps);
      }
    }

    for (const key of keys) {
      if (failedKeys.has(key)) continue;
      if (deletedKeys.has(key)) this._liveKeys.delete(key);
      else this._liveKeys.add(key);
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
    const done = new Set(processed);
    for (const key of validKeys) {
      if (!done.has(key) && !failedKeys.has(key)) {
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

    // Notify for every key whose graph edges were updated, not only the ones
    // that resolved: auto mode emits tokenChanged for an unresolvable key
    // too. Keys the graph rejected outright are excluded — their tokens were
    // rolled back, so nothing changed.
    const processedKeys = new Set(processed);
    const notified: string[] = [];
    const notifiedSet = new Set<string>();
    for (const key of [...processed, ...validKeys]) {
      if (notifiedSet.has(key)) continue;
      const entry = queued.get(key);
      // A key that failed to resolve is still queued with the same entry;
      // report that write once rather than on every later flush. A key that
      // did resolve is always worth reporting — it may be the retry that
      // finally worked.
      if (!processedKeys.has(key) && entry && this.reportedBatchEntries.has(entry)) continue;
      if (entry) this.reportedBatchEntries.add(entry);
      notifiedSet.add(key);
      notified.push(key);
    }
    this._emitBatchChanges(notified, queued, previousDependents);

    if (errors.length > 0) {
      this.emit('batch-failed', { processed, errors, rejected: [...rejectedKeys] });
    } else {
      this.emit('batch-complete', { processed });
    }

    return { processed, errors, rejected: [...rejectedKeys] };
  }

  /** Batch counterpart of `_processAutoChange`'s notification half: one
   *  `tokenChanged` per notified key (with the queued new/old value), one
   *  per transitive dependent (with its freshly resolved value), and a
   *  single aggregate `change`. Every key is reported at most once. */
  private _emitBatchChanges(
    notified: string[],
    queued: Map<string, { newValue: any; oldValue: any }>,
    previousDependents: Map<string, string[]>,
  ): void {
    if (notified.length === 0) return;

    const changedKeys = [...new Set(notified)];
    const seen = new Set(changedKeys);
    for (const key of notified) {
      for (const dep of this._collectDependents(key, previousDependents.get(key))) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        this._reindexDynamic(dep);
        changedKeys.push(dep);
      }
    }

    const scopes = new Set<string>();
    for (const key of changedKeys) {
      if (splitKey(key)) scopes.add(scopeOf(key));

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

/** One set of ramps (a Map, or a record of shade records) rather than named sets. */
function isRampSetSource(value: unknown): value is RampSetSource {
  if (value instanceof Map) return true;
  const first = Object.values(value as object)[0];
  if (!first || typeof first !== 'object' || first instanceof Map) return false;
  const inner = Object.values(first as object)[0];
  return typeof inner === 'string' || (typeof inner === 'object' && inner !== null && 'mode' in (inner as object));
}

