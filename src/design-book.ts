import { ScopeManager } from './scope-manager';
import { DependencyGraph } from './dependency-graph';
import { Scope } from './scope';
import { ScopeError, TokenError } from './errors';
import { ResolveCache } from './resolve-cache';
import type { Pick, Resolution } from './functions/picks';
import { scopeOf, splitKey } from './keys';
import { registerBuiltinFunctions } from './functions';
import { registerBuiltinOrderers } from './orderers';
import type { AnyTokenValue, BindingContext, FunctionArg, GroupInput, GroupValue, ReferenceValue, FunctionTokenValue, TokenValue } from './tokens';
import type { TokenOrderer } from './orderers';
import { bindToken, functionDependencies, hasRelativeKeys, isGroupValue, isPoolReference, isRelativeKey, isUnresolvable, iteratedScopesOf } from './tokens';
import { assertValidTokenKey } from './keys';
import { CircularDependencyError } from './errors';
import type { Ramp } from 'dittotones';
import { RampEngine, rampImpl, rampSet } from './functions/color/ramp';
import type { RampSet, RampSetSource } from './functions/color/ramp';
import { tailwindV3Ramps } from 'dittotones/ramps/tailwind-v3';
import { FunctionError } from './errors';

/** A renderer is any function from a book (and optional options) to a
 *  string. Register one with `book.registerRenderer(name, fn)` and invoke
 *  it with `book.render(name, options?)`. */
export type RendererFn = (book: DesignBook, options?: unknown) => string;

/** Renderers every book can use (`useRenderer`). The `design-book` entry
 *  puts the built-in ones here when it is imported; `design-book/engine`
 *  leaves it empty, so a bundle that never renders carries none of them. */
const sharedRenderers = new Map<string, RendererFn>();

/** Makes a renderer available to every book, under `name`. A book's own
 *  `registerRenderer` of the same name takes precedence. */
export function useRenderer(name: string, renderer: RendererFn): void {
  sharedRenderers.set(name, renderer);
}

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
  /** `written`: the token stored at `key` was set or deleted. `dependent`:
   *  the token is unchanged, but something it reads (a reference, a pool, a
   *  ramp set) changed, so its value may have moved. */
  cause: 'written' | 'dependent';
  /** The token stored at `key` now (`undefined` once deleted). */
  newValue: AnyTokenValue | undefined;
  /** The token stored before: the one before the write for a written key,
   *  the same token as `newValue` for a dependent. */
  oldValue: AnyTokenValue | undefined;
  /** The resolved value now; `undefined` when it does not resolve. */
  value: string | undefined;
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

/** A function's implementation: its resolved arguments and options in, a
 *  value out — or, for a selector, the member it picked (`pick`). */
export type FunctionImplementation<Args extends unknown[] = unknown[]> = (...args: Args) => string | Pick;

/** What a function tells the book besides its implementation. */
export interface FunctionTraits {
  /**
   * Scopes a token of this function reads as a whole, beyond its scope
   * arguments, which only the book can work out: a `sibling` whose anchor
   * is a `source(…)` steps along wherever the anchor's references lead; a
   * `ramp` copying scope masters reads those scopes. A change to any key of
   * them notifies the token, like a selector's pool. Asked again whenever
   * the token is notified, so the answer may change with the book.
   */
  scopesRead?(token: FunctionTokenValue): string[];
}

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
  /** The member a selector picked, as a qualified key, when the value is
   *  that member's: `mostVivid(ref('palette'))`, or a reference ending on
   *  one. Two members with the same value are told apart. Absent when the
   *  value is computed (`lighten(mostVivid(…))`), or the function does not
   *  report its pick (`picked`). */
  picked?: string;

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

/** An accepted write waiting to be announced, with what it needs from
 *  before it was wired. */
interface Announcement {
  key: string;
  newValue: AnyTokenValue | undefined;
  oldValue: AnyTokenValue | undefined;
  /** Who read the key before the write: they hear of it even if they no
   *  longer do. */
  previousDependents: string[];
  /** Re-bound copies of the key in inheriting scopes. */
  shadows: string[];
}

export class DesignBook {
  readonly name: string;
  readonly description?: string;

  private _mode: 'auto' | 'batch';
  private scopeManager: ScopeManager;
  private graph: DependencyGraph;
  private listeners: Map<string, Set<Function>> = new Map();
  private functions: Map<string, FunctionImplementation> = new Map();
  private functionTraits: Map<string, FunctionTraits> = new Map();
  private renderers: Map<string, RendererFn> = new Map();
  /** Resolved values, cleared on every change (see `ResolveCache`). Read
   *  by the scopes; internal. */
  readonly _cache = new ResolveCache();
  private orderers: Map<string, TokenOrderer> = new Map();
  private batchQueue: Map<string, { newValue: any; oldValue: any }> = new Map();
  /** Queue entries already reported by a previous `flush()`. A key that
   *  fails to resolve stays queued, and re-announcing the identical pending
   *  write on every later flush is noise. Entry objects are replaced by each
   *  `_accept`, so identity is the "is this write new" stamp. */
  private reportedBatchEntries: WeakSet<object> = new WeakSet();

  /** Accepted writes waiting to be announced (auto mode), in order. */
  private _announcements: Announcement[] = [];
  /** True while announcements are being made: writes from listeners are
   *  accepted at once but announced after the current one. */
  private _announcing = false;
  /** Depth of nested public operations, and the listener errors raised in
   *  the current outermost one (see `_operation`). */
  private _depth = 0;
  private _listenerErrors: unknown[] = [];


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

