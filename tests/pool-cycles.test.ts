import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { furthestFrom } from '../src/functions/color/furthest-from';
import { CircularDependencyError } from '../src/errors';

/** Regression for the Figma-plugin freeze: two function tokens that appear
 *  in EACH OTHER'S candidate pools. Before the re-entrancy guard, resolve()
 *  recursed A → pool → B → pool → A forever and froze the host. Both must
 *  resolve, each simply skipping the other as an in-flight candidate. */
describe('mutual pool references between function tokens', () => {
  it('two selectors over the same scope resolve by skipping each other', () => {
    const book = new DesignBook('test');
    const s = book.addScope('semantic');
    s.set('white', color('#ffffff'));
    s.set('black', color('#000000'));
    s.set('red', color('#e03e1a'));
    // bg picks the color furthest from the rest of the pool …
    s.set('bg', furthestFrom(s));
    // … while text picks the best contrast against bg, from the same pool.
    s.set('text', bestContrastWith(ref('semantic.bg'), s));

    expect(() => book.resolve('semantic.bg')).not.toThrow();
    expect(() => book.resolve('semantic.text')).not.toThrow();

    const bg = book.resolve('semantic.bg');
    const text = book.resolve('semantic.text');
    expect(bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(text).toMatch(/^#[0-9a-f]{6}$/);
    expect(text).not.toBe(bg);
  });

  it('selectors in each other’s pools across two scopes resolve too', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('base', color('#ffffff'));
    b.set('base', color('#111111'));
    a.set('pick', bestContrastWith(ref('b.base'), b)); // iterates scope b
    b.set('pick', bestContrastWith(ref('a.base'), a)); // iterates scope a

    expect(() => book.resolve('a.pick')).not.toThrow();
    expect(() => book.resolve('b.pick')).not.toThrow();
  });
});

describe('direct reference cycles', () => {
  it('rejects the set() that would close a cycle and rolls the token back', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('a', ref('s.b')); // dangling forward ref is allowed
    expect(() => s.set('b', ref('s.a'))).toThrow(CircularDependencyError);
    // the rejected token must not linger in the scope
    expect(s.has('b')).toBe(false);
  });

  it('rolls back to the previous value when overwriting would close a cycle', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('a', ref('s.b'));
    s.set('b', color('#123456'));
    expect(book.resolve('s.a')).toBe('#123456');
    expect(() => s.set('b', ref('s.a'))).toThrow(CircularDependencyError);
    // previous value survives the rejected overwrite
    expect(book.resolve('s.b')).toBe('#123456');
    expect(book.resolve('s.a')).toBe('#123456');
  });
});
