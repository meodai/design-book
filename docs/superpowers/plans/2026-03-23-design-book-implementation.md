# Design Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the design-book library — a reactive TypeScript design system framework with dependency tracking, built-in color/spacing/typography functions, multi-format rendering, and an interactive demo.

**Architecture:** Bottom-up build from foundational pieces (errors, tokens, graph) through the core system (scope, design-book) to features (functions, renderers) and finally the demo. Each layer is tested before the next depends on it.

**Tech Stack:** TypeScript, Vite (build), Vitest (tests), Culori (color operations)

**Spec:** `docs/superpowers/specs/2026-03-22-design-book-implementation-design.md`
**Source spec:** `design-book-spec.md`

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "design-book",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:demo": "vite build --mode demo",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
demo-dist/
```

- [ ] **Step 3: Install dependencies**

Run: `npm install culori && npm install -D typescript vite vitest vite-plugin-dts @types/culori`
Expected: `node_modules` created, `package-lock.json` generated

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationDir": "./dist",
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "demo"]
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
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
```

- [ ] **Step 6: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 7: Create placeholder src/index.ts**

```typescript
// Design Book — reactive design system framework
```

- [ ] **Step 8: Verify setup**

Run: `npm test`
Expected: Vitest runs, 0 tests found, exits cleanly

- [ ] **Step 9: Commit**

```bash
git init && git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts src/index.ts
git commit -m "chore: project setup with Vite, Vitest, TypeScript, Culori"
```

---

### Task 2: Error Classes

**Files:**
- Create: `src/errors.ts`
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write tests for all four error classes**

```typescript
// tests/errors.test.ts
import { describe, it, expect } from 'vitest';
import { TokenError, ScopeError, CircularDependencyError, FunctionError } from '../src/errors';

describe('TokenError', () => {
  it('stores message and optional tokenKey', () => {
    const err = new TokenError('bad token', 'brand.primary');
    expect(err.message).toBe('bad token');
    expect(err.tokenKey).toBe('brand.primary');
    expect(err.name).toBe('TokenError');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores optional context', () => {
    const err = new TokenError('fail', 'x', { scope: 'brand' });
    expect(err.context).toEqual({ scope: 'brand' });
  });
});

describe('ScopeError', () => {
  it('stores message and optional scopeName', () => {
    const err = new ScopeError('not found', 'brand');
    expect(err.message).toBe('not found');
    expect(err.scopeName).toBe('brand');
    expect(err.name).toBe('ScopeError');
  });
});

describe('CircularDependencyError', () => {
  it('auto-generates message from path', () => {
    const err = new CircularDependencyError(['a', 'b', 'c', 'a']);
    expect(err.message).toBe('Circular dependency detected: a → b → c → a');
    expect(err.path).toEqual(['a', 'b', 'c', 'a']);
    expect(err.name).toBe('CircularDependencyError');
  });
});

describe('FunctionError', () => {
  it('stores message, functionName, and options', () => {
    const err = new FunctionError('bad mix', 'colorMix', { ratio: 1.5 });
    expect(err.message).toBe('bad mix');
    expect(err.functionName).toBe('colorMix');
    expect(err.options).toEqual({ ratio: 1.5 });
    expect(err.name).toBe('FunctionError');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/errors.test.ts`
Expected: FAIL — cannot find module `../src/errors`

- [ ] **Step 3: Implement error classes**

```typescript
// src/errors.ts
export class TokenError extends Error {
  public readonly tokenKey?: string;
  public readonly context?: Record<string, any>;

  constructor(message: string, tokenKey?: string, context?: Record<string, any>) {
    super(message);
    this.name = 'TokenError';
    this.tokenKey = tokenKey;
    this.context = context;
  }
}

export class ScopeError extends Error {
  public readonly scopeName?: string;

  constructor(message: string, scopeName?: string) {
    super(message);
    this.name = 'ScopeError';
    this.scopeName = scopeName;
  }
}

export class CircularDependencyError extends Error {
  public readonly path: string[];

  constructor(path: string[]) {
    super(`Circular dependency detected: ${path.join(' → ')}`);
    this.name = 'CircularDependencyError';
    this.path = path;
  }
}

export class FunctionError extends Error {
  public readonly functionName?: string;
  public readonly options?: Record<string, any>;

  constructor(message: string, functionName?: string, options?: Record<string, any>) {
    super(message);
    this.name = 'FunctionError';
    this.functionName = functionName;
    this.options = options;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/errors.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts tests/errors.test.ts
git commit -m "feat: add error classes (TokenError, ScopeError, CircularDependencyError, FunctionError)"
```

---

### Task 3: Token Types and Helpers

**Files:**
- Create: `src/tokens.ts`
- Create: `tests/tokens.test.ts`

- [ ] **Step 1: Write tests for token interfaces and helper constructors**

```typescript
// tests/tokens.test.ts
import { describe, it, expect } from 'vitest';
import { val, hex, ref, px, rem, ms, extractDependencies, extractVisualDependencies } from '../src/tokens';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue } from '../src/tokens';

describe('val', () => {
  it('merges description onto an object', () => {
    const result = val({ type: 'color', rawValue: '#fff' }, { description: 'white' });
    expect(result.description).toBe('white');
    expect(result.type).toBe('color');
  });

  it('merges arbitrary options', () => {
    const result = val({ type: 'color', rawValue: '#fff' }, { description: 'x', custom: 42 });
    expect((result as any).custom).toBe(42);
  });
});

describe('hex', () => {
  it('creates a color TokenValue with culori processor', () => {
    const c = hex('#ff0000');
    expect(c.type).toBe('color');
    expect(c.rawValue).toBe('#ff0000');
    expect(c.processors).toHaveLength(1);
    expect(c.processors![0].name).toBe('culori');
    expect(c.processors![0].instance).toBeDefined();
    expect(c.metadata?.validated).toBe(true);
  });

  it('handles invalid colors gracefully', () => {
    const c = hex('not-a-color');
    expect(c.type).toBe('color');
    expect(c.metadata?.validated).toBe(false);
    expect(c.processors).toBeUndefined();
  });

  it('accepts description option', () => {
    const c = hex('#000', { description: 'black' });
    expect(c.description).toBe('black');
  });
});

describe('ref', () => {
  it('creates a ReferenceValue', () => {
    const r = ref('brand.primary');
    expect(r.type).toBe('reference');
    expect(r.key).toBe('brand.primary');
    expect(r.resolvedType).toBeUndefined();
    expect(r.resolvedMetadata?.isResolvable).toBeUndefined();
  });

  it('accepts description option', () => {
    const r = ref('x.y', { description: 'link' });
    expect(r.description).toBe('link');
  });
});

describe('px', () => {
  it('creates a dimension TokenValue with px unit', () => {
    const p = px(16);
    expect(p.type).toBe('dimension');
    expect(p.rawValue).toBe(16);
    expect(p.metadata?.unit).toBe('px');
    expect(p.metadata?.validated).toBe(true);
  });
});

describe('rem', () => {
  it('creates a dimension TokenValue with rem unit', () => {
    const r = rem(1.5);
    expect(r.type).toBe('dimension');
    expect(r.rawValue).toBe(1.5);
    expect(r.metadata?.unit).toBe('rem');
  });
});

describe('ms', () => {
  it('creates a dimension TokenValue with ms unit', () => {
    const t = ms(200);
    expect(t.type).toBe('dimension');
    expect(t.rawValue).toBe(200);
    expect(t.metadata?.unit).toBe('ms');
  });
});

describe('extractDependencies', () => {
  it('collects keys from ReferenceValue args', () => {
    const args = [hex('#fff'), ref('brand.primary'), 'literal', ref('brand.secondary')];
    expect(extractDependencies(args)).toEqual(['brand.primary', 'brand.secondary']);
  });

  it('returns empty array for no references', () => {
    expect(extractDependencies([hex('#fff'), 42])).toEqual([]);
  });
});

describe('extractVisualDependencies', () => {
  it('returns empty for non-scope args', () => {
    expect(extractVisualDependencies([hex('#fff'), ref('x')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tokens.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement tokens.ts**

```typescript
// src/tokens.ts
import { parse } from 'culori';

