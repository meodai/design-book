# Changelog

All notable changes to Design Book are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

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
  `color-mix()` does.
- `lighten`, `darken` and `shade` keep alpha instead of dropping it, and
  emit 8-digit hex when the result is translucent. `lighten`/`darken` mix
  the alpha the way the browser does; `shade` carries the input's through.
- The CSS renderer emits exact `lighten`/`darken` percentages — an amount of
  `1/3` rendered as `67%` and computed a different colour than JS.
- The editor's argument parser accepts a signed number, so a hand-typed
  `nth(brand, -1)` parses instead of failing with "nth requires a numeric
  index".
- The SVG renderer identifies palette-linker tokens from their live scope
  arguments, so a selector written before the scope it iterates had any
  members still renders as a linker.

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
