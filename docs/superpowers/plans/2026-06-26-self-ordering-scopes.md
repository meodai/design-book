# Self-Ordering Scopes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a scope optionally maintain a canonical token order derived from a composable hierarchy of sort criteria (`type`, `value`, `name`), with per-type orderers in a registry on `DesignBook`.

**Architecture:** Add an orderer registry to `DesignBook` (parallel to the function registry) holding holistic, full-list per-type sort functions. Add order config + a memoized sort engine to `Scope`; ordered `getAllKeys()`/`allTokens()` become the single source of truth that renderers and positional selectors already consume. Order inherits through `extends` like the existing `compose` marker.

**Tech Stack:** TypeScript (ES2020 / ESNext modules / bundler resolution), Vitest, Culori (already a dep), `colorsort-js` v3.1.0 (new dep).

## Global Constraints

- Tokens stay **pure serializable data** — no closures/functions on token objects. Order config lives on the `Scope`, not on tokens.
- All token keys are **fully qualified**: `"scope.token"`.
- Ordering is **opt-in per scope**: a scope that never calls `setOrder` behaves exactly as today.
- When ordered, the order is **canonical**: `getAllKeys()`, `allTokens()`, all renderers, and the positional selectors read it.
- New dependency: `colorsort-js@3.1.0` (ESM-only, zero runtime deps). **Static import, lazy execution** — the color orderer imports the lib + `trained.json` statically but only calls `auto()` on first color ordering. Resolution stays synchronous.
- Orderers are **holistic** (`(entries) => entries`), run once per type-group; the engine derives per-entry ranks for the layered pairwise compare. `desc` is applied by the engine.
- `getAllKeys()` must **never throw** because of ordering: unresolvable tokens sort last (stable), a missing orderer falls through.

---

### Task 1: Orderer registry on `DesignBook`

**Files:**
- Create: `src/orderers/index.ts`
- Modify: `src/design-book.ts` (add registry Map + `registerOrderer`/`getOrderer`/`getOrdererTypes`, call `registerBuiltinOrderers` in ctor)
- Test: `tests/orderers/registry.test.ts`

**Interfaces:**
- Produces:
  - `interface ComparableEntry { key: string; type: string; resolved: string; token: AnyTokenValue }`
  - `type TokenOrderer = (entries: ComparableEntry[]) => ComparableEntry[]`
  - `function registerBuiltinOrderers(book: DesignBook): void`
  - `DesignBook.registerOrderer(type: string, orderer: TokenOrderer): void`
  - `DesignBook.getOrderer(type: string): TokenOrderer | undefined`
  - `DesignBook.getOrdererTypes(): string[]` (registration order)

- [ ] **Step 1: Write the failing test**

```ts
// tests/orderers/registry.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import type { ComparableEntry } from '../../src/orderers';

describe('orderer registry', () => {
  it('registers and retrieves a custom orderer', () => {
    const book = new DesignBook('test');
    const orderer = (entries: ComparableEntry[]) => [...entries].reverse();
    book.registerOrderer('custom', orderer);
    expect(book.getOrderer('custom')).toBe(orderer);
  });

  it('returns undefined for an unregistered type', () => {
    const book = new DesignBook('test');
    expect(book.getOrderer('nope')).toBeUndefined();
  });

  it('exposes registered types in registration order', () => {
    const book = new DesignBook('test');
    const types = book.getOrdererTypes();
    // built-ins registered in ctor (Task 2/3 add these); at minimum the array exists
    expect(Array.isArray(types)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orderers/registry.test.ts`
Expected: FAIL — cannot find module `../../src/orderers`, and `registerOrderer` is not a function.

- [ ] **Step 3: Create the orderers module**

```ts
// src/orderers/index.ts
import type { AnyTokenValue } from '../tokens';
import type { DesignBook } from '../design-book';

/** A token reduced to what an orderer needs: its key, effective type, and
 *  resolved value string. Orderers sort a homogeneous (same-type) list. */
export interface ComparableEntry {
  key: string;
  type: string;
  resolved: string;
  token: AnyTokenValue;
}

/** Sort a homogeneous list of same-type entries into ascending order.
 *  Holistic (whole list at once) so set-based sorts like colorsort-js fit. */
export type TokenOrderer = (entries: ComparableEntry[]) => ComparableEntry[];

/** Auto-register built-in orderers on a DesignBook. Filled in by later
 *  tasks (dimension, string, color). */
export function registerBuiltinOrderers(book: DesignBook): void {
  // dimension/string/color orderers registered in Tasks 2 & 3.
}
```

- [ ] **Step 4: Add the registry to `DesignBook`**

In `src/design-book.ts`, add the import near the other imports:

```ts
import { registerBuiltinOrderers } from './orderers';
import type { TokenOrderer } from './orderers';
```

Add the field next to `private functions` (around line 124):

```ts
  private orderers: Map<string, TokenOrderer> = new Map();
```

Call the registrar in the constructor, right after `registerBuiltinFunctions(this);` (around line 149):

```ts
    registerBuiltinOrderers(this);
```

