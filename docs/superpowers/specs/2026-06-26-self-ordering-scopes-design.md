# Self-ordering scopes — canonical token order via composable criteria

**Status:** spec
**Date:** 2026-06-26
**Author:** David Aerne (with Claude)

## Summary

Let a scope optionally maintain a **canonical order** for its tokens, derived from a composable hierarchy of sort criteria (`type`, `value`, `name`) rather than insertion order. Per-type orderers (holistic, full-list sorts — so set-based color sorting fits) live in a registry on `DesignBook` (mirroring the function registry), with sensible built-in defaults that are overridable. When a scope is ordered, that order becomes the single source of truth: `getAllKeys()`, `allTokens()`, every renderer, and the positional selectors (`nth`, `nextLarger`, `nextSmaller`, `random`) all read it.

This is **spec #1 of two**. It is independently useful (deterministic `nth`, sorted CSS/JSON output, value-sorted ramps). It is also the substrate for **spec #2 — reactive positional values** (`position()`, `typedPosition()`, `relativeTypedPosition()`, arithmetic function tokens), which turns a token's place in the canonical order into a usable numeric input. Spec #2 is out of scope here and will be written next.

## Motivation

Today a scope's order is an implicit side effect of insertion order (`tokens` is a `Map`). Two consequences:

1. Positional selectors (`nth`, `nextLarger`, `nextSmaller`, `random`) walk `getAllKeys()`, so their results depend on the order tokens happened to be declared in — not on anything meaningful about the tokens.
2. Overriding an inherited token keeps the **parent's** ordinal slot (the `Set` dedup in `getAllKeys()` keeps first-seen position), which surprises authors who re-declare a token locally expecting it to move.

A scope often *is* an ordered thing — a color ramp light→dark, a spacing scale small→large. Making that order explicit and derived (by lightness, by numeric size, by name) makes positional selectors meaningful and deterministic, fixes the override-position gotcha (order becomes derived, not positional), and sets up position-as-value in spec #2.

## Non-Goals

- **No positional values / arithmetic function tokens.** That is spec #2. This spec only establishes canonical order and the orderer registry.
- **No new token types.** Ordering reads existing tokens; it adds no value kinds.
- **No editor reordering UI.** Editor reflects canonical order where it already consumes `allTokens()`/`getAllKeys()`; bespoke editor work (drag handles, etc.) is not in scope.
- **No cross-unit dimension normalization.** The default `dimension` orderer compares numeric `rawValue`; mixing `px` and `rem` in one ordered scope compares raw numbers (documented caveat).

## API

### Opt-in: `setOrder` / `clearOrder` (+ `addScope` shorthand)

```ts
import { DesignBook, color } from 'design-book';

const book = new DesignBook();
const ramp = book.addScope('ramp');
ramp.set('a', color('#ffffff'));
ramp.set('b', color('#222222'));
ramp.set('c', color('#888888'));

// Order light → dark by the color orderer:
ramp.setOrder([{ by: 'value', direction: 'desc' }]); // desc lightness
// getAllKeys() now → ['a', 'c', 'b']

ramp.clearOrder(); // revert to insertion order → ['a', 'b', 'c']
```

Shorthand at creation (delegates to `setOrder`):

```ts
book.addScope('ramp', { order: [{ by: 'value', direction: 'desc' }] });
```

### Types

```ts
type SortDirection = 'asc' | 'desc';

type SortCriterion =
  | { by: 'name';  direction?: SortDirection }                 // lexical on token key
  | { by: 'value'; direction?: SortDirection }                 // per-type orderer (ranked) on resolved value
  | { by: 'type';  priority?: string[] };                      // group by effective type

/** Applied in array order; index 0 is highest priority. */
type ScopeOrder = SortCriterion[];

interface Scope {
  setOrder(order: ScopeOrder): void;     // set local order (overrides any inherited order)
  clearOrder(): void;                     // remove local order → re-inherit from extends chain
  getOrder(): ScopeOrder | undefined;     // this scope's *local* order (undefined if unset)
  getEffectiveOrder(): ScopeOrder | undefined; // local order, else nearest ancestor's, else undefined
  // existing: getAllKeys(), allTokens(), resolve(), …
}
```

**Order inheritance** mirrors the existing `compose` marker: a scope with no local order inherits the nearest ancestor's order through `extends`. Three states:

- **unset** (default) → inherits the effective order from the `extends` chain; insertion order if no ancestor is ordered.
- **`setOrder(order)`** → local order, overriding any inherited order. A child can therefore sort *differently* than its parent.
- **`setOrder([])`** (empty criteria) → explicit "ordering off": insertion order **even if** an ancestor is ordered. Distinct from `clearOrder()`.
- **`clearOrder()`** → removes the local order, reverting to inherited (back to *unset*).

