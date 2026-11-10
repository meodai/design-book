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

`design-book` is the whole library. Code that keeps a book but never renders it (a tool embedding one, a server computing values) can import `design-book/engine` instead: the same `DesignBook` and functions without the CSS / JSON / W3 / SVG renderers. A book from there renders only what you register (`registerRenderer`, or `useRenderer` for every book).

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
ui.set('text', bestContrastWith(ref('ui.background'), ref('brand')));
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
ref('.token')             // Relative: `token` in whichever scope reads it (see Relative refs)
ref('scope')              // A scope, where a function searches one: mostVivid(ref('palette'))
ref('.')                  // The scope that reads the token, as a pool
inherited(ref('.token'))          // The same reference one `extends` level up (see Navigation)
inherited(ref('.token'), 'root')  // … at the top of the chain
source(ref('.token'), 'root')     // The token its references end at (a sibling anchor, toward or not entry)
refersTo(ref('brand.ink'))        // The members of the pool that refer to it (a not entry, sibling anchor or toward)

px(16)                    // Dimension shortcuts
rem(1.5)
ms(200)
dimension(100, 'vh')      // Generic — any unit

string('Arial, sans-serif')  // String values
```

## Built-in Functions

Some functions are straightforward transforms. The distinctive ones search a scope and select the value that best satisfies a rule.

### Comparisons (any kind)

```typescript
closest(target, ref('scope'))                         // Nearest member of the target's kind
nextLarger(target, ref('scope'), { minDistance })     // closest, larger  (sizes, text styles)
nextSmaller(target, ref('scope'), { minDistance })    // closest, smaller
nextLighter(target, ref('scope'), { minDistance })    // closest, lighter (colors)
nextDarker(target, ref('scope'), { minDistance })     // closest, darker
closest(target, ref('scope'), { upTo: ref('.page') })  // closest on the page's side
bestContrastWith(target, ref('scope'))                // Highest contrast
minContrastWith(target, ref('scope'), { minContrast }) // Lowest contrast that reaches minContrast
furthestFrom(target, ref('scope'), { maxDistance? }) // Most distant member of the target's kind
lightest(ref('scope')) / darkest(ref('scope'))        // Extremes of lightness (colors)
largest(ref('scope'))  / smallest(ref('scope'))       // Extremes of size (sizes, text styles)
```

**The target decides the kind.** A pool may hold colors, sizes and text styles side by side; a comparison only looks at the members of the target's kind and skips the rest. Sizes are compared within one unit (`px` with `px`, `rem` with `rem` — there is no root size to convert with), and text styles with text styles, by their font size (or the member `by` names). Nothing of that kind in the pool throws and says so: *closest: scope "brand" has no text styles in rem*. Functions without a target take their kind from their name (`lightest` colors, `largest` sizes and text styles), and `largest` / `smallest` take `{ type: 'size' | 'text' }` when a pool holds more than one group.

| | Colors | Sizes | Text styles |
|---|---|---|---|
| `closest` | OKLab distance | value | font size |
| `direction` (`nextLarger` …) | `lighter` / `darker` (OKLCH L) | `larger` / `smaller` | `larger` / `smaller` |
| `minDistance` | OKLCH lightness, 0–1 | the target's unit | the target's unit |
| `bestContrastWith` / `minContrastWith` | WCAG ratio or APCA Lc (the book's `contrast`) | ratio of the two sizes | ratio of the font sizes |
| `furthestFrom` | OKLab distance | value | font size |
| `maxDistance` (`furthestFrom`) | OKLab distance, 0 to about 1 | the target's unit | the target's unit |
| extremes | `lightest` / `darkest` | `largest` / `smallest` | `largest` / `smallest` |
| `readableOn` | yes | — | — |
| `by` | a text style's color field (`'color'`) | — | the field it is measured by (font size unless given) |

**`by`: what stands for a text style.** A text style is measured by its font size unless the function names another field: `largest(ref('type'), { by: 'fontWeight' })` is the heaviest style, `nextLarger(ref('.body'), ref('type'), { by: 'lineHeight' })` the next looser one, `bestContrastWith(ref('.body'), ref('type'), { by: 'lineHeight' })` the one whose line height differs most. Any field that is a number, with or without a unit, measures — inherited fields of a variant included; a style without that field is no candidate. A color field works too, on every color comparison: `bestContrastWith(ref('.surface'), ref('type'), { by: 'color' })` is the text style whose color stands out most on the surface, `mostVivid(ref('type'), { by: 'color' })` the most colorful one, and `readableOn` narrows the styles by that color. The pick is the whole style; a text style as the target is measured by its field too. Sizes and colors are measured as themselves. A whole text style handed to a color transform (`lighten(ref('type.title'))`) throws and says to pass one of its fields: `ref('type.title.color')`.

**`closest` and its direction.** Colors are compared by perceptual distance (Euclidean in OKLab), so `nextLighter` from a blue is the nearest lighter *blue*, not a yellow that happens to be the next step up in lightness. `nextLarger` / `nextSmaller` / `nextLighter` / `nextDarker` are `closest` with `direction: 'larger' | 'smaller' | 'lighter' | 'darker'` — the editor writes them back that way. `upTo: ref('.page')` takes the side from where another value lies and stops there: one rule that is lighter on a light page and darker on a dark one, or that steps a size upTo another. `minDistance` is the gap the pick must clear past the target. The target does not need to be a member, and the pool needs no order.

**`furthestFrom`** is its mirror: the member that looks least like the target, by the same measure. An accent that stands apart from the surface, a display size far from the body. `maxDistance` keeps the pick in reach: the furthest member no further than that.

```typescript
ui.set('accent',  furthestFrom(ref('ui.surface'), ref('palette')));
ui.set('display', furthestFrom(ref('text.body'), ref('text'), { maxDistance: 2 })); // rem
```

```typescript
// scope.space = { xs: 4px, s: 8px, m: 12px, l: 16px, xl: 24px }
ui.set('gap',    nextLarger(ref('space.m'), ref('space')));                    // → 16px
ui.set('gap',    nextLarger(ref('space.m'), ref('space'), { minDistance: 6 })); // → 24px
ui.set('breath', nextSmaller(ref('space.l'), ref('space')));                   // → 12px
ui.set('hover',  nextLighter(ref('.button'), ref('brand')));                   // nearest lighter look-alike
```

**Contrast** for colors is measured the way the book is set to (see [WCAG or APCA](#wcag-or-apca)); for sizes and text styles it is the ratio of the larger to the smaller value for sizes and text styles (1.25 is a major third). So a type scale can be written as a rule:

```typescript
// the smallest style at least 1.25× the body, going up
type.set('lead', minContrastWith(ref('type.body'), ref('type'), { minContrast: 1.25, direction: 'larger' }));
```

`direction` works here too. `minContrastWith` falls back to the highest contrast when nothing reaches `minContrast`.

`lightest` and `darkest` rank by OKLCH L — not HSL lightness, which calls `#ffff00` and `#0000ff` equally light, and not WCAG luminance. Alpha is ignored when ranking; a translucent winner keeps its alpha.

