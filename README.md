# Design Book

A reactive TypeScript design system framework. Define tokens with relationships, compute derived values automatically, and render to CSS, JSON, or [W3 Design Tokens](https://www.designtokens.org/tr/drafts/format/).

## Philosophy

Design systems are usually built as collections of fixed values — a color picked here, a spacing value decided there, each choice made in isolation and checked against every other. Design Book takes a different approach: instead of encoding *results*, you encode *relationships*.

A text color isn't `#ffffff` — it's "the highest-contrast color from this palette against this background." A hover state isn't a manually darkened hex — it's "primary mixed 15% toward black." Change the primary color once, and every relationship updates: contrast pairs recalculate, derived tones shift, spacing scales recompute. The system maintains coherence across complexity you couldn't track by hand.

This idea — that relationships matter more than individual choices — means your design decisions become transparent, auditable, and reactive. You can see *why* a color was chosen, not just *what* it is. And when the inputs change, the logic holds.

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

// Derived tokens with references and functions
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

// Render
const css = new Renderer(book, 'css-variables').render();
const json = new Renderer(book, 'json').render();
const w3 = new Renderer(book, 'w3-design-tokens').render();
const svg = new SVGRenderer(book).render();
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

### Color analysis (require a scope to search)

```typescript
bestContrastWith(target, scope)             // Highest WCAG contrast
minContrastWith(target, scope, { ratio })   // Meets minimum ratio (default 4.5)
closestColor(target, scope)                 // Perceptually closest
furthestFrom(scope)                         // Most distant from others
averageColor(scope, { colorSpace })         // Average of all colors
```

### Color transforms

```typescript
colorMix(color1, color2, { ratio, colorSpace })   // Interpolate two colors
lighten(color, { amount })                          // Increase lightness
darken(color, { amount })                           // Decrease lightness
relativeTo(color, 'oklch', [null, null, '+180'])   // Per-channel modification
```

Channel modifications for `relativeTo`: `null` (keep), number (set), `"+N"` `"-N"` `"*N"` `"/N"` (relative).

### Non-color

```typescript
spacingScale(base, { multiplier })              // Multiply dimension
typographyScale(base, { ratio, step })          // Modular scale
timing(duration, 'ease-out', { delay })         // Timing string
```

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

## Rendering

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

If you prefer a ramp-oriented workflow, RampenSau is a good fit for generating a light-to-dark sequence first and then mapping roles onto it.

### 2. Store those colors as primitives

```typescript
import {
  DesignBook, color, ref,
  bestContrastWith, closestColor, colorMix,
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

## License

[AGPL-3.0](LICENSE) — free for open-source projects. If you want to use Design Book in proprietary or closed-source software without open-sourcing your project, a commercial license is available. Contact [hello@meodai.me](mailto:hello@meodai.me).
