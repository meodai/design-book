import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const SRC = resolve(__dirname, '../../src');

/** Relative and bare imports of a source file. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)]
    .filter((m) => !/^\s*(?:import|export)\s+type\b/.test(m[0]))
    .map((m) => m[1]);
}

/** Every module reachable from `entry` through runtime imports. */
function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of importsOf(file)) {
      if (!spec.startsWith('.')) { seen.add(spec); continue; }
      const base = resolve(dirname(file), spec);
      const candidates = [`${base}.ts`, resolve(base, 'index.ts')];
      const found = candidates.find((c) => { try { readFileSync(c); return true; } catch { return false; } });
      if (found) walk(found);
    }
  };
  walk(entry);
  return [...seen].map((f) => f.replace(`${SRC}/`, ''));
}

describe('design-book/naming stands alone', () => {
  it('pulls in no third-party code and none of the token engine', () => {
    const modules = reachable(resolve(SRC, 'naming/index.ts'));
    expect(modules.sort()).toEqual(['errors.ts', 'keys.ts', 'naming/index.ts']);
  });

  it('still exposes the key check from scope for existing imports', async () => {
    const scope = await import('../../src/scope');
    const keys = await import('../../src/keys');
    expect(scope.assertValidTokenKey).toBe(keys.assertValidTokenKey);
  });
});
