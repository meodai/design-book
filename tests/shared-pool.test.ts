import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, px, ref, iteratedScopesOf } from '../src/tokens';
import type { FunctionTokenValue } from '../src/tokens';
import {
  bestContrastWith, minContrastWith, mostVivid, lightest, closest, furthestFrom, lighten, nth, largest, typography,
} from '../src/functions';

// A scope's pool of candidates is built once per state of the book and
// shared by every selector over it. Sharing must change no result: each
// book here is read with sharing on and with it off (every pool rebuilt),
// in several orders, before and after writes.

type Setup = (book: DesignBook) => void;

const scenarios: Record<string, Setup> = {
  'many selectors over one palette': (book) => {
    const pal = book.addScope('pal');
    ['#ffffff', '#f6ecd0', '#ffd400', '#d62828', '#2a9d8f', '#1d4eb8', '#767676', '#172c4f', '#000000']
      .forEach((c, i) => pal.set('c' + i, color(c)));
    const ui = book.addScope('ui');
    ui.set('bg', color('#fbf7ee'));
    ui.set('text', bestContrastWith(ref('.bg'), ref('pal')));
    ui.set('line', minContrastWith(ref('.bg'), ref('pal'), { minContrast: 3 }));
    ui.set('accent', mostVivid(ref('pal'), { readableOn: ref('.bg'), readableContrast: 3 }));
    ui.set('accent2', mostVivid(ref('pal'), { not: [ref('pal.c3')] }));
    ui.set('near', closest(color('#20a090'), ref('pal'), { not: [ref('pal.c4')] }));
    ui.set('far', furthestFrom(ref('.text'), ref('pal')));
    ui.set('second', nth(ref('pal'), 1));
    ui.set('light', lightest(ref('pal'), { not: [ref('pal.c0')] }));
  },
  'a member derived from a selector over its own scope': (book) => {
    const ui = book.addScope('ui');
    ui.set('white', color('#ffffff'));
    ui.set('ink', color('#172c4f'));
    ui.set('bg', color('#fbf7ee'));
    ui.set('text', bestContrastWith(ref('.bg'), ref('ui')));
    ui.set('muted', lighten(ref('.text'), { amount: 0.4 }));
    const other = book.addScope('other');
    other.set('pick', bestContrastWith(color('#000000'), ref('ui')));
    other.set('vivid', mostVivid(ref('ui')));
    other.set('last', nth(ref('ui'), -1));
  },
  'a palette member derived from a selector over the palette': (book) => {
    const pal = book.addScope('pal');
    pal.set('a', color('#ffffff'));
    pal.set('b', color('#172c4f'));
    pal.set('c', color('#d62828'));
    const ui = book.addScope('ui');
    ui.set('bg', color('#fbf7ee'));
    ui.set('text', bestContrastWith(ref('.bg'), ref('pal')));
    pal.set('tint', lighten(ref('ui.text'), { amount: 0.5 }));
    ui.set('vivid', mostVivid(ref('pal')));
    ui.set('light', lightest(ref('pal')));
    ui.set('near', closest(color('#8a94a8'), ref('pal')));
  },
  'selectors in each other\'s pools': (book) => {
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('base', color('#ffffff'));
    a.set('alt', color('#d62828'));
    b.set('base', color('#111111'));
    b.set('alt', color('#2a9d8f'));
    a.set('pick', bestContrastWith(ref('b.base'), ref('b')));
    b.set('pick', bestContrastWith(ref('a.base'), ref('a')));
    a.set('vivid', mostVivid(ref('b')));
    b.set('vivid', mostVivid(ref('a')));
  },
  'a sorted scope, sizes and text styles': (book) => {
    const pal = book.addScope('pal', { order: [{ by: 'value' }] } as never);
    ['#767676', '#ffffff', '#172c4f', '#d62828', '#000000'].forEach((c, i) => pal.set('c' + i, color(c)));
    const space = book.addScope('space');
    [4, 8, 12, 16, 24, 40].forEach((n) => space.set('s' + n, px(n)));
    const type = book.addScope('type');
    type.set('body', typography({ fontSize: px(16), fontWeight: 400, color: ref('pal.c2') }));
    type.set('lead', typography({ fontSize: px(20), fontWeight: 400, color: ref('pal.c3') }));
    type.set('title', typography({ fontSize: px(32), fontWeight: 700, color: ref('pal.c4') }));
    const ui = book.addScope('ui');
    ui.set('first', nth(ref('pal'), 0));
    ui.set('last', nth(ref('pal'), -1));
    ui.set('gap', largest(ref('space'), { not: [ref('space.s40')] }));
    ui.set('heading', minContrastWith(ref('type.body'), ref('type'), { minContrast: 1.25, direction: 'larger' }));
    ui.set('ink', lightest(ref('type'), { by: 'color' }));
    ui.set('ink2', mostVivid(ref('type'), { by: 'color' }));
  },
};