- `direction` defaults to `'asc'`.
- The layered engine composes criteria pairwise: each criterion yields `-1 | 0 | +1` for a pair; on a `0` (tie / not-applicable) the next criterion decides; final tiebreak is original insertion index (stable sort).
- **`type` criterion:** orders by effective type. Types listed in `priority` come first in that order; types not listed follow, in orderer-registration order. No `direction` (the priority list *is* the order). Put `type` first to get "group by type, then sort within group" — e.g. `[{ by: 'type', priority: ['color', 'dimension'] }, { by: 'value', direction: 'asc' }]`.
- **`value` criterion → per-type *orderer*.** Color sorting is *holistic*, not pairwise — `colorsort-js`'s `auto()` finds the smoothest ordering of a whole set, which no `(a, b) => number` comparator can express. So the registry stores per-type **orderers** that sort a full list; the engine runs the orderer once per type-group to assign each entry a **rank**, and the `value` criterion's pairwise result is a compare of those ranks (ties → next criterion). For pairwise-natural types (dimension, string) the orderer is a trivial `slice().sort(...)`.

### Orderer registry (on `DesignBook`)

```ts
interface ComparableEntry {
  key: string;            // unqualified token key
  type: string;           // effective (resolved) type — see Effective type
  resolved: string;       // resolved value string (e.g. '#222222', '16px')
  token: AnyTokenValue;   // raw token
}

/** Sort a homogeneous list of same-type entries into ascending order.
 *  Holistic by design (whole list at once) so set-based sorts like
 *  colorsort-js fit. The engine derives per-entry ranks from the result
 *  and applies `desc` by reversing. */
type TokenOrderer = (entries: ComparableEntry[]) => ComparableEntry[];

interface DesignBook {
  registerOrderer(type: string, orderer: TokenOrderer): void;
  getOrderer(type: string): TokenOrderer | undefined;
}
```

Built-in orderers auto-registered in the `DesignBook` constructor (same pattern as built-in functions):

