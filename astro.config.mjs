// The website (landing, docs, article, editor, naming playground) is one
// Astro site. Its sources sit in site/; the pages import the existing
// scripts and stylesheets from marketing/, article/, editor/ and naming/.
// The library itself still builds with plain Vite (vite.config.ts).
import { defineConfig } from 'astro/config';

export default defineConfig({
  srcDir: './site',
  publicDir: './site/public',
  outDir: './site-dist',
  base: process.env.BASE_PATH ?? '/',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  server: { host: true, port: 5188 },
  vite: {
    // The site's own pre-bundle cache, apart from the library's.
    cacheDir: 'node_modules/.vite/site',
  },
});