**Translucent candidates.** Selectors keep alpha. A candidate is judged as it
would actually look — composited over the target color — so a 5%-black
hairline scores as the near-invisible line it is rather than as pure black,
and the winner is returned with its own alpha as 8-digit hex
(`#00000080`). Feed that into a renderer and you get the translucent token
back, not an opaque approximation of it.

### Color only

```typescript
mostVivid(ref('scope'))                            // Highest OKLCH chroma
leastVivid(ref('scope'))                           // Lowest OKLCH chroma — the muted counterpart
```

`mostVivid` uses OKLCH chroma rather than HSL saturation so a pale pink and a vivid mid-red don't score the same. Sizes have no chroma, so these only look at colors. Near black and white no color carries much chroma, so both take `lightness: [min, max]` (OKLCH L, 0–1) to compare only the members in that band: `mostVivid(ref('palette'), { lightness: [0.4, 0.8] })` is the loudest mid tone. Nothing in the band throws.

### Excluding candidates with `not`

Every scope-iterating function above accepts a `not` option: a list of
`ref(...)` calls (or key strings) naming members to skip during the search.
Useful when a value carries a role you don't want to reuse elsewhere —
`values.error` shouldn't be the accent color even if it happens to have the
highest chroma.

```typescript
ui.set('accent', mostVivid(ref('palette'), {
  not: [ref('palette.error'), ref('palette.success')],
}));

// `not` works on every function that searches a scope: bestContrastWith,
// minContrastWith, closest (and nextLarger / nextSmaller / nextLighter /
// nextDarker), furthestFrom, mostVivid, leastVivid, lightest, darkest,
// largest, smallest, nth, random and sibling.
```

Plain strings work too — `not: ['palette.error']` is equivalent to
`not: [ref('palette.error')]`.

