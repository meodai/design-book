# Groups: a key that holds a scope

Status: proposal, for review before any code.

## Why

Design systems are full of things that are several values at once: a text
style (family, size, weight, line height, color), a button (background, text,
border, per state), a card. Design Book has one such thing built in, the text
style, as a special token type (`typography()`): its fields are arguments of a
function token, `variant()` is its own inheritance, and the book keeps a second,
smaller dependency graph of "field nodes" just for it. Everything else that is
several values gets flattened into naming conventions
(`on-major-action--hover`) and copied into every scope that needs it.

This proposal replaces the special case with one general rule — **a key can
hold a scope** — and makes the text style the first, ordinary use of it.

The demo is typography:

```ts
const type = book.addScope('type');
type.set('body',  typography({ fontFamily: ref('font.sans'), fontSize: rem(1), lineHeight: 1.5 }));
type.set('title', typography({ fontFamily: ref('font.sans'), fontSize: rem(2.4), lineHeight: 1.2 }));
type.set('title--compact', variant(ref('.title'), { fontSize: rem(1.8) }));

card.set('heading', ref('type.title--compact'));     // the card uses that exact style
ref('card.heading.fontSize')                          // one of its members, through the card
largest(ref('type'), { by: 'fontSize' })              // the styles are a pool; `by` picks the member
type.setOrder([{ by: 'value', field: 'fontSize' }])   // and sort by one
```

## The model

Three rules. Everything below follows from them.

**1. A key holds a token or a scope.** A held scope is a *group*. It is a real
`Scope`: it has keys, it can `extend` another scope, it can hold groups of its
own. Its name is its path (`type.title`); top-level scope names still have no
dots, so a path is never ambiguous.

**2. A path walks keys.** `a.b.c` means: in scope `a`, the key `b`, which holds
a scope; in that scope, the key `c`. Paths have any depth. A path walks into a
group, and through a reference to a scope (rule 3 below).

**3. A scope reads relative to where it is.** `ref('.x')` is the key `x` of the
scope that reads it (as today). `ref('..x')` is the key `x` of the scope that
*holds* it. `inherited(ref('.x'))` is `x` one step up the `extends` chain (as
today). So a group can read its own members and its surroundings without
naming either.

### Two ways to hold a scope

| | Written | What it is | Its relative refs read |
|---|---|---|---|
| **reference** | `ref('type.title')` | the same scope, seen from here; nothing is copied | where the scope is defined |
| **own group** | `group({ … })`, `typography({ … })`, `variant(ref('type.title'), { … })` | a scope of its own at this key, optionally extending another | where it is placed |

A reference is for using a specific variant somewhere else: the card's heading
*is* `type.title--compact`, and changes to it show up in the card.

An own group is for placing a definition in a context. A button defined once
with `text: bestContrastWith(ref('..surface'), ref('scale'))` and placed as
`variant(ref('button-major'))` in every context reads each context's own
surface — the "instance" behaviour, which is just `extends` plus rule 3.
`variant` takes its overrides optionally for exactly this.

A selector whose pick is a group (`largest(ref('type'), { by: 'fontSize' })`)
holds it by reference, and follows the pick when it changes.

## How a group behaves

A key holding a group is a key like any other. The one difference: its value
is several values, so wherever one value is needed, one member stands for it.

| Where | A key holding a token | A key holding a group |
|---|---|---|
| `book.resolve(key)` | the value | throws: *`card.heading` is a group; read a member, e.g. `card.heading.fontSize`* |
| `ref(key)` as a value | reads the value | holds the same group by reference |
| `ref(key + '.member')` | — | reads that member |
| `extends`, overrides | inherited, overridable | the same; a child scope can swap the group or set one member (`card.heading.fontSize`) |
| member of a pool | measured as itself | measured by one member: `by` (text styles: `fontSize` unless given); the pick is the group |
| scope order by value | by its value | by one member: `field` (text styles: `fontSize` unless given) |
| function argument | its value | throws, naming a member to pass instead |
| CSS | `--card-heading` | a variable per member (`--card-heading-font-size`); a text style also gets its class (`.card-heading`) |
| W3 | a token | a group; a text style keeps the native `typography` composite |
| JSON | the value | an object of its members |
| SVG graph | a row | one box, a row per member |
| editor | the call as written | `group({ … })` / `typography({ … })` / `variant(…)` / `ref('…')` as written |

`by` and `field` already exist (0.25.0) and become the general answer to
"which member stands for a group", rather than a text-style feature.

A group can be marked with a *kind* (`typography()` is `group(…, { kind:
'typography' })`). The kind decides only what a group means outside the book:
the CSS class, the W3 composite, the default member for `by` / `field`. Inside
the book every group behaves the same.

## Selectors return the member they picked

Today a selector returns a value string and reports, on the side, which member
that value came from (`picked`, captured in frames, replayed from the cache).
With groups that no longer works: a selector that picks a group has no value
string to return.

