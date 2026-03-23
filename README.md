# Design Book

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
book.watch('ui.text', (newValue) => {
  console.log('Text color changed to', newValue);
});
brand.set('white', color('#f5f5f5')); // triggers re-computation

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
```

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
book.on('tokenChanged', (e) => { /* e.detail.key, e.detail.newValue */ });
book.on('change', (e) => { /* e.detail.changedKeys, e.detail.scopes */ });
book.on('scopeAdded', (e) => { /* e.detail.scopeName */ });
book.on('scopeRemoved', (e) => { /* e.detail.scopeName */ });
book.watch('brand.primary', (newValue, oldValue) => { /* ... */ });
```

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

## Editor

Run `npm run dev` to start the interactive editor. Features:

- CodeMirror 6 with context-aware autocomplete
- Inline color swatches
- Live CSS / JSON / W3 output
- SVG dependency visualization
- Error highlighting for invalid values

## License

MIT
