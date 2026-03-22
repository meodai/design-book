# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Design Book is a reactive TypeScript design system framework for managing tokens (colors, spacing, typography) with dependency tracking, dynamic calculations, and multi-format output. The complete specification lives in `design-book-spec.md`.

**Status:** Specification phase — no source code has been implemented yet. The spec document is the source of truth.

## Architecture

The system is built around four core classes:

- **DesignBook** — Central orchestrator managing scopes, tokens, dependencies, and rendering. Supports `auto` (immediate) and `batch` (deferred) processing modes.
- **Scope** — Collection of related tokens with inheritance support. Tokens are set/get/resolved within scopes.
- **ReferenceResolver** — Cached reference resolution with metadata tracking to avoid redundant computation.
- **DependencyGraph** — Tracks token relationships, detects circular dependencies, supports topological sorting.

### Token Value Types

Three value types: `TokenValue` (basic), `ReferenceValue` (pointer to another token), `FunctionTokenValue` (computed via registered functions). Helper constructors: `hex()`, `ref()`, `px()`, `rem()`.

### Renderer System

- **ColorRenderer** — Outputs CSS variables, JSON, or W3 Design Tokens format
- **SVGRenderer** — Generates dependency visualizations
- Function renderers provide format-specific output for complex operations

### Built-in Functions

Color functions use the Culori library: `bestContrastWith()`, `colorMix()`, `lighten()`, `darken()`, `closestColor()`, `furthestFrom()`, `averageColor()`. Non-color: `spacingScale()`, `typographyScale()`, `timing()`.

### Error Handling

Custom error classes (`TokenError`, `ScopeError`, `CircularDependencyError`, `FunctionError`). In auto mode errors throw immediately; in batch mode they collect and report after `flush()`.

### Event System

Reactive updates via `on()` (event-based) and `watch()` (key-based) methods with automatic change propagation through the dependency graph.
