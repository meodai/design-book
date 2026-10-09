---
name: design-book
description: Migrate or retrofit a static design system onto Design Book — a reactive design-token framework with refs, derived values, and procedural rules. Use when the user wants to convert existing CSS variables, Tailwind/Sass/Less variables, a design-tokens.json file, a TypeScript theme object, or Figma variables and text styles into Design Book scopes; or asks "how do I model X in design-book?". Also use for "import figma tokens", "tokenise this theme", "build a design-book from this CSS".
---

# Design Book migration skill

Design Book is a reactive design-token framework. Tokens hold a value, a
reference to another token, or a rule that computes a value from inputs.
The migration goal is to turn a static set of tokens (hex codes, lengths,
named colors) into a graph that re-evaluates when any input changes —
without producing 17,000 redundant component-level tokens along the way.

This skill is the practical workflow for that migration. It works for any
source format (CSS vars, JSON tokens, Tailwind config, Figma variables, …)
and includes a Figma-specific path that uses MCP if available, REST API
otherwise.

---

## Quick refresher: the three token layers

Every Design Book token sits on one of three layers. Naming follows the
layer; mixing layers is the most common mistake.

1. **Values** — atoms. Descriptive names that describe *what the value is*,
   not what it means. `values.gray-800`, `values.blue-500`, `space.16`.
   Hex codes, raw lengths, raw strings.

2. **References** — semantic names that point at a value (or another
   reference). `color.brand = ref('values.gray-800')`,
   `color.text = ref('color.on-surface')`. Refs chain.

3. **Procedural / function tokens** — rules. Read inputs, compute output.
   `darken(ref('color.brand'), { amount: 0.15 })`,
   `bestContrastWith(ref('color.surface'), values)`,
   `nth(values, -1)`.

Rule of thumb: a value token *never* gets a semantic name. Calling one
`values.brand` smuggles a decision into a layer that's supposed to be
opinion-free.

Keys: every key is fully qualified (`'scope.token'`). Token names may use
ASCII letters, digits, `-` and `_` (they become CSS custom-property names);
`.`, spaces and other punctuation throw.

---

## Workflow

### 1. Discover

Inventory every static token in the source. Search for, depending on the
input:

- **CSS / SCSS / LESS**: `:root { --… : … }`, `$variable: …`, `@variable: …`,
  plus `@media` blocks that redefine variables (breakpoints) and
  `[data-theme]` / `.dark` blocks (themes)
- **JSON design tokens**: `*.tokens.json`, `tokens/*.json`, files matching the
  W3C draft format (`{ "$value": …, "$type": … }`)
- **Tailwind**: `tailwind.config.{js,ts}` `theme` and `theme.extend`
- **TypeScript theme objects**: const exports with color/spacing maps
- **Figma**: see the Figma section below

Record name + value + (if available) any description, type hint, or
reference target, and which theme / mode / breakpoint it belongs to. Don't
transform yet.

### 2. Group by domain

Bucket every entry by domain:

- color
- spacing / dimension
- typography: primitives (font family, size, weight, line height) and
  **text styles** (a heading or body style that bundles several of them)
- radius / corner
- motion / timing / easing
- shadow / elevation
- string (content, icon-role, asset URL, …)

A single Design Book scope per domain is a sensible default
(`color`, `space`, `font-size`, `type`, `radius`, `motion`, …).

### 3. Identify the value layer

For each entry, decide: is it a unique raw material, or does it duplicate
an existing one?

- **Color**: two `#0066cc` entries collapse into one `values.blue-500`. Pull
  every distinct hex into a `values` scope with descriptive names.
- **Dimensions**: separate base units from multiples. `8px`, `16px`, `24px`,
  `32px` → either four values, or one base + three multiples.
- **Strings**: deduplicate.

Name the values with the naming helpers instead of inventing names. They
only produce keys, never values, and are also published dependency-free as
`design-book/naming`:

```typescript
import { nameValues, scaleNames } from 'design-book';

// shades sorted lightest → darkest
for (const [name, hex] of nameValues(blues, 'hundreds', { prefix: 'blue-' })) {
  values.set(name, color(hex));
}
// 7 shades → blue-50 blue-200 blue-300 blue-500 blue-700 blue-800 blue-950

scaleNames(5, 'tshirt');                       // xs s m l xl
nameValues([4, 8, 12, 16, 24], 'value');       // keys 4 8 12 16 24 — each named by its own number
```

