# Changelog

All notable changes to Design Book are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.24.0] - 2026-11-09

### Added

- **`withAlpha(color, alpha)`**: the same color at that opacity. It sets
  alpha rather than multiplying it, and renders to CSS as
  `rgb(from var(--color) r g b / alpha)`. It is `relativeTo` with its new
  fourth slot, alpha, which also takes operators (`'*0.5'`).
- **`inspect(key).picked`**: the member a selector picked when the value
  is that member's, through references too, so two members with the same
  value are told apart.
- **`design-book/engine`**: the library without the built-in renderers,
  for code that keeps a book but never renders it. `useRenderer(name, fn)`
  makes a renderer available to every book; the `design-book` entry
  registers the built-in ones that way when it is imported, so
  `book.render(…)` works as before.

### Changed

- **Function constructors refuse options they do not read**, naming the
  ones they take. A misspelt or outdated option used to be ignored, and the
  token ran on the default. Stored tokens are not checked again. The
  message for `against` (renamed `readableOn`) is gone; the general one
  covers it.
- A pool is a `ref('scope')` or a scope of the book. An object that only
  looks like a scope is refused, instead of being replaced by the scope it
  is named after.
- The package no longer bundles its dependencies (`dittotones`,
  `colorsort-js`), which are installed with it anyway: the full entry went
  from 568 to 409 KB.

## [0.23.0] - 2026-11-09

### Added

- **The dependency graph is drawn like a schematic.** `SVGRenderer`'s new
  default `layout: 'layered'` sets the tables in columns by data flow, each
  row read on its left edge and read from on its right. Connections are
  routed round the tables at right angles (`routing: 'orthogonal'`), lines
  sharing a dot bundle into lanes, a hop marks where two lines of one color
  cross (`bridges`), and a dot where lines join or split. A scope extending
  a drawn scope is joined under it and shows only what differs, the rest in
  one `+N from parent` row. `aspect` (width / height, default 1.5) shapes
  the layout for the space it is shown in; `filterConnections(from, to)`
  leaves lines out before routing. The ring (`layout: 'circle'`) and the
  curved lines (`routing: 'curved'`) are still there.
- **`registerFunction(name, impl, { scopesRead })`**: a function whose
  tokens read whole scopes they are not handed as arguments names them, so
  a change in those scopes reaches the tokens, like a selector's pool.
- **`design-book/internals`**: binding, dependency extraction,
  `DependencyGraph` and `registerBuiltinFunctions`, for tools built on the
  book. They left the root entry.
- `flush()` returns (and `batch-failed` carries) `rejected`: the writes it
  refused and rolled back.
- `NamingError` for the naming functions, from the root and from
  `design-book/naming`.

### Changed

- **`tokenChanged` has one shape on every path**: `cause` (`'written'` or
  `'dependent'`), `newValue` / `oldValue` (the stored tokens after and
  before; the same token for a dependent) and `value` (the resolved value,
  `undefined` when it does not resolve). `watch` passes `value`.
- **A write is checked before anyone hears of it.** A write that would
  close a cycle throws from `set()` / `delete()` and is never announced.
  Writes a listener makes are checked when it makes them, so a refused one
  throws to that listener; their announcements follow the current one.
- **A listener that throws undoes nothing**: every listener still hears
  the change, then the call that made it throws the first listener error.
  The `error` event and the corrective announcements are gone.
- `deleteScope` announces the scope's keys as one `change`, each with the
  token it held.
- Every inherited key is wired as soon as it exists (one edge to its
  source, or its own dependencies when it re-binds relative refs), instead
  of when something first reads it.
