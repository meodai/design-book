# Design Book

A reactive TypeScript constraint system for design decisions. Define how token values are chosen, resolved, and rendered to CSS, JSON, or [W3 Design Tokens](https://www.designtokens.org/tr/drafts/format/).

## Philosophy

Design systems are usually stored as fixed answers — a color picked here, a spacing value decided there, each one maintained by hand. Design Book takes a different approach: instead of storing values, you define how values are chosen.

A text color isn't `#ffffff` — it's "the highest-contrast color from this palette against this background." A hover state isn't a second hex to maintain — it's "primary mixed 15% toward black." An accent isn't a one-off pick — it's "the most vivid color that still reads on the surface, excluding the tokens reserved for error and success."

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
mostVivid(scope)                            // Highest OKLCH chroma
leastVivid(scope)                           // Lowest OKLCH chroma — the muted counterpart
lightest(scope)                             // Highest OKLCH lightness
darkest(scope)                              // Lowest OKLCH lightness
```

`mostVivid` uses OKLCH chroma rather than HSL saturation so a pale pink and a vivid mid-red don't score the same.

`lightest` and `darkest` rank by OKLCH L — not HSL lightness, which calls `#ffff00` and `#0000ff` equally light, and not WCAG luminance. Alpha is ignored when ranking; a translucent winner keeps its alpha.

`closestColor` and `furthestFrom` measure perceptual distance as Euclidean distance in OKLab, so "closest" means closest to the eye rather than closest in sRGB coordinates.

**Translucent candidates.** Selectors keep alpha. A candidate is judged as it
would actually look — composited over the target color — so a 5%-black
hairline scores as the near-invisible line it is rather than as pure black,
and the winner is returned with its own alpha as 8-digit hex
(`#00000080`). Feed that into a renderer and you get the translucent token
back, not an opaque approximation of it.

### Excluding candidates with `not`

Every scope-iterating function above accepts a `not` option — an array of
fully-qualified token keys (or `ref(...)` calls) that should be skipped during
the search. Useful when a value carries a role you don't want to reuse
elsewhere — `values.error` shouldn't be the accent color even if it happens
to have the highest chroma.

```typescript
ui.set('accent', mostVivid(palette, {
  not: [ref('palette.error'), ref('palette.success')],
}));

// `not` is also available on bestContrastWith, minContrastWith,
// closestColor, furthestFrom, nextLarger, nextSmaller, nth and sibling.
```

Plain strings work too — `not: ['palette.error']` is equivalent to
`not: [ref('palette.error')]`.

### Keeping only readable candidates with `readableOn`

The color selectors `mostVivid`, `leastVivid`, `lightest`, `darkest`,
`closestColor` and `furthestFrom` also take `readableOn` — a backdrop color —
and `minContrast` (default 4.5). Like `not`, it narrows the pool before the
selector ranks anything: candidates below the WCAG ratio against the backdrop
are dropped, so the vivid pick is the most vivid *readable* color.

```typescript
ui.set('accent', mostVivid(palette, {
  readableOn: ref('ui.surface'),
  minContrast: 4.5,
  not: [ref('palette.error')],
}));
```

The backdrop is a real dependency — change `ui.surface` and the pick follows.
Translucent candidates are judged composited over it. If no candidate reaches
the ratio the selector throws instead of falling back, so it never hands back
a color you asked to be readable that is not. `bestContrastWith` and
`minContrastWith` already pick by contrast and do not take it.

### Color transforms

```typescript
colorMix(color1, color2, { ratio, colorSpace })   // Interpolate two colors
lighten(color, { amount })                          // Increase lightness
darken(color, { amount })                           // Decrease lightness
shade(color, { amount })                            // Tonal step that adapts: darkens if input is light, lightens if dark
relativeTo(color, 'oklch', [null, null, '+180'])   // Per-channel modification
```

`shade` is useful when you want a subtle variation that's *always* visible against the input — `darken(surface)` collapses to black when the surface is already dark, but `shade(surface)` flips direction and lightens instead. Picks based on OKLCH lightness: > 0.5 darkens, ≤ 0.5 lightens.

`lighten` and `darken` are OKLCH mixes towards white and black — the JS twin
of the `color-mix(in oklch, <color> N%, white | black)` the CSS renderer
emits, so a token resolves to the same color whether JS or the browser
computes it. `colorMix` matches CSS `color-mix()` too: premultiplied-alpha
interpolation (a fully transparent color contributes nothing but its
alpha), with the result gamut-mapped in OKLCH instead of clipped
channel-wise — mixing `#ff0000` and `#00ff00` in `oklch` gives `#dda200`,
not the clipped `#f99500`. All four keep alpha and emit 8-digit hex when the
result is translucent; `shade` carries the input's alpha through unchanged,
while `lighten`/`darken`/`colorMix` compute the mixed alpha the way the
browser does.

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
when adjacent steps are nearly the same. Comparison is per unit: members
whose unit differs from the target's are skipped rather than treated as an
error, so a scope that mixes `px` and `rem` still works — each target only
ever sees its own unit. The unit can be anything — `px`, `rem`, `em`, `ms`,
etc. If no member of the target's unit qualifies, the function throws at
resolve time.

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
nth(scope, 0.5)            // Middle item (non-integer = relative position, 0 < x < 1)
nth(scope, 0.25, { not })  // Quarter-way through, with exclusions
```

Picks a single value from a scope by position. Integer indices (including
values like `1.0`, which JavaScript cannot distinguish from `1`) work like
`Array.at()` — `0` is the first element, `-1` is the last, `-2` is the
second-to-last. Non-integer indices strictly between `0` and `1` select
*relatively*: values near `0` are near the first item, values near `1` are
near the last, and `0.5` is the middle. Floats outside that range are
clamped. `NaN` and `Infinity` are rejected with a `FunctionError`.

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

### Relative steps

```typescript
sibling(ref('ramp.s300'), 1)                  // The member after ramp.s300
sibling(ref('ramp.s300'), -1)                 // The member before it
sibling(ref('ramp.s900'), 1, { wrap: true })  // Past the end → back to the first
```

Where `nth` addresses a position in a scope, `sibling` steps from a token:
it takes the anchor's position in its own scope (key order, inherited
members included) and returns the value `offset` members away. Any integer
works. Past either end it stops at the first or last member; pass
`{ wrap: true }` to wrap around instead. `not` skips keys while stepping.

```typescript
// ramp runs light → dark
ui.set('button',       ref('ramp.s500'));
ui.set('button-hover', sibling(ref('ramp.s500'), 1));   // one step darker
ui.set('button-press', sibling(ref('ramp.s500'), 2));   // two steps darker
```

It follows the scope: change, add or remove a member and the step
re-resolves. Members that walk the same scope themselves (another
`sibling`, an `nth`, a selector) are skipped, so a `sibling` can live in
the scope it steps through.

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

## Naming Primitives

Try every scheme in the [naming playground](https://meodai.github.io/design-book/naming/).

The naming helpers have no dependencies and are also published on their own, so a project that only needs key names can import just them (a few KB, no culori, no token engine):

```typescript
import { nameValues, scaleNames, nameBetween, namingScheme } from 'design-book/naming';
```

They are exported from `design-book` as well.

Generated primitives still need keys. `nameValues(values, scheme, options?)` pairs each value with a name from a naming convention, smallest / lightest first, and `scaleNames(count, scheme, options?)` returns just the names. They only produce names — never values:

```typescript
import { nameValues, scaleNames, nameBetween, namingScheme } from 'design-book';

for (const [name, hex] of nameValues(shades, 'hundreds')) gray.set(name, color(hex));
// 7 shades → gray.50, gray.200, gray.300, gray.500, gray.700, gray.800, gray.950

scaleNames(5, 'tshirt')                          // ['xs', 's', 'm', 'l', 'xl']
scaleNames(4, 'ordinal', { step: 10 })           // ['10', '20', '30', '40']
scaleNames(3, 'tshirt', { prefix: 'space-' })    // ['space-s', 'space-m', 'space-l']
```

### Schemes and strategies

A scheme is a **vocabulary** — its names, smallest first — plus a default **strategy** (`anchor`) for picking `count` of them. Any scheme can use any strategy:

| `anchor` | What it does | Options |
|---|---|---|
| `'start'` | consecutive steps up from a first name | `from`, `step` |
| `'base'` | consecutive steps both ways from a centre name | `base`, `step` |
| `'range'` | both ends fixed, the values spread evenly between | `from`, `to`, `base: [n, name]` to pin one value, `overflow` |

| Scheme | Names | Default |
|---|---|---|
| `ordinal` | 1 2 3 … (open-ended, centre 0) | start |
| `roman` | i ii iii iv … (`case: 'upper'`) | start |
| `greek` | alpha … omega (24) | start |
| `paper` | a10 … a0 (11) | start |
| `creatures` | tardigrade … whale (23, by size) | range |
| `objects` | atom … universe (100 things, each at least 15% bigger than the last) | range |
| `things` | nothing electron atom glitter dust … key-cap … cup … umbrella chair ottoman table … car … earth (28, a ladder for UI sizes, `nothing` = 0) | range |
| `value` | each value named by its own number — `nameValues([1, 2, 3, 4, 6, 8, 9], 'value')` → `1 2 3 4 6 8 9`; needs values, so only through `nameValues` | — |
| `tshirt` | … 2xs xs s **m** l xl 2xl … (open-ended) | base |
| `intensity` | hint faint subtle soft **mid** firm bold strong intense | range, `mid` kept on its value |
| `dynamics` | ppp pp p mp **mf** f ff fff | range, `mf` kept on its value |
| `weights` | thin extralight light **regular** medium semibold bold extrabold black | range, `regular` kept on its value |
| `hundreds` | 50 … 950 (steps of 100, then 50, then 25) | range |
| `tones` | 0 … 100 | range |
| `unit` | 0 … 1 | range |
| `signed` | -1 … 1 | range |

```typescript
scaleNames(5, 'creatures')                               // tardigrade beetle cat bear whale
scaleNames(3, 'creatures', { anchor: 'start', from: 'cat' }) // cat fox dog
scaleNames(3, 'creatures', { anchor: 'base' })           // rabbit cat fox
scaleNames(4, 'intensity')                               // hint mid bold intense
scaleNames(3, 'intensity', { anchor: 'base' })           // soft mid firm
scaleNames(4, 'tshirt', { anchor: 'start' })             // xs s m l
scaleNames(3, 'tshirt', { anchor: 'range', from: 'xs', to: 'xl' }) // xs m xl
scaleNames(5, 'hundreds', { anchor: 'base' })            // -200 -100 0 100 200
```

Ranges keep their outermost names and spread evenly between them. Open-ended vocabularies (`ordinal`, `roman`, `tshirt`) never run out with `start` and `base`; a range over them needs `from` and `to`. Number names are written as keys: `0_25` is 0.25, `-1` is -1.

### Options

| Option | Meaning |
|---|---|
| `anchor` | `'start'`, `'base'` or `'range'` — overrides the scheme's default |
| `base: n` | value *n* gets the centre (`m`, `mid`, the middle of a list, `0` for numbers) and the rest step outward — implies `anchor: 'base'` |
| `base: [n, name]` | value *n* gets that name. With ends (lists, ranges) the rest spread to them (`scaleNames(7, 'hundreds', { base: [2, '500'] })` → `50 300 500 600 700 900 950`); open-ended vocabularies step outward |
| `from`, `to` | `start`: the first name or number. `range`: the ends (`scaleNames(5, 'hundreds', { from: -500, to: 500 })` → `-500 -200 0 200 500`) |
| `step` | `start` / `base`: distance between steps, in names or in units |
| `case` | `'upper'` for `roman` |
| `overflow` | `range` (and `start` on a list): `'throw'` (default) or `'between'` — keep every name and add the missing steps as fractions (`… a6 a6_5 a5 …`) |
| `prefix`, `suffix` | added to every name |

Options that do not fit the scheme and strategy throw instead of being ignored. Your own list becomes a scheme with `namingScheme(names, { base?, anchor? })`: with a `base` name it behaves like `intensity`, without one it starts at the first name.

### Re-run first; insert only for stable names

When a scale changes, the best names come from simply **running `scaleNames` / `nameValues` again** with the new count — every step gets a clean, evenly spread name. In-between names are a compromise for when **names must stay stable**, because CSS, components or a published token set already depend on the existing keys:

```typescript
nameBetween('100', '200', 'hundreds')     // '150'
nameBetween('soft', 'mid', 'intensity')   // 'soft_5'
nameBetween('hint', 'mid', 'intensity')   // 'subtle' (a real name sits in the middle)
nameBetween('soft', 'soft_5', 'intensity') // 'soft_25' (in-between names can be split again)
```

Each insertion adds fractions, so a scale grown this way drifts away from the clean names a re-run would give. The same goes for `overflow: 'between'`: prefer a scheme with enough names.

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

// 1. Implementation. Receives the resolved color as a string and the options.
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

Scope `extends` shares tokens between scopes of one book; inherited refs keep pointing at the keys they name. To theme a whole system — override a root and have everything downstream follow — compose layers instead (see [Themes: layering a whole book](#themes-layering-a-whole-book)).

Inherited tokens remain part of the dependency graph. If `dark.primary` currently resolves from `light.primary`, anything depending on `dark.primary` will continue to update when `light.primary` changes.

`addScope` validates the name and the inheritance chain and throws a
`ScopeError` rather than producing a book you cannot address: an empty or
whitespace-only name, a name containing `.` (the separator between scope and
token, so `resolve('a.b.x')` could never find the token), a scope extending
itself, and an `extends` chain that leads back to the new scope are all
rejected.

## Typography

A text style is a collection of properties (family, size, weight, line-height, …) that you want to address as one thing. `typography()` makes it **one token**, the W3 `typography` composite. Each field is an argument of the token, so the refs it holds are tracked in the graph like any function's, and a `ref()` to it carries the whole style:

```typescript
const font = book.addScope('font');
font.set('sans', string('"Inter", system-ui, sans-serif'));

const size = book.addScope('font-size');
size.set('md', rem(1.8));
size.set('xl', rem(3.2));

const type = book.addScope('type');
type.set('body',  typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.md'), lineHeight: 1.5 }));
type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.xl'), fontWeight: '700' }));

const button = book.addScope('button');
button.set('padding', ref('space.sm'));
button.set('label', ref('type.body'));       // the whole text style

book.inspect('font-size.xl').dependents;     // ['type.title']
book.resolve('type.title');                  // 'font-family: "Inter", …; font-size: 3.2rem; font-weight: 700'
```

Any field name is allowed (it must be a valid token key). The CSS renderer writes one variable per field and a class; a ref to a typography points each field at the target's variable:

```css
:root {
  --type-title-font-family: var(--font-sans);
  --type-title-font-size: var(--font-size-xl);
  --type-title-font-weight: 700;
  --button-label-font-family: var(--type-body-font-family);
  /* … */
}
.type-title {
  font-family: var(--type-title-font-family);
  font-size: var(--type-title-font-size);
  font-weight: var(--type-title-font-weight);
}
```

W3 output is the native composite (`"type": { "title": { "$type": "typography", "$value": { … } } }`), and a ref to it an alias (`"$value": "{type.body}"`). JSON writes the resolved declarations.

### One field: `ref('scope.token.field')`

A third key segment reads one field. The graph tracks it per field — a line-height may read its own style's font size, two styles may read each other's other fields, and only a real loop is rejected. It follows refs to the typography and renders as the field's variable:

```typescript
callout.set('size', ref('type.title.fontSize'));   // --callout-size: var(--type-title-font-size);
book.resolve('button.label.lineHeight');            // '1.5' (button.label is a ref to type.body)
```

W3 has no alias syntax for a value inside a composite, so W3 output writes the resolved field with its type.

### Changing some fields: `variant`

`variant(base, overrides)` changes some fields of a typography; `null` drops one.

- Pass a **ref** for a live **variant**: the fields it doesn't set keep reading the base, so it follows every later change to it — including in breakpoint books. Inherited fields render as `var()` of the base's variables.
- Pass the **token** for a **copy**: what a theme or breakpoint layer uses to change a style in place, since a token cannot `ref()` the value it replaces (trying to is rejected with a hint).

```typescript
type.set('hero', variant(ref('type.title'), { fontWeight: '800' }));
// --type-hero-font-family: var(--type-title-font-family);
// --type-hero-font-size: var(--type-title-font-size);
// --type-hero-font-weight: 800;

const phone = layer('phone', (book) => {
  book.getScope('type').set('title', variant(book.getTokenByKey('type.title'), { lineHeight: 1.2 }));
});
```

Pass `classPrefix` to prefix the emitted classes:

```typescript
book.render('css-variables', { classPrefix: 't-' }); // → .t-type-title { … }
```

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

Custom-property names are checked for collisions before anything is emitted.
Two different keys can mangle to the same name — `a.b-c` and `a-b.c` both
become `--a-b-c`, and `fontSize` / `font_size` / `font-size` collide inside
one scope — in which case the last declaration would silently win. The
renderer throws instead, naming the property and every token that claims it.

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

`$type` is inferred from the token, and W3 has no `string` type, so a string
token is emitted without one. Where you know better, set it yourself with
`metadata.w3Type` — the escape hatch wins over the inferred type:

```typescript
fonts.set('sans', string('"Inter", system-ui, sans-serif', {
  metadata: { w3Type: 'fontFamily' },
}));
```

One catch: constructor options go through `val()`, which **shallow-merges**
them into the token, so a `metadata` object replaces whatever metadata the
constructor had built rather than extending it. `px(300, { metadata: { w3Type: 'duration' } })`
would drop the `unit: 'px'` the constructor set. Pass both together:

```typescript
motion.set('slow', px(300, { metadata: { unit: 'ms', w3Type: 'duration' } }));
```

If you want the structured token object directly, use `renderW3DesignTokensObject()`.

### Table view

For documentation pages or admin UIs, `TableViewRenderer` outputs an HTML
`<table>` with one row per token — qualified key, type, resolved value
(with an optional inline color swatch), and the dependency list.

```typescript
import { TableViewRenderer } from 'design-book';

const html = new TableViewRenderer(book).render();
// <table class="design-book-table">…</table>
```

Options: `className` (root element class), `inlineColorSwatches`
(default `true`), `showInheritance` (default `true` — annotates inherited
rows with the source key).

### Themes, contexts and breakpoints

A variation — an inverted context, a dark theme, another brand, a phone breakpoint — is just another book. Build it with the same setup function, override what differs, and render it as overrides of the base:

```typescript
function buildBook() {
  const book = new DesignBook('site');
  // … every scope and token …
  return book;
}

const base = buildBook();
const inverted = buildBook();
inverted.getScope('surface').set('normal', ref('brand.shade'));

const phone = buildBook();
phone.getScope('type').set('body', rem(1.6));

const css = [
  base.render('css-variables'),
  inverted.render('css-variables', { selector: '.inverted', changedFrom: base }),
  phone.render('css-variables', { media: '(max-width: 620px)', changedFrom: base }),
].join('\n\n');
```

```css
:root { --surface-normal: var(--brand-paper); --ui-text: #111111; /* … */ }

.inverted {
  --surface-normal: var(--brand-shade);
  --ui-text: #ffffff;
}

@media (max-width: 620px) {
  :root {
    --type-body: 1.6rem;
  }
}
```

Because the variation is a real book, computed tokens are recomputed for it: `ui.text = bestContrastWith(ref('surface.normal'), brand)` picks a new color for the dark surface, and `changedFrom` emits it. Tokens that only reference others (`var(--surface-normal)`) are left out — the cascade already updates them.

| Option (css-variables) | Meaning |
|---|---|
| `selector` | the rule to write into, default `:root` |
| `media` | wrap the output in `@media …` (combine with `selector` for "inverted on phones") |
| `scopes` | only these scopes (also for `json`) |
| `changedFrom` | only declarations that differ from another book (also for `json`, by resolved value) |
| `breakpoints` | name → media query, for scopes that carry `metadata.media` (below) |

Breakpoints usually belong in their own books, as above: the same variables, new values inside `@media`. With `typography()` tokens built on a type scale, a breakpoint layer often only changes the scale (`layer('phone', { 'font-size': { xl: rem(2.4) } })`) and `changedFrom` writes just `--font-size-xl` — the text styles follow through `var()`.

The exception is a scope whose variables should *only* exist inside a media query. Give it `metadata.media` — a name from the `breakpoints` option, a media type (`print`) or a raw query — and the renderer writes it in its own `@media` block. Blocks follow the order of the `breakpoints` table, then raw queries in scope order; an unknown name throws.

```typescript
book.addScope('layout-wide', { metadata: { media: 'lg' } });
book.render('css-variables', { breakpoints: { md: '(min-width: 48em)', lg: '(min-width: 64em)' } });
```

`metadata` is a free-form object on every scope (`scope.metadata`, default `{}`, not inherited through `extends`); the book never reads it and `media` is the only key a renderer does.

`diffBooks(a, b)` reports the same differences as data — `{ changed, added, removed }` by resolved value — for auditing a brand against its base:

```typescript
diffBooks(base, inverted).changed
// [{ key: 'surface.normal', from: '#ffffff', to: '#1d2b5c' }, { key: 'ui.text', from: '#111111', to: '#ffffff' }, …]
```

### Themes: layering a whole book

A theme usually changes the roots of the tree — "our brand highlight is green", "our spacing is denser" — and everything downstream should follow. Scope `extends` can't do that: an inherited token keeps pointing at the keys it was written against.

```typescript
book.addScope('brand').set('highlight', color('#2d60a5'));
book.addScope('text').set('highlight', ref('brand.highlight'));
book.addScope('alt-brand', { extends: 'brand' }).set('highlight', color('#3f8f5a'));
book.addScope('alt-text', { extends: 'text' });
book.resolve('alt-text.highlight'); // '#2d60a5' — still reads brand.highlight, not alt-brand.highlight
```

Instead, write each theme as a **layer** holding only its differences, and compose a book from a stack of layers. Every layer writes into the same book, so overriding a root is an ordinary `set` and every ref, function token and selector pool that depends on it is recomputed:

```typescript
import { layer, composeBook, keysFromLayer, layerOf } from 'design-book';

// A store chain: one shared store system, each store the same brand with its own accent.
const system = layer('store-system', (book) => {
  book.addScope('brand').set('highlight', color('#2d60a5'));
  book.addScope('text').set('highlight', ref('brand.highlight'));
});
const oldTown = layer('old-town', { brand: { highlight: color('#d9480f') } });
const harbour = layer('harbour', { brand: { highlight: color('#0c8599') } });

const chainBook = composeBook('store-system', [system]);
const oldTownBook = composeBook('old-town', [system, oldTown]);
const harbourBook = composeBook('harbour', [system, harbour]);

oldTownBook.resolve('text.highlight'); // '#d9480f'
chainBook.resolve('text.highlight');   // '#2d60a5'

oldTownBook.render('css-variables');   // the full set
oldTownBook.render('css-variables', { selector: '.old-town', changedFrom: chainBook }); // only what differs

keysFromLayer(oldTownBook, 'old-town'); // ['brand.highlight'] — what this store changes

// Stacks go as deep as the brand does: the old-town store's café corner.
const cafe = layer('cafe', { text: { highlight: color('#5c940d') } });
const cafeBook = composeBook('old-town-cafe', [system, oldTown, cafe]);
layerOf(cafeBook, 'brand.highlight'); // 'old-town'
layerOf(cafeBook, 'text.highlight');  // 'cafe'
```

A layer is either a **function** `(book) => void` — free to add scopes with `extends`, set `typography()` tokens or change them with `variant`, register functions, build selectors over a scope, or delete tokens — or **data**, `{ scope: { token: <token> } }`. Data layers create scopes that don't exist yet, accept tokens only (a bare `'#fff'` throws, since it could be a color or a string), and clone their tokens on every apply, so one layer can go into many books.

`composeBook(name, layers, options?)` applies the layers in order, last one wins, and returns an ordinary book in `options.mode` (default `auto`). A layer that throws, or that would close a dependency cycle, stops the composition with a `LayerError` carrying `layerName`, `tokenKey` and the original error as `cause`. A ref to a key that a later layer adds is fine.

A composed book is live like any other. When a layer changes, compose again and diff:

```typescript
const next = composeBook('old-town', [system, oldTown]);
diffBooks(oldTownBook, next).changed; // what the edit moved
```

A token that must *not* follow a theme should point at a root that no theme overrides (`brand.highlight-fixed`), so the exception is visible in the token names.

**Layers or scope `extends`?** Use layers for a variation of the whole system — brand, theme, mode, density. Use scope `extends` for two scopes in the *same* book that share members, such as a selector pool built on top of a palette, or a typography style that tweaks another one.

## Events

```typescript
const dispose = book.on('tokenChanged', (e) => { /* e.detail.key, e.detail.newValue */ });
book.on('change', (e) => { /* e.detail.changedKeys, e.detail.scopes */ });
book.on('scopeAdded', (e) => { /* e.detail.scope */ });
book.on('scopeRemoved', (e) => { /* e.detail.scope, e.detail.removedKeys */ });
book.on('batch-failed', (e) => { /* e.detail.processed, e.detail.errors */ });
book.on('batch-complete', (e) => { /* e.detail.processed */ });
book.on('error', (e) => { /* e.detail.key, e.detail.error, e.detail.phase */ });
book.watch('brand.primary', (newValue, detail) => {
  // newValue is undefined when the token no longer resolves
  // detail contains the underlying tokenChanged event payload
});
dispose();
```

`book.on()` and `book.watch()` both return unsubscribe functions.

`error` reports a failure that could not be thrown at anybody.
`e.detail.phase` says which:

- `'reentrant'` — the change was made from an event handler while a previous
  change was still propagating, so it was queued; by the time it ran the
  outer `set()` had already returned and there was no caller left to throw
  at. The token is rolled back and the failure is reported here.
- `'rollback'` — announcing that an already-announced change had been undone
  itself failed.

**A rejected `set()` corrects itself before it throws.** When a write is
accepted, announced, and only then refused (a cycle the graph rejects, say),
listeners have already been told the new value. The book rolls the token
back and emits a second `tokenChanged` (plus the accompanying `change`)
carrying the restored value *before* rethrowing, so watchers and renderers
never keep a value that no longer exists.

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

Switching out of batch mode with writes still queued flushes them: anything
left in the queue would otherwise sit unpropagated until some later,
unrelated `flush()`. Setting `mode = 'auto'` after the explicit `flush()`
above is therefore a no-op; drop the `flush()` and the mode switch does it.
`flush()` never throws — it collects errors and fires `batch-failed`.

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

The graph holds *value* dependencies only. The candidate pool of a
scope-iterating selector is not one: `ui.text = bestContrastWith(ref('ui.bg'), ui)`
lists `ui.bg` as a prerequisite, but not the other members of `ui` it
chooses between. The book tracks pools in a separate index, so a change to
any member of an iterated scope — added, changed, deleted, inherited through
`extends` — still notifies the selector, while a pool member that is itself
derived from the selector (`ui.muted = lighten(ref('ui.text'))`) is not a
cycle and is accepted.

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

[AGPL-3.0](LICENSE) — free for open-source projects. If you want to use Design Book in proprietary or closed-source software without open-sourcing your project, a commercial license is available. Contact [david@elastiq.ch](mailto:david@elastiq.ch).

Clients who hired David Aerne (personally or through Elastiq GmbH) for work in which he used Design Book may use it within the scope of that engagement without the AGPL conditions — see the additional permission in [LICENSE](LICENSE).
