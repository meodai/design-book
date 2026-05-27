# Design Book

A reactive TypeScript constraint system for design decisions. Define how token values are chosen, resolved, and rendered to CSS, JSON, or [W3 Design Tokens](https://www.designtokens.org/tr/drafts/format/).

## Philosophy

Design systems are usually stored as fixed answers — a color picked here, a spacing value decided there, each one maintained by hand. Design Book takes a different approach: instead of storing values, you define how values are chosen.

A text color isn't `#ffffff` — it's "the highest-contrast color from this palette against this background." A hover state isn't a second hex to maintain — it's "primary mixed 15% toward black." An accent isn't a one-off pick — it's "the most vivid color that still clears contrast, excluding the tokens reserved for error and success."

That makes Design Book feel less like a bag of transforms and more like a small reactive query engine for design decisions: selection, constraints, search, and resolution over a token system. You don't maintain tokens anymore — you maintain rules. When inputs change, the system re-runs those decisions, updates dependents, and lets you inspect why a value won.

## Install

```bash
npm install design-book
```

## Quick Start

```typescript
import {
  DesignBook, color, ref, px, rem,
  bestContrastWith, colorMix, relativeTo,
  Renderer, SVGRenderer,
} from 'design-book';

const book = new DesignBook('my-system');

// Define base tokens
const brand = book.addScope('brand');
brand.set('primary', color('#0066cc'));
brand.set('neutral', color('#1a1a1a'));
brand.set('white', color('#ffffff'));
brand.set('space', px(16));

// Tokens chosen by references, selection, and transforms
const ui = book.addScope('ui');
ui.set('background', ref('brand.white'));
ui.set('text', bestContrastWith(ref('ui.background'), brand));
ui.set('hover', colorMix(ref('brand.primary'), color('#000000'), { ratio: 0.15 }));
ui.set('complement', relativeTo(ref('brand.primary'), 'oklch', [null, null, '+180']));

// Reactive — change a base token, dependents update automatically
const stopWatching = book.watch('ui.text', (newValue, detail) => {
  console.log('Text color changed to', newValue);
  console.log('Changed key:', detail.key);
});
brand.set('white', color('#f5f5f5')); // triggers re-computation
stopWatching();

// Render — every output is just `book.render(name, options?)`.
// Built-in names: 'css-variables', 'json', 'w3-design-tokens', 'svg'.
const css  = book.render('css-variables');
const json = book.render('json');
const w3   = book.render('w3-design-tokens');
const svg  = book.render('svg', { showConnections: true });

// The renderer classes are still exported for callers that want them.
const jsonObject = new Renderer(book, 'json').renderJsonObject();
const w3Object   = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
```

## Token Constructors

All constructors validate their input and throw on invalid values.

```typescript
color('#0066cc')          // Any CSS color — hex, named, rgb(), hsl()
color('rebeccapurple')    // Named colors work too

ref('scope.token')        // Reference to another token

px(16)                    // Dimension shortcuts
rem(1.5)
ms(200)
dimension(100, 'vh')      // Generic — any unit

string('Arial, sans-serif')  // String values
```

## Built-in Functions

Some functions are straightforward transforms. The distinctive ones search a scope and select the value that best satisfies a rule.

### Color selection (require a scope to search)

```typescript
bestContrastWith(target, scope)             // Highest WCAG contrast
minContrastWith(target, scope, { ratio })   // Meets minimum ratio (default 4.5)
closestColor(target, scope)                 // Perceptually closest
furthestFrom(scope)                         // Most distant from others
mostVivid(scope, { against, minContrast })  // Highest OKLCH chroma, optionally gated by readability
leastVivid(scope, { against, minContrast }) // Lowest OKLCH chroma — the muted counterpart
```

`mostVivid` uses OKLCH chroma rather than HSL saturation so a pale pink and a vivid mid-red don't score the same. Pass `against` (a target colour) and `minContrast` to require the result to clear a WCAG threshold against that target — useful for picking an accent / link colour out of a generated palette without it turning unreadable. Falls back to the highest-contrast candidate if nothing meets the threshold, same as `minContrastWith`.

### Excluding candidates with `not`

Every scope-iterating function above accepts a `not` option — an array of
fully-qualified token keys (or `ref(...)` calls) that should be skipped during
the search. Useful when a value carries a role you don't want to reuse
elsewhere — `values.error` shouldn't be the accent colour even if it happens
to have the highest chroma.

```typescript
ui.set('accent', mostVivid(palette, {
  against: ref('ui.surface'),
  minContrast: 4.5,
  not: [ref('palette.error'), ref('palette.success')],
}));

// `not` is also available on bestContrastWith, minContrastWith,
// closestColor, furthestFrom, nextLarger, nextSmaller and nth.
```

Plain strings work too — `not: ['palette.error']` is equivalent to
`not: [ref('palette.error')]`.

### Color transforms

```typescript
colorMix(color1, color2, { ratio, colorSpace })   // Interpolate two colors
lighten(color, { amount })                          // Increase lightness
darken(color, { amount })                           // Decrease lightness
shade(color, { amount })                            // Tonal step that adapts: darkens if input is light, lightens if dark
relativeTo(color, 'oklch', [null, null, '+180'])   // Per-channel modification
```

`shade` is useful when you want a subtle variation that's *always* visible against the input — `darken(surface)` collapses to black when the surface is already dark, but `shade(surface)` flips direction and lightens instead. Picks based on OKLCH lightness: > 0.5 darkens, ≤ 0.5 lightens.

Channel modifications for `relativeTo`: `null` (keep), number (set), `"+N"` `"-N"` `"*N"` `"/N"` (relative).

### Dimension selection (require a scope to search)

```typescript
nextLarger(target, scope, { minDistance, not })   // Next-up step in a scale
nextSmaller(target, scope, { minDistance, not })  // Next-down step in a scale
```

Same selector idea as `closestColor` / `furthestFrom`, but for dimensional
scopes (spacing, type, motion). Pass the target value and a scope of
dimensional tokens; the function returns the strictly-larger (or strictly-
smaller) neighbour. `minDistance` skips members that are too close — handy
when adjacent steps are nearly the same. All members of the scope must share
a unit (mixed units throw); the unit can be anything — `px`, `rem`, `em`,
`ms`, etc.

```typescript
// scope.space = { xs: 4px, s: 8px, m: 12px, l: 16px, xl: 24px }

ui.set('gap',     nextLarger(ref('space.m'), space));               // → 16px
ui.set('gap',     nextLarger(ref('space.m'), space, { minDistance: 6 })); // → 24px
ui.set('breath',  nextSmaller(ref('space.l'), space));              // → 12px

motion.set('exit', nextSmaller(ref('motion.slow'), motion));        // → 200ms
```

Throws at resolve time if no member qualifies (no larger/smaller value, or
none clears `minDistance`).

### Index selection (require a scope to search)

```typescript
nth(scope, 0)              // First item (integer index)
nth(scope, -1)             // Last item (negative wraps like Array.at)
nth(scope, 0.5)            // Middle item (float = relative position, 0–1)
nth(scope, 0.25, { not })  // Quarter-way through, with exclusions
```

Picks a single value from a scope by position. Integer indices work like
`Array.at()` — `0` is the first element, `-1` is the last, `-2` is the
second-to-last. Float indices (non-integer values between 0 and 1) select
*relatively*: `0.0` is the first item, `1.0` is the last, and `0.5` is the
middle. Floats outside 0–1 are clamped.

This is particularly useful when a scope is generated by a ramp or scale
function where you know the order is meaningful — index 0 is the lightest
shade and the last is the darkest (or vice versa). Instead of hard-coding
a token name like `ramp.shade-7`, you express "the darkest one" as
`nth(ramp, -1)` — which stays correct even if the ramp is regenerated with
a different number of stops.

```typescript
// ramp scope has 9 generated shades, lightest → darkest
ui.set('surface',    nth(ramp, 0));      // lightest
ui.set('text',       nth(ramp, -1));     // darkest
ui.set('subtle',     nth(ramp, 0.15));   // just off white
ui.set('muted-text', nth(ramp, 0.7));    // dark but not darkest
```

### Non-color generators

```typescript
spacingScale(base, { multiplier })              // Multiply dimension
typographyScale(base, { ratio, step })          // Modular scale
timing(duration, 'ease-out', { delay })         // Timing string
```

### Random (any type)

```typescript
random(scope, { type })                                 // type: 'color' | 'dimension' | 'string'
random(scope, { type: 'color', seed: 'spring-2026' })   // reproducible
random(scope, { type: 'color', not: ['brand.primary'] })// with exclusions
```

Picks a token from a scope, filtered by base type. If `seed` is omitted, a
fresh seed is generated at construction time and persisted on the token —
the pick stays stable across re-resolves but varies across declarations.
Pass `seed` explicitly for cross-session / cross-machine reproducibility.
Hashed internally with djb2 and run through a Mulberry32 PRNG. Throws at
resolve time if zero candidates match `type`.

## Custom Functions

You can register your own functions and use them as procedural tokens the
same way the built-ins work. Two pieces:

1. **An implementation** — a plain function that receives the *already
   resolved* arguments (strings for refs, scope objects for `ScopeFunctionArg`
   inputs), plus an optional `options` object as the last argument, and
   returns a string.
2. **A constructor that wraps it as a `FunctionTokenValue`** — call
   `createFunctionToken('name', args, { options, metadata })`. The
   `metadata.dependencies` array tells the graph which refs the token reads
   from so changes propagate; `metadata.visualDependencies` lists scope keys
   it iterates (for analysis functions like `bestContrastWith`).

```typescript
import {
  DesignBook, color, ref, px,
  createFunctionToken, extractDependencies,
} from 'design-book';
import type { TokenValue, ReferenceValue, FunctionTokenValue } from 'design-book';

// 1. Implementation. Receives the resolved colour as a string and the options.
function multiplyAlphaImpl(colorValue: string, alpha: number): string {
  // (Use any parser you like — culori, chroma-js, your own. Returns CSS.)
  return colorValue.replace(/#([0-9a-f]{6})$/i, (_, hex) => {
    const hexA = Math.round(alpha * 255).toString(16).padStart(2, '0');
    return `#${hex}${hexA}`;
  });
}

