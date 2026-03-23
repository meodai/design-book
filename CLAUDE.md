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

- **DesignBook** (`src/design-book.ts`) — Central orchestrator. Owns ScopeManager, DependencyGraph, event emitter, function registry. Supports `auto` (immediate propagation) and `batch` (deferred via `flush()`) modes. Re-entrant-safe in auto mode.
- **Scope** (`src/scope.ts`) — Named token container with inheritance via `extends`. Resolves tokens: basic values, references (cross-scope via DesignBook), and functions (executes implementation with resolved args).
- **ScopeManager** (`src/scope-manager.ts`) — CRUD for scopes, tracks inheritance.
- **DependencyGraph** (`src/dependency-graph.ts`) — Extends generic `Graph` (`src/graph.ts`). Tracks token relationships, prevents circular dependencies at write time via `updateEdges()`.
- **ReferenceResolver** (`src/reference-resolver.ts`) — Caches reference metadata (resolvability, type) on the ReferenceValue objects themselves.

### Token System (`src/tokens.ts`)

Three value types: `TokenValue`, `ReferenceValue`, `FunctionTokenValue` (union: `AnyTokenValue`).

Constructors — all validate and throw on invalid input:
- `color(value)` — any CSS color via Culori. `hex` is a deprecated alias.
- `ref(key)` — reference to another token (always fully qualified: `'scope.token'`)
- `px(n)`, `rem(n)`, `ms(n)` — dimension shortcuts, delegate to `dimension(n, unit)`
- `dimension(n, unit)` — generic dimension
- `string(value)` — string token

### Functions (`src/functions/`)

Each function exports a constructor (returns `FunctionTokenValue`) and an implementation. Two categories:

**With scope argument** (iterate scope colors): `bestContrastWith`, `minContrastWith`, `closestColor`, `furthestFrom`, `averageColor`

**Without scope** (pure transforms): `colorMix`, `lighten`, `darken`, `relativeTo`, `spacingScale`, `typographyScale`, `timing`

### Renderers (`src/renderers/`)

- **Renderer** — Outputs CSS variables (with `var()` refs, `color-mix()`, `calc()`), JSON (resolved values), or W3 Design Tokens (structured objects per spec). Built-in function renderers auto-registered.
- **SVGRenderer** — Circular table layout with Bezier dependency curves. Dashed lines for function dependencies.

### Editor (`editor/`)

Interactive CodeMirror 6-based editor. One CodeMirror instance per scope with autocomplete (context-aware: refs, scope names, functions, value constructors), inline color swatches, and error highlighting (wavy red underline for unparseable lines). Empty scopes are removed on blur.

### Key Design Decisions

- All token keys are fully qualified: `"scope.token"`
- Token `type` field is `string` (not a union) — extensible for custom types
- `flush()` does not throw — collects errors, fires `batch-failed`
- Re-entrancy in auto mode: changes from event handlers are queued
- Custom event emitter (no Node dependency) — works in browser and Node
- CodeMirror is a devDependency (editor-only, not in library bundle)