/** Every key's value (or error) and pick, read in the order given. */
function read(book: DesignBook, order: (keys: string[]) => string[]): Record<string, string> {
  const keys = order(book.getAllScopes().flatMap((s) => s.getAllKeys().map((k) => `${s.name}.${k}`)));
  const out: Record<string, string> = {};
  for (const key of keys) {
    let value: string;
    try {
      value = book.resolve(key);
    } catch (e) {
      value = `! ${(e as Error).message}`;
    }
    out[key] = `${value} <- ${book.pickOf(key) ?? '-'}`;
  }
  return out;
}

/** The same book with nothing shared: every pool is built again. */
function unshared(book: DesignBook): DesignBook {
  (book._cache as unknown as { memo: unknown }).memo = (_owner: object, _name: string, build: () => unknown) => build();
  return book;
}

const orders: Record<string, (keys: string[]) => string[]> = {
  forward: (keys) => keys,
  backward: (keys) => [...keys].reverse(),
  'selectors first': (keys) => [...keys].sort((a, b) => Number(a.split('.')[0] !== 'ui') - Number(b.split('.')[0] !== 'ui')),
  'every other, then the rest': (keys) => [...keys.filter((_, i) => i % 2 === 0), ...keys.filter((_, i) => i % 2 === 1)],
};

describe('a shared pool changes no result', () => {
  for (const [name, setup] of Object.entries(scenarios)) {
    for (const [orderName, order] of Object.entries(orders)) {
      it(`${name}: read ${orderName}`, () => {
        const shared = new DesignBook('shared');
        const plain = unshared(new DesignBook('plain'));
        setup(shared);
        setup(plain);
        expect(read(shared, order)).toEqual(read(plain, order));
        // Read again from the caches, then after writes that move picks.
        expect(read(shared, order)).toEqual(read(plain, order));
        for (const book of [shared, plain]) {
          const first = book.getAllScopes()[0];
          first.set(first.getAllKeys()[0], color('#0b0b0b'));
          first.set('added', color('#ff00aa'));
        }
        expect(read(shared, order)).toEqual(read(plain, order));
        for (const book of [shared, plain]) book.getAllScopes()[0].delete('added');
        expect(read(shared, order)).toEqual(read(plain, order));
      });
    }
  }

  it('builds a pool once for many selectors, and again after a change', () => {
    const book = new DesignBook('count');
    const pal = book.addScope('pal');
    ['#ffffff', '#172c4f', '#d62828'].forEach((c, i) => pal.set('c' + i, color(c)));
    const ui = book.addScope('ui');
    ui.set('bg', color('#fbf7ee'));
    for (let i = 0; i < 20; i++) ui.set('t' + i, bestContrastWith(ref('.bg'), ref('pal')));
    // Count how often the palette's pool is actually built.
    let builds = 0;
    const cache = book._cache as unknown as { memo: (owner: object, name: string, build: () => unknown) => unknown };
    const memo = cache.memo.bind(book._cache);
    cache.memo = (owner, name, build) => memo(owner, name, () => { if (owner === pal && name === 'pool') builds++; return build(); });
    for (let i = 0; i < 20; i++) book.resolve('ui.t' + i);
    expect(builds).toBe(1);                      // twenty selectors, one pool
    pal.set('c3', color('#2a9d8f'));
    for (let i = 0; i < 20; i++) book.resolve('ui.t' + i);
    expect(builds).toBe(2);                      // built again for the new state
  });
});