Add the registry methods next to the function registry methods (after `getFunction`, around line 363):

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/orderers/registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/orderers/index.ts src/design-book.ts tests/orderers/registry.test.ts
git commit -m "feat: add per-type orderer registry to DesignBook"
```

---

### Task 2: Built-in `dimension` and `string` orderers

**Files:**
- Create: `src/orderers/dimension.ts`, `src/orderers/string.ts`
- Modify: `src/orderers/index.ts` (register both in `registerBuiltinOrderers`)
- Test: `tests/orderers/builtins.test.ts`

**Interfaces:**
- Consumes: `ComparableEntry`, `TokenOrderer` (Task 1).
- Produces: `dimensionOrderer: TokenOrderer`, `stringOrderer: TokenOrderer`. Both registered for types `dimension` and `string` respectively. `dimensionOrderer` sorts ascending by the numeric magnitude parsed from `resolved` (e.g. `'16px'` → `16`). `stringOrderer` sorts ascending by `resolved.localeCompare`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/orderers/builtins.test.ts
import { describe, it, expect } from 'vitest';
import { dimensionOrderer } from '../../src/orderers/dimension';
import { stringOrderer } from '../../src/orderers/string';
import type { ComparableEntry } from '../../src/orderers';

const entry = (key: string, resolved: string, type = 'dimension'): ComparableEntry =>
  ({ key, type, resolved, token: { type, rawValue: resolved } as any });

describe('built-in orderers', () => {
  it('dimension orderer sorts by numeric magnitude ascending', () => {
    const out = dimensionOrderer([entry('lg', '16px'), entry('sm', '4px'), entry('md', '8px')]);
    expect(out.map(e => e.key)).toEqual(['sm', 'md', 'lg']);
  });

  it('dimension orderer is pure (does not mutate input array)', () => {
    const input = [entry('lg', '16px'), entry('sm', '4px')];
    dimensionOrderer(input);
    expect(input.map(e => e.key)).toEqual(['lg', 'sm']);
  });

  it('string orderer sorts lexically ascending', () => {
    const out = stringOrderer([
      entry('b', 'banana', 'string'),
      entry('a', 'apple', 'string'),
      entry('c', 'cherry', 'string'),
    ]);
    expect(out.map(e => e.key)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/orderers/builtins.test.ts`
Expected: FAIL — cannot find modules `../../src/orderers/dimension` / `string`.

- [ ] **Step 3: Implement the two orderers**

```ts
// src/orderers/dimension.ts
import type { ComparableEntry, TokenOrderer } from './index';

/** Parse the leading numeric magnitude from a resolved dimension string,
 *  e.g. '16px' -> 16, '1.5rem' -> 1.5, '200ms' -> 200. NaN sorts last. */
function magnitude(resolved: string): number {
  const n = parseFloat(resolved);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

export const dimensionOrderer: TokenOrderer = (entries: ComparableEntry[]) =>
  [...entries].sort((a, b) => magnitude(a.resolved) - magnitude(b.resolved));
```

```ts
// src/orderers/string.ts
import type { ComparableEntry, TokenOrderer } from './index';

export const stringOrderer: TokenOrderer = (entries: ComparableEntry[]) =>
  [...entries].sort((a, b) => a.resolved.localeCompare(b.resolved));
```

- [ ] **Step 4: Register them in `registerBuiltinOrderers`**

```ts
// src/orderers/index.ts — replace the body of registerBuiltinOrderers
import { dimensionOrderer } from './dimension';
import { stringOrderer } from './string';

export function registerBuiltinOrderers(book: DesignBook): void {
  book.registerOrderer('dimension', dimensionOrderer);
  book.registerOrderer('string', stringOrderer);
  // color orderer registered in Task 3.
}
```

