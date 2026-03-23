# Design Book Implementation Design

> **Note:** This document is historical — it describes the original design from before implementation. The API has since evolved significantly: `hex()` was renamed to `color()` and then removed as an alias, function tokens no longer carry their `implementation` (they use a registry lookup by `name`), `FunctionTokenValue.rawValue` was removed, token processors and reference resolution caches moved to WeakMaps, the event system is now fully typed, 7 functions had their scope argument removed, and more. See `README.md` and `CLAUDE.md` for the current API.

## Overview

Implementation plan for `design-book`, a reactive TypeScript design system framework for managing tokens (colors, spacing, typography) with dependency tracking, dynamic calculations, and multi-format rendering. Replaces [color-router](https://github.com/meodai/color-router) with a generic, extensible architecture.

**Approach:** Bottom-up — build foundational pieces first, compose upward. Each layer is testable before the next depends on it.

**Tooling:** Vite + Vitest, TypeScript, Culori for color operations.

**Key decisions:**
- Generic from day one — renderers are `Renderer`/`SVGRenderer`, not color-specific (source spec uses `ColorRenderer` — we rename)
- `addScope` has no `overrides` parameter — set tokens individually after creation
- Token `type` field is `string`, not a union — allows custom types like `'shadow'` without modifying the library. This also widens `resolvedType` and `returnType` to `string`. Trade-off: no compile-time typo checking on type strings.
- Package name: `design-book`
- All token keys are **always fully qualified** as `"scope.token"` — both in `ref()` calls and in the dependency graph. There is no unqualified key format.
- Event emitter: custom minimal implementation (no Node dependency). Simple `Map<string, Set<callback>>` — the library must work in both Node and browser environments.
- `flush()` does **not** throw. It processes all keys it can, collects errors, fires `batch-failed` with the error list, and returns a summary object `{ processed: string[], errors: Error[] }`. Partial success is possible.
- Re-entrancy in auto mode: if a `tokenChanged` event handler calls `scope.set()`, the new change is queued and processed after the current propagation completes (breadth-first, not recursive).

## Project Structure

```
design-book/
├── src/
│   ├── index.ts                    # Public API exports
│   ├── graph.ts                    # Generic Graph class
│   ├── dependency-graph.ts         # DependencyGraph extends Graph
│   ├── tokens.ts                   # Token types + val(), hex(), ref(), px(), rem()
│   ├── reference-resolver.ts       # ReferenceResolver
│   ├── scope.ts                    # Scope class
│   ├── scope-manager.ts            # ScopeManager
│   ├── design-book.ts              # DesignBook class
│   ├── errors.ts                   # Error classes
│   ├── functions/
│   │   ├── index.ts                # Re-exports all built-in functions
│   │   ├── color/
│   │   │   ├── best-contrast.ts
│   │   │   ├── min-contrast.ts
│   │   │   ├── color-mix.ts
│   │   │   ├── lighten.ts
│   │   │   ├── darken.ts
│   │   │   ├── relative-to.ts
│   │   │   ├── closest-color.ts
│   │   │   ├── furthest-from.ts
│   │   │   └── average-color.ts
│   │   └── non-color/
│   │       ├── spacing-scale.ts
│   │       ├── typography-scale.ts
│   │       └── timing.ts
│   └── renderers/
│       ├── renderer.ts             # Base Renderer class
│       ├── svg-renderer.ts         # SVG visualization
│       └── function-renderers.ts   # Built-in function renderers
├── tests/                          # Mirrors src/ structure 1:1
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Section 1: Error Classes (`errors.ts`)

Four error classes, all extending `Error`:

- **`TokenError(message, tokenKey?, context?)`** — Token operation failures. `context` is a `Record<string, any>` for arbitrary debugging info.
- **`ScopeError(message, scopeName?)`** — Scope operation failures.
- **`CircularDependencyError(path: string[])`** — Auto-generates message: `"Circular dependency detected: ${path.join(' → ')}"`.
- **`FunctionError(message, functionName?, options?)`** — Function execution failures. `options` carries the function's options for debugging.

## Section 2: Token Types (`tokens.ts`)

### Interfaces

**`TokenValue`** — Basic token:
```typescript
interface TokenValue {
  type: string;              // 'color', 'dimension', or any custom type
  rawValue: string | number;
  processors?: Array<{ name: string; instance: any }>;
  description?: string;
  metadata?: { unit?: string; colorSpace?: string; validated?: boolean; [key: string]: any };
}
```

**`ReferenceValue`** — Pointer to another token:
```typescript
interface ReferenceValue {
  type: 'reference';
  key: string;
  description?: string;
  resolvedType?: string;     // Cached type of resolved value
  resolvedMetadata?: {
    isResolvable?: boolean;
    lastResolvedAt?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}
```

**`FunctionTokenValue`** — Computed token:
```typescript
interface FunctionTokenValue {
  type: 'function';
  rawValue: string;          // Function name
  implementation: (...args: any[]) => string;
  args: (TokenValue | ReferenceValue | Scope | number | string)[];
  processors?: Array<{ name: string; instance: any }>;
  description?: string;
  options?: Record<string, any>;
  metadata?: {
    dependencies: string[];
    visualDependencies: string[];
    acceptedTypes?: string[][];
    returnType?: string;
    [key: string]: any;
  };
}
```

**`AnyTokenValue = TokenValue | ReferenceValue | FunctionTokenValue`**

### Helper Constructors

- **`val(value, options?)`** — Universal wrapper that merges `description` and other options onto any value object.
- **`hex(value, options?)`** — Creates `TokenValue` with `type: 'color'`. Parses via Culori at creation time, stores parsed instance in `processors`. If parsing fails, sets `metadata.validated = false`.
- **`ref(key, options?)`** — Creates `ReferenceValue` with uninitialized resolution metadata.
- **`px(value, options?)`** — Creates `TokenValue` with `type: 'dimension'`, `metadata.unit: 'px'`.
- **`rem(value, options?)`** — Creates `TokenValue` with `type: 'dimension'`, `metadata.unit: 'rem'`.
- **`ms(value, options?)`** — Creates `TokenValue` with `type: 'dimension'`, `metadata.unit: 'ms'`. Used for timing/animation tokens.

### Utilities

- **`extractDependencies(args)`** — Walks function args, collects `key` from any `ReferenceValue` args. Returns `string[]`.
- **`extractVisualDependencies(args)`** — Walks function args, collects keys from `Scope`-type args (all keys in the scope). Returns `string[]`.

## Section 3: Graph System

### `graph.ts` — Generic Directed Graph

No domain knowledge. Stores adjacency in both directions for efficient traversal.

**Storage:** Two `Map<string, Set<string>>` — `outgoing` (A depends on B: A→B) and `incoming` (reverse).

**Methods:**
- `addNode(key)`, `addEdge(from, to)`, `removeNode(key)`, `removeEdge(from, to)`
- `getOutgoing(key)`, `getIncoming(key)` — direct neighbors
- `dfsTraversal(start, upstream?)` — depth-first. `upstream=true` follows incoming edges instead of outgoing.
- `bfsTraversal(start, upstream?)` — breadth-first, same direction flag.
- `hasCycles()` — full graph cycle detection via three-color marking (white/gray/black).
- `topologicalSort(keys?)` — Kahn's algorithm. Throws `CircularDependencyError` if cycles found. Optional `keys` parameter sorts a subset.
- `findShortestPath(from, to, upstream?)` — BFS shortest path, returns `string[] | null`.
- `hasPath(from, to, upstream?)` — boolean shortcut.
- `getAllNodes()`, `getNodeDegree(node, incoming?)`

### `dependency-graph.ts` — Extends Graph

Adds token-domain semantics:

- `getPrerequisitesFor(key)` → `getIncoming(key)` — what this token depends on
- `getDependentsOf(key)` → `getOutgoing(key)` — what depends on this token
- `getEvaluationOrderFor(key)` — collects all upstream nodes via DFS, topologically sorts them
- `updateEdges(key, dependencies)` — replaces all incoming edges for a key. **Before applying, checks if new edges would create a cycle** — if so, throws `CircularDependencyError` without modifying the graph. This is the key safety mechanism.

## Section 4: Scope System

### `scope.ts` — Token Container with Inheritance

```typescript
constructor(name: string, book: DesignBook, options?: { extends?: string; description?: string })
```

- Stores tokens in `Map<string, AnyTokenValue>`
- Holds a reference to its `DesignBook` (for cross-scope resolution and dependency graph access)
- Optional `extends` — name of parent scope
- Owns a `ReferenceResolver` instance (which accesses the dependency graph via `this.book.getDependencyGraph()`)

**Token lookup with inheritance:**
- `get(name)` — local first, then parent chain
- `has(name)` — local first, then parent chain
- `getAllKeys()` — deduplicated union of local + inherited keys
- `allTokens()` — same, returns full token objects

**Setting tokens:**
- `set(name, value)` — always sets locally (overrides parent if key exists there). After setting:
  1. Tells ReferenceResolver to update metadata for anything referencing this key
  2. Notifies DesignBook for dependency propagation and event dispatch

**Resolution:**
- `resolve(name)` — returns final computed string:
  - Basic tokens: `rawValue` (with unit suffix for dimensions)
  - References: follows the chain via DesignBook's `resolve()`
  - Functions: executes `implementation` with resolved args

### `reference-resolver.ts`

- `updateReferenceMetadata(ref)` — resolves the reference, updates `resolvedType`, `isResolvable`, `lastResolvedAt`, `errorMessage` on the ReferenceValue object itself
- `updateAllReferencesTo(key)` — finds all dependents via dependency graph, updates metadata on references and function args pointing to the changed key
- `getCachedType(ref)` / `isResolvable(ref)` — read cached metadata without triggering resolution

### `scope-manager.ts` — CRUD on Scopes

- `addScope(name, options?)` — creates scope, wires up `extends`. No overrides.
- `extendScope(name, base, description?)` — shorthand for addScope with extends
- `copyScope(source, target)` — deep-copies tokens into a new scope (snapshot, no inheritance link)
- `deleteScope(name)` — removes scope, cleans up dependency graph. Returns removed key list.
- `hasScope(name)`, `getScope(name)`, `getAllScopes()`
- `getAllKeysForScope(name)` — delegates to `scope.getAllKeys()`
- `getScopeDependencies(name)` — finds all reference keys pointing outside this scope

## Section 5: DesignBook (`design-book.ts`)

The orchestrator. Owns ScopeManager, DependencyGraph, function registry, event emitter.

```typescript
constructor(name: string, options?: { mode?: 'auto' | 'batch'; description?: string })
```

**Properties:**
- `name: string` — read-only name of the design book
- `description?: string` — read-only description
- `mode: 'auto' | 'batch'` — read/write, switchable at runtime
- `batchQueueSize: number` — pending updates (0 in auto mode)

**Scope management:** Delegates to ScopeManager — `addScope`, `extendScope`, `copyScope`, `deleteScope`, `getScope`, `hasScope`, `getAllScopes`, `getAllKeysForScope`, `getScopeDependencies`.

**Token operations:**
- `resolve(key)` — parses `"scope.token"` format, delegates to scope's `resolve()`
- `has(key)` — same delegation
- `getTokenByKey(key)` — parses `"scope.token"`, returns the raw `AnyTokenValue` object (without resolving). Used by ReferenceResolver to inspect token types.
- `getDependencyGraph()` — returns the `DependencyGraph` instance for inspection and analysis

**Function registry:**
- `registerFunction(name, impl)` — stores in `Map<string, Function>`
- Functions registered here are looked up by name when resolving `FunctionTokenValue`s

**Events:**
- `on(event, callback)` — subscribe to events
- `watch(key, callback)` — sugar for `tokenChanged` filtered to a specific key

**Event types and payloads:**
- `change` — `{ detail: { changedKeys: string[], scopes: string[] } }`
- `scopeAdded` — `{ detail: { scopeName: string } }`
- `scopeRemoved` — `{ detail: { scopeName: string } }`
- `tokenChanged` — `{ detail: { key: string, newValue: any, oldValue: any } }`
- `batch-complete` — `{ detail: { processedKeys: string[], totalProcessed: number } }`
- `batch-failed` — `{ detail: { errors: Error[], affectedKeys: string[] } }`

### Resolution Flow

This is how resolution works across Scope and DesignBook without infinite loops:

**`DesignBook.resolve(qualifiedKey)`** — parses `"scope.token"`, looks up the Scope, calls `scope.resolveToken(tokenName)`.

**`Scope.resolveToken(name)`** — gets the `AnyTokenValue` for the name (local or inherited), then:
- `TokenValue`: returns `rawValue` (with unit suffix for dimensions like `"16px"`)
- `ReferenceValue`: calls `this.book.resolve(ref.key)` — the reference key is always fully qualified (e.g., `"brand.primary"`), so this goes back to DesignBook which parses it and delegates to the target scope. **No loop** because the target scope resolves its own token, which is not a reference back (circular references are blocked by the dependency graph at `set()` time).
- `FunctionTokenValue`: resolves each arg (references via `this.book.resolve()`, basic values directly), then calls `implementation(...resolvedArgs)`.

**Example trace** — `book.resolve('semantic.background')` where `background = ref('brand.primary')` and `brand.primary = hex('#0066cc')`:
1. `book.resolve('semantic.background')` → parses to scope=`semantic`, token=`background`
2. `semantic.resolveToken('background')` → gets `ReferenceValue { key: 'brand.primary' }`
3. Calls `this.book.resolve('brand.primary')` → parses to scope=`brand`, token=`primary`
4. `brand.resolveToken('primary')` → gets `TokenValue { type: 'color', rawValue: '#0066cc' }`
5. Returns `'#0066cc'` — done, no loop

**Auto mode change propagation flow:**
1. `scope.set()` stores the value
2. Scope notifies DesignBook with the qualified key
3. DesignBook updates dependency graph edges via `updateEdges()`
4. DesignBook gets dependents in topological order
5. For each dependent, re-resolves and fires `tokenChanged`
6. Fires `change` with summary of all affected keys
7. If any event handler triggers another `set()`, the change is queued and processed after the current propagation completes

**Batch mode:**
- Changes are queued (qualified key + new value)
- `flush()` collects all queued keys, topologically sorts, resolves in order
- Does not throw — collects errors for keys that fail
- Fires `batch-complete` on success with `{ processedKeys, totalProcessed }`
- Fires `batch-failed` if any errors with `{ errors, affectedKeys }`
- Returns `{ processed: string[], errors: Error[] }`

## Section 6: Built-in Functions

Each function file exports a **constructor** (returns `FunctionTokenValue` with dependency metadata) and an **implementation** (the computation, runs at resolve time).

### Color Functions (use Culori)

All color functions:
1. Resolve any reference args via scope
2. Validate types (throw `FunctionError` if wrong)
3. Use pre-parsed Culori instances from `processors` when available
4. Return hex string

| Function | Args | Behavior |
|---|---|---|
| `bestContrastWith` | target, scope | Highest WCAG contrast from scope colors |
| `minContrastWith` | target, scope, `{ratio?: 4.5}` | Closest color meeting minimum WCAG ratio; falls back to highest contrast |
| `colorMix` | color1, color2, scope, `{ratio?: 0.5, colorSpace?: 'lab'}` | Culori interpolation between two colors |
| `lighten` | color, scope, `{amount?: 0.1}` | Increase lightness in HSL |
| `darken` | color, scope, `{amount?: 0.1}` | Decrease lightness in HSL, clamped to 0 |
| `relativeTo` | color, colorSpace, modifications[], scope | Per-channel modification: `null` (keep), number (absolute), `"+N"` `"-N"` `"*N"` `"/N"` (relative) |
| `closestColor` | target, scope | Euclidean RGB distance, returns closest. Fallback: `#00000000` |
| `furthestFrom` | scope | CIELAB Delta E, greatest average distance to all others |
| `averageColor` | scope, `{colorSpace?: 'lab'}` | Average all channels in target color space |

### Non-Color Functions

| Function | Args | Behavior |
|---|---|---|
| `spacingScale` | base, scope, `{multiplier?: 1}` | `value * multiplier` preserving unit |
| `typographyScale` | base, scope, `{ratio?: 1.25, step?: 0}` | `value * (ratio ^ step)` preserving unit |
| `timing` | duration, easing, scope, `{delay?: 0}` | Returns `"200ms ease-in-out"` or `"200ms ease-in-out 100ms"` |

## Section 7: Renderers

### `renderer.ts` — Base Renderer

- Constructor: `(book: DesignBook, format: RenderFormat)`
- `RenderFormat = 'css-variables' | 'json' | 'w3-design-tokens'`
- `render(): string` — iterates all scopes/tokens, dispatches to format logic
- `registerFunctionRenderer(name, renderer)` — per-function, per-format rendering

**CSS variables format:**
- Tokens become `--scope-token: value` (dots to hyphens)
- References become `var(--scope-token)`
- Functions use registered function renderers

**JSON format:**
- All values fully resolved: `{ "scope.token": "#hexvalue" }`

**W3 Design Tokens format:**
- Nested structure with `$value` and `$type` per W3 spec
- References use `{scope.token}` syntax

### `function-renderers.ts`

Built-in renderers per format:

| Function | CSS | JSON/W3 |
|---|---|---|
| `colorMix` | `color-mix(in ${space}, ${c1} ${pct}%, ${c2})` | Resolved hex |
| `lighten` | `color-mix(in oklch, ${color} ${pct}%, white)` | Resolved hex |
| `darken` | `color-mix(in oklch, ${color} ${pct}%, black)` | Resolved hex |
| `relativeTo` | `color(from ${color} ${space} ${channel-exprs})` with `calc()` | Resolved hex |
| Others | Resolved value | Resolved value |

### `svg-renderer.ts` — Extends Renderer

- Circular table layout of scopes and tokens
- Curved Bezier paths for dependencies
- Dashed lines for function-type dependencies
- Color dots for tokens, rotated squares for scope headers
- Configurable: `gap`, `padding`, `fontSize`, `dotSize`, `strokeWidth`, `showConnections`

## Section 8: Interactive Demo

An interactive demo app served via Vite dev server, similar to color-router's demo. Lives in `/demo` and exercises the full library API.

### Structure

```
demo/
├── index.html          # Entry point
├── demo.ts             # Main demo logic — sets up DesignBook, wires UI
├── demo-input-parser.ts # Parses user input into token definitions
└── style.css           # Minimal styles (Tailwind or plain CSS)
```

### Layout

Two-column layout:

**Left column — Input:**
- Scope creator (name + optional extends)
- Token definition area per scope (inline editable). Supports typing `hex('#ff0000')`, `ref('brand.primary')`, function calls, etc.
- "Add scope" / "Add token" buttons
- Comes pre-loaded with example scopes (brand, semantic, ui) demonstrating all token types and functions

**Right column — Output:**
- Tabbed output: CSS Variables | JSON | W3 Design Tokens
- Live event log with timestamps (shows `tokenChanged`, `change`, `batch-complete` events)
- Dependency info panel: click a token to see its prerequisites, dependents, and resolution chain

**Full-width bottom:**
- SVG visualization (circular layout from SVGRenderer)
- Toggle for showing/hiding dependency connections
- Tokens rendered as colored dots, scopes as section headers

### Behavior

- All changes are reactive — editing a token value immediately updates all outputs and the visualization
- Input parser converts user text into library calls (e.g., `hex('#ff0000')` → `hex('#ff0000')`, `ref('brand.primary')` → `ref('brand.primary')`)
- Color tokens show a color swatch next to their value
- Hovering a token in the visualization highlights its dependency connections
- Error states are shown inline (e.g., circular dependency, unresolved reference)

### Running

- `npm run dev` — starts Vite dev server, serves the demo
- `npm run build:demo` — builds demo to `/demo-dist` for deployment
- Vite config uses a separate entry point for demo vs library build

### Pre-loaded Example

The demo boots with a working design system demonstrating:
- Brand scope: primary, secondary, neutral colors + spacing tokens
- Semantic scope: references to brand colors, `bestContrastWith` for text colors, `colorMix` for hover states
- UI scope: `relativeTo` for color variants, `minContrastWith` for accessible text, `typographyScale` for type hierarchy, `spacingScale` for layout
- A dark theme scope extending the brand scope with overridden colors

This covers all built-in functions and features in one glanceable example.

## Implementation Order

Bottom-up, each layer tested before the next:

1. `errors.ts` + tests
2. `tokens.ts` + tests
3. `graph.ts` + tests
4. `dependency-graph.ts` + tests
5. `reference-resolver.ts` + tests
6. `scope.ts` + tests
7. `scope-manager.ts` + tests
8. `design-book.ts` + tests
9. Color functions (all 9) + tests
10. Non-color functions (all 3) + tests
11. `renderer.ts` + `function-renderers.ts` + tests
12. `svg-renderer.ts` + tests
13. `index.ts` (public exports)
14. Interactive demo (demo/)
15. Project setup (package.json, vite config, tsconfig)

Step 15 (project setup) actually runs first chronologically — it's listed last because it's infrastructure, not architecture. Step 14 (demo) runs last as it exercises the complete library.