So a selector's result becomes **the member** it picked. The book derives the
rest: the value when the member is a token, the group by reference when it is
a group. `inspect().picked`, `sibling` stepping from a pick, `not` naming a
pick and the SVG edges all read it directly; the capture-and-replay machinery
goes. Transforms (`lighten`, `colorMix`, …) still return values.

One consequence to decide on: color selectors today return the member's color
*gamut-mapped to sRGB hex*. Returning the member means returning its value as
written — `oklch(0.7 0.25 150)` stays `oklch(0.7 0.25 150)`. CSS output
is unchanged (it is `var()` of the member either way); JSON and `resolve()`
would give the member's own value. Recommendation: return the member's value,
since a selector chooses a token rather than making a new color.

## What changes for existing features

| Today | With groups |
|---|---|
| `typography({ … })` | a group of kind `typography`; written the same |
| `variant(ref, { … })` | a group extending `ref`, with those members; `null` leaves a member out (`omit`, a scope option every scope gets) |
| `variant(token, { … })` (a copy, for layers) | **removed**: a layer sets the member itself, `type.title.fontSize` |
| field refs `ref('type.title.fontSize')` | the same path, now an ordinary key |
| field nodes, `_fieldNodes`, `typographyFieldDependencies`, `_inspectField`, … | **removed**: members are keys, the regular graph tracks them |
| `isFieldKey`, `tokenKeyOf`, the three-segment key limit | **replaced** by one path walk (`book.locate(path)` → scope and key) |
| `typographyFields`, `typographyBase`, `typographyFieldNames`, `isTypographyToken` | **replaced** by the scope API (`getScope(path)`, `getAllKeys()`, `extendsScope`, `kind`) |
| inherited breakpoint styles, `inherited(ref('.title'))` | unchanged |
| `by` / `field` | unchanged; they work for any group |
| layers, `composeBook` | unchanged; a data layer may contain groups |
| `picked`, `capturePick`, frames | **replaced** by selectors returning members |
| `resolve()` on a text style (CSS declarations) | **throws** for a group; renderers and comparisons read members |

## Inside the book

- **Groups are scopes.** The scope manager holds them under their path. A
  group's members are ordinary keys, so the dependency graph, the resolve
  cache, inheritance (eager wiring from 0.23), relative-ref binding and the
  order cache need no new machinery for them.
- **Reads through a reference.** `card.heading.fontSize`, where `card.heading`
  is `ref('type.title--compact')`, owns no token. Such a path gets a node that
  depends on the reference and on the member it currently reaches, and is
  re-pointed when the reference changes — the field nodes of today, generalised,
  and the only kind of node that is not a key. Selectors picking groups use the
  same.
- **Pools.** A pool is a scope, top-level or a group (`ref('card.heading')`).
  A change to a key notifies the selectors iterating its scope *and every scope
  holding that scope*, since a member of theirs changed.
- **Cycles.** A scope may not hold itself, directly or through references
  (`a.x = ref('b')`, `b.y = ref('a')`); refused when written, like a cycle
  between tokens. `extends` cycles are refused as today.

## Breaking changes

- `resolve()` of a text style throws instead of returning CSS declarations.
- `variant(token, …)` (the copy form) is gone; layers set members.
- Selector implementations (custom ones too) return the member they picked
  (`member(scope, key)`) instead of a value plus `picked(…)`.
- Color selectors return the member's value as written, not sRGB hex (to
  decide, see above).
- The typography helpers (`typographyFields`, `isTypographyToken`, …) and the
  field-key helpers (`isFieldKey`, `tokenKeyOf`) are replaced by the scope API.
- `TokenInspection` for a group describes the group (members, kind, extends)
  instead of a function token.

## Plan

Each stage ends with the full test suite, the site build, and the large
downstream color book (which has no groups) rendering exactly as before.

1. **Paths and groups.** Path walk, groups as scopes, `group()`,
   `typography()` and `variant()` building them, `..` refs, `omit`; `resolve`
   throws for groups; text styles move onto it and field nodes go. Renderers
   (CSS variables and classes, W3, JSON, SVG) and the editor follow.
2. **References to scopes.** A `ref()` to a scope as a value; through-nodes;
   the cycle rule.
3. **Selectors return members.** Groups as pool members (`by`), selectors
   picking groups; the picks side channel goes.
4. **The demo.** A tour section on text styles as groups: a type scale, a
   variant per breakpoint, a card using one exact style, `largest` / sort by
   member. README, skill file, CLAUDE.md.

## Open questions

1. **Gamut mapping in selector results** — return the member's own value
   (recommended) or keep sRGB hex?
2. **Syntax for the holder** — `ref('..x')` (recommended; one more dot, one
   level up) or a navigation like `holder(ref('.x'))` next to `inherited` and
   `source`?
3. **Depth** — no limit (recommended), or one level like text styles today?
4. **Name** — `group({ … })` for a generic group, or something else?
5. **Lists as pools** — `mostVivid([ref('a.x'), ref('b.y')])`. Not needed for
   groups: a group of references already is a named list. Leave out for now
   (recommended)?