| type        | default orderer                                                                                   |
|-------------|---------------------------------------------------------------------------------------------------|
| `color`     | [`colorsort-js`](https://github.com/darosh/colorsort-js) v3.1.0 — `auto(hexes, DATA)` then `normalizeUp(...)` to orient dark→light (= ascending). Library + `trained.json` lazy-loaded on first color ordering. |
| `dimension` | numeric sort on `rawValue` (covers `px`/`rem`/`ms` — all `dimension` tokens with a unit)           |
| `string`    | locale-aware lexical sort on `resolved`                                                            |

- Each orderer produces the **ascending** canonical orientation; the engine applies `desc` by reversing the ranked result.
- Overridable: `book.registerOrderer('color', myFn)` replaces the default. Custom token types register their own.
- The `value` criterion looks up `getOrderer(entry.type)`; a type with no registered orderer yields rank ties (criterion returns `0`, falls through).

## Architecture

### File layout

```
src/scope.ts                  # setOrder/clearOrder/getOrder, ordered getAllKeys/allTokens, sort engine, memo cache
src/orderers/index.ts         # TokenOrderer type, registry helpers, registerBuiltinOrderers()
src/orderers/color.ts         # color orderer (colorsort-js, lazy-loaded with trained.json)
src/orderers/dimension.ts     # numeric orderer (px/rem/ms)
src/orderers/string.ts        # lexical orderer
src/design-book.ts            # orderer registry Map + register/getOrderer; call registerBuiltinOrderers() in ctor
src/index.ts                  # export orderer types if part of public API
```

### Sort engine (in `Scope`)

`getAllKeys()` gains an ordered path when `this.order` is set:

1. Build the candidate key list (existing logic: local keys, or merged parent+local `Set` when `extends`).
2. If no order configured → return as today (insertion / parent-first order). **Unchanged default behavior.**
3. If ordered and the memo cache is valid → return cached ordered keys.
4. Otherwise compute: build a `ComparableEntry` per key (resolve value; mark unresolvable on throw); **pre-rank for any `value` criterion** by partitioning entries by effective type, running each type's orderer once, and recording each entry's index within its type-group; run the layered comparator; cache; return.

Layered comparator (per pair): for each criterion in order, compute its result; first non-zero wins; final tiebreak is the entry's original insertion index (stable).
- `name` → lexical compare of keys; `desc` negates.
- `type` → compare type rank from the `priority` list (then registration order).
- `value` → compare the two entries' pre-computed orderer ranks **within the same type** (different types → `0`, fall through); `desc` reverses by negating the rank compare. Unresolvable entries and types without an orderer get no rank → `0` (fall through), and unresolvable entries finally sort last via the stable tiebreak partition.

`allTokens()` is reordered to follow `getAllKeys()`. Renderers and selectors consume these two methods, so they inherit canonical order with **no changes of their own**.

### Effective type

Grouping/`value` must use a token's *effective* type, not its declared `type`:

- plain token → `token.type` (`color`, `dimension`, `string`, …)
- function token → `metadata.returnType` (e.g. `bestContrastWith` → `color`)
- reference → follow to the source token's effective type (already resolvable via the scope/book)

A private `effectiveType(key): string` helper centralizes this. Falls back to the declared type if the effective type can't be determined.

### Memoization & invalidation

- `Scope` holds `private orderedKeysCache: string[] | null` (null = stale).
- Invalidated on: local `set()` / `delete()` (membership **and** value changes), and on `clearOrder()`/`setOrder()`.
- **Order-config change propagates to descendants.** Because order is inherited, a `setOrder`/`clearOrder` on a parent must invalidate the ordered-keys cache of every scope that (transitively) `extends` it. `ScopeManager` already tracks inheritance — it invalidates descendant caches when an ancestor's order config changes.
- **Cross-scope value reactivity:** a `value`-ordered scope can reorder when a token it *references* changes in another scope. The scope invalidates its cache on the book's existing `change`/`tokenChanged` event when the changed key is a member of this scope (directly or transitively via the dependency graph). This reuses the event system already in place — no new propagation machinery.

### Re-entrancy guard (ordering ↔ resolution)

Computing a `value` order resolves token values, and resolution can call back into `getAllKeys()` (a `nth`/`random` token in the same scope; positional values in spec #2). That is a cycle: `getAllKeys → sort → resolve → getAllKeys → …`.

Guard, mirroring the resolution guard added in `scope.ts` (the `resolving` set): while a scope is computing its order, a re-entrant `getAllKeys()` on that scope returns the **unsorted (insertion-order) keys**. This breaks the cycle deterministically — selectors resolved *during* ordering see insertion order. Documented as an intentional, bounded fallback.

### Inheritance

- Order **inherits through `extends`**, mirroring the existing `compose` getter (which walks the chain). A private `effectiveOrder()` returns the local `_order` if set, else delegates to the parent, else `undefined`. `getAllKeys()` sorts by `effectiveOrder()`.
- A child sorts the merged parent+local key set under the **effective** criteria — its own (`setOrder`), or the inherited one if it set none. So a child can sort *differently* (`setOrder`), the *same* (leave unset), or *not at all* (`setOrder([])`).
- `_order === undefined` means "inherit"; `_order === []` means "explicitly insertion order" (overrides an ancestor). This is why `clearOrder()` (sets `undefined`) and `setOrder([])` differ.
- Because order is now derived, the override-position gotcha disappears for ordered scopes: a locally-overridden inherited token sorts by its effective value/name/type, not by the inherited slot.

### Error handling

- **No orderer for a type** (under `value`): orderer lookup returns `undefined` → entries get no rank, that criterion yields `0` (fall through). A one-time dev-mode `console.warn` names the missing type.
- **Unresolvable token** (resolution throws during entry build): entry flagged unresolvable; unresolvable entries sort **after** all resolvable ones, in stable insertion order. `getAllKeys()` never throws because of ordering.
- **`value` across differing types without a preceding `type` criterion:** orderers are per-type and rank only within a type; cross-type pairs yield `0` (fall through to the next criterion, else insertion order). Documented: to cluster types, put a `type` criterion first.
- **Color orderer edge cases:** `colorsort-js` `auto()` expects an array of `#rrggbb` hex strings. Non-hex `resolved` values (shouldn't occur for effective-type `color`, but defensively) are dropped from the color group and treated as unresolvable. A group of 0 or 1 color short-circuits (no `auto()` call). `auto()` throwing is caught → that group falls back to insertion order, no throw out of `getAllKeys()`.

### Dependencies

- `colorsort-js` (v3.1.0, ESM-only, **zero runtime deps**) added as a `dependency`. It ships a `trained.json` data file imported alongside the library.
- **Static import, lazy *use* (not dynamic import).** `getAllKeys()`/`resolve()` are synchronous, so the color orderer must stay synchronous — a dynamic `import()` (async) would not fit. Following the `ramp()`/dittotones precedent, `src/orderers/color.ts` **statically imports** `colorsort-js` and `trained.json`, but the orderer only *runs* `auto()` the first time a color ordering is computed. Consequence: `colorsort-js` + `trained.json` are part of the bundle whenever `src/orderers/color.ts` is reachable (i.e., always, since built-in orderers auto-register). The lazy-load goal is therefore lazy *execution*, not lazy *bundling*. If keeping the trained-data weight out of bundles for non-color users becomes important, that's a separate follow-up (e.g. an async warm-up API or a registry that defers the color orderer's registration) — explicitly out of scope here.
- `colorsort-js` notes some methods are compute-heavy (web-worker recommended). For typical token scopes (a handful to a few dozen colors) synchronous-on-read is fine; the memoized order cache means it recomputes only on change. Off-main-thread execution is a future optimization, not in this spec.

### Renderer & editor

- **Renderers** (`Renderer`, `SVGRenderer`) require no changes — they iterate `allTokens()`/`getAllKeys()`. CSS variable order, JSON key order, and W3 output follow canonical order. (Consequence: reordering a scope changes CSS output order and therefore diffs — acceptable per the "canonical order = single source of truth" decision.)
- **Editor** reflects canonical order wherever it reads `allTokens()`/`getAllKeys()`. No bespoke editor work in this spec.

## Testing

`tests/scope-order.test.ts`:

- `name` asc/desc orders keys lexically; `clearOrder()` reverts to insertion order.
- `value` asc/desc on a color scope orders via the `colorsort-js` orderer (dark→light); overriding it (`registerOrderer('color', fn)`) changes the result.
- `value` on a dimension scope orders by numeric size.
- Holistic orderer integration: the color orderer receives the full color group once (assert call count = 1 per group, not per pair) and the engine derives ranks from its returned order.
- `type` criterion with `priority` clusters types in the given order; unlisted types follow in orderer-registration order.
- Layered fall-through: `[{by:'type',priority:[...]}, {by:'value'}, {by:'name'}]` groups, then value-sorts, then name-breaks ties.
- Stable tiebreak: equal-by-all-criteria tokens keep insertion order.
- Unresolvable token sorts last; `getAllKeys()` does not throw. Color group of 0/1 short-circuits without calling `auto()`.
- Missing orderer for `value` falls through (and warns once).
- Lazy invalidation: cache recomputes after `set`/`delete`; cross-scope — changing a referenced token in another scope reorders a `value`-ordered scope.
- Re-entrancy: a scope ordered by `value` that contains an `nth()`/`random()` token resolves without infinite recursion (selector sees insertion order during ordering).
- Inheritance: a child `setOrder` sorts the merged parent+local set; overridden inherited token sorts by effective value, not inherited slot.
- Order inheritance: a child with no local order inherits the parent's order; `setOrder` on the child overrides it (sorts differently); `setOrder([])` forces insertion order despite an ordered parent; `clearOrder()` reverts to inherited.
- Descendant invalidation: changing a parent's order reorders an unset child's `getAllKeys()`.
- Integration: `nth`/`nextLarger`/`nextSmaller` honor canonical order; CSS renderer emits variables in canonical order.

## Open questions

None blocking. To confirm at implementation time:

- **Color orderer: `auto` vs `multiAuto`.** Default to `auto()` (single auto-selected method). `multiAuto()` returns quality-ranked alternatives — could later back a per-scope "ordering method" option; not in this spec.
- **`getOrder()`/`getEffectiveOrder()` in public exports.** Include if useful for tooling/editor; trivial to add.
- **Dimension unit policy.** Ship numeric-on-`rawValue` with a documented px-vs-rem caveat; revisit normalization only if a concrete use case appears.

## Follow-up: spec #2 (reactive positional values)

Enabled by this spec. Sketch only — not designed here:

- Function-token constructors `position()`, `typedPosition()`, `relativeTypedPosition()`, `count()`, `typedCount()` resolved against a **resolution context** (owning key + scope) threaded through `resolve()` → `resolveFunctionToken()` → implementation.
- Arithmetic as function tokens (`add`, `subtract`, `multiply`, `divide`), consistent with the existing function-token idiom and the `calc()` renderer; e.g. `add(position(), 1)`, `divide(typedPosition(), count())`.
- A token using a positional value gains a dependency on its scope's canonical order, so reorders re-propagate reactively.
- **Positional/expression values inside option-embedded numeric slots** — notably `relativeTo`'s `modifications` array. Today those slots are opaque `null | number | string` stored in `options`, which the resolver passes through **unresolved** (only `args` are resolved). Spec #2 must make such slots resolvable, e.g. `relativeTo(ref('brand.base'), 'oklch', [null, null, relative('+', multiply(typedPosition(), 30))])`. Two sub-requirements: (1) resolve expression/positional tokens embedded in modification slots (move them into resolvable `args`, or teach the resolver to resolve function-token values found in `options`); (2) a `relative(op, expr)` wrapper to carry the `+`/`-`/`*`/`/` operator that the current `"+180"` string convention encodes, since a positional value resolves to a bare number.