Schemes: `hundreds` (50…950), `tshirt`, `ordinal`, `tones` (0…100),
`intensity`, `weights`, `dynamics`, `greek`, `roman`, `value`, and more;
`namingScheme(names)` turns the source's own vocabulary into one. Any odd
count keeps `500` (`hundreds`) or `m` (`tshirt`) on the middle value. If the
source already has established names that CSS or components depend on,
keep them — `nameBetween('100', '200', 'hundreds')` → `'150'` inserts a step
without renaming the others.

### 4. Identify the semantic layer

For each entry that carries a *role* (`button-bg`, `link-color`, `text`,
`heading-size`, `gutter`, …), create a reference token pointing at the
value-layer entry it should resolve to.

```typescript
colorScope.set('brand',       ref('values.gray-800'));
colorScope.set('surface',     ref('values.gray-50'));
colorScope.set('on-surface',  ref('values.gray-900'));  // pair token
colorScope.set('text',        ref('color.on-surface')); // refs can chain
colorScope.set('interaction', ref('values.blue-500'));
```

Watch for **pair tokens** — two tokens that always travel together. The
classic is `surface` / `on-surface` (background + paired text). The same
pattern shows up wherever something sits on something else
(`button` / `on-button`, `card` / `on-card`). Name the pair, encode it as
two refs.