(Keep the existing `ComparableEntry` / `TokenOrderer` exports and imports at the top of the file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/orderers/builtins.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/orderers/dimension.ts src/orderers/string.ts src/orderers/index.ts tests/orderers/builtins.test.ts
git commit -m "feat: add built-in dimension and string orderers"
```

---

### Task 3: Built-in `color` orderer via `colorsort-js`

**Files:**
- Modify: `package.json` (add `colorsort-js` dependency), `tsconfig.json` (enable `resolveJsonModule`), `src/orderers/index.ts` (register color orderer)
- Create: `src/orderers/color.ts`, `src/orderers/colorsort-js.d.ts` (ambient types for the JSON subpath if needed)
- Test: `tests/orderers/color.test.ts`

**Interfaces:**
- Consumes: `ComparableEntry`, `TokenOrderer`.
- Produces: `colorOrderer: TokenOrderer` registered for type `color`. Sorts a set of hex colors into the smoothest order, oriented dark→light (ascending). Groups of 0 or 1 short-circuit. `auto()` is only called on first invocation onward (lazy execution); a thrown `auto()`/parse error returns the input order unchanged.

- [ ] **Step 1: Install the dependency**

Run: `npm install colorsort-js@3.1.0`
Expected: adds `colorsort-js` to `dependencies`; no peer-dep warnings (zero runtime deps).

- [ ] **Step 2: Enable JSON module resolution**

In `tsconfig.json`, inside `compilerOptions`, add (if not already present):

```json
    "resolveJsonModule": true,
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/orderers/color.test.ts
import { describe, it, expect } from 'vitest';
import { colorOrderer } from '../../src/orderers/color';
import type { ComparableEntry } from '../../src/orderers';

const c = (key: string, resolved: string): ComparableEntry =>
  ({ key, type: 'color', resolved, token: { type: 'color', rawValue: resolved } as any });

describe('color orderer', () => {
  it('orders a set dark -> light (ascending)', () => {
    const out = colorOrderer([c('white', '#ffffff'), c('black', '#000000'), c('gray', '#888888')]);
    expect(out[0].key).toBe('black');
    expect(out[out.length - 1].key).toBe('white');
  });

  it('returns a single-element group unchanged without throwing', () => {
    const out = colorOrderer([c('only', '#123456')]);
    expect(out.map(e => e.key)).toEqual(['only']);
  });

  it('returns an empty group unchanged', () => {
    expect(colorOrderer([])).toEqual([]);
  });

  it('falls back to input order when a value is not parseable hex', () => {
    const input = [c('a', 'not-a-color'), c('b', 'also-bad')];
    const out = colorOrderer(input);
    expect(out.map(e => e.key)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/orderers/color.test.ts`
Expected: FAIL — cannot find module `../../src/orderers/color`.

- [ ] **Step 5: Implement the color orderer**

```ts
// src/orderers/color.ts
import { auto, normalizeUp } from 'colorsort-js';
import DATA from 'colorsort-js/trained.json';
import { formatHex, parse } from 'culori';
import type { ComparableEntry, TokenOrderer } from './index';

const HEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** Coerce a resolved color string to #rrggbb, or null if unparseable. */
function toHex(resolved: string): string | null {
  if (HEX.test(resolved)) return resolved.length === 4
    ? formatHex(resolved) ?? null   // expand #abc -> #aabbcc
    : resolved.toLowerCase();
  const parsed = parse(resolved);
  return parsed ? formatHex(parsed) ?? null : null;
}

/** Smoothest ordering of a color set, oriented dark -> light (ascending).
 *  Holistic: colorsort-js auto() consumes the whole array at once. Static
 *  import, lazy execution — auto() runs only when this orderer is called. */
export const colorOrderer: TokenOrderer = (entries: ComparableEntry[]) => {
  if (entries.length <= 1) return entries;

  // Build parallel arrays; drop unparseable entries to the end in input order.
  const hexable: { entry: ComparableEntry; hex: string }[] = [];
  const dropped: ComparableEntry[] = [];
  for (const entry of entries) {
    const hex = toHex(entry.resolved);
    if (hex) hexable.push({ entry, hex });
    else dropped.push(entry);
  }
  if (hexable.length <= 1) return [...hexable.map(h => h.entry), ...dropped];

  try {
    const sortedHexes: string[] = normalizeUp(auto(hexable.map(h => h.hex), DATA));
    // Map each sorted hex back to its entry (first unused match wins on dupes).
    const pool = [...hexable];
    const ordered: ComparableEntry[] = [];
    for (const hex of sortedHexes) {
      const i = pool.findIndex(h => h.hex === hex);
      if (i >= 0) ordered.push(pool.splice(i, 1)[0].entry);
    }
    ordered.push(...pool.map(h => h.entry)); // any leftovers
    return [...ordered, ...dropped];
  } catch {
    return entries; // never throw out of an orderer
  }
};
```

If `tsc` complains that `colorsort-js/trained.json` has no type declarations, add:

```ts
// src/orderers/colorsort-js.d.ts
declare module 'colorsort-js/trained.json' {
  const data: unknown;
  export default data;
}
declare module 'colorsort-js' {
  export function auto(colors: string[], data: unknown): string[];
  export function multiAuto(colors: string[], data: unknown): { sorted: string[] }[];
  export function normalizeUp(sorted: string[]): string[];
}
```

- [ ] **Step 6: Register the color orderer**

```ts
// src/orderers/index.ts — add to registerBuiltinOrderers
import { colorOrderer } from './color';
// inside registerBuiltinOrderers, after dimension/string:
  book.registerOrderer('color', colorOrderer);
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/orderers/color.test.ts`
Expected: PASS (4 tests). If the dark→light assertion is brittle for the chosen method, assert relative order of black vs white only (already the case).

- [ ] **Step 8: Verify the whole suite + typecheck still pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/orderers/color.ts src/orderers/colorsort-js.d.ts src/orderers/index.ts tests/orderers/color.test.ts
git commit -m "feat: add colorsort-js-backed color orderer"
```

---

### Task 4: Scope order config + inheritance (no sorting yet)

**Files:**
- Modify: `src/scope.ts` (order types, `_order` field, `setOrder`/`clearOrder`/`getOrder`/`getEffectiveOrder`)
- Test: `tests/scope-order-config.test.ts`

**Interfaces:**
- Produces (exported from `src/scope.ts`):
  - `type SortDirection = 'asc' | 'desc'`
  - `type SortCriterion = { by: 'name'; direction?: SortDirection } | { by: 'value'; direction?: SortDirection } | { by: 'type'; priority?: string[] }`
  - `type ScopeOrder = SortCriterion[]`
  - `Scope.setOrder(order: ScopeOrder): void` — sets local order (overrides inherited)
  - `Scope.clearOrder(): void` — removes local order → re-inherit
  - `Scope.getOrder(): ScopeOrder | undefined` — local order only
  - `Scope.getEffectiveOrder(): ScopeOrder | undefined` — local, else nearest ancestor's, else undefined

- [ ] **Step 1: Write the failing test**

```ts
// tests/scope-order-config.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';

describe('scope order config + inheritance', () => {
  it('getOrder returns the local order; getEffectiveOrder mirrors it when set', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    expect(s.getOrder()).toBeUndefined();
    s.setOrder([{ by: 'name' }]);
    expect(s.getOrder()).toEqual([{ by: 'name' }]);
    expect(s.getEffectiveOrder()).toEqual([{ by: 'name' }]);
  });

  it('a child with no local order inherits the parent effective order', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.setOrder([{ by: 'value', direction: 'desc' }]);
    const child = book.addScope('child', { extends: 'parent' });
    expect(child.getOrder()).toBeUndefined();               // nothing local
    expect(child.getEffectiveOrder()).toEqual([{ by: 'value', direction: 'desc' }]);
  });

  it('child setOrder overrides inherited order', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.setOrder([{ by: 'value' }]);
    const child = book.addScope('child', { extends: 'parent' });
    child.setOrder([{ by: 'name' }]);
    expect(child.getEffectiveOrder()).toEqual([{ by: 'name' }]);
  });

  it('clearOrder reverts to inherited; setOrder([]) forces no ordering', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.setOrder([{ by: 'value' }]);
    const child = book.addScope('child', { extends: 'parent' });

    child.setOrder([]);                                      // explicit "off"
    expect(child.getEffectiveOrder()).toEqual([]);          // not the parent's

    child.clearOrder();                                     // back to inherit
    expect(child.getEffectiveOrder()).toEqual([{ by: 'value' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scope-order-config.test.ts`
Expected: FAIL — `setOrder is not a function`.

- [ ] **Step 3: Add order types and config methods to `Scope`**

At the top of `src/scope.ts`, after the existing imports, add the exported types:

```ts
export type SortDirection = 'asc' | 'desc';
export type SortCriterion =
  | { by: 'name'; direction?: SortDirection }
  | { by: 'value'; direction?: SortDirection }
  | { by: 'type'; priority?: string[] };
export type ScopeOrder = SortCriterion[];
```

Add the field next to the other private fields (near `private tokens`):

```ts
  /** Local order config. `undefined` = inherit from extends chain;
   *  `[]` = explicit insertion order (overrides an inherited order). */
  private _order?: ScopeOrder;
```

Add the methods (place them near `getAllKeys`):

```ts
  setOrder(order: ScopeOrder): void {
    this._order = order;
  }

  clearOrder(): void {
    this._order = undefined;
  }

  /** This scope's *local* order config (undefined if unset). */
  getOrder(): ScopeOrder | undefined {
    return this._order;
  }

  /** Local order if set, else the nearest ancestor's via `extends`, else
   *  undefined. Mirrors how `compose` walks the chain. */
  getEffectiveOrder(): ScopeOrder | undefined {
    if (this._order !== undefined) return this._order;
    if (this.extendsName) {
      return this.book.getScope(this.extendsName)?.getEffectiveOrder();
    }
    return undefined;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/scope-order-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/scope.ts tests/scope-order-config.test.ts
git commit -m "feat: add scope order config with extends inheritance"
```

---

### Task 5: Sort engine in `getAllKeys` (+ memo cache, effective type, ranks)

**Files:**
- Modify: `src/scope.ts` (`getAllKeys` ordered path, `computeOrderedKeys`, `effectiveType`, `detectType`, memo cache, `_ordering` guard, `allTokens` ordered)
- Test: `tests/scope-order-sort.test.ts`

**Interfaces:**
- Consumes: `getEffectiveOrder()` (Task 4), `book.getOrderer(type)` / `book.getOrdererTypes()` (Task 1).
- Produces: ordered `getAllKeys(): string[]` and `allTokens()` following it. Internal: `private orderedKeysCache: string[] | null`, `private _ordering: boolean`, `private invalidateOrderCache(): void`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/scope-order-sort.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, string } from '../src/tokens';

describe('scope sort engine', () => {
  it('orders by name asc/desc; clearOrder reverts to insertion order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('c', string('x')); s.set('a', string('y')); s.set('b', string('z'));

    s.setOrder([{ by: 'name' }]);
    expect(s.getAllKeys()).toEqual(['a', 'b', 'c']);
    s.setOrder([{ by: 'name', direction: 'desc' }]);
    expect(s.getAllKeys()).toEqual(['c', 'b', 'a']);
    s.clearOrder();
    expect(s.getAllKeys()).toEqual(['c', 'a', 'b']); // insertion order
  });

  it('orders by value on a dimension scope (numeric)', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space');
    s.set('lg', px(16)); s.set('sm', px(4)); s.set('md', px(8));
    s.setOrder([{ by: 'value' }]);
    expect(s.getAllKeys()).toEqual(['sm', 'md', 'lg']);
  });

  it('type criterion groups by priority, value sorts within group, name breaks ties', () => {
    const book = new DesignBook('test');
    const s = book.addScope('mix');
    s.set('p16', px(16)); s.set('white', color('#ffffff'));
    s.set('p4', px(4));   s.set('black', color('#000000'));
    s.setOrder([
      { by: 'type', priority: ['color', 'dimension'] },
      { by: 'value' },
      { by: 'name' },
    ]);
    const keys = s.getAllKeys();
    // colors first (black before white by value), then dimensions (p4 before p16)
    expect(keys.slice(0, 2)).toEqual(['black', 'white']);
    expect(keys.slice(2)).toEqual(['p4', 'p16']);
  });

  it('value across differing types without a type criterion falls through to name', () => {
    const book = new DesignBook('test');
    const s = book.addScope('mix');
    s.set('z', px(4)); s.set('a', color('#000000'));
    s.setOrder([{ by: 'value' }, { by: 'name' }]); // cross-type value => 0 => name
    expect(s.getAllKeys()).toEqual(['a', 'z']);
  });

  it('unresolvable tokens sort last and getAllKeys does not throw', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('good', px(8));
    // a reference to a non-existent key is unresolvable
    s.set('bad', { type: 'reference', key: 's.missing' } as any);
    s.setOrder([{ by: 'value' }]);
    expect(() => s.getAllKeys()).not.toThrow();
    expect(s.getAllKeys()[s.getAllKeys().length - 1]).toBe('bad');
  });

  it('allTokens follows the ordered keys', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('b', string('y')); s.set('a', string('x'));
    s.setOrder([{ by: 'name' }]);
    expect(Object.keys(s.allTokens())).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scope-order-sort.test.ts`
Expected: FAIL — `getAllKeys()` still returns insertion order; ordered assertions fail.

- [ ] **Step 3: Refactor `getAllKeys` and add the sort engine**

In `src/scope.ts`, add the culori import at the top:

```ts
import { parse } from 'culori';
import type { FunctionTokenValue } from './tokens';
```

(`ReferenceValue`/`TokenValue`/`FunctionTokenValue` may already be imported — merge, don't duplicate.)

Add fields near `_order`:

```ts
  private orderedKeysCache: string[] | null = null;
  private _ordering = false;
```

Rename the existing `getAllKeys` body to a private `baseKeys()` and add the ordered `getAllKeys`:

```ts
  /** Keys in insertion / parent-first order (the pre-ordering behavior). */
  private baseKeys(): string[] {
    const localKeys = Array.from(this.tokens.keys());
    if (!this.extendsName) return localKeys;
    const parentKeys = this.book.getScope(this.extendsName)?.getAllKeys() ?? [];
    const combined = new Set([...parentKeys, ...localKeys]);
    return Array.from(combined);
  }

  getAllKeys(): string[] {
    const order = this.getEffectiveOrder();
    const base = this.baseKeys();
    // No ordering, empty criteria, or a re-entrant call during ordering:
    // hand back insertion order.
    if (!order || order.length === 0 || this._ordering) return base;
    if (this.orderedKeysCache) return this.orderedKeysCache;
    const sorted = this.computeOrderedKeys(base, order);
    this.orderedKeysCache = sorted;
    return sorted;
  }

  invalidateOrderCache(): void {
    this.orderedKeysCache = null;
  }
```

Note: `baseKeys()` calls the parent's `getAllKeys()` (which may itself be ordered) so an unset child inheriting a parent order sees the parent ordered first, then re-sorts the merged set under the effective order. That is intended.

Add the engine (place after `getAllKeys`):

```ts
  private computeOrderedKeys(keys: string[], order: ScopeOrder): string[] {
    this._ordering = true;
    try {
      type Entry = { key: string; index: number; type: string; resolved: string | null; token: AnyTokenValue };
      const entries: Entry[] = keys.map((key, index) => {
        const token = this.get(key)!;
        let resolved: string | null = null;
        try { resolved = this.resolve(key); } catch { resolved = null; }
        const type = this.effectiveType(token, resolved);
        return { key, index, type, resolved, token };
      });

      const ranks = this.computeValueRanks(entries, order);

      const resolvable = entries.filter(e => e.resolved !== null);
      const unresolvable = entries.filter(e => e.resolved === null);

      resolvable.sort((a, b) => {
        for (const c of order) {
          let r = 0;
          if (c.by === 'name') {
            r = a.key.localeCompare(b.key);
            if (c.direction === 'desc') r = -r;
          } else if (c.by === 'type') {
            r = this.typeRank(a.type, c.priority) - this.typeRank(b.type, c.priority);
          } else if (c.by === 'value') {
            if (a.type === b.type) {
              const ra = ranks.get(a.key);
              const rb = ranks.get(b.key);
              if (ra !== undefined && rb !== undefined) {
                r = ra - rb;
                if (c.direction === 'desc') r = -r;
              }
            }
          }
          if (r !== 0) return r;
        }
        return a.index - b.index; // stable tiebreak
      });

      return [...resolvable.map(e => e.key), ...unresolvable.map(e => e.key)];
    } finally {
      this._ordering = false;
    }
  }

  /** For any `value` criterion: group resolvable entries by effective type,
   *  run that type's orderer once, and record each entry's rank (index). */
  private computeValueRanks(
    entries: Array<{ key: string; type: string; resolved: string | null; token: AnyTokenValue }>,
    order: ScopeOrder,
  ): Map<string, number> {
    const ranks = new Map<string, number>();
    if (!order.some(c => c.by === 'value')) return ranks;

    const byType = new Map<string, ComparableEntry[]>();
    for (const e of entries) {
      if (e.resolved === null) continue;
      const list = byType.get(e.type) ?? [];
      list.push({ key: e.key, type: e.type, resolved: e.resolved, token: e.token });
      byType.set(e.type, list);
    }

    for (const [type, group] of byType) {
      const orderer = this.book.getOrderer(type);
      if (!orderer) {
        warnMissingOrderer(type);
        continue; // no ranks for this type -> value criterion falls through
      }
      orderer(group).forEach((entry, i) => ranks.set(entry.key, i));
    }
    return ranks;
  }

  /** Rank of a type for the `type` criterion: listed types by priority index,
   *  then unlisted types in orderer-registration order, then unknown last. */
  private typeRank(type: string, priority?: string[]): number {
    if (priority) {
      const i = priority.indexOf(type);
      if (i >= 0) return i;
    }
    const base = priority?.length ?? 0;
    const reg = this.book.getOrdererTypes().indexOf(type);
    return reg >= 0 ? base + reg : base + 1000;
  }

  /** Effective type for grouping/value: declared type, or a function's
   *  returnType, falling back to detecting from the resolved value. */
  private effectiveType(token: AnyTokenValue, resolved: string | null): string {
    if (token.type === 'function') {
      const rt = (token as FunctionTokenValue).metadata?.returnType;
      if (rt) return rt;
    }
    if (token.type === 'reference' || token.type === 'function') {
      if (resolved !== null) return detectType(resolved);
    }
    return token.type;
  }
```

Add the module-level helpers at the bottom of `src/scope.ts` (outside the class):

```ts
/** Best-effort type detection from a resolved value string. */
function detectType(resolved: string): string {
  if (parse(resolved)) return 'color';
  if (/^-?\d/.test(resolved) && /[a-z%]/i.test(resolved)) return 'dimension';
  return 'string';
}

const warnedOrdererTypes = new Set<string>();
function warnMissingOrderer(type: string): void {
  if (warnedOrdererTypes.has(type)) return;
  warnedOrdererTypes.add(type);
  // eslint-disable-next-line no-console
  console.warn(`[design-book] no orderer registered for type "${type}"; value ordering falls through`);
}
```

Add the `ComparableEntry` import at the top of `src/scope.ts`:

```ts
import type { ComparableEntry } from './orderers';
```

- [ ] **Step 4: Make `allTokens` follow the ordered keys**

Replace the body of `allTokens()` so it iterates `getAllKeys()` order:

```ts
  allTokens(): Record<string, AnyTokenValue> {
    const result: Record<string, AnyTokenValue> = {};
    for (const key of this.getAllKeys()) {
      const token = this.get(key);
      if (token) result[key] = token;
    }
    return result;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/scope-order-sort.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full suite (catch ordering regressions in existing tests)**

Run: `npx vitest run`
Expected: all green. If a pre-existing test asserted `allTokens` key order on an *unordered* scope, it should still pass (unordered scopes return `baseKeys()` order unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/scope.ts tests/scope-order-sort.test.ts
git commit -m "feat: sort engine for ordered scopes (criteria, ranks, stable, memo)"
```

---

### Task 6: Re-entrancy guard verification (ordering ↔ resolution)

**Files:**
- Test: `tests/scope-order-reentrancy.test.ts` (the guard itself was added in Task 5 via `_ordering`; this task proves it)

**Interfaces:**
- Consumes: the `_ordering` guard in `getAllKeys` (Task 5).

- [ ] **Step 1: Write the failing test**

```ts
// tests/scope-order-reentrancy.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color } from '../src/tokens';
import { nth } from '../src/functions/generic/nth';

describe('ordering ↔ resolution re-entrancy', () => {
  it('a value-ordered scope containing an nth() token resolves without recursion', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('white', color('#ffffff'));
    s.set('black', color('#000000'));
    s.set('pick', nth(s, 0)); // selector that walks getAllKeys()
    s.setOrder([{ by: 'value' }]);

    expect(() => s.getAllKeys()).not.toThrow();
    expect(() => book.resolve('s.pick')).not.toThrow();
  });
});
```

(`nth(scope, index, options?)` — positional index. The point is any scope-iterating selector living inside a value-ordered scope.)

- [ ] **Step 2: Run test to verify it passes (guard already present)**

Run: `npx vitest run tests/scope-order-reentrancy.test.ts`
Expected: PASS. The `_ordering` flag makes the re-entrant `getAllKeys()` (from `nth` resolving during the entry-build resolve) return insertion order, breaking the cycle.

- [ ] **Step 3: Prove the guard is load-bearing**

Temporarily comment out `|| this._ordering` in `getAllKeys`, re-run the test, and confirm it now fails with a stack-overflow / `CircularDependencyError`. Then restore the guard and re-run to green. (Do not commit the broken state.)

- [ ] **Step 4: Commit**

```bash
git add tests/scope-order-reentrancy.test.ts
git commit -m "test: prove ordering/resolution re-entrancy guard"
```

---

### Task 7: Cache invalidation (local, cross-scope, descendant)

**Files:**
- Modify: `src/scope.ts` (`set`/`delete` invalidate; `setOrder`/`clearOrder` invalidate + subscribe + descendant invalidation), `src/design-book.ts` (`invalidateDescendantOrderCaches`)
- Test: `tests/scope-order-invalidation.test.ts`

**Interfaces:**
- Consumes: `invalidateOrderCache()` (Task 5), `book.on('change', …)` (existing), `scope.extendsScope` getter (existing).
- Produces: `DesignBook.invalidateDescendantOrderCaches(name: string): void`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/scope-order-invalidation.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { px, ref } from '../src/tokens';

describe('ordered-scope cache invalidation', () => {
  it('recomputes after a local set', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space');
    s.set('a', px(8)); s.set('b', px(4));
    s.setOrder([{ by: 'value' }]);
    expect(s.getAllKeys()).toEqual(['b', 'a']);
    s.set('c', px(1));                       // new smallest
    expect(s.getAllKeys()).toEqual(['c', 'b', 'a']);
  });

  it('recomputes after a local delete', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space');
    s.set('a', px(8)); s.set('b', px(4));
    s.setOrder([{ by: 'value' }]);
    expect(s.getAllKeys()).toEqual(['b', 'a']);
    s.delete('b');
    expect(s.getAllKeys()).toEqual(['a']);
  });

  it('reorders when a referenced token in another scope changes (value order)', () => {
    const book = new DesignBook('test');
    const src = book.addScope('src');
    src.set('x', px(8));
    const ui = book.addScope('ui');
    ui.set('big', px(100));
    ui.set('mirror', ref('src.x'));          // resolves to 8px
    ui.setOrder([{ by: 'value' }]);
    expect(ui.getAllKeys()).toEqual(['mirror', 'big']); // 8 < 100
    src.set('x', px(200));                    // mirror now 200 > 100
    expect(ui.getAllKeys()).toEqual(['big', 'mirror']);
  });

  it('changing a parent order reorders an unset child', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    parent.set('a', px(8)); parent.set('b', px(4));
    const child = book.addScope('child', { extends: 'parent' });
    parent.setOrder([{ by: 'value' }]);
    expect(child.getAllKeys()).toEqual(['b', 'a']);
    parent.setOrder([{ by: 'value', direction: 'desc' }]);
    expect(child.getAllKeys()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scope-order-invalidation.test.ts`
Expected: FAIL — stale caches (e.g. first test still returns `['b','a']` after adding `c`).

- [ ] **Step 3: Invalidate on local mutation + propagate to descendants**

In `src/scope.ts`, in `set()` after the existing `_notifyTokenChange` call, add:

```ts
    this.invalidateOrderCache();
    this.book.invalidateDescendantOrderCaches(this.name);
```

In `delete()`, inside the `if (had)` block after `_notifyTokenChange`, add the same two lines.

- [ ] **Step 4: Subscribe to cross-scope changes + invalidate descendants on order change**

Add a field near the other order fields in `src/scope.ts`:

```ts
  private _changeUnsub?: () => void;
```

Update `setOrder` / `clearOrder`:

```ts
  setOrder(order: ScopeOrder): void {
    this._order = order;
    this.invalidateOrderCache();
    this.subscribeToChanges();
    this.book.invalidateDescendantOrderCaches(this.name);
  }

  clearOrder(): void {
    this._order = undefined;
    this.invalidateOrderCache();
    this.book.invalidateDescendantOrderCaches(this.name);
  }

  private subscribeToChanges(): void {
    if (this._changeUnsub) return;
    const prefix = `${this.name}.`;
    this._changeUnsub = this.book.on('change', (e: { detail: { changedKeys: string[] } }) => {
      if (e.detail.changedKeys.some(k => k.startsWith(prefix))) {
        this.invalidateOrderCache();
      }
    });
  }
```

(The `change` event's `changedKeys` already includes transitively-propagated dependents, so a member token whose referenced value changed appears there.)

- [ ] **Step 5: Add `invalidateDescendantOrderCaches` to `DesignBook`**

In `src/design-book.ts`, add near the scope-delegation methods:

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/scope-order-invalidation.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/scope.ts src/design-book.ts tests/scope-order-invalidation.test.ts
git commit -m "feat: invalidate ordered-scope caches on mutation, cross-scope change, and inheritance"
```

---

### Task 8: `addScope({ order })` shorthand, exports, and integration

**Files:**
- Modify: `src/design-book.ts` (`addScope` accepts `order`), `src/scope-manager.ts` (pass `order` through), `src/index.ts` (export order/orderer types)
- Test: `tests/scope-order-integration.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: `addScope(name, { order })` shorthand; public exports of `ScopeOrder`, `SortCriterion`, `SortDirection`, `ComparableEntry`, `TokenOrderer`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/scope-order-integration.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px } from '../src/tokens';
import { nth } from '../src/functions/generic/nth';

describe('self-ordering integration', () => {
  it('addScope({ order }) applies the order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space', { order: [{ by: 'value' }] });
    s.set('lg', px(16)); s.set('sm', px(4));
    expect(s.getAllKeys()).toEqual(['sm', 'lg']);
  });

  it('nth honors the canonical order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space', { order: [{ by: 'value' }] });
    s.set('lg', px(16)); s.set('sm', px(4)); s.set('md', px(8));
    s.set('first', nth(s, 0)); // smallest = sm = 4px
    expect(book.resolve('space.first')).toBe('4px');
  });

  it('CSS renderer emits variables in canonical order', () => {
    const book = new DesignBook('test');
    const s = book.addScope('space', { order: [{ by: 'value' }] });
    s.set('lg', px(16)); s.set('sm', px(4));
    const css = book.render('css-variables');
    expect(css.indexOf('--space-sm')).toBeLessThan(css.indexOf('--space-lg'));
  });
});
```

(CSS var format is `--<scope>-<key>` via `keyToHyphen` in `src/renderers/renderer.ts:114`, so `--space-sm` / `--space-lg` are correct.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scope-order-integration.test.ts`
Expected: FAIL — `addScope` ignores `order` (first test returns insertion order).

- [ ] **Step 3: Thread `order` through `addScope` and `ScopeManager`**

In `src/scope-manager.ts`, widen the options type and apply order after creation:

```ts
  addScope(
    name: string,
    options?: { extends?: string; description?: string; compose?: string; order?: import('./scope').ScopeOrder },
  ): Scope {
    if (this.scopes.has(name)) {
      throw new ScopeError(`Scope "${name}" already exists`, name);
    }
    const scope = new Scope(name, this.book, options);
    this.scopes.set(name, scope);
    if (options?.order !== undefined) scope.setOrder(options.order);
    return scope;
  }
```

In `src/design-book.ts`, widen the `addScope` signature:

```ts
  addScope(
    name: string,
    options?: { extends?: string; description?: string; compose?: string; order?: import('./scope').ScopeOrder },
  ): Scope {
    const scope = this.scopeManager.addScope(name, options);
    this.emit('scopeAdded', { scope: name });
    return scope;
  }
```

(The `Scope` constructor already ignores unknown option keys, so `order` passing into `new Scope(...)` is harmless; `ScopeManager` applies it via `setOrder` so subscription + invalidation wiring runs.)

- [ ] **Step 4: Add public exports**

In `src/index.ts`, add to the `./scope` export and a new `./orderers` export:

```ts
export type { ScopeOrder, SortCriterion, SortDirection } from './scope';
export type { ComparableEntry, TokenOrderer } from './orderers';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/scope-order-integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full suite + typecheck + library build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all green; `dist/` builds (confirms `colorsort-js` + JSON import bundle cleanly).

- [ ] **Step 7: Commit**

```bash
git add src/design-book.ts src/scope-manager.ts src/index.ts tests/scope-order-integration.test.ts
git commit -m "feat: addScope({ order }) shorthand + public exports + integration tests"
```

---

## Notes for the implementer

- **Holistic orderer call count.** The engine calls each type's orderer **once per group** (in `computeValueRanks`), not per comparison. If you add a test that spies on a registered orderer, assert it's called once per type-group.
- **`detectType` is best-effort.** It exists only so references/functions without a `returnType` still group sensibly. Plain `color`/`dimension`/`string` tokens use their declared type directly.
- **Empty criteria `[]` is meaningful.** `getAllKeys` treats `order.length === 0` as "insertion order" — this is how `setOrder([])` overrides an inherited order without sorting.
- **Do not reorder unordered scopes.** Every change is gated behind `getEffectiveOrder()` being a non-empty array. Verify the full suite stays green after Task 5 — that's the regression guard for the "canonical order" blast radius.

## Out of scope (spec #2 — reactive positional values)

`position()`/`typedPosition()`/`relativeTypedPosition()`, arithmetic function tokens, the resolution context, and making `relativeTo` modification slots resolvable are a separate plan, built on this one.
