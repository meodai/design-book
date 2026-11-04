import { defineConfig } from 'astro/config';

export default defineConfig({
  // The address the site is served from, for absolute links in its metadata.
  site: 'https://meodai.github.io',
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
