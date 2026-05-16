# `ramp()` Function Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ramp()` color function and `rampStops()` JS helper that generate Tailwind-style tonal scales from a seed color, backed by the `dittotones` library.

**Architecture:** A single shared `DittoTones` engine per `DesignBook` instance, lazily constructed on first use, with seed-keyed LRU cache so a full scale resolves in one `generate()` call. `ramp()` is a normal function token returning one shade hex. `rampStops()` is plain JS that expands into many `ramp()` tokens.

**Tech Stack:** TypeScript, `dittotones` (new), `culori` (existing, for hex→oklch conversion of the bundled Tailwind palette), `vitest`.

**Spec:** `docs/superpowers/specs/2026-05-16-ramp-function-design.md`

---

## File Structure

**Create:**
- `src/data/tailwind-ramps.ts` — Tailwind hex palette + lazy `Map<string, Ramp>` getter
- `src/functions/color/ramp.ts` — `ramp()`, `rampStops()`, `rampImpl`, `RampEngine` class
- `tests/functions/color/ramp.test.ts` — unit + integration tests
- `tests/data/tailwind-ramps.test.ts` — data-shape test

**Modify:**
- `src/design-book.ts` — add `colorRamps` / `preserveHueOffsets` / `gamutMap` to `DesignBookOptions`, add `getRampEngine()`, register `ramp` in constructor
- `src/functions/index.ts` — re-export `ramp`, `rampStops`
- `src/index.ts` — re-export `ramp`, `rampStops`
- `package.json` — add `dittotones` dependency

---

### Task 1: Install dittotones

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

Run: `npm install dittotones`
Expected: adds `dittotones` to `dependencies`. No peer-dep warnings.

- [ ] **Step 2: Verify it loads in Node**

Run: `node --input-type=module -e "import('dittotones').then(m => console.log(Object.keys(m)))"`
Expected output includes: `DittoTones`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add dittotones dependency"
```

---

### Task 2: Bundle Tailwind palette as source data

Ship the Tailwind v3.4 hex palette. Convert to OKLCH lazily on first read so culori is only invoked when `ramp()` is actually used.

**Files:**
- Create: `src/data/tailwind-ramps.ts`
- Test: `tests/data/tailwind-ramps.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/data/tailwind-ramps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTailwindRamps, tailwindRampsHex } from '../../src/data/tailwind-ramps';

