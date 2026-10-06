import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode === 'editor') {
    return {
      root: 'editor',
      base: process.env.BASE_PATH ?? '/',
      server: { host: true },
      build: {
        outDir: '../editor-dist',
      },
    };
  }

  if (mode === 'article') {
    return {
      root: 'article',
      base: process.env.BASE_PATH ?? '/',
      server: { host: true },
      build: {
        outDir: '../article-dist',
      },
    };
  }

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

  if (mode === 'naming') {
    return {
      root: 'naming',
      base: process.env.BASE_PATH ?? '/',
      server: { host: true },
      build: {
        outDir: '../naming-dist',
      },
    };
  }

  if (mode === 'marketing') {
    return {
      root: 'marketing',
      base: process.env.BASE_PATH ?? '/',
      server: { host: true },
      build: {
        outDir: '../marketing-dist',
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
        },
        formats: ['es'],
        fileName: (_format, name) => `${name}.js`,
      },
      rollupOptions: {
        external: ['culori'],
      },
    },
  };
});
