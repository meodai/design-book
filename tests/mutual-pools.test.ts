import { describe, it, expect } from 'vitest';
import { DesignBook, color, ref, lightest, darkest, bestContrastWith, minContrastWith, TokenError } from '../src/index';
import { REENTRY_BUDGET } from '../src/resolve-cache';

// Two scopes whose selectors read each other's scope. A few work, and give
// the answer one would expect; with more, each is worked out again inside
// every other one and the work multiplies — reading such a key is given up
// with an error instead of freezing.

/** A gray ramp and a card: the card's text is picked from the ramp, and
 *  the ramp has steps picked from the card. */
function rampAndCard(extra: number, not = false) {
  const book = new DesignBook('mutual');
  const gray = book.addScope('gray');
  ['#f4f4f4', '#c4c4c4', '#7a7a7a', '#3d3d3d', '#161616'].forEach((c, i) => gray.set(`s${100 + i * 200}`, color(c)));
  const card = book.addScope('card');
  card.set('bg', color('#ffffff'));
  const cardRules = ['text', 'muted', ...Array.from({ length: extra }, (_, i) => `more${i}`)].map((k) => `card.${k}`);
  const grayRules = ['ink', ...Array.from({ length: extra }, (_, i) => `more${i}`)].map((k) => `gray.${k}`);
  const notCard = not ? { not: cardRules } : {};
  const notGray = not ? { not: grayRules } : {};
  gray.set('ink', darkest(ref('card'), notCard));
  for (let i = 0; i < extra; i++) gray.set(`more${i}`, lightest(ref('card'), notCard));
  card.set('text', bestContrastWith(ref('.bg'), ref('gray'), notGray));
  card.set('muted', minContrastWith(ref('.bg'), ref('gray'), { minContrast: 4.5, ...notGray }));
  for (let i = 0; i < extra; i++) card.set(`more${i}`, minContrastWith(ref('.bg'), ref('gray'), { minContrast: 3 + i, ...notGray }));
  return { book, gray, card, rules: [...cardRules, ...grayRules] };
}

describe('scopes that select from each other', () => {
  it('a few work: the ramp\'s ink is the card\'s text, the text the ramp\'s darkest step', () => {
    const { book } = rampAndCard(0);
    expect(book.resolve('card.text')).toBe('#161616');
    expect(book.pickOf('card.text')).toBe('gray.s900');
    expect(book.resolve('card.muted')).toBe('#3d3d3d');
    expect(book.resolve('gray.ink')).toBe('#161616');
    expect(book.pickOf('gray.ink')).toBe('card.text');
  });

  it('too many are given up with an error that names the scopes and the way out', () => {
    const { book, rules } = rampAndCard(6);
    const started = performance.now();
    for (const key of rules) {
      expect(() => book.resolve(key), key).toThrow(TokenError);
      expect(() => book.resolve(key), key).toThrow(/selectors in "card", "gray" read each other's scopes.*`not`/s);
    }
    expect(performance.now() - started).toBeLessThan(5000);
    // What does not depend on them still reads.
    expect(book.resolve('gray.s100')).toBe('#f4f4f4');
    expect(book.resolve('card.bg')).toBe('#ffffff');
  });

  it('keeps nothing from a read it gave up', () => {
    // Members are skipped while a given-up read unwinds; a value worked out
    // around that must not be kept and handed out later.
    const { book, rules } = rampAndCard(6);
    expect(() => book.resolve('card.text')).toThrow(/read each other/);
    for (const key of rules) expect(() => book.resolve(key), key).toThrow(/read each other/);
    const css = book.render('css-variables');
    for (const key of rules) expect(css).toContain(`/* --${key.replace('.', '-')}: `);
    expect(css).toContain('--gray-s100: #f4f4f4;');
  });

  it('renders such a book without freezing, reporting each key in place', () => {
    const { book } = rampAndCard(8);
    const started = performance.now();
    const css = book.render('css-variables');
    expect(performance.now() - started).toBeLessThan(5000);
    expect(css).toMatch(/\/\* --card-text: card\.text: selectors in/);
  });

  it('reads again once the book changes, and with `not` it is quick and exact', () => {
    const { book, gray } = rampAndCard(6);
    expect(() => book.resolve('card.text')).toThrow(/read each other/);
    // Take the ramp's rules away: the card reads a plain ramp again.
    for (const key of gray.ownKeys().filter((k) => !k.startsWith('s'))) gray.delete(key);
    expect(book.resolve('card.text')).toBe('#161616');

    const broken = rampAndCard(6, true);
    for (const key of broken.rules) expect(() => broken.book.resolve(key), key).not.toThrow();
    expect(broken.book.resolve('card.text')).toBe('#161616');
    expect(broken.book.resolve('gray.ink')).toBe('#ffffff');   // the card's rules are left out: its background is all that is left
  });

  it('counts per read: many small mutual pairs in one book are fine', () => {
    const book = new DesignBook('pairs');
    for (let i = 0; i < 40; i++) {
      const a = book.addScope(`a${i}`);
      const b = book.addScope(`b${i}`);
      a.set('base', color('#ffffff'));
      b.set('base', color('#111111'));
      a.set('pick', bestContrastWith(ref(`b${i}.base`), ref(`b${i}`)));
      b.set('pick', bestContrastWith(ref(`a${i}.base`), ref(`a${i}`)));
    }
    expect(() => book.render('css-variables')).not.toThrow();
    expect(book.render('css-variables')).not.toContain('/*');
    expect(REENTRY_BUDGET).toBeGreaterThan(100);
  });
});

describe('css: a pick is written by variable only when that is its value', () => {
  /** `a.A` picks `b.B` at the value `b.B` has inside it (#888888); by
   *  itself `b.B` picks `a.A` and is #cccccc. */
  function contradiction() {
    const book = new DesignBook('x');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('g', color('#888888'));
    b.set('m', color('#cccccc'));
    a.set('A', darkest(ref('b')));
    b.set('B', lightest(ref('a')));
    return book;
  }

  it('writes values where the variables would lead back to each other', () => {
    const book = contradiction();
    expect(book.pickOf('a.A')).toBe('b.B');
    expect(book.pickOf('b.B')).toBe('a.A');
    const css = book.render('css-variables');
    expect(css).toContain('--a-a: #888888;');
    expect(css).toContain('--b-b: #cccccc;');
    expect(css).not.toMatch(/--a-a: var\(--b-b\)/);
  });

  it('agrees with the resolved values, key by key', () => {
    const book = contradiction();
    const json = JSON.parse(book.render('json')) as Record<string, string>;
    const css = book.render('css-variables');
    // Follow each variable to a value, the way a browser would.
    const declared = new Map([...css.matchAll(/(--[\w-]+): ([^;]+);/g)].map((m) => [m[1], m[2]]));
    const follow = (prop: string, seen = new Set<string>()): string => {
      const value = declared.get(prop)!;
      const next = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
      if (!next) return value;
      if (seen.has(next)) return 'LOOP';
      return follow(next, seen.add(prop));
    };
    for (const [key, value] of Object.entries(json)) {
      expect(follow(`--${key.replace('.', '-').toLowerCase()}`), key).toBe(value);
    }
  });

  it('still writes the variable in the ordinary case, and in small mutual ones', () => {
    const { book } = rampAndCard(0);
    const css = book.render('css-variables');
    expect(css).toContain('--card-text: var(--gray-s900);');
    expect(css).toContain('--gray-ink: var(--card-text);');
    expect(css).toContain('--card-muted: var(--gray-s700);');
  });
});