// 2. Constructor. Wraps the impl as a function token.
function multiplyAlpha(
  baseColor: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { alpha?: number },
): FunctionTokenValue {
  return createFunctionToken('multiplyAlpha', [baseColor], {
    options: { alpha: options?.alpha ?? 1 },
    metadata: {
      dependencies: extractDependencies([baseColor]),
      visualDependencies: [],
      returnType: 'color',
    },
  });
}

// 3. Register the impl on every book that should know about it.
const book = new DesignBook('with-custom-fns');
book.registerFunction(
  'multiplyAlpha',
  (colorValue: string, options?: { alpha?: number }) =>
    multiplyAlphaImpl(colorValue, options?.alpha ?? 1),
);

// 4. Use it just like a built-in. Custom functions can nest inside other
//    function tokens (built-in or custom) too.
const brand = book.addScope('brand');
brand.set('primary', color('#0066cc'));
const ui = book.addScope('ui');
ui.set('overlay', multiplyAlpha(ref('brand.primary'), { alpha: 0.5 }));

book.resolve('ui.overlay'); // '#0066cc80'
```

The same pattern handles scope-iterating analysers — pass the scope as an
arg and populate `metadata.visualDependencies` via
`extractVisualDependencies([scope])` so the dependency graph knows which
keys the function reads from.

If you want your custom function to render as native CSS (e.g. as a
`color-mix` expression instead of the resolved hex), register a function
renderer on the `Renderer`:

```typescript
import { Renderer } from 'design-book';

