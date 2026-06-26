import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { minContrastWith } from '../src/functions/color/min-contrast';

describe('scope-iterating functions resolve safely inside their own scope', () => {
  it('bestContrastWith excludes its own entry without re-entrant recursion', () => {
    const book = new DesignBook('test');

    // Count how many times the implementation actually runs for one resolve.
    let calls = 0;
    const orig = book.getFunction('bestContrastWith')!;
    book.registerFunction('bestContrastWith', (...args: unknown[]) => {
      calls++;
      return (orig as (...a: unknown[]) => string)(...args);
    });

    const surface = book.addScope('surface');
    surface.set('bg', color('#ffffff'));
    surface.set('a', color('#222222')); // best contrast vs white
    surface.set('b', color('#cccccc'));
    // `text` lives in the same scope it iterates over.
    surface.set('text', bestContrastWith(ref('surface.bg'), surface));

    expect(book.resolve('surface.text')).toBe('#222222');
    // The self-entry must be skipped, not recursed into.
    expect(calls).toBe(1);
  });

  it('minContrastWith resolves in its own scope without runaway recursion', () => {
    const book = new DesignBook('test');

    let calls = 0;
    const orig = book.getFunction('minContrastWith')!;
    book.registerFunction('minContrastWith', (...args: unknown[]) => {
      calls++;
      return (orig as (...a: unknown[]) => string)(...args);
    });

    const surface = book.addScope('surface');
    surface.set('bg', color('#ffffff'));
    surface.set('a', color('#777777'));
    surface.set('b', color('#111111'));
    surface.set('text', minContrastWith(ref('surface.bg'), surface, { ratio: 4.5 }));

    expect(() => book.resolve('surface.text')).not.toThrow();
    expect(calls).toBe(1);
  });
});