// Generated books: random scopes (some extending others), colors, plain
// references, transforms of anything and selectors over anything — so
// members derived from selectors over their own pool, and selectors in each
// other's pools, turn up by themselves. Read in a random order, written to,
// read again; every value, pick and the rendered CSS must match the same
// book with nothing shared.
describe('a shared pool changes no result: generated books', () => {
  /** mulberry32: a small seeded generator, so a failing seed can be replayed. */
  const random = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  type Step = (book: DesignBook) => void;

  /** A list of writes; one the book refuses (a cycle) is refused in both. */
  function program(seed: number): { build: Step[]; edits: Step[]; shuffle: (keys: string[]) => string[] } {
    const rnd = random(seed);
    const int = (n: number) => Math.floor(rnd() * n);
    const of = <T,>(list: T[]): T => list[int(list.length)];
    const hex = () => `#${[0, 0, 0].map(() => int(256).toString(16).padStart(2, '0')).join('')}`;
    const scopes = Array.from({ length: 2 + int(3) }, (_, i) => `s${i}`);
    const keys: string[] = [];
    const build: Step[] = [];
    const attempt = (fn: Step): Step => (book) => { try { fn(book); } catch { /* refused: the same in both books */ } };

    scopes.forEach((name, i) => {
      const parent = i > 0 && rnd() < 0.3 ? scopes[int(i)] : undefined;
      build.push((book) => { book.addScope(name, parent ? { extends: parent } : undefined); });
      for (let k = 0; k < 3 + int(5); k++) {
        const key = `${name}.c${k}`;
        const value = hex();
        keys.push(key);
        build.push((book) => book.getScope(name)!.set(`c${k}`, color(value)));
      }
    });

    const token = (home: string) => {
      const target = of(keys);
      // Mostly its own scope or a plain palette; sometimes any scope.
      const pool = rnd() < 0.6 ? home : of(scopes);
      const selects = int(9);
      const not = rnd() < 0.3 ? [ref(of(keys.filter((k) => k.startsWith(`${pool}.`))) ?? target)] : [];
      const readable = rnd() < 0.3 ? { readableOn: ref(of(keys)), readableContrast: 1 + rnd() * 3 } : {};
      const kind = selects;
      if (kind === 0) return ref(target);
      if (kind === 1) return lighten(ref(target), { amount: 0.1 + rnd() * 0.5 });
      if (kind === 2) return bestContrastWith(ref(target), ref(pool), { not, ...readable });
      if (kind === 3) return minContrastWith(ref(target), ref(pool), { minContrast: 1 + rnd() * 6, not });
      if (kind === 4) return mostVivid(ref(pool), { not, ...readable });
      if (kind === 5) return lightest(ref(pool), { not, ...readable });
      if (kind === 6) return closest(ref(target), ref(pool), { not });
      if (kind === 7) return furthestFrom(ref(target), ref(pool), { not });
      return nth(ref(pool), int(4) - 2, { not });
    };
    const write = (i: number): Step => {
      const scope = of(scopes);
      const name = `d${i}`;
      const value = token(scope);
      keys.push(`${scope}.${name}`);
      return attempt((book) => book.getScope(scope)!.set(name, value));
    };
    for (let i = 0; i < 6 + int(10); i++) build.push(write(i));

    const edits: Step[] = [];
    for (let i = 0; i < 4 + int(4); i++) {
      const key = of(keys);
      const [scope, name] = key.split('.');
      const kind = int(4);
      if (kind === 0) { const value = hex(); edits.push(attempt((book) => book.getScope(scope)!.set(name, color(value)))); }
      else if (kind === 1) edits.push(attempt((book) => { book.getScope(scope)!.delete(name); }));
      else if (kind === 2) { const value = token(scope); edits.push(attempt((book) => book.getScope(scope)!.set(name, value))); }
      else edits.push(write(100 + i));
    }

    const shuffle = (list: string[]) => {
      const r = random(seed ^ 0x9e3779b9);
      return list.map((k) => [r(), k] as const).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
    };
    return { build, edits, shuffle };
  }

  const css = (book: DesignBook) => { try { return book.render('css-variables'); } catch (e) { return `! ${(e as Error).message}`; } };

  /** How many keys, inherited ones included, select from another scope.
   *  Such selectors can sit in each other's pools, where each is read
   *  without a cache and the work multiplies with every one of them: a
   *  book with many is left out so the suite stays quick (the cases above
   *  cover pools that refer to each other). */
  const selectingAcross = (book: DesignBook) => book.getAllScopes().reduce((n, scope) => n + scope.getAllKeys().filter((key) => {
    const token = scope.get(key);
    return token?.type === 'function' && iteratedScopesOf(token as FunctionTokenValue).some((name) => name !== scope.name);
  }).length, 0);
  const QUICK = 2;

  it('hundreds of books, each read, edited and read again', () => {
    let tested = 0;
    for (let seed = 1; seed <= 600; seed++) {
      const { build, edits, shuffle } = program(seed);
      const shared = new DesignBook('shared');
      const plain = unshared(new DesignBook('plain'));
      for (const step of build) { step(shared); step(plain); }
      if (selectingAcross(shared) > QUICK) continue;
      tested++;
      expect(read(shared, shuffle), `seed ${seed}, built`).toEqual(read(plain, shuffle));
      expect(css(shared), `seed ${seed}, css`).toBe(css(plain));
      for (const [i, step] of edits.entries()) {
        step(shared);
        step(plain);
        if (selectingAcross(shared) > QUICK) break;
        // Sometimes read between edits, sometimes let several pile up.
        if (i % 2 === seed % 2) expect(read(shared, shuffle), `seed ${seed}, edit ${i}`).toEqual(read(plain, shuffle));
      }
      if (selectingAcross(shared) > QUICK) continue;
      expect(read(shared, (k) => k), `seed ${seed}, edited`).toEqual(read(plain, (k) => k));
      expect(css(shared), `seed ${seed}, css after edits`).toBe(css(plain));
    }
    expect(tested).toBeGreaterThan(300);
  }, 60_000);

  it('the same in batch mode, flushed at the end', () => {
    let tested = 0;
    for (let seed = 601; seed <= 800; seed++) {
      const { build, edits, shuffle } = program(seed);
      const shared = new DesignBook('shared', { mode: 'batch' });
      const plain = unshared(new DesignBook('plain', { mode: 'batch' }));
      for (const step of [...build, ...edits]) { step(shared); step(plain); }
      shared.flush();
      plain.flush();
      if (selectingAcross(shared) > QUICK) continue;
      tested++;
      expect(read(shared, shuffle), `seed ${seed}`).toEqual(read(plain, shuffle));
      expect(css(shared), `seed ${seed}, css`).toBe(css(plain));
    }
    expect(tested).toBeGreaterThan(80);
  }, 60_000);
});