describe('tailwind-ramps', () => {
  it('exposes the expected ramp names', () => {
    const names = Object.keys(tailwindRampsHex);
    expect(names).toContain('blue');
    expect(names).toContain('slate');
    expect(names).toContain('rose');
    expect(names.length).toBe(22);
  });

  it('every ramp has the 11 Tailwind shades', () => {
    const shades = ['50','100','200','300','400','500','600','700','800','900','950'];
    for (const [name, ramp] of Object.entries(tailwindRampsHex)) {
      expect(Object.keys(ramp).sort()).toEqual(shades.sort());
      for (const v of Object.values(ramp)) {
        expect(v).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('getTailwindRamps returns a Map of oklch entries', () => {
    const map = getTailwindRamps();
    const blue = map.get('blue');
    expect(blue).toBeDefined();
    expect(blue!['500']).toHaveProperty('mode', 'oklch');
    expect(typeof blue!['500'].l).toBe('number');
  });

  it('caches the converted map between calls', () => {
    const a = getTailwindRamps();
    const b = getTailwindRamps();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/tailwind-ramps.test.ts`
Expected: FAIL — `Cannot find module '../../src/data/tailwind-ramps'`.

- [ ] **Step 3: Implement the data module**

Create `src/data/tailwind-ramps.ts`:

```ts
import { converter, parse } from 'culori';
import type { Ramp } from 'dittotones';

export type RampHex = Record<string, string>;

/**
 * Source-of-truth Tailwind v3.4 palette, in hex. Converted lazily to OKLCH
 * by getTailwindRamps() so culori is only loaded when ramp() is used.
 */
export const tailwindRampsHex: Record<string, RampHex> = {
  slate:   { '50':'#f8fafc','100':'#f1f5f9','200':'#e2e8f0','300':'#cbd5e1','400':'#94a3b8','500':'#64748b','600':'#475569','700':'#334155','800':'#1e293b','900':'#0f172a','950':'#020617' },
  gray:    { '50':'#f9fafb','100':'#f3f4f6','200':'#e5e7eb','300':'#d1d5db','400':'#9ca3af','500':'#6b7280','600':'#4b5563','700':'#374151','800':'#1f2937','900':'#111827','950':'#030712' },
  zinc:    { '50':'#fafafa','100':'#f4f4f5','200':'#e4e4e7','300':'#d4d4d8','400':'#a1a1aa','500':'#71717a','600':'#52525b','700':'#3f3f46','800':'#27272a','900':'#18181b','950':'#09090b' },
  neutral: { '50':'#fafafa','100':'#f5f5f5','200':'#e5e5e5','300':'#d4d4d4','400':'#a3a3a3','500':'#737373','600':'#525252','700':'#404040','800':'#262626','900':'#171717','950':'#0a0a0a' },
  stone:   { '50':'#fafaf9','100':'#f5f5f4','200':'#e7e5e4','300':'#d6d3d1','400':'#a8a29e','500':'#78716c','600':'#57534e','700':'#44403c','800':'#292524','900':'#1c1917','950':'#0c0a09' },
  red:     { '50':'#fef2f2','100':'#fee2e2','200':'#fecaca','300':'#fca5a5','400':'#f87171','500':'#ef4444','600':'#dc2626','700':'#b91c1c','800':'#991b1b','900':'#7f1d1d','950':'#450a0a' },
  orange:  { '50':'#fff7ed','100':'#ffedd5','200':'#fed7aa','300':'#fdba74','400':'#fb923c','500':'#f97316','600':'#ea580c','700':'#c2410c','800':'#9a3412','900':'#7c2d12','950':'#431407' },
  amber:   { '50':'#fffbeb','100':'#fef3c7','200':'#fde68a','300':'#fcd34d','400':'#fbbf24','500':'#f59e0b','600':'#d97706','700':'#b45309','800':'#92400e','900':'#78350f','950':'#451a03' },
  yellow:  { '50':'#fefce8','100':'#fef9c3','200':'#fef08a','300':'#fde047','400':'#facc15','500':'#eab308','600':'#ca8a04','700':'#a16207','800':'#854d0e','900':'#713f12','950':'#422006' },
  lime:    { '50':'#f7fee7','100':'#ecfccb','200':'#d9f99d','300':'#bef264','400':'#a3e635','500':'#84cc16','600':'#65a30d','700':'#4d7c0f','800':'#3f6212','900':'#365314','950':'#1a2e05' },
  green:   { '50':'#f0fdf4','100':'#dcfce7','200':'#bbf7d0','300':'#86efac','400':'#4ade80','500':'#22c55e','600':'#16a34a','700':'#15803d','800':'#166534','900':'#14532d','950':'#052e16' },
  emerald: { '50':'#ecfdf5','100':'#d1fae5','200':'#a7f3d0','300':'#6ee7b7','400':'#34d399','500':'#10b981','600':'#059669','700':'#047857','800':'#065f46','900':'#064e3b','950':'#022c22' },
  teal:    { '50':'#f0fdfa','100':'#ccfbf1','200':'#99f6e4','300':'#5eead4','400':'#2dd4bf','500':'#14b8a6','600':'#0d9488','700':'#0f766e','800':'#115e59','900':'#134e4a','950':'#042f2e' },
  cyan:    { '50':'#ecfeff','100':'#cffafe','200':'#a5f3fc','300':'#67e8f9','400':'#22d3ee','500':'#06b6d4','600':'#0891b2','700':'#0e7490','800':'#155e75','900':'#164e63','950':'#083344' },
  sky:     { '50':'#f0f9ff','100':'#e0f2fe','200':'#bae6fd','300':'#7dd3fc','400':'#38bdf8','500':'#0ea5e9','600':'#0284c7','700':'#0369a1','800':'#075985','900':'#0c4a6e','950':'#082f49' },
  blue:    { '50':'#eff6ff','100':'#dbeafe','200':'#bfdbfe','300':'#93c5fd','400':'#60a5fa','500':'#3b82f6','600':'#2563eb','700':'#1d4ed8','800':'#1e40af','900':'#1e3a8a','950':'#172554' },
  indigo:  { '50':'#eef2ff','100':'#e0e7ff','200':'#c7d2fe','300':'#a5b4fc','400':'#818cf8','500':'#6366f1','600':'#4f46e5','700':'#4338ca','800':'#3730a3','900':'#312e81','950':'#1e1b4b' },
  violet:  { '50':'#f5f3ff','100':'#ede9fe','200':'#ddd6fe','300':'#c4b5fd','400':'#a78bfa','500':'#8b5cf6','600':'#7c3aed','700':'#6d28d9','800':'#5b21b6','900':'#4c1d95','950':'#2e1065' },
  purple:  { '50':'#faf5ff','100':'#f3e8ff','200':'#e9d5ff','300':'#d8b4fe','400':'#c084fc','500':'#a855f7','600':'#9333ea','700':'#7e22ce','800':'#6b21a8','900':'#581c87','950':'#3b0764' },
  fuchsia: { '50':'#fdf4ff','100':'#fae8ff','200':'#f5d0fe','300':'#f0abfc','400':'#e879f9','500':'#d946ef','600':'#c026d3','700':'#a21caf','800':'#86198f','900':'#701a75','950':'#4a044e' },
  pink:    { '50':'#fdf2f8','100':'#fce7f3','200':'#fbcfe8','300':'#f9a8d4','400':'#f472b6','500':'#ec4899','600':'#db2777','700':'#be185d','800':'#9d174d','900':'#831843','950':'#500724' },
  rose:    { '50':'#fff1f2','100':'#ffe4e6','200':'#fecdd3','300':'#fda4af','400':'#f43f5e','500':'#e11d48','600':'#be123c','700':'#9f1239','800':'#881337','900':'#4c0519','950':'#1a0508' },
};

const toOklch = converter('oklch');
let cached: Map<string, Ramp> | null = null;

export function getTailwindRamps(): Map<string, Ramp> {
  if (cached) return cached;
  const map = new Map<string, Ramp>();
  for (const [name, hexRamp] of Object.entries(tailwindRampsHex)) {
    const oklchRamp: Ramp = {};
    for (const [shade, hex] of Object.entries(hexRamp)) {
      const parsed = parse(hex);
      if (!parsed) throw new Error(`tailwind-ramps: cannot parse ${name}/${shade} = ${hex}`);
      const ok = toOklch(parsed);
      if (!ok) throw new Error(`tailwind-ramps: cannot convert ${name}/${shade}`);
      oklchRamp[shade] = ok;
    }
    map.set(name, oklchRamp);
  }
  cached = map;
  return cached;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data/tailwind-ramps.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/data/tailwind-ramps.ts tests/data/tailwind-ramps.test.ts
git commit -m "feat(data): bundle tailwind palette for ramp engine"
```

---

### Task 3: `RampEngine` wrapper with seed cache

Wraps the `DittoTones` instance and caches `generate()` results per resolved seed string.

**Files:**
- Create: `src/functions/color/ramp.ts` (initial — just the `RampEngine` class)
- Test: `tests/functions/color/ramp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/functions/color/ramp.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { DittoTones } from 'dittotones';
import { RampEngine } from '../../../src/functions/color/ramp';
import { getTailwindRamps } from '../../../src/data/tailwind-ramps';

describe('RampEngine', () => {
  it('returns a generate result for a seed', () => {
    const engine = new RampEngine({ ramps: getTailwindRamps() });
    const result = engine.generate('#3b82f6');
    expect(result.scale).toBeDefined();
    expect(result.scale['500']).toBeDefined();
  });

  it('caches results per seed (one dittotones.generate call per unique seed)', () => {
    const spy = vi.spyOn(DittoTones.prototype, 'generate');
    const engine = new RampEngine({ ramps: getTailwindRamps() });

    engine.generate('#3b82f6');
    engine.generate('#3b82f6');
    engine.generate('#3b82f6');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('evicts oldest entries when cache exceeds maxSize', () => {
    const engine = new RampEngine({ ramps: getTailwindRamps(), cacheSize: 2 });
    const spy = vi.spyOn(DittoTones.prototype, 'generate');

    engine.generate('#ff0000');  // call 1
    engine.generate('#00ff00');  // call 2
    engine.generate('#0000ff');  // call 3 → evicts #ff0000
    engine.generate('#ff0000');  // call 4 (regenerate)

    expect(spy).toHaveBeenCalledTimes(4);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/functions/color/ramp.test.ts`
Expected: FAIL — `Cannot find module '../../../src/functions/color/ramp'`.

- [ ] **Step 3: Implement RampEngine**

Create `src/functions/color/ramp.ts`:

```ts
import { DittoTones } from 'dittotones';
import type { GenerateResult, Ramp } from 'dittotones';

export interface RampEngineOptions {
  ramps: Map<string, Ramp>;
  preserveHueOffsets?: boolean;
  gamutMap?: boolean;
  /** LRU cache cap. Defaults to 32. */
  cacheSize?: number;
}

export class RampEngine {
  private dt: DittoTones;
  private cache = new Map<string, GenerateResult>();
  private cacheSize: number;

  constructor(opts: RampEngineOptions) {
    this.dt = new DittoTones({
      ramps: opts.ramps,
      preserveHueOffsets: opts.preserveHueOffsets ?? true,
      gamutMap: opts.gamutMap ?? true,
    });
    this.cacheSize = opts.cacheSize ?? 32;
  }

  generate(seed: string): GenerateResult {
    const hit = this.cache.get(seed);
    if (hit) {
      // refresh LRU position
      this.cache.delete(seed);
      this.cache.set(seed, hit);
      return hit;
    }
    const result = this.dt.generate(seed);
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }
    this.cache.set(seed, result);
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/functions/color/ramp.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/functions/color/ramp.ts tests/functions/color/ramp.test.ts
git commit -m "feat(functions): add RampEngine wrapper with seed cache"
```

---

### Task 4: Add `DesignBook` options and `getRampEngine()`

Wire engine config through the `DesignBook` constructor and expose a lazy getter.

**Files:**
- Modify: `src/design-book.ts`
- Test: `tests/design-book.test.ts` (append) — or new file

- [ ] **Step 1: Write the failing test**

Append to `tests/design-book.test.ts` (or create `tests/design-book-ramp-options.test.ts` if you prefer isolation):

```ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { getTailwindRamps } from '../src/data/tailwind-ramps';

describe('DesignBook ramp options', () => {
  it('lazily constructs the ramp engine on first access', () => {
    const book = new DesignBook('test');
    // @ts-expect-error testing internal: engine not built yet
    expect(book._rampEngine).toBeUndefined();
    const engine = book.getRampEngine();
    expect(engine).toBeDefined();
    expect(book.getRampEngine()).toBe(engine); // memoised
  });

  it('uses user-supplied colorRamps when provided', () => {
    const customRamps = new Map(getTailwindRamps()); // shallow copy is fine
    const book = new DesignBook('test', { colorRamps: customRamps });
    const engine = book.getRampEngine();
    expect(engine).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/design-book.test.ts -t "ramp options"`
Expected: FAIL — `book.getRampEngine is not a function` (or `colorRamps` not recognised).

- [ ] **Step 3: Extend `DesignBookOptions`**

In `src/design-book.ts`, update the options interface (lines ~8-11):

```ts
import type { Ramp } from 'dittotones';
import { RampEngine } from './functions/color/ramp';
import { getTailwindRamps } from './data/tailwind-ramps';

export interface DesignBookOptions {
  mode?: 'auto' | 'batch';
  description?: string;
  /** Reference ramps for the dittotones engine. Defaults to bundled Tailwind. */
  colorRamps?: Map<string, Ramp>;
  /** Pass-through to dittotones. Default: true. */
  preserveHueOffsets?: boolean;
  /** Pass-through to dittotones. Default: true. */
  gamutMap?: boolean;
}
```

- [ ] **Step 4: Store options and add `getRampEngine()`**

In the `DesignBook` class body, add private fields and a method. Place near the `functions: Map<...>` field:

```ts
private _rampEngine?: RampEngine;
private _rampOptions: {
  colorRamps?: Map<string, Ramp>;
  preserveHueOffsets?: boolean;
  gamutMap?: boolean;
};
```

In the constructor (replace the existing constructor body):

```ts
constructor(name: string, options?: DesignBookOptions) {
  this.name = name;
  this.description = options?.description;
  this._mode = options?.mode ?? 'auto';
  this._rampOptions = {
    colorRamps: options?.colorRamps,
    preserveHueOffsets: options?.preserveHueOffsets,
    gamutMap: options?.gamutMap,
  };
  this.scopeManager = new ScopeManager(this);
  this.graph = new DependencyGraph();
  registerBuiltinFunctions(this);
}
```

Add `getRampEngine()` near `registerFunction` / `getFunction` (around line 290):

```ts
getRampEngine(): RampEngine {
  if (!this._rampEngine) {
    this._rampEngine = new RampEngine({
      ramps: this._rampOptions.colorRamps ?? getTailwindRamps(),
      preserveHueOffsets: this._rampOptions.preserveHueOffsets,
      gamutMap: this._rampOptions.gamutMap,
    });
  }
  return this._rampEngine;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/design-book.test.ts -t "ramp options"`
Expected: PASS (2/2). Also run the full suite to confirm nothing regressed:

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/design-book.ts tests/design-book.test.ts
git commit -m "feat(design-book): expose lazy ramp engine via constructor options"
```

---

### Task 5: `ramp()` function constructor + impl, registered in DesignBook

**Files:**
- Modify: `src/functions/color/ramp.ts` (add constructor + impl)
- Modify: `src/design-book.ts` (register `'ramp'`)
- Test: `tests/functions/color/ramp.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/functions/color/ramp.test.ts`:

```ts
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { ramp } from '../../../src/functions/color/ramp';
import { parse } from 'culori';

describe('ramp()', () => {
  it('resolves a hex string for the requested shade', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('brand500', ramp(ref('color.brand'), { shade: '500' }));

    const resolved = book.resolve('color.brand500');
    expect(resolved).toMatch(/^#[0-9a-f]{6}$/i);
    expect(parse(resolved)).toBeDefined();
  });

  it('different shades for the same seed give different hex values', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('s100', ramp(ref('color.brand'), { shade: '100' }));
    palette.set('s900', ramp(ref('color.brand'), { shade: '900' }));

    const a = book.resolve('color.s100');
    const b = book.resolve('color.s900');
    expect(a).not.toBe(b);
  });

  it('changing the seed propagates to ramp tokens', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('s500', ramp(ref('color.brand'), { shade: '500' }));

    const before = book.resolve('color.s500');
    palette.set('brand', color('#ef4444'));
    const after = book.resolve('color.s500');
    expect(after).not.toBe(before);
  });

  it('throws FunctionError on unknown shade', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('bad', ramp(ref('color.brand'), { shade: '12345' }));

    expect(() => book.resolve('color.bad')).toThrow(/unknown shade/);
  });

  it('resolves a full Tailwind-style scale with one dittotones.generate call', async () => {
    const { DittoTones } = await import('dittotones');
    const spy = vi.spyOn(DittoTones.prototype, 'generate');

    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    const seed = ref('color.brand');
    for (const shade of ['50','100','200','300','400','500','600','700','800','900','950']) {
      palette.set(`b${shade}`, ramp(seed, { shade }));
    }
    for (const shade of ['50','100','200','300','400','500','600','700','800','900','950']) {
      book.resolve(`color.b${shade}`);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/functions/color/ramp.test.ts -t "ramp\\(\\)"`
Expected: FAIL — `ramp is not a function` (or function not registered).

- [ ] **Step 3: Add `ramp` and `rampImpl` to `src/functions/color/ramp.ts`**

Append to `src/functions/color/ramp.ts`:

```ts
import { formatHex } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

export function rampImpl(seedValue: string, shade: string, engine: RampEngine): string {
  let result;
  try {
    result = engine.generate(seedValue);
  } catch (err) {
    throw new FunctionError(
      `ramp: cannot generate scale from seed "${seedValue}": ${(err as Error).message}`,
      'ramp',
    );
  }
  const oklch = result.scale[shade];
  if (!oklch) {
    const known = Object.keys(result.scale).join(', ');
    throw new FunctionError(
      `ramp: unknown shade "${shade}", expected one of: ${known}`,
      'ramp',
    );
  }
  const hex = formatHex(oklch);
  if (!hex) {
    throw new FunctionError(`ramp: failed to format shade "${shade}" as hex`, 'ramp');
  }
  return hex;
}

export function ramp(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { shade: string; description?: string },
): FunctionTokenValue {
  if (typeof options?.shade !== 'string' || options.shade.length === 0) {
    throw new FunctionError('ramp: "shade" option is required and must be a non-empty string', 'ramp');
  }
  return createFunctionToken(
    'ramp',
    [seed],
    {
      description: options.description,
      options: { shade: options.shade },
      metadata: {
        dependencies: extractDependencies([seed]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
  );
}
```

- [ ] **Step 4: Register `ramp` in DesignBook**

In `src/design-book.ts`, update imports — `RampEngine` is already imported from Task 4; now add `rampImpl` and `FunctionError`:

```ts
import { RampEngine, rampImpl } from './functions/color/ramp';
import { FunctionError } from './errors';   // if not already imported
```

In the constructor, after `registerBuiltinFunctions(this);` add:

```ts
this.registerFunction('ramp', (seedValue: string, options?: { shade: string }) => {
  if (!options?.shade) {
    throw new FunctionError('ramp: missing required "shade" option', 'ramp');
  }
  return rampImpl(seedValue, options.shade, this.getRampEngine());
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/functions/color/ramp.test.ts`
Expected: PASS (all `ramp()` describes — 5 new + 3 RampEngine = 8 total).

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/functions/color/ramp.ts src/design-book.ts tests/functions/color/ramp.test.ts
git commit -m "feat(functions): add ramp() function token backed by dittotones"
```

---

### Task 6: `rampStops()` JS helper

**Files:**
- Modify: `src/functions/color/ramp.ts` (append)
- Test: `tests/functions/color/ramp.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/functions/color/ramp.test.ts`:

```ts
import { rampStops } from '../../../src/functions/color/ramp';

describe('rampStops()', () => {
  it('expands to the 11 default Tailwind shades with the given prefix', () => {
    const stops = rampStops(ref('color.brand'), { prefix: 'brand' });
    expect(Object.keys(stops).sort()).toEqual(
      ['brand100','brand200','brand300','brand400','brand50','brand500','brand600','brand700','brand800','brand900','brand950'].sort()
    );
  });

  it('each value is a ramp() function token with the right shade in options', () => {
    const stops = rampStops(ref('color.brand'), { prefix: 'b' });
    expect(stops.b500.name).toBe('ramp');
    expect(stops.b500.options).toEqual({ shade: '500' });
  });

  it('honours a custom shades array', () => {
    const stops = rampStops(ref('color.brand'), {
      prefix: 'b',
      shades: ['100', '500', '900'],
    });
    expect(Object.keys(stops).sort()).toEqual(['b100', 'b500', 'b900']);
  });

  it('integrates with DesignBook — full scale resolves with one generate call', async () => {
    const { DittoTones } = await import('dittotones');
    const spy = vi.spyOn(DittoTones.prototype, 'generate');

    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    const stops = rampStops(ref('color.brand'), { prefix: 'brand' });
    for (const [key, value] of Object.entries(stops)) {
      palette.set(key, value);
    }
    for (const key of Object.keys(stops)) {
      const v = book.resolve(`color.${key}`);
      expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/functions/color/ramp.test.ts -t "rampStops"`
Expected: FAIL — `rampStops is not exported`.

- [ ] **Step 3: Implement `rampStops`**

Append to `src/functions/color/ramp.ts`:

```ts
const DEFAULT_SHADES = ['50','100','200','300','400','500','600','700','800','900','950'] as const;

export function rampStops(
  seed: TokenValue | ReferenceValue | FunctionTokenValue,
  options: { prefix: string; shades?: ReadonlyArray<string>; description?: string },
): Record<string, FunctionTokenValue> {
  if (typeof options?.prefix !== 'string' || options.prefix.length === 0) {
    throw new FunctionError('rampStops: "prefix" option is required and must be a non-empty string', 'rampStops');
  }
  const shades = options.shades ?? DEFAULT_SHADES;
  const out: Record<string, FunctionTokenValue> = {};
  for (const shade of shades) {
    out[`${options.prefix}${shade}`] = ramp(seed, { shade, description: options.description });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/functions/color/ramp.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/functions/color/ramp.ts tests/functions/color/ramp.test.ts
git commit -m "feat(functions): add rampStops() JS helper"
```

---

### Task 7: Wire public exports

**Files:**
- Modify: `src/functions/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/exports.test.ts` (or append to an existing one if you prefer):

```ts
import { describe, it, expect } from 'vitest';
import * as designBook from '../src/index';

describe('public exports', () => {
  it('exports ramp and rampStops', () => {
    expect(typeof designBook.ramp).toBe('function');
    expect(typeof designBook.rampStops).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/exports.test.ts`
Expected: FAIL — `designBook.ramp is undefined`.

- [ ] **Step 3: Re-export from `src/functions/index.ts`**

In `src/functions/index.ts`, add near the other color-function `export` lines:

```ts
export { ramp, rampStops } from './color/ramp';
```

- [ ] **Step 4: Re-export from `src/index.ts`**

In `src/index.ts`, update the `Functions` export block:

```ts
export {
  bestContrastWith, minContrastWith,
  colorMix, lighten, darken, shade, relativeTo,
  closestColor, furthestFrom, averageColor, mostVivid,
  ramp, rampStops,
  spacingScale, typographyScale, timing,
  nextLarger, nextSmaller,
  registerBuiltinFunctions,
} from './functions';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/exports.test.ts`
Expected: PASS.

Run: `npm test`
Expected: full suite green.

Run: `npm run build`
Expected: build succeeds (validates the `dist/index.d.ts` type surface).

- [ ] **Step 6: Commit**

```bash
git add src/functions/index.ts src/index.ts tests/exports.test.ts
git commit -m "feat: export ramp and rampStops from package entry"
```

---

## Done Criteria

- [ ] `npm test` passes
- [ ] `npm run build` produces a `dist/` with `ramp` and `rampStops` exported in `dist/index.d.ts`
- [ ] Resolving an 11-stop ramp via `rampStops()` calls `dittotones.generate()` exactly once (covered by Task 6 test)
- [ ] Changing the seed token reactively updates all ramp tokens (covered by Task 5 test)
- [ ] Unknown shade raises a clear `FunctionError` (covered by Task 5 test)

## Out of Scope (deferred to future iterations)

- Per-call engine option overrides
- Bundled Radix / Material / etc. ramp sets
- Editor autocomplete for `rampStops`
- Function renderer special-case for `ramp` (CSS output stays as plain hex — fine)
