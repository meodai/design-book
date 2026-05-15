---
name: design-book
description: Migrate or retrofit a static design system onto Design Book — a reactive design-token framework with refs, derived values, and procedural rules. Use when the user wants to convert existing CSS variables, Tailwind/Sass/Less variables, a design-tokens.json file, a TypeScript theme object, or Figma variables into Design Book scopes; or asks "how do I model X in design-book?". Also use for "import figma tokens", "tokenise this theme", "build a design-book from this CSS".
---

# Design Book migration skill

Design Book is a reactive design-token framework. Tokens hold a value, a
reference to another token, or a rule that computes a value from inputs.
The migration goal is to turn a static set of tokens (hex codes, lengths,
named colours) into a graph that re-evaluates when any input changes —
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
   not what it means. `values.gray800`, `values.blue500`, `values.dim16`.
   Hex codes, raw lengths, raw strings.

2. **References** — semantic names that point at a value (or another
   reference). `color.brand = ref('values.gray800')`,
   `color.text = ref('color.onSurface')`. Refs chain.

3. **Procedural / function tokens** — rules. Read inputs, compute output.
   `darken(color.brand, { amount: 0.15 })`,
   `bestContrastWith(color.surface, ramp)`,
   `spacingScale(space.base, { multiplier: 1.5 })`.

Rule of thumb: a value token *never* gets a semantic name. Calling one
`values.brand` smuggles a decision into a layer that's supposed to be
opinion-free.

---

## Workflow

### 1. Discover

Inventory every static token in the source. Search for, depending on the
input:

- **CSS / SCSS / LESS**: `:root { --… : … }`, `$variable: …`, `@variable: …`
- **JSON design tokens**: `*.tokens.json`, `tokens/*.json`, files matching the
  W3C draft format (`{ "$value": …, "$type": … }`)
- **Tailwind**: `tailwind.config.{js,ts}` `theme` and `theme.extend`
- **TypeScript theme objects**: const exports with colour/spacing maps
- **Figma**: see the Figma section below

Record name + value + (if available) any description, type hint, or
reference target. Don't transform yet.

### 2. Group by domain

Bucket every entry by domain:

- colour
- spacing / dimension
- typography (font size, weight, line height, family)
- radius / corner
- motion / timing / easing
- shadow / elevation
- string (content, icon-role, asset URL, …)

A single Design Book scope per domain is a sensible default
(`color`, `space`, `type`, `radius`, `motion`, …).

### 3. Identify the value layer

For each entry, decide: is it a unique raw material, or does it duplicate
an existing one?

- **Colour**: two `#0066cc` entries collapse into one `values.blue500`. Pull
  every distinct hex into a `values` scope with descriptive names.
- **Dimensions**: separate base units from multiples. `8px`, `16px`, `24px`,
  `32px` → either four values, or one base + three multiples.
- **Strings**: deduplicate.

Descriptive name guidance:
- Greys: `gray50` (lightest) → `gray900` (darkest), tailwind-style.
- Hues: `blue500`, `red500`, named at the perceptually-mid step. Add `100`,
  `300`, `700`, `900` only when the source actually uses tints/shades.
- Dimensions: `length16`, `length24`, `dim8`, or domain prefix like
  `space.base`. Keep the number unit-explicit so renaming doesn't fail.

### 4. Identify the semantic layer

For each entry that carries a *role* (`button-bg`, `link-color`, `text`,
`heading-size`, `gutter`, …), create a reference token pointing at the
value-layer entry it should resolve to.

```typescript
colorScope.set('brand',       ref('values.gray800'));
colorScope.set('surface',     ref('values.gray50'));
colorScope.set('onSurface',   ref('values.gray900')); // pair token
colorScope.set('text',        ref('color.onSurface'));// refs can chain
colorScope.set('interaction', ref('values.blue500'));
```

Watch for **pair tokens** — two tokens that always travel together. The
classic is `surface` / `onSurface` (background + paired text). The same
pattern shows up wherever something sits on something else
(`button` / `onButton`, `card` / `onCard`). Name the pair, encode it as
two refs.

### 5. Identify rules (procedural tokens)

Look at the *static* system for places where it pre-computed values it
didn't need to. Each one is a candidate for a procedural token.