When roles map to *positions* in a generated ramp ("the lightest", "the
darkest", "one step darker than the button"), use positional selectors
instead of names, so the semantic layer survives a regenerated ramp with a
different number of stops:

```typescript
colorScope.set('surface', nth(values, 0));      // first member
colorScope.set('text',    nth(values, -1));     // last member
colorScope.set('muted',   nth(values, 0.7));    // 70% of the way along
colorScope.set('button-hover', sibling(ref('values.blue-500'), 1)); // next member
```

Positions follow the scope's key order: insertion order, or the order set
with `addScope(name, { order: [{ by: 'value' }] })` (colors sort dark →
light, dimensions by number; `direction: 'desc'` reverses).

### 5. Identify rules (procedural tokens)

Look at the *static* system for places where it pre-computed values it
didn't need to. Each one is a candidate for a procedural token. Built-in
functions mix or pick existing tokens; they don't invent new primitives.

| Static pattern | Procedural replacement |
| --- | --- |
| `--hover: <darker version of base>` | `darken(ref('color.brand'), { amount: 0.15 })` |
| `--press: <even darker>` | `darken(ref('color.brand'), { amount: 0.3 })` |
| `--button-text: white` / `black` chosen by hand | `bestContrastWith(ref('color.brand'), values)` |
| `--border: <faint shade>` | `minContrastWith(ref('color.surface'), values, { ratio: 1.5 })` |
| `--border: <the nearest shade to the surface>` | `closestColor(ref('color.surface'), values, { not: ['values.gray-50'] })` |
| `--accent: <one of the brand colors>` | `mostVivid(values, { readableOn: ref('color.surface'), not: [ref('values.error')] })` |
| `--text: <darkest readable gray>` | `darkest(grays, { readableOn: ref('color.surface') })` (`lightest` for the opposite) |
| `--ramp-100…900`: hand-mixed steps | `colorMix(ref('color.surface'), ref('color.interaction'), { ratio })` per step |
| `--button-hover`: the next stop of the ramp | `sibling(ref('values.blue-500'), 1)` |
| `--space-sm/md/lg/xl`: multiples of a base | `spacingScale(ref('space.base'), { multiplier })` |
| `--gap-loose`: the next size up from another | `nextLarger(ref('space.m'), space)` / `nextSmaller` |
| `--font-h1/h2/h3`: modular scale | `typographyScale(ref('font-size.base'), { ratio, step })` |
| `--h1-font`, `--h1-size`, `--h1-weight` that travel together | one `typography({ fontFamily, fontSize, fontWeight, … })` token (see below) |
| Surface-aware shade ("slightly darker if light, lighter if dark") | `shade(ref('color.surface'), { amount: 0.1 })` |
| Hue rotation / per-channel tweak | `relativeTo(base, 'oklch', [null, null, '+180'])` |
| `--transition: 200ms ease-out` | `timing(ref('motion.base'), 'ease-out')` |

`readableOn` (with `minContrast`, default 4.5) filters any color selector's
pool to colors readable on a backdrop before ranking; if none qualify, it
throws instead of returning an unreadable color. `not` excludes keys from
any scope-iterating function.

**Don't over-procedural-ise.** If a value isn't related to anything else,
leave it as a value or a ref. Procedural tokens are for relationships,
not decoration.

Function tokens can be nested, so an inline `colorMix(shade(ref('color.surface'), { amount: 0.1 }), ref('color.interaction'), { ratio: 0.5 })`
is fine — no need to invent intermediate tokens.

### 6. Text styles: `typography()`

A text style (a Figma text style, a `.heading-1` class, a group of
`--h1-*` variables) is **one token**, the W3 `typography` composite. Fields
can hold refs to primitives, so changing `font-size.xl` updates every style
that uses it:

```typescript
type.set('body',  typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.md'), lineHeight: 1.5 }));
type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.xl'), fontWeight: '700' }));

// a style that differs in a few fields: a live variant of another
type.set('hero', variant(ref('type.title'), { fontWeight: '800' }));  // null drops a field

// one field of a style
callout.set('size', ref('type.title.fontSize'));
```

CSS output gets one variable per field (`--type-title-font-size`) plus a
`.type-title` class; a variant's unchanged fields render as `var()` of its
base's.

### 7. Themes, modes and breakpoints: books and layers

Every variation — light / dark, brand B, dense mode, a breakpoint — is a
**separate book built from the same layers**. Write the base system as one
layer and each variation as a layer that holds **only its differences**,
then compose a book per variation. Later layers win, and because they write
into the same book, overriding a root re-flows every ref and function token
downstream:

```typescript
import { layer, composeBook, keysFromLayer } from 'design-book';

const base = layer('base', (book) => {
  book.addScope('surface').set('bg', color('#ffffff'));
  book.addScope('ink').set('text', color('#1a1a1a'));
  book.addScope('ui').set('text', ref('ink.text'));
  // … the whole system, as above …
});
const dark = layer('dark', {
  surface: { bg: color('#1a1a1a') },
  ink: { text: color('#ffffff') },
});

const light = composeBook('light', [base]);
const darkBook = composeBook('dark', [base, dark]);   // ui.text follows ink.text
const css = [
  light.render('css-variables'),
  darkBook.render('css-variables', { selector: '[data-theme="dark"]', changedFrom: light }),
].join('\n\n');
keysFromLayer(darkBook, 'dark'); // exactly what the dark theme changes
```

`changedFrom` writes only the declarations whose rendered text differs from
the other book, so the dark block holds just the overrides; `var()`
references are inherited by the cascade.

Breakpoints work the same way, with `media` instead of `selector`. With
text styles built on a type scale, a breakpoint layer usually only changes
the scale:

```typescript
const phone = layer('phone', { 'font-size': { xl: rem(2.4) } });
const phoneBook = composeBook('phone', [base, phone]);
phoneBook.render('css-variables', { media: '(max-width: 620px)', changedFrom: light });
// → @media (max-width: 620px) { :root { --font-size-xl: 2.4rem; } }
```

To change one field of a style in a layer, pass the **token** (not a ref)
to `variant` — a token cannot ref the value it replaces:

```typescript
const tablet = layer('tablet', (book) => {
  book.getScope('type').set('title', variant(book.getTokenByKey('type.title'), { fontSize: rem(3.2) }));
});
```

Sub-brands are just longer stacks — a store chain's system, one store,
and that store's café corner: `composeBook('old-town-cafe', [system, oldTown, cafe])`.
Use a function layer when a variation needs `addScope`, selectors over a
scope, or deletions; data layers (`{ scope: { key: token } }`) cover plain
overrides and create missing scopes.

Don't model themes or breakpoints as scopes that `extend` each other: an
inherited `ref('brand.x')` keeps reading the base `brand`, so a theme's root
overrides never reach the tokens derived from them. Scope `extends` is for
sharing members between scopes of one book.

### 8. Generate the Design Book code

A typical migration produces something like:

```typescript
import {
  DesignBook, color, ref, px, rem, string, nameValues,
  darken, colorMix, bestContrastWith, minContrastWith,
  spacingScale, typography, variant,
} from 'design-book';

const book = new DesignBook('app');

// ---- values (atoms) ---------------------------------------------------
const values = book.addScope('values');
for (const [name, hex] of nameValues(grays, 'hundreds', { prefix: 'gray-' })) {
  values.set(name, color(hex));
}
values.set('blue-500', color('#1d4eb8'));
values.set('red-500',  color('#dc2626'));

// ---- color (semantic refs) -------------------------------------------
const colorScope = book.addScope('color');
colorScope.set('surface',     ref('values.gray-50'));
colorScope.set('on-surface',  ref('values.gray-950'));
colorScope.set('brand',       ref('values.gray-800'));
colorScope.set('interaction', ref('values.blue-500'));
colorScope.set('text',        ref('color.on-surface'));

// ---- procedural -------------------------------------------------------
colorScope.set('link-hover', darken(ref('color.interaction'), { amount: 0.15 }));
colorScope.set('line',       minContrastWith(ref('color.surface'), values, { ratio: 1.5 }));
colorScope.set('on-brand',   bestContrastWith(ref('color.brand'), values, {
  not: [ref('values.red-500')], // exclude role-loaded tokens
}));

// ---- space ------------------------------------------------------------
const space = book.addScope('space');
space.set('base', px(16));
space.set('s',    spacingScale(ref('space.base'), { multiplier: 0.5 }));
space.set('m',    spacingScale(ref('space.base'), { multiplier: 1 }));
space.set('l',    spacingScale(ref('space.base'), { multiplier: 1.5 }));

// ---- typography -------------------------------------------------------
book.addScope('font').set('sans', string('"Inter", system-ui, sans-serif'));
const size = book.addScope('font-size');
size.set('md', rem(1));
size.set('xl', rem(2));

const type = book.addScope('type');
type.set('body',  typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.md'), lineHeight: 1.5 }));
type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: ref('font-size.xl'), fontWeight: '700' }));
type.set('hero',  variant(ref('type.title'), { fontWeight: '800' }));
```

Wrap it in `layer('base', (book) => { … })` as soon as the system has a
second theme or breakpoint (step 7).

### 9. Verify

Diff the output against the original.

```typescript
import { TableViewRenderer, diffBooks } from 'design-book';

book.render('css-variables');          // compare against the original :root block
book.render('w3-design-tokens');       // or against a tokens.json source
new TableViewRenderer(book).render();  // every token + dependency in one HTML table

book.inspect('color.link-hover');
// { value, tokenType, function, args, options, dependencies, dependents, … }

diffBooks(light, darkBook);            // { changed, added, removed } by resolved value
```

Loop through the original token list and check that every entry has a
counterpart in the rendered output. For themes, `diffBooks` / `keysFromLayer`
should list exactly the tokens the source changed per theme. If something
doesn't match, the most common causes:

- A "rule" candidate was modelled as a value/ref instead of a function.
- A ref points at the wrong key (typo in the qualified name).
- A multi-mode theme was modelled with scope `extends` instead of layers, so
  root overrides never reach the derived tokens.
- A positional selector (`nth`, `sibling`) reads a scope whose key order
  isn't the order you assumed — set an `order` on the scope.

---

## Figma-specific path

Figma stores its design tokens as **variables**, organised into
**collections** with **modes** (e.g. Light / Dark), plus **text styles**.
Variables can be primitives or *aliases* (a reference to another variable).
This maps cleanly onto Design Book: variables → tokens, collections →
scopes, aliases → `ref()`, the default mode → the base layer, every other
mode → a layer of its differences, text styles → `typography()` tokens.

### Source: Figma Dev Mode MCP server (preferred)

If the user has the Figma Dev Mode MCP server configured, prefer it —
no token shuffling, no rate limits, works on locked files.

1. Check the available MCP tools for Figma. Look for verbs like
   `get_variables`, `list_collections`, `get_file`, or similar. If Figma's
   MCP is present, the tool names will include `figma` or be prefixed
   accordingly.
2. Call the relevant MCP tool to fetch local variables for the file the
   user has open in Figma.
3. Walk the response (see "Figma response shape" below) and apply the
   workflow steps 2–8.

If you can't find a Figma MCP tool, fall back to the REST API path.

### Source: Figma REST API (fallback)

Requires a Figma personal access token with `file_variables:read` scope.

```bash
curl -H "X-Figma-Token: $FIGMA_TOKEN" \
  https://api.figma.com/v1/files/$FILE_KEY/variables/local
```

The `$FILE_KEY` is the part of the Figma URL after `/file/` or `/design/`.

**Don't read the token from anywhere on disk.** If the user doesn't have
`FIGMA_TOKEN` in their environment, ask them to provide it inline for the
session, then proceed.

### Figma response shape

The relevant pieces of the response:

```json
{
  "meta": {
    "variables": {
      "VariableID:1:23": {
        "id": "VariableID:1:23",
        "name": "color/brand/primary",
        "resolvedType": "COLOR",
        "valuesByMode": {
          "1:0": { "r": 0.0, "g": 0.4, "b": 0.8, "a": 1.0 },
          "1:1": { "type": "VARIABLE_ALIAS", "id": "VariableID:1:42" }
        }
      }
    },
    "variableCollections": {
      "VariableCollectionId:1:0": {
        "name": "Theme",
        "modes": [
          { "modeId": "1:0", "name": "Light" },
          { "modeId": "1:1", "name": "Dark" }
        ],
        "defaultModeId": "1:0",
        "variableIds": [ "VariableID:1:23", ... ]
      }
    }
  }
}
```

Notable fields:

- `resolvedType` is one of `COLOR | FLOAT | STRING | BOOLEAN`.
- A variable holds one value per mode. Aliases use
  `{ "type": "VARIABLE_ALIAS", "id": "VariableID:…" }`.
- Variable names follow `path/segments/like/this`. Slashes are Figma's
  group separator; map them to dotted Design Book keys via the rules
  below.

### Figma → Design Book mapping

**Names** — convert `color/brand/primary` to a flat `<scope>.<token>`
qualified key. The first segment usually becomes the scope; join the rest
with `-` (a valid key character that matches the CSS output):

- `color/brand/primary` → `color.brand-primary`
- `space/m` → `space.m`
- `radius/lg` → `radius.lg`

If the file uses multi-level paths like `color/button/background`, decide
whether to (a) flatten (`color.button-background`), (b) create a new scope
(`button.background`), or (c) leave it in `color` for now. Ask if unsure.
Spaces and other punctuation in Figma names must be replaced (`Brand
Primary` → `brand-primary`); keys that contain them throw.

**Types** —

| Figma `resolvedType` | Design Book |
| --- | --- |
| `COLOR` | `color('#rrggbb')` — convert `r,g,b,a` floats (0–1) to hex (8 digits when `a < 1`). |
| `FLOAT` (used as a size) | `px(value)` (or `rem`/`ms` if name implies it) |
| `FLOAT` (used as a multiplier or a unitless line height) | `dimension(value, '')`, or skip and pull into a function option |
| `STRING` | `string('…')` |
| `BOOLEAN` | encode as `string('true')` / `string('false')`; Design Book doesn't model booleans natively |

To convert a Figma RGBA float to hex:

```typescript
function rgbaToHex({ r, g, b, a = 1 }: { r: number; g: number; b: number; a?: number }) {
  const to = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}${a < 1 ? to(a) : ''}`;
}
```

**Aliases** —

```jsonc
"valuesByMode": {
  "1:0": { "type": "VARIABLE_ALIAS", "id": "VariableID:1:42" }
}
```

Look up `VariableID:1:42` in `meta.variables`, find its qualified key, and
emit `ref('that.key')`.

**Modes** — the default mode is the base layer; every other mode is a data
layer holding only the variables whose value differs from the default:

```typescript
const base = layer('base', (book) => { /* every variable, default-mode value */ });

