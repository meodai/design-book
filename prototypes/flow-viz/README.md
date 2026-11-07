# Flow view (prototype)

An exploration of a replacement for the circular SVG renderer: a Sankey whose
scopes open into their tokens. Not wired into the library or the site.

```bash
npx vite-node prototypes/flow-viz/sample-book.ts   # writes data/sample.json
node prototypes/flow-viz/build.mjs                 # writes flow-viz.html
```

Any other book can be added with `collect(book, hexOf)` from `collect.mjs`,
written to `data/<name>.json`.

- Scopes are bars in columns ranked by scope dependencies; a band is the
  references between two scopes. Click a scope to open it into its tokens.
- Drawn by default: what a token resolves through (ref, value inputs, the
  member a selector picked) and overrides of a parent scope. On hover also: a
  selector's other inputs by role and its pool.
- Horizontal or vertical; ribbons or lines; hover hides everything outside the
  chain and labels each connection.

Open questions: it is still complex (two layouts, many routing cases), long
jumps cross the scopes in between (no gutter routing).
