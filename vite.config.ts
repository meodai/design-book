import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import dts from 'vite-plugin-dts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  if (mode === 'demo') {
    return {
      root: 'demo',
      build: {
        outDir: '../demo-dist',
      },
    };
  }

  return {
    plugins: [dts({ rollupTypes: true })],
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        formats: ['es'],
        fileName: 'index',
      },
      rollupOptions: {
        external: ['culori'],
      },
    },
  };
});