const renderer = new Renderer(book, 'css-variables');
renderer.registerFunctionRenderer('multiplyAlpha', (args, options) => {
  // `args` are the unresolved FunctionArg values; emit any CSS expression.
  return `rgb(from ${argToCss(args[0])} r g b / ${(options?.alpha as number) ?? 1})`;
});
```

Without a renderer, the CSS output falls back to the resolved string.

## Scopes and Inheritance

```typescript
const light = book.addScope('light');
light.set('bg', color('#ffffff'));
light.set('text', color('#1a1a1a'));

// Dark theme inherits from light, overrides specific tokens
const dark = book.addScope('dark', { extends: 'light' });
dark.set('bg', color('#1a1a1a'));
dark.set('text', color('#ffffff'));
// dark still inherits any tokens from light that aren't overridden

// If you later delete a local override, the scope falls back to the inherited token again
dark.delete('text');
dark.resolve('text'); // '#1a1a1a'
```

Inherited tokens remain part of the dependency graph. If `dark.primary` currently resolves from `light.primary`, anything depending on `dark.primary` will continue to update when `light.primary` changes.

## Typography

A type style is a *collection* of properties (family, size, weight, line-height, …) that you want to address as one thing. Design Book models that as a **scope** with a `compose` marker, so each property stays a real token in the graph while renderers can re-aggregate the scope into a composite output (a CSS class, a W3 `typography` token).

```typescript
const fonts = book.addScope('fonts');
fonts.set('sans', string('"Inter", system-ui, sans-serif'));

