import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const SRC = resolve(__dirname, '../src');

/** Runtime imports of a source file (type-only ones left out). */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)]
    .filter((m) => !/^\s*(?:import|export)\s+type\b/.test(m[0]))
    .map((m) => m[1]);
}

/** Every source module reachable from `entry` through runtime imports. */
function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('.')) continue;
      const base = resolve(dirname(file), spec);
      const found = [`${base}.ts`, resolve(base, 'index.ts')]
        .find((c) => { try { readFileSync(c); return true; } catch { return false; } });
      if (found) walk(found);
    }
  };
  walk(entry);
  return [...seen].map((f) => f.replace(`${SRC}/`, ''));
}

describe('design-book/engine', () => {
  it('reaches none of the renderers', () => {
    const modules = reachable(resolve(SRC, 'engine.ts'));
    expect(modules).toContain('design-book.ts');
    expect(modules.filter((m) => m.startsWith('renderers/'))).toEqual([]);
  });

  it('exports what the root entry does, minus the renderers', async () => {
    const engine = await import('../src/engine');
    const root = await import('../src/index');
    const rendererExports = ['Renderer', 'SVGRenderer', 'TableViewRenderer', 'registerBuiltinRenderers', 'registerBuiltinFunctionRenderers'];
    expect(Object.keys(root).filter((k) => !(k in engine)).sort()).toEqual(rendererExports.sort());
    expect(root.DesignBook).toBe(engine.DesignBook);
  });
});

describe('the design-book entry keeps its side effect', () => {
  it('package.json marks the entry as having side effects, so bundlers keep the renderer registration', () => {
    // A bundler told the entry is side-effect-free drops its top-level
    // registerBuiltinRenderers() when an importer only uses re-exports
    // (DesignBook lives in another module): render() then has no renderers.
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    expect(pkg.sideEffects).toEqual(expect.arrayContaining(['./src/index.ts', './dist/index.js']));
    expect(readFileSync(resolve(SRC, 'index.ts'), 'utf8')).toMatch(/^registerBuiltinRenderers\(\);$/m);
  });
});