**A `not` entry does not have to be a key of the pool.** A reference that
leads into the pool names the member it leads to (see [How a key names a
member](#how-a-key-names-a-member)), so you can write the role you mean
instead of looking up which shade it is:

```typescript
// ui.accent = ref('scale.800'): the accent's shade is left out
ui.set('text', bestContrastWith(ref('.bg'), ref('scale'), { not: [ref('ui.accent')] }));

// whatever the accent ends up being, in whichever ramp
ui.set('muted', bestContrastWith(ref('.bg'), ref('scale'), { not: [source(ref('.accent'), 'root')] }));

// scale.900 = ref('brand.ink'): leave out the step that holds the ink
ui.set('body', bestContrastWith(ref('.bg'), ref('scale'), { not: [refersTo(ref('brand.ink'))] }));
```

The rule reads the entry, so it follows it: re-point `ui.accent` to
`scale.600` and `text` leaves out `scale.600` instead.

An entry that names no member **throws** rather than silently excluding
nothing — a typo, a key from the wrong scope, or a selector that picked
from another scope is a mistake you want to see:

```text
mostVivid: `not` entry "other.red" is not a member of "scale" and its references do not lead into it, so it would exclude nothing
```

A key of the pool itself never throws, even when it does not exist (yet), so
a `not` list can name a member that comes and goes.

### How a key names a member

`not` entries, a `sibling` anchor and its `toward` target all name a
*member of a scope*: the pool of the selector, or the scale a `sibling`
walks. They share one rule, so a key means the same thing in all three
places — and **nothing is guessed**. A reference is followed only as far as
you say:

| The key is… | It names… |
|---|---|
| a member of the scope (`scale.300`) | that member |
| the key an inherited member comes from (`base.b` for `kid.b`) | the inherited member |
| a reference that leads into the scope (`ui.surface = ref('scale.0')`) | the member it leads to, its references followed until they land in the scope |
| `source(ref('.surface'), 'root')` | the token the references end at (or `n` references on, with `source(ref, n)`), then read as above |
| `inherited(ref('.surface'))` | the same key one scope up the `extends` chain, then read as above |
| `refersTo(ref('brand.ink'))` | the members whose references lead to it (`scale.900 = ref('brand.ink')`). A `not` entry leaves out every one; a `sibling` anchor or `toward` needs exactly one and throws with the list otherwise |
| a selector that picked a member of the scope (`ui.text = bestContrastWith(…, ref('scale'))`) | the member it picked — every built-in selector reports it exactly |
| anything else — a computed value, a selector that picked from another scope, references that go elsewhere | nothing: it throws |

A token sits in two trees: its **scope** may extend another scope, and its
**value** may refer to another token. `inherited` climbs the first,
`source` climbs the second and `refersTo` comes back down it; none of them
is ever taken on its own. A member that refers to a plain entry is not
matched by it: ask with `refersTo`.

### Keeping only readable candidates with `readableOn`

Every color selector — `mostVivid`, `leastVivid`, `lightest`, `darkest`,
`closest`, `furthestFrom`, `bestContrastWith` and `minContrastWith` — also
takes `readableOn`, a backdrop color, and `readableContrast` (default 4.5,
or Lc 60 in an APCA book).
Like `not`, it narrows the pool before the selector ranks anything:
candidates below that contrast against the backdrop are dropped, so the
vivid pick is the most vivid *readable* color.

```typescript
ui.set('accent', mostVivid(ref('palette'), {
  readableOn: ref('ui.surface'),
  readableContrast: 4.5,
  not: [ref('palette.error')],
}));
```

The backdrop is a real dependency — change `ui.surface` and the pick follows.
Translucent candidates are judged composited over it. If no candidate reaches
the ratio the selector throws instead of falling back, so it never hands back
a color you asked to be readable that is not.

**Readable on more than one background.** `bestContrastWith` and
`minContrastWith` already measure contrast against their target, so
`readableOn` is a *second* background the pick must also hold up on. That
is the case of a color that sits on a page and on a band or card across it:

```typescript
// a border: the faintest member that reaches 3:1 on the page,
// among those that also reach 3:1 on the tinted band it crosses
ui.set('border', minContrastWith(ref('.page'), ref('ramp'), {
  minContrast: 3,                // against the target, the page
  readableOn: ref('.band'),
  readableContrast: 3,           // against the second background
}));
```

The two thresholds are separate on purpose: `minContrast` is what
`minContrastWith` aims for on its target, `readableContrast` is the floor on
the backdrop. Sizes and text styles have no `readableOn`: a size target with
one throws.

### WCAG or APCA

A book measures color contrast one way, chosen once:

```typescript
const book = new DesignBook('app', { contrast: 'apca' }); // default 'wcag'
```

It applies everywhere a color contrast is read: `readableOn` /
`readableContrast`, `bestContrastWith` and `minContrastWith`. A threshold is
a number in the book's scale — a WCAG ratio (1 to 21, default 4.5) or an
APCA Lc (0 to about 106, default 60) — so the same `{ minContrast: 60 }`
means Lc 60 in an APCA book. A number that cannot belong to the method (a
ratio above 21, an Lc below 15) throws, naming the other one.

APCA's minimum depends on how large and heavy the text is, so a threshold
can also be a text style. Each method turns it into its own minimum: WCAG
3:1 for large text (24px, or 18.66px bold) and 4.5:1 otherwise; APCA's
simple levels, Lc 45 from 36px (24px bold), 60 from 24px (16px bold), 75
from 18px (14px bold), 90 below.

```typescript
ui.set('text', minContrastWith(ref('.page'), ref('ink'), {
  minContrast: ref('type.body'),             // a text style: a real dependency
}));
ui.set('caption', mostVivid(ref('palette'), {
  readableOn: ref('.page'),
  readableContrast: { fontSize: '14px', fontWeight: 700 },
}));
```

A token written this way reads right in either kind of book.

**Text or background.** APCA is asymmetric: white on gray is not the same
Lc as gray on white. By default the target of `bestContrastWith` /
`minContrastWith` is the background and the members are text on it. When
the target is the text and you are picking a surface for it, say so:

```typescript
// a surface white text still reads on (white as text, the members as backgrounds)
ui.set('badge', minContrastWith(ref('.white'), ref('ramp'), { minContrast: 60, targetIs: 'text' }));
```

A `readableOn` backdrop is always a background. WCAG ratios are the same
either way, so `targetIs` only changes an APCA book. Picks rank by |Lc|, so
light text on dark counts like dark text on light. Sizes and text-style targets keep their plain
ratio. `apcaContrast(text, background)`, `apcaMinimumLc(px, weight)` and
`wcagMinimumRatio(px, weight)` are exported.

### Color transforms

```typescript
colorMix(color1, color2, { ratio, colorSpace })   // Interpolate two colors
lighten(color, { amount })                          // Increase lightness
darken(color, { amount })                           // Decrease lightness
shade(color, { amount })                            // Tonal step that adapts: darkens if input is light, lightens if dark
relativeTo(color, 'oklch', [null, null, '+180'])   // Per-channel modification
withAlpha(color, 0.5)                               // The same color at that opacity
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

Channel modifications for `relativeTo`: `null` (keep), number (set), `"+N"` `"-N"` `"*N"` `"/N"` (relative). A fourth slot changes alpha, a fraction from 0 to 1: `[null, null, null, '*0.5']`.

`withAlpha(color, alpha)` keeps the color and sets its opacity: `withAlpha(ref('brand.ink'), 0.5)` is `#1a1a1a80` for `#1a1a1a`. It *sets* alpha, whatever it was, like `rgb(from var(--brand-ink) r g b / 0.5)`, which is what the CSS renderer writes: it is `relativeTo(color, 'rgb', [null, null, null, alpha])`. Keep ramps opaque and make the overlays, hairlines and washes from them, so they follow the ramp.

Every function's options object is checked when the token is written: an option the function does not read (a misspelling, a name from an older version) throws and lists the ones it takes, instead of being ignored while the token runs on the default.

### A whole scale from one color: `ramp`

```typescript
ramp(seed, { shade: '500', from?: 'radix' })      // one shade of the scale
rampStops(seed, { prefix: 'brand-', from? })     // every shade, as tokens
```

`ramp` copies the perceptual shape of a set of **master ramps** onto your
seed ([dittotones](https://www.npmjs.com/package/dittotones)): it finds
where the seed sits among the masters and builds the scale they would have
built around it. The default masters are Tailwind v3. Register others by
name, at construction or any time later, and pick them with `from`:

```typescript
import { tailwindRamps } from 'dittotones/ramps/tailwind'; // also radix, flexoki, shoelace, …
import { rampSet } from 'design-book';

book.registerRamps('tailwind', tailwindRamps);

// your own masters, in any CSS colors (every ramp with the same shades)
book.registerRamps('house', rampSet({
  clay: { 100: '#f3e3d8', 500: '#b0603a', 900: '#3a1d10' },
  moss: { 100: '#e3ecd6', 500: '#5e7d3a', 900: '#1f2a12' },
}), { default: true });

// or scopes of the book itself, one scope a ramp, its keys the shades,
// read live: change a master and every ramp copying it follows
book.registerRamps('masters', [ref('clay'), ref('moss')]);
```

**The more palettes, the better.** dittotones places your seed between the
masters nearest to it and blends their curves, so a set needs at least two
ramps, and every hue it covers makes the copy closer: a seed near one of
your masters gets that master's shape, a seed far from all of them gets a
blend of loosely related ones. Every ramp in a set has the same length, with
the same shades in the same order; that order is the scale.

The token stores only the set's name, so it stays plain data.
`new DesignBook(name, { colorRamps })` takes one set or named sets (the
first the default); `book.rampSetNames` lists them. An unknown set or a
shade the set does not have throws, naming what there is; registering a
name again replaces the set and announces the `ramp` tokens that read it.

### Index selection (require a scope to search)

```typescript
nth(ref('scope'), 0)              // First item (integer index)
nth(ref('scope'), -1)             // Last item (negative wraps like Array.at)
nth(ref('scope'), 0.5)            // Middle item (non-integer = relative position, 0 < x < 1)
nth(ref('scope'), 0.25, { not })  // Quarter-way through, with exclusions
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
`nth(ref('ramp'), -1)` — which stays correct even if the ramp is regenerated with
a different number of stops.

```typescript
// ramp scope has 9 generated shades, lightest → darkest
ui.set('surface',    nth(ref('ramp'), 0));      // lightest
ui.set('text',       nth(ref('ramp'), -1));     // darkest
ui.set('subtle',     nth(ref('ramp'), 0.15));   // just off white
ui.set('muted-text', nth(ref('ramp'), 0.7));    // dark but not darkest
```

### Relative steps

```typescript
sibling(ref('ramp.s300'))                     // The member after ramp.s300 (one step is the default)
sibling(ref('ramp.s300'), -1)                 // The member before it
sibling(ref('ramp.s900'), 1, { wrap: true })  // Past the end → back to the first
sibling(ref('.interaction'), ref('blue'), -2) // Two steps back in blue, from where .interaction points
sibling(source(ref('.interaction'), 'root'), -2)  // … in whichever scale its value is written
sibling(ref('.button'), ref('ramp'), 4, { toward: ref('.page') })  // Four steps toward the page's color
```

Where `nth` addresses a position in a scope, `sibling(anchor, scope?,
steps?, options?)` steps from a token and returns the value that many
members along (key order, inherited members included). Any integer works.
Past either end it stops at the first or last member; pass
`{ wrap: true }` to wrap around instead. `not` skips members while stepping.

**Which scale it walks is never guessed:**

- **By default, the anchor's own scope** — the one its key is written in.
  `sibling(ref('space.s'), 1)` is the next member of `space`, even when
  `space.s` is a reference into a primitive scale.
- **A scope you name**: `sibling(ref('.interaction'), ref('blue'), -2)`
  follows `.interaction`'s references until they land in `blue`, and steps
  from there. If they never land there, it throws.
- **Wherever the value comes from**, with
  [`source`](#addresses-ref-inherited-source):
  `sibling(source(ref('.interaction'), 'root'), -2)` walks the scale the
  value is written in. That is the rule to share between themes whose
  colors come from different ramps.

With a scale named, a selector counts as the member it picked, when that
member is in the scale: `sibling(ref('.text'), ref('scale'), 2, { toward:
ref('.surface') })` is two steps from whatever text was picked, toward the
surface — and follows when the pick changes. Without a named scale the
anchor's own scope is walked and no selector is asked; `source` never
looks through a pick either. A computed color (`lighten(…)`) is no member
of any scale. The rule is the one `not` uses —
see [How a key names a member](#how-a-key-names-a-member).

**`toward`** takes the direction from where another member sits on the
walked scale (its references followed into it, like a `not` entry), so one
rule fits a light and a dark scope, and it stops when it reaches the
target. A negative count walks away from it instead:

```typescript
// written once, inherited by a dark variant: lighter on a light page, darker on a dark one
light.set('hover', sibling(ref('.button'), ref('ramp'), 2, { toward: ref('.page') }));

// a variant's hover: its parent's interaction color, two steps lighter
hover.set('interaction', sibling(inherited(ref('.interaction')), ref('ramp'), -2));
```

A target that does not lead into the walked scale throws, and `toward` does
not combine with `wrap`. Like every reference, `toward` reads the scope
that reads the rule — no implicit parent.

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
random(ref('scope'), { type })                                 // type: 'color' | 'dimension' | 'string'
random(ref('scope'), { type: 'color', seed: 'spring-2026' })   // reproducible
random(ref('scope'), { type: 'color', not: ['brand.primary'] })// with exclusions
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
   resolved* arguments (strings for values, the live `Scope` for a scope
   reference), then the token's `options` object, and returns a string. An
   option whose value is a reference, a token or a function token is
   resolved like an argument before the implementation sees it.
2. **A constructor that wraps it as a `FunctionTokenValue`** — call
   `createFunctionToken('name', args, { options })`. The book reads the
   token's dependencies from its arguments and options, so a change to
   anything it reads re-resolves it.

```typescript
import { DesignBook, color, ref, createFunctionToken } from 'design-book';
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
    metadata: { returnType: 'color' },
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

The same pattern handles functions that pick from a scope — pass the scope
as an argument (`ref('palette')`): the implementation receives the live
`Scope`, and the book indexes it as the function's pool, so adding or
changing a member re-resolves it. A function that chooses one of the
members returns the member itself, `pick(scope, key)`: the token's value is
that member's, and the book knows which member it is (`book.pickOf(key)`), so
a `sibling` stepping in that scope, a `not` entry naming it and the SVG
renderer's edge all find the exact member, even when another one has the same
value:

```typescript
import { pick, type Scope } from 'design-book';

book.registerFunction('secondOf', (scope: Scope) => pick(scope, scope.getAllKeys()[1]));
```

A selector's value is the member's value as written: a pick of
`color('oklch(0.7 0.25 150)')` is `oklch(0.7 0.25 150)`, and each renderer
writes it the way its format can.

A function that reads whole scopes it is not handed as arguments — scopes named in its options, or worked out from the book — says so when it is registered, so a change in them reaches its tokens:

```typescript
book.registerFunction('firstOf', (options?: { scope: string }) => {
  const scope = book.getScope(options!.scope)!;
  return scope.resolve(scope.getAllKeys()[0]);
}, { scopesRead: (token) => [token.options!.scope as string] });
```

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

Scope `extends` shares tokens between scopes of one book; an inherited `ref('light.bg')` keeps pointing at `light.bg`. To have an inherited token read the inheriting scope's keys instead, write the ref relative (next section). To theme a whole system — override a root and have everything downstream follow, across every scope — compose layers (see [Themes: layering a whole book](#themes-layering-a-whole-book)).

Inherited tokens remain part of the dependency graph. If `dark.primary` currently resolves from `light.primary`, anything depending on `dark.primary` will continue to update when `light.primary` changes.

### Relative refs: `ref('.token')`

A key with a leading dot and no scope is relative: it reads that token in the scope that reads the ref. In the scope where it is written that is the same as the full key; in a scope that extends it, it is that scope's own key:

```typescript
const button = book.addScope('button');
button.set('bg', ref('brand.primary'));
button.set('fg', bestContrastWith(ref('.bg'), ref('brand')));
button.set('hover', shade(ref('.bg'), { amount: 0.1 }));

const danger = book.addScope('button-danger', { extends: 'button' });
danger.set('bg', ref('brand.error'));

book.resolve('button-danger.hover'); // shade of brand.error — fg and hover follow danger's own bg
book.resolve('button.hover');        // shade of brand.primary, unchanged
```

Override one root in the child and every inherited token that reads it relatively re-flows. That is the "abstract base scope, concrete variants" pattern: sibling variants that ship together in one stylesheet (`--button-hover` and `--button-danger-hover`). Layers cover whole-system variations that ship as alternative outputs.

- Relative keys work anywhere a key does: `ref()` tokens, function arguments, `not` lists, `sibling(ref('.g100'), 1)`, a member (`ref('.title.fontSize')`) and a changed style (`ref('.title', { … })`).
- Tokens keep the relative form as written. `scope.get(name)` returns the token **bound** to that scope (relative keys qualified, `ref('.bg')` read through `button-danger` is `ref('button-danger.bg')`); `scope.getRaw(name)` returns it as written. Renderers see bound tokens: a `ref('.bg')` read through `button-danger` is `var(--button-danger-bg)` in CSS and `{button-danger.bg}` in W3, and computed values (`--button-danger-hover`, `--button-danger-fg`) are written per scope.
- An inherited token with relative refs is **re-bound** (`book.isRebound('button-danger.hover')`): it gets graph edges of its own, to its scope's keys, so `watch()`, `change` events and dependents fire for it like for an own token.
- A cycle that exists only in an inheriting scope is caught at write time. With `danger.set('bg', ref('button-danger.hover'))` in place, writing `button.hover = shade(ref('.bg'))` throws a `CircularDependencyError` and is rolled back; so does a `delete` or an `addScope({ extends })` that would expose such a cycle.
- `book.resolve('.bg')` throws: a relative key needs a scope (`scope.resolve('bg')`). `copyScope` copies relative refs as written, so the copy reads its own keys.
- A pool can be relative too: `nth(ref('.'), 0)` is the first member of whichever scope reads the rule. See [Navigation](#navigation).

`addScope` validates the name and the inheritance chain and throws a
`ScopeError` rather than producing a book you cannot address: an empty or
whitespace-only name, a name containing `.` (the separator between scope and
token, so `resolve('a.b.x')` could never find the token), a scope extending
itself, and an `extends` chain that leads back to the new scope are all
rejected.

More scope helpers:

```typescript
book.extendScope('dark', 'light');     // same as addScope('dark', { extends: 'light' })
book.copyScope('light', 'print');      // a new scope with light's tokens (own and inherited) copied in, unlinked
book.deleteScope('print');             // returns the keys it removed
book.hasScope('dark');                 // true
book.getAllKeysForScope('dark');       // token names, inherited ones included
book.getScopeDependencies('ui');       // keys outside ui that ui's tokens read

dark.hasOwn('bg');                     // set on dark itself, not inherited
dark.ownKeys();                        // only dark's own keys, in insertion order
dark.allTokens();                      // { bg: <token>, text: <token>, … }, inherited included
```

## Navigation

Some functions find things by where they are rather than by what they are. Two kinds:

- **Addresses** say *where* to read: `ref`, `inherited`, `source`. They return a reference and never compute anything.
- **Positions** pick a member by its *place* in a scope and return its value: `nth`, `sibling`.

### Addresses: `ref`, `inherited`, `source`

A reference is a path. The number of segments says what it names, and a leading dot makes it relative to the scope that reads it:

| Reference | Names |
|---|---|
| `ref('palette')` | the scope `palette` |
| `ref('palette.blue')` | a token |
| `ref('type.title.fontSize')` | one field of a typography |
| `ref('.')` | the scope reading the token |
| `ref('.bg')`, `ref('.title.fontSize')` | a token or field in the reading scope |

A token or field reference is a value. A scope reference is a pool, the argument a selector searches: `bestContrastWith(ref('.bg'), ref('palette'))`. Each is only accepted where it fits — `ui.set('x', ref('palette'))` and `lighten(ref('.'))` throw ("names a scope"), and so does `mostVivid(ref('palette.blue'))` ("needs a scope to search"). Passing the scope object itself, `mostVivid(palette)`, still works: the constructor stores it as `ref('palette')`, so a function token is always plain data.

A token sits in **two trees**: its *scope* may extend another scope, and its *value* may refer to another token. Three words move through them, each only when you ask:

| | moves | one step | `'root'` |
|---|---|---|---|
| `inherited(ref, n?)` | up the scope tree (`extends`) | the parent scope's same key | the top scope's same key |
| `source(ref, n?)` | up the value tree (references) | the token it refers to | the token where the value is written |
| `refersTo(ref)` | down the value tree | the pool's members that refer to it, at any depth | — |

#### `inherited`: up the scope tree

`inherited` reads the same path further up the `extends` chain. It returns the same kind of reference it is given — a scope stays a scope, a token a token:

```typescript
const card     = book.addScope('card');
const inverted = book.addScope('card-inverted', { extends: 'card' });
const callout  = book.addScope('callout', { extends: 'card-inverted' });

inverted.set('border', inherited(ref('.surface')));            // card's surface
callout.set('corner',  inherited(ref('.radius'), 2));          // two levels up: card's radius
card.set('base',       inherited(ref('.surface'), 'root'));    // the root's surface, from anywhere in the chain
callout.set('pick',    lightest(inherited(ref('.'))));         // the lightest member of card-inverted

// Override a token in terms of the value it replaces — not a cycle:
callout.set('surface', lighten(inherited(ref('.surface')), { amount: 0.2 }));
```

- A relative reference counts from the scope that reads the rule, so an inherited rule re-binds: written on `card-inverted`, `inherited(ref('.surface'))` is card's surface; inherited by `callout`, it is card-inverted's. An absolute one counts from the scope it names: `inherited(ref('card-inverted.surface'))` is `card.surface` wherever it is read.
- If the parent does not declare the token itself, inheritance carries on upward — `inherited(ref('.x'))` is the value the scope would have if it had not overridden `x`.
- Only `extends` makes a parent. Reading from a scope (`ref('palette.white')`) does not.
- Past the top of the chain it throws (`"card" has no parent`, `"callout" has only 2 levels above it`); `'root'` on a scope that extends nothing is that scope. Levels are whole numbers of 1 or more, and `inherited(inherited(x))` is `inherited(x, 2)`.
- A reference that ends on its own key is a cycle and is rejected when written, as with `ref`.
- `sibling` and a changed scope take it too: `sibling(inherited(ref('.g100')), 1)` walks the parent's scope from its `g100`, and `inherited(ref('.title', { fontWeight: '700' }))` is the parent's title, changed, in place of the one this scope inherits.

#### `source`: back along the references

`source` follows a token's references: with `card.interaction = ref('blue.600')`, `source(ref('card.interaction'))` names `blue.600`. `source(ref, 2)` follows two references; `source(ref, 'root')` follows them to the token where the value is written — the first that is not a reference (a color, a size, or a function such as a selector, which is not looked through).

```typescript
// one hover rule, shared by themes whose interaction colors come from different ramps
button.set('hover', sibling(source(ref('.interaction'), 'root'), -2));
book.addScope('button-green', { extends: 'button' }).set('interaction', ref('green.500'));

// leave out whatever the accent ends up being
ui.set('text', bestContrastWith(ref('.bg'), ref('scale'), { not: [source(ref('.accent'), 'root')] }));
```

- It names a member, so it is read where a member is named: a `sibling` anchor or `toward` target, a `not` entry. As a value or inside a value argument it is refused (write the `ref` itself), and so is `source(ref('palette'))` — a scope has no references.
- Following more references than there are throws.
- With both, inheritance is read first: `source(inherited(ref('.interaction')), 'root')` is the inherited interaction, followed to its scale.
- The rule re-reads its start: re-point a reference on the way and the result follows.

#### `refersTo`: back down the references

`refersTo` is `source` the other way round. With `scale.900 = ref('brand.ink')`, `refersTo(ref('brand.ink'))` names `scale.900`: the member of the pool whose references lead to `brand.ink`, directly or through other references. Use it when the role is the readable name and the step that holds it is not:

```typescript
// leave out the ink step, whichever step that is
ui.set('text', bestContrastWith(ref('.bg'), ref('scale'), { not: [refersTo(ref('brand.ink'))] }));

// two steps lighter than the ink step, on the scale named
ui.set('ink-hover', sibling(refersTo(ref('brand.ink')), ref('scale'), -2));

// every step that ends where the accent's value is written
ui.set('muted', bestContrastWith(ref('.bg'), ref('scale'), { not: [refersTo(source(ref('.accent'), 'root'))] }));
```

- It is read against the scope the rule searches (the pool, or the scale a `sibling` walks), so a `sibling` anchor needs the scale named.
- A `not` entry leaves out every member it finds. A `sibling` anchor or `toward` target needs exactly one, and throws with the list when several refer to it ("scale.900, scale.950 in "scale" all refer to "brand.ink"; name one").
- Finding nothing throws, as any entry that names nothing does.
- Plain references only: a selector that picked the token does not refer to it.
- `source` and `inherited` are read first: `refersTo(source(…))`, `refersTo(inherited(…))`. `source(refersTo(…))` is refused.
- Like `source`, it names members; as a value it is refused.

### Positions: `nth`, `sibling`

These pick a member of a scope by its place in the scope's key order and return its value: `nth(ref('gray'), 0)` the first, `sibling(ref('gray.g100'), 1)` the next one after `g100`, `sibling(ref('.button'), ref('ramp'), 4, { toward: ref('.page') })` four steps along `ramp` toward the page. `sibling` walks its anchor's own scope unless you name one or use `source`. See [Index selection](#index-selection-require-a-scope-to-search) and [Relative steps](#relative-steps).

Picking by *value* is a different thing: `closest` and its aliases (`nextLarger`, `nextLighter` …) choose the nearest value up or down whatever order the scope is in — see [Comparisons](#comparisons-any-kind).

## Scope Ordering

A scope lists its keys in the order they were set, parents' keys first. Give
it an `order` and it sorts them instead. The order is not cosmetic: it is the
order of the CSS, JSON and W3 output, and it decides positions for `nth` and
`sibling`.

```typescript
const space = book.addScope('space', { order: [{ by: 'value' }] });
space.set('l', px(24));
space.set('xs', px(4));
space.set('m', px(16));
space.getAllKeys();               // ['xs', 'm', 'l']

palette.setOrder([{ by: 'value', direction: 'desc' }]);  // light → dark
nth(ref('palette'), 0);                  // the lightest, wherever it was set
palette.clearOrder();             // back to insertion order
```

An order is a list of criteria, tried in turn until one separates two keys:

| Criterion | Sorts by |
|---|---|
| `{ by: 'value', direction?, field? }` | the resolved value, within one type: dimensions by their number, strings alphabetically, colors dark → light along the smoothest path through the set ([colorsort-js](https://github.com/meodai/colorsort-js)); text styles by one field, `field` (font size unless given), the way that field's kind sorts |
| `{ by: 'name', direction? }` | the key, alphabetically |
| `{ by: 'type', priority? }` | the type: the ones listed in `priority` first, then the rest |

`direction` is `'asc'` (default) or `'desc'`. Refs and function tokens sort by
their resolved value, and tokens that cannot resolve go last. The order
updates when a value changes.

```typescript
// colors first, then everything else; alphabetical within each type
book.addScope('mixed', { order: [{ by: 'type', priority: ['color'] }, { by: 'name' }] });
```

A scope with no order of its own uses its parent's (`getEffectiveOrder()`;
`getOrder()` returns only its own). Dimensions compare by number alone, so
`16px` and `1rem` don't sort sensibly against each other: keep one unit per
ordered scope.

To sort a type of your own, or replace a built-in sort, register an orderer.
It receives every entry of that type at once and returns them in ascending
order:

```typescript
book.registerOrderer('string', (entries) =>
  [...entries].sort((a, b) => a.resolved.length - b.resolved.length));
// entries: { key, type, resolved, token }[]
```

## Groups: a key that holds a scope

Some things are several values at once: a text style (family, size, weight, line height), a button (background, text, border, per state). A key can hold a whole scope, a **group**, so such a thing is one entry you can:

- **offer as a set of variants** — a `typography` scope listing the text styles a design system has;
- **use exactly, elsewhere** — a card's heading *is* `typography.title`, and follows every change to it;
- **use with a change** — the card's heading as the title, only smaller.

A group is an ordinary scope. Its keys are ordinary keys (`typography.title.fontSize`), it can extend another scope, be a selector's pool and be sorted. A scope extending one that holds a group reads that same group.

### Named tables, listed and reused

```typescript
const title = book.addScope('typography-title', { kind: 'typography' });
title.set('fontFamily', ref('font.sans'));
title.set('fontSize', rem(2.4));
title.set('fontWeight', string('700'));

const typography = book.addScope('typography');     // a table listing the styles
typography.set('title', ref('typography-title'));    // an entry holding a scope

card.set('heading', ref('typography.title'));        // used through the list…
modal.set('heading', ref('typography-title'));       // …or directly
book.resolve('card.heading.fontSize');               // '2.4rem'
book.resolve('card.heading');                        // throws: a group has no single value; read a member
```

`kind: 'typography'` marks a scope as a text style. It changes nothing inside the book; outside it, a text style gets a CSS class next to its variables, is written as the W3 `typography` composite, and is measured by its `fontSize` in comparisons and sorts unless `by` / `field` names another member.

### Written in place

A group can also be written right at the key that holds it — the same thing, a scope, without a name of its own (its name is its path):

```typescript
button.set('hover', { bg: color('#12307f'), text: color('#ffffff') });   // a plain object is a group
type.set('title', typography({ fontSize: rem(2.4), lineHeight: 1.2, fontWeight: '700' }));
```

`typography({ … })` is shorthand for such a group of kind `typography`, so these two are the same text style:

```typescript
type.set('title', typography({ fontSize: rem(2.4), lineHeight: 1.2 }));

book.addScope('typography-title', { kind: 'typography' })   // named, then held by reference
  .set('fontSize', rem(2.4));
```

It also takes plain numbers and strings for fields (`lineHeight: 1.2`, `fontWeight: '700'`) instead of `dimension(1.2, '')` and `string('700')`.

### With a change: `ref(scope, { … })`

A reference to a scope with a second argument is that scope with those members changed: a group extending it. The members it does not set read the original, live; `null` leaves one out.

```typescript
card.set('heading', ref('typography-title', { fontSize: rem(1.8) }));
type.set('plain', ref('.title', { fontWeight: null }));
tablet.set('title', inherited(ref('.title', { fontSize: rem(2) })));   // the inherited style, smaller
```

A plain `ref('typography-title')` is the original itself; with changes it is a group of the key's own. A changed member replaces the original's whole (a nested group too). Like `typography()`, it takes plain numbers and strings for members.

To change a group in place — what a theme layer does — set its members:

```typescript
const dense = layer('dense', (book) => book.getScope('typography-title').set('fontSize', rem(2)));
```

### Output

```css
:root {
  --typography-title-font-family: var(--font-sans);
  --typography-title-font-size: 2.4rem;
  --card-heading-font-size: var(--typography-title-font-size);
  --type-hero-font-size: var(--type-title-font-size);    /* a changed style points at the original */
  /* … */
}
.card-heading {
  font-family: var(--card-heading-font-family);
  font-size: var(--card-heading-font-size);
  font-weight: var(--card-heading-font-weight);
}
```

Members render at their path (`--` and the path with dots as dashes); a group held by reference points at the original's variables, so the browser follows it. W3 nests groups; a text style is the `typography` composite, and a reference to one an alias. JSON writes each member at its path. Pass `classPrefix` to prefix the classes (`book.render('css-variables', { classPrefix: 't-' })` → `.t-card-heading`). In the SVG graph a group is a table like any scope, with a line from the key holding it.

## Rendering

A renderer is any function with the shape `(book, options?) => string`. Built-in names — `css-variables`, `json`, `w3-design-tokens`, `svg` — are pre-registered on every `DesignBook`, so:

```typescript
book.render('css-variables');
book.render('svg', { linksOnly: true });
```

The `svg` renderer draws every scope as a table and every reference as a line. Lines run in horizontal and vertical lanes round the tables (`routing: 'orthogonal'`, the default; `'curved'` draws one curve from dot to dot). Lines that meet at a token run together and split where they have to; unrelated lines keep their own lanes and only cross. Where two lines of one color cross, the horizontal one bridges the other (`bridges: true`, the default).

```typescript
book.render('svg', { routing: 'curved' });
book.render('svg', { bridges: false });
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

Other useful methods: `book.getRendererNames()`, `book.getRenderer(name)`. Registering the same name twice replaces the previous renderer. `useRenderer(name, fn)` registers one for every book; the built-in ones are registered that way when `design-book` is imported (not with `design-book/engine`).

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

Because the variation is a real book, computed tokens are recomputed for it: `ui.text = bestContrastWith(ref('surface.normal'), ref('brand'))` picks a new color for the dark surface, and `changedFrom` emits it. Tokens that only reference others (`var(--surface-normal)`) are left out — the cascade already updates them.

| Option (css-variables) | Meaning |
|---|---|
| `selector` | the rule to write into, default `:root` |
| `media` | wrap the output in `@media …` (combine with `selector` for "inverted on phones") |
| `scopes` | only these scopes (also for `json`) |
| `changedFrom` | only declarations that differ from another book (also for `json`, by resolved value) |
| `breakpoints` | name → media query, for scopes that carry `metadata.media` (below) |

Breakpoints usually belong in their own books, as above: the same variables, new values inside `@media`. With text styles built on a type scale, a breakpoint layer often only changes the scale (`layer('phone', { 'font-size': { xl: rem(2.4) } })`) and `changedFrom` writes just `--font-size-xl` — the text styles follow through `var()`.

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

A theme usually changes the roots of the tree — "our brand highlight is green", "our spacing is denser" — and everything downstream should follow, in every scope. Scope `extends` can't do that: an inherited token keeps pointing at the keys it was written against, and a [relative ref](#relative-refs-reftoken) only re-binds within the inheriting scope's own keys.

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

A layer is either a **function** `(book) => void` — free to add scopes with `extends`, set `typography()` tokens or change their members, register functions, build selectors over a scope, or delete tokens — or **data**, `{ scope: { token: <token> } }`. Data layers create scopes that don't exist yet, accept tokens only (a bare `'#fff'` throws, since it could be a color or a string), and clone their tokens on every apply, so one layer can go into many books.

`composeBook(name, layers, options?)` applies the layers in order, last one wins, and returns an ordinary book in `options.mode` (default `auto`). A layer that throws, or that would close a dependency cycle, stops the composition with a `LayerError` carrying `layerName`, `tokenKey` and the original error as `cause`. A ref to a key that a later layer adds is fine.

A composed book is live like any other. When a layer changes, compose again and diff:

```typescript
const next = composeBook('old-town', [system, oldTown]);
diffBooks(oldTownBook, next).changed; // what the edit moved
```

A token that must *not* follow a theme should point at a root that no theme overrides (`brand.highlight-fixed`), so the exception is visible in the token names.

**Layers or scope `extends`?** Use layers for a variation of the whole system — brand, theme, mode, density — that ships as an alternative output. Use scope `extends` with [relative refs](#relative-refs-reftoken) for variants that ship side by side in one book (`button` and `button-danger`). Use plain scope `extends` for two scopes in the *same* book that share members, such as a selector pool built on top of a palette.

## Events

```typescript
const dispose = book.on('tokenChanged', (e) => { /* e.detail.key, .cause, .value, .newValue, .oldValue */ });
book.on('change', (e) => { /* e.detail.changedKeys, e.detail.scopes */ });
book.on('scopeAdded', (e) => { /* e.detail.scope */ });
book.on('scopeRemoved', (e) => { /* e.detail.scope, e.detail.removedKeys */ });
book.on('batch-failed', (e) => { /* e.detail.processed, e.detail.errors, e.detail.rejected */ });
book.on('batch-complete', (e) => { /* e.detail.processed */ });
book.watch('brand.primary', (value, detail) => {
  // value is undefined when the token no longer resolves
  // detail is the tokenChanged payload
});
dispose();
```

`book.on()` and `book.watch()` both return unsubscribe functions.

`tokenChanged` has one shape wherever it comes from — a `set`, a `delete`, a `flush`, a deleted scope, a re-registered ramp set:

- `cause`: `'written'` when the token stored at `key` was set or deleted; `'dependent'` when it is unchanged but something it reads changed (a reference, a pool, a ramp set's masters).
- `newValue` / `oldValue`: the stored token now and before (`undefined` when there is none). For a dependent both are the same token.
- `value`: the resolved value now, `undefined` when it does not resolve.

Deleting a scope announces its keys and their dependents as one `change`.

**A write is checked before anyone hears of it.** A write the graph refuses (it would close a cycle) throws from `set()` / `delete()` and is never announced; the old token stays. That holds for writes made by listeners too: they are checked the moment the listener makes them, so a refused one throws to that listener, while the announcement of an accepted one waits until the change being announced is done.

**A listener that throws undoes nothing.** Every other listener still hears the change, the change completes, and then the call that made it (`set()`, `delete()`, `flush()`, `deleteScope()`, …) throws the first listener error.

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

When the value *is* a member a selector picked, `picked` names it:
`nth(ref('gray'), 1)` → `picked: 'gray.g100'`, also through a `ref()` to the
selector. Two members with the same value are told apart, so a tool can link
the exact token. It is absent when the value is computed from the pick
(`lighten(mostVivid(…))`).

## Batch Mode

```typescript
book.mode = 'batch';
brand.set('primary', color('#ff0000'));
brand.set('secondary', color('#00ff00'));
const result = book.flush(); // { processed: [...], errors: [...], rejected: [...] }
book.mode = 'auto';
```

Switching out of batch mode with writes still queued flushes them: anything
left in the queue would otherwise sit unpropagated until some later,
unrelated `flush()`. Setting `mode = 'auto'` after the explicit `flush()`
above is therefore a no-op; drop the `flush()` and the mode switch does it.
`flush()` never throws — it collects errors and fires `batch-failed`. `rejected` lists the keys whose queued change it refused and undid (a write closing a cycle); the other errors are keys that cannot resolve yet, such as a reference to a token not written yet, which stay queued.

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
scope-iterating selector is not one: `ui.text = bestContrastWith(ref('ui.bg'), ref('ui'))`
lists `ui.bg` as a prerequisite, but not the other members of `ui` it
chooses between. The book tracks pools in a separate index, so a change to
any member of an iterated scope — added, changed, deleted, inherited through
`extends` — still notifies the selector, while a pool member that is itself
derived from the selector (`ui.muted = lighten(ref('ui.text'))`) is not a
cycle and is accepted.

## Editor

Run `npm run dev` to start the interactive editor. Features:

- CodeMirror 6 with context-aware autocomplete (the current scope's own keys first, as relative `ref('.token')`)
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

If you prefer a ramp-oriented workflow, RampenSau is a good fit for generating a light-to-dark sequence first and then mapping roles onto it. With `nth` you can address ramp stops by position — `nth(ref('ramp'), 0)` is the lightest, `nth(ref('ramp'), -1)` is the darkest — so the semantic layer stays correct even when the number of stops changes.

### 2. Store those colors as primitives

```typescript
import {
  DesignBook, color, ref, nameValues,
  bestContrastWith, closest, colorMix, nth,
} from 'design-book';

const book = new DesignBook('workflow');

const primitive = book.addScope('primitive');

// seven blues from step 1, lightest → darkest
const blues = ['#e8f1fd', '#b9d4fa', '#7fb0f5', '#2f80ed', '#1f5f8b', '#163f63', '#102a43'];
for (const [name, hex] of nameValues(blues, 'hundreds', { prefix: 'blue-' })) {
  primitive.set(name, color(hex));
}
// → blue-50, blue-200, blue-300, blue-500, blue-700, blue-800, blue-950

primitive.set('mint-300', color('#7ad9b6'));
primitive.set('sand-100', color('#f6efe7'));
primitive.set('ink-900', color('#111111'));
primitive.set('white', color('#ffffff'));
```

In a real pipeline, those values come from Poline, RampenSau, or another color-generation step rather than being typed by hand. Generated shades still need keys. [`nameValues`](#naming-primitives) gives them the names of a familiar convention, spread evenly over however many shades the generator returns. Any odd count keeps `blue-500` on the middle shade, so a semantic token that refers to it survives a regenerated ramp.

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

semantic.set('text', bestContrastWith(ref('semantic.surface'), ref('primitive')));
semantic.set('text-on-accent', bestContrastWith(ref('semantic.surface-accent'), ref('primitive')));
semantic.set('border-subtle', closest(ref('semantic.surface'), ref('primitive'), {
  not: ['primitive.sand-100'],   // the surface itself
}));
semantic.set('focus-ring', ref('primitive.mint-300'));
```

When your primitives come from a ramp generator, `nth` lets you pin roles to positions instead of names. Regenerate the ramp with more or fewer stops, and the semantic layer adapts:

```typescript
// ramp = scope with N generated shades, lightest → darkest
semantic.set('surface',     nth(ref('ramp'), 0));      // always the lightest
semantic.set('text',        nth(ref('ramp'), -1));     // always the darkest
semantic.set('muted',       nth(ref('ramp'), 0.5));    // the midtone
semantic.set('subtle-bg',   nth(ref('ramp'), 0.1));    // just off white
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

## API Reference

Everything exported from `design-book`, grouped. The sections above show how
they fit together.

**Book and scopes.** `DesignBook`: `addScope`, `extendScope`, `copyScope`, `deleteScope`, `getScope`, `hasScope`, `getAllScopes`, `getAllKeysForScope`, `getScopeDependencies`, `resolve`, `has`, `getTokenByKey`, `inspect`, `getSourceKey`, `isInherited`, `isRebound`, `on`, `watch`, `mode`, `flush`, `batchQueueSize`, `registerFunction`, `getFunction`, `registerOrderer`, `getOrderer`, `registerRenderer`, `render`, `getRendererNames`, `getDependencyGraph`. `Scope`: `set`, `get`, `getRaw`, `resolve`, `delete`, `has`, `hasOwn`, `isInherited`, `getSourceKey`, `getAllKeys`, `ownKeys`, `allTokens`, `setOrder`, `clearOrder`, `getOrder`, `getEffectiveOrder`, `metadata`.

**Token constructors.** `color`, `ref`, `px`, `rem`, `ms`, `dimension`, `string`, `val`, `createFunctionToken`.

**Navigation.** `inherited(reference, levels? | 'root')`: the same reference further up the `extends` chain. `source(reference, hops? | 'root')`: the token a reference refers to, along its references. `refersTo(reference)`: the members of the pool that refer to it. Both are read as a `sibling` anchor, a `toward` target or a `not` entry.

**Functions.**
- Comparisons (any kind): `closest` with the aliases `nextLarger`, `nextSmaller`, `nextLighter`, `nextDarker`; `bestContrastWith`, `minContrastWith`, `furthestFrom`, `lightest`, `darkest`, `largest`, `smallest`
- Color only: `mostVivid`, `leastVivid`
- Color transforms: `colorMix`, `lighten`, `darken`, `shade`, `relativeTo`, `withAlpha`
- Positions: `nth`, `sibling`, `random`
- Scales: `spacingScale`, `typographyScale`, `timing`
- Typography: `typography`

**Groups**, for custom renderers and tooling: `isGroupValue(token)`; a group is a scope, so `book.getScope('type.title')` gives its members (`getAllKeys()`, `getKind()`, `holderName`), and `book.groupValueOf(path)` writes one back out as data.

**Themes and variations.** `layer`, `composeBook`, `layerOf`, `keysFromLayer`, `diffBooks`.

**Naming** (also `design-book/naming`). `nameValues`, `scaleNames`, `nameBetween`, `namingScheme`, `schemes`.

**Rendering.** `Renderer`, `SVGRenderer`, `TableViewRenderer`, `useRenderer`. Not in `design-book/engine`, which has everything else.

**Errors.** `TokenError` (bad keys or values, unknown tokens), `ScopeError` (bad scope names or inheritance), `CircularDependencyError` (with `path`), `FunctionError` (invalid function arguments), `LayerError` (`layerName`, `tokenKey`, `cause`).

**For custom functions.** Type guards `isReferenceValue`, `isTokenValue`, `isScopeReference`, `isMemberReference`; `toMember(key | ref)` for a member slot; `pick(scope, key)` and `book.pickOf(key)`; `registerFunction(name, impl, { scopesRead })`.

**Internals** (`design-book/internals`), for tools built on the book — the editor, renderers, inspectors. They follow the engine rather than a stable contract:
- Keys: `tokenKeyOf('type.title.fontSize')` returns `'type.title'`; `isFieldKey(key)`; `isScopeKey('palette')`; `isRelativeKey('.bg')`, `qualifyKey('.bg', 'button')` returns `'button.bg'`
- Binding: `hasRelativeKeys(token)` (reads depend on the reading scope), `needsBinding(token)` (relative or navigated); `bindToken(token, scope, context)` returns the token as `scope` reads it
- Dependencies: `functionDependencies(fn)`, `extractDependencies(args)`, `extractIteratedScopes(args)`, `iteratedScopesOf(fn)`
- `getTokenProcessors(token)`, `DependencyGraph`, `registerBuiltinFunctions`

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

```
         _______________________________ ______________________________
        / ____  ___________ __________  V ______  ____  ____  __ __   /\
       / / __ \/ ____/ ___//  _/ ____/ | / / __ )/ __ \/ __ \/ //_/  / /
      / / / / / __/  \__ \ / // / __/  |/ / __  / / / / / / / ,<    / /
     / / /_/ / /___ ___/ // // /_/ / /|  / /_/ / /_/ / /_/ / /| |  / /
    / /_____/_____//____/___/\____/_/ |_/_____/\____/\____/_/ |_| / /
   /_____________________________   _____________________________/ /
   \_____________________________\ /______________________________/
                                  V
```