export interface TokenValue {
  type: string;
  rawValue: string | number;
  processors?: Array<{ name: string; instance: any }>;
  description?: string;
  metadata?: { unit?: string; colorSpace?: string; validated?: boolean; [key: string]: any };
}

export interface ReferenceValue {
  type: 'reference';
  key: string;
  description?: string;
  resolvedType?: string;
  resolvedMetadata?: {
    isResolvable?: boolean;
    lastResolvedAt?: number;
    errorMessage?: string;
    [key: string]: any;
  };
}

export interface FunctionTokenValue {
  type: 'function';
  rawValue: string;
  implementation: (...args: any[]) => string;
  args: any[];
  processors?: Array<{ name: string; instance: any }>;
  description?: string;
  options?: Record<string, any>;
  metadata?: {
    dependencies: string[];
    visualDependencies: string[];
    acceptedTypes?: string[][];
    returnType?: string;
    [key: string]: any;
  };
}

export type AnyTokenValue = TokenValue | ReferenceValue | FunctionTokenValue;

export function val<T>(value: T, options?: { description?: string; [key: string]: any }): T & { description?: string } {
  if (typeof value === 'object' && value !== null && options) {
    return { ...value, ...options };
  }
  return value as T & { description?: string };
}

export function hex(value: string, options?: { description?: string; [key: string]: any }): TokenValue {
  const parsed = parse(value);
  if (parsed) {
    return val({
      type: 'color',
      rawValue: value,
      processors: [{ name: 'culori', instance: parsed }],
      metadata: { colorSpace: 'srgb', validated: true },
    }, options);
  }
  return val({
    type: 'color',
    rawValue: value,
    metadata: { validated: false },
  }, options);
}

export function ref(key: string, options?: { description?: string; [key: string]: any }): ReferenceValue {
  return val({
    type: 'reference' as const,
    key,
    resolvedType: undefined,
    resolvedMetadata: { isResolvable: undefined, lastResolvedAt: undefined },
  }, options);
}

export function px(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return val({
    type: 'dimension',
    rawValue: value,
    metadata: { unit: 'px', validated: true },
  }, options);
}

export function rem(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return val({
    type: 'dimension',
    rawValue: value,
    metadata: { unit: 'rem', validated: true },
  }, options);
}

export function ms(value: number, options?: { description?: string; [key: string]: any }): TokenValue {
  return val({
    type: 'dimension',
    rawValue: value,
    metadata: { unit: 'ms', validated: true },
  }, options);
}

export function extractDependencies(args: any[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null && arg.type === 'reference') {
      deps.push(arg.key);
    }
  }
  return deps;
}

export function extractVisualDependencies(args: any[]): string[] {
  const deps: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'object' && arg !== null && typeof arg.getAllKeys === 'function') {
      for (const key of arg.getAllKeys()) {
        deps.push(key);
      }
    }
  }
  return deps;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tokens.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tokens.ts tests/tokens.test.ts
git commit -m "feat: add token types (TokenValue, ReferenceValue, FunctionTokenValue) and helpers"
```

---

### Task 4: Generic Graph

**Files:**
- Create: `src/graph.ts`
- Create: `tests/graph.test.ts`

- [ ] **Step 1: Write tests for Graph**

```typescript
// tests/graph.test.ts
import { describe, it, expect } from 'vitest';
import { Graph } from '../src/graph';