const heading = book.addTypography('heading-lg', {
  fontFamily:    ref('fonts.sans'),
  fontSize:      rem(2),
  fontWeight:    '700',
  lineHeight:    '1.15',
  letterSpacing: '-0.02em',
});

// Variant: same shape, one override. Inherits compose marker.
const hero = book.addTypography(
  'hero-title',
  { fontWeight: '800' },
  { extends: 'heading-lg' },
);

// Cherry-pick a single property into another scope.
const callout = book.addScope('callout');
callout.set('fontSize', ref('heading-lg.fontSize'));
```

`addTypography` is sugar over `addScope(name, { compose: 'typography' })` + `set()` for each key. Plain string values are auto-wrapped via `string(...)`; refs and token values pass through. Any keys are allowed — the W3 composite renderer only consumes the canonical typography keys (`fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`); the CSS renderer emits every key as a CSS property.

### CSS output

```css
:root {
  --heading-lg-font-family: "Inter", system-ui, sans-serif;
  --heading-lg-font-size: 2rem;
  --heading-lg-font-weight: 700;
  --heading-lg-line-height: 1.15;
  --heading-lg-letter-spacing: -0.02em;
}

.heading-lg {
  font-family: var(--heading-lg-font-family);
  font-size: var(--heading-lg-font-size);
  font-weight: var(--heading-lg-font-weight);
  line-height: var(--heading-lg-line-height);
  letter-spacing: var(--heading-lg-letter-spacing);
}
```

Pass `classPrefix` to prefix the emitted class:

```typescript
book.render('css-variables', { classPrefix: 't-' }); // → .t-heading-lg { … }
```

### W3 Design Tokens output

```json
{
  "typography": {
    "heading-lg": {
      "$type": "typography",
      "$value": {
        "fontFamily": "\"Inter\", system-ui, sans-serif",
        "fontSize": "2rem",
        "fontWeight": "700",
        "lineHeight": "1.15",
        "letterSpacing": "-0.02em"
      }
    }
  }
}
```

All composed typography scopes group under a single `typography` namespace.

## Rendering

A renderer is any function with the shape `(book, options?) => string`. Built-in names — `css-variables`, `json`, `w3-design-tokens`, `svg` — are pre-registered on every `DesignBook`, so:

```typescript
book.render('css-variables');
book.render('svg', { linksOnly: true });
```

Custom renderers register under any name you choose. The book hands the renderer the live graph; the renderer decides what to emit.

```typescript
function tailwindRenderer(book) {
  const colors = {};
  for (const scope of book.getAllScopes()) {
    for (const key of scope.getAllKeys()) {
      colors[`${scope.name}-${key}`] = book.resolve(`${scope.name}.${key}`);
    }
  }
  return `module.exports = { theme: { extend: { colors: ${JSON.stringify(colors, null, 2)} } } };`;
}

