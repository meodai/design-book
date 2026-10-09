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
- **Scope** (`src/scope.ts`) — Named token container with inheritance via `extends`. Resolves tokens: basic values, references (cross-scope via DesignBook), and functions (looked up from DesignBook's function registry by `fn.name`, not stored on the token). Scope arguments are looked up by name at resolve time (falling back to the captured object), so a selector follows a scope that was deleted and re-created. Supports `hasOwn()`, `isInherited()`, `getSourceKey()`, and `delete()` for inherited token management. `addScope(name, { metadata })` attaches a free-form plain object (`scope.metadata`, default `{}`, shallow-copied, mutable, not inherited through `extends`); the book never reads it — only the css-variables renderer reads `metadata.media`. `set()` validates the key (`assertValidTokenKey`): only ASCII letters, digits, `-`, `_` and non-ASCII characters, so whitespace, `.`, `$`, `{`, `}` and other punctuation throw a `TokenError` — keys end up in CSS custom-property names and W3 token names. `detectValueType()` (exported from `src/scope.ts`) is the one rule for typing a resolved value, used by Scope ordering and the W3 renderer: Culori-parseable → `color`; a single number with an optional unit (`16px`, `.5rem`, `1.5`) → `dimension` (unitless = empty unit, like `dimension(1.5, '')`); anything else (`16px solid`) → `string`.
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

### Naming (`src/naming/`)

Published twice: from the package root and as the standalone subpath `design-book/naming` (second Vite lib entry → `dist/naming.js`, types at `dist/naming/index.d.ts`). It must stay dependency-free — it may import only `src/errors.ts` and `src/keys.ts` (the token-key check, re-exported by `scope.ts`); `tests/naming/standalone.test.ts` enforces this.

`nameValues(values, scheme, options?)` (→ `[name, value][]`), `scaleNames(count, scheme, options?)`, `nameBetween(lower, upper, scheme)`, `namingScheme(names, { base?, anchor? })` and the frozen `schemes` record produce token **keys** only — they never create or touch values or a DesignBook.

A scheme is a vocabulary (kinds: `list`, open-ended `ordinal` / `roman` / `tshirt`, numeric `range` with coarse-to-fine step tiers, and `value`, which names each value by its own number and so only works through `nameValues`) plus a default strategy, reported as `anchor`. Strategies: `start` (consecutive from `from`, by `step`), `base` (consecutive both ways from a centre), `range` (ends fixed, spread evenly; a pinned `[n, name]` spreads each side to its end; lists with a centre name pin it by default, in proportion). Without `anchor`, a bare `base` index implies `base`; a `[n, name]` pin implies `range` on bounded vocabularies and `base` on open-ended ones. Ranges over open-ended vocabularies need `from` and `to` and are spread as a materialised list.

- `overflow: 'between'` (range, and start on a list) keeps every name and fills extra steps as fractions (`fillGaps`: `soft_5`, `low_33 low_67`); numeric ranges keep halving their step (`62_5`).
- `nameBetween` maps names to positions (list index, t-shirt offset, Roman value, the number) and returns the name at the midpoint: a real name when one sits there, else `<name below>_<fraction>`; it accepts its own output. The docs steer users to re-run `scaleNames` and use `nameBetween` only when existing keys must stay stable.
- Options that do not fit the scheme and strategy throw. Number names are keys: `0_25`, `-1`. Every name passes `assertValidTokenKey`.

### Functions (`src/functions/`)

Each function exports a **constructor** (returns `FunctionTokenValue` via `createFunctionToken`) and an **implementation** (the actual computation). Implementations are auto-registered on DesignBook construction via `registerBuiltinFunctions()`.

Constructors validate what they can up front and throw `FunctionError`: `colorMix` `ratio` and `lighten` / `darken` `amount` must lie in [0, 1], `relativeTo` needs a supported color space.

At resolve time, `Scope.resolve()` looks up the function by `fn.name` from the registry and calls `implementation(...resolvedArgs, fn.options)`.

A function token's graph edges are `functionDependencies(fn)` (`src/tokens.ts`): the refs in its args (nested tokens included) unioned with `metadata.dependencies`, deduplicated — so a bare `createFunctionToken(name, [ref(…)])` is tracked too.

**With scope argument** (iterate scope colors): `bestContrastWith`, `minContrastWith`, `closestColor`, `furthestFrom`, `mostVivid`, `leastVivid`, `lightest`, `darkest`

**With scope argument** (generic selectors): `nth`, `random`, `nextLarger`, `nextSmaller`

`nth` index: integers (including `1.0`, which *is* `1`) are direct indices, negative ones count from the end (`-1` = last); only non-integers are relative positions (`0.5` = middle), clamped to [0, 1].

The generic selectors (`nth`, `random`, `nextLarger`, `nextSmaller`, `sibling`) build their pool through `src/functions/scope-members.ts` (`poolKeys` / `resolvePool`), so they agree on positions: `not` matches a member's qualified key or, for an inherited member, its source key; members that themselves walk the scope (`iteratedScopesOf(tok)` includes it — selectors, nested ones, `sibling`) are skipped; unresolvable members are skipped. Color selectors share only the `not` rule (`isExcluded`).

**Scope from the anchor key**: `sibling(ref, offset, { wrap, not })` — keeps the anchor key in `fn.options.from` (it needs the key's position, not its value) and declares its scope in `metadata.iteratedScopes`, which the selector-pool index reads alongside scope arguments (`iteratedScopesOf()` in `src/tokens.ts`). Its registry closure looks the scope up via `book.getScope`, so `registerBuiltinFunctions` needs `getScope`. The editor serializer special-cases it back to `sibling(ref('…'), n)`.

**Without scope** (pure transforms): `colorMix`, `lighten`, `darken`, `shade`, `relativeTo`, `spacingScale`, `typographyScale`, `timing`

**Composite**: `typography(fields)` (`src/functions/non-color/typography.ts`) — a text style as one token (W3 `typography`). The field values are the args, the names `options.fields` (each a valid token key), so field refs are ordinary graph edges and a `ref()` to it carries the whole style. Resolves to `font-size: 2rem; line-height: 1.5` (fields kebab-cased, in order). `ref('scope.token.field')` reads one field: `tokenKeyOf()` (`src/tokens.ts`) cuts every dependency to `scope.token`, so the graph only sees whole tokens (coarse but never wrong); `Scope.resolve` / `DesignBook.has` handle the third segment (following refs and variant bases); CSS gets `var(--scope-token-field)` for free; W3 writes the resolved field (no alias syntax inside composites). `withFields(base, overrides)` (`null` drops a field): with a **token** → a copy (how a layer changes a style in place); with a **ref** → a live variant (`options.base`, plus `options.removed`; the base key is in `metadata.dependencies`), whose unset fields read the base — `typographyFieldNames()` gives the full list, the registry closure needs `resolve` / `getTokenByKey`, and `Scope.set` rejects a variant of its own key with a hint. The css-variables renderer writes `--scope-key-<field>` per field plus a `.scope-key` class, for the token and for any ref (chain) ending at one (`var(--target-<field>)`); a variant's inherited fields are `var(--base-<field>)`; the collision check covers field variables. W3 writes the native composite (fields resolved); a ref to it stays an alias with `$type: typography`. The editor parses and prints `typography({ … })` and `withFields(ref('…'), { … })` (`serializeTypography` in `editor/editor.ts`, `parseFieldObject` in the input parser).

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

#### Color behaviour worth knowing

- Selectors judge translucent candidates composited over the target and can return 8-digit hex.
- Selector pools (`collectScopeColors`) gamut-map wide-gamut members in OKLCH like the transforms do, rather than clipping them.
- `readableOn` + `minContrast` (default 4.5) filter a color selector's pool by WCAG contrast before ranking (`src/functions/color/readable.ts`). The backdrop is a trailing positional arg, so it is a value dependency; an empty filtered pool throws. Not on `bestContrastWith` / `minContrastWith`.
- `lightest` / `darkest` rank by OKLCH L, ignoring alpha.
- `closestColor` / `furthestFrom` measure Euclidean distance in OKLab. Translucent colors are compared composited over the `readableOn` backdrop, or without one over both white and black, taking the larger distance (`visibleDistance` in `scope-colors.ts`).
- `lighten` / `darken` are OKLCH mixes towards white / black through `cssColorMix` (`src/functions/color/color-mix.ts`) — the JS twin of the `color-mix()` the CSS renderer emits, premultiplied alpha included. `colorMix` uses the same helper. `shade` shifts OKLCH lightness and carries alpha through; `relativeTo` carries it through too. All gamut-map in OKLCH before formatting and emit 8-digit hex only when translucent.
- `nextLarger` / `nextSmaller` skip members whose unit differs from the target's instead of throwing.

### Renderers (`src/renderers/`)

- **Renderer** — Outputs CSS variables (with `var()` refs, `color-mix()`, `calc()`, `color(from ...)`), JSON (resolved values), or W3 Design Tokens (structured objects per spec with proper color/dimension/duration formats). Built-in function renderers auto-registered in constructor. The CSS pass throws when two keys mangle to the same custom-property name. A `typography()` token is a W3 `typography` composite in its own scope; a `ref('scope.token.field')` emits the resolved field (with `fontWeight` / `fontFamily` / `dimension` / `number` `$type`) instead of an alias W3 cannot express. There is no scope-level typography (`addTypography` / `compose` were removed). W3 `dimension` is emitted only for `px` / `rem` (`ms` / `s` → `duration`, unitless → `number`); other units (`em`, `%`, `vw`, …) have no W3 type, so they get no `$type` and keep their CSS text as `$value`, like a string — inside typography composites too. Colors are gamut-mapped into sRGB before their components are read. `$type` can be overridden per token with `metadata.w3Type`; because `val()` shallow-merges options, pass `metadata: { unit, w3Type }` in one object or the constructor's `unit` is lost.
- **Variations** — themes, inverted contexts, brands and breakpoints are separate books built by the same setup function; nothing about conditions is stored in a book. css-variables takes `selector` (default `:root`), `media`, `breakpoints` (name → query; a scope whose `metadata.media` is a breakpoint name, a media type or a raw query renders in its own `@media` block — blocks in table order, then raw queries in scope order; an unknown bare name throws), `scopes` and `changedFrom: otherBook` (only declarations whose rendered text differs, so `var()` references are skipped and recomputed values kept; typography classes are skipped). json takes `scopes` and `changedFrom` (resolved values). `diffBooks(a, b)` (`src/diff-books.ts`) returns `{ changed, added, removed }` by resolved value.
- **Layers** (`src/layers.ts`) — `layer(name, fn | data)` and `composeBook(name, layers, options?)`: a theme is a sparse layer, a themed book is a stack applied in order (last wins) into one plain book, so root overrides re-flow through the normal `set` path. No core changes; nothing about layers is stored in the book. Built in batch mode with a `flush()` per layer; a thrown error or a rejected cycle becomes a `LayerError` (`layerName`, `tokenKey`, `cause`). Data layers create missing scopes, accept tokens only and deep-clone them (scope args kept). Provenance (`layerOf`, `keysFromLayer`) lives in a module `WeakMap`, computed by diffing own-token identity before/after each layer. Scope `extends` is not a theming tool — inherited refs keep their original keys.
- **SVGRenderer** — Circular table layout with Bezier dependency curves. Dashed lines for function dependencies. A token is a palette-linker only when it iterates a scope itself — a top-level scope arg or its own `metadata.iteratedScopes` (`sibling`) — so a selector nested in a value deriver doesn't hide the outer token's graph edges. The pool is read live from the book, not from the construction-time `metadata.visualDependencies` snapshot; the edge comes from the member that matches the output (never the token itself), and a linker with no matching member falls back to its graph edges. Inherits CSS variables from the editor for theming.

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
- Deleting a token cleans up its graph node and updates dependent caches; a node with no token of its own (a missing or deleted key, an inherited shadow) is pruned once nothing depends on it
- Inherited tokens register dependency edges on their source key for correct propagation
- Selector candidate pools are an index, not graph edges — pool membership never rejects a write
- Custom event emitter (no Node dependency) — works in browser and Node
- CodeMirror and hdr-color-input are devDependencies (editor-only)