| Static pattern | Procedural replacement |
| --- | --- |
| `--hover: <darker version of base>` | `darken(ref('color.brand'), { amount: 0.15 })` |
| `--press: <even darker>` | `darken(ref('color.brand'), { amount: 0.3 })` |
| `--button-text: white` / `black` chosen by hand | `bestContrastWith(ref('color.brand'), ramp)` |
| `--border: <faint shade>` | `minContrastWith(ref('color.surface'), ramp, { ratio: 1.5 })` |
| `--accent: <one of the brand colours>` | `mostVivid(values, { against, minContrast, not: [ref('values.error')] })` |
| `--ramp-100…900`: hand-mixed steps | `colorMix(ref('color.surface'), ref('color.interaction'), { ratio })` per step |
| `--space-sm/md/lg/xl`: multiples of a base | `spacingScale(ref('space.base'), { multiplier })` |
| `--font-h1/h2/h3`: modular scale | `typographyScale(ref('type.base'), { ratio, step })` |
| Surface-aware shade ("slightly darker if light, lighter if dark") | `shade(ref('color.surface'), { amount: 0.1 })` |
| Hue rotation / per-channel tweak | `relativeTo(base, 'oklch', [null, null, '+180'])` |

**Don't over-procedural-ise.** If a value isn't related to anything else,
leave it as a value or a ref. Procedural tokens are for relationships,
not decoration.

Function tokens can be nested, so an inline `colorMix(shade(ref('color.surface'), { amount: 0.1 }), ref('color.interaction'), { ratio: 0.5 })`
is fine — no need to invent intermediate tokens.

### 6. Generate the Design Book code

A typical migration produces something like:

```typescript
import {
  DesignBook, color, ref, px,
  darken, shade, colorMix, bestContrastWith, minContrastWith,
  spacingScale, typographyScale,
  Renderer, TableViewRenderer,
} from 'design-book';

const book = new DesignBook('app');

// ---- values (atoms) ---------------------------------------------------
const values = book.addScope('values');
values.set('gray50',  color('#fafafa'));
values.set('gray800', color('#202126'));
values.set('gray900', color('#1a1a1a'));
values.set('blue500', color('#1d4eb8'));
values.set('red500',  color('#dc2626'));

// ---- color (semantic refs) -------------------------------------------
const colorScope = book.addScope('color');
colorScope.set('surface',     ref('values.gray50'));
colorScope.set('onSurface',   ref('values.gray900'));
colorScope.set('brand',       ref('values.gray800'));
colorScope.set('interaction', ref('values.blue500'));
colorScope.set('text',        ref('color.onSurface'));

// ---- procedural -------------------------------------------------------
colorScope.set('linkHover', darken(ref('color.interaction'), { amount: 0.15 }));
colorScope.set('line',      minContrastWith(ref('color.surface'), values, { ratio: 1.5 }));
colorScope.set('onBrand',   bestContrastWith(ref('color.brand'), values, {
  not: [ref('values.red500')], // exclude role-loaded tokens
}));

// ---- space ------------------------------------------------------------
const space = book.addScope('space');
space.set('base', px(16));
space.set('xs',   spacingScale(ref('space.base'), { multiplier: 0.25 }));
space.set('s',    spacingScale(ref('space.base'), { multiplier: 0.5 }));
space.set('m',    spacingScale(ref('space.base'), { multiplier: 1 }));
space.set('l',    spacingScale(ref('space.base'), { multiplier: 1.5 }));
space.set('xl',   spacingScale(ref('space.base'), { multiplier: 2 }));

// ---- typography -------------------------------------------------------
const type = book.addScope('type');
type.set('base', px(16));
type.set('h3',   typographyScale(ref('type.base'), { ratio: 1.25, step: 1 }));
type.set('h2',   typographyScale(ref('type.base'), { ratio: 1.25, step: 2 }));
type.set('h1',   typographyScale(ref('type.base'), { ratio: 1.25, step: 3 }));
```

If a theme has multiple modes (light / dark), model the dark theme as a
scope that *extends* the light one:

```typescript
const light = book.addScope('light');
light.set('bg', color('#ffffff'));
light.set('text', color('#1a1a1a'));

const dark = book.addScope('dark', { extends: 'light' });
dark.set('bg', color('#1a1a1a'));
dark.set('text', color('#ffffff'));
// Anything light defines that dark doesn't override remains inherited.
```

### 7. Verify

Diff the output against the original.

```typescript
const css = new Renderer(book, 'css-variables').render();
// Compare against the original :root block.

const overview = new TableViewRenderer(book).render();
// Inspect every token + dependency in one table.

book.inspect('color.linkHover');
// { value, function, args, options, dependencies, dependents, … }
```

Loop through the original token list and check that every entry has a
counterpart in the rendered output. If something doesn't match, the most
common causes:

- A "rule" candidate was modelled as a value/ref instead of a function.
- A ref points at the wrong key (typo in the qualified name).
- A multi-mode theme wasn't wired through `extends`.

---

## Figma-specific path

Figma stores its design tokens as **variables**, organised into
**collections** (often one collection per theme) with **modes** (e.g.
Light / Dark). Variables can be primitives or *aliases* (a reference to
another variable). This maps cleanly onto Design Book: variables → tokens,
collections → scopes, modes → `extends`, aliases → `ref()`.

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
   workflow steps 2–6.

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
qualified key. Drop the leading segment if it duplicates the scope, lower
camel-case the rest:

- `color/brand/primary` → `color.brandPrimary` (or split: scope `color`,
  token `brandPrimary`)
- `space/m` → `space.m`
- `radius/lg` → `radius.lg`

If the file uses multi-level paths like `color/button/background`, decide
whether to (a) flatten (`color.buttonBackground`), (b) create a new scope
(`button.background`), or (c) leave it in `color` for now. Ask if unsure.

**Types** —

| Figma `resolvedType` | Design Book |
| --- | --- |
| `COLOR` | `color('#rrggbb')` — convert `r,g,b,a` floats (0–1) to hex. |
| `FLOAT` (used as a size) | `px(value)` (or `rem`/`ms` if name implies it) |
| `FLOAT` (used as a multiplier) | raw number stored via a value scope, or skip and pull into a `multiplier` option |
| `STRING` | `string('…')` |
| `BOOLEAN` | encode as `string('true')` / `string('false')`; Design Book doesn't model booleans natively |

To convert a Figma RGBA float to hex:

```typescript
function rgbaToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const to = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
```

**Aliases** —

```jsonc
"valuesByMode": {
  "1:0": { "type": "VARIABLE_ALIAS", "id": "VariableID:1:42" }
}
```

Look up `VariableID:1:42` in `meta.variables`, find its qualified key, and
emit `ref('that.key')` in the target mode's scope.

**Modes** — each mode becomes its own scope. The default mode is the base,
other modes are scopes that `extends` it:

```typescript
const light = book.addScope('light');          // default mode
const dark  = book.addScope('dark', { extends: 'light' });

for each variable:
  for each mode:
    if mode === defaultModeId → write to `light`
    else → write to `dark` only if the value differs from the default
```

Variables whose dark value equals their light value don't need a `dark`
entry — inheritance handles it.

### Detecting procedural intent in Figma data

Figma doesn't store rules. But naming conventions usually leak them:

- Pairs like `color.button.bg` + `color.button.text` → consider
  `bestContrastWith(button.bg, values)` instead of a fixed text colour.
- Sequences like `color.brand.100, 200, …, 900` → likely a colorMix ramp.
  Check the colours: are they perceptually-spaced steps? Replace with
  `colorMix(anchor, anchor2, { ratio })` per step.
- States like `color.brand.hover`, `color.brand.pressed`, `color.brand.disabled`
  with progressive darkness → `darken(color.brand, { amount: 0.1/0.2/0.4 })`.
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
2. `book.inspect(key)` resolves every imported key to a value (no
   `undefined`).
3. Inherited-mode tokens (`dark.foo`) report `isInherited: true` when not
   locally overridden.
4. Aliases produce graph edges:
   `book.getDependencyGraph().getIncoming('color.button.text')` is
   non-empty when that variable was an alias in Figma.
5. The rendered CSS variables for the default mode visually match
   exporting "CSS variables" from Figma Dev Mode for the same file.

---

## Common pitfalls

- **Premature procedural-ising.** If only one place reads a value, a plain
  ref is fine. Procedural tokens shine when the relationship is the
  point.
- **Smuggling semantics into the value layer.** `values.brand` is a code
  smell. The value layer holds material; the role goes in `color`.
- **Forgetting `not` on `mostVivid` / `bestContrastWith` / etc.** Without
  `not: [ref('values.error')]`, the procedural accent often lands on the
  red error colour (highest chroma).
- **Re-creating tokens on Figma sync instead of mutating.** `scope.set` is
  idempotent; calling it on the same key updates the value and preserves
  the existing dependents.
- **Mode → CSS variable scoping.** If the rendered CSS targets `:root`,
  remember to scope each mode under a selector (e.g. `[data-theme="dark"]`)
  by hand-editing the rendered output, or by running the renderer per
  scope and replacing `:root`.

---

## Beyond colour

The same workflow applies for typography, motion, content strings, and
icon roles. Use `typographyScale` for modular type, `timing` for
duration/easing/delay strings, and `string()` for content tokens. The
shape of the migration is identical: discover → group → values → refs →
rules.

---

## Need a function the built-ins don't cover?

Register a custom function:

```typescript
import { createFunctionToken, extractDependencies } from 'design-book';

book.registerFunction('myCustom', (resolvedInput: string, options?: { factor?: number }) => {
  // Return a CSS-valid string.
  return /* … */;
});

function myCustom(base, options) {
  return createFunctionToken('myCustom', [base], {
    options: { factor: options?.factor ?? 1 },
    metadata: {
      dependencies: extractDependencies([base]),
      visualDependencies: [],
      returnType: 'color',
    },
  });
}
```

Then use it like any built-in. Custom functions nest, get tracked in the
dependency graph, and round-trip through renderers (CSS output falls
back to the resolved string unless you also register a
`renderer.registerFunctionRenderer(name, fn)`).
