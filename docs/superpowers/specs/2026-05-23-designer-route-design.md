# Designer route — design

## Goal

Add a fourth Vite-mode route, `designer`, that mirrors the existing `editor`, `article`, and `marketing` routes. The initial page is a **blank canvas** with a static **dot-grid background** — no content, no DesignBook wiring, no nav. It establishes the slot so future work can build a designer workspace on top.

## Scope

In scope:
- New `designer/` folder with `index.html`, `style.css`, `designer.ts`
- `vite.config.ts` mode branch for `designer`
- `dev:designer` and `build:designer` npm scripts
- `.gitignore` entry for `designer-dist/`
- Static CSS dot-grid background

Out of scope (deliberately deferred):
- Any page content, header, or navigation
- DesignBook token wiring for the grid color or spacing
- Interactive canvas, snapping, zoom
- Cross-linking from existing routes to `designer/`

## File layout

```
designer/
  index.html      blank HTML shell — links style.css, imports designer.ts
  style.css       dot-grid background + minimal reset
  designer.ts     empty entry point (no-op for now, ready for future logic)
```

This matches the structure of `marketing/`, `article/`, and `editor/`.

## File contents

### `designer/index.html`
Minimal HTML5 shell:
- `lang="en"`, charset, viewport meta
- `<title>Design Book — Designer</title>`
- Link to `./style.css`
- `<script type="module" src="./designer.ts"></script>` so Vite picks up the entry
- Empty `<body>` (the dot grid lives on `body` via CSS)

### `designer/style.css`
```css
html, body {
  margin: 0;
  min-height: 100vh;
}

body {
  background-color: #fafafa;
  background-image: radial-gradient(
    circle,
    rgba(0, 0, 0, 0.18) 1px,
    transparent 1.5px
  );
  background-size: 24px 24px;
  background-position: 0 0;
}
```

Notes:
- Grid lives on `body` (not a fixed `::before`), so it scrolls with content when content is added later. Approved.
- Hard-coded colors and 24px spacing. No DesignBook tokens yet — those can come later when there is a reason to vary them.

### `designer/designer.ts`
Empty module (a single export or just a comment is fine — purpose is to make Vite treat `designer/` as a real entry):
```ts
export {};
```

## Vite config

Add a new branch to `vite.config.ts` between the existing `marketing` branch and the library fallback:

```ts
if (mode === 'designer') {
  return {
    root: 'designer',
    base: process.env.BASE_PATH ?? '/',
    server: { host: true },
    build: {
      outDir: '../designer-dist',
    },
  };
}
```

Pattern is identical to the three existing mode branches.

## Package scripts

Add to `package.json` `scripts`, alongside the existing `dev:marketing` / `build:marketing` pair:

```json
"dev:designer": "vite --mode designer --host",
"build:designer": "vite build --mode designer --emptyOutDir",
```

## .gitignore

Add `designer-dist/` to the existing list. The repo lists each dist folder explicitly rather than globbing, so a new entry is required.

## Acceptance

- `npm run dev:designer` starts the Vite dev server and serves a page whose body shows a uniform dot grid on a near-white background.
- `npm run build:designer` produces `designer-dist/` with `index.html`, hashed CSS, and a Vite-emitted JS bundle.
- No regressions: `npm run dev`, `npm run dev:article`, `npm run dev:marketing` still work; `npm test` and `npm run build` still pass.
- `designer-dist/` is git-ignored.

## Risks / non-issues

- **Existing inconsistency**: `.gitignore` is missing entries for `article-dist/` and `marketing-dist/` today. Not fixed here — out of scope.
- **No tests added**: this is a static asset slot with no logic. The Vitest suite already covers the library; adding tests for an empty entry would be noise.
