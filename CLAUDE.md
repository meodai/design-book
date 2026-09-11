# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start editor (Vite dev server with network access)
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run build        # Build library to dist/
npm run build:editor # Build editor to editor-dist/
```

Run a single test file: `npx vitest run tests/graph.test.ts`

## Project Overview

Design Book is a reactive TypeScript design system framework for managing tokens (colors, spacing, typography) with dependency tracking, dynamic calculations, and multi-format rendering. Uses Culori for color operations.

## Architecture

### Core Classes

- **DesignBook** (`src/design-book.ts`) — Central orchestrator. Owns ScopeManager, DependencyGraph, typed event emitter, function registry. Supports `auto` (immediate propagation) and `batch` (deferred via `flush()`) modes. Re-entrant-safe in auto mode. Built-in functions auto-register in constructor via `registerBuiltinFunctions()`.
- **Scope** (`src/scope.ts`) — Named token container with inheritance via `extends`. Resolves tokens: basic values, references (cross-scope via DesignBook), and functions (looked up from DesignBook's function registry by `fn.name`, not stored on the token). Supports `hasOwn()`, `isInherited()`, `getSourceKey()`, and `delete()` for inherited token management.
- **ScopeManager** (`src/scope-manager.ts`) — CRUD for scopes, tracks inheritance. `getScopeDependencies()` checks both reference and function token dependencies.
- **DependencyGraph** (`src/dependency-graph.ts`) — Extends generic `Graph` (`src/graph.ts`). Tracks *value* dependencies only, and prevents circular ones at write time via `updateEdges()`. Inherited tokens register a dependency on their source key. Selector candidate pools are deliberately **not** edges — see "Selector pools" below.
- **ReferenceResolver** (`src/reference-resolver.ts`) — Caches reference metadata (resolvability, type) in WeakMaps via `getReferenceResolution()` / `setReferenceResolution()`. Cache is updated by DesignBook after graph mutations.

### Token System (`src/tokens.ts`)

Three value types: `TokenValue`, `ReferenceValue`, `FunctionTokenValue` (union: `AnyTokenValue`).

**Key design**: Tokens are pure serializable data. No closures or functions stored on token objects.
- Processors (e.g., Culori parsed color instances) live in `WeakMap` via `getTokenProcessors()` / `setTokenProcessors()`
- Reference resolution cache lives in `WeakMap` via `getReferenceResolution()` / `setReferenceResolution()`
- Function implementations are looked up from the DesignBook registry by `fn.name`, not stored on `FunctionTokenValue`

Constructors — all validate and throw on invalid input:
- `color(value)` — any CSS color via Culori
- `ref(key)` — reference to another token (always fully qualified: `'scope.token'`)
- `px(n)`, `rem(n)`, `ms(n)` — dimension shortcuts, delegate to `dimension(n, unit)`
- `dimension(n, unit)` — generic dimension
- `string(value)` — string token
- `createFunctionToken(name, args, config?)` — creates `FunctionTokenValue` without needing to specify `type` or `rawValue`

Type guards: `isReferenceValue(arg)`, `isTokenValue(arg)`

Function argument type: `FunctionArg = TokenValue | ReferenceValue | ScopeFunctionArg | string | number`

### Functions (`src/functions/`)

Each function exports a **constructor** (returns `FunctionTokenValue` via `createFunctionToken`) and an **implementation** (the actual computation). Implementations are auto-registered on DesignBook construction via `registerBuiltinFunctions()`.

At resolve time, `Scope.resolve()` looks up the function by `fn.name` from the registry and calls `implementation(...resolvedArgs, fn.options)`.

**With scope argument** (iterate scope colors): `bestContrastWith`, `minContrastWith`, `closestColor`, `furthestFrom`, `mostVivid`, `leastVivid`

**With scope argument** (generic selectors): `nth`, `random`, `nextLarger`, `nextSmaller`

**Without scope** (pure transforms): `colorMix`, `lighten`, `darken`, `shade`, `relativeTo`, `spacingScale`, `typographyScale`, `timing`

#### Selector pools (`_selectorsByScope` in `src/design-book.ts`)

A selector's candidate pool is the live membership of the scope it iterates.
That is not a value dependency — a pool member may legitimately be derived
from the selector itself (`ui.muted = lighten(ref('ui.text'))` where
`ui.text` selects out of `ui`) — so pools live in an index (scope name →
selector keys, with the reverse map `_scopesBySelector`) rather than in the
graph, which would reject that write as a cycle. `_indexSelector` maintains
it on every write, delete and rollback; `_collectDependents` fans out
through it so a change to any key of scope S (own or inherited, added,
changed or deleted, resolved along the `extends` chain) notifies every
selector iterating S and then continues the normal DFS. Mutual pools
terminate on the `seen` set; a selector never notifies itself.

#### Colour behaviour worth knowing

- Selectors judge translucent candidates composited over the target and can return 8-digit hex.
- `mostVivid` / `leastVivid` throw when `minContrast` is given without `against`, or when `against` does not parse.
- `closestColor` / `furthestFrom` measure Euclidean distance in OKLab.
- `lighten` / `darken` are OKLCH mixes towards white / black through `cssColorMix` (`src/functions/color/color-mix.ts`) — the JS twin of the `color-mix()` the CSS renderer emits, premultiplied alpha included. `colorMix` uses the same helper. `shade` shifts OKLCH lightness and carries alpha through. All gamut-map in OKLCH before formatting and emit 8-digit hex only when translucent.
- `nextLarger` / `nextSmaller` skip members whose unit differs from the target's instead of throwing.

### Renderers (`src/renderers/`)

- **Renderer** — Outputs CSS variables (with `var()` refs, `color-mix()`, `calc()`, `color(from ...)`), JSON (resolved values), or W3 Design Tokens (structured objects per spec with proper color/dimension/duration formats). Built-in function renderers auto-registered in constructor. The CSS pass throws when two keys mangle to the same custom-property name. `$type` can be overridden per token with `metadata.w3Type`; because `val()` shallow-merges options, pass `metadata: { unit, w3Type }` in one object or the constructor's `unit` is lost.
- **SVGRenderer** — Circular table layout with Bezier dependency curves. Dashed lines for function dependencies. Palette-linker detection reads the live scope args (`extractVisualDependencies(fn.args)`), not the construction-time `metadata.visualDependencies` snapshot. Inherits CSS variables from the editor for theming.

### Editor (`editor/`)

Interactive CodeMirror 6-based editor. One CodeMirror instance per scope. Features:
- Context-aware autocomplete (refs, scope names for scope-arg functions, functions, value constructors, `inherit` keyword)
- Inline color swatches (editable via `hdr-color-input` picker for `color()` tokens, read-only for `ref()` resolved colors)
- Error highlighting (wavy red underline for unparseable lines)
- Inherited token dimming (opacity 0.4) with `inherit` keyword support
- `inherit` keyword shows resolved value inline as `→ #0066cc`
- Empty scopes removed on blur
- Inherited keys auto-re-injected if deleted from editor

