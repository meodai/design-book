import { defineConfig } from 'vite';
import type { ConfigEnv, UserConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// The library build (and the live-test page). The website is an Astro
// site: astro.config.mjs. Each mode pre-bundles its own dependencies.
export default defineConfig((env) => ({
  cacheDir: resolve(__dirname, 'node_modules/.vite', env.mode),
  ...config(env),
}));

function config({ mode }: ConfigEnv): UserConfig {
  if (mode === 'live-test') {
    return {
      root: 'live-test',
      base: process.env.BASE_PATH ?? '/',
      server: { host: true },
      build: {
        outDir: '../live-test-dist',
      },
    };
  }

  return {
    plugins: [dts({ rollupTypes: true })],
    build: {
      lib: {
        // `design-book/naming` is its own entry: it has no dependencies,
        // so projects that only need key names get a few KB.
        entry: {
          index: resolve(__dirname, 'src/index.ts'),
          naming: resolve(__dirname, 'src/naming/index.ts'),
          internals: resolve(__dirname, 'src/internals.ts'),
          engine: resolve(__dirname, 'src/engine.ts'),
        },
        formats: ['es'],
        fileName: (_format, name) => `${name}.js`,
      },
      rollupOptions: {
        // The dependencies are installed with the package: bundling them
        // would ship a second copy to everyone who uses them too. The
        // orderer's trained data stays in: a bare JSON import needs an
        // import attribute that not every consumer handles.
        external: [/^culori(\/|$)/, /^dittotones(\/|$)/, /^colorsort-js$/],
      },
    },
  };
}