- References in member slots (`not`, a `sibling` anchor and `toward`, a
  variant's base) are `MemberReference`s (`type: 'member'`); `source` and
  `refersTo` build them, `toMember` turns a key or ref into one. A
  navigation that cannot be followed binds to an `UnresolvableValue`.
- `readableOn` and `closest`'s `upTo` are stored in the options as
  written, and resolved like arguments.
- Built-in implementations share one contract: resolved arguments, then
  the options. Constructors check every static option when the token is
  written (color spaces, `relativeTo` modifications, the scales' numbers,
  `nth`'s index, `random`'s type and seed, `shade`'s amount,
  `minContrast`).
- `ref()` refuses a malformed key (`'a..b'`, `'a.'`) when it is written.

### Removed

- `getReferenceResolution` and the reference-resolution cache,
  `extractVisualDependencies` / `metadata.visualDependencies`,
  `readableOnArgIndex`, and the unused graph helpers (`hasCycles`,
  `findShortestPath`, …).

### Fixed

- A scope holding several color selectors over itself resolved them
  through each other, in time that grew about fivefold per selector.
- `random` over sizes treated `.5rem` and unitless numbers as strings.
- `composeBook` dropped a layer's refused writes other than cycles.
- `timing` refused a negative `delay`, which CSS allows.
- `shade` gamut-maps like the other transforms instead of clipping.

### Performance

- Resolved values are kept until something changes, and colors are parsed
  once per value. On a book of 22 scopes and 316 keys: building it 17.5 →
  9.7 ms, a write 4.2 → 1.1 ms, a write then resolving every key 8.5 →
  1.3 ms; drawing its graph 67 → 41 ms.

## [0.22.0] - 2026-11-06

### Added

- **`refersTo(ref)`** comes back down the value tree, the other way from
  `source`: the members of the pool whose references lead to a token, at any
  depth. A rule can name the role rather than the step that holds it —
  `not: [refersTo(ref('brand.ink'))]` leaves out whichever step of the scale
  refers to `brand.ink`. A `not` entry leaves out every member it finds; a
  `sibling` anchor or `toward` target needs exactly one and throws with the
  list otherwise. Composes with `source` and `inherited`.

## [0.21.0] - 2026-11-05

### Added

- **Ramp sets for `ramp()`**: `book.registerRamps(name, set, { default? })`
  adds master ramps at any time — a framework's from dittotones
  (`dittotones/ramps/radix`, …), your own built with `rampSet()` from any CSS
  colors, or scopes of the book read live (change a master and the ramps
  copying it follow). `ramp(seed, { shade, from })` and `rampStops` pick a
  set by name; `book.rampSetNames` lists them. `colorRamps` takes one set or
  named sets.

### Changed

- dittotones 0.13; the built-in Tailwind v3 masters come from
  `dittotones/ramps/tailwind-v3` (same values) instead of a copy.

- **`lightness: [min, max]`** on `mostVivid` and `leastVivid`: only the
  members whose OKLCH lightness lies in that band are compared, since near
  black and white no color carries much chroma. Nothing in the band throws.

## [0.20.0] - 2026-11-05

### Changed

- **`furthestFrom` takes a target**: `furthestFrom(target, scope, options?)`
  is the member of the target's kind furthest from it, the mirror of
  `closest`: colors by OKLab distance, sizes by value (same unit), text
  styles by font size. The targetless "odd one out" form and its `type`
  option are gone; pass the value to measure from.

### Added

- **`maxDistance`** on `furthestFrom`: the furthest member that is no
  further than that (OKLab distance for colors, the target's unit for sizes
  and text styles). Nothing within it throws.

## [0.19.0] - 2026-11-04

### Added

- **`inherited(ref, levels?)`** reads a reference further up the `extends`
  chain, replacing `inParent` / `inRoot`.
- **`source(ref, hops?)`** follows a reference to the token it refers to,
  where a member is named (a `sibling` anchor or `toward`, a `not` entry).

### Changed

- **`sibling(anchor, scope?, steps?, options?)`** walks the anchor's own
  scope unless a scale is named; with one it follows the anchor's
  references, or the member a selector picked, into it.
- **`not` entries** name a pool key, an inherited member's source key, what
  their references lead into, or what a selector picked from that pool;
  anything else throws.

## [0.18.0] - 2026-11-04

### Changed

- **`closest` takes `upTo`, not `toward`**: a value the pick goes toward and no
  further than. `toward` now belongs to `sibling` alone, where it names a
  member of the scale to step toward. No alias.
- **`readableOn`'s threshold is `readableContrast`** (was `minContrast`) on every
  color selector, so `minContrast` only ever means `minContrastWith`'s
  contrast against its target. No alias.
- **`minContrastWith` takes `minContrast`, not `ratio`** — the name the color
  selectors' `readableOn` already uses for the same thing. `ratio` is gone;
  rename it in your calls.
- **`not` names members wherever the key is written.** An entry no longer
  has to be a key of the pool: it names a member the way a `sibling` anchor
  does — a reference that leads to a member, a selector's pick, or a key a
  member is a reference to. `not: [ref('brand.ink')]` now leaves out
  `scale.900 = ref('brand.ink')`, and `not: [ref('.text')]` leaves out
  whatever `.text` picked. Applies to every function that takes `not`.
- `not` entries outside the scopes a token searches are dependencies, so the
  token re-resolves when they change.
- **`minContrastWith` no longer excludes by value.** It used to drop any
  candidate whose color equalled a `not` entry from another scope; that
  entry now follows the same rule as every other function — it names the
  members it leads to, or throws.

### Added

- **Selectors report the member they picked.** A `sibling` anchor and a `not`
  entry that name a selector now name exactly the member it chose, even when
  another member has the same value. `picked(scope, key, value)` lets a
  custom function report its pick the same way; one that does not is still
  matched by value.
- `bestContrastWith` and `minContrastWith` take `readableOn` /
  `readableContrast`: a second background the pick must also be readable on
  — a border on a page and on the band across it.
- The editor parses `bestContrastWith` / `minContrastWith` options with the
  other selectors' parser, so `not: [ref(…)]` and `readableOn` work there.

### Fixed

- Finding which member a selector picked — for a `sibling` anchor or a
  `not` entry — skips the members that selector excluded, so a pool with
  two equal values no longer lands on the excluded one.
- A `not` entry outside the pool that names no member used to exclude
  nothing without a word; it now throws. Keys of the pool itself behave as
  before, including ones that do not exist.

## [0.17.0] - 2026-11-03

### Changed

- **Comparisons work across kinds.** The target decides the kind — a color,
  a size, or a `typography()` text style measured by its font size — and
  only pool members of that kind (sizes: the same unit) are compared; the
  rest are skipped. `closestColor` is now `closest`; `nextLarger`,
  `nextSmaller`, `nextLighter` and `nextDarker` are its direction aliases
  (the editor prints a `closest` with a plain direction as its alias).
- **Contrast is a ratio for every kind:** WCAG luminance for colors, the
  ratio of the two values for sizes and text styles, so
  `minContrastWith(ref('type.body'), ref('type'), { ratio: 1.25, direction: 'larger' })`
  is a type-scale step. `bestContrastWith` and `minContrastWith` take
  `direction`.
- `furthestFrom` compares sizes and text styles too (`{ type }` when a pool
  holds several groups).

### Added

- `largest(pool)` / `smallest(pool)` for sizes and text styles.

## [0.16.0] - 2026-11-03

### Added

- **`closestColor` takes a direction.** `direction: 'lighter' | 'darker'`
  keeps only the members on that side of the target's OKLCH lightness, so
  the pick is the nearest look-alike that is lighter — it stays in the hue
  family where a pure lightness step could jump to another hue.
  `toward: ref('.page')` takes the side from another color and stops at its
  lightness (one rule for light and dark). `minDistance` is a gap in OKLCH
  lightness. The editor parses and prints all three.

### Removed

- **`nextLighter` / `nextDarker`** (added in 0.15.0): `closestColor(target,
  pool, { direction })` does the same and keeps the hue.

## [0.15.0] - 2026-11-03

### Added

- **`nextLighter(target, pool, options?)` / `nextDarker(…)`**, the color
  counterparts of `nextLarger` / `nextSmaller`: of the members on that side
  of the target, the one closest in OKLCH lightness. By value, so the pool
  needs no order. `minDistance` is a gap in OKLCH lightness (0–1); `not` and
  `readableOn` work as on the other color selectors. The editor parses and
  prints both.

## [0.14.0] - 2026-11-03

### Added

- **`sibling(anchor, steps?, { toward })`.** `toward` takes the direction
  from where another token's color sits on the same scale and stops there;
  a negative count walks away from it. One rule fits a light and a dark
  scope: `sibling(ref('.button'), 4, { toward: ref('.page') })` is lighter
  on a light page, darker on a dark one. The step count defaults to 1:
  `sibling(inParent(ref('.interaction')), { toward: inParent(ref('.background')) })`.

### Changed

- **`sibling` steps along the scale the anchor's color comes from.** A
  reference is followed out of the anchor's scope (`ui.surface =
  ref('ramp.s100')` steps along `ramp`), and a selector steps from the
  member it picked. It used to step through the anchor's own scope. An
  anchor whose color is computed (`lighten(…)`) now throws.

## [0.13.1] - 2026-11-03

### Added

- `sibling` and `variant` take an `inParent` / `inRoot` reference:
  `sibling(inParent(ref('.g100')), 1)` walks the parent's scope, and
  `variant(inParent(ref('.title')), { fontWeight: '700' })` is a live
  variant of the title the scope replaces. The editor parses and prints
  both.

## [0.13.0] - 2026-11-03

### Added

- **`ref()` addresses any level of the book.** `ref('palette')` is a scope,
  `ref('.')` the scope reading the token, next to `ref('scope.token')` and
  `ref('scope.token.field')`. A scope reference is the pool a selector
  searches: `bestContrastWith(ref('.bg'), ref('palette'))`. A relative pool
  re-binds like a relative token: `nth(ref('.'), 0)` written on a scope and
  inherited by another searches the inheriting one.
- **`inParent(ref, levels?)` and `inRoot(ref)`** read a reference further
  up the `extends` chain and return the same kind of reference.
  `inParent(ref('.surface'))` is the surface the scope would have if it had
  not overridden it, so a scope can override a token in terms of the value
  it replaces. Past the top of the chain throws; `inRoot` on a root scope is
  that scope. The editor parses and prints both.
- `isScopeKey`, `isScopeReference`, `needsBinding`; `bindToken` takes a
  `BindingContext`.

### Changed

- **Function tokens are plain data.** A selector stores its pool as
  `ref('palette')`. Passing the scope object, `mostVivid(palette)`, still
  works and is stored the same way; the `ScopeFunctionArg` type is gone
  from `FunctionArg`.
- A scope reference where a value is expected (`ui.set('x', ref('palette'))`,
  `lighten(ref('.'))`) and a token reference where a pool is expected
  (`mostVivid(ref('palette.blue'))`) throw with a message that says what to
  write.
- The editor writes pools as `ref('palette')` and still reads a bare scope
  name.
- `metadata.visualDependencies` no longer lists a pool's members: pools are
  read live.

## [Unreleased]

## [0.21.0] - 2026-11-05

### Changed

- **`withFields` is renamed `variant`**, with no alias:
  `variant(ref('type.title'), { fontWeight: '800' })`. The editor parses and
  prints the new name.

- **The `mostVivid` / `leastVivid` readability gate is now a shared pool
  filter, `readableOn`.** `against` is renamed `readableOn` (passing
  `against` throws and names the new option), `minContrast` defaults to 4.5
  once a backdrop is given, and the filter is available on every color
  selector — `mostVivid`, `leastVivid`, `lightest`, `darkest`,
  `closestColor`, `furthestFrom`. Like `not`, it drops candidates from the
  pool before ranking. **Behaviour change:** when no candidate reaches the
  ratio the selector throws a `FunctionError`; it used to fall back to the
  highest-contrast candidate, which could hand back a grey from
  `mostVivid`. `minContrast` without `readableOn` now throws at
  construction rather than at resolve time. Tokens serialised in the old
  `[scope, against]` + `{ minContrast }` shape resolve unchanged.

### Added

- **Theme layers.** `layer(name, fn | data)` describes a theme as only its
  differences; `composeBook(name, [base, theme, …])` builds one book from the
  stack, last layer winning. Because every layer writes into the same book, a
  theme that overrides a root (`brand.highlight`) re-flows to every ref,
  function token and selector pool derived from it — which scope `extends`
  cannot do. `layerOf(book, key)` and `keysFromLayer(book, layer)` report
  which layer set each key; failures throw a new `LayerError` naming the
  layer and key.
- `lightest(scope, { not, readableOn })` and `darkest(...)` select the
  color with the highest / lowest OKLCH lightness from a scope.
- `sibling(ref('ramp.s300'), offset, { wrap, not })` returns the member
  `offset` steps away from a token in its own scope's key order. It stops at
  the first / last member by default and wraps around with `wrap: true`.
- `metadata.iteratedScopes` lets a function token declare scopes it walks
  without taking them as an argument; the selector-pool index honours it.
  `registerBuiltinFunctions` now needs `getScope` on the object it is given
  (a `DesignBook` has it).

### Fixed

- **W3 output for functions without a fixed return type.** `nth`, `random`
  and `sibling` came out as `"$type": "unknown"` with the color as a plain
  string. They are now typed by what they resolve to — a color gets
  `color` and the structured W3 color value, `16px` gets `dimension` —
  and `$type` is left off for a plain string.
- **Selector candidate pools are no longer dependency-graph edges.** A
  scope-iterating selector (`bestContrastWith`, `minContrastWith`,
  `closestColor`, `furthestFrom`, `mostVivid`, `leastVivid`, `nth`,
  `random`, `nextLarger`, `nextSmaller`) used to get an edge from every key
  of the scope it iterates, so a later, legal write that read the selector
  back — `ui.muted = lighten(ref('ui.text'))` where `ui.text` selects out of
  `ui` — was rejected as a circular dependency. Pools now live in an index,
  and pool membership never rejects a write. `graph.getPrerequisitesFor()`
  on a selector therefore lists its value dependencies only, not the pool.
- **Pool changes propagate through inheritance.** With `dark extends
  palette` and a selector iterating `dark`, adding, changing or deleting a
  key in `palette` now notifies the selector, in both auto and batch mode.
- `colorMix` gamut-maps its result in OKLCH instead of clipping channels
  (`colorMix(#ff0000, #00ff00, { colorSpace: 'oklch' })` is `#dda200`, not
  `#f99500`) and keeps alpha, interpolating premultiplied the way CSS
  `color-mix()` does. The map only runs when the mix is actually outside
  sRGB: `toGamut` round-trips a displayable color through OKLCH, which
  nudges a channel pinned at 0 or 1 out of range and desaturates it by
  1/255 — a 50/50 sRGB mix of black and cyan is `#008080`, and mixing a
  color with itself is the identity.
- `lighten`, `darken` and `shade` keep alpha instead of dropping it, and
  emit 8-digit hex when the result is translucent. `lighten`/`darken` mix
  the alpha the way the browser does; `shade` carries the input's through.
- The CSS renderer emits exact `lighten`/`darken` percentages — an amount of
  `1/3` rendered as `67%` and computed a different color than JS.
- The editor's argument parser accepts a signed number, so a hand-typed
  `nth(brand, -1)` parses instead of failing with "nth requires a numeric
  index".
- The SVG renderer identifies palette-linker tokens from their live scope
  arguments, so a selector written before the scope it iterates had any
  members still renders as a linker.

### Changed

- **Breaking (API):** `DependencyGraph.updateEdges(key, dependencies)` lost
  its third parameter. It used to take `optionalDependencies` — the soft
  pool edges — which no longer exist; pools are an index on the book.
  Callers passing three arguments should drop the third.

### Added

- `extractIteratedScopes(args)` — the scope names a function token iterates,
  the index counterpart of `extractVisualDependencies`.
- The editor's debug log shows the book's `error` event (key, phase,
  message).

### Documentation

Behaviours that were already in the code but not written down: selectors
judge translucent candidates composited over the target and can return
8-digit hex; `mostVivid`/`leastVivid` throw on `minContrast` without
`against` or an unparsable `against`; the CSS renderer throws on
custom-property name collisions; `addScope` rejects dotted/empty names and
self- or cyclic `extends`; `nextLarger`/`nextSmaller` skip off-unit members
instead of throwing; switching `mode` from `batch` to `auto` flushes; a
rejected `set()` emits a corrective `tokenChanged`/`change` before
rethrowing; the `error` event's `phase` is `'reentrant' | 'rollback'`;
`closestColor`/`furthestFrom` use OKLab distance; `lighten`/`darken` are
OKLCH mixes towards white/black matching the CSS renderer; and
`metadata.w3Type` overrides the W3 renderer's inferred `$type` — pass
`metadata: { unit, w3Type }` together, since `val()` shallow-merges options.