book.registerRenderer('tailwind', tailwindRenderer);
const config = book.render('tailwind');
```

Other useful methods: `book.getRendererNames()`, `book.getRenderer(name)`. Registering the same name twice replaces the previous renderer.

### CSS Variables

```css
:root {
  --brand-primary: #0066cc;
  --ui-background: var(--brand-white);
  --ui-hover: color-mix(in lab, var(--brand-primary) 85%, #000000);
  --ui-complement: color(from var(--brand-primary) oklch l c calc(h + 180));
}
```

References become `var()`, functions become CSS-native where possible (`color-mix`, `calc`, `color(from ...)`).

### JSON

```json
{
  "brand.primary": "#0066cc",
  "ui.background": "#ffffff",
  "ui.hover": "#0057ad"
}
```

All values fully resolved.

If you want structured data instead of a JSON string, use `renderJsonObject()`.

### W3 Design Tokens

```json
{
  "brand": {
    "primary": {
      "$value": { "colorSpace": "srgb", "components": [0, 0.4, 0.8], "alpha": 1, "hex": "#0066cc" },
      "$type": "color",
      "$description": "Main brand color"
    },
    "space": {
      "$value": { "value": 16, "unit": "px" },
      "$type": "dimension"
    }
  }
}
```

Follows the [W3 Design Tokens spec](https://www.designtokens.org/tr/drafts/format/): structured color/dimension/duration values, `$description` support, references as `{scope.token}`.

If you want the structured token object directly, use `renderW3DesignTokensObject()`.

### Table view

For documentation pages or admin UIs, `TableViewRenderer` outputs an HTML
`<table>` with one row per token — qualified key, type, resolved value
(with an optional inline colour swatch), and the dependency list.

```typescript
import { TableViewRenderer } from 'design-book';

const html = new TableViewRenderer(book).render();
// <table class="design-book-table">…</table>
```

Options: `className` (root element class), `inlineColorSwatches`
(default `true`), `showInheritance` (default `true` — annotates inherited
rows with the source key).

## Events

```typescript
const dispose = book.on('tokenChanged', (e) => { /* e.detail.key, e.detail.newValue */ });
book.on('change', (e) => { /* e.detail.changedKeys, e.detail.scopes */ });
book.on('scopeAdded', (e) => { /* e.detail.scope */ });
book.on('scopeRemoved', (e) => { /* e.detail.scope, e.detail.removedKeys */ });
book.on('batch-failed', (e) => { /* e.detail.processed, e.detail.errors */ });
book.on('batch-complete', (e) => { /* e.detail.processed */ });
book.watch('brand.primary', (newValue, detail) => {
  // newValue is undefined when the token no longer resolves
  // detail contains the underlying tokenChanged event payload
});
dispose();
```

`book.on()` and `book.watch()` both return unsubscribe functions.

## Source Introspection

```typescript
book.getSourceKey('dark.primary'); // 'light.primary' when inherited
book.isInherited('dark.primary');  // true when the active value comes from a parent scope
```

This is useful when you want to distinguish local overrides from inherited values without inspecting scope internals.

### `book.inspect(key)`

Bundles everything you usually want about a token into one call — the
resolved value, the underlying token shape (value / ref / function), the
graph dependencies + dependents, and any inheritance source. Replaces the
three-call pattern of `resolve` + `getTokenByKey` + `graph.getIncoming`.

```typescript
book.inspect('ui.hover');
// {
//   key: 'ui.hover',
//   value: '#0057ad',
//   tokenType: 'function',
//   function: 'darken',
//   args: [<refToken>],
//   options: { amount: 0.15 },
//   returnType: 'color',
//   dependencies: ['brand.primary'],
//   dependents: ['card.border'],
//   isInherited: false,
// }
```

Returns `null` if the key isn't registered. Reference and value tokens
populate the corresponding extra fields (`refKey` for refs; `rawValue`
and `unit` for value tokens).

## Batch Mode

```typescript
book.mode = 'batch';
brand.set('primary', color('#ff0000'));
brand.set('secondary', color('#00ff00'));
const result = book.flush(); // { processed: [...], errors: [...] }
book.mode = 'auto';
```

## Dependency Graph

```typescript
const graph = book.getDependencyGraph();
graph.getDependentsOf('brand.primary');     // What depends on this token
graph.getPrerequisitesFor('ui.text');       // What this token depends on
graph.getEvaluationOrderFor('ui.text');     // Resolution order
graph.findShortestPath('brand.primary', 'ui.text');
graph.hasCycles();
graph.getAdjacencyList();                   // { 'brand.primary': ['ui.text', 'ui.hover'], … }
graph.getAdjacencyList(true);               // upstream: incoming edges per node
```

For inherited tokens, prerequisites reflect the active source token. If `dark.primary` is inherited from `light.primary`, `graph.getPrerequisitesFor('dark.primary')` includes `light.primary`.

## Editor

Run `npm run dev` to start the interactive editor. Features:

- CodeMirror 6 with context-aware autocomplete
- Inline color swatches
- Live CSS / JSON / W3 output
- SVG dependency visualization
- Error highlighting for invalid values

## Example Workflow

One useful way to work with Design Book is to separate your system into three layers:

1. Generate raw color primitives with a palette tool such as [Poline](https://meodai.github.io/poline/) or [RampenSau](https://meodai.github.io/rampensau/)
2. Define semantic tokens as relationships over those primitives
3. Feed UI tokens and components from the semantic layer instead of hard-coded colors

That keeps your palette exploratory while your product tokens stay stable and meaningful.

### 1. Generate color primitives

For example, Poline can generate a palette from a small set of anchor colors:

```typescript
import { Poline } from 'poline';

const poline = new Poline({
  anchorColors: [
    [230, 0.65, 0.2],
    [210, 0.9, 0.55],
    [160, 0.7, 0.78],
  ],
  numPoints: 4,
});

const palette = poline.colorsCSS;
```

If you prefer a ramp-oriented workflow, RampenSau is a good fit for generating a light-to-dark sequence first and then mapping roles onto it. With `nth` you can address ramp stops by position — `nth(ramp, 0)` is the lightest, `nth(ramp, -1)` is the darkest — so the semantic layer stays correct even when the number of stops changes.

### 2. Store those colors as primitives

```typescript
import {
  DesignBook, color, ref,
  bestContrastWith, closestColor, colorMix, nth,
} from 'design-book';

const book = new DesignBook('workflow');

const primitive = book.addScope('primitive');
primitive.set('blue-900', color('#102a43'));
primitive.set('blue-700', color('#1f5f8b'));
primitive.set('blue-500', color('#2f80ed'));
primitive.set('mint-300', color('#7ad9b6'));
primitive.set('sand-100', color('#f6efe7'));
primitive.set('ink-900', color('#111111'));
primitive.set('white', color('#ffffff'));
```

In a real pipeline, those primitive values would usually be imported from Poline, RampenSau, or another color-generation step rather than typed by hand.

### 3. Build a semantic layer from rules

```typescript
const semantic = book.addScope('semantic');

semantic.set('surface', ref('primitive.sand-100'));
semantic.set('surface-accent', ref('primitive.blue-500'));
semantic.set('surface-accent-hover', colorMix(
  ref('semantic.surface-accent'),
  ref('primitive.ink-900'),
  { ratio: 0.12 },
));

semantic.set('text', bestContrastWith(ref('semantic.surface'), primitive));
semantic.set('text-on-accent', bestContrastWith(ref('semantic.surface-accent'), primitive));
semantic.set('border-subtle', closestColor(ref('semantic.surface'), primitive));
semantic.set('focus-ring', ref('primitive.mint-300'));
```

When your primitives come from a ramp generator, `nth` lets you pin roles to positions instead of names. Regenerate the ramp with more or fewer stops, and the semantic layer adapts:

```typescript
// ramp = scope with N generated shades, lightest → darkest
semantic.set('surface',     nth(ramp, 0));      // always the lightest
semantic.set('text',        nth(ramp, -1));     // always the darkest
semantic.set('muted',       nth(ramp, 0.5));    // the midtone
semantic.set('subtle-bg',   nth(ramp, 0.1));    // just off white
```

This is where Design Book becomes useful: instead of deciding every UI color manually, you encode the rule.

- `text` is whichever primitive gives the best contrast on the current surface
- `text-on-accent` stays legible even if the accent color changes
- `surface-accent-hover` is derived from the accent token, not maintained separately

### 4. Consume semantic tokens in UI scopes

```typescript
const button = book.addScope('button');

button.set('background', ref('semantic.surface-accent'));
button.set('background-hover', ref('semantic.surface-accent-hover'));
button.set('text', ref('semantic.text-on-accent'));
button.set('border', ref('semantic.border-subtle'));
button.set('focus-ring', ref('semantic.focus-ring'));
```

Now your components depend on meaning, not on palette coordinates or literal hex values.

If you regenerate the primitive palette, the semantic and component layers recompute automatically as long as the token relationships still make sense.

### Why this workflow works

- Palette tools stay free to explore hue, ramp shape, and tonal structure
- Semantic tokens preserve intent such as `surface`, `text`, `accent`, and `focus-ring`
- UI scopes stay stable even when the underlying palette changes
- Accessibility rules can live in the token graph instead of in design review folklore

Design Book is strongest in that middle layer: not generating colors, but turning a generated palette into a maintainable, explainable system.

## Using with Claude Code

The package ships with a [Claude Code skill file](./skills/design-book.md) at `skills/design-book.md`. It teaches Claude how to migrate or retrofit a static design system onto Design Book — discovering tokens, classifying them into the value / reference / procedural layers, generating the equivalent Design Book code, and verifying the result.

It includes a Figma-specific path (via the Figma Dev Mode MCP server when available, the Figma REST API otherwise) that maps Figma variables, collections and modes to Design Book scopes, refs and `extends`-inheritance.

To use it, copy the file into a Claude Code project:

```bash
mkdir -p .claude/skills
cp node_modules/design-book/skills/design-book.md .claude/skills/
```

Then prompts like *"migrate this Tailwind config to design-book"*, *"import these Figma variables"*, or *"retrofit our CSS variables onto design-book"* will trigger the workflow.

You can also read it as a plain migration guide — it doesn't require Claude Code to be useful.

## License

[AGPL-3.0](LICENSE) — free for open-source projects. If you want to use Design Book in proprietary or closed-source software without open-sourcing your project, a commercial license is available. Contact [david@elastq.ch](mailto:david@elastq.ch).