  /** Function name → keys of the stored tokens calling it (own and
   *  re-bound), kept with the selector index. */
  private _keysByFunction: Map<string, Set<string>> = new Map();

  /** Master ramp sets by name: a fixed set, or the names of scopes whose
   *  tokens are the masters (one scope a ramp, its keys the shades), read
   *  live. Engines are made on first use; a scope set's engine is rebuilt
   *  when its colors change (`fingerprint`). */
  private _rampSets: Map<string, RampSet | { scopes: string[] }> = new Map();
  private _rampEngines: Map<string, { engine: RampEngine; fingerprint: string; generation: number }> = new Map();
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
    options?: { extends?: string; description?: string; order?: import('./scope').ScopeOrder; metadata?: import('./scope').ScopeMetadata; template?: boolean },
  ): Scope {
    const scope = this.scopeManager.addScope(name, options);
    this._scopesChanged();
    // Everything it inherits is wired at once; a re-bound token closing a
    // cycle in it refuses the scope.
    try {
      this._wireInherited(scope.getAllKeys().map((k) => `${name}.${k}`));
    } catch (e) {
      this._discardScope(name);
      throw e;
    }
    // A scope extending one that holds groups holds them too.
    this._change(() => this._syncInheritedGroups(scope));
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
    if (name.includes('.')) {
      throw new ScopeError(`"${name}" is a group; delete the key that holds it`, name);
    }
    // The scope goes with every group in it, announced as one change; the
    // scopes extending it then lose the groups they inherited from it.
    const below = this.scopeManager.lineageBelow(name).slice(1);
    const scopes = this._scopeTree(name);
    this._scopesChanged();
    const removed: Array<[string, AnyTokenValue | undefined]> = [];
    for (const path of scopes) this.scopeManager.deleteScope(path, (keys) => removed.push(...keys));
    this._scopesChanged();
    this._notifyRemoved(removed);
    this._change(() => {
      for (const scope of below) {
        const live = this.scopeManager.getScope(scope);
        if (live) this._syncInheritedGroups(live);
      }
    });
    for (const path of scopes.slice(0, -1)) this.emit('scopeRemoved', { scope: path, removedKeys: removed.map(([k]) => k).filter((k) => scopeOf(k) === path) });
    const keys = removed.map(([k]) => k).filter((k) => scopeOf(k) === name);
    this.emit('scopeRemoved', { scope: name, removedKeys: keys });
    return keys;
  }

  /** `path` and every group inside it, the deepest first. */
  private _scopeTree(path: string): string[] {
    const prefix = `${path}.`;
    return this.scopeManager.getAllScopes()
      .map((s) => s.name)
      .filter((n) => n.startsWith(prefix))
      .sort((a, b) => b.split('.').length - a.split('.').length)
      .concat(path);
  }

  getScope(name: string): Scope | undefined {
    return this.scopeManager.getScope(name);
  }

  hasScope(name: string): boolean {
    return this.scopeManager.hasScope(name);
  }

  /** The top-level scopes. A group is reached through the key that holds
   *  it: `getScope('type.title')`. */
  getAllScopes(): Scope[] {
    return this.scopeManager.getAllScopes().filter((s) => !s.name.includes('.'));
  }

  getAllKeysForScope(name: string): string[] {
    return this.scopeManager.getAllKeysForScope(name);
  }

  getScopeDependencies(name: string): string[] {
    return this.scopeManager.getScopeDependencies(name);
  }

  /** The scope a key belongs to and its name in it (`type.title` and
   *  `fontSize` for `type.title.fontSize`), or `undefined` for a key without
   *  a scope part or whose scope does not exist. */
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
    if (!at || at.scope.hasOwn(at.name)) return false;
    const raw = at.scope.getRaw(at.name);
    return !isGroupValue(raw) && hasRelativeKeys(raw);
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

  /** A scope was added or removed: bindings that followed an `extends`
   *  chain, and every resolved value, may be stale. */
  private _scopesChanged(): void {
    this._binding.version++;
    this._cache.clear();
  }

  // --- Token operations ---

  /** The value of `key`. A key whose value is a group (it holds one,
   *  refers to one or picked one) has no single value: read a member. */
  resolve(key: string): string {
    const { value, group } = this._resolution(key);
    if (group !== undefined) throw groupHasNoValue(key, this.scopeManager.getScope(group));
    return value;
  }

  /** The member a key's value is, when it is one a selector picked (also
   *  through references to that selector): `pickOf('ui.text')` →
   *  `'palette.ink'`. `undefined` for a value of its own or one computed from
   *  a pick (`lighten(mostVivid(…))`), and when the key does not resolve. */
  pickOf(key: string): string | undefined {
    try {
      return this._resolution(key).pick;
    } catch {
      return undefined;
    }
  }

  /** A key's value and the member it is, when it is one. */
  _resolution(key: string): Resolution {
    if (isRelativeKey(key)) {
      throw new TokenError(
        `"${key}" is relative to the scope that reads it; resolve it through a scope (scope.resolve("${key.slice(1)}")) or qualify it`,
        key,
      );
    }
    const parts = splitKey(key);
    if (!parts) {
      // A top-level scope's path: as a value, the scope itself — held by
      // the key referring to it.
      if (this.scopeManager.getScope(key)) return { value: '', group: key };
      throw new TokenError(`Invalid key format "${key}": expected "scope.token"`, key);
    }
    const scope = this.scopeManager.getScope(parts[0]);
    if (scope) return scope.resolution(parts[1]);
    // A path through a key whose value is a group: `card.heading.fontSize`
    // with `card.heading = ref('type.title')` reads `type.title.fontSize`.
    const through = this._through(key);
    if (through) return this._resolution(through.target);
    throw new TokenError(`Scope "${parts[0]}" not found`, key);
  }

  /** The path a key is read through when it is not an ordinary key — its
   *  scope part is a key whose value is a group (`card.heading`) rather than
   *  a scope — and the path it reaches; `undefined` otherwise. */
  private _through(key: string): { via: string; target: string } | undefined {
    const parts = splitKey(key);
    if (!parts || this.scopeManager.getScope(parts[0])) return undefined;
    let group: string | undefined;
    try {
      group = this._resolution(parts[0]).group;
    } catch {
      return undefined;
    }
    // A key whose group is its own scope (being replaced, or gone) leads
    // nowhere further: only a key holding another group is read through.
    if (group === undefined || group === parts[0]) return undefined;
    return { via: parts[0], target: `${group}.${parts[1]}` };
  }

  has(key: string): boolean {
    const at = this._locate(key);
    if (at) return at.scope.has(at.name);
    const through = this._through(key);
    return through ? this.has(through.target) : false;
  }

  getTokenByKey(key: string): AnyTokenValue | undefined {
    const at = this._locate(key);
    if (at) return at.scope.get(at.name);
    const through = this._through(key);
    return through ? this.getTokenByKey(through.target) : undefined;
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
    let pick: string | undefined;
    try {
      ({ value, pick } = this._resolution(key));
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
    if (pick !== undefined) inspection.picked = pick;

    return inspection;
  }

  // --- Function registry ---

  registerFunction<Args extends unknown[]>(name: string, impl: FunctionImplementation<Args>, traits?: FunctionTraits): void {
    this.functions.set(name, impl as FunctionImplementation);
    if (traits) this.functionTraits.set(name, traits);
    else this.functionTraits.delete(name);
    this._cache.clear();
  }

  getFunction(name: string): FunctionImplementation | undefined {
    const fn = this.functions.get(name);
    return typeof fn === 'function' ? fn : undefined;
  }

  // --- Orderer registry ---

  registerOrderer(type: string, orderer: TokenOrderer): void {
    this.orderers.set(type, orderer);
    this._cache.clear();
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
    const renderer = this.getRenderer(name);
    if (!renderer) {
      throw new TokenError(
        `Renderer "${name}" is not registered; the built-in ones come with the design-book entry, not design-book/engine`,
        name,
      );
    }
    return renderer(this, options);
  }

  /** Names of all currently registered renderers. */
  getRendererNames(): string[] {
    return [...new Set([...sharedRenderers.keys(), ...this.renderers.keys()])];
  }

  /** Look up a registered renderer function by name. */
  getRenderer(name: string): RendererFn | undefined {
    return this.renderers.get(name) ?? sharedRenderers.get(name);
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
          : isPoolReference(s) || (s as { type?: string })?.type === 'reference' ? (s as ReferenceValue).key
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
    this._cache.clear();
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
    // A fixed set never changes. A scope set is current while no value has
    // changed since it was read (the cache's generation); after that its
    // masters are read again, and the engine kept if they are the same.
    const generation = this._cache.generation;
    const cached = this._rampEngines.get(name);
    if (cached && (source instanceof Map || cached.generation === generation)) return cached.engine;
    let set: RampSet = source as RampSet;
    let fingerprint = '';
    if (!(source instanceof Map)) {
      const hexes = this._masterRamps(name, source.scopes);
      fingerprint = JSON.stringify(hexes);
      if (cached && cached.fingerprint === fingerprint) {
        cached.generation = generation;
        return cached.engine;
      }
      set = rampSet(hexes);
    }
    const engine = new RampEngine({
      ramps: set,
      preserveHueOffsets: this._rampOptions.preserveHueOffsets,
      gamutMap: this._rampOptions.gamutMap,
    });
    this._rampEngines.set(name, { engine, fingerprint, generation });
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

  /** The scopes a ramp set's masters live in; none for a fixed set. */
  rampMasterScopes(from?: string): string[] {
    const source = this._rampSets.get(from ?? this._defaultRampSet);
    return source && !(source instanceof Map) ? [...source.scopes] : [];
  }

  /** A ramp set was registered: its readers (and, when the default moved,
   *  the readers of the default) re-indexed against its masters and
   *  announced, with what follows from them, as one change. */
  private _announceRampSet(name: string, previousDefault: string): void {
    const defaultMoved = previousDefault !== this._defaultRampSet;
    const keys = [...(this._keysByFunction.get('ramp') ?? [])].filter((key) => {
      const from = (this.getTokenByKey(key) as FunctionTokenValue | undefined)?.options?.from as string | undefined;
      return (from ?? this._defaultRampSet) === name || (from === undefined && defaultMoved);
    });
    if (keys.length === 0) return;
    for (const key of keys) this._indexSelector(key, this.getTokenByKey(key));
    const changed = new Set(keys);
    for (const key of keys) for (const dep of this._collectDependents(key)) changed.add(dep);
    const changedKeys = [...changed];
    for (const key of changedKeys) this._emitTokenChanged(key);
    this.emit('change', { changedKeys, scopes: [...new Set(changedKeys.map(scopeOf))] });
  }

  /** One `tokenChanged`: a written key with its tokens before and after, or
   *  a dependent (no `written`), whose token is unchanged. */
  private _emitTokenChanged(key: string, written?: { newValue: any; oldValue: any }): void {
    let value: string | undefined;
    try {
      value = this.resolve(key);
    } catch {
      value = undefined;
    }
    if (written) {
      this.emit('tokenChanged', { key, cause: 'written', newValue: written.newValue, oldValue: written.oldValue, value });
    } else {
      const token = this.getTokenByKey(key);
      this.emit('tokenChanged', { key, cause: 'dependent', newValue: token, oldValue: token, value });
    }
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
    const off = this.on('tokenChanged', (event) => {
      if (event.detail.key === key) callback(event.detail.value, event.detail);
    });
    // A path read through a group (`card.action.bg`) is no key of its own:
    // while it is watched it keeps its node and is announced like one.
    if (this._locate(key) || !this._through(key)) return off;
    this._watchedPaths.set(key, (this._watchedPaths.get(key) ?? 0) + 1);
    this._wireThrough([key]);
    return () => {
      off();
      const count = (this._watchedPaths.get(key) ?? 1) - 1;
      if (count > 0) {
        this._watchedPaths.set(key, count);
        return;
      }
      this._watchedPaths.delete(key);
      this._pruneOrphans([key]);
    };
  }

  /** Watched paths read through a group, with how many watch each. */
  private _watchedPaths: Map<string, number> = new Map();

  /** Calls every listener; one that throws does not stop the others. Its
   *  error is thrown when the operation emitting is done (`_operation`). */
  private emit<K extends keyof DesignBookEventMap>(event: K, detail: DesignBookEventMap[K]): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.size === 0) return;
    this._operation(() => {
      for (const cb of [...callbacks]) {
        try {
          (cb as EventCallback<K>)({ detail });
        } catch (e) {
          this._listenerErrors.push(e);
        }
      }
    });
  }

  // --- Writes (called by Scope.set / Scope.delete) ---

  /**
   * A token was just stored at (or removed from) `key`. In auto mode it is
   * wired now — a write the graph refuses throws here, before anyone heard
   * of it, and the scope puts the old token back — and its announcement is
   * queued for `_settle`. Writes made by listeners while a change is being
   * announced are wired the same way, so a refused one throws to the
   * listener that made it; only their announcements wait. In batch mode the
   * write is queued for `flush`, which wires it with the rest.
   */
  _accept(key: string, newValue: AnyTokenValue | undefined, oldValue: AnyTokenValue | undefined): void {
    if (this._mode === 'batch') {
      // Several writes to one key merge into one entry, which must keep the
      // value from before the first of them: it is what a refused write
      // rolls back to and what listeners last heard about. An entry that has
      // already been through a flush (accepted, still failing to resolve)
      // was announced, so the new write starts from its value instead.
      const pending = this.batchQueue.get(key);
      const firstOld = pending && !this.reportedBatchEntries.has(pending) ? pending.oldValue : oldValue;
      this.batchQueue.set(key, { newValue, oldValue: firstOld });
      return;
    }
    const previousDependents = this.graph.getDependentsOf(key);
    const shadows = this._wire(key);
    this._announcements.push({ key, newValue, oldValue, previousDependents, shadows });
  }

  /**
   * Announces the accepted writes, in order — including those listeners
   * make while hearing them. Inside an announcement it does nothing: the
   * outer one carries on with the queue. A listener that throws does not
   * undo anything; every listener still hears every change, and the error
   * is thrown when the outermost operation is done (`_operation`).
   */
  _settle(): void {
    if (this._mode === 'batch' || this._announcing) return;
    this._operation(() => this._announceWhile(() => {}));
  }

  /** Runs `fn` as part of an announcement (listener writes are queued, not
   *  announced in the middle of it), then announces the queue. */
  private _announceWhile(fn: () => void): void {
    if (this._announcing) {
      fn();
      return;
    }
    this._announcing = true;
    try {
      fn();
      while (this._announcements.length > 0) this._announceChange(this._announcements.shift()!);
    } finally {
      this._announcing = false;
    }
  }

  /**
   * One public operation: listener errors raised inside it are collected
   * (`emit`) and the first is thrown once it is done — unless the operation
   * itself threw, whose error wins. Nested operations join the outer one.
   */
  private _operation<T>(fn: () => T): T {
    this._depth++;
    let result: T;
    try {
      result = fn();
    } catch (e) {
      if (--this._depth === 0) this._listenerErrors.length = 0;
      throw e;
    }
    if (--this._depth === 0 && this._listenerErrors.length > 0) {
      const [first] = this._listenerErrors;
      this._listenerErrors.length = 0;
      throw first;
    }
    return result;
  }

  /** Store (or, for `undefined`, remove) a key's own token without
   *  notifying anyone. */
  private _putToken(qualifiedKey: string, value: AnyTokenValue | undefined): void {
    const at = this._locate(qualifiedKey);
    at?.scope._rollback(at.name, value);
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
      this._pruneOrphans(rejectedDeps);
    } else {
      this._detachNode(qualifiedKey);
    }
    try {
      this._wireShadows(qualifiedKey);
    } catch { /* the restored state was accepted before */ }
  }

  /** `Scope.delete` was refused (see `_wireInherited`): the token is back
   *  in the scope; put the graph, index and caches back with it. */
  // --- Groups ---

  /** Runs one structural change: announced as it ends in auto mode, queued
   *  in batch mode, part of the current announcement inside one. */
  private _change(fn: () => void): void {
    if (this._mode === 'batch' || this._announcing) fn();
    else this._operation(() => this._announceWhile(fn));
  }

  /** Writes a group at `name` of `holder` (see `Scope.set`): the entry in
   *  the holder, the group's scope, its members — replacing what was there.
   *  A member the graph refuses undoes the whole write. */
  _setGroup(holder: Scope, name: string, group: GroupValue): void {
    const path = `${holder.name}.${name}`;
    const members = group.members ?? {};
    for (const member of Object.keys(members)) assertValidTokenKey(path, member);
    for (const member of group.omit ?? []) assertValidTokenKey(path, member);
    const base = this._groupBase(holder, path, group);
    const entry: GroupValue = {
      type: 'group',
      ...(group.kind !== undefined ? { kind: group.kind } : {}),
      ...(group.base !== undefined ? { base: group.base } : {}),
      ...(group.omit?.length ? { omit: [...group.omit] } : {}),
      ...(group.description !== undefined ? { description: group.description } : {}),
    };
    const previous = holder.hasOwn(name) ? holder.getRaw(name) : undefined;
    const restore = isGroupValue(previous) ? this.groupValueOf(path) : previous;
    this._change(() => {
      try {
        if (isGroupValue(previous)) this._deleteGroupNow(holder, name);
        const old = holder.hasOwn(name) ? holder.getRaw(name) : undefined;
        holder._rollback(name, entry);
        const scope = this.scopeManager._addGroup(path, { extends: base, kind: group.kind, omit: group.omit, description: group.description });
        this._scopesChanged();
        this._wireInherited(scope.getAllKeys().map((k) => `${path}.${k}`));
        this._syncInheritedGroups(scope);
        this._accept(path, entry, old);
        for (const [member, value] of Object.entries(members)) scope.set(member, value as AnyTokenValue);
        this._syncBelow(holder.name);
        this.emit('scopeAdded', { scope: path });
      } catch (e) {
        if (this.scopeManager.getScope(path)) this._deleteGroupNow(holder, name);
        if (restore !== undefined) {
          try { holder.set(name, restore as AnyTokenValue); } catch { /* it was accepted before */ }
        }
        throw e;
      }
    });
  }

  /** Removes the group at `name` of `holder` with everything in it. */
  _deleteGroup(holder: Scope, name: string): void {
    this._change(() => this._deleteGroupNow(holder, name));
  }

  private _deleteGroupNow(holder: Scope, name: string): void {
    const path = `${holder.name}.${name}`;
    const old = holder.getRaw(name);
    const scopes = this._scopeTree(path);
    const removed: Array<[string, AnyTokenValue | undefined]> = [];
    for (const scope of scopes) this.scopeManager.deleteScope(scope, (keys) => removed.push(...keys));
    this._scopesChanged();
    this._notifyRemoved(removed);
    holder._rollback(name, undefined);
    this._accept(path, undefined, old);
    this._syncBelow(holder.name);
    for (const scope of scopes) this.emit('scopeRemoved', { scope, removedKeys: removed.map(([k]) => k).filter((k) => scopeOf(k) === scope) });
  }

  /** The path of the group a group extends (`variant`'s base), checked. */
  private _groupBase(holder: Scope, path: string, group: GroupValue): string | undefined {
    if (group.base === undefined) return undefined;
    const bound = bindToken(group.base, holder.name, this._binding);
    if (isUnresolvable(bound)) throw new TokenError(`${path}: ${bound.message}`, path);
    const base = bound.key;
    if (base === path) {
      const error = new CircularDependencyError([path, path]);
      error.message += ` — a variant cannot extend the group it replaces; to change "${path}" in place, set its members: book.getScope('${path}').set(…)`;
      throw error;
    }
    if (!this.scopeManager.getScope(base)) {
      throw new TokenError(`${path}: variant(…) needs a group to extend, and "${base}" is none`, path);
    }
    return base;
  }

  /** The group at `path` as it would be written: its entry with its own
   *  members (nested groups included). What a copy or a serialiser wants. */
  groupValueOf(path: string): GroupValue | undefined {
    const at = this._locate(path);
    const entry = at?.scope.getRaw(at.name);
    const scope = this.scopeManager.getScope(path);
    if (!isGroupValue(entry) || !scope) return undefined;
    const members: Record<string, GroupInput> = {};
    for (const key of scope.ownKeys()) {
      const raw = scope.getRaw(key);
      members[key] = (isGroupValue(raw) ? this.groupValueOf(`${path}.${key}`) : raw) as GroupInput;
    }
    return { ...entry, members };
  }

  /** Keeps every scope extending `holder` (at any depth) in step with the
   *  groups it inherits. */
  private _syncBelow(holder: string): void {
    for (const name of this.scopeManager.lineageBelow(holder).slice(1)) {
      const scope = this.scopeManager.getScope(name);
      if (scope) this._syncInheritedGroups(scope);
    }
  }

  /**
   * A scope that inherits a group key holds a group there too: an implicit
   * group extending the one it inherits, so its members are inherited keys
   * of the scope's own — re-bound where they read relative to it — and a
   * group placed in a context reads that context (`holder`). Makes the
   * implicit groups `scope` needs, drops the ones it no longer does, and
   * goes on into every group it holds.
   */
  private _syncInheritedGroups(scope: Scope): void {
    const keys = new Set(scope.getAllKeys());
    for (const key of keys) {
      const path = `${scope.name}.${key}`;
      const existing = this.scopeManager.getScope(path);
      const raw = scope.getRaw(key);
      if (scope.hasOwn(key) || !isGroupValue(raw)) {
        if (existing?.implicit) this._dropImplicit(path);
        else if (existing) this._syncInheritedGroups(existing);
        continue;
      }
      const parent = `${scope.extendsScope}.${key}`;
      if (existing?.implicit && existing.extendsScope === parent) {
        this._syncInheritedGroups(existing);
        continue;
      }
      if (existing) this._dropImplicit(path);
      const created = this.scopeManager._addGroup(path, { extends: parent, implicit: true });
      this._scopesChanged();
      this._wireInherited([path, ...created.getAllKeys().map((k) => `${path}.${k}`)]);
      this._syncInheritedGroups(created);
    }
    // Implicit groups at keys the scope no longer has.
    const prefix = `${scope.name}.`;
    for (const other of this.scopeManager.getAllScopes()) {
      if (!other.implicit || !other.name.startsWith(prefix)) continue;
      const rest = other.name.slice(prefix.length);
      if (!rest.includes('.') && !keys.has(rest)) this._dropImplicit(other.name);
    }
  }

  /** Removes an implicit group and everything in it. */
  private _dropImplicit(path: string): void {
    const removed: Array<[string, AnyTokenValue | undefined]> = [];
    for (const scope of this._scopeTree(path)) this.scopeManager.deleteScope(scope, (keys) => removed.push(...keys));
    this._scopesChanged();
    this._notifyRemoved(removed);
  }

  _restoreRejectedDelete(qualifiedKey: string, restored: AnyTokenValue): void {
    this._rollbackKey(qualifiedKey, restored);
  }

  /**
   * Wires the token stored at `key` now — or its absence — into the graph,
   * the inheritance links and the selector index: the one step a write goes
   * through in both modes. A token the graph refuses (a cycle) is undone —
   * its edges and node as they were — and the error thrown; the caller
   * restores the stored token. Returns the re-bound copies of the key in
   * inheriting scopes, which change with it.
   */
  private _wire(key: string): string[] {
    const token = this.getTokenByKey(key);
    if (!token) {
      this._indexSelector(key, undefined);
      this._detachNode(key);
      return this._wireShadows(key);
    }
    const deps = this._getEffectiveDepsForKey(key, token);
    const previousDeps = this.graph.getPrerequisitesFor(key);
    const hadNode = this.graph.hasNode(key);
    this.graph.addNode(key);
    let undoEdges = () => {};
    let shadows: string[];
    try {
      undoEdges = this._setEdges(key, deps, token);
      shadows = this._wireShadows(key);
    } catch (e) {
      undoEdges();
      this.graph.updateEdges(key, previousDeps);
      // Don't leave a node behind for a key the graph never accepted.
      if (!hadNode) this.graph.removeNode(key);
      this._pruneOrphans(deps);
      throw e;
    }
    this._pruneOrphans(previousDeps);
    this._indexSelector(key, token);
    this._rewireGroupKey(scopeOf(key));
    this._rewireThrough(key);
    return shadows;
  }

  /** Announces one accepted write: the key, then everything that reads it,
   *  then the change as a whole. */
  private _announceChange(change: Announcement): void {
    const { key: qualifiedKey, newValue, oldValue, previousDependents, shadows } = change;

    const changedKeys: string[] = [qualifiedKey];
    const scopeSet = new Set<string>();
    if (splitKey(qualifiedKey)) scopeSet.add(scopeOf(qualifiedKey));

    this._emitTokenChanged(qualifiedKey, { newValue, oldValue });

    // A listener's write already wired in, waiting to be announced, is
    // announced as written by its own entry, not as a dependent here.
    const ownAnnouncement = new Set(this._announcements.map((a) => a.key));
    const dependents = this._collectDependents(qualifiedKey, [...previousDependents, ...shadows]);
    for (const dep of dependents) {
      if (ownAnnouncement.has(dep)) continue;
      this._reindexDynamic(dep);
      this._rewireThrough(dep);
      changedKeys.push(dep);
      if (splitKey(dep)) scopeSet.add(scopeOf(dep));
      this._emitTokenChanged(dep);
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
    // A key holding a group depends on the group's members, so a change in
    // any of them reaches whoever reads the group.
    if (isGroupValue(value)) return this._memberKeys(qualifiedKey);
    if (splitKey(qualifiedKey) && this._readsSource(qualifiedKey)) {
      return [this.getSourceKey(qualifiedKey)!];
    }
    return this._extractDepsFromValue(value);
  }

  /** The keys of the group at `path`, own and inherited. */
  private _memberKeys(path: string): string[] {
    return this.scopeManager.getScope(path)?.getAllKeys().map((k) => `${path}.${k}`) ?? [];
  }

  // --- Paths read through a group ---
  //
  // `card.heading.fontSize`, where `card.heading` holds a group by
  // reference (or a selector picked one), is no key of its own: it reads
  // `type.title.fontSize` through `card.heading`. Such a path gets a node
  // depending on the key it is read through and on the path it reaches,
  // re-pointed whenever that key's value may have changed — the only nodes
  // that stand for no key.

  /** Through paths in the graph, by the key they are read through. */
  private _throughNodes: Map<string, Set<string>> = new Map();

  /** Wire the through paths among `keys` (and any they read through in turn). */
  private _wireThrough(keys: Iterable<string>): void {
    for (const key of keys) {
      const through = this._through(key);
      if (!through) continue;
      let nodes = this._throughNodes.get(through.via);
      if (!nodes) this._throughNodes.set(through.via, (nodes = new Set()));
      nodes.add(key);
      this.graph.addNode(key);
      this.graph.updateEdges(key, [through.via, through.target]);
      this._wireThrough([through.via, through.target]);
    }
  }

  /** Re-point the through paths read through `key`: its value may now be
   *  another group (a re-pointed reference, a selector's new pick). */
  private _rewireThrough(key: string): void {
    const nodes = this._throughNodes.get(key);
    if (!nodes) return;
    for (const node of nodes) {
      if (!this.graph.hasNode(node)) {
        nodes.delete(node);
        continue;
      }
      const through = this._through(node);
      try {
        this.graph.updateEdges(node, through ? [through.via, through.target] : [key]);
        if (through) this._wireThrough([through.target]);
      } catch { /* the path keeps the edges it had */ }
    }
    if (nodes.size === 0) this._throughNodes.delete(key);
  }

  /** Set the edges of `key` — and wire the through paths among its new
   *  prerequisites — as one step: a cycle puts everything back and
   *  rethrows; the returned function does the same for a caller whose later
   *  step fails. */
  private _setEdges(key: string, deps: string[], _token?: AnyTokenValue): () => void {
    const graph = this.graph;
    const previous = graph.hasNode(key) ? graph.getPrerequisitesFor(key) : null;
    const created = deps.filter((d) => !graph.hasNode(d));
    const hadKey = graph.hasNode(key);
    const undo = () => {
      if (graph.hasNode(key)) {
        graph.updateEdges(key, []);
        if (previous) {
          try { graph.updateEdges(key, previous); } catch { /* it was acyclic before */ }
        }
      }
      for (const node of created) if (graph.hasNode(node) && graph.getDependentsOf(node).length === 0) graph.removeNode(node);
      if (!hadKey && graph.hasNode(key) && graph.getDependentsOf(key).length === 0) graph.removeNode(key);
    };
    try {
      graph.addNode(key);
      graph.updateEdges(key, deps);
      this._wireThrough(deps);
      this._wireScopeNodes(deps);
    } catch (e) {
      undo();
      throw e;
    }
    return undo;
  }

  /** The key of the group `scope` is, re-wired to its members — for a group
   *  whose members just changed. */
  private _rewireGroupKey(scopePath: string): void {
    const scope = this.scopeManager.getScope(scopePath);
    if (!scope || !this.graph.hasNode(scopePath)) return;
    this.graph.updateEdges(scopePath, this._memberKeys(scopePath));
  }

  /** A top-level scope held by reference (`a.x = ref('b')`) gets a node
   *  depending on its keys, like a group key: a change in it reaches the
   *  holder, and a scope that would come to hold itself closes a cycle. */
  private _wireScopeNodes(deps: Iterable<string>): void {
    for (const dep of deps) {
      if (dep.includes('.') || !this.scopeManager.getScope(dep)) continue;
      this.graph.addNode(dep);
      this.graph.updateEdges(dep, this._memberKeys(dep));
    }
  }
  /** Record (or forget) `qualifiedKey` as a selector over the scopes its
   *  function token iterates. Called for every write and every delete, so
   *  the index always mirrors the stored tokens. */
  private _indexSelector(qualifiedKey: string, value: AnyTokenValue | undefined): void {
    for (const [fn, keys] of this._keysByFunction) {
      if (keys.delete(qualifiedKey) && keys.size === 0) this._keysByFunction.delete(fn);
    }
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

    const fn = value as FunctionTokenValue;
    let keys = this._keysByFunction.get(fn.name);
    if (!keys) this._keysByFunction.set(fn.name, (keys = new Set()));
    keys.add(qualifiedKey);

    const scopeNames = new Set(iteratedScopesOf(fn));
    // Scopes only the book can work out (FunctionTraits.scopesRead); they
    // may move as the book changes, so a notified token is asked again
    // (`_reindexDynamic`).
    for (const name of this._scopesRead(fn)) scopeNames.add(name);
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

  /** The scopes a token reads that its function works out from the book
  (`FunctionTraits.scopesRead`); none while that cannot be told yet — the
   *  next notification asks again. */
  private _scopesRead(token: FunctionTokenValue): string[] {
    const traits = this.functionTraits.get(token.name);
    if (!traits?.scopesRead) return [];
    try {
      return traits.scopesRead(token);
    } catch {
      return [];
    }
  }

  /** Re-index a notified token whose function works out its scopes from the
   *  book: they can change with tokens that notify it but are not its own
   *  write. */
  private _reindexDynamic(key: string): void {
    const token = this.getTokenByKey(key);
    if (token?.type === 'function' && this.functionTraits.get((token as FunctionTokenValue).name)?.scopesRead) {
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
    for (const iterated of this.scopeManager.lineageBelow(changedScope)) {
      for (const key of this._selectorsByScope.get(iterated) ?? []) {
        if (key !== changedKey) selectors.push(key);
      }
    }
    return selectors;
  }

  // --- Inherited keys ---
  //
  // Every key a scope inherits through `extends` is wired like an own key,
  // as soon as it exists. A plain one reads its source's token as is: one
  // edge, to the source. A re-bound one — its token holds relative refs
  // (`ref('.primary')`), so in `acme extends brand` `acme.button` reads
  // `acme.primary` — gets the token's dependencies as its own scope reads
  // them. So whatever reads an inherited key reaches what it really reads
  // through the graph, and cycle checks see through inheritance.

  /** Wire every copy of `key` in the scopes below its own to what it
   *  inherits now (see `_wireInherited`). */
  private _wireShadows(key: string): string[] {
    const parts = splitKey(key);
    if (!parts || parts[1].includes('.')) return [];
    const [scopeName, tokenName] = parts;
    return this._wireInherited(this.scopeManager.lineageBelow(scopeName).slice(1).map((n) => `${n}.${tokenName}`));
  }

  /**
   * Wire the given keys, where they are inherited, to what they inherit
   * now — or unwire the ones that no longer inherit anything. One step: a
   * re-bound copy can close a cycle that exists only in its own scope
   * (`acme.primary = ref('acme.button')` against `button = ref('.primary')`
   * written in `brand`); then everything is undone and the error thrown, so
   * the write that caused it is refused. Returns the re-bound keys: they
   * change with the token they inherit but have no edge to it.
   */
  private _wireInherited(keys: string[]): string[] {
    const undos: Array<() => void> = [];
    const previous: string[] = [];
    const wired: string[] = [];
    const gone: string[] = [];
    const rebound: string[] = [];
    try {
      for (const k of keys) {
        const at = this._locate(k);
        // A scope that owns the key wires it with its own writes.
        if (!at || at.scope.hasOwn(at.name)) continue;
        const token = at.scope.has(at.name) ? this.getTokenByKey(k) : undefined;
        if (!token) {
          gone.push(k);
          continue;
        }
        const isRebound = this.isRebound(k);
        const deps = this._getEffectiveDepsForKey(k, token);
        if (isRebound) rebound.push(k);
        // A plain copy already pointing at its source has nothing to change.
        else if (this.graph.hasNode(k) && sameMembers(this.graph.getPrerequisitesFor(k), deps)) continue;
        previous.push(...this.graph.getPrerequisitesFor(k));
        undos.push(this._setEdges(k, deps, token));
        wired.push(k);
      }
    } catch (e) {
      for (const undo of undos.reverse()) undo();
      throw e;
    }
    for (const k of wired) this._indexSelector(k, this.getTokenByKey(k));
    for (const k of gone) {
      this._indexSelector(k, undefined);
      if (!this.graph.hasNode(k)) continue;
      this._detachNode(k);
    }
    this._pruneOrphans(previous);
    return rebound;
  }

  /** Undo an `addScope` whose inherited tokens were refused. */
  private _discardScope(name: string): void {
    this.scopeManager._discard(name);
    this._scopesChanged();
    const prefix = `${name}.`;
    for (const node of this.graph.getAllNodes()) {
      if (!node.startsWith(prefix) || !this.graph.hasNode(node)) continue;
      this._indexSelector(node, undefined);
      // Forward refs to the scope (`ref('acme.x')` written before it
      // existed) keep their target node; anything else goes.
      const previous = this.graph.getPrerequisitesFor(node);
      this.graph.updateEdges(node, []);
      this._pruneOrphans([node, ...previous]);
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
        // A through path is a hop to its readers, reported only while
        // someone watches it.
        if (!this._locate(node)) {
          if (this._watchedPaths.has(node)) dependents.push(node);
          continue;
        }
        dependents.push(node);
        pending.push(node);
      }
    };

    walk(key);
    for (const previous of alsoFrom) walk(previous);

    while (pending.length > 0) {
      const node = pending.shift()!;
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
      if (this._watchedPaths.has(key)) continue;
      if (!this._locate(key) && this._through(key)) {
        // An unread through path goes, and with it what only it read.
        const prerequisites = this.graph.getPrerequisitesFor(key);
        this.graph.removeNode(key);
        this._pruneOrphans(prerequisites);
        continue;
      }
      // A key that exists — own or inherited — keeps its node.
      if (this.has(key)) continue;
      this.graph.removeNode(key);
    }
  }

  // --- Batch ---

  flush(): FlushResult {
    return this._operation(() => {
      const result = this._flushQueue();
      if (result.errors.length > 0) {
        this.emit('batch-failed', { processed: result.processed, errors: result.errors, rejected: result.rejected });
      } else {
        this.emit('batch-complete', { processed: result.processed });
      }
      return result;
    });
  }

  /**
   * A scope's keys, removed at once (`deleteScope`): announced as one
   * change, the way a flush announces a batch — not one propagation and one
   * `change` per key. In batch mode, or from inside a change, they are
   * queued like any write. A key whose removal the graph refuses (a re-bound
   * copy in an inheriting scope closing a cycle) is thrown once the rest is
   * announced.
   */
  private _notifyRemoved(removed: Array<[string, AnyTokenValue | undefined]>): void {
    if (this._mode === 'batch' || this._announcing) {
      const errors: unknown[] = [];
      for (const [key, old] of removed) {
        try {
          this._accept(key, undefined, old);
        } catch (e) {
          errors.push(e);
        }
      }
      if (errors.length > 0) throw errors[0];
      return;
    }
    for (const [key, old] of removed) this.batchQueue.set(key, { newValue: undefined, oldValue: old });
    let errors: Error[] = [];
    this._operation(() => this._announceWhile(() => {
      errors = this._flushQueue().errors;
    }));
    if (errors.length > 0) throw errors[0];
  }

  /** Wires, resolves and announces the queued writes; `flush` adds the
   *  batch events. */
  private _flushQueue(): FlushResult {
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

    // Wire every queued key; a refused one is rolled back and reported.
    for (const key of keys) {
      previousDependents.set(key, this.graph.getDependentsOf(key));
      const deleted = !this.getTokenByKey(key);
      if (deleted) deletedKeys.add(key);
      try {
        shadowsOf(key, this._wire(key));
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
        rejectedKeys.add(key);
        if (deleted) continue;
        failedKeys.add(key);
        // Undo the write the graph refused: left in place, the cyclic token
        // would stay in the scope and every later flush re-report it.
        this._rollbackKey(key, queued.get(key)?.oldValue);
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
        this._rewireThrough(dep);
        changedKeys.push(dep);
      }
    }

    const scopes = new Set<string>();
    for (const key of changedKeys) {
      if (splitKey(key)) scopes.add(scopeOf(key));

      this._emitTokenChanged(key, queued.get(key));
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

/** The same keys, in any order. */
function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((k) => set.has(k));
}

/** The error for reading a group as one value. */
function groupHasNoValue(key: string, group: Scope | undefined): TokenError {
  const member = group?.getAllKeys()[0];
  const hint = member === undefined ? '' : `, e.g. ${key}.${member}`;
  return new TokenError(`"${key}" is a group; read one of its members${hint}`, key);
}