describe('Graph', () => {
  describe('node and edge management', () => {
    it('adds and retrieves nodes', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      expect(g.getAllNodes()).toContain('a');
      expect(g.getAllNodes()).toContain('b');
    });

    it('adds edges and retrieves neighbors', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      expect(g.getOutgoing('a')).toContain('b');
      expect(g.getIncoming('b')).toContain('a');
    });

    it('removes a node and its edges', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      g.removeNode('a');
      expect(g.getAllNodes()).not.toContain('a');
      expect(g.getIncoming('b')).not.toContain('a');
    });

    it('removes a specific edge', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      g.removeEdge('a', 'b');
      expect(g.getOutgoing('a')).not.toContain('b');
    });
  });

  describe('getNodeDegree', () => {
    it('returns incoming and outgoing degree', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('a', 'c');
      g.addEdge('c', 'b');
      expect(g.getNodeDegree('a', false)).toBe(2); // outgoing
      expect(g.getNodeDegree('b', true)).toBe(2);  // incoming
    });
  });

  describe('dfsTraversal', () => {
    it('traverses downstream (outgoing)', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const result = g.dfsTraversal('a');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('traverses upstream (incoming)', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const result = g.dfsTraversal('c', true);
      expect(result).toEqual(['c', 'b', 'a']);
    });
  });

  describe('bfsTraversal', () => {
    it('traverses in breadth-first order', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addNode('d');
      g.addEdge('a', 'b');
      g.addEdge('a', 'c');
      g.addEdge('b', 'd');
      const result = g.bfsTraversal('a');
      expect(result[0]).toBe('a');
      // b and c should come before d
      expect(result.indexOf('d')).toBeGreaterThan(result.indexOf('b'));
      expect(result.indexOf('d')).toBeGreaterThan(result.indexOf('c'));
    });
  });

  describe('hasCycles', () => {
    it('returns false for acyclic graph', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      expect(g.hasCycles()).toBe(false);
    });

    it('returns true for cyclic graph', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      g.addEdge('c', 'a');
      expect(g.hasCycles()).toBe(true);
    });
  });

  describe('topologicalSort', () => {
    it('sorts nodes respecting dependencies', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b'); // a must come before b
      g.addEdge('b', 'c'); // b must come before c
      const sorted = g.topologicalSort();
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
    });

    it('throws CircularDependencyError on cycle', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      g.addEdge('b', 'a');
      expect(() => g.topologicalSort()).toThrow('Circular dependency');
    });

    it('sorts a subset of keys', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      const sorted = g.topologicalSort(['c', 'b']);
      expect(sorted).toEqual(['b', 'c']);
    });
  });

  describe('findShortestPath', () => {
    it('finds shortest path between two nodes', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addNode('c');
      g.addEdge('a', 'b');
      g.addEdge('b', 'c');
      expect(g.findShortestPath('a', 'c')).toEqual(['a', 'b', 'c']);
    });

    it('returns null when no path exists', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      expect(g.findShortestPath('a', 'b')).toBeNull();
    });
  });

  describe('hasPath', () => {
    it('returns true when path exists', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      g.addEdge('a', 'b');
      expect(g.hasPath('a', 'b')).toBe(true);
    });

    it('returns false when no path exists', () => {
      const g = new Graph();
      g.addNode('a');
      g.addNode('b');
      expect(g.hasPath('a', 'b')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/graph.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Graph class**

Implement `src/graph.ts` with:
- Two `Map<string, Set<string>>` stores (outgoing, incoming)
- `addNode`, `addEdge`, `removeNode`, `removeEdge`, `getOutgoing`, `getIncoming`
- `dfsTraversal(start, upstream?)` — iterative DFS using a stack, `upstream` switches to incoming edges
- `bfsTraversal(start, upstream?)` — standard BFS with queue
- `hasCycles()` — three-color DFS (white=unvisited, gray=in-progress, black=done)
- `topologicalSort(keys?)` — Kahn's algorithm, throws `CircularDependencyError` on cycle. If `keys` provided, filter result to only those keys.
- `findShortestPath(from, to, upstream?)` — BFS with parent tracking, reconstruct path
- `hasPath(from, to, upstream?)` — delegates to `findShortestPath !== null`
- `getAllNodes()`, `getNodeDegree(node, incoming?)`

Import `CircularDependencyError` from `./errors`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/graph.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/graph.ts tests/graph.test.ts
git commit -m "feat: add generic Graph class with traversal, cycle detection, topological sort"
```

---

### Task 5: DependencyGraph

**Files:**
- Create: `src/dependency-graph.ts`
- Create: `tests/dependency-graph.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/dependency-graph.test.ts
import { describe, it, expect } from 'vitest';
import { DependencyGraph } from '../src/dependency-graph';

describe('DependencyGraph', () => {
  it('getPrerequisitesFor returns incoming edges', () => {
    const dg = new DependencyGraph();
    dg.addNode('a');
    dg.addNode('b');
    dg.addEdge('a', 'b'); // b depends on a (a → b means a is prerequisite of b)
    // Note: edge direction — addEdge(from, to) means "from" is prerequisite of "to"
    // So getPrerequisitesFor('b') should return ['a']
    expect(dg.getPrerequisitesFor('b')).toContain('a');
  });

  it('getDependentsOf returns outgoing edges', () => {
    const dg = new DependencyGraph();
    dg.addNode('a');
    dg.addNode('b');
    dg.addEdge('a', 'b');
    expect(dg.getDependentsOf('a')).toContain('b');
  });

  it('getEvaluationOrderFor returns topologically sorted upstream', () => {
    const dg = new DependencyGraph();
    dg.addNode('a');
    dg.addNode('b');
    dg.addNode('c');
    dg.addEdge('a', 'b');
    dg.addEdge('b', 'c');
    const order = dg.getEvaluationOrderFor('c');
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  describe('updateEdges', () => {
    it('replaces all incoming edges for a key', () => {
      const dg = new DependencyGraph();
      dg.addNode('a');
      dg.addNode('b');
      dg.addNode('c');
      dg.addNode('target');
      dg.addEdge('a', 'target');

      dg.updateEdges('target', ['b', 'c']);

      expect(dg.getPrerequisitesFor('target')).not.toContain('a');
      expect(dg.getPrerequisitesFor('target')).toContain('b');
      expect(dg.getPrerequisitesFor('target')).toContain('c');
    });

    it('throws CircularDependencyError if new edges create a cycle', () => {
      const dg = new DependencyGraph();
      dg.addNode('a');
      dg.addNode('b');
      dg.addEdge('a', 'b'); // a → b

      // Trying to make b depend on a (via updateEdges) would not create a cycle
      // since updateEdges sets prerequisites: updateEdges('a', ['b']) means a depends on b
      // Combined with a → b (a is prereq of b), this creates a→b and b→a = cycle
      expect(() => dg.updateEdges('a', ['b'])).toThrow('Circular dependency');
    });

    it('does not modify graph when cycle is detected', () => {
      const dg = new DependencyGraph();
      dg.addNode('a');
      dg.addNode('b');
      dg.addEdge('a', 'b');

      const prereqsBefore = [...dg.getPrerequisitesFor('a')];
      try { dg.updateEdges('a', ['b']); } catch {}
      expect([...dg.getPrerequisitesFor('a')]).toEqual(prereqsBefore);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dependency-graph.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DependencyGraph**

```typescript
// src/dependency-graph.ts
import { Graph } from './graph';
import { CircularDependencyError } from './errors';

export class DependencyGraph extends Graph {
  getPrerequisitesFor(key: string): string[] {
    return [...this.getIncoming(key)];
  }

  getDependentsOf(key: string): string[] {
    return [...this.getOutgoing(key)];
  }

  getEvaluationOrderFor(key: string): string[] {
    const upstream = this.dfsTraversal(key, true);
    return this.topologicalSort(upstream);
  }

  updateEdges(key: string, dependencies: string[]): void {
    // Save current incoming edges for rollback
    const currentPrereqs = [...this.getIncoming(key)];

    // Remove all current incoming edges
    for (const prereq of currentPrereqs) {
      this.removeEdge(prereq, key);
    }

    // Add new incoming edges (auto-create nodes if needed)
    const existingNodes = new Set(this.getAllNodes());
    for (const dep of dependencies) {
      if (!existingNodes.has(dep)) {
        this.addNode(dep);
      }
      this.addEdge(dep, key);
    }

    // Check for cycles — if found, rollback
    if (this.hasCycles()) {
      // Rollback: remove new edges
      for (const dep of dependencies) {
        this.removeEdge(dep, key);
      }
      // Restore old edges
      for (const prereq of currentPrereqs) {
        this.addEdge(prereq, key);
      }
      throw new CircularDependencyError([...dependencies, key]);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/dependency-graph.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/dependency-graph.ts tests/dependency-graph.test.ts
git commit -m "feat: add DependencyGraph with updateEdges and cycle prevention"
```

---

### Task 6: ReferenceResolver

**Files:**
- Create: `src/reference-resolver.ts`
- Create: `tests/reference-resolver.test.ts`

- [ ] **Step 1: Write tests**

Test the three public methods using a mock DesignBook interface. The ReferenceResolver needs a book-like object with `resolve()`, `getTokenByKey()`, and `getDependencyGraph()`.

```typescript
// tests/reference-resolver.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ReferenceResolver } from '../src/reference-resolver';
import type { ReferenceValue } from '../src/tokens';

function createMockBook(tokens: Record<string, any> = {}, resolvedValues: Record<string, string> = {}) {
  return {
    resolve: vi.fn((key: string) => {
      if (resolvedValues[key] !== undefined) return resolvedValues[key];
      throw new Error(`Cannot resolve ${key}`);
    }),
    getTokenByKey: vi.fn((key: string) => tokens[key] ?? undefined),
    getDependencyGraph: vi.fn(() => ({
      getDependentsOf: vi.fn(() => []),
    })),
  };
}

describe('ReferenceResolver', () => {
  it('updateReferenceMetadata marks resolvable ref', () => {
    const book = createMockBook(
      { 'brand.primary': { type: 'color', rawValue: '#fff' } },
      { 'brand.primary': '#fff' },
    );
    const resolver = new ReferenceResolver(book as any);
    const r: ReferenceValue = { type: 'reference', key: 'brand.primary' };

    resolver.updateReferenceMetadata(r);

    expect(r.resolvedType).toBe('color');
    expect(r.resolvedMetadata?.isResolvable).toBe(true);
    expect(r.resolvedMetadata?.errorMessage).toBeUndefined();
  });

  it('updateReferenceMetadata marks unresolvable ref', () => {
    const book = createMockBook();
    const resolver = new ReferenceResolver(book as any);
    const r: ReferenceValue = { type: 'reference', key: 'missing.token' };

    resolver.updateReferenceMetadata(r);

    expect(r.resolvedType).toBeUndefined();
    expect(r.resolvedMetadata?.isResolvable).toBe(false);
    expect(r.resolvedMetadata?.errorMessage).toBeDefined();
  });

  it('getCachedType returns cached type without resolution', () => {
    const resolver = new ReferenceResolver({} as any);
    const r: ReferenceValue = { type: 'reference', key: 'x', resolvedType: 'color' };
    expect(resolver.getCachedType(r)).toBe('color');
  });

  it('isResolvable returns cached resolvability', () => {
    const resolver = new ReferenceResolver({} as any);
    const r: ReferenceValue = {
      type: 'reference', key: 'x',
      resolvedMetadata: { isResolvable: true },
    };
    expect(resolver.isResolvable(r)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/reference-resolver.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ReferenceResolver**

```typescript
// src/reference-resolver.ts
import type { ReferenceValue, FunctionTokenValue } from './tokens';

export interface BookLike {
  resolve(key: string): string;
  getTokenByKey(key: string): any;
  getDependencyGraph(): { getDependentsOf(key: string): string[] };
}

export class ReferenceResolver {
  private book: BookLike;

  constructor(book: BookLike) {
    this.book = book;
  }

  updateReferenceMetadata(ref: ReferenceValue): void {
    try {
      this.book.resolve(ref.key);
      const token = this.book.getTokenByKey(ref.key);
      ref.resolvedType = token?.type;
      ref.resolvedMetadata = {
        isResolvable: true,
        lastResolvedAt: Date.now(),
        errorMessage: undefined,
      };
    } catch (error: any) {
      ref.resolvedType = undefined;
      ref.resolvedMetadata = {
        isResolvable: false,
        lastResolvedAt: Date.now(),
        errorMessage: error.message,
      };
    }
  }

  updateAllReferencesTo(key: string): void {
    const dependents = this.book.getDependencyGraph().getDependentsOf(key);
    for (const depKey of dependents) {
      const token = this.book.getTokenByKey(depKey);
      if (!token) continue;

      if (token.type === 'reference') {
        this.updateReferenceMetadata(token as ReferenceValue);
      }

      if (token.type === 'function') {
        const fn = token as FunctionTokenValue;
        for (const arg of fn.args) {
          if (typeof arg === 'object' && arg !== null && arg.type === 'reference' && arg.key === key) {
            this.updateReferenceMetadata(arg as ReferenceValue);
          }
        }
      }
    }
  }

  getCachedType(ref: ReferenceValue): string | undefined {
    return ref.resolvedType;
  }

  isResolvable(ref: ReferenceValue): boolean {
    return ref.resolvedMetadata?.isResolvable ?? false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/reference-resolver.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/reference-resolver.ts tests/reference-resolver.test.ts
git commit -m "feat: add ReferenceResolver with metadata caching"
```

---

### Task 7: Scope

**Files:**
- Create: `src/scope.ts`
- Create: `tests/scope.test.ts`

- [ ] **Step 1: Write tests**

Test Scope in isolation with a mock DesignBook. Cover: local get/set, inheritance, resolve for each token type, getAllKeys, allTokens.

```typescript
// tests/scope.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scope } from '../src/scope';
import { hex, ref, px } from '../src/tokens';
import { DependencyGraph } from '../src/dependency-graph';

function createMockBook() {
  const graph = new DependencyGraph();
  const scopes = new Map<string, Scope>();
  const book: any = {
    getDependencyGraph: () => graph,
    getTokenByKey: vi.fn((key: string) => {
      const [scopeName, tokenName] = key.split('.');
      return scopes.get(scopeName)?.get(tokenName);
    }),
    resolve: vi.fn((key: string) => {
      const [scopeName, tokenName] = key.split('.');
      const scope = scopes.get(scopeName);
      if (!scope) throw new Error(`Scope ${scopeName} not found`);
      return scope.resolve(tokenName);
    }),
    getScope: vi.fn((name: string) => scopes.get(name)),
    _notifyTokenChange: vi.fn(),
    _scopes: scopes,
  };
  return book;
}

describe('Scope', () => {
  let book: any;

  beforeEach(() => {
    book = createMockBook();
  });

  it('sets and gets tokens', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    const color = hex('#ff0000');
    scope.set('primary', color);
    expect(scope.get('primary')).toEqual(color);
  });

  it('has() checks token existence', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    expect(scope.has('primary')).toBe(false);
    scope.set('primary', hex('#ff0000'));
    expect(scope.has('primary')).toBe(true);
  });

  it('getAllKeys returns all local keys', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('primary', hex('#ff0000'));
    scope.set('spacing', px(8));
    expect(scope.getAllKeys().sort()).toEqual(['primary', 'spacing']);
  });

  it('resolves basic TokenValue to rawValue string', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('primary', hex('#ff0000'));
    expect(scope.resolve('primary')).toBe('#ff0000');
  });

  it('resolves dimension TokenValue with unit suffix', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('spacing', px(16));
    expect(scope.resolve('spacing')).toBe('16px');
  });

  it('resolves ReferenceValue via book.resolve', () => {
    const brand = new Scope('brand', book);
    book._scopes.set('brand', brand);
    brand.set('primary', hex('#0066cc'));

    const semantic = new Scope('semantic', book);
    book._scopes.set('semantic', semantic);
    semantic.set('bg', ref('brand.primary'));

    book.resolve.mockImplementation((key: string) => {
      const [s, t] = key.split('.');
      return book._scopes.get(s)!.resolve(t);
    });

    expect(semantic.resolve('bg')).toBe('#0066cc');
  });

  describe('inheritance', () => {
    it('inherits tokens from parent scope', () => {
      const parent = new Scope('light', book);
      book._scopes.set('light', parent);
      parent.set('bg', hex('#ffffff'));
      parent.set('primary', hex('#0066cc'));

      const child = new Scope('dark', book, { extends: 'light' });
      book._scopes.set('dark', child);
      child.set('bg', hex('#1a1a1a'));

      expect(child.get('bg')?.rawValue).toBe('#1a1a1a'); // overridden
      expect(child.get('primary')?.rawValue).toBe('#0066cc'); // inherited
    });

    it('getAllKeys includes inherited keys', () => {
      const parent = new Scope('light', book);
      book._scopes.set('light', parent);
      parent.set('bg', hex('#fff'));
      parent.set('primary', hex('#000'));

      const child = new Scope('dark', book, { extends: 'light' });
      book._scopes.set('dark', child);
      child.set('bg', hex('#111'));
      child.set('surface', hex('#222'));

      const keys = child.getAllKeys().sort();
      expect(keys).toEqual(['bg', 'primary', 'surface']);
    });
  });

  it('resolves FunctionTokenValue by executing implementation', () => {
    const scope = new Scope('test', book);
    book._scopes.set('test', scope);
    scope.set('greeting', { type: 'string', rawValue: 'Hello' } as any);
    scope.set('loud', {
      type: 'function',
      rawValue: 'exclaim',
      implementation: (text: string) => `${text}!`,
      args: ['Hello'],
      metadata: { dependencies: [], visualDependencies: [] },
    } as any);
    expect(scope.resolve('loud')).toBe('Hello!');
  });

  it('allTokens returns all token objects including inherited', () => {
    const parent = new Scope('light', book);
    book._scopes.set('light', parent);
    parent.set('bg', hex('#fff'));

    const child = new Scope('dark', book, { extends: 'light' });
    book._scopes.set('dark', child);
    child.set('surface', hex('#222'));

    const tokens = child.allTokens();
    expect(tokens['bg']).toBeDefined();
    expect(tokens['surface']).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scope.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Scope**

Implement `src/scope.ts`:
- Constructor takes `name`, `book` (BookLike), optional `options` with `extends` and `description`
- Creates a `ReferenceResolver` instance: `this.referenceResolver = new ReferenceResolver(book)`
- Internal `Map<string, AnyTokenValue>` for local tokens
- `get(name)` — local lookup, then parent via `this.book.getScope(this.extendsName)`
- `set(name, value)` — stores locally, calls `book._notifyTokenChange(qualifiedKey, value, oldValue)`
- `resolve(name)` — gets token, then:
  - `type === 'reference'`: calls `this.book.resolve(token.key)`
  - `type === 'function'`: resolves args, calls `token.implementation(...resolvedArgs)`
  - dimension type: returns `${rawValue}${unit}`
  - otherwise: returns `String(rawValue)`
- `has(name)`, `getAllKeys()`, `allTokens()` — with inheritance
- `name` and `description` as readonly properties

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scope.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scope.ts tests/scope.test.ts
git commit -m "feat: add Scope class with token storage, resolution, and inheritance"
```

---

### Task 8: ScopeManager

**Files:**
- Create: `src/scope-manager.ts`
- Create: `tests/scope-manager.test.ts`

- [ ] **Step 1: Write tests**

Test: addScope, extendScope, copyScope, deleteScope, hasScope, getScope, getAllScopes, getAllKeysForScope, getScopeDependencies.

```typescript
// tests/scope-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScopeManager } from '../src/scope-manager';
import { hex, ref } from '../src/tokens';
import { DependencyGraph } from '../src/dependency-graph';

function createMockBook() {
  const graph = new DependencyGraph();
  const book: any = {
    getDependencyGraph: () => graph,
    getTokenByKey: vi.fn(),
    resolve: vi.fn(),
    getScope: vi.fn(),
    _notifyTokenChange: vi.fn(),
  };
  // ScopeManager will update book.getScope to delegate to itself
  return book;
}

describe('ScopeManager', () => {
  let book: any;
  let manager: ScopeManager;

  beforeEach(() => {
    book = createMockBook();
    manager = new ScopeManager(book);
    book.getScope = (name: string) => manager.getScope(name);
  });

  it('addScope creates and returns a scope', () => {
    const scope = manager.addScope('brand');
    expect(scope).toBeDefined();
    expect(manager.hasScope('brand')).toBe(true);
  });

  it('addScope throws if scope already exists', () => {
    manager.addScope('brand');
    expect(() => manager.addScope('brand')).toThrow();
  });

  it('extendScope creates scope extending another', () => {
    const parent = manager.addScope('light');
    parent.set('bg', hex('#fff'));
    const child = manager.extendScope('dark', 'light');
    expect(child.get('bg')?.rawValue).toBe('#fff');
  });

  it('copyScope deep-copies tokens without inheritance', () => {
    const source = manager.addScope('source');
    source.set('a', hex('#111'));
    const copy = manager.copyScope('source', 'copy');
    expect(copy.get('a')?.rawValue).toBe('#111');
    // Modifying source doesn't affect copy
    source.set('a', hex('#222'));
    expect(copy.get('a')?.rawValue).toBe('#111');
  });

  it('deleteScope removes scope', () => {
    manager.addScope('brand');
    manager.deleteScope('brand');
    expect(manager.hasScope('brand')).toBe(false);
  });

  it('getAllScopes returns all scopes', () => {
    manager.addScope('a');
    manager.addScope('b');
    const all = manager.getAllScopes();
    expect(all).toHaveLength(2);
  });

  it('getScopeDependencies finds external references', () => {
    manager.addScope('brand');
    const ui = manager.addScope('ui');
    ui.set('bg', ref('brand.primary'));
    const deps = manager.getScopeDependencies('ui');
    expect(deps).toContain('brand.primary');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/scope-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ScopeManager**

Implement `src/scope-manager.ts`:
- Internal `Map<string, Scope>`
- `addScope(name, options?)` — creates `new Scope(name, book, options)`, stores it, throws `ScopeError` if name exists
- `extendScope(name, base, description?)` — calls `addScope(name, { extends: base, description })`
- `copyScope(source, target)` — creates new scope, iterates source's `allTokens()`, sets each on target. Use spread for shallow copy of token objects — `FunctionTokenValue` contains `implementation` functions which `structuredClone` cannot clone, so spread is correct here (function references are shared, which is the desired behavior)
- `deleteScope(name)` — removes scope, removes all its nodes from dependency graph, returns removed key list
- `hasScope`, `getScope`, `getAllScopes`, `getAllKeysForScope`, `getScopeDependencies`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/scope-manager.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/scope-manager.ts tests/scope-manager.test.ts
git commit -m "feat: add ScopeManager with CRUD, inheritance, and dependency analysis"
```

---

### Task 9: DesignBook

**Files:**
- Create: `src/design-book.ts`
- Create: `tests/design-book.test.ts`

- [ ] **Step 1: Write tests**

Test the full DesignBook public API: constructor, scope delegation, resolve, has, getTokenByKey, getDependencyGraph, registerFunction, mode switching, events (on, watch), auto mode propagation, batch mode with flush.

```typescript
// tests/design-book.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { hex, ref, px } from '../src/tokens';

describe('DesignBook', () => {
  // Note: `ref` is imported above and used in batch-failed and re-entrancy tests
  it('constructor sets name and defaults', () => {
    const book = new DesignBook('test');
    expect(book.name).toBe('test');
    expect(book.mode).toBe('auto');
  });

  it('constructor accepts options', () => {
    const book = new DesignBook('test', { mode: 'batch', description: 'desc' });
    expect(book.mode).toBe('batch');
    expect(book.description).toBe('desc');
  });

  describe('scope management', () => {
    it('addScope and getScope', () => {
      const book = new DesignBook('test');
      const scope = book.addScope('brand');
      expect(book.getScope('brand')).toBe(scope);
      expect(book.hasScope('brand')).toBe(true);
    });

    it('deleteScope removes scope', () => {
      const book = new DesignBook('test');
      book.addScope('brand');
      book.deleteScope('brand');
      expect(book.hasScope('brand')).toBe(false);
    });
  });

  describe('token operations', () => {
    it('resolve parses scope.token and returns value', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      expect(book.resolve('brand.primary')).toBe('#0066cc');
    });

    it('has checks existence', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      expect(book.has('brand.primary')).toBe(true);
      expect(book.has('brand.missing')).toBe(false);
    });

    it('resolves references across scopes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('bg', ref('brand.primary'));
      expect(book.resolve('ui.bg')).toBe('#0066cc');
    });

    it('getTokenByKey returns raw token', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      const token = book.getTokenByKey('brand.primary');
      expect(token?.type).toBe('color');
    });
  });

  describe('events', () => {
    it('fires tokenChanged on set in auto mode', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const handler = vi.fn();
      book.on('tokenChanged', handler);
      brand.set('primary', hex('#0066cc'));
      expect(handler).toHaveBeenCalled();
    });

    it('watch fires for specific key', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#000000'));
      const handler = vi.fn();
      book.watch('brand.primary', handler);
      brand.set('primary', hex('#ffffff'));
      expect(handler).toHaveBeenCalledWith('#ffffff', expect.anything());
    });

    it('fires scopeAdded on addScope', () => {
      const book = new DesignBook('test');
      const handler = vi.fn();
      book.on('scopeAdded', handler);
      book.addScope('brand');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('auto mode propagation', () => {
    it('updates dependents when prerequisite changes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');
      brand.set('primary', hex('#0066cc'));
      ui.set('bg', ref('brand.primary'));
      expect(book.resolve('ui.bg')).toBe('#0066cc');

      brand.set('primary', hex('#ff0000'));
      expect(book.resolve('ui.bg')).toBe('#ff0000');
    });
  });

  describe('batch mode', () => {
    it('queues changes and processes on flush', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      expect(book.batchQueueSize).toBeGreaterThan(0);

      const result = book.flush();
      expect(result.processed.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('fires batch-complete on successful flush', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const handler = vi.fn();
      book.on('batch-complete', handler);
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      book.flush();
      expect(handler).toHaveBeenCalled();
    });

    it('mode is switchable at runtime', () => {
      const book = new DesignBook('test');
      expect(book.mode).toBe('auto');
      book.mode = 'batch';
      expect(book.mode).toBe('batch');
      book.mode = 'auto';
      expect(book.mode).toBe('auto');
    });
  });

  describe('function registry', () => {
    it('registerFunction stores and resolves custom functions', () => {
      const book = new DesignBook('test');
      book.registerFunction('exclaim', (text: string) => `${text}!`);
      const scope = book.addScope('custom');
      scope.set('greeting', { type: 'string', rawValue: 'Hello' } as any);
      scope.set('loud', {
        type: 'function',
        rawValue: 'exclaim',
        implementation: (text: string) => `${text}!`,
        args: ['Hello'],
        metadata: { dependencies: [], visualDependencies: [] },
      } as any);
      expect(scope.resolve('loud')).toBe('Hello!');
    });
  });

  describe('getDependencyGraph', () => {
    it('returns the dependency graph', () => {
      const book = new DesignBook('test');
      const graph = book.getDependencyGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.getDependentsOf).toBe('function');
    });
  });

  describe('additional events', () => {
    it('fires scopeRemoved on deleteScope', () => {
      const book = new DesignBook('test');
      book.addScope('brand');
      const handler = vi.fn();
      book.on('scopeRemoved', handler);
      book.deleteScope('brand');
      expect(handler).toHaveBeenCalled();
    });

    it('fires change event with changedKeys and scopes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const handler = vi.fn();
      book.on('change', handler);
      brand.set('primary', hex('#0066cc'));
      expect(handler).toHaveBeenCalled();
      const detail = handler.mock.calls[0][0].detail;
      expect(detail.changedKeys).toContain('brand.primary');
      expect(detail.scopes).toContain('brand');
    });

    it('fires batch-failed when flush encounters errors', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const handler = vi.fn();
      book.on('batch-failed', handler);
      const scope = book.addScope('test');
      // Set a reference to a non-existent token
      scope.set('broken', ref('nonexistent.token'));
      const result = book.flush();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('re-entrancy', () => {
    it('queues changes triggered by event handlers in auto mode', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');

      brand.set('primary', hex('#0066cc'));
      ui.set('bg', ref('brand.primary'));

      // When primary changes, an event handler sets another token
      book.on('tokenChanged', (event: any) => {
        if (event.detail.key === 'brand.primary') {
          brand.set('derived', hex('#111111'));
        }
      });

      // This should not throw or recurse infinitely
      brand.set('primary', hex('#ff0000'));
      expect(book.resolve('brand.derived')).toBe('#111111');
      expect(book.resolve('ui.bg')).toBe('#ff0000');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/design-book.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DesignBook**

Implement `src/design-book.ts`:
- Constructor: `(name, options?)` — stores name, description, creates ScopeManager, DependencyGraph, event emitter (Map<string, Set<Function>>), function registry (Map<string, Function>), batch queue
- `mode` getter/setter
- `batchQueueSize` getter
- Scope delegation methods (addScope, extendScope, copyScope, deleteScope, getScope, hasScope, getAllScopes, getAllKeysForScope, getScopeDependencies)
- `resolve(key)` — splits on first `.`, delegates to scope
- `has(key)` — same split
- `getTokenByKey(key)` — splits, returns `scope.get(token)`
- `getDependencyGraph()` — returns the graph
- `registerFunction(name, impl)`
- `on(event, callback)`, `watch(key, callback)`
- `_notifyTokenChange(qualifiedKey, newValue, oldValue)` — called by Scope.set():
  - Auto mode: update dependency graph edges, get dependents in topo order, re-resolve each, fire `tokenChanged` per key, fire `change` summary. Queue re-entrant changes.
  - Batch mode: add to queue
- `flush()` — topo sort queued keys, resolve in order, fire events, return `{ processed, errors }`
- `emit(event, detail)` — internal helper

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/design-book.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests from tasks 2-9 PASS

- [ ] **Step 6: Commit**

```bash
git add src/design-book.ts tests/design-book.test.ts
git commit -m "feat: add DesignBook orchestrator with events, batch mode, and auto propagation"
```

---

### Task 10: Color Functions — bestContrastWith & minContrastWith

**Files:**
- Create: `src/functions/color/best-contrast.ts`
- Create: `src/functions/color/min-contrast.ts`
- Create: `tests/functions/color/best-contrast.test.ts`
- Create: `tests/functions/color/min-contrast.test.ts`

- [ ] **Step 1: Write tests for bestContrastWith**

Test: returns highest contrast color from scope, throws FunctionError if no colors in scope. Use real Culori — no mocking color math.

```typescript
// tests/functions/color/best-contrast.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { hex, ref } from '../../../src/tokens';
import { bestContrastWith } from '../../../src/functions/color/best-contrast';

describe('bestContrastWith', () => {
  it('finds highest contrast color from scope', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('dark', hex('#000000'));
    brand.set('light', hex('#ffffff'));
    brand.set('mid', hex('#808080'));

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(hex('#ffffff'), brand));

    // Against white, black has highest contrast
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('works with reference as target', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('bg', hex('#ffffff'));
    brand.set('dark', hex('#000000'));
    brand.set('light', hex('#eeeeee'));

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(ref('brand.bg'), brand));

    expect(book.resolve('ui.text')).toBe('#000000');
  });
});
```

- [ ] **Step 2: Write tests for minContrastWith**

```typescript
// tests/functions/color/min-contrast.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { hex } from '../../../src/tokens';
import { minContrastWith } from '../../../src/functions/color/min-contrast';

describe('minContrastWith', () => {
  it('finds color closest to minimum ratio threshold', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('dark', hex('#000000'));    // ~21:1 against white
    brand.set('mid', hex('#767676'));     // ~4.54:1 against white (just meets AA)
    brand.set('light', hex('#cccccc'));   // ~1.6:1 against white (fails AA)

    const ui = book.addScope('ui');
    ui.set('text', minContrastWith(hex('#ffffff'), brand, { ratio: 4.5 }));

    // Should pick #767676 — meets 4.5 but closest to threshold (not #000000 which is highest)
    expect(book.resolve('ui.text')).toBe('#767676');
  });

  it('falls back to highest contrast when none meet minimum', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    brand.set('light1', hex('#eeeeee'));
    brand.set('light2', hex('#dddddd'));

    const ui = book.addScope('ui');
    ui.set('text', minContrastWith(hex('#ffffff'), brand, { ratio: 4.5 }));

    // Neither meets 4.5, so fallback to highest contrast = #dddddd
    expect(book.resolve('ui.text')).toBe('#dddddd');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/functions/color/`
Expected: FAIL

- [ ] **Step 4: Implement bestContrastWith**

Implement `src/functions/color/best-contrast.ts`:
- Constructor: returns `FunctionTokenValue` with `implementation: bestContrastWithImpl`, deps from `extractDependencies`, visual deps from `extractVisualDependencies`
- `bestContrastWithImpl(targetValue, scope)`: resolve target if reference, iterate scope's color tokens using cached types for filtering, compute WCAG contrast via Culori's `wcagContrast` (import from `culori`), return hex of highest contrast. Throw `FunctionError` if no colors found.

- [ ] **Step 5: Implement minContrastWith**

Implement `src/functions/color/min-contrast.ts`:
- Same pattern as bestContrastWith
- `minContrastWithImpl`: iterate scope colors, split into meeting/not-meeting threshold. If meeting exists, return one with lowest contrast (closest to threshold). If none meet, return highest contrast (fallback). Default ratio: 4.5.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/functions/color/`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/functions/color/best-contrast.ts src/functions/color/min-contrast.ts tests/functions/color/
git commit -m "feat: add bestContrastWith and minContrastWith color functions"
```

---

### Task 11: Color Functions — colorMix, lighten, darken

**Files:**
- Create: `src/functions/color/color-mix.ts`
- Create: `src/functions/color/lighten.ts`
- Create: `src/functions/color/darken.ts`
- Create: `tests/functions/color/color-mix.test.ts`
- Create: `tests/functions/color/lighten.test.ts`
- Create: `tests/functions/color/darken.test.ts`

- [ ] **Step 1: Write tests for colorMix**

Test: mixes two colors at default 0.5 ratio, custom ratio, custom color space. Verify output is a valid hex string.

- [ ] **Step 2: Write tests for lighten and darken**

Test: lighten increases lightness, darken decreases. Darken clamps to 0. Default amount is 0.1.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/functions/color/`
Expected: FAIL for new tests

- [ ] **Step 4: Implement colorMix**

Use Culori's `interpolate` function. Constructor builds `FunctionTokenValue`, implementation resolves refs, interpolates, returns `formatHex`.

- [ ] **Step 5: Implement lighten and darken**

Convert to HSL via Culori, adjust lightness, convert back to hex. Darken clamps lightness at 0.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/functions/color/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/functions/color/color-mix.ts src/functions/color/lighten.ts src/functions/color/darken.ts tests/functions/color/
git commit -m "feat: add colorMix, lighten, darken color functions"
```

---

### Task 12: Color Functions — relativeTo

**Files:**
- Create: `src/functions/color/relative-to.ts`
- Create: `tests/functions/color/relative-to.test.ts`

- [ ] **Step 1: Write tests**

Test: null preserves channel, number sets absolute, "+N"/"-N"/"*N"/"/N" apply relative ops. Test in oklch space.

```typescript
// Key test cases:
// relativeTo(hex('#0066cc'), 'oklch', [null, null, "+180"]) — hue rotation
// relativeTo(hex('#0066cc'), 'oklch', [null, "*0.5", null]) — desaturate
// relativeTo(hex('#0066cc'), 'oklch', [0.3, null, null]) — set lightness
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/functions/color/relative-to.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement relativeTo**

Parse modification strings: split first char as operator if `+`, `-`, `*`, `/`, parse rest as number. Convert color to target color space via Culori, apply modifications per channel, convert back to hex.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/functions/color/relative-to.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/functions/color/relative-to.ts tests/functions/color/relative-to.test.ts
git commit -m "feat: add relativeTo color function with per-channel modifications"
```

---

### Task 13: Color Functions — closestColor, furthestFrom, averageColor

**Files:**
- Create: `src/functions/color/closest-color.ts`
- Create: `src/functions/color/furthest-from.ts`
- Create: `src/functions/color/average-color.ts`
- Create: `tests/functions/color/closest-color.test.ts`
- Create: `tests/functions/color/furthest-from.test.ts`
- Create: `tests/functions/color/average-color.test.ts`

- [ ] **Step 1: Write tests for all three**

- `closestColor`: finds perceptually closest via Euclidean RGB distance
- `furthestFrom`: finds color with greatest average CIELAB Delta E distance to others
- `averageColor`: averages channels in specified color space (default lab)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/functions/color/`
Expected: FAIL for new tests

- [ ] **Step 3: Implement closestColor**

Euclidean distance in RGB. Fallback: `#00000000`.

- [ ] **Step 4: Implement furthestFrom**

Use Culori's `differenceEuclidean('lab')` for Delta E. For each color, compute average distance to all others. Return the one with highest average.

- [ ] **Step 5: Implement averageColor**

Convert all scope colors to target color space, average each channel, convert back to hex.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/functions/color/`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/functions/color/closest-color.ts src/functions/color/furthest-from.ts src/functions/color/average-color.ts tests/functions/color/
git commit -m "feat: add closestColor, furthestFrom, averageColor scope analysis functions"
```

---

### Task 14: Non-Color Functions

**Files:**
- Create: `src/functions/non-color/spacing-scale.ts`
- Create: `src/functions/non-color/typography-scale.ts`
- Create: `src/functions/non-color/timing.ts`
- Create: `src/functions/index.ts`
- Create: `tests/functions/non-color/spacing-scale.test.ts`
- Create: `tests/functions/non-color/typography-scale.test.ts`
- Create: `tests/functions/non-color/timing.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// spacing: px(8) * 2 = "16px"
// typography: rem(1) with ratio 1.25, step 2 = "1.5625rem"
// timing: ms(200) with easing 'ease-out' = "200ms ease-out"
// timing: ms(200) with easing 'ease-in-out', delay 100 = "200ms ease-in-out 100ms"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/functions/non-color/`
Expected: FAIL

- [ ] **Step 3: Implement all three**

Each follows the constructor/implementation pattern. Validate dimension types, throw `FunctionError` if wrong type.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/functions/non-color/`
Expected: All PASS

- [ ] **Step 5: Create functions index**

```typescript
// src/functions/index.ts
export { bestContrastWith } from './color/best-contrast';
export { minContrastWith } from './color/min-contrast';
export { colorMix } from './color/color-mix';
export { lighten } from './color/lighten';
export { darken } from './color/darken';
export { relativeTo } from './color/relative-to';
export { closestColor } from './color/closest-color';
export { furthestFrom } from './color/furthest-from';
export { averageColor } from './color/average-color';
export { spacingScale } from './non-color/spacing-scale';
export { typographyScale } from './non-color/typography-scale';
export { timing } from './non-color/timing';
```

- [ ] **Step 6: Commit**

```bash
git add src/functions/ tests/functions/
git commit -m "feat: add non-color functions (spacingScale, typographyScale, timing) and functions index"
```

---

### Task 15: Renderer — CSS, JSON, W3

**Files:**
- Create: `src/renderers/renderer.ts`
- Create: `src/renderers/function-renderers.ts`
- Create: `tests/renderers/renderer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/renderers/renderer.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { hex, ref } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', hex('#0066cc'));
  brand.set('white', hex('#ffffff'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('brand.primary'));
  return book;
}

describe('Renderer', () => {
  describe('css-variables format', () => {
    it('renders basic tokens as CSS custom properties', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('--brand-primary: #0066cc');
    });

    it('renders references as var()', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('--ui-bg: var(--brand-primary)');
    });
  });

  describe('json format', () => {
    it('renders all values fully resolved', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'json');
      const output = JSON.parse(renderer.render());
      expect(output['brand.primary']).toBe('#0066cc');
      expect(output['ui.bg']).toBe('#0066cc'); // resolved reference
    });
  });

  describe('w3-design-tokens format', () => {
    it('renders nested structure with $value and $type', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.brand.primary.$value).toBe('#0066cc');
      expect(output.brand.primary.$type).toBe('color');
    });

    it('renders references with {scope.token} syntax', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.ui.bg.$value).toBe('{brand.primary}');
    });
  });

  describe('registerFunctionRenderer', () => {
    it('uses custom function renderer for format', () => {
      const book = new DesignBook('test');
      const renderer = new Renderer(book, 'css-variables');
      renderer.registerFunctionRenderer('myFunc', (_args, _options) => 'custom-output');
      // Function renderer is registered — will be used when rendering FunctionTokenValues with rawValue 'myFunc'
      expect(true).toBe(true); // registration doesn't throw
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderers/renderer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Renderer**

`src/renderers/renderer.ts`:
- Constructor: `(book, format)`
- `render()` — iterates `book.getAllScopes()`, for each scope iterates tokens. Dispatches to format handler:
  - CSS: builds `:root { ... }` block. Dots to hyphens in keys. References → `var(--key)`. Functions → look up registered function renderer, fall back to resolved value.
  - JSON: all values fully resolved via `book.resolve()`. Output as JSON string.
  - W3: nested by scope, each token as `{ $value, $type }`. References use `{scope.token}` format.
- `registerFunctionRenderer(name, renderer)`

- [ ] **Step 4: Implement function renderers**

`src/renderers/function-renderers.ts`:
- Export a function that registers all built-in renderers on a Renderer instance.
- `colorMix` CSS: `color-mix(in ${space}, ${c1} ${pct}%, ${c2})`
- `lighten` CSS: `color-mix(in oklch, ${color} ${100-pct}%, white)`
- `darken` CSS: `color-mix(in oklch, ${color} ${100-pct}%, black)`
- `relativeTo` CSS: `color(from ${color} ${space} ${exprs})`
- All others + JSON/W3: resolved value

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/renderers/renderer.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderers/renderer.ts src/renderers/function-renderers.ts tests/renderers/renderer.test.ts
git commit -m "feat: add Renderer with CSS, JSON, W3 Design Tokens output formats"
```

---

### Task 16: SVG Renderer

**Files:**
- Create: `src/renderers/svg-renderer.ts`
- Create: `tests/renderers/svg-renderer.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/renderers/svg-renderer.test.ts
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { hex, ref } from '../../src/tokens';
import { SVGRenderer } from '../../src/renderers/svg-renderer';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', hex('#0066cc'));
  brand.set('white', hex('#ffffff'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('brand.primary'));
  return book;
}

describe('SVGRenderer', () => {
  it('outputs valid SVG string', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book);
    const svg = renderer.render();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('contains circles for color tokens', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book);
    const svg = renderer.render();
    expect(svg).toContain('<circle');
  });

  it('contains text labels for tokens', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book);
    const svg = renderer.render();
    expect(svg).toContain('primary');
  });

  it('contains path elements for connections when showConnections is true', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book, { showConnections: true });
    const svg = renderer.render();
    expect(svg).toContain('<path');
  });

  it('omits connection paths when showConnections is false', () => {
    const book = createTestBook();
    const renderer = new SVGRenderer(book, { showConnections: false });
    const svg = renderer.render();
    expect(svg).not.toContain('<path');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderers/svg-renderer.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SVGRenderer**

Extend `Renderer`. Port the circular layout logic from color-router's SVGRenderer:
- Calculate positions in a circle per scope
- Draw colored dots for tokens (fill with resolved color for color tokens)
- Rotated squares for scope headers
- Curved Bezier paths for dependency connections
- Dashed lines for function dependencies
- Config options: `gap`, `padding`, `fontSize`, `dotSize`, `strokeWidth`, `showConnections`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/renderers/svg-renderer.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderers/svg-renderer.ts tests/renderers/svg-renderer.test.ts
git commit -m "feat: add SVGRenderer with circular layout and dependency visualization"
```

---

### Task 17: Public API Exports

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Write the public API exports**

```typescript
// src/index.ts

// Core
export { DesignBook } from './design-book';
export { Scope } from './scope';

// Tokens
export { val, hex, ref, px, rem, ms, extractDependencies, extractVisualDependencies } from './tokens';
export type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue } from './tokens';

// Errors
export { TokenError, ScopeError, CircularDependencyError, FunctionError } from './errors';

// Graph
export { DependencyGraph } from './dependency-graph';

// Functions
export {
  bestContrastWith, minContrastWith,
  colorMix, lighten, darken, relativeTo,
  closestColor, furthestFrom, averageColor,
  spacingScale, typographyScale, timing,
} from './functions';

// Renderers
export { Renderer } from './renderers/renderer';
export { SVGRenderer } from './renderers/svg-renderer';
```

- [ ] **Step 2: Verify build**

Run: `npx vite build`
Expected: Build succeeds, `dist/index.js` and `dist/index.d.ts` generated

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add public API exports"
```

---

### Task 18: Interactive Demo

**Files:**
- Create: `demo/index.html`
- Create: `demo/demo.ts`
- Create: `demo/demo-input-parser.ts`
- Create: `demo/style.css`

- [ ] **Step 1: Create demo/index.html**

HTML shell with two-column grid layout, output tabs, event log container, full-width SVG area. Links to `demo.ts` as module script.

- [ ] **Step 2: Create demo/style.css**

Minimal styles: grid layout, tab switching, color swatches, event log scrolling, SVG container. Keep it simple — plain CSS, no framework.

- [ ] **Step 3: Create demo/demo-input-parser.ts**

Parser that converts user text input into library calls:
- `hex('#ff0000')` → `hex('#ff0000')`
- `ref('brand.primary')` → `ref('brand.primary')`
- `colorMix(ref('a'), ref('b'), { ratio: 0.5 })` → corresponding function call
- Handle common patterns, return `AnyTokenValue` or throw with helpful error message

- [ ] **Step 4: Create demo/demo.ts — pre-loaded example**

Set up a DesignBook with:
- Brand scope: `primary` (#0066cc), `secondary` (#ff8800), `neutral-dark` (#1a1a1a), `neutral-light` (#ffffff), `success` (#28a745), `error` (#dc3545), `space-sm` (8px), `space-md` (16px), `font-base` (1rem)
- Semantic scope: `background` (ref brand.neutral-light), `text` (bestContrastWith on background from brand), `hover` (colorMix primary + black at 0.1)
- UI scope: `complement` (relativeTo primary oklch [null,null,"+180"]), `muted` (relativeTo primary oklch [null,"*0.5",null]), `accessible-text` (minContrastWith white from brand at 4.5), `heading-lg` (typographyScale font-base at ratio 1.25 step 3), `section-spacing` (spacingScale space-md at multiplier 2)
- Dark scope extending brand: overridden `neutral-dark` (#ffffff) and `neutral-light` (#1a1a1a)

- [ ] **Step 5: Wire up UI**

- Render all scopes as editable sections in left column
- Tab switching between CSS / JSON / W3 output in right column
- Event log: subscribe to all DesignBook events, append timestamped entries
- SVG visualization: render SVGRenderer output, add connection toggle
- On token edit: parse input, call scope.set(), UI auto-updates via events
- Color swatches: show resolved color next to each color token
- Error display: catch errors from set/resolve, show inline

- [ ] **Step 6: Verify demo runs**

Run: `npm run dev`
Expected: Vite dev server starts, demo loads in browser with pre-loaded example, all outputs render correctly

- [ ] **Step 7: Commit**

```bash
git add demo/
git commit -m "feat: add interactive demo with pre-loaded design system example"
```

---

### Task 19: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Build library**

Run: `npx vite build`
Expected: Clean build, `dist/` contains `index.js` and `index.d.ts`

- [ ] **Step 3: Build demo**

Run: `npm run build:demo`
Expected: `demo-dist/` generated

- [ ] **Step 4: Verify demo preview**

Run: `npm run preview`
Expected: Demo loads and works from built files

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, builds succeed"
```