### Typed Events (`src/design-book.ts`)

Event system uses `DesignBookEventMap` with typed payloads:
- `tokenChanged` → `TokenChangedDetail { key, newValue, oldValue }`
- `change` → `ChangeDetail { changedKeys, scopes }`
- `scopeAdded` → `ScopeAddedDetail { scope }`
- `scopeRemoved` → `ScopeRemovedDetail { scope, removedKeys }`
- `batch-complete` → `BatchCompleteDetail { processed }`
- `batch-failed` → `BatchFailedDetail { processed, errors }`
- `error` → `ErrorDetail { key, error, phase }` — `phase` is `'reentrant'` (a change made from an event handler was rejected after the outer `set()` had already returned, so it was reported instead of thrown) or `'rollback'` (announcing that an already-announced change had been undone itself failed)

`on()` and `watch()` return unsubscribe functions.

### Key Design Decisions

- All token keys are fully qualified: `"scope.token"`
- Tokens are serializable data — no closures, functions, or mutable state on token objects
- Function implementations live in a registry, looked up by name at resolve time
- Token `type` field is `string` (not a union) — extensible for custom types
- `flush()` does not throw — collects errors, fires `batch-failed`
- Setting `mode` from `batch` to `auto` flushes whatever is still queued
- A `set()` the graph rejects after the change was announced emits a corrective `tokenChanged` + `change` with the restored value before rethrowing
- `addScope` rejects empty/dotted names and self- or cyclic `extends` with a `ScopeError`
- Circular dependency errors in batch mode are collected, not silently swallowed
- Re-entrancy in auto mode: changes from event handlers are queued
- Deleting a token cleans up its graph node and updates dependent caches
- Inherited tokens register dependency edges on their source key for correct propagation
- Selector candidate pools are an index, not graph edges — pool membership never rejects a write
- Custom event emitter (no Node dependency) — works in browser and Node
- CodeMirror and hdr-color-input are devDependencies (editor-only)