const darkData = {};   // { scope: { token: value } }
for each variable:
  if valuesByMode[darkModeId] differs from valuesByMode[defaultModeId]:
    darkData[scope][token] = <dark value or ref(…)>
const dark = layer('dark', darkData);

const lightBook = composeBook('light', [base]);
const darkBook  = composeBook('dark',  [base, dark]);
darkBook.render('css-variables', { selector: '[data-theme="dark"]', changedFrom: lightBook });
```

Aliases in a mode stay refs in its layer, so a dark-mode alias to
`values.gray-900` is `ref('values.gray-900')` in `darkData`.

**Text styles** — each Figma text style becomes a `typography()` token.
Point its fields at the matching variables when the style is bound to them
(`fontSize: ref('font-size.xl')`), otherwise use the literal values. Styles
that differ from another only in a few properties (`Heading/Bold` vs
`Heading/Regular`) can be `variant(ref('type.heading'), { fontWeight: '700' })`.

### Detecting procedural intent in Figma data

Figma doesn't store rules. But naming conventions usually leak them:

- Pairs like `color/button/bg` + `color/button/text` → consider
  `bestContrastWith(ref('color.button-bg'), values)` instead of a fixed text color.
- Sequences like `color/brand/100, 200, …, 900` → likely a colorMix ramp.
  Check the colors: are they perceptually-spaced steps? Replace with
  `colorMix(anchor, anchor2, { ratio })` per step. If the ramp stays a set
  of primitives, address roles in it with `nth` / `sibling` instead.
- States like `color/brand/hover`, `color/brand/pressed`, `color/brand/disabled`
  with progressive darkness → `darken(ref('color.brand'), { amount: 0.1/0.2/0.4 })`,
  or `sibling(ref('values.brand-500'), 1/2)` when they are ramp stops.
- Spacing `4, 8, 16, 24, 32, 48` → `spacingScale` with multiplier
  `0.25, 0.5, 1, 1.5, 2, 3` of base `16`.
- Font-size sequences in geometric ratios → `typographyScale`.

After the literal import, *ask the user* which patterns to convert from
static to procedural. Show the candidates, let them confirm before
rewriting.

---

## Verification checklist (Figma path)

After importing:

1. `book.getAllScopes()` covers every collection that had variables.
2. `book.inspect(key)` resolves every imported key to a value (no `null`).
3. `keysFromLayer(darkBook, 'dark')` lists exactly the variables whose Dark
   value differs from the default mode.
4. Aliases produce graph edges:
   `book.inspect('color.button-text').dependencies` is non-empty when that
   variable was an alias in Figma.
5. The rendered CSS variables for the default mode visually match
   exporting "CSS variables" from Figma Dev Mode for the same file.

---

## Common pitfalls

- **Premature procedural-ising.** If only one place reads a value, a plain
  ref is fine. Procedural tokens shine when the relationship is the
  point.
- **Smuggling semantics into the value layer.** `values.brand` is a code
  smell. The value layer holds material; the role goes in `color`.
- **Forgetting `not` on `mostVivid` / `bestContrastWith` / `closestColor` / etc.**
  Without `not: [ref('values.error')]`, the procedural accent often lands
  on the red error color (highest chroma), and `closestColor` of a surface
  returns the surface itself.
- **Re-creating tokens on Figma sync instead of mutating.** `scope.set` on
  an existing key updates the value and keeps its dependents.
- **Themes or breakpoints as `extends` scopes.** Use layers and one book per
  variation (step 7); render with `selector` / `media` and `changedFrom`.
- **Text styles as loose variables.** `--h1-size`, `--h1-weight`,
  `--h1-line-height` that always travel together belong in one
  `typography()` token.

---

## Need a function the built-ins don't cover?

Register a custom function:

```typescript
import { createFunctionToken } from 'design-book';

book.registerFunction('myCustom', (resolvedInput: string, options?: { factor?: number }) => {
  // Return a CSS-valid string.
  return /* … */;
});

function myCustom(base, options) {
  return createFunctionToken('myCustom', [base], {
    options: { factor: options?.factor ?? 1 },
    metadata: { returnType: 'color' },
  });
}
```

Then use it like any built-in. Refs in the args become graph edges
automatically, so custom functions nest, re-evaluate when their inputs
change, and round-trip through renderers (CSS output falls back to the
resolved string unless you also register a
`renderer.registerFunctionRenderer(name, fn)`).
