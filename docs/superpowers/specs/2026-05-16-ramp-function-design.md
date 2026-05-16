# `ramp()` — single-color → tonal scale via dittotones

**Status:** spec
**Date:** 2026-05-16
**Author:** David Aerne (with Claude)

## Summary

Add a `ramp()` color function that generates a single stop of a Tailwind-style tonal scale from a seed color, using the [`dittotones`](https://www.npmjs.com/package/dittotones) library. Add a `rampStops()` JS helper that expands into a full set of `ramp()` tokens at scope-definition time.

## Motivation

Users want to derive a full color scale (50…950) from a single brand color and have it react when the seed changes. Today they must precompute scales externally and paste hex values — losing reactivity.

This proposal explicitly relaxes the [function-scope policy](../../../.claude/projects/-Users-meodai-Sites-design-book/memory/project_function_scope.md) (built-ins should mix/select, not generate). Justification: dittotones is a curated, opinionated transform (it copies the perceptual DNA of established systems rather than being a generic scale generator like `bezierSize`), and the user has explicitly requested it.

## Non-Goals

- No multi-output function tokens. A function token still returns one string.
- No per-call override of dittotones engine options (`preserveHueOffsets`, `gamutMap`, `colorRamps`). Configure once at the `DesignBook` level.
- No bundled Radix/Material/etc. ramp set in this iteration — only Tailwind.

## API

### Function token: `ramp(seed, { shade })`

```ts
import { ramp, ref, color } from 'design-book';

color: scope({
  brand: color('#3b82f6'),
  brand50:  ramp(ref('color.brand'), { shade: '50' }),
  brand500: ramp(ref('color.brand'), { shade: '500' }),
  brand900: ramp(ref('color.brand'), { shade: '900' }),
})
```

Signature:

```ts
function ramp(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { shade: string; description?: string },
): FunctionTokenValue;
```

- `shade` is required. Validated as a non-empty string at construction time; validity against the engine's shade keys is checked at resolve time (see Validation).
- Returns a `FunctionTokenValue` with `returnType: 'color'`. Resolves to a hex string.

### JS helper: `rampStops(seed, { prefix, shades? })`

```ts
import { rampStops, ref, color } from 'design-book';

color: scope({
  brand: color('#3b82f6'),
  ...rampStops(ref('color.brand'), { prefix: 'brand' }),
  // expands to { brand50, brand100, ..., brand900, brand950 }
})
```

Signature:

```ts
function rampStops(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { prefix: string; shades?: string[]; description?: string },
): Record<string, FunctionTokenValue>;
```

- Default `shades`: `['50','100','200','300','400','500','600','700','800','900','950']`.
- Returns a plain object `{ <prefix><shade>: ramp(seed, {shade}) }`. Spread into the scope literal.
- Not a function token, not registered in the function registry. Pure JS.

### DesignBook options

```ts
new DesignBook({
  colorRamps?: Map<string, Ramp>,   // dittotones reference ramps; default = bundled Tailwind
  preserveHueOffsets?: boolean,      // dittotones option; default true
  gamutMap?: boolean,                 // dittotones option; default true
})
```

`Ramp` is `Record<string, Oklch>` per dittotones' types.

The `DittoTones` engine is constructed **lazily on first `ramp()` resolution**, not at `DesignBook` construction. This keeps the dittotones dependency out of hot paths for users who never call `ramp()`.

## Architecture

### File layout

```
src/functions/color/
  ramp.ts             # ramp() constructor + rampImpl + rampStops() helper
src/data/
  tailwind-ramps.ts   # bundled default Map<string, Ramp> in OKLCH
src/functions/index.ts        # register 'ramp' impl
src/index.ts                  # export ramp, rampStops
```

### Engine lifecycle

- `DesignBook` stores `colorRamps`, `preserveHueOffsets`, `gamutMap` as options on the instance.
- A private `getRampEngine()` method on `DesignBook` lazily constructs a single `DittoTones` instance the first time it's needed.
- `rampImpl` is registered with a closure capturing the `DesignBook` instance so it can call `book.getRampEngine().generate(seed)`.

This matches the pattern of scope-arg functions (which already receive a `Scope` from the resolver) — the resolver layer hands implementation functions the things they need.

### Caching

dittotones' `.generate(seed)` returns the full scale in one call. Resolving 11 separate `ramp()` tokens for the same seed would call `.generate()` 11 times. To avoid that:

- The engine wrapper maintains a `Map<string, GenerateResult>` cache keyed by resolved seed string.
- Cache lives on the engine wrapper, not on function tokens (tokens stay pure data).
- Cache lifetime = engine lifetime = `DesignBook` instance lifetime. No setter for engine options is exposed in this iteration.
- Cache size cap: simple LRU of ~32 seeds. Most users have <10 distinct seeds; the cap is a safety net, not a hot path.

### Dependency strategy

- `dittotones` is added as a hard `dependency` in `package.json`. ESM-only; design-book consumers will need an ESM-capable bundler (already true via culori).
- No `peerDependency` arrangement — keep install simple.

### Validation

- `ramp()` constructor validates `options.shade` is a non-empty string (cannot check engine validity at construction time without instantiating the engine eagerly; defer to resolve-time).
- `rampImpl` validates `shade` exists in the generated `scale` keys; throws `FunctionError('ramp: unknown shade "X", expected one of …')` otherwise.
- `seed` must resolve to a parseable color. dittotones' `.generate()` will throw — re-wrap in `FunctionError`.

### Renderer

- CSS: ramp tokens render as plain hex strings (no `color-mix()` reference — dittotones output is not expressible as a CSS color transform).
- JSON / W3 Design Tokens: resolved hex value.
- SVG renderer: each ramp stop is a normal function token, drawn with a dashed dependency line back to its seed.

### Editor

- Autocomplete: `ramp(` suggests the seed (refs only — ramp from a literal color is allowed but encouraged via ref).
- Inline swatch: shows the resolved hex (read-only, like other function-token swatches).
- No special editor work beyond what existing function tokens already support.

## Data: bundled Tailwind ramps

`src/data/tailwind-ramps.ts` exports a `Map<string, Ramp>` containing the Tailwind palette converted to OKLCH. Single-purpose module.

Source: Tailwind's published OKLCH values (v3.4+). Ramp names match Tailwind: `slate`, `gray`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`.

Shade keys per ramp: `50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`.

## Testing

`tests/functions/ramp.test.ts`:

- `ramp(color('#3b82f6'), { shade: '500' })` resolves to a hex string.
- Changing the seed propagates to all dependent ramp tokens (graph reactivity).
- `rampStops(ref('color.brand'), { prefix: 'brand' })` returns 11 keys matching the default shade list.
- Custom `shades` array in `rampStops` is honored.
- Unknown shade in `ramp()` throws `FunctionError` with a helpful message.
- Unparseable seed throws `FunctionError`.
- Custom `colorRamps` passed to `DesignBook` is used by the engine.
- Cache: resolving `ramp(seed, {shade:'50'})` and `ramp(seed, {shade:'900'})` for the same seed calls `dittotones.generate()` once (assert via spy/mock).

## Open questions

None blocking. Future iterations could add:
- A `ramp-stops` autocomplete in the editor.
- Additional bundled ramps (Radix, Material).
- Per-call engine option overrides via cached engine pool.
